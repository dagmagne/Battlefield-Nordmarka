// Procedural tanks. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
// Parts: 0 hull, 1 turret, 2 gun (elevation + recoil). The track loop constants must match objdeform.wgsl.
import { MB, MAT } from './mesh.js';
import { trs, mul, identity } from './math.js';

export const TRK = { A: 2.95, R: 0.4, yc: 0.42, x: 1.43, w: 0.64 };
// turret ring centre, gun trunnion and muzzle of the Leopard (hull coordinates)
export const LEO = { ty: 1.58, tz: -0.25, gy: 1.97, gz: -1.6, mz: -6.2, hl: 2.9, hw: 1.43, rad: 2.6 };

// ---- helpers: flat polygons that always face away from an interior point ----
function poly(b, P, c) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
  const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return; nx /= l; ny /= l; nz /= l;
  let mx = 0, my = 0, mz = 0; for (const p of P) { mx += p[0]; my += p[1]; mz += p[2]; } mx /= P.length; my /= P.length; mz /= P.length;
  const flip = nx * (mx - c[0]) + ny * (my - c[1]) + nz * (mz - c[2]) < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const base = b.v.length / 14;
  for (const p of P) b.vert(p[0], p[1], p[2], nx, ny, nz, 0, 0);
  for (let i = 1; i < P.length - 1; i++) { if (flip) b.i.push(base, base + i + 1, base + i); else b.i.push(base, base + i, base + i + 1); }
}
// extrude a convex side profile [[y,z],...] along x
function extX(b, prof, x0, x1) {
  let cy = 0, cz = 0; for (const p of prof) { cy += p[0]; cz += p[1]; } cy /= prof.length; cz /= prof.length;
  const c = [(x0 + x1) / 2, cy, cz], n = prof.length;
  for (let i = 0; i < n; i++) { const p = prof[i], q = prof[(i + 1) % n]; poly(b, [[x0, p[0], p[1]], [x1, p[0], p[1]], [x1, q[0], q[1]], [x0, q[0], q[1]]], c); }
  poly(b, prof.map((p) => [x0, p[0], p[1]]), c); poly(b, prof.map((p) => [x1, p[0], p[1]]), c);
}
// extrude a convex plan [[x,z],...] along y; the top can be shrunk towards (kx,kz) by k (sloped walls)
function extY(b, plan, y0, y1, k = 0, kx = 0, kz = 0) {
  let cx = 0, cz = 0; for (const p of plan) { cx += p[0]; cz += p[1]; } cx /= plan.length; cz /= plan.length;
  const c = [cx, (y0 + y1) / 2, cz], n = plan.length, top = plan.map((p) => [p[0] + (kx - p[0]) * k, p[1] + (kz - p[1]) * k]);
  for (let i = 0; i < n; i++) { const p = plan[i], q = plan[(i + 1) % n], pt = top[i], qt = top[(i + 1) % n]; poly(b, [[p[0], y0, p[1]], [q[0], y0, q[1]], [qt[0], y1, qt[1]], [pt[0], y1, pt[1]]], c); }
  poly(b, plan.map((p) => [p[0], y0, p[1]]), c); poly(b, top.map((p) => [p[0], y1, p[1]]), c);
}
const mirror = (plan) => plan.concat(plan.slice().reverse().map((p) => [-p[0], p[1]]));

// running gear shared by all tanks: animated belts, road wheels, idler and sprocket
function runningGear(b, nWheel, wr, z0, z1, wc) {
  const { A, R, yc } = TRK, L = 4 * A + 2 * Math.PI * R, DARK = [0.03, 0.031, 0.034];
  for (const side of [-1, 1]) {
    const cx = side * TRK.x, x0 = cx - TRK.w / 2, x1 = cx + TRK.w / 2;
    b.part = 0; b.set(DARK, MAT.rubber);
    const N = 48, P = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N * L; let y, z, ny, nz;
      if (s < 2 * A) { y = yc - R; z = -A + s; ny = -1; nz = 0; }
      else if (s < 2 * A + Math.PI * R) { const t = (s - 2 * A) / R; y = yc - R * Math.cos(t); z = A + R * Math.sin(t); ny = -Math.cos(t); nz = Math.sin(t); }
      else if (s < 4 * A + Math.PI * R) { y = yc + R; z = A - (s - 2 * A - Math.PI * R); ny = 1; nz = 0; }
      else { const t = (s - 4 * A - Math.PI * R) / R; y = yc + R * Math.cos(t); z = -A - R * Math.sin(t); ny = Math.cos(t); nz = -Math.sin(t); }
      P.push([y, z, ny, nz, s]);
    }
    for (let i = 0; i < N; i++) {
      const p = P[i], q = P[i + 1], xa = x0 + 0.02, xb = x1 - 0.02;
      const a = b.vert(xa, p[0], p[1], 0, p[2], p[3], 0, p[4]), c = b.vert(xb, p[0], p[1], 0, p[2], p[3], 1, p[4]), d = b.vert(xb, q[0], q[1], 0, q[2], q[3], 1, q[4]), e = b.vert(xa, q[0], q[1], 0, q[2], q[3], 0, q[4]);
      b.i.push(a, c, d, a, d, e);
    }
    // track links (animated along the loop in the vertex shader): pos = (x, along, outward), uv = (s0, side)
    const NBAR = Math.round(L / 0.19);
    for (let k = 0; k < NBAR; k++) {
      const s0 = k / NBAR * L, hw = 0.07, ht = 0.05;
      const V = (x, al, out, nx, na, no) => { b.v.push(x, al, out, nx, na, no, 0.3, 0.31, 0.33, MAT.bar, s0, side, 0, 0); return b.v.length / 14 - 1; };
      const Q = (p, q, r, s2, n) => { const a = V(...p, ...n), c = V(...q, ...n), d = V(...r, ...n), e = V(...s2, ...n); b.i.push(a, c, d, a, d, e); };
      Q([x0, -hw, 0], [x1, -hw, 0], [x1, -hw * 0.7, ht], [x0, -hw * 0.7, ht], [0, -1, 0.3]);
      Q([x1, hw, 0], [x0, hw, 0], [x0, hw * 0.7, ht], [x1, hw * 0.7, ht], [0, 1, 0.3]);
      Q([x0, -hw * 0.7, ht], [x1, -hw * 0.7, ht], [x1, hw * 0.7, ht], [x0, hw * 0.7, ht], [0, 0, 1]);
      Q([x0, -hw, 0], [x0, -hw * 0.7, ht], [x0, hw * 0.7, ht], [x0, hw, 0], [-1, 0, 0]);
      Q([x1, hw, 0], [x1, hw * 0.7, ht], [x1, -hw * 0.7, ht], [x1, -hw, 0], [1, 0, 0]);
    }
    b.set(wc, MAT.wheel);
    for (let k = 0; k < nWheel; k++) { const z = z0 + k * (z1 - z0) / (nWheel - 1); for (const o of [-0.17, 0.17]) b.cyl(cx + o - 0.11, yc - R + wr, z, cx + o + 0.11, yc - R + wr, z, wr, wr, 16); }
    b.cyl(cx - 0.26, yc, -A, cx + 0.26, yc, -A, R - 0.03, R - 0.03, 16); b.cyl(cx - 0.26, yc, A, cx + 0.26, yc, A, R - 0.03, R - 0.03, 16);
    b.set([0.1, 0.1, 0.11], MAT.metal); b.box(cx - 0.05, yc - 0.12, -A, cx + 0.05, yc + 0.1, A);
  }
}

// ---------- Leopard 2A4NO ----------
export function buildLeopard() {
  const b = new MB();
  const GRN = [0.042, 0.052, 0.03], DGRN = [0.03, 0.037, 0.023], DARK = [0.03, 0.031, 0.034], STEEL = [0.2, 0.21, 0.22], GLASS = [0.02, 0.035, 0.05];
  runningGear(b, 7, 0.35, -2.35, 2.45, DGRN);
  b.part = 0;
  // lower hull between the tracks, upper hull with sponsons over them
  b.set(DGRN, MAT.camo);
  extX(b, [[0.5, -3.3], [0.98, -3.78], [1.5, -2.35], [1.56, 3.55], [1.5, 3.8], [0.62, 3.8], [0.48, 3.45]], -1.08, 1.08);
  b.set(GRN, MAT.camo);
  extX(b, [[0.93, -3.74], [0.98, -3.78], [1.5, -2.35], [1.56, 3.55], [1.5, 3.8], [0.93, 3.8]], -1.8, 1.8);
  for (const sx of [-1, 1]) {
    b.set(GRN, MAT.camo);
    // side skirts: three heavy armour modules at the front, thin scalloped plates behind
    for (let k = 0; k < 3; k++) { const z = -3.42 + k * 0.82; b.box(sx * 1.86 - 0.07, 0.4, z, sx * 1.86 + 0.07, 1.02, z + 0.79); }
    for (let k = 0; k < 5; k++) { const z = -0.94 + k * 0.9; b.box(sx * 1.835 - 0.025, 0.5, z, sx * 1.835 + 0.025, 0.98, z + 0.87, 0, 0.0, 0.0); b.box(sx * 1.835 - 0.03, 0.42, z + 0.12, sx * 1.835 + 0.03, 0.5, z + 0.75); }
    // mud flaps, headlight, tail light, tow shackles
    b.set(DARK, MAT.rubber); b.box(sx * 1.43 - 0.36, 0.38, 3.8, sx * 1.43 + 0.36, 0.95, 3.83); b.box(sx * 1.43 - 0.36, 0.55, -3.8, sx * 1.43 + 0.36, 0.95, -3.76);
    b.set(DGRN, MAT.camo); b.box(sx * 1.36 - 0.14, 1.39, -2.78, sx * 1.36 + 0.14, 1.57, -2.58);
    b.set([1, 0.95, 0.82], MAT.head); poly(b, [[sx * 1.36 - 0.1, 1.42, -2.782], [sx * 1.36 + 0.1, 1.42, -2.782], [sx * 1.36 + 0.1, 1.55, -2.782], [sx * 1.36 - 0.1, 1.55, -2.782]], [sx * 1.36, 1.48, 0]);
    b.set([1, 0.05, 0.02], MAT.head); poly(b, [[sx * 1.55 - 0.09, 1.28, 3.803], [sx * 1.55 + 0.09, 1.28, 3.803], [sx * 1.55 + 0.09, 1.38, 3.803], [sx * 1.55 - 0.09, 1.38, 3.803]], [sx * 1.55, 1.3, 0]);
    b.set(STEEL, MAT.metal); b.box(sx * 0.7 - 0.05, 0.72, -3.66, sx * 0.7 + 0.05, 0.9, -3.52); b.box(sx * 0.75 - 0.05, 0.7, 3.8, sx * 0.75 + 0.05, 0.86, 3.9);
    // exhaust grilles on the rear plate
    b.set(DARK, MAT.metal); b.cyl(sx * 1.12, 1.2, 3.79, sx * 1.12, 1.2, 3.83, 0.27, 0.27, 16);
    for (let k = -2; k <= 2; k++) b.box(sx * 1.12 - 0.25, 1.2 + k * 0.09 - 0.012, 3.83, sx * 1.12 + 0.25, 1.2 + k * 0.09 + 0.012, 3.845);
    // engine deck fan grilles
    b.set(DARK, MAT.metal); b.cyl(sx * 0.82, 1.555, 2.7, sx * 0.82, 1.585, 2.7, 0.56, 0.56, 20);
    b.set(DGRN, MAT.camo); b.cyl(sx * 0.82, 1.585, 2.7, sx * 0.82, 1.6, 2.7, 0.2, 0.2, 10);
    b.box(sx * 0.82 - 0.012, 1.585, 2.7 - 0.54, sx * 0.82 + 0.012, 1.597, 2.7 + 0.54);
    b.box(sx * 0.82 - 0.54, 1.585, 2.7 - 0.012, sx * 0.82 + 0.54, 1.597, 2.7 + 0.012);
    b.set(GRN, MAT.camo);
    // stowage boxes on the rear sponsons, tow cable
    b.box(sx * 1.5 - 0.26, 1.56, 1.9, sx * 1.5 + 0.26, 1.7, 3.3, 0.02, 0.02);
    b.set(STEEL, MAT.metal); b.cyl(sx * 1.62, 1.6, -2.1, sx * 1.62, 1.6, 1.6, 0.025, 0.025, 5);
  }
  // engine deck centre hump, driver hatch with periscopes, glacis ribs
  b.set(GRN, MAT.camo); b.box(-0.24, 1.56, 1.75, 0.24, 1.63, 3.5, 0.03, 0.03);
  b.box(0.3, 1.5, -2.25, 1.0, 1.56, -1.6, 0.04, 0.04);
  b.set(GLASS, MAT.glass); for (const x of [0.42, 0.65, 0.88]) b.box(x - 0.09, 1.5, -2.36, x + 0.09, 1.58, -2.27);
  b.set(DGRN, MAT.camo); for (const x of [-1.0, -0.4, 0.2]) b.box(x - 0.02, 1.2, -3.2, x + 0.02, 1.26, -3.1);
  // spare track links on the glacis
  b.set(DARK, MAT.metal); for (let k = 0; k < 5; k++) { const x = -0.95 + k * 0.2; poly(b, [[x, 1.262, -3.02], [x + 0.17, 1.262, -3.02], [x + 0.17, 1.39, -2.67], [x, 1.39, -2.67]], [x, 0, 0]); }

  // --- turret (part 1) ---
  b.part = 1;
  b.set(DGRN, MAT.camo); b.cyl(0, 1.53, LEO.tz, 0, 1.62, LEO.tz, 1.12, 1.12, 24, 0);
  b.set(GRN, MAT.camo);
  const plan = mirror([[0.5, -2.08], [1.0, -2.08], [1.5, -1.78], [1.58, 1.2], [1.42, 2.4]]);
  extY(b, plan, 1.62, 2.38, 0.0);
  // lower chamfer under the bustle and cheeks, roof plates
  b.set(DGRN, MAT.camo); b.box(-1.2, 1.66, 2.4, 1.2, 2.3, 2.66, 0.03, 0, 0.05);
  for (let k = 0; k < 4; k++) b.box(-1.15 + k * 0.6, 1.72, 2.66, -1.15 + k * 0.6 + 0.5, 2.24, 2.69);
  b.set(GRN, MAT.camo);
  b.box(-1.35, 2.38, -1.7, 0.4, 2.41, 1.9); // roof armour plate
  // EMES 15 gunner sight (right front), with the notch window
  b.box(0.52, 2.38, -1.95, 1.3, 2.58, -1.2, 0.04, 0.0, 0.12);
  b.set(GLASS, MAT.glass); poly(b, [[0.6, 2.41, -1.953], [1.22, 2.41, -1.953], [1.22, 2.55, -1.953], [0.6, 2.55, -1.953]], [0.9, 2.48, 0]);
  // PERI R17 commander sight, cupola with periscopes, loader hatch
  b.set(GRN, MAT.camo); b.cyl(0.62, 2.38, -0.75, 0.62, 2.62, -0.75, 0.15, 0.15, 12); b.box(0.48, 2.62, -0.9, 0.76, 2.84, -0.62, 0.02, 0.02);
  b.set(GLASS, MAT.glass); poly(b, [[0.52, 2.66, -0.902], [0.72, 2.66, -0.902], [0.72, 2.8, -0.902], [0.52, 2.8, -0.902]], [0.62, 2.7, 0]);
  b.set(GRN, MAT.camo); b.cyl(0.62, 2.38, 0.15, 0.62, 2.5, 0.15, 0.47, 0.44, 16); b.set(DGRN, MAT.camo); b.cyl(0.62, 2.5, 0.15, 0.62, 2.53, 0.15, 0.36, 0.36, 16);
  b.set(GLASS, MAT.glass); for (let k = 0; k < 6; k++) { const a = (k - 2.5) * 0.5; b.at(0.62 - Math.sin(a) * 0.46, 2.44, 0.15 - Math.cos(a) * 0.46, a); b.box(-0.08, -0.035, -0.02, 0.08, 0.035, 0.02); } b.at(0, 0, 0);
  b.set(DGRN, MAT.camo); b.cyl(-0.65, 2.41, 0.2, -0.65, 2.45, 0.2, 0.4, 0.4, 16);
  // MG3 on the loader hatch ring
  b.set(DARK, MAT.metal); b.cyl(-0.65, 2.45, -0.15, -0.65, 2.66, -0.15, 0.03, 0.03, 6); b.box(-0.69, 2.63, -0.5, -0.61, 2.72, 0.2); b.cyl(-0.65, 2.68, -0.5, -0.65, 2.68, -1.15, 0.018, 0.018, 6);
  b.box(-0.82, 2.56, -0.25, -0.69, 2.7, -0.02);
  for (const sx of [-1, 1]) {
    // smoke grenade dischargers: two rows of four
    b.set(DGRN, MAT.camo); b.box(sx * 1.6 - 0.05, 1.86, 0.35, sx * 1.6 + 0.05, 2.26, 1.15);
    b.set(DARK, MAT.metal);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { const z = 0.48 + k * 0.19, y = 1.96 + r * 0.19, dx = sx * (0.72 - k * 0.07), dz = -0.5 + k * 0.1; b.cyl(sx * 1.62, y, z, sx * 1.62 + dx * 0.3, y + 0.16, z + dz * 0.3, 0.05, 0.05, 8); }
    // antenna, lifting hooks
    b.cyl(sx * 1.25, 2.38, 2.1, sx * 1.25, 2.5, 2.1, 0.035, 0.03, 6); b.cyl(sx * 1.25, 2.5, 2.1, sx * 1.25 - sx * 0.05, 4.4, 2.3, 0.009, 0.004, 4);
    b.set(STEEL, MAT.metal); b.box(sx * 1.3 - 0.03, 2.38, -1.4, sx * 1.3 + 0.03, 2.46, -1.28);
    // Norwegian flag on the turret side
    const fx = (z) => sx * (1.58 - (z - 1.2) * 0.16 / 1.2 + 0.012);
    b.set([1, 1, 1], MAT.flag); const z0 = sx > 0 ? 2.05 : 1.55, z1 = sx > 0 ? 1.55 : 2.05; // hoist towards the front on both sides
    b.quad([fx(z1), 1.98, z1], [fx(z0), 1.98, z0], [fx(z0), 2.3, z0], [fx(z1), 2.3, z1], sx > 0 ? [0, 1, 1, 1, 1, 0, 0, 0] : [1, 1, 0, 1, 0, 0, 1, 0]);
  }
  b.set(STEEL, MAT.metal); b.cyl(0, 2.38, 2.2, 0, 2.75, 2.2, 0.02, 0.02, 5); b.cyl(0, 2.75, 2.2, 0, 2.83, 2.2, 0.045, 0.045, 8); // crosswind sensor

  // --- gun (part 2) ---
  b.part = 2; const gy = LEO.gy;
  b.set(GRN, MAT.camo); b.box(-0.46, gy - 0.27, -2.34, 0.46, gy + 0.26, -1.9, 0.04, 0, 0.0);
  b.set(DARK, MAT.void); poly(b, [[-0.36, gy + 0.12, -2.343], [-0.28, gy + 0.12, -2.343], [-0.28, gy + 0.19, -2.343], [-0.36, gy + 0.19, -2.343]], [0, gy, 0]); // coax port
  b.set(DGRN, MAT.camo);
  b.cyl(0, gy, -2.3, 0, gy, -2.95, 0.15, 0.125, 14);
  b.cyl(0, gy, -2.95, 0, gy, -3.95, 0.108, 0.105, 14, 0);
  b.cyl(0, gy, -3.95, 0, gy, -4.05, 0.105, 0.15, 14, 0); b.cyl(0, gy, -4.05, 0, gy, -4.8, 0.15, 0.15, 14, 0); b.cyl(0, gy, -4.8, 0, gy, -4.9, 0.15, 0.1, 14, 0); // fume extractor
  b.cyl(0, gy, -4.9, 0, gy, -6.05, 0.1, 0.092, 14, 0);
  b.set(STEEL, MAT.metal); b.cyl(0, gy, -6.05, 0, gy, LEO.mz, 0.1, 0.1, 14); b.box(-0.03, gy + 0.09, -6.15, 0.03, gy + 0.16, -6.07); // muzzle ring + reference mirror
  b.set(DARK, MAT.void); b.cyl(0, gy, LEO.mz - 0.002, 0, gy, LEO.mz - 0.004, 0.062, 0.062, 12);
  return b.build();
}

// part matrices: 0 hull, 1 turret (yaw about the ring), 2 gun (pitch about the trunnion, recoil along the bore)
const T1 = new Float32Array(16), T2 = new Float32Array(16), T3 = new Float32Array(16), BM = new Float32Array(16), TM = new Float32Array(16), GM = new Float32Array(16);
export function tankParts(out, t, K) { // out: Float32Array(16*8), t: {x,y,z,yaw,pitch,roll,turYaw,gunPitch,recoil}
  trs(BM, t.x, t.y, t.z, t.yaw, t.pitch, t.roll);
  trs(T1, 0, K.ty, K.tz, t.turYaw, 0, 0); identity(T2); T2[13] = -K.ty; T2[14] = -K.tz; mul(T3, T1, T2); mul(TM, BM, T3);
  trs(T1, 0, K.gy, K.gz, 0, t.gunPitch, 0); identity(T2); T2[13] = -K.gy; T2[14] = -K.gz + t.recoil; mul(T3, T1, T2); mul(GM, TM, T3);
  out.set(BM, 0); out.set(TM, 16); out.set(GM, 32);
  return BM;
}
export const gunMat = () => GM;
