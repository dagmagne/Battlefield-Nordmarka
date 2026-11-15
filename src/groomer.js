// Procedural snow groomer model. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
import { MB, MAT } from './mesh.js';
import { trs, mul, identity } from './math.js';

export const TRK = { A: 1.75, R: 0.42, yc: 0.45, x: 1.45, w: 1.1 };
export const TILL_Z = 3.25, SWATH = 4.6;

export function buildGroomer() {
  const b = new MB();
  const RED = [0.62, 0.035, 0.03], DRED = [0.42, 0.025, 0.022], DARK = [0.035, 0.037, 0.04], STEEL = [0.32, 0.33, 0.35], GLASS = [0.02, 0.035, 0.05], YEL = [0.9, 0.55, 0.04];
  // --- tracks ---
  const { A, R, yc } = TRK, L = 4 * A + 2 * Math.PI * R;
  for (const side of [-1, 1]) {
    const cx = side * TRK.x, x0 = cx - TRK.w / 2, x1 = cx + TRK.w / 2;
    // belt bands (static stadium strips)
    b.part = 0; b.set(DARK, MAT.rubber);
    const N = 40, P = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N * L; let y, z, ny, nz;
      if (s < 2 * A) { y = yc - R; z = -A + s; ny = -1; nz = 0; }
      else if (s < 2 * A + Math.PI * R) { const t = (s - 2 * A) / R; y = yc - R * Math.cos(t); z = A + R * Math.sin(t); ny = -Math.cos(t); nz = Math.sin(t); }
      else if (s < 4 * A + Math.PI * R) { y = yc + R; z = A - (s - 2 * A - Math.PI * R); ny = 1; nz = 0; }
      else { const t = (s - 4 * A - Math.PI * R) / R; y = yc + R * Math.cos(t); z = -A - R * Math.sin(t); ny = Math.cos(t); nz = -Math.sin(t); }
      P.push([y, z, ny, nz, s]);
    }
    for (const [xa, xb] of [[x0 + 0.03, x1 - 0.03]]) for (let i = 0; i < N; i++) {
      const p = P[i], q = P[i + 1];
      const a = b.vert(xa, p[0], p[1], 0, p[2], p[3], 0, p[4]), c = b.vert(xb, p[0], p[1], 0, p[2], p[3], 1, p[4]), d = b.vert(xb, q[0], q[1], 0, q[2], q[3], 1, q[4]), e = b.vert(xa, q[0], q[1], 0, q[2], q[3], 0, q[4]);
      b.i.push(a, c, d, a, d, e);
    }
    // grouser bars (animated along the loop in the vertex shader): pos = (x, along, outward), uv = (s0, side)
    b.set([0.55, 0.57, 0.6], MAT.bar);
    const NBAR = 46;
    for (let k = 0; k < NBAR; k++) {
      const s0 = k / NBAR * L, hw = 0.028, ht = 0.075;
      const V = (x, al, out, nx, na, no) => { b.v.push(x, al, out, nx, na, no, 0.55, 0.57, 0.6, MAT.bar, s0, side, 0, 0); return b.v.length / 14 - 1; };
      const Q = (p, q, r, s2, n) => { const a = V(...p, ...n), c = V(...q, ...n), d = V(...r, ...n), e = V(...s2, ...n); b.i.push(a, c, d, a, d, e); };
      Q([x0, -hw, 0], [x1, -hw, 0], [x1, -hw * 0.5, ht], [x0, -hw * 0.5, ht], [0, -1, 0.3]);
      Q([x1, hw, 0], [x0, hw, 0], [x0, hw * 0.5, ht], [x1, hw * 0.5, ht], [0, 1, 0.3]);
      Q([x0, -hw * 0.5, ht], [x1, -hw * 0.5, ht], [x1, hw * 0.5, ht], [x0, hw * 0.5, ht], [0, 0, 1]);
      Q([x0, -hw, 0], [x0, -hw * 0.5, ht], [x0, hw * 0.5, ht], [x0, hw, 0], [-1, 0, 0]);
      Q([x1, hw, 0], [x1, hw * 0.5, ht], [x1, -hw * 0.5, ht], [x1, -hw, 0], [1, 0, 0]);
    }
    // wheels
    b.set(DARK, MAT.wheel);
    for (let k = 0; k < 5; k++) { const z = -A + k * (2 * A / 4); b.cyl(cx - 0.2, yc - (k === 0 || k === 4 ? 0 : 0.04), z, cx + 0.2, yc - (k === 0 || k === 4 ? 0 : 0.04), z, R - 0.05, R - 0.05, 14); }
    b.set(STEEL, MAT.metal); b.box(cx - 0.08, yc - 0.1, -A, cx + 0.08, yc + 0.08, A);
    // fender
    b.set(RED, MAT.paint); b.box(x0 - 0.02, yc + R + 0.12, -A - 0.25, x1 + 0.03, yc + R + 0.17, A + 0.3);
  }
  // --- chassis + body ---
  const WHT = [0.82, 0.82, 0.8], CHROME = [0.6, 0.62, 0.65];
  b.set(DARK, MAT.metal); b.box(-0.92, 0.36, -2.15, 0.92, 1.0, 2.2);
  b.box(-1.25, 0.2, -2.3, 1.25, 0.5, -2.12); // front hitch plate
  // engine deck with sloped rear, side grilles, top fan grille
  b.set(RED, MAT.paint);
  b.box(-1.12, 1.0, -0.2, 1.12, 1.58, 2.3, 0.07, 0, 0.42);
  b.box(-0.7, 1.58, 0.15, 0.7, 1.66, 1.55, 0.05, 0.05);
  b.set(DARK, MAT.metal);
  b.box(-0.5, 1.66, 0.35, 0.5, 1.675, 1.35);
  for (const sx of [-1, 1]) { for (let k = 0; k < 6; k++) b.box(sx * 1.1 - 0.02, 1.12 + k * 0.06, 0.35, sx * 1.1 + 0.02, 1.15 + k * 0.06, 1.55); }
  b.set(WHT, MAT.paint); for (const sx of [-1, 1]) b.box(sx * 1.125 - 0.01, 1.0, -0.2, sx * 1.125 + 0.01, 1.07, 2.2);
  // tail lights + rear deck rail
  for (const sx of [-1, 1]) { b.set([1, 0.05, 0.02], MAT.head); b.quad([sx * 0.95 + 0.1, 1.12, 2.305], [sx * 0.95 - 0.1, 1.12, 2.305], [sx * 0.95 - 0.1, 1.2, 2.305], [sx * 0.95 + 0.1, 1.2, 2.305]); }
  b.set(CHROME, MAT.metal);
  for (const sx of [-1, 1]) { b.cyl(sx * 1.0, 1.6, 1.95, sx * 1.0, 1.95, 1.95, 0.02, 0.02, 6); b.cyl(sx * 1.0, 1.6, 0.0, sx * 1.0, 1.95, 0.0, 0.02, 0.02, 6); b.cyl(sx * 1.0, 1.95, 0.0, sx * 1.0, 1.95, 1.95, 0.02, 0.02, 6); }
  // cab: red lower shell, tinted glass with raked windshield, roof
  b.set(RED, MAT.paint);
  b.box(-1.12, 1.0, -2.5, 1.12, 1.52, -0.2, 0.02, 0.0, 0);
  b.box(-1.0, 0.72, -2.52, 1.0, 1.02, -2.2);
  b.set(WHT, MAT.paint); b.box(-1.13, 1.44, -2.505, 1.13, 1.5, -0.2);
  b.set([0.03, 0.05, 0.075], MAT.glass); b.box(-1.07, 1.52, -2.44, 1.07, 2.44, -0.26, 0.09, 0.34, 0.04);
  b.set(RED, MAT.paint);
  b.box(-1.03, 2.44, -2.2, 1.03, 2.5, -0.18, 0.0, 0.0); b.box(-0.99, 2.5, -2.12, 0.99, 2.56, -0.24, 0.06, 0.08);
  for (const sx of [-1, 1]) { // A, B, C pillars following the glass taper
    const P = (z0, z1, zt0, zt1) => b.quad([sx * 1.085, 1.52, z0], [sx * 1.085, 1.52, z1], [sx * 0.995, 2.45, zt1], [sx * 0.995, 2.45, zt0]);
    P(-2.46, -2.36, -2.12, -2.02); P(-1.42, -1.34, -1.34, -1.26); P(-0.36, -0.24, -0.34, -0.22);
    b.quad([sx * 1.085, 1.52, -2.455], [sx * 0.94, 1.52, -2.455], [sx * 0.86, 2.45, -2.115], [sx * 0.995, 2.45, -2.115]);
    // door handle, step, mirror
    b.set(DARK, MAT.metal); b.box(sx * 1.13 - 0.015, 1.3, -1.25, sx * 1.13 + 0.015, 1.34, -1.05);
    b.box(sx * 1.14 - 0.12, 0.98, -1.9, sx * 1.14 + 0.12, 1.02, -1.0);
    b.cyl(sx * 1.08, 2.0, -2.3, sx * 1.42, 1.95, -2.42, 0.018, 0.018, 5); b.box(sx * 1.42 - 0.035, 1.72, -2.47, sx * 1.42 + 0.035, 2.08, -2.4);
    b.set([1, 0.45, 0.05], MAT.head); b.quad([sx * 1.126, 1.2, -2.3], [sx * 1.126, 1.2, -2.18], [sx * 1.126, 1.27, -2.18], [sx * 1.126, 1.27, -2.3]);
    b.set(RED, MAT.paint);
  }
  // wipers
  b.set(DARK, MAT.metal); for (const x of [-0.45, 0.45]) b.quad([x - 0.012, 1.56, -2.452], [x + 0.012, 1.56, -2.452], [x + 0.25, 2.1, -2.255], [x + 0.226, 2.1, -2.255]);
  // roof light bar + work lights
  b.set(DARK, MAT.metal); b.box(-0.95, 2.56, -2.1, 0.95, 2.6, -2.02);
  for (const x of [-0.8, -0.48, 0.48, 0.8]) { b.set(DARK, MAT.metal); b.box(x - 0.11, 2.6, -2.12, x + 0.11, 2.77, -2.0, 0.01, 0); b.set([1, 0.96, 0.85], MAT.head); b.quad([x - 0.09, 2.62, -2.121], [x + 0.09, 2.62, -2.121], [x + 0.09, 2.75, -2.121], [x - 0.09, 2.75, -2.121]); }
  for (const x of [-0.7, 0.7]) { b.set(DARK, MAT.metal); b.box(x - 0.1, 2.56, -0.36, x + 0.1, 2.72, -0.24); b.set([1, 0.96, 0.85], MAT.head); b.quad([x + 0.08, 2.58, -0.239], [x - 0.08, 2.58, -0.239], [x - 0.08, 2.7, -0.239], [x + 0.08, 2.7, -0.239]); }
  for (const x of [-0.78, 0.78]) { b.set(DARK, MAT.metal); b.box(x - 0.17, 1.14, -2.515, x + 0.17, 1.4, -2.49); b.set([1, 0.96, 0.85], MAT.head); b.quad([x - 0.14, 1.17, -2.516], [x + 0.14, 1.17, -2.516], [x + 0.14, 1.37, -2.516], [x - 0.14, 1.37, -2.516]); }
  // beacon
  b.set(DARK, MAT.metal); b.cyl(0.6, 2.56, -1.1, 0.6, 2.62, -1.1, 0.09, 0.09, 10);
  b.set([1, 0.42, 0.03], MAT.beacon); b.cyl(0.6, 2.62, -1.1, 0.6, 2.8, -1.1, 0.075, 0.06, 10);
  // exhaust stack with heat shield
  b.set(CHROME, MAT.metal); b.cyl(0.98, 1.6, -0.08, 0.98, 2.95, -0.08, 0.05, 0.05, 8); b.cyl(0.98, 2.95, -0.08, 0.98, 3.08, 0.0, 0.055, 0.06, 8);
  b.set(DARK, MAT.metal); b.cyl(0.98, 1.75, -0.08, 0.98, 2.5, -0.08, 0.075, 0.075, 8);
  // antenna
  b.cyl(-0.85, 2.56, -0.5, -0.85, 3.5, -0.42, 0.008, 0.004, 4);
  // --- front blade (part 1) ---
  b.part = 1;
  b.set(DARK, MAT.metal);
  for (const sx of [-1, 1]) b.cyl(sx * 0.6, 0.75, -2.1, sx * 0.75, 0.55, -3.25, 0.07, 0.07, 6);
  b.set([0.6, 0.62, 0.65], MAT.metal); b.cyl(0, 1.2, -2.45, 0, 0.9, -3.2, 0.035, 0.035, 6); for (const sx of [-1, 1]) b.cyl(sx * 0.9, 0.9, -2.3, sx * 1.5, 0.7, -3.25, 0.03, 0.03, 6);
  b.set(DARK, MAT.metal); b.cyl(0, 1.2, -2.3, 0, 1.08, -2.75, 0.055, 0.055, 6);
  b.box(-1.6, 0.35, -3.35, 1.6, 0.85, -3.22);
  for (let k = -4; k <= 4; k++) b.box(k * 0.5 - 0.03, 0.2, -3.42, k * 0.5 + 0.03, 1.0, -3.33);
  b.set(RED, MAT.paint);
  { const W2 = 2.25, seg = 6, prof = [];
    for (let i = 0; i <= seg; i++) { const t = i / seg, a = -0.5 + t * 1.5; prof.push([0.08 + t * 1.0, -3.42 - Math.sin(a) * 0.16 - 0.1 + t * 0.03]); }
    for (let i = 0; i < seg; i++) { const p = prof[i], q = prof[i + 1];
      b.quad([-W2, p[0], p[1]], [-W2, q[0], q[1]], [W2, q[0], q[1]], [W2, p[0], p[1]]);
      b.quad([W2, p[0], p[1] + 0.05], [W2, q[0], q[1] + 0.05], [-W2, q[0], q[1] + 0.05], [-W2, p[0], p[1] + 0.05]);
      for (const sx of [-1, 1]) { // side wings angled forward
        const xo = sx * W2, xw = sx * (W2 + 0.28);
        b.quad([xo, p[0], p[1]], [xo, q[0], q[1]], [xw, q[0], q[1] - 0.55], [xw, p[0], p[1] - 0.55]);
        b.quad([xw, p[0], p[1] - 0.52], [xw, q[0], q[1] - 0.52], [xo, q[0], q[1] + 0.05], [xo, p[0], p[1] + 0.05]);
      } }
    b.set(STEEL, MAT.metal); b.box(-W2 - 0.02, 0.02, -3.4, W2 + 0.02, 0.12, -3.3);
    // snow rolling ahead of the blade
    b.set([1, 1, 1], MAT.snow); b.blob(-0.9, 0.1, -3.75, 1.5, 0.4, 0.5, 3, 0.1, 14); b.blob(0.9, 0.08, -3.78, 1.5, 0.34, 0.48, 5, 0.1, 14); b.blob(0, 0.08, -3.7, 2.1, 0.28, 0.42, 8, 0.08, 14); }
  // --- rear tiller + finisher (part 2) ---
  b.part = 2;
  b.set(DARK, MAT.metal);
  for (const sx of [-1, 1]) b.cyl(sx * 0.55, 0.85, 2.1, sx * 0.7, 0.62, 2.95, 0.07, 0.07, 6);
  b.cyl(0, 1.35, 2.2, 0, 0.75, 3.0, 0.05, 0.05, 6);
  b.box(-2.0, 0.55, 2.9, 2.0, 0.72, 3.1);
  b.set(RED, MAT.paint);
  { const W2 = SWATH / 2, seg = 6; // tiller housing: half drum
    for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI;
      const p = [0.2 + Math.sin(a0) * 0.36, 3.2 - Math.cos(a0) * 0.36], q = [0.2 + Math.sin(a1) * 0.36, 3.2 - Math.cos(a1) * 0.36];
      b.quad([-W2, p[0], p[1]], [-W2, q[0], q[1]], [W2, q[0], q[1]], [W2, p[0], p[1]]); }
    for (const sx of [-1, 1]) b.box(sx * W2 - 0.03, 0.05, 2.84, sx * W2 + 0.03, 0.58, 3.58);
    // finisher mat: flexible comb trailing on the snow
    b.set([0.08, 0.08, 0.085], MAT.finisher);
    const fp = [[0.2, 3.56], [0.1, 3.75], [0.045, 3.95], [0.03, 4.12]];
    for (let i = 0; i < 3; i++) { const p = fp[i], q = fp[i + 1];
      b.quad([-W2, p[0], p[1]], [-W2, q[0], q[1]], [W2, q[0], q[1]], [W2, p[0], p[1]], [0, p[1], 0, q[1], 1, q[1], 1, p[1]]); }
    b.set(YEL, MAT.paint); b.box(-W2, 0.2, 3.5, W2, 0.26, 3.6);
  }
  // --- track setters (parts 3, 4) ---
  for (const sx of [-1, 1]) {
    b.part = sx < 0 ? 3 : 4; const x = sx * 1.55;
    b.set(DARK, MAT.metal); b.cyl(x, 0.5, 3.55, x, 0.22, 4.25, 0.045, 0.045, 6); b.box(x - 0.3, 0.2, 4.2, x + 0.3, 0.26, 4.3);
    b.set(YEL, MAT.paint); b.box(x - 0.3, 0.02, 4.05, x + 0.3, 0.2, 4.75, 0, 0.12, 0.02);
    b.set(STEEL, MAT.metal); for (const o of [-0.12, 0.12]) b.box(x + o - 0.035, -0.045, 4.12, x + o + 0.035, 0.03, 4.72, 0, 0.1, 0);
  }
  return b.build();
}

// part matrices: 0 body, 1 blade, 2 tiller, 3/4 track setters
const T1 = new Float32Array(16), T2 = new Float32Array(16), T3 = new Float32Array(16);
function pivot(out, body, px, py, pz, ang, dy) {
  trs(T1, px, py + dy, pz, 0, ang, 0); identity(T2); T2[12] = -px; T2[13] = -py; T2[14] = -pz;
  mul(T3, T1, T2); mul(out, body, T3);
}
const BM = new Float32Array(16), TM = new Float32Array(16);
export function groomerParts(out, veh) { // out: Float32Array(16*8)
  trs(BM, veh.x, veh.y, veh.z, veh.yaw, veh.pitch, veh.roll);
  out.set(BM, 0);
  pivot(TM, BM, 0, 0.8, -2.1, -0.1 * (1 - veh.bladePos), 0); out.set(TM, 16);
  pivot(TM, BM, 0, 0.85, 2.1, -0.22 * (1 - veh.tillPos), 0); out.set(TM, 32);
  const up = 1 - veh.setPos * veh.tillPos;
  trs(T1, 0, 0.5, 3.55, 0, -0.5 * up, 0); identity(T2); T2[12] = 0; T2[13] = -0.5; T2[14] = -3.55;
  mul(S1, T1, T2); mul(S2, TM, S1);
  out.set(S2, 48); out.set(S2, 64);
  return BM;
}
const S1 = new Float32Array(16), S2 = new Float32Array(16);
