// Tigr-M and BTR-82A, and the tyre shared by the wheeled vehicles. Local frame as in tank.js: x right, y up, forward = -z.
import { MB, MAT } from './mesh.js';
import { poly, extX, extY, mirror } from './vehutil.js';
// ---------- light and wheeled vehicles (phase 4): parts 0 hull, 1 mount, 2 weapon, 3.. one per axle (both wheels turn with it) ----------
// K adds: bx/bz hull half-extents for hits, cr collision circle radius and spacing cs, wr wheel radius, ax axle z positions
// A wheel on an axle across x at (x, y, z): radius r, width w, the outer face on the side of sign(x). It is drawn through b.vert,
// so a b.at() set by the caller places it (a spare wheel). Optional o: { nuts: wheel nuts (default 6 when r > 0.35, 0 = none),
// lugs: tread blocks per side (0 = slick), ctis: 1 = a tyre-inflation pipe from the hub, seg: segments round }.
export const tyre = (b, x, y, z, r, w, part, rim, o) => {
  o = o || {}; b.part = part; const sx = Math.sign(x) || 1, n = o.seg || (r > 0.42 ? 18 : 14), h = w / 2, TAU = Math.PI * 2;
  const lathe = (P, c, mat) => { // profile [offset along the axle in half widths (+ = outer face), radius in r], from the inner face over the top to the outer one
    b.set(c, mat); const m = P.length, N = [];
    for (let k = 0; k < m - 1; k++) { const du = (P[k + 1][0] - P[k][0]) * h, dr = (P[k + 1][1] - P[k][1]) * r, l = Math.hypot(du, dr) || 1; N.push([-dr / l, du / l]); }
    const sm = (a, c2) => { if (!a || a[0] * c2[0] + a[1] * c2[1] < 0.55) return c2; const l = Math.hypot(a[0] + c2[0], a[1] + c2[1]); return [(a[0] + c2[0]) / l, (a[1] + c2[1]) / l]; };
    for (let k = 0; k < m - 1; k++) {
      const n0 = sm(N[k - 1], N[k]), n1 = sm(N[k + 1], N[k]), base = b.v.length / 14;
      for (let i = 0; i <= n; i++) { const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
        b.vert(x + sx * P[k][0] * h, y + ca * P[k][1] * r, z + sa * P[k][1] * r, sx * n0[0], ca * n0[1], sa * n0[1], i / n, 0);
        b.vert(x + sx * P[k + 1][0] * h, y + ca * P[k + 1][1] * r, z + sa * P[k + 1][1] * r, sx * n1[0], ca * n1[1], sa * n1[1], i / n, 1); }
      for (let i = 0; i < n; i++) { const q = base + i * 2; if (sx > 0) b.i.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); else b.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
  };
  const RB = [0.035, 0.035, 0.038];
  lathe([[-0.5, 0.001], [-0.5, 0.56], [-0.72, 0.6]], [0.03, 0.031, 0.034], MAT.metal); // back of the rim, brake drum
  lathe([[-0.72, 0.6], [-0.99, 0.72], [-0.98, 0.87], [-0.84, 0.95], [-0.6, 0.972], [0.6, 0.972], [0.84, 0.95], [0.98, 0.87], [0.99, 0.72], [0.8, 0.615]], RB, MAT.rubber); // carcass with bulged sidewalls
  lathe([[0.8, 0.615], [0.88, 0.6], [0.86, 0.565], [0.55, 0.54], [0.32, 0.5], [0.4, 0.27], [0.6, 0.2], [0.64, 0.001]], rim, MAT.metal); // flange, well, dished disc, hub face
  const P3 = (u, q, a) => [x + sx * u * h, y + Math.cos(a) * q * r, z + Math.sin(a) * q * r];
  const nl = o.lugs === undefined ? Math.max(10, Math.round(r * 30)) : o.lugs; b.set(RB, MAT.rubber);
  if (nl) { const st = TAU / nl, ha = st * 0.21, ST = [[0.07, 1, 0.95, 0], [0.72, 1, 0.95, 0.24], [0.99, 0.905, 0.86, 0.42]]; // chevron lugs that wrap over the shoulder
    for (const sd of [-1, 1]) for (let k = 0; k < nl; k++) { const a0 = (k + (sd > 0 ? 0.5 : 0)) * st, c = P3(sd * 0.5, 0.8, a0 + 0.2 * st);
      const T = (j, e) => P3(sd * ST[j][0], ST[j][1], a0 + ST[j][3] * st + e * ha), B = (j, e) => P3(sd * ST[j][0], ST[j][2], a0 + ST[j][3] * st + e * ha);
      for (let j = 0; j < 2; j++) { poly(b, [T(j, -1), T(j, 1), T(j + 1, 1), T(j + 1, -1)], c); for (const e of [-1, 1]) poly(b, [B(j, e), T(j, e), T(j + 1, e), B(j + 1, e)], c); }
      poly(b, [B(0, -1), B(0, 1), T(0, 1), T(0, -1)], c); } }
  const k = r / 0.48, nn = o.nuts === undefined ? (r > 0.35 ? 6 : 0) : o.nuts, uh = x + sx * 0.6 * h;
  b.set([0.05, 0.05, 0.05], MAT.metal); b.cyl(uh, y, z, uh + sx * 0.07 * k, y, z, 0.15 * r, 0.1 * r, 8); // hub cap
  for (let i = 0; i < nn; i++) { const a = (i + 0.5) / nn * TAU, p = P3(0.34, 0.36, a); b.cyl(p[0], p[1], p[2], p[0] + sx * 0.05 * k, p[1], p[2], 0.022 * k, 0.018 * k, 4); }
  if (o.ctis) { const p = P3(0.6, 0.1, 0.4), q = P3(0.82, 0.585, 0.4); b.cyl(p[0] + sx * 0.03 * k, p[1], p[2], q[0], q[1], q[2], 0.012 * k, 0.012 * k, 4); }
  b.part = 0;
};
// ---- panel helpers for the Tigr: a local frame laid on a body panel (z = out of the panel, y = up the panel, x = y cross z) ----
const onPlane = (b, p, N) => {
  const l = Math.hypot(N[0], N[1], N[2]), nx = N[0] / l, ny = N[1] / l, nz = N[2] / l;
  let vx = -ny * nx, vy = 1 - ny * ny, vz = -ny * nz; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
  const m = b.m; m[0] = vy * nz - vz * ny; m[1] = vz * nx - vx * nz; m[2] = vx * ny - vy * nx; m[3] = 0; m[4] = vx; m[5] = vy; m[6] = vz; m[7] = 0; m[8] = nx; m[9] = ny; m[10] = nz; m[11] = 0; m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
};
const inset = (P, d) => { // a convex polygon moved in by d (out when negative), mitred corners
  let A = 0; const n = P.length, L = []; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
  const s = A > 0 ? 1 : -1; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey); L.push([-ey / l * s, ex / l * s]); }
  return P.map((p, i) => { const a = L[(i + n - 1) % n], c = L[i], k = d / (1 + a[0] * c[0] + a[1] * c[1]); return [p[0] + (a[0] + c[0]) * k, p[1] + (a[1] + c[1]) * k]; });
};
const cen = (P) => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
const plate = (b, P, z0, z1) => { // a raised panel: top face and edge walls (no bottom, so nothing lies in the panel it sits on)
  const c = cen(P), n = P.length; poly(b, P.map((p) => [p[0], p[1], z1]), [c[0], c[1], z0 - 1]);
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; poly(b, [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], [c[0], c[1], (z0 + z1) / 2]); }
};
const frame = (b, P, fw, z0, z1) => { // a frame of width fw inside the outline P; returns its inner outline
  const I = inset(P, fw), c = cen(P), n = P.length, zm = (z0 + z1) / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, p = P[i], q = P[j], pi = I[i], qi = I[j];
    poly(b, [[p[0], p[1], z1], [q[0], q[1], z1], [qi[0], qi[1], z1], [pi[0], pi[1], z1]], [c[0], c[1], z0 - 1]);
    poly(b, [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], [c[0], c[1], zm]);
    poly(b, [[pi[0], pi[1], z0], [qi[0], qi[1], z0], [qi[0], qi[1], z1], [pi[0], pi[1], z1]], [pi[0] + qi[0] - c[0], pi[1] + qi[1] - c[1], zm]); }
  return I;
};
const loft = (b, R, cap0 = 1, cap1 = 1) => { // rings of points joined by flat faces
  let cx = 0, cy = 0, cz = 0, n = 0; for (const r of R) for (const p of r) { cx += p[0]; cy += p[1]; cz += p[2]; n++; } const c = [cx / n, cy / n, cz / n];
  for (let k = 0; k < R.length - 1; k++) { const A = R[k], B = R[k + 1], m = A.length; for (let i = 0; i < m; i++) { const j = (i + 1) % m; poly(b, [A[i], A[j], B[j], B[i]], c); } }
  if (cap0) poly(b, R[0], c); if (cap1) poly(b, R[R.length - 1], c);
};
export const TIGR = { ty: 2.1, tz: 0.35, gy: 2.42, gz: 0.35, mz: -1.0, hl: 2.4, hw: 1.0, rad: 2.2, hh: 2.1, th: 2.75, tr: 0.45, bx: 1.2, bz: 2.85, cr: 1.35, cs: 1.4, wr: 0.48, ax: [-1.72, 1.95] };
// GAZ-2330 Tigr-M with a twin Kornet launcher on the roof ring. The body is a tub between the wheel wells, sills and corners outside
// them, a stepped bonnet, and a cab with tumblehome; doors, frames and fittings are laid on its panels (never in a panel's own plane).
export function buildTigr() {
  const b = new MB(), G = [0.06, 0.075, 0.045], GD = [0.045, 0.056, 0.034], DK = [0.03, 0.031, 0.034], BK = [0.012, 0.012, 0.013], GL = [0.025, 0.04, 0.038], AMB = [0.75, 0.33, 0.04];
  const ww = (k) => [G[0] + (0.34 - G[0]) * k, G[1] + (0.36 - G[1]) * k, G[2] + (0.35 - G[2]) * k]; // worn whitewash over the green
  const ZN = -2.86, ZC = -1.0, ZR = 2.66, XS = 1.12, YB = 1.48, XW = 0.72, RIM = [0.05, 0.062, 0.04];
  const win = (P, z0) => { b.set(GD, MAT.rus); frame(b, P, 0.045, z0, z0 + 0.04); const c = cen(P); b.set(GL, MAT.glass); poly(b, inset(P, 0.03).map((p) => [p[0], p[1], z0 + 0.012]), [c[0], c[1], -1]); }; // armoured glass in a thick frame
  b.part = 0;
  // ---- chassis and running gear under the body ----
  b.set(DK, MAT.metal); for (const sx of [-1, 1]) b.box(sx * 0.36 - 0.06, 0.42, -2.7, sx * 0.36 + 0.06, 0.61, 2.6); // frame rails
  b.cyl(0, 0.47, TIGR.ax[0], 0, 0.47, TIGR.ax[1], 0.04, 0.04, 6, 0); b.box(-0.2, 0.36, -0.2, 0.2, 0.61, 0.35); // prop shaft, transfer case
  b.box(-1.06, 0.42, 0.05, -0.76, 0.63, 1.0); // fuel tank under the left sill
  b.cyl(0.9, 0.52, 0.0, 0.9, 0.52, 0.8, 0.085, 0.085, 8); b.cyl(0.9, 0.52, 0.78, 1.15, 0.5, 1.12, 0.032, 0.032, 6); // silencer and tail pipe
  for (const zc of TIGR.ax) { b.cyl(0, 0.46, zc - 0.17, 0, 0.46, zc + 0.17, 0.15, 0.13, 8); // differential
    for (const sx of [-1, 1]) { b.cyl(sx * 0.12, 0.46, zc, sx * 0.8, 0.48, zc, 0.035, 0.035, 6, 0); b.cyl(sx * 0.74, 0.48, zc, sx * 0.9, 0.48, zc, 0.17, 0.17, 10); // half shaft, hub reduction
      for (const e of [-1, 1]) b.cyl(sx * 0.36, 0.44, zc + e * 0.28, sx * 0.8, 0.3, zc + e * 0.06, 0.028, 0.028, 5, 0); // lower wishbone
      b.cyl(sx * 0.77, 0.36, zc + 0.21, sx * 0.76, 1.06, zc + 0.21, 0.04, 0.04, 6, 0); } } // damper
  // ---- body ----
  b.set(GD, MAT.rus); extX(b, [[0.6, -2.45], [0.76, ZN], [1.1, ZN], [1.1, ZR], [0.7, ZR], [0.6, 2.5]], -XW, XW); // tub between the wheel wells
  b.set(G, MAT.rus);
  for (const sx of [-1, 1]) { const x0 = sx > 0 ? XW : -XS, x1 = sx > 0 ? XS : -XW; // sills and corners outside the wells; their ends are the well walls
    extX(b, [[0.8, ZN], [0.62, -2.3], [0.85, -2.3], [1.1, -2.06], [1.1, ZN]], x0, x1);
    extX(b, [[0.62, -1.14], [0.62, 1.37], [0.85, 1.37], [1.1, 1.61], [1.1, -1.38], [0.85, -1.14]], x0, x1);
    extX(b, [[0.62, 2.53], [0.7, ZR], [1.1, ZR], [1.1, 2.29], [0.85, 2.53]], x0, x1); }
  const fr = (z, f) => [[-XS, 1.1, z], [-XS, f - 0.1, z], [-1.03, f, z], [1.03, f, z], [XS, f - 0.1, z], [XS, 1.1, z]];
  loft(b, [fr(ZN, 1.25), fr(-2.74, 1.32), fr(ZC, 1.41)], 1, 0); // wings with a chamfered outer edge
  const hr = (z, f, h) => [[-0.67, f - 0.03, z], [-0.6, h, z], [0.6, h, z], [0.67, f - 0.03, z]];
  b.set(ww(0.1), MAT.rus); loft(b, [hr(ZN - 0.015, 1.25, 1.31), hr(-2.74, 1.32, 1.385), hr(ZC, 1.41, 1.47)], 1, 0); // raised bonnet
  b.set(G, MAT.rus); b.box(-XS, 1.1, ZC, XS, YB, ZR); // cab below the belt line
  const cr = (y, x, z0, z1) => [[-x, y, z0], [x, y, z0], [x, y, z1], [-x, y, z1]];
  loft(b, [cr(YB, XS, ZC, ZR), cr(2.04, 1.0, -0.75, ZR - 0.06), cr(2.1, 0.93, -0.69, ZR - 0.12)], 0, 1); // cab above it: raked screen, tumblehome, chamfered roof edge
  // ---- wheel wells, arch flares, mud flaps ----
  for (const zc of TIGR.ax) for (const sx of [-1, 1]) {
    b.set(BK, MAT.metal); poly(b, [[sx * 0.727, 0.6, zc - 0.57], [sx * 0.727, 0.6, zc + 0.57], [sx * 0.727, 1.095, zc + 0.57], [sx * 0.727, 1.095, zc - 0.57]], [0, 0.8, zc]);
    const A = [[-0.58, 0.62], [-0.58, 0.85], [-0.34, 1.1], [0.34, 1.1], [0.58, 0.85], [0.58, 0.62]], O1 = inset(A, -0.035), O2 = inset(A, -0.11), X0 = sx * 1.115, X1 = sx * 1.205;
    O1[0][1] = O1[5][1] = O2[0][1] = O2[5][1] = 0.62; b.set(GD, MAT.rus);
    const W = (X, p) => [X, p[1], zc + p[0]];
    for (let i = 0; i < 5; i++) { const p = A[i], q = A[i + 1], my = (p[1] + q[1]) / 2, mz = zc + (p[0] + q[0]) / 2;
      poly(b, [W(X0, p), W(X0, q), W(X1, q), W(X1, p)], [sx * 1.16, 2 * my - 0.48, 2 * mz - zc]);
      poly(b, [W(X1, p), W(X1, q), W(X1, O1[i + 1]), W(X1, O1[i])], [0, my, mz]);
      poly(b, [W(X1, O1[i]), W(X1, O1[i + 1]), W(X0, O2[i + 1]), W(X0, O2[i])], [sx, 0.48, zc]); }
    for (const i of [0, 5]) poly(b, [W(X0, A[i]), W(X1, A[i]), W(X1, O1[i]), W(X0, O2[i])], [sx * 1.16, 1, zc + A[i][0] * 1.1]);
    b.set(BK, MAT.rubber); b.box(sx * 0.96 - 0.22, 0.28, zc + 0.6, sx * 0.96 + 0.22, 0.66, zc + 0.625);
  }
  // ---- nose: grille between the headlamp housings, bumper with winch and tow eyes ----
  onPlane(b, [0, 0, ZN], [0, 0, -1]);
  b.set(GD, MAT.rus); const GI = frame(b, [[-0.4, 0.88], [0.4, 0.88], [0.4, 1.2], [-0.4, 1.2]], 0.035, 0, 0.045);
  b.set(BK, MAT.void); poly(b, GI.map((p) => [p[0], p[1], 0.005]), [0, 1, -1]);
  b.set(GD, MAT.rus); for (let k = -4; k <= 4; k++) b.box(k * 0.074 - 0.014, GI[0][1], -0.01, k * 0.074 + 0.014, GI[2][1], 0.036); // vertical slats
  for (const s of [-1, 1]) { b.set(GD, MAT.rus); const H = frame(b, [[s * 0.46, 0.92], [s * 1.0, 0.92], [s * 1.0, 1.19], [s * 0.46, 1.19]], 0.03, 0, 0.045);
    b.set(BK, MAT.paint); poly(b, H.map((p) => [p[0], p[1], 0.005]), [0, 1, -1]);
    b.set([0.2, 0.2, 0.2], MAT.metal); b.cyl(s * 0.67, 1.055, -0.01, s * 0.67, 1.055, 0.04, 0.1, 0.095, 12);
    b.set([1, 0.95, 0.82], MAT.head); b.cyl(s * 0.67, 1.055, 0.03, s * 0.67, 1.055, 0.048, 0.08, 0.07, 12);
    b.set(AMB, MAT.paint); b.box(s * 0.88 - 0.05, 1.0, -0.01, s * 0.88 + 0.05, 1.11, 0.03); }
  b.at(0, 0, 0); b.set(GD, MAT.rus); extY(b, mirror([[0.95, -3.04], [1.17, -2.94], [1.17, -2.82]]), 0.6, 0.84); // bumper beam
  b.set(BK, MAT.paint); b.box(-0.95, 0.5, -2.99, 0.95, 0.61, -2.8); b.box(-0.74, 0.66, -3.052, -0.36, 0.78, -3.03); // valance, number plate
  for (const s of [-1, 1]) { b.box(s * 0.84 - 0.08, 0.67, -3.05, s * 0.84 + 0.08, 0.77, -3.02); b.set([0.5, 0.5, 0.45], MAT.glass); b.box(s * 0.84 - 0.06, 0.685, -3.058, s * 0.84 + 0.06, 0.755, -3.03); b.set(BK, MAT.paint); } // fog lamps
  b.set(AMB, MAT.paint); for (const s of [-1, 1]) b.box(s * 1.11, 1.125, -2.6, s * 1.132, 1.165, -2.52); // side markers on the wings
  b.set(DK, MAT.metal); b.box(-0.24, 0.62, -3.09, 0.24, 0.8, -3.04); b.cyl(-0.12, 0.71, -3.105, 0.12, 0.71, -3.105, 0.035, 0.035, 6);
  for (const s of [-1, 1]) { b.cyl(s * 0.17, 0.63, -3.105, s * 0.17, 0.79, -3.105, 0.025, 0.025, 6); b.box(s * 0.56 - 0.02, 0.64, -3.14, s * 0.56 + 0.02, 0.78, -3.03, 0, 0.03); b.cyl(s * 0.56 - 0.05, 0.71, -3.11, s * 0.56 + 0.05, 0.71, -3.11, 0.03, 0.03, 6); }
  const hy = (z) => 1.385 + (z + 2.74) * 0.0489; // bonnet top
  b.set(GD, MAT.rus); for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z = -1.75 + k * 0.085; b.box(s * 0.34 - 0.15, hy(z) - 0.006, z, s * 0.34 + 0.15, hy(z) + 0.022, z + 0.03); } // intake louvres
  b.set(DK, MAT.metal); for (const s of [-1, 1]) b.box(s * 0.5 - 0.02, hy(-2.6) - 0.006, -2.6, s * 0.5 + 0.02, hy(-2.6) + 0.03, -2.5); // bonnet catches
  // ---- windscreen: two panes, centre pillar, wipers ----
  onPlane(b, [0, YB, ZC], [0, 0.25, -0.56]);
  for (const s of [-1, 1]) { win([[s * 0.06, 0.07], [s * 0.97, 0.07], [s * 0.89, 0.54], [s * 0.06, 0.54]], 0);
    b.set(BK, MAT.rubber); b.box(s * 0.5 - 0.3, 0.125, 0.014, s * 0.5 + 0.3, 0.145, 0.03); b.box(s * 0.5 - 0.012, 0.03, 0.02, s * 0.5 + 0.012, 0.135, 0.038); }
  // ---- sides: doors, windows, handles, hinges, steps, mirrors ----
  for (const sx of [-1, 1]) { const Z = (P) => P.map((p) => [-sx * p[0], p[1]]), lb = (z0, z1, y0, y1, d0, d1) => b.box(Math.min(-sx * z0, -sx * z1), y0, d0, Math.max(-sx * z0, -sx * z1), y1, d1);
    onPlane(b, [sx * XS, 0, 0], [sx, 0, 0]);
    const D0 = Z([[-0.93, 0.7], [0.232, 0.7], [0.232, 1.474], [-0.93, 1.474]]), D1 = Z([[0.268, 0.7], [1.22, 0.7], [1.22, 1.474], [0.268, 1.474]]);
    b.set(ww(0.07), MAT.rus); plate(b, D0, 0, 0.022); frame(b, inset(D0, 0.1), 0.018, 0.022, 0.03); b.set(ww(0.02), MAT.rus); plate(b, D1, 0, 0.022); frame(b, inset(D1, 0.1), 0.018, 0.022, 0.03); // doors with a pressed panel
    b.set(BK, MAT.void); lb(0.23, 0.27, 0.7, 1.474, -0.01, 0.006); if (sx > 0) { b.set(BK, MAT.paint); b.cyl(-1.9, 1.33, -0.01, -1.9, 1.33, 0.03, 0.065, 0.055, 8); } // door gap; fuel filler on the right
    b.set(BK, MAT.paint); for (const z of [0.07, 1.06]) lb(z, z + 0.12, 1.34, 1.37, 0, 0.05); // handles
    b.set(GD, MAT.rus); for (const z of [-0.95, 0.25]) for (const y of [0.92, 1.34]) b.cyl(-sx * z, y - 0.05, 0.022, -sx * z, y + 0.05, 0.022, 0.02, 0.02, 6); // hinges
    onPlane(b, [sx * XS, YB, 0], [sx * 0.56, 0.12, 0]);
    b.set(ww(0.07), MAT.rus); plate(b, Z([[-0.93, 0.004], [0.232, 0.004], [0.232, 0.545], [-0.69, 0.545]]), 0, 0.022); b.set(ww(0.02), MAT.rus); plate(b, Z([[0.268, 0.004], [1.22, 0.004], [1.22, 0.545], [0.268, 0.545]]), 0, 0.022);
    win(Z([[-0.79, 0.1], [0.09, 0.1], [0.09, 0.46], [-0.63, 0.46]]), 0.022); win(Z([[0.41, 0.1], [1.09, 0.1], [1.09, 0.46], [0.41, 0.46]]), 0.022); win(Z([[1.56, 0.13], [2.16, 0.13], [2.16, 0.43], [1.56, 0.43]]), 0);
    b.set(BK, MAT.void); lb(0.23, 0.27, 0.004, 0.545, -0.01, 0.006); b.set(GD, MAT.rus); lb(-0.74, 2.56, 0.55, 0.573, -0.01, 0.022); // door gap, rain gutter
    b.set(BK, MAT.paint); for (const [z, d] of [[0.75, 0.022], [1.86, 0]]) b.cyl(-sx * z, 0.06, d - 0.005, -sx * z, 0.06, d + 0.03, 0.042, 0.036, 8); // firing ports
    b.at(0, 0, 0); b.set(DK, MAT.metal); b.box(sx > 0 ? 1.03 : -1.28, 0.46, -0.9, sx > 0 ? 1.28 : -1.03, 0.5, 1.2); for (const z of [-0.6, 0.9]) b.box(sx * 1.07 - 0.02, 0.49, z - 0.02, sx * 1.07 + 0.02, 0.64, z + 0.02); // step on brackets
    b.set(BK, MAT.metal); b.cyl(sx * 1.1, 1.55, -0.9, sx * 1.38, 1.62, -1.02, 0.012, 0.012, 4, 0); b.cyl(sx * 1.06, 1.92, -0.8, sx * 1.38, 1.86, -1.02, 0.012, 0.012, 4, 0); b.cyl(sx * 1.38, 1.58, -1.02, sx * 1.38, 1.9, -1.02, 0.014, 0.014, 5);
    b.set(BK, MAT.paint); b.box(sx * 1.38 - 0.07, 1.63, -1.05, sx * 1.38 + 0.07, 1.87, -1.02); b.set(GL, MAT.glass); poly(b, [[sx * 1.38 - 0.06, 1.645, -1.016], [sx * 1.38 + 0.06, 1.645, -1.016], [sx * 1.38 + 0.06, 1.855, -1.016], [sx * 1.38 - 0.06, 1.855, -1.016]], [sx * 1.38, 1.75, -2]);
  }
  // ---- roof: crew hatches, fixed ring, stowage rack with its load, aerial ----
  for (const s of [-1, 1]) { b.set(ww(0.12), MAT.rus); b.box(s * 0.46 - 0.31, 2.09, -0.62, s * 0.46 + 0.31, 2.135, -0.12, 0.02, 0.02); b.set(DK, MAT.metal); b.box(s * 0.46 - 0.08, 2.13, -0.3, s * 0.46 + 0.08, 2.16, -0.27); for (const e of [-1, 1]) b.cyl(s * 0.46 + e * 0.2 - 0.04, 2.125, -0.105, s * 0.46 + e * 0.2 + 0.04, 2.125, -0.105, 0.018, 0.018, 5); }
  b.set(GD, MAT.rus); b.cyl(0, 2.09, TIGR.tz, 0, 2.125, TIGR.tz, 0.5, 0.48, 18);
  b.set(DK, MAT.metal); for (const s of [-1, 1]) { b.box(s * 0.8 - 0.015, 2.22, 1.2, s * 0.8 + 0.015, 2.25, 2.42); for (const z of [1.215, 1.81, 2.405]) b.box(s * 0.8 - 0.012, 2.09, z - 0.012, s * 0.8 + 0.012, 2.23, z + 0.012); }
  for (const z of [1.2, 2.42]) b.box(-0.8, 2.22, z - 0.015, 0.8, 2.25, z + 0.015);
  b.set([0.05, 0.06, 0.04], MAT.paint); for (const z of [1.3, 1.68]) { b.box(-0.72, 2.09, z, -0.26, 2.27, z + 0.34, 0.015, 0.02); b.box(-0.76, 2.16, z + 0.12, -0.72, 2.2, z + 0.22); } // jerry cans lying flat
  b.set([0.1, 0.09, 0.06], MAT.paint); b.cyl(-0.7, 2.2, 2.26, 0.7, 2.2, 2.26, 0.11, 0.105, 10); b.set([0.07, 0.065, 0.045], MAT.paint); b.box(0.05, 2.09, 1.3, 0.72, 2.31, 1.8); // tarpaulin roll, crate
  b.set(BK, MAT.metal); for (const x of [-0.4, 0.4]) b.cyl(x, 2.2, 2.26, x + 0.03, 2.2, 2.26, 0.115, 0.115, 10); // straps round the roll
  b.cyl(-0.85, 2.09, 2.46, -0.85, 2.24, 2.46, 0.03, 0.022, 6); b.cyl(-0.85, 2.24, 2.46, -0.85, 2.36, 2.46, 0.016, 0.016, 5); b.cyl(-0.85, 2.36, 2.46, -0.9, 3.75, 2.6, 0.008, 0.004, 4);
  b.set([0.9, 0.92, 0.95], MAT.snow); // snow left lying on the load, the roof under it and the bumpers
  for (const [x0, y, z0, x1, z1, t] of [[0.09, 2.3, 1.34, 0.68, 1.76, 0.035], [-0.7, 2.26, 1.33, -0.3, 2.0, 0.03], [-0.55, 2.295, 2.2, 0.6, 2.32, 0.03], [-0.88, 2.095, 1.25, 0.88, 2.45, 0.02],
    [0.1, 0.835, -3.0, 1.0, -2.87, 0.025], [-1.05, 0.835, -3.0, -0.3, -2.87, 0.02], [-0.9, 0.695, ZR + 0.01, 0.95, ZR + 0.13, 0.02]]) b.box(x0, y, z0, x1, y + t, z1, Math.min(0.05, (x1 - x0) * 0.3), Math.min(0.05, (z1 - z0) * 0.3));  // ---- rear: door with a window, lamp clusters, spare wheel, bumper ----
  onPlane(b, [0, 0, ZR], [0, 0, 1]);
  b.set(ww(0.05), MAT.rus); plate(b, [[0.1, 0.72], [0.86, 0.72], [0.86, 1.474], [0.1, 1.474]], 0, 0.022);
  b.set(BK, MAT.paint); b.box(0.14, 1.3, 0, 0.26, 1.33, 0.05); b.box(-0.5, 0.74, -0.01, -0.12, 0.85, 0.012); // handle, number plate
  b.set([0.55, 0.55, 0.5], MAT.glass); b.box(-0.84, 0.74, -0.01, -0.72, 0.8, 0.03); // reversing lamp
  b.set(GD, MAT.rus); for (const y of [0.92, 1.34]) b.cyl(0.88, y - 0.05, 0.022, 0.88, y + 0.05, 0.022, 0.02, 0.02, 6);
  frame(b, inset([[0.1, 0.72], [0.86, 0.72], [0.86, 1.474], [0.1, 1.474]], 0.1), 0.018, 0.022, 0.03);
  for (const s of [-1, 1]) { b.set(BK, MAT.paint); b.box(s * 1.0 - 0.085, 0.8, -0.01, s * 1.0 + 0.085, 1.1, 0.03); b.set([0.5, 0.02, 0.015], MAT.paint); b.box(s * 1.0 - 0.065, 0.96, 0, s * 1.0 + 0.065, 1.08, 0.042); b.set(AMB, MAT.paint); b.box(s * 1.0 - 0.065, 0.82, 0, s * 1.0 + 0.065, 0.94, 0.042); }
  b.set(DK, MAT.metal); b.box(-0.62, 1.2, -0.01, -0.3, 1.44, 0.08);
  onPlane(b, [0, YB, ZR], [0, 0.06, 0.56]);
  b.set(ww(0.05), MAT.rus); plate(b, [[0.1, 0.004], [0.86, 0.004], [0.85, 0.54], [0.1, 0.54]], 0, 0.022); win([[0.22, 0.12], [0.74, 0.12], [0.74, 0.44], [0.22, 0.44]], 0.022);
  b.at(0, 0, 0); b.set(BK, MAT.metal); extY(b, mirror([[1.13, ZR - 0.03], [1.13, ZR + 0.1], [1.0, ZR + 0.15]]), 0.52, 0.7); b.cyl(0, 0.6, ZR + 0.14, 0, 0.6, ZR + 0.24, 0.04, 0.03, 6);
  b.at(-0.46, 1.32, ZR + 0.2, -Math.PI / 2); tyre(b, 0, 0, 0, 0.46, 0.26, 0, RIM, { seg: 16 }); b.at(0, 0, 0);
  for (const z of TIGR.ax) for (const sx of [-1, 1]) tyre(b, sx * 1.0, TIGR.wr, z, TIGR.wr, 0.34, z < 0 ? 3 : 4, RIM);
  // ---- part 1: turntable, pedestal and yoke ----
  b.part = 1; const tz = TIGR.tz, gy = TIGR.gy, gz = TIGR.gz, OL = [0.05, 0.062, 0.04];
  b.set(GD, MAT.rus); b.cyl(0, 2.11, tz, 0, 2.185, tz, 0.42, 0.4, 18); b.set(DK, MAT.metal); b.cyl(0, 2.17, tz, 0, 2.2, tz, 0.3, 0.29, 14);
  for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; b.cyl(Math.cos(a) * 0.36, 2.17, tz + Math.sin(a) * 0.36, Math.cos(a) * 0.36, 2.2, tz + Math.sin(a) * 0.36, 0.016, 0.016, 5); }
  b.set(OL, MAT.rus); b.cyl(0, 2.19, tz, 0, 2.3, tz, 0.14, 0.11, 10); b.box(-0.23, 2.27, tz - 0.08, 0.23, 2.32, tz + 0.08);
  for (const s of [-1, 1]) { b.box(s * 0.2 - 0.03, 2.3, tz - 0.07, s * 0.2 + 0.03, gy + 0.07, tz + 0.07, 0, 0.02); b.cyl(s * 0.22, gy, gz, s * 0.26, gy, gz, 0.045, 0.045, 8); }
  b.set(BK, MAT.rubber); b.cyl(0.08, 2.19, tz + 0.2, 0.1, 2.31, tz + 0.1, 0.014, 0.014, 4, 0);
  // ---- part 2: sight unit between two ribbed launch containers on a cross beam ----
  b.part = 2;
  b.set(OL, MAT.rus); b.box(-0.15, gy - 0.08, gz - 0.3, 0.15, gy + 0.2, gz + 0.2, 0.02, 0.02); b.box(-0.47, gy + 0.17, gz - 0.1, 0.47, gy + 0.25, gz + 0.1);
  b.set(BK, MAT.metal); b.cyl(-0.055, gy + 0.075, gz - 0.29, -0.055, gy + 0.075, gz - 0.37, 0.075, 0.075, 12); b.cyl(0.08, gy + 0.1, gz - 0.29, 0.08, gy + 0.1, gz - 0.35, 0.04, 0.04, 8); b.box(0.04, gy - 0.04, gz - 0.33, 0.12, gy + 0.02, gz - 0.29);
  b.set([0.05, 0.03, 0.07], MAT.glass); b.cyl(-0.055, gy + 0.075, gz - 0.36, -0.055, gy + 0.075, gz - 0.373, 0.062, 0.062, 12); b.set([0.03, 0.05, 0.07], MAT.glass); b.cyl(0.08, gy + 0.1, gz - 0.34, 0.08, gy + 0.1, gz - 0.353, 0.03, 0.03, 8);
  for (const s of [-1, 1]) { const x = s * 0.37, y = gy + 0.07, z0 = TIGR.mz, z1 = gz + 0.6;
    b.set([0.065, 0.08, 0.048], MAT.paint); b.cyl(x, y, z0 + 0.02, x, y, z1 - 0.02, 0.093, 0.093, 16, 0);
    for (let k = 1; k <= 5; k++) b.cyl(x, y, z0 + k * 0.3 - 0.012, x, y, z0 + k * 0.3 + 0.012, 0.104, 0.104, 14); // stiffening rings
    b.cyl(x, y, z0, x, y, z0 + 0.1, 0.108, 0.108, 16); b.cyl(x, y, z1 - 0.1, x, y, z1, 0.108, 0.108, 16); // end caps
    b.set(BK, MAT.paint); b.cyl(x, y, z0 - 0.012, x, y, z0 + 0.01, 0.085, 0.09, 12); b.cyl(x, y, z1 - 0.01, x, y, z1 + 0.012, 0.09, 0.085, 12); // covers
    b.set(DK, MAT.metal); for (const z of [gz - 0.22, gz + 0.22]) b.cyl(x, y, z - 0.025, x, y, z + 0.025, 0.112, 0.112, 14); b.box(x - 0.05, gy + 0.165, gz - 0.26, x + 0.05, gy + 0.215, gz + 0.26); // clamp bands under a saddle rail
    b.box(x - 0.012, y + 0.085, z0 + 0.4, x + 0.012, y + 0.125, z0 + 0.52); // carrying handle
    b.set(BK, MAT.rubber); b.cyl(s * 0.12, gy + 0.1, gz + 0.19, x - s * 0.04, y + 0.06, z1 - 0.06, 0.012, 0.012, 4, 0); } // cable to the sight
  return b.build();
}
export const BTR = { ty: 2.02, tz: -0.75, gy: 2.25, gz: -1.05, mz: -3.55, hl: 3.0, hw: 1.2, rad: 2.6, hh: 2.02, th: 2.6, tr: 0.82, bx: 1.45, bz: 3.75, cr: 1.6, cs: 2.0, wr: 0.55, ax: [-2.35, -0.95, 0.75, 2.15] };
export function buildBTR() { // BTR-82A: eight wheels, boat hull, one-man turret with the 30 mm
  const b = new MB(), G = [0.075, 0.092, 0.052], GD = [0.06, 0.075, 0.045], DK = [0.03, 0.031, 0.034];
  b.part = 0; b.set(GD, MAT.rus);
  extX(b, [[0.5, -3.1], [0.95, -3.85], [1.35, -3.75], [2.0, -2.2], [2.02, 3.0], [1.62, 3.82], [0.75, 3.75], [0.5, 3.2]], -1.18, 1.18); // lower and upper hull
  b.set(G, MAT.rus); for (const sx of [-1, 1]) extX(b, [[1.1, -3.1], [1.62, -2.3], [1.95, -2.2], [1.95, 3.0], [1.55, 3.6], [1.1, 3.4]], sx > 0 ? 1.18 : -1.47, sx > 0 ? 1.47 : -1.18); // sloped side sponsons
  for (const sx of [-1, 1]) { b.set(GD, MAT.rus); b.box(sx * 1.47 - 0.04, 1.2, -0.2, sx * 1.47 + 0.04, 1.75, 0.6); b.set(DK, MAT.metal); for (let k = 0; k < 3; k++) b.box(sx * 1.46 - 0.02, 1.62, -2.0 + k * 1.6, sx * 1.46 + 0.02, 1.72, -1.8 + k * 1.6); } // side hatches, firing ports
  b.set([0.03, 0.04, 0.05], MAT.glass); for (const sx of [-1, 1]) poly(b, [[sx * 0.55 - 0.22, 1.72, -2.47], [sx * 0.55 + 0.22, 1.72, -2.47], [sx * 0.55 + 0.22, 1.85, -2.29], [sx * 0.55 - 0.22, 1.85, -2.29]], [sx * 0.55, 1.8, -3]); // driver's vision blocks
  b.set([1, 0.95, 0.82], MAT.head); for (const sx of [-1, 1]) poly(b, [[sx * 0.95 - 0.08, 1.38, -3.79], [sx * 0.95 + 0.08, 1.38, -3.79], [sx * 0.95 + 0.08, 1.5, -3.77], [sx * 0.95 - 0.08, 1.5, -3.77]], [sx * 0.95, 1.44, -5]);
  b.set(DK, MAT.metal); b.box(-0.6, 2.02, 1.2, 0.6, 2.05, 2.6); for (let k = 0; k < 6; k++) b.box(-0.55, 2.05, 1.3 + k * 0.22, 0.55, 2.07, 1.38 + k * 0.22); // engine grille
  b.box(-1.25, 0.95, -3.95, 1.25, 1.02, -3.82); // trim vane edge
  for (const z of BTR.ax) for (const sx of [-1, 1]) tyre(b, sx * 1.22, BTR.wr, z, BTR.wr, 0.36, 3 + BTR.ax.indexOf(z), [0.05, 0.065, 0.04]);
  b.part = 1; const tz = BTR.tz; b.set(G, MAT.rus); b.cyl(0, 2.02, tz, 0, 2.4, tz, 0.82, 0.62, 16); b.cyl(0.25, 2.4, tz + 0.2, 0.25, 2.46, tz + 0.2, 0.26, 0.26, 12);
  b.set(DK, MAT.metal); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) b.cyl(sx * 0.72, 2.25, tz + 0.1 + k * 0.13, sx * 0.86, 2.38, tz + k * 0.13, 0.04, 0.04, 6); b.box(-0.55, 2.3, tz - 0.62, -0.3, 2.5, tz - 0.4);
  b.part = 2; const gy = BTR.gy; b.set(G, MAT.rus); b.box(-0.16, gy - 0.12, -1.35, 0.16, gy + 0.12, -0.95);
  b.set(DK, MAT.metal); b.cyl(0, gy, -1.3, 0, gy, BTR.mz, 0.035, 0.032, 8); b.cyl(0, gy, BTR.mz + 0.22, 0, gy, BTR.mz, 0.05, 0.05, 8); b.cyl(0.16, gy, -1.3, 0.16, gy, -1.9, 0.018, 0.018, 6);
  return b.build();
}
