// Procedural snow groomer model. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
import { MB, MAT } from './mesh.js';
import { trs, mul, identity } from './math.js';

export const TRK = { A: 1.75, R: 0.42, yc: 0.45, x: 1.45, w: 1.1 };
export const TILL_Z = 4.0, SWATH = 4.6;

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
    for (const [xa, xb] of [[x0 + 0.06, x0 + 0.3], [cx - 0.12, cx + 0.12], [x1 - 0.3, x1 - 0.06]]) for (let i = 0; i < N; i++) {
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
  b.set(DARK, MAT.metal); b.box(-0.9, 0.4, -2.1, 0.9, 1.0, 2.15);
  b.set(RED, MAT.paint);
  b.box(-1.12, 1.0, -0.25, 1.12, 1.62, 2.25, 0.06, 0, 0.35); // engine deck
  b.set(DARK, MAT.metal); b.box(-0.8, 1.62, 0.1, 0.8, 1.68, 1.7); // grille top
  b.box(-1.0, 1.05, 2.26, 1.0, 1.5, 2.3);
  // cab
  b.set(RED, MAT.paint); b.box(-1.1, 1.0, -2.35, 1.1, 1.55, -0.25, 0, 0.08, 0);
  b.set(GLASS, MAT.glass); b.box(-1.06, 1.55, -2.24, 1.06, 2.42, -0.3, 0.07, 0.22, 0.04);
  b.set(RED, MAT.paint); b.box(-1.08, 2.42, -2.1, 1.08, 2.56, -0.2, 0.05, 0.05, 0.02);
  for (const sx of [-1, 1]) { // pillars
    b.box(sx * 1.07 - 0.04, 1.55, -0.36, sx * 1.07 + 0.04, 2.44, -0.26, sx > 0 ? 0 : 0.07, 0, 0);
    b.quad([sx * 1.075, 1.55, -2.28], [sx * 1.075, 1.55, -2.2], [sx * 1.005, 2.43, -1.98], [sx * 1.005, 2.43, -2.06]);
    b.quad([sx * 1.085, 1.55, -1.3], [sx * 1.085, 1.55, -1.22], [sx * 1.012, 2.43, -1.22], [sx * 1.012, 2.43, -1.3]);
    // mirrors
    b.set(DARK, MAT.metal); b.box(sx * 1.1 - 0.02, 1.9, -2.2, sx * 1.42 + 0.02, 1.93, -2.17); b.box(sx * 1.4 - 0.03, 1.7, -2.24, sx * 1.4 + 0.03, 2.05, -2.16);
    b.set(RED, MAT.paint);
  }
  // roof light bar + work lights
  b.set(DARK, MAT.metal); b.box(-0.95, 2.56, -2.08, 0.95, 2.6, -2.0);
  for (const x of [-0.8, -0.45, 0.45, 0.8]) { b.set(DARK, MAT.metal); b.box(x - 0.11, 2.6, -2.1, x + 0.11, 2.78, -1.98); b.set([1, 0.96, 0.85], MAT.head); b.quad([x - 0.09, 2.62, -2.101], [x + 0.09, 2.62, -2.101], [x + 0.09, 2.76, -2.101], [x - 0.09, 2.76, -2.101]); }
  for (const x of [-0.7, 0.7]) { b.set(DARK, MAT.metal); b.box(x - 0.1, 2.56, -0.36, x + 0.1, 2.72, -0.24); b.set([1, 0.96, 0.85], MAT.head); b.quad([x + 0.08, 2.58, -0.239], [x - 0.08, 2.58, -0.239], [x - 0.08, 2.7, -0.239], [x + 0.08, 2.7, -0.239]); }
  for (const x of [-0.75, 0.75]) { b.set([1, 0.96, 0.85], MAT.head); b.quad([x - 0.13, 1.2, -2.351], [x + 0.13, 1.2, -2.351], [x + 0.13, 1.38, -2.351], [x - 0.13, 1.38, -2.351]); }
  // beacon
  b.set(DARK, MAT.metal); b.cyl(0.6, 2.56, -1.1, 0.6, 2.62, -1.1, 0.09, 0.09, 10);
  b.set([1, 0.42, 0.03], MAT.beacon); b.cyl(0.6, 2.62, -1.1, 0.6, 2.8, -1.1, 0.075, 0.06, 10);
  // exhaust
  b.set(STEEL, MAT.metal); b.cyl(0.98, 1.6, -0.12, 0.98, 2.95, -0.12, 0.055, 0.055, 8); b.cyl(0.98, 2.95, -0.12, 0.98, 3.05, -0.05, 0.06, 0.06, 8);
  // --- front blade (part 1) ---
  b.part = 1;
  b.set(DARK, MAT.metal);
  for (const sx of [-1, 1]) b.cyl(sx * 0.6, 0.75, -2.1, sx * 0.75, 0.55, -3.25, 0.07, 0.07, 6);
  b.cyl(0, 1.2, -2.3, 0, 0.9, -3.2, 0.05, 0.05, 6);
  b.box(-1.6, 0.35, -3.35, 1.6, 0.85, -3.22);
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
    b.set(STEEL, MAT.metal); b.box(-W2 - 0.02, 0.02, -3.4, W2 + 0.02, 0.12, -3.3); }
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
