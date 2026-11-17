// Infantry rendering (phase 6A): a procedural winter soldier made of 13 rigid parts, posed on the CPU every frame
// (procedural walk/run cycles, aim poses, a fall when killed) with two-bone IK for arms and legs, then culled and packed
// for one instanced draw. Input: G.inf.d, 8 floats per soldier [x, y, z, yaw, pose, phase, aim, state].
// Nothing here allocates after initSoldiers().
import { MB, MAT, VS } from './mesh.js';
import { trs, mul } from './math.js';

export const PARTS = 13, IST = PARTS * 16 + 4; // floats per instance: 13 part matrices + (heat, 0, 0, 0)
// parts: 0 pelvis, 1 torso, 2 head, 3/4 upper arm L/R, 5/6 forearm+hand L/R, 7/8 thigh L/R, 9/10 shin+boot L/R, 11 rifle, 12 RPG-7
// Walk and run cycles in cycles per second at their matching ground speed: advance `phase` by dt * speed / WALK_V (or RUN_V)
// seconds-equivalent and the planted foot does not slide.
export const WALK_HZ = 0.92, WALK_V = 1.45, RUN_HZ = 1.38, RUN_V = 3.9;
const LOD_FAR = 120, MAX_D = 650;

// bind skeleton (metres): pelvis origin = hip-joint centre; joints relative to their parent part
const HIPX = 0.095, WAIST = 0.10, NECK = 0.47, SHX = 0.195, SHY = 0.395, UA = 0.29, FA = 0.31, TH = 0.42, SH = 0.42, ANK = 0.085;

const WHITE = [0.76, 0.78, 0.80], WHITE2 = [0.70, 0.72, 0.74], VEST = [0.56, 0.58, 0.59], HELM = [0.84, 0.85, 0.86], BOOT = [0.055, 0.05, 0.045];
const GLOVE = [0.30, 0.30, 0.29], SKIN = [0.60, 0.43, 0.34], EYE = [0.07, 0.05, 0.04], GUN = [0.035, 0.035, 0.038], FURN = [0.045, 0.04, 0.036], MAG = [0.17, 0.075, 0.045];
const TUBE = [0.085, 0.095, 0.065], WOOD = [0.27, 0.15, 0.07], WARH = [0.20, 0.22, 0.13];

// loft along local Y: rings [y, rx, rz, ox, oz, col?, mat?]; smooth normals; caps 1 = close bottom, 2 = top, 3 = both
function loft(b, R, seg, caps = 3) {
  const n = R.length, base = b.v.length / VS, c0 = b.c, m0 = b.mat;
  for (let j = 0; j < n; j++) {
    const r = R[j], p = R[Math.max(0, j - 1)], q = R[Math.min(n - 1, j + 1)], dy = q[0] - p[0] || 1e-6;
    b.c = r[5] || c0; b.mat = r[6] === undefined ? m0 : r[6];
    for (let i = 0; i <= seg; i++) {
      const a = (i % seg) / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      let ex = c * r[2], ez = s * r[1]; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el; // ellipse normal
      const rp = (p[3] || 0) * ex + (p[4] || 0) * ez + Math.hypot(p[1] * c, p[2] * s), rq = (q[3] || 0) * ex + (q[4] || 0) * ez + Math.hypot(q[1] * c, q[2] * s);
      const ny = -(rq - rp) / dy, nl = Math.hypot(1, ny);
      b.vert((r[3] || 0) + r[1] * c, r[0], (r[4] || 0) + r[2] * s, ex / nl, ny / nl, ez / nl, i / seg, r[0]);
    }
  }
  const up = R[n - 1][0] > R[0][0]; // rings running downwards (limbs) flip the winding
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, d = a + seg + 1; if (up) b.i.push(a, d, d + 1, a, d + 1, a + 1); else b.i.push(a, d + 1, d, a, a + 1, d + 1); }
  for (let e = 0; e < 2; e++) {
    if (!(caps & (e + 1))) continue;
    const r = R[e ? n - 1 : 0], sg = (e ? 1 : -1) * (up ? 1 : -1); b.c = r[5] || c0; b.mat = r[6] === undefined ? m0 : r[6];
    const ctr = b.vert(r[3] || 0, r[0], r[4] || 0, 0, sg, 0, 0.5, r[0]), k0 = b.v.length / VS;
    for (let i = 0; i <= seg; i++) { const a = (i % seg) / seg * Math.PI * 2; b.vert((r[3] || 0) + r[1] * Math.cos(a), r[0], (r[4] || 0) + r[2] * Math.sin(a), 0, sg, 0, 0, r[0]); }
    for (let i = 0; i < seg; i++) { if (sg > 0) b.i.push(ctr, k0 + i + 1, k0 + i); else b.i.push(ctr, k0 + i, k0 + i + 1); }
  }
  b.c = c0; b.mat = m0;
}
// convex hexahedron from 8 corners named like MB.box: a b c d bottom (x0z0 x1z0 x1z1 x0z1), e f g h top
function hexa(b, P) {
  const [a, bb, c, d, e, f, g, h] = P;
  b.quad(e, h, g, f); b.quad(a, bb, c, d); b.quad(d, c, g, h); b.quad(bb, a, e, f); b.quad(a, d, h, e); b.quad(c, bb, f, g);
}

// lo = 1: distant LOD (same parts and matrices, ~200 triangles)
export function buildSoldier(lo = 0) {
  const b = new MB(), S = lo ? 4 : 9, SL = lo ? 4 : 6, CL = MAT.cloth, GR = MAT.gear;
  b.at(0, 0, 0);
  // 0 pelvis
  b.part = 0; b.set(WHITE, CL);
  if (lo) loft(b, [[-0.13, 0.08, 0.07], [0.0, 0.17, 0.12], [0.17, 0.15, 0.105]], 4, 1);
  else { loft(b, [[-0.15, 0.06, 0.05], [-0.11, 0.125, 0.095], [-0.04, 0.165, 0.115], [0.04, 0.17, 0.12], [0.12, 0.16, 0.112], [0.18, 0.15, 0.105]], S, 1);
    b.set(VEST, GR); loft(b, [[0.06, 0.171, 0.121], [0.11, 0.166, 0.117]], S, 0); }
  // 1 torso (waist pivot), vest, pouches, pack, collar
  b.part = 1; b.set(WHITE, CL);
  if (lo) loft(b, [[-0.1, 0.15, 0.105], [0.14, 0.175, 0.128, 0, -0.01, VEST, GR], [0.38, 0.19, 0.125, 0, 0, VEST, GR], [0.52, 0.07, 0.065]], 4, 2);
  else {
    loft(b, [[-0.10, 0.15, 0.105], [0.0, 0.155, 0.11, 0, -0.005], [0.12, 0.168, 0.118, 0, -0.012], [0.24, 0.185, 0.125, 0, -0.012], [0.34, 0.195, 0.122, 0, -0.005], [0.41, 0.185, 0.112, 0, 0.005], [0.46, 0.13, 0.09, 0, 0.01], [0.50, 0.07, 0.065, 0, 0.01], [0.55, 0.058, 0.058, 0, 0.005]], S, 0);
    b.set(VEST, GR); loft(b, [[0.01, 0.163, 0.122, 0, -0.008], [0.14, 0.18, 0.133, 0, -0.016], [0.26, 0.197, 0.139, 0, -0.016], [0.355, 0.203, 0.131, 0, -0.008]], S, 0);
    for (let k = -1; k <= 1; k++) b.box(k * 0.085 - 0.036, 0.085, -0.19, k * 0.085 + 0.036, 0.235, -0.135, 0.004, 0.012, 0); // magazine pouches
    b.set(WHITE2, CL); b.box(-0.125, 0.05, 0.11, 0.125, 0.33, 0.235, 0.012, 0.03, 0.01); // small pack
    b.set(VEST, GR); for (const x of [-0.1, 0.1]) b.box(x - 0.018, 0.3, -0.05, x + 0.018, 0.43, 0.13, 0, 0); // shoulder straps
    b.set(WHITE, CL); loft(b, [[0.42, 0.13, 0.1, 0, 0.012], [0.465, 0.115, 0.098, 0, 0.018], [0.52, 0.08, 0.078, 0, 0.022]], S, 0); // hood rolled at the collar
  }
  // 2 head (neck pivot): neck gaiter, face, helmet with white cover
  b.part = 2;
  if (lo) loft(b, [[-0.03, 0.05, 0.05, 0, 0, WHITE, CL], [0.08, 0.075, 0.09, 0, -0.01, SKIN, MAT.skin], [0.17, 0.103, 0.12, 0, 0, HELM, CL], [0.3, 0.04, 0.05, 0, 0, HELM, CL]], 4, 2);
  else {
    b.set(SKIN, MAT.skin);
    loft(b, [[0.04, 0.055, 0.065, 0, -0.005], [0.085, 0.073, 0.089, 0, -0.012], [0.13, 0.081, 0.098, 0, -0.012], [0.18, 0.083, 0.1, 0, -0.006], [0.23, 0.068, 0.082, 0, 0.002], [0.26, 0.035, 0.045, 0, 0.005]], S, 2);
    b.box(-0.011, 0.112, -0.122, 0.011, 0.152, -0.1, 0.004, 0.012, 0); // nose
    b.set(EYE, MAT.skin); for (const x of [-0.035, 0.035]) b.box(x - 0.014, 0.146, -0.109, x + 0.014, 0.158, -0.098, 0, 0); // eyes
    b.set(WHITE, CL); loft(b, [[-0.04, 0.052, 0.054, 0, 0.005], [0.03, 0.06, 0.066, 0, 0.0], [0.085, 0.077, 0.092, 0, -0.011], [0.105, 0.075, 0.088, 0, -0.008]], S, 1); // gaiter up to the mouth
    b.at(0, 0.172, 0.006, 0, 0.17, 0); b.set(HELM, CL);
    loft(b, [[-0.012, 0.099, 0.116], [0.0, 0.106, 0.123], [0.045, 0.104, 0.12], [0.09, 0.088, 0.102], [0.12, 0.058, 0.068], [0.136, 0.02, 0.024]], S, 2);
    b.at(0, 0, 0);
  }
  // 3/4 upper arms, 5/6 forearms with gloves
  for (let s = 0; s < 2; s++) {
    b.part = 3 + s; b.set(WHITE, CL);
    if (lo) loft(b, [[0.06, 0.03, 0.03], [0.0, 0.066, 0.068], [-0.31, 0.05, 0.052]], SL, 0);
    else loft(b, [[0.062, 0.038, 0.04], [0.0, 0.072, 0.075], [-0.1, 0.069, 0.072], [-0.22, 0.061, 0.063], [-0.3, 0.054, 0.056], [-0.338, 0.028, 0.03]], SL, 3);
    b.part = 5 + s;
    if (lo) loft(b, [[0.03, 0.04, 0.04], [-0.24, 0.04, 0.041, 0, 0, GLOVE, GR], [-0.36, 0.022, 0.04, 0, 0, GLOVE, GR]], SL, 0);
    else { loft(b, [[0.046, 0.03, 0.031], [0.0, 0.056, 0.058], [-0.1, 0.054, 0.056], [-0.24, 0.045, 0.046], [-0.255, 0.032, 0.033]], SL, 3);
      b.set(GLOVE, GR); loft(b, [[-0.232, 0.034, 0.036], [-0.27, 0.031, 0.048], [-0.33, 0.027, 0.048], [-0.365, 0.014, 0.024]], SL, 3);
      b.box(s ? -0.045 : 0.012, -0.29, -0.03, s ? -0.012 : 0.045, -0.255, 0.0, 0.004, 0.004); } // thumb
  }
  // 7/8 thighs, 9/10 shins with gaiters, boots
  for (let s = 0; s < 2; s++) {
    b.part = 7 + s; b.set(WHITE, CL);
    if (lo) loft(b, [[0.07, 0.04, 0.04], [0.0, 0.095, 0.1], [-0.45, 0.06, 0.064]], SL, 0);
    else loft(b, [[0.08, 0.055, 0.057], [0.0, 0.102, 0.107], [-0.13, 0.1, 0.106], [-0.29, 0.085, 0.09], [-0.42, 0.071, 0.075], [-0.475, 0.038, 0.04]], SL, 3);
    b.part = 9 + s;
    if (lo) { loft(b, [[0.04, 0.06, 0.06], [-0.34, 0.053, 0.056, 0, 0, BOOT, GR], [-0.5, 0.055, 0.1, 0, -0.06, BOOT, GR]], SL, 2); }
    else {
      loft(b, [[0.055, 0.044, 0.046], [0.0, 0.073, 0.077], [-0.12, 0.069, 0.073], [-0.31, 0.062, 0.065], [-0.335, 0.052, 0.055]], SL, 3);
      b.set(BOOT, GR); loft(b, [[-0.3, 0.047, 0.05], [-0.4, 0.05, 0.054], [-0.445, 0.052, 0.06, 0, 0.008]], SL, 0);
      b.box(-0.05, -0.495, -0.2, 0.05, -0.425, 0.065, 0.01, 0.075, 0.018); b.set([0.03, 0.028, 0.026], GR); b.box(-0.053, -0.507, -0.205, 0.053, -0.49, 0.07, 0, 0.004);
    }
  }
  // 11 rifle (AK-74): origin on the bore axis at the rear of the receiver, muzzle towards -Z
  b.part = 11; b.set(GUN, MAT.paint);
  if (lo) { b.box(-0.022, -0.1, -0.62, 0.022, 0.03, 0.33); }
  else {
    b.box(-0.024, -0.046, -0.245, 0.024, 0.02, 0.0, 0.006, 0); // receiver
    b.set(FURN, MAT.paint); hexa(b, [[-0.02, -0.05, 0], [0.02, -0.05, 0], [0.022, -0.122, 0.33], [-0.022, -0.122, 0.33], [-0.02, 0.016, 0], [0.02, 0.016, 0], [0.022, 0.002, 0.33], [-0.022, 0.002, 0.33]]); // stock
    hexa(b, [[-0.015, -0.142, 0.002], [0.015, -0.142, 0.002], [0.015, -0.142, 0.04], [-0.015, -0.142, 0.04], [-0.015, -0.046, -0.04], [0.015, -0.046, -0.04], [0.015, -0.046, -0.005], [-0.015, -0.046, -0.005]]); // pistol grip
    b.set(GUN, MAT.paint); b.box(-0.006, -0.07, -0.1, 0.006, -0.062, -0.035); // trigger guard
    b.set(MAG, MAT.paint); hexa(b, [[-0.013, -0.13, -0.195], [0.013, -0.13, -0.195], [0.013, -0.13, -0.125], [-0.013, -0.13, -0.125], [-0.013, -0.046, -0.172], [0.013, -0.046, -0.172], [0.013, -0.046, -0.105], [-0.013, -0.046, -0.105]]);
    hexa(b, [[-0.013, -0.205, -0.245], [0.013, -0.205, -0.245], [0.013, -0.205, -0.178], [-0.013, -0.205, -0.178], [-0.013, -0.13, -0.195], [0.013, -0.13, -0.195], [0.013, -0.13, -0.125], [-0.013, -0.13, -0.125]]); // curved magazine
    b.set(FURN, MAT.paint); b.box(-0.026, -0.044, -0.43, 0.026, 0.004, -0.245, 0.004, 0); b.box(-0.019, 0.004, -0.43, 0.019, 0.038, -0.25, 0.006, 0); // handguards
    b.set(GUN, MAT.paint); b.cyl(0, 0, -0.43, 0, 0, -0.6, 0.011, 0.011, 6); b.cyl(0, 0, -0.6, 0, 0, -0.68, 0.016, 0.016, 6); // barrel, muzzle brake
    b.box(-0.012, -0.014, -0.45, 0.012, 0.046, -0.425); b.box(-0.006, 0.0, -0.585, 0.006, 0.058, -0.565); b.box(-0.015, 0.016, -0.26, 0.015, 0.042, -0.215); // gas block, front and rear sight
  }
  // 12 RPG-7: origin on the tube axis where it rests on the shoulder
  b.part = 12; b.set(TUBE, MAT.paint);
  if (lo) { b.cyl(0, 0, 0.6, 0, 0, -0.75, 0.045, 0.03, 4, 0); }
  else {
    b.cyl(0, 0, 0.47, 0, 0, -0.34, 0.023, 0.023, 8); b.cyl(0, 0, 0.47, 0, 0, 0.62, 0.025, 0.045, 8); // tube, venturi flare
    b.set(WOOD, MAT.paint); b.cyl(0, 0, 0.17, 0, 0, -0.12, 0.034, 0.034, 8); // heat shield
    b.set(GUN, MAT.paint);
    hexa(b, [[-0.013, -0.135, -0.125], [0.013, -0.135, -0.125], [0.013, -0.135, -0.09], [-0.013, -0.135, -0.09], [-0.013, -0.02, -0.15], [0.013, -0.02, -0.15], [0.013, -0.02, -0.11], [-0.013, -0.02, -0.11]]); // trigger grip
    hexa(b, [[-0.013, -0.125, -0.255], [0.013, -0.125, -0.255], [0.013, -0.125, -0.22], [-0.013, -0.125, -0.22], [-0.013, -0.02, -0.27], [0.013, -0.02, -0.27], [0.013, -0.02, -0.232], [-0.013, -0.02, -0.232]]); // front grip
    b.box(-0.062, -0.005, -0.06, -0.03, 0.045, 0.07); b.box(-0.056, 0.004, 0.07, -0.036, 0.036, 0.11); // PGO-7 sight and eyepiece
    b.set(WARH, MAT.rus); b.cyl(0, 0, -0.34, 0, 0, -0.42, 0.018, 0.018, 8); b.cyl(0, 0, -0.42, 0, 0, -0.54, 0.042, 0.042, 10); b.cyl(0, 0, -0.54, 0, 0, -0.8, 0.042, 0.008, 10); // PG-7V warhead
  }
  return b.build();
}

// ---------- pose parameters (character space: feet at the origin, facing -Z, +X right) ----------
// 0-2 pelvis pos, 3-5 pelvis yaw/pitch/roll, 6-8 torso, 9-11 head, 12-14 L ankle, 15-17 R ankle, 18-20 L knee pole, 21-23 R knee pole,
// 24-26 L hand, 27-29 R hand, 30-32 L elbow pole, 33-35 R elbow pole, 36-47 rifle (3x3 rotation, position), 48-59 RPG, 60 weapon mode
// (0 rifle as given, RPG hidden; 1 RPG out, rifle slung on the back), 61 lie (conform the body to the ground slope)
const NP = 62;
const M1 = new Float32Array(16), M2 = new Float32Array(16), M3 = new Float32Array(16), MT = new Float32Array(16), MW = new Float32Array(16);
const V = new Float32Array(3);
function tp(M, x, y, z, o, k) { o[k] = M[0] * x + M[4] * y + M[8] * z + M[12]; o[k + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; o[k + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
function set3(P, k, x, y, z) { P[k] = x; P[k + 1] = y; P[k + 2] = z; }
function putW(P, k, M) { P[k] = M[0]; P[k + 1] = M[1]; P[k + 2] = M[2]; P[k + 3] = M[4]; P[k + 4] = M[5]; P[k + 5] = M[6]; P[k + 6] = M[8]; P[k + 7] = M[9]; P[k + 8] = M[10]; P[k + 9] = M[12]; P[k + 10] = M[13]; P[k + 11] = M[14]; }
function getW(M, P, k) { // orthonormalise (blended rows) back into a rigid matrix
  let zx = P[k + 6], zy = P[k + 7], zz = P[k + 8], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let yx = P[k + 3], yy = P[k + 4], yz = P[k + 5]; const d = yx * zx + yy * zy + yz * zz; yx -= zx * d; yy -= zy * d; yz -= zz * d; l = Math.hypot(yx, yy, yz) || 1; yx /= l; yy /= l; yz /= l;
  M[0] = yy * zz - yz * zy; M[1] = yz * zx - yx * zz; M[2] = yx * zy - yy * zx; M[3] = 0; M[4] = yx; M[5] = yy; M[6] = yz; M[7] = 0; M[8] = zx; M[9] = zy; M[10] = zz; M[11] = 0;
  M[12] = P[k + 9]; M[13] = P[k + 10]; M[14] = P[k + 11]; M[15] = 1;
}
function torsoChar(P, out) { trs(M1, P[0], P[1], P[2], P[3], P[4], P[5]); trs(M2, 0, WAIST, 0, P[6], P[7], P[8]); mul(out, M1, M2); }
// weapon frame W (char space) from a local frame relative to the torso
function wFromTorso(P, k, x, y, z, yaw, pitch, roll) { torsoChar(P, MT); trs(M3, x, y, z, yaw, pitch, roll); mul(MW, MT, M3); putW(P, k, MW); }
// weapon pointing along char forward pitched by `aim`, with local point (lx,ly,lz) placed at torso point (tx,ty,tz)
function wAimed(P, k, aim, cant, lx, ly, lz, tx, ty, tz) {
  torsoChar(P, MT); tp(MT, tx, ty, tz, V, 0); trs(MW, 0, 0, 0, 0, aim, cant);
  MW[12] = V[0] - (MW[0] * lx + MW[4] * ly + MW[8] * lz); MW[13] = V[1] - (MW[1] * lx + MW[5] * ly + MW[9] * lz); MW[14] = V[2] - (MW[2] * lx + MW[6] * ly + MW[10] * lz);
  putW(P, k, MW);
}
function handsOn(P, k, lx, ly, lz, rx, ry, rz) { getW(MW, P, k); tp(MW, lx, ly, lz, P, 24); tp(MW, rx, ry, rz, P, 27); }
const RIF_L = [-0.008, -0.048, -0.3], RIF_R = [0.012, -0.088, -0.012], RIF_BUTT = [0, -0.06, 0.33];
const AIMX = 0.1, AIMY = 0.43, AIMZ = -0.08; // butt pad in the shoulder pocket (torso space)
const RPG_L = [0.0, -0.075, -0.243], RPG_R = [0.0, -0.08, -0.12];
const fract = (x) => x - Math.floor(x), sstep = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

function base(P) {
  P.fill(0);
  set3(P, 0, 0, 0.905, 0); set3(P, 12, -0.11, ANK, 0.0); set3(P, 15, 0.11, ANK, 0.02);
  set3(P, 18, 0, 0.2, -1); set3(P, 21, 0, 0.2, -1); set3(P, 30, -0.5, -0.75, 0.45); set3(P, 33, 0.55, -0.7, 0.45);
  P[42] = P[47] = 0; P[36] = P[40] = P[44] = 1; P[48] = P[52] = P[56] = 1; // identity rotations
}
function lowReady(P, s) { wFromTorso(P, 36, 0.06, 0.13 + s, -0.25, 0.42, -0.62, 0.32); handsOn(P, 36, RIF_L[0], RIF_L[1], RIF_L[2], RIF_R[0], RIF_R[1], RIF_R[2]); }
function kneelLegs(P, yawP) {
  set3(P, 0, 0.0, 0.5, 0.05); P[3] = yawP;
  set3(P, 12, -0.2, ANK, -0.37); set3(P, 18, -0.15, 0.25, -1); // left foot planted forward, shin upright
  set3(P, 15, 0.22, 0.135, 0.44); set3(P, 21, 0.05, -1, -0.35); // right knee on the snow, toes tucked
}
// pose: 0 stand, 1 walk, 2 run, 3 kneel-aim, 4 prone-aim, 5 stand-aim, 7 RPG kneeling
function evalPose(P, pose, ph, aim) {
  base(P);
  if (pose === 1 || pose === 2) {
    const run = pose === 2, f = run ? RUN_HZ : WALK_HZ, cyc = ph * f, duty = run ? 0.37 : 0.62, S = (run ? RUN_V : WALK_V) * duty / f, lift = run ? 0.2 : 0.07;
    for (let k = 0; k < 2; k++) {
      const s = fract(cyc + k * 0.5), o = 12 + k * 3; let z, y;
      if (s < duty) { z = -S / 2 + S * s / duty; y = ANK; }
      else { const u = (s - duty) / (1 - duty); z = S / 2 - S * sstep(run ? Math.pow(u, 1.25) : u); y = ANK + lift * Math.sin(Math.PI * (run ? Math.pow(u, 0.7) : u)) + (run ? 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.6)) : 0.0); }
      set3(P, o, (k ? 1 : -1) * (run ? 0.1 : 0.11), y, z - (run ? 0.06 : 0.0));
    }
    const sw = (P[17] - P[14]) / S, bob = Math.cos(4 * Math.PI * (cyc - duty / 2));
    P[1] = run ? 0.865 - 0.035 * bob : 0.893 + 0.018 * bob; P[2] = run ? -0.06 : 0;
    P[3] = -0.13 * sw; P[5] = 0.03 * Math.sin(2 * Math.PI * cyc); P[4] = run ? -0.08 : 0;
    P[6] = 0.16 * sw; P[7] = run ? -0.2 : -0.06; P[8] = -P[5] * 0.6;
    P[9] = -0.03 * sw; P[10] = run ? 0.24 : 0.06;
    set3(P, 18, 0, 0.1, -1); set3(P, 21, 0, 0.1, -1);
    if (run) { wFromTorso(P, 36, 0.13, 0.2 + 0.01 * bob, -0.24, 1.2, 0.72, 1.0); set3(P, 30, -0.3, -0.9, 0.2); set3(P, 33, 0.7, -0.6, 0.3); handsOn(P, 36, RIF_L[0], RIF_L[1], RIF_L[2], RIF_R[0], RIF_R[1], RIF_R[2]); }
    else lowReady(P, 0.008 * bob);
  } else if (pose === 5) { // standing, rifle at the shoulder: bladed stance, left foot forward
    set3(P, 0, 0.0, 0.885, 0.02); P[3] = -0.42; set3(P, 12, -0.16, ANK, -0.2); set3(P, 15, 0.17, ANK, 0.17);
    set3(P, 18, -0.2, 0.15, -1); set3(P, 21, 0.4, 0.15, -1);
    P[6] = -0.3; P[7] = -0.17 + aim * 0.35; P[8] = 0.08; P[9] = 0.62; P[10] = aim * 0.4 - 0.12; P[11] = 0.3;
    wAimed(P, 36, aim, 0.05, RIF_BUTT[0], RIF_BUTT[1], RIF_BUTT[2], AIMX, AIMY, AIMZ);
    set3(P, 30, -0.25, -1, 0.1); set3(P, 33, 0.9, -0.35, 0.3); handsOn(P, 36, RIF_L[0], RIF_L[1], RIF_L[2], RIF_R[0], RIF_R[1], RIF_R[2]);
  } else if (pose === 3) { // kneeling, rifle at the shoulder, left elbow towards the knee
    kneelLegs(P, -0.45);
    P[6] = -0.22; P[7] = -0.19 + aim * 0.35; P[8] = 0.07; P[9] = 0.6; P[10] = aim * 0.4 - 0.1; P[11] = 0.3;
    wAimed(P, 36, aim, 0.05, RIF_BUTT[0], RIF_BUTT[1], RIF_BUTT[2], AIMX, AIMY, AIMZ);
    set3(P, 30, -0.1, -1, -0.2); set3(P, 33, 0.9, -0.4, 0.3); handsOn(P, 36, RIF_L[0], RIF_L[1], RIF_L[2], RIF_R[0], RIF_R[1], RIF_R[2]);
  } else if (pose === 7) { // kneeling with the RPG-7 on the right shoulder, rifle slung
    kneelLegs(P, -0.3);
    P[6] = -0.12; P[7] = -0.05 + aim * 0.3; P[8] = 0.1; P[9] = 0.4; P[10] = aim * 0.5 - 0.05; P[11] = 0.28;
    wAimed(P, 48, aim, 0, 0, 0, 0, 0.165, 0.5, -0.01);
    set3(P, 30, -0.3, -1, 0.1); set3(P, 33, 0.7, -0.7, 0.2);
    getW(MW, P, 48); tp(MW, RPG_L[0], RPG_L[1], RPG_L[2], P, 24); tp(MW, RPG_R[0], RPG_R[1], RPG_R[2], P, 27);
    P[60] = 1;
  } else if (pose === 4) { // prone, up on the elbows, legs spread with the feet turned out
    set3(P, 0, 0.02, 0.135, 0.5); P[4] = -Math.PI / 2; P[3] = 0.04;
    set3(P, 12, -0.3, 0.085, 1.33); set3(P, 15, 0.2, 0.085, 1.37); set3(P, 18, -0.9, -0.45, 0); set3(P, 21, 0.9, -0.45, 0);
    P[6] = -0.06; P[7] = 0.42 + aim * 0.3; P[8] = 0.04; P[9] = 0.2; P[10] = 0.52 + aim * 0.4; P[11] = 0.28;
    wAimed(P, 36, aim, 0.03, RIF_BUTT[0], RIF_BUTT[1], RIF_BUTT[2], 0.075, 0.47, -0.1);
    set3(P, 30, -0.25, -1, 0.2); set3(P, 33, 0.4, -1, 0.3); handsOn(P, 36, RIF_L[0], RIF_L[1], RIF_L[2], RIF_R[0], RIF_R[1], RIF_R[2]);
    P[61] = 1;
  } else { // 0 stand at ease, rifle at the low ready, breathing
    const br = Math.sin(ph * 1.7);
    P[1] = 0.905 + 0.003 * br; P[3] = -0.08; P[6] = 0.06; P[7] = 0.012 * br - 0.02; P[9] = 0.05 + 0.08 * Math.sin(ph * 0.31); P[10] = -0.04;
    set3(P, 12, -0.13, ANK, -0.04); set3(P, 15, 0.12, ANK, 0.05);
    lowReady(P, 0.004 * br);
  }
}
// dead, lying: 0 on the back (fell backwards), 1 face down (fell forwards), 2 face down in place (was prone)
function evalDead(P, v, h) {
  base(P); const a = (h - 0.5) * 0.5; P[61] = 1;
  if (v === 0) {
    set3(P, 0, 0.0, 0.125, 0.78); P[3] = a; P[4] = Math.PI / 2; P[5] = 0.06;
    P[6] = 0.05; P[7] = -0.04; P[8] = -0.05; P[9] = 0.7 * (h > 0.5 ? 1 : -1); P[10] = 0.15; P[11] = 0.2;
    set3(P, 12, -0.24, 0.1, -0.06); set3(P, 15, 0.3, 0.1, 0.08); set3(P, 18, -1, 0.35, 0); set3(P, 21, 1, 0.45, 0);
    set3(P, 24, -0.62, 0.06, 1.0); set3(P, 27, 0.5, 0.06, 1.35); set3(P, 30, -0.3, -1, 0.3); set3(P, 33, 0.3, -1, 0.2);
    trs(MW, 0.62, 0.035, 0.55 + a, 1.2 + a, 0, Math.PI / 2); putW(P, 36, MW);
  } else {
    const prone = v === 2;
    set3(P, 0, 0.0, 0.13, prone ? 0.5 : -0.78); P[3] = a; P[4] = -Math.PI / 2; P[5] = -0.08;
    P[6] = -0.04; P[7] = 0.02; P[8] = 0.05; P[9] = 1.0 * (h > 0.5 ? 1 : -1); P[10] = 0.1; P[11] = 0.1;
    const fz = prone ? 1.35 : 0.1;
    set3(P, 12, -0.3, 0.085, fz); set3(P, 15, 0.25, 0.13, fz - 0.25); set3(P, 18, -0.9, -0.4, 0); set3(P, 21, 0.7, -0.6, 0.2);
    const cz = P[2] - 0.6; // shoulders
    set3(P, 24, -0.5, 0.06, cz - 0.35); set3(P, 27, 0.32, 0.06, cz + 0.5); set3(P, 30, -0.5, 1, 0); set3(P, 33, 0.5, 1, 0);
    trs(MW, -0.45, 0.035, cz - 0.55, 0.9 + a, 0, Math.PI / 2); putW(P, 36, MW);
  }
}

export function initSoldiers(MAXI, heightAt) {
  const PA = new Float32Array(NP), PB = new Float32Array(NP), PC = new Float32Array(NP);
  const cur = new Int8Array(MAXI).fill(-1), prv = new Int8Array(MAXI).fill(-1), dvar = new Int8Array(MAXI), dfrom = new Int8Array(MAXI);
  const bt = new Float32Array(MAXI), prvPh = new Float32Array(MAXI), prvAim = new Float32Array(MAXI), lastPh = new Float32Array(MAXI), lastAim = new Float32Array(MAXI);
  const out = new Float32Array(MAXI * IST), ord = new Int32Array(MAXI), key = new Float32Array(MAXI);
  const B = new Float32Array(16), Bp = new Float32Array(16), Mp = new Float32Array(16), Mt = new Float32Array(16), Mh = new Float32Array(16), W4 = new Float32Array(16);
  const J = new Float32Array(3), T = new Float32Array(3), Q = new Float32Array(3), E = new Float32Array(3);
  const SL = new Float32Array(16); { // rifle slung across the back (torso space): muzzle up over the left shoulder
    const zx = 0.8, zy = -0.6, xx = 0, xz = 1; SL[0] = xx; SL[2] = xz; SL[4] = zy * xz; SL[5] = -zx * xz; SL[8] = zx; SL[9] = zy; SL[15] = 1;
    SL[12] = 0.0 - 0.15 * zx; SL[13] = 0.17 - 0.15 * zy; SL[14] = 0.262; }
  const S = { out, nNear: 0, nFar: 0, MAXI };
  // a rigid bone matrix at joint (jx,jy,jz) whose local -Y runs along unit d and whose local -Z faces `front` (made perpendicular)
  function bone(o, jx, jy, jz, dx, dy, dz, fx, fy, fz) {
    const k = fx * dx + fy * dy + fz * dz; fx -= dx * k; fy -= dy * k; fz -= dz * k; let l = Math.hypot(fx, fy, fz);
    if (l < 1e-4) { fx = dy; fy = -dx; fz = 0; l = Math.hypot(fx, fy) || 1; } fx /= l; fy /= l; fz /= l;
    const yx = -dx, yy = -dy, yz = -dz, zx = -fx, zy = -fy, zz = -fz;
    out[o] = yy * zz - yz * zy; out[o + 1] = yz * zx - yx * zz; out[o + 2] = yx * zy - yy * zx; out[o + 3] = 0;
    out[o + 4] = yx; out[o + 5] = yy; out[o + 6] = yz; out[o + 7] = 0; out[o + 8] = zx; out[o + 9] = zy; out[o + 10] = zz; out[o + 11] = 0;
    out[o + 12] = jx; out[o + 13] = jy; out[o + 14] = jz; out[o + 15] = 1;
  }
  // two-bone IK from joint J to target T with pole direction Q (world); writes the upper and lower bone matrices
  // knee: limb front faces the pole (knee cap, foot forward); arm: front faces away from the elbow point
  function ik(o1, o2, a, b, knee) {
    let dx = T[0] - J[0], dy = T[1] - J[1], dz = T[2] - J[2]; const L0 = Math.hypot(dx, dy, dz) || 1e-4; dx /= L0; dy /= L0; dz /= L0;
    const L = Math.min(Math.max(L0, Math.abs(a - b) + 0.01), (a + b) * 0.9995), x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
    let px = Q[0], py = Q[1], pz = Q[2]; const k = px * dx + py * dy + pz * dz; px -= dx * k; py -= dy * k; pz -= dz * k; let l = Math.hypot(px, py, pz);
    if (l < 1e-4) { px = -dz; py = 0; pz = dx; l = Math.hypot(px, pz) || 1; } px /= l; py /= l; pz /= l;
    E[0] = J[0] + dx * x + px * h; E[1] = J[1] + dy * x + py * h; E[2] = J[2] + dz * x + pz * h;
    const ux = (E[0] - J[0]) / a, uy = (E[1] - J[1]) / a, uz = (E[2] - J[2]) / a, ex = J[0] + dx * L, ey = J[1] + dy * L, ez = J[2] + dz * L;
    const vx = (ex - E[0]) / b, vy = (ey - E[1]) / b, vz = (ez - E[2]) / b, sg = knee ? 1 : -1;
    bone(o1, J[0], J[1], J[2], ux, uy, uz, px * sg, py * sg, pz * sg);
    bone(o2, E[0], E[1], E[2], vx, vy, vz, px * sg, py * sg, pz * sg);
  }
  function rot(M, x, y, z, o, k) { o[k] = M[0] * x + M[4] * y + M[8] * z; o[k + 1] = M[1] * x + M[5] * y + M[9] * z; o[k + 2] = M[2] * x + M[6] * y + M[10] * z; }
  function copyTo(o, M) { for (let q = 0; q < 16; q++) out[o + q] = M[q]; }
  // blend A -> Bv: wr rotations and pelvis (polar arc about the feet when arc), wl legs, wa arms, ww weapons
  function blend(A, Bv, wr, wl, wa, ww, arc) {
    for (let q = 0; q < NP; q++) { const w = q < 12 ? wr : q < 24 ? wl : q < 36 ? wa : q < 60 ? ww : wr; PC[q] = A[q] + (Bv[q] - A[q]) * w; }
    PC[60] = ww < 0.5 ? A[60] : Bv[60]; // weapon mode switches halfway
    if (arc) { const ra = Math.hypot(A[1], A[2]), rb = Math.hypot(Bv[1], Bv[2]), aa = Math.atan2(A[2], A[1]), ab = Math.atan2(Bv[2], Bv[1]), r = ra + (rb - ra) * wr, an = aa + (ab - aa) * wr;
      PC[1] = r * Math.cos(an); PC[2] = r * Math.sin(an); }
  }
  function hsh(i) { let n = Math.imul(i + 17, 0x2c1b3c6d); n ^= n >>> 15; n = Math.imul(n, 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

  // pose one soldier into instance slot k
  function poseOne(i, d, k) {
    const o = i * 8, x = d[o], y = d[o + 1], z = d[o + 2], yaw = d[o + 3], pose = d[o + 4] | 0, ph = d[o + 5], aim = d[o + 6], dead = d[o + 7] > 1.5;
    let heat = 1;
    if (dead) {
      evalPose(PA, dfrom[i], prvPh[i], prvAim[i]); evalDead(PB, dvar[i], hsh(i));
      const t = Math.max(0, ph), wr = Math.min(1, (t / 0.62) * (t / 0.62)), wl = sstep(t / 0.35), wa = sstep((t - 0.08) / 0.5), ww = Math.min(1, (t / 0.45) * (t / 0.45));
      blend(PA, PB, wr, wl, wa, ww, true); heat = 1 - 0.85 * sstep(t / 60);
    } else if (prv[i] >= 0 && bt[i] < 0.25) {
      evalPose(PA, prv[i], prvPh[i], prvAim[i]); evalPose(PB, pose, ph, aim); const w = sstep(bt[i] / 0.25); blend(PA, PB, w, w, w, w, false);
    } else evalPose(PC, pose, ph, aim);
    const P = PC, L = P[61], ob = k * IST;
    // root: world from character space; lying bodies pivot about their middle to follow the slope
    trs(B, x, y, z, yaw, 0, 0);
    if (L > 0.001) {
      const pz = P[2], cy = Math.cos(yaw), sy = Math.sin(yaw), hc = heightAt(x + sy * pz, z + cy * pz);
      const hf = heightAt(x + sy * (pz - 0.85), z + cy * (pz - 0.85)), hb = heightAt(x + sy * (pz + 0.85), z + cy * (pz + 0.85));
      const hr = heightAt(x + cy * 0.3 + sy * pz, z - sy * 0.3 + cy * pz), hl = heightAt(x - cy * 0.3 + sy * pz, z + sy * 0.3 + cy * pz);
      trs(M1, 0, L * (hc - y), pz, 0, L * Math.atan((hf - hb) / 1.7), L * Math.atan((hr - hl) / 0.6)); M2.fill(0); M2[0] = M2[5] = M2[10] = M2[15] = 1; M2[14] = -pz;
      mul(M3, M1, M2); mul(Bp, B, M3); B.set(Bp);
    }
    // feet follow the ground under them when upright
    let dL = 0, dR = 0;
    if (L < 0.5) { tp(B, P[12], P[13], P[14], T, 0); dL = Math.max(-0.35, Math.min(0.35, heightAt(T[0], T[2]) - y)); tp(B, P[15], P[16], P[17], T, 0); dR = Math.max(-0.35, Math.min(0.35, heightAt(T[0], T[2]) - y)); }
    const drop = Math.min(0, dL, dR);
    trs(M1, P[0], P[1] + drop, P[2], P[3], P[4], P[5]); mul(Mp, B, M1);
    trs(M1, 0, WAIST, 0, P[6], P[7], P[8]); mul(Mt, Mp, M1);
    trs(M1, 0, NECK, 0, P[9], P[10], P[11]); mul(Mh, Mt, M1);
    copyTo(ob, Mp); copyTo(ob + 16, Mt); copyTo(ob + 32, Mh);
    // legs
    for (let s = 0; s < 2; s++) {
      tp(Mp, s ? HIPX : -HIPX, 0, 0, J, 0); tp(B, P[12 + s * 3], P[13 + s * 3], P[14 + s * 3], T, 0); T[1] += s ? dR : dL;
      rot(B, P[18 + s * 3], P[19 + s * 3], P[20 + s * 3], Q, 0); ik(ob + (7 + s) * 16, ob + (9 + s) * 16, TH, SH, true);
    }
    // arms
    for (let s = 0; s < 2; s++) {
      tp(Mt, s ? SHX : -SHX, SHY, 0, J, 0); tp(B, P[24 + s * 3], P[25 + s * 3], P[26 + s * 3], T, 0); if (L < 0.5) T[1] += drop;
      rot(B, P[30 + s * 3], P[31 + s * 3], P[32 + s * 3], Q, 0); ik(ob + (3 + s) * 16, ob + (5 + s) * 16, UA, FA, false);
    }
    // weapons
    if (P[60] > 0.5) { mul(W4, Mt, SL); copyTo(ob + 176, W4); getW(M1, P, 48); mul(W4, B, M1); if (L < 0.5) W4[13] += drop; copyTo(ob + 192, W4); }
    else { getW(M1, P, 36); mul(W4, B, M1); if (L < 0.5) W4[13] += drop; copyTo(ob + 176, W4); for (let q = 0; q < 16; q++) out[ob + 192 + q] = 0; }
    out[ob + 208] = heat; out[ob + 209] = 0; out[ob + 210] = 0; out[ob + 211] = 0;
  }

  // per frame: track pose changes for blending, cull by distance and frustum (planes from planesFrom, n planes), pose and pack visible soldiers
  // near LOD first [0, nNear), then the distant LOD [nNear, nNear + nFar)
  S.reset = () => { cur.fill(-1); prv.fill(-1); }; // forget pose history (test staging)
  S.update = (inf, dt, cx, cy, cz, pl, np) => {
    const d = inf.d, n = Math.min(inf.n, MAXI); let nv = 0;
    for (let i = 0; i < MAXI; i++) {
      const o = i * 8, st = i < n ? d[o + 7] : 0;
      if (st < 0.5) { cur[i] = -1; prv[i] = -1; continue; }
      const dead = st > 1.5, pose = dead ? 6 : d[o + 4] | 0;
      if (cur[i] < 0) { cur[i] = pose; prv[i] = -1; bt[i] = 1; if (dead) { dfrom[i] = 0; prvPh[i] = 0; prvAim[i] = 0; dvar[i] = hsh(i * 3 + 1) < 0.5 ? 0 : 1; } }
      else if (pose !== cur[i]) {
        if (dead) { dfrom[i] = prv[i] >= 0 && bt[i] < 0.12 ? prv[i] : cur[i]; if (dfrom[i] === 6) dfrom[i] = 0; prvPh[i] = lastPh[i]; prvAim[i] = lastAim[i]; dvar[i] = dfrom[i] === 4 ? 2 : hsh(i * 7 + (lastPh[i] * 10 | 0)) < 0.5 ? 0 : 1; }
        else if (cur[i] === 6) { prv[i] = -1; bt[i] = 1; } // slot reused after a death
        else { prv[i] = cur[i]; prvPh[i] = lastPh[i]; prvAim[i] = lastAim[i]; bt[i] = 0; }
        cur[i] = pose;
      }
      bt[i] += dt; if (!dead) { lastPh[i] = d[o + 5]; lastAim[i] = d[o + 6]; }
      const x = d[o], y = d[o + 1] + 0.8, z = d[o + 2], dx = x - cx, dy = y - cy, dz = z - cz, dist = Math.hypot(dx, dy, dz);
      if (dist > MAX_D) continue;
      const r = dist < 60 ? 3 : 1.8; let vis = true;
      for (let p = 0; p < np; p++) { const a = pl[p * 4], b = pl[p * 4 + 1], c = pl[p * 4 + 2]; if (a * x + b * y + c * z + pl[p * 4 + 3] < -r * Math.hypot(a, b, c)) { vis = false; break; } }
      if (!vis) continue;
      ord[nv] = i; key[nv] = dist; nv++;
    }
    // near ones first (insertion sort on distance, n <= 40), so the near/far split is one boundary
    for (let a = 1; a < nv; a++) { const ki = key[a], oi = ord[a]; let b = a - 1; while (b >= 0 && key[b] > ki) { key[b + 1] = key[b]; ord[b + 1] = ord[b]; b--; } key[b + 1] = ki; ord[b + 1] = oi; }
    let nn = 0; while (nn < nv && key[nn] < LOD_FAR) nn++;
    for (let k = 0; k < nv; k++) poseOne(ord[k], d, k);
    S.nNear = nn; S.nFar = nv - nn;
    return nv;
  };
  return S;
}
