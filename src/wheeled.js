// Tigr-M and BTR-82A, and the tyre shared by the wheeled vehicles. Local frame as in tank.js: x right, y up, forward = -z.
import { MB, MAT } from './mesh.js';
import { poly, extX, extY, mirror } from './vehutil.js';
// ---------- light and wheeled vehicles (phase 4): parts 0 hull, 1 mount, 2 weapon, 3.. one per axle (both wheels turn with it) ----------
// K adds: bx/bz hull half-extents for hits, cr collision circle radius and spacing cs, wr wheel radius, ax axle z positions
// A wheel on an axle across x at (x, y, z): radius r, width w, the outer face on the side of sign(x). It is drawn through b.vert
// (lugs included: they are placed radially from the angle, not through b.at), so a b.at() set by the caller places it (a spare wheel).
// Optional o: { nuts: wheel nuts (default 6 when r > 0.35, 0 = none), lugs: tread blocks per side (0 = slick), seg: segments round }.
export const tyre = (b, x, y, z, r, w, part, rim, o) => {
  o = o || {}; b.part = part; const sx = Math.sign(x) || 1, n = o.seg || (r > 0.42 ? 20 : 14), h = w / 2, TAU = Math.PI * 2;
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
  const RB = [0.035, 0.035, 0.038], HB = [0.018, 0.018, 0.016];
  lathe([[-0.5, 0.001], [-0.5, 0.56], [-0.72, 0.6]], HB, MAT.rus); // back of the rim, brake drum
  lathe([[-0.72, 0.6], [-0.99, 0.72], [-0.98, 0.87], [-0.84, 0.95], [-0.6, 0.972], [0.6, 0.972], [0.84, 0.95], [0.98, 0.87], [0.99, 0.72], [0.8, 0.615]], RB, MAT.rubber); // carcass with bulged sidewalls
  lathe([[0.8, 0.615], [0.88, 0.6], [0.86, 0.565], [0.55, 0.54], [0.32, 0.5], [0.4, 0.27], [0.6, 0.2], [0.64, 0.001]], rim, MAT.rus); // flange, well, dished disc, hub face (matt paint)
  const P3 = (u, q, a) => [x + sx * u * h, y + Math.cos(a) * q * r, z + Math.sin(a) * q * r];
  const nl = o.lugs === undefined ? Math.max(10, Math.round(r * 30)) : o.lugs; b.set(RB, MAT.rubber);
  if (nl) { const st = TAU / nl, ha = st * 0.21, ST = [[0.07, 1, 0.95, 0], [0.72, 1, 0.95, 0.24], [0.99, 0.905, 0.86, 0.42]]; // chevron lugs that wrap over the shoulder
    for (const sd of [-1, 1]) for (let k = 0; k < nl; k++) { const a0 = (k + (sd > 0 ? 0.5 : 0)) * st, c = P3(sd * 0.5, 0.8, a0 + 0.2 * st);
      const T = (j, e) => P3(sd * ST[j][0], ST[j][1], a0 + ST[j][3] * st + e * ha), B = (j, e) => P3(sd * ST[j][0], ST[j][2], a0 + ST[j][3] * st + e * ha);
      for (let j = 0; j < 2; j++) { poly(b, [T(j, -1), T(j, 1), T(j + 1, 1), T(j + 1, -1)], c); for (const e of [-1, 1]) poly(b, [B(j, e), T(j, e), T(j + 1, e), B(j + 1, e)], c); }
      poly(b, [B(0, -1), B(0, 1), T(0, 1), T(0, -1)], c); } }
  const k = r / 0.48, nn = o.nuts === undefined ? (r > 0.35 ? 6 : 0) : o.nuts, uh = x + sx * 0.6 * h;
  b.set(HB, MAT.rus); b.cyl(uh, y, z, uh + sx * 0.07 * k, y, z, 0.15 * r, 0.1 * r, 12); // hub cap
  for (let i = 0; i < nn; i++) { const a = (i + 0.5) / nn * TAU, p = P3(0.34, 0.36, a); b.cyl(p[0], p[1], p[2], p[0] + sx * 0.05 * k, p[1], p[2], 0.022 * k, 0.018 * k, 5); }
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
export const TIGR = { ty: 2.1, tz: 0.35, gy: 2.42, gz: 0.35, mz: -1.0, hl: 2.4, hw: 1.0, rad: 2.2, hh: 2.1, th: 2.75, tr: 0.45, bx: 1.2, bz: 2.85, cr: 1.35, cs: 1.4, wr: 0.54, ax: [-1.72, 1.95] };
// GAZ-2330 Tigr-M with a twin Kornet launcher on the roof ring. The body is a tub between the wheel wells, sills and corners outside
// them, a broad raised bonnet, and a cab with tumblehome; doors, frames and fittings are laid on its panels (never in a panel's own plane).
// Dark fittings use MAT.rus or MAT.rubber: MAT.metal and MAT.glass mirror the sky and read chrome-white or pale in daylight.
export function buildTigr() {
  const b = new MB(), G = [0.03, 0.032, 0.019], GD = [0.023, 0.025, 0.015], DK = [0.016, 0.016, 0.014], BK = [0.012, 0.012, 0.013], GLS = [0.006, 0.011, 0.011], AMB = [0.2, 0.085, 0.012], OL = [0.026, 0.03, 0.018];
  const tint = (k) => [G[0] * k, G[1] * k, G[2] * k], WR = TIGR.wr, AX = TIGR.ax;
  const ZN = -2.86, ZC = -1.0, ZR = 2.66, XS = 1.12, YB = 1.5, YT = 2.02, XW = 0.72, AW = 0.64, AT = 1.22, AK = 0.93; // AW AT AK: wheel arch half width, top, knee
  const win = (P, z0) => { // armoured glass set 4 cm down in a heavy frame with a dark reveal
    b.set(GD, MAT.rus); const I = frame(b, P, 0.05, z0, z0 + 0.05); b.set(BK, MAT.void); frame(b, I, 0.012, z0, z0 + 0.04);
    const c = cen(P); b.set(GLS, MAT.glass); poly(b, I.map((p) => [p[0], p[1], z0 + 0.008]), [c[0], c[1], -1]); // dark glass: MAT.glass mirrors the sky by Fresnel, so the colour must be near black
    b.set(DK, MAT.rus); for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length, ax = (P[i][0] + I[i][0]) / 2, ay = (P[i][1] + I[i][1]) / 2, bx = (P[j][0] + I[j][0]) / 2, by = (P[j][1] + I[j][1]) / 2;
      for (const t of [0, 0.5]) { const x = ax + (bx - ax) * t, y = ay + (by - ay) * t; b.box(x - 0.011, y - 0.011, z0 + 0.04, x + 0.011, y + 0.011, z0 + 0.06); } } // frame bolts
    return I; };
  const warm = (v0) => { for (let i = v0 * 14 + 10; i < b.v.length; i += 14) b.v[i] = -9; }; // uv.x = -9: the paint shader lays no snow there (engine heat)
  b.part = 0;
  // ---- underbody: a dark frame slab under the tub, a deeper belly between the axles, skid plate, axles with hub reductions ----
  b.set(DK, MAT.rus); b.box(-0.7, 0.5, -2.4, 0.7, 0.64, 2.6); b.box(-0.46, 0.38, -1.05, 0.46, 0.52, 1.3);
  extX(b, [[0.6, -2.95], [0.38, -2.15], [0.52, -2.1], [0.66, -2.9]], -0.62, 0.62); // skid plate under the nose
  b.box(-1.06, 0.42, 0.05, -0.76, 0.63, 1.0); b.cyl(0.9, 0.52, 0.0, 0.9, 0.52, 0.8, 0.085, 0.085, 8); b.cyl(0.9, 0.52, 0.78, 1.15, 0.5, 1.1, 0.032, 0.032, 6); // fuel tank, silencer, tail pipe
  for (const zc of AX) { b.cyl(0, 0.5, zc - 0.2, 0, 0.5, zc + 0.2, 0.18, 0.15, 8); // differential
    for (const sx of [-1, 1]) { b.cyl(sx * 0.12, 0.5, zc, sx * 0.62, WR, zc, 0.06, 0.06, 6, 0); b.cyl(sx * 0.6, WR, zc, sx * 0.92, WR, zc, 0.2, 0.2, 10); // drive shaft, hub reduction
      for (const e of [-1, 1]) b.cyl(sx * 0.4, 0.46, zc + e * 0.32, sx * 0.84, 0.36, zc + e * 0.08, 0.04, 0.04, 5, 0); // lower wishbone
      b.cyl(sx * 0.79, 0.42, zc + 0.26, sx * 0.77, AT - 0.03, zc + 0.26, 0.055, 0.055, 6, 0); } } // damper and spring
  // ---- body ----
  b.set(G, MAT.rus); extX(b, [[0.62, -2.45], [0.76, ZN], [AT, ZN], [AT, ZR], [0.7, ZR], [0.62, 2.5]], -XW, XW); // tub between the wheel wells
  for (const sx of [-1, 1]) { const x0 = sx > 0 ? XW : -XS, x1 = sx > 0 ? XS : -XW; // sills and corners outside the wells; their ends are the well walls
    extX(b, [[0.8, ZN], [0.62, AX[0] - AW], [AK, AX[0] - AW], [AT, AX[0] - 0.4], [AT, ZN]], x0, x1);
    extX(b, [[0.62, AX[0] + AW], [0.62, AX[1] - AW], [AK, AX[1] - AW], [AT, AX[1] - 0.4], [AT, AX[0] + 0.4], [AK, AX[0] + AW]], x0, x1);
    extX(b, [[0.62, AX[1] + AW], [0.7, ZR], [AT, ZR], [AT, AX[1] + 0.4], [AK, AX[1] + AW]], x0, x1); }
  const fr = (z, f) => [[-XS, AT, z], [-XS, f - 0.06, z], [-1.05, f, z], [1.05, f, z], [XS, f - 0.06, z], [XS, AT, z]];
  loft(b, [fr(ZN, 1.3), fr(-2.74, 1.36), fr(ZC, 1.45)], 1, 0); // wings with a chamfered outer edge; their front is the flat nose panel
  const hr = (z, f, h) => [[-0.76, f - 0.03, z], [-0.7, h, z], [0.7, h, z], [0.76, f - 0.03, z]];
  let w0 = b.v.length / 14; b.set(tint(0.94), MAT.rus); loft(b, [hr(ZN - 0.015, 1.3, 1.36), hr(-2.74, 1.36, 1.425), hr(ZC, 1.45, 1.49)], 1, 0); warm(w0); // broad raised centre section of the bonnet
  b.set(G, MAT.rus); b.box(-XS, AT, ZC, XS, YB, ZR); // cab below the belt line
  const cr = (y, x, z0, z1) => [[-x, y, z0], [x, y, z0], [x, y, z1], [-x, y, z1]];
  loft(b, [cr(YB, XS, ZC, ZR), cr(YT, 1.0, -0.76, ZR - 0.06), cr(2.1, 0.91, -0.69, ZR - 0.13)], 0, 1); // cab above it: raked screen, 13 degrees of tumblehome, chamfered roof edge
  // ---- wheel wells: dark liners, a rubber lip round each arch, mud flaps ----
  for (const zc of AX) for (const sx of [-1, 1]) {
    b.set(BK, MAT.void); poly(b, [[sx * 0.727, 0.5, zc - AW + 0.01], [sx * 0.727, 0.5, zc + AW - 0.01], [sx * 0.727, AT - 0.005, zc + AW - 0.01], [sx * 0.727, AT - 0.005, zc - AW + 0.01]], [0, 0.8, zc]);
    const A = [[-AW, 0.62], [-AW, AK], [-0.4, AT], [0.4, AT], [AW, AK], [AW, 0.62]], O1 = inset(A, -0.03), O2 = inset(A, -0.05), X0 = sx * 1.115, X1 = sx * 1.165;
    O1[0][1] = O1[5][1] = O2[0][1] = O2[5][1] = 0.62; b.set(BK, MAT.rubber);
    const W = (X, p) => [X, p[1], zc + p[0]];
    for (let i = 0; i < 5; i++) { const p = A[i], q = A[i + 1], my = (p[1] + q[1]) / 2, mz = zc + (p[0] + q[0]) / 2;
      poly(b, [W(X0, p), W(X0, q), W(X1, q), W(X1, p)], [sx * 1.14, 2 * my - WR, 2 * mz - zc]);
      poly(b, [W(X1, p), W(X1, q), W(X1, O1[i + 1]), W(X1, O1[i])], [0, my, mz]);
      poly(b, [W(X1, O1[i]), W(X1, O1[i + 1]), W(X0, O2[i + 1]), W(X0, O2[i])], [sx, WR, zc]); }
    b.box(sx * 0.98 - 0.2, 0.3, zc + AW + 0.005, sx * 0.98 + 0.2, 0.66, zc + AW + 0.03);
  }
  // ---- nose: a low wide grille with horizontal louvres, round headlamps far out in the wing fronts, indicators below them ----
  onPlane(b, [0, 0, ZN], [0, 0, -1]);
  b.set(GD, MAT.rus); const GI = frame(b, [[-0.47, 0.89], [0.47, 0.89], [0.47, 1.23], [-0.47, 1.23]], 0.03, 0, 0.035);
  b.set(BK, MAT.void); poly(b, GI.map((p) => [p[0], p[1], 0.005]), [0, 1, -1]);
  b.set(GD, MAT.rus); for (let k = 0; k < 5; k++) b.box(GI[0][0], 0.932 + k * 0.056, -0.01, GI[2][0], 0.966 + k * 0.056, 0.028, 0, 0, 0.012); // armoured louvres
  for (const s of [-1, 1]) { b.set(BK, MAT.rubber); b.cyl(s * 0.87, 1.1, -0.01, s * 0.87, 1.1, 0.035, 0.115, 0.108, 14); // bezel
    b.set([0.13, 0.14, 0.14], MAT.paint); b.cyl(s * 0.87, 1.1, 0, s * 0.87, 1.1, 0.045, 0.09, 0.078, 14); // grey lens
    b.set([0.42, 0.4, 0.34], MAT.head); b.cyl(s * 0.87, 1.1, 0.03, s * 0.87, 1.1, 0.05, 0.03, 0.026, 8); // a small bright core by day
    b.set(AMB, MAT.paint); b.box(s * 0.98 - 0.06, 0.89, -0.01, s * 0.98 + 0.06, 0.965, 0.022);
    b.set(BK, MAT.rubber); b.box(s * 0.98 - 0.07, 0.88, -0.01, s * 0.98 + 0.07, 0.975, 0.012); }
  // ---- bumper: a deep box section butted to the nose, winch fairlead, shackles, unlit fog lamps ----
  b.at(0, 0, 0); b.set(GD, MAT.rus); extY(b, mirror([[1.0, -3.1], [1.14, -3.0], [1.14, -2.85]]), 0.57, 0.82);
  b.set(DK, MAT.rus); for (const s of [-1, 1]) { b.box(s * 0.36 - 0.07, 0.62, -2.9, s * 0.36 + 0.07, 0.78, -2.6); // frame horns
    b.box(s * 0.6 - 0.02, 0.6, -3.17, s * 0.6 + 0.02, 0.74, -3.09, 0, 0.02); b.cyl(s * 0.6 - 0.05, 0.66, -3.14, s * 0.6 + 0.05, 0.66, -3.14, 0.028, 0.028, 6); // shackle lugs and pins
    b.box(s * 0.84 - 0.085, 0.64, -3.112, s * 0.84 + 0.085, 0.75, -3.09); }
  b.box(-0.22, 0.62, -3.125, 0.22, 0.78, -3.09); b.set(BK, MAT.void); b.box(-0.17, 0.66, -3.13, 0.17, 0.74, -3.1); // fairlead with its slot
  b.set([0.045, 0.05, 0.052], MAT.paint); for (const s of [-1, 1]) b.box(s * 0.84 - 0.065, 0.655, -3.118, s * 0.84 + 0.065, 0.735, -3.1);
  const hy = (z) => 1.425 + (z + 2.74) * 0.0374; // bonnet top
  w0 = b.v.length / 14; b.set(GD, MAT.rus); for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z = -1.75 + k * 0.085; b.box(s * 0.38 - 0.17, hy(z) - 0.006, z, s * 0.38 + 0.17, hy(z) + 0.02, z + 0.03); } // intake louvres
  b.set(DK, MAT.rus); for (const s of [-1, 1]) b.box(s * 0.58 - 0.02, hy(-2.6) - 0.006, -2.6, s * 0.58 + 0.02, hy(-2.6) + 0.028, -2.5); warm(w0); // bonnet catches
  b.set(BK, MAT.void); b.box(-0.705, 1.3, -1.02, 0.705, hy(-1.02) + 0.004, -1.005); // the gap under the screen
  // ---- windscreen: two panes, a heavy centre post, wipers ----
  onPlane(b, [0, YB, ZC], [0, 0.24, -0.52]);
  for (const s of [-1, 1]) { win([[s * 0.075, 0.06], [s * 0.93, 0.06], [s * 0.85, 0.51], [s * 0.075, 0.51]], 0);
    b.set(BK, MAT.rubber); b.box(s * 0.5 - 0.28, 0.135, 0.004, s * 0.5 + 0.28, 0.152, 0.026); b.box(s * 0.5 - 0.012, 0.07, 0.01, s * 0.5 + 0.012, 0.14, 0.034); }
  // ---- sides: doors with dark gaps, windows, handles, hinges, running boards, mirrors ----
  for (const sx of [-1, 1]) { const Z = (P) => P.map((p) => [-sx * p[0], p[1]]), lb = (z0, z1, y0, y1, d0, d1) => b.box(Math.min(-sx * z0, -sx * z1), y0, d0, Math.max(-sx * z0, -sx * z1), y1, d1);
    onPlane(b, [sx * XS, 0, 0], [sx, 0, 0]);
    const D0 = Z([[-0.93, 0.7], [0.24, 0.7], [0.24, YB - 0.006], [-0.93, YB - 0.006]]), D1 = Z([[0.26, 0.7], [1.2, 0.7], [1.2, YB - 0.006], [0.26, YB - 0.006]]);
    b.set(tint(1.06), MAT.rus); plate(b, D0, 0, 0.022); frame(b, inset(D0, 0.1), 0.018, 0.022, 0.03); b.set(tint(0.95), MAT.rus); plate(b, D1, 0, 0.022); frame(b, inset(D1, 0.1), 0.018, 0.022, 0.03); // doors with a pressed panel
    b.set(BK, MAT.void); lb(-0.95, 1.22, 0.68, 0.7, -0.01, 0.005); for (const z of [-0.95, 0.24, 1.2]) lb(z, z + 0.02, 0.68, YB, -0.01, 0.005); // panel gaps
    if (sx > 0) { b.set(BK, MAT.rubber); b.cyl(-1.9, 1.36, -0.01, -1.9, 1.36, 0.03, 0.065, 0.055, 8); } // fuel filler on the right
    b.set(BK, MAT.rubber); for (const z of [0.08, 1.04]) lb(z, z + 0.12, 1.36, 1.39, 0, 0.05); // handles
    b.set(DK, MAT.rus); for (const z of [-0.95, 0.25]) for (const y of [0.92, 1.36]) b.cyl(-sx * z, y - 0.05, 0.022, -sx * z, y + 0.05, 0.022, 0.022, 0.022, 6); // hinges
    onPlane(b, [sx * XS, YB, 0], [sx * 0.52, 0.12, 0]);
    b.set(tint(1.06), MAT.rus); plate(b, Z([[-0.93, 0.004], [0.24, 0.004], [0.24, 0.5], [-0.71, 0.5]]), 0, 0.022); b.set(tint(0.95), MAT.rus); plate(b, Z([[0.26, 0.004], [1.2, 0.004], [1.2, 0.5], [0.26, 0.5]]), 0, 0.022);
    win(Z([[-0.79, 0.08], [0.1, 0.08], [0.1, 0.44], [-0.64, 0.44]]), 0.022); win(Z([[0.4, 0.08], [1.07, 0.08], [1.07, 0.44], [0.4, 0.44]]), 0.022); win(Z([[1.56, 0.1], [2.18, 0.1], [2.18, 0.42], [1.56, 0.42]]), 0);
    b.set(BK, MAT.void); for (const z of [0.24, 1.2]) lb(z, z + 0.02, 0, 0.5, -0.01, 0.005); lb(-0.71, 1.22, 0.5, 0.515, -0.01, 0.005);
    b.set(GD, MAT.rus); lb(-0.74, 2.56, 0.516, 0.534, -0.01, 0.025); // rain gutter
    b.set(DK, MAT.rus); b.cyl(-sx * 2.4, 0.26, -0.01, -sx * 2.4, 0.26, 0.04, 0.06, 0.05, 8); // firing port boss aft of the rear window
    b.at(0, 0, 0); b.set(DK, MAT.rus); b.box(sx > 0 ? 1.03 : -1.3, 0.44, -0.9, sx > 0 ? 1.3 : -1.03, 0.48, 1.15); for (const z of [-0.72, 0.12, 0.97]) b.box(sx * 1.07 - 0.02, 0.47, z - 0.02, sx * 1.07 + 0.02, 0.64, z + 0.02); // running board on three brackets
    b.set(BK, MAT.rubber); b.cyl(sx * 1.1, 1.58, -0.94, sx * 1.27, 1.6, -1.01, 0.012, 0.012, 4, 0); b.cyl(sx * 1.09, 1.76, -0.9, sx * 1.27, 1.78, -1.01, 0.012, 0.012, 4, 0);
    b.box(sx * 1.27 - 0.06, 1.56, -1.04, sx * 1.27 + 0.06, 1.82, -1.01); b.set([0.03, 0.04, 0.045], MAT.paint); poly(b, [[sx * 1.27 - 0.05, 1.575, -1.006], [sx * 1.27 + 0.05, 1.575, -1.006], [sx * 1.27 + 0.05, 1.805, -1.006], [sx * 1.27 - 0.05, 1.805, -1.006]], [sx * 1.27, 1.7, -2]);
  }
  // ---- roof: crew hatches, fixed ring, stowage rack with a tarpaulin over the load, aerial ----
  for (const s of [-1, 1]) { b.set(tint(0.92), MAT.rus); b.box(s * 0.45 - 0.3, 2.09, -0.62, s * 0.45 + 0.3, 2.135, -0.12, 0.02, 0.02); b.set(DK, MAT.rus); b.box(s * 0.45 - 0.08, 2.13, -0.3, s * 0.45 + 0.08, 2.16, -0.27); for (const e of [-1, 1]) b.cyl(s * 0.45 + e * 0.2 - 0.04, 2.125, -0.105, s * 0.45 + e * 0.2 + 0.04, 2.125, -0.105, 0.018, 0.018, 5); }
  b.set(GD, MAT.rus); b.cyl(0, 2.09, TIGR.tz, 0, 2.125, TIGR.tz, 0.52, 0.5, 18);
  for (const s of [-1, 1]) { b.set(tint(0.92), MAT.rus); b.box(s * 0.32 - 0.3, 2.09, 1.2, s * 0.32 + 0.3, 2.13, 2.25, 0.015, 0.015); // flat two-leaf hatch over the rear compartment
    b.set(DK, MAT.rus); b.box(s * 0.12 - 0.02, 2.125, 1.65, s * 0.12 + 0.02, 2.155, 1.8); for (const z of [1.4, 2.05]) b.cyl(s * 0.63, 2.12, z - 0.06, s * 0.63, 2.12, z + 0.06, 0.018, 0.018, 5); }
  b.set(BK, MAT.rubber); b.cyl(-0.85, 2.09, 2.46, -0.85, 2.24, 2.46, 0.03, 0.022, 6); b.cyl(-0.85, 2.24, 2.46, -0.85, 2.36, 2.46, 0.016, 0.016, 5); b.cyl(-0.85, 2.36, 2.46, -0.9, 3.75, 2.6, 0.008, 0.004, 4);
  // ---- rear: door with a window, small lamp clusters, spare wheel on a swing carrier, bumper ----
  onPlane(b, [0, 0, ZR], [0, 0, 1]);
  const RD = [[0.22, 0.72], [0.92, 0.72], [0.92, YB - 0.006], [0.22, YB - 0.006]];
  b.set(tint(0.97), MAT.rus); plate(b, RD, 0, 0.022); frame(b, inset(RD, 0.1), 0.018, 0.022, 0.03);
  b.set(BK, MAT.void); for (const x of [0.2, 0.92]) b.box(x, 0.7, -0.01, x + 0.02, YB, 0.005); b.box(0.2, 0.7, -0.01, 0.94, 0.72, 0.005);
  b.set(BK, MAT.rubber); b.box(0.26, 1.33, 0, 0.38, 1.36, 0.05); b.box(-0.2, 0.72, -0.01, 0.14, 0.83, 0.012); // handle, number plate
  b.set(DK, MAT.rus); for (const y of [0.92, 1.36]) b.cyl(0.93, y - 0.05, 0.022, 0.93, y + 0.05, 0.022, 0.022, 0.022, 6);
  for (const s of [-1, 1]) { b.set(BK, MAT.rubber); frame(b, [[s * 1.02 - 0.06, 0.86], [s * 1.02 + 0.06, 0.86], [s * 1.02 + 0.06, 1.06], [s * 1.02 - 0.06, 1.06]], 0.016, 0, 0.035); // recessed lamp clusters
    b.set([0.16, 0.01, 0.008], MAT.paint); b.box(s * 1.02 - 0.044, 0.965, -0.01, s * 1.02 + 0.044, 1.044, 0.014); b.set([0.22, 0.095, 0.012], MAT.paint); b.box(s * 1.02 - 0.044, 0.876, -0.01, s * 1.02 + 0.044, 0.955, 0.014); }
  b.set(DK, MAT.rus); b.cyl(-0.92, 1.1, 0.03, -0.92, 1.7, 0.03, 0.028, 0.028, 6); for (const y of [1.16, 1.5]) b.cyl(-0.92, y, 0.03, -0.38, y, 0.07, 0.024, 0.024, 5, 0); b.box(-0.5, 1.18, 0.03, -0.26, 1.46, 0.085); // swing carrier: hinge post, two arms, hub plate
  onPlane(b, [0, YB, ZR], [0, 0.06, 0.52]);
  b.set(tint(0.97), MAT.rus); plate(b, [[0.22, 0.004], [0.92, 0.004], [0.91, 0.5], [0.22, 0.5]], 0, 0.022); win([[0.31, 0.1], [0.83, 0.1], [0.83, 0.42], [0.31, 0.42]], 0.022);
  b.set(BK, MAT.void); for (const x of [0.2, 0.92]) b.box(x, 0, -0.01, x + 0.02, 0.5, 0.005); b.box(0.2, 0.5, -0.01, 0.94, 0.515, 0.005);
  b.at(0, 0, 0); b.set(GD, MAT.rus); extY(b, mirror([[1.13, ZR - 0.03], [1.13, ZR + 0.1], [1.0, ZR + 0.15]]), 0.5, 0.7); b.set(DK, MAT.rus); b.cyl(0, 0.58, ZR + 0.14, 0, 0.58, ZR + 0.24, 0.04, 0.03, 6);
  b.at(-0.38, 1.32, ZR + 0.215, -Math.PI / 2); tyre(b, 0, 0, 0, 0.51, 0.26, 0, GD, { seg: 16 }); b.at(0, 0, 0);
  for (const z of AX) for (const sx of [-1, 1]) tyre(b, sx * 1.01, WR, z, WR, 0.36, z < 0 ? 3 : 4, GD);
  // ---- part 1: turntable with a traverse ring, a low wide pedestal and the yoke ----
  b.part = 1; const tz = TIGR.tz, gy = TIGR.gy, gz = TIGR.gz;
  b.set(GD, MAT.rus); b.cyl(0, 2.11, tz, 0, 2.17, tz, 0.45, 0.44, 20); b.set(DK, MAT.rus); b.cyl(0, 2.16, tz, 0, 2.205, tz, 0.35, 0.34, 16);
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; b.cyl(Math.cos(a) * 0.4, 2.16, tz + Math.sin(a) * 0.4, Math.cos(a) * 0.4, 2.19, tz + Math.sin(a) * 0.4, 0.016, 0.016, 5); }
  b.set(OL, MAT.rus); b.cyl(0, 2.2, tz, 0, 2.3, tz, 0.22, 0.18, 12); b.box(-0.2, 2.28, tz - 0.1, 0.2, 2.33, tz + 0.1);
  for (const s of [-1, 1]) { b.box(s * 0.16 - 0.025, 2.31, tz - 0.08, s * 0.16 + 0.025, gy + 0.07, tz + 0.08, 0, 0.025); b.cyl(s * 0.18, gy, gz, s * 0.215, gy, gz, 0.05, 0.05, 8); }
  b.set(BK, MAT.rubber); b.cyl(0.1, 2.2, tz + 0.24, 0.1, 2.32, tz + 0.12, 0.014, 0.014, 4, 0);
  // ---- part 2 (built about the trunnion, resting 3.5 degrees up): cradle, boxy sight with a hood, two launch containers on a beam ----
  b.part = 2; b.at(0, gy, gz, 0, 0.06); const ZM = TIGR.mz - gz;
  b.set(OL, MAT.rus); b.box(-0.125, -0.06, -0.2, 0.125, 0.08, 0.09); b.box(-0.125, -0.05, -0.6, 0.125, 0.25, -0.19); // cradle through the trunnion, sight unit
  b.box(-0.145, 0.24, -0.68, 0.145, 0.265, -0.2); for (const s of [-1, 1]) b.box(s * 0.135 - 0.01, 0.06, -0.66, s * 0.135 + 0.01, 0.25, -0.58); // hood and its cheeks
  b.box(-0.37, -0.095, -0.5, 0.37, -0.035, -0.34); // beam under the containers
  b.set(BK, MAT.void); b.box(-0.105, 0.07, -0.606, 0.03, 0.21, -0.59); b.box(0.05, 0.1, -0.606, 0.11, 0.19, -0.59); // window surrounds
  b.set([0.012, 0.008, 0.018], MAT.glass); b.box(-0.095, 0.08, -0.61, 0.02, 0.2, -0.6); b.set(GLS, MAT.glass); b.box(0.058, 0.108, -0.61, 0.102, 0.182, -0.6); // thermal and day windows
  for (const s of [-1, 1]) { const x = s * 0.29, y = 0.06;
    b.set([0.028, 0.033, 0.018], MAT.rus); b.cyl(x, y, ZM + 0.02, x, y, -0.2, 0.08, 0.08, 14, 0); // container, 1.3 m by 0.16 m
    b.cyl(x, y, ZM, x, y, ZM + 0.11, 0.092, 0.092, 14); b.cyl(x, y, -0.2, x, y, -0.05, 0.08, 0.1, 14); // front cap, flared rear
    for (const z of [ZM + 0.38, ZM + 0.66]) b.cyl(x, y, z - 0.012, x, y, z + 0.012, 0.088, 0.088, 12); // stiffening rings
    b.set(BK, MAT.rubber); b.cyl(x, y, ZM - 0.008, x, y, ZM + 0.01, 0.078, 0.082, 12); b.cyl(x, y, -0.06, x, y, -0.042, 0.09, 0.086, 12); // front cover, rear cover
    b.set(DK, MAT.rus); b.cyl(x, y, -0.47, x, y, -0.37, 0.091, 0.091, 12); b.box(x - 0.01, y + 0.075, ZM + 0.42, x + 0.01, y + 0.105, ZM + 0.56); // clamp band on the beam, carrying handle
    b.set(BK, MAT.rubber); b.cyl(s * 0.12, 0.04, 0.05, x - s * 0.03, y + 0.02, -0.1, 0.011, 0.011, 4, 0); } // cable to the cradle
  b.at(0, 0, 0);
  return b.build();
}
export const BTR = { ty: 2.02, tz: -0.75, gy: 2.25, gz: -1.05, mz: -3.55, hl: 3.0, hw: 1.2, rad: 2.6, hh: 2.02, th: 2.6, tr: 0.82, bx: 1.45, bz: 3.75, cr: 1.6, cs: 2.0, wr: 0.55, ax: [-2.35, -0.95, 0.75, 2.15] };
// BTR-82A. Below the belt line (the widest line, just over the wheels) the hull is a tub between the wheel wells with inclined side
// plates outside it, cut by four trapezoid arches; bow and stern are lofted to a narrower nose and tail. Above the belt the sides slope
// in to the roof; the upper glacis carries the folded trim vane, the steep plate above it the two windscreens with raised shutters.
// The BPPU turret is a low cone; the 2A72 lies in an external cradle over its roof (bore 0.13 m above the trunnion).
export function buildBTR() {
  const b = new MB(), G = [0.03, 0.032, 0.019], GD = [0.023, 0.025, 0.015], DK = [0.016, 0.016, 0.014], BK = [0.012, 0.012, 0.013], GLS = [0.006, 0.011, 0.011], OL = [0.026, 0.03, 0.018], RST = [0.025, 0.021, 0.016];
  const tint = (k) => [G[0] * k, G[1] * k, G[2] * k], WR = BTR.wr, AX = BTR.ax;
  const XW = 1.0, XB = 1.45, YB = 1.3, YS = 0.62, XL = 1.18, YR = 2.02, AW = 0.64, AT = 1.2, AK = 0.92, ZF = AX[0] - AW, ZE = AX[3] + AW, ZN = -3.85;
  const xo = (y) => XL + (y - YS) * (XB - XL) / (YB - YS); // the inclined lower side plate
  const warm = (v0) => { for (let i = v0 * 14 + 10; i < b.v.length; i += 14) b.v[i] = -9; };
  const lamp = (x, y, z, r, l) => { // a lamp facing -z of the current frame: dark bowl, grey lens, small core
    b.set(BK, MAT.rubber); b.cyl(x, y, z + l, x, y, z, r * 0.75, r, 9);
    b.set([0.13, 0.14, 0.14], MAT.paint); b.cyl(x, y, z + 0.01, x, y, z - 0.012, r * 0.86, r * 0.78, 9);
    b.set([0.42, 0.4, 0.34], MAT.head); b.cyl(x, y, z - 0.004, x, y, z - 0.018, r * 0.3, r * 0.26, 6); };
  const win = (P, z0) => { // armoured glass in a heavy bolted frame
    b.set(GD, MAT.rus); const I = frame(b, P, 0.045, z0, z0 + 0.045); b.set(BK, MAT.void); frame(b, I, 0.012, z0, z0 + 0.035);
    const c = cen(P); b.set(GLS, MAT.glass); poly(b, I.map((p) => [p[0], p[1], z0 + 0.008]), [c[0], c[1], -1]);
    b.set(DK, MAT.rus); for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length, ax = (P[i][0] + I[i][0]) / 2, ay = (P[i][1] + I[i][1]) / 2, bx = (P[j][0] + I[j][0]) / 2, by = (P[j][1] + I[j][1]) / 2;
      for (const t of [0, 0.5]) { const x = ax + (bx - ax) * t, y = ay + (by - ay) * t; b.box(x - 0.01, y - 0.01, z0 + 0.035, x + 0.01, y + 0.01, z0 + 0.054); } } };
  const sill = (P, sx) => loft(b, [P.map((p) => [sx * XW, p[0], p[1]]), P.map((p) => [sx * xo(p[0]), p[0], p[1]])], 0, 1); // a convex piece [y, z] outside the tub
  b.part = 0;
  // ---- hull below the belt: tub, bow, stern, side pieces between the arches ----
  b.set(G, MAT.rus); b.box(-XW, 0.5, ZF, XW, YB, ZE);
  const lr = (z, xb, xs, ys, xt, yt, zb = z) => [[-xb, YB, z], [-xs, ys, zb], [-xt, yt, zb], [xt, yt, zb], [xs, ys, zb], [xb, YB, z]];
  loft(b, [lr(ZN, 0.95, 0.93, 1.12, 0.8, 1.08), lr(ZF, XB, XL, YS, XW, 0.5)]); // pointed, upswept bow
  loft(b, [lr(ZE, XB, XL, YS, XW, 0.5), lr(3.75, 1.3, 1.15, 0.8, 0.9, 0.72, 3.61)]); // stern
  for (const sx of [-1, 1]) {
    b.set(G, MAT.rus); sill([[AT, ZF], [AT, ZE], [YB, ZE], [YB, ZF]], sx);
    AX.forEach((a, i) => { sill([[AK, a - AW], [AT, a - AW], [AT, a - 0.4]], sx); sill([[AK, a + AW], [AT, a + 0.4], [AT, a + AW]], sx);
      if (i < 3) sill([[YS, a + AW], [YS, AX[i + 1] - AW], [AT, AX[i + 1] - AW], [AT, a + AW]], sx); });
    for (const a of AX) { b.set(BK, MAT.void); poly(b, [[sx * 1.007, 0.5, a - AW + 0.01], [sx * 1.007, 0.5, a + AW - 0.01], [sx * 1.007, AT - 0.005, a + AW - 0.01], [sx * 1.007, AT - 0.005, a - AW + 0.01]], [0, 0.8, a]); // well liner
      b.set(DK, MAT.rus); b.cyl(sx * 1.0, WR, a, sx * 1.08, WR, a, 0.17, 0.15, 10, 0); b.cyl(sx * 1.02, 1.14, a + 0.3, sx * 1.05, 0.62, a + 0.1, 0.035, 0.035, 5, 0); } // hub reduction, damper
  }
  // ---- hull above the belt: sloped sides, glacis, windscreen plate, roof, engine deck falling to the tail ----
  const ur = (z, xb, xt, yt, zt = z) => [[-xb, YB, z], [-xt, yt, zt], [xt, yt, zt], [xb, YB, z]];
  b.set(G, MAT.rus); loft(b, [ur(ZN, 0.95, 0.9, 1.315), ur(ZF, XB, 1.289, 1.57), ur(-2.62, XB, 1.223, 1.68), ur(-2.25, XB, 1.02, YR), ur(2.3, XB, 1.02, YR), ur(ZE, XB, 1.01, 1.955), ur(3.35, 1.3625, 1.0, 1.88), ur(3.75, 1.3, 0.97, 1.62, 3.6)], 0, 1);
  // ---- glacis: the folded trim vane with ribs and hinges ----
  onPlane(b, [0, 1.315, ZN], [0, 1.23, -0.365]);
  b.set(tint(0.9), MAT.rus); plate(b, [[-0.84, 0.035], [0.84, 0.035], [0.98, 0.5], [-0.98, 0.5]], 0, 0.03);
  b.set(GD, MAT.rus); for (const x of [-0.56, 0, 0.56]) b.box(x - 0.02, 0.06, 0.02, x + 0.02, 0.475, 0.05); b.box(-0.9, 0.44, 0.02, 0.9, 0.47, 0.045);
  b.set(DK, MAT.rus); for (const s of [-1, 1]) { b.box(s * 0.62 - 0.05, -0.01, -0.01, s * 0.62 + 0.05, 0.07, 0.06); b.cyl(s * 0.3, 0.5, 0.03, s * 0.3, 0.78, 0.035, 0.018, 0.018, 5); } // hinges, stays
  b.set(GD, MAT.rus); b.box(-0.2, 0.9, -0.01, 0.2, 1.2, 0.03, 0.02, 0.02); // winch hatch
  // ---- windscreen plate: two windscreens, the armoured shutters raised over them ----
  onPlane(b, [0, 1.68, -2.62], [0, 0.37, -0.34]);
  for (const s of [-1, 1]) win([[s * 0.13, 0.09], [s * 0.75, 0.09], [s * 0.75, 0.39], [s * 0.13, 0.39]], 0);
  b.at(0, 0, 0);
  for (const s of [-1, 1]) { b.set(tint(0.88), MAT.rus); b.box(s * 0.44 - 0.34, 1.972, -2.62, s * 0.44 + 0.34, 2.0, -2.29); // shutter, about level
    b.set(DK, MAT.rus); for (const e of [-1, 1]) { b.cyl(s * 0.44 + e * 0.3, 1.975, -2.58, s * 0.44 + e * 0.3, 1.73, -2.56, 0.012, 0.012, 4, 0); b.cyl(s * 0.44 + e * 0.2 - 0.05, 1.99, -2.29, s * 0.44 + e * 0.2 + 0.05, 1.99, -2.29, 0.02, 0.02, 5); }
    // headlight cluster on the bow shoulder: main lamp in a guard, a small blackout lamp inboard
    const hx = s * 0.98, hz = -3.22; b.set(DK, MAT.rus); b.box(hx - 0.05, 1.48, hz, hx + 0.05, 1.58, hz + 0.1); b.box(s * 0.76 - 0.03, 1.47, hz, s * 0.76 + 0.03, 1.55, hz + 0.07);
    lamp(hx, 1.665, hz - 0.03, 0.095, 0.14); lamp(s * 0.76, 1.6, hz - 0.01, 0.055, 0.09);
    b.set(DK, MAT.rus); for (const e of [-1, 1]) b.cyl(hx + e * 0.135, 1.46, hz - 0.09, hx + e * 0.135, 1.8, hz - 0.09, 0.011, 0.011, 4, 0);
    b.cyl(hx - 0.135, 1.8, hz - 0.09, hx + 0.135, 1.8, hz - 0.09, 0.011, 0.011, 4, 0); b.cyl(hx - 0.135, 1.665, hz - 0.09, hx + 0.135, 1.665, hz - 0.09, 0.009, 0.009, 4, 0);
    for (const e of [-1, 1]) b.cyl(hx + e * 0.135, 1.8, hz - 0.09, hx + e * 0.135, 1.62, hz + 0.16, 0.011, 0.011, 4, 0);
    b.box(s * 0.6 - 0.03, 0.83, -3.7, s * 0.6 + 0.03, 0.99, -3.56); b.cyl(s * 0.6 - 0.06, 0.88, -3.69, s * 0.6 + 0.06, 0.88, -3.69, 0.025, 0.025, 6); // tow hook
    // roof: periscopes over the windscreens, driver's and commander's hatches, troop hatches, intake louvres
    for (const k of [0.2, 0.46, 0.72]) { b.set(GD, MAT.rus); b.box(s * k - 0.08, 2.0, -2.2, s * k + 0.08, 2.09, -2.07, 0, 0.012); b.set(GLS, MAT.glass); b.box(s * k - 0.06, 2.035, -2.2, s * k + 0.06, 2.075, -2.185); }
    b.set(tint(0.92), MAT.rus); b.cyl(s * 0.5, 2.01, -1.79, s * 0.5, 2.06, -1.79, 0.27, 0.265, 14); b.cyl(s * 0.5, 2.06, -1.79, s * 0.5, 2.09, -1.79, 0.255, 0.15, 14);
    b.set(DK, MAT.rus); b.box(s * 0.5 - 0.09, 2.01, -1.54, s * 0.5 + 0.09, 2.07, -1.49); b.box(s * 0.5 - 0.06, 2.085, -1.86, s * 0.5 + 0.06, 2.11, -1.83);
    b.set(tint(0.92), MAT.rus); b.box(s * 0.5 - 0.29, 2.01, 0.25, s * 0.5 + 0.29, 2.055, 0.92, 0.02, 0.02);
    b.set(DK, MAT.rus); b.box(s * 0.5 - 0.07, 2.05, 0.56, s * 0.5 + 0.07, 2.08, 0.59); for (const z of [0.4, 0.78]) b.cyl(s * 0.8, 2.04, z - 0.05, s * 0.8, 2.04, z + 0.05, 0.02, 0.02, 5);
    const w0 = b.v.length / 14; b.set(BK, MAT.void); b.box(s * 0.47 - 0.36, 2.01, 1.3, s * 0.47 + 0.36, 2.028, 2.2);
    b.set(GD, MAT.rus); for (let k = 0; k < 7; k++) b.box(s * 0.47 - 0.36, 2.015, 1.32 + k * 0.126, s * 0.47 + 0.36, 2.052, 1.39 + k * 0.126, 0, 0, 0.03);
    for (const e of [-1, 1]) b.box(s * 0.47 + e * 0.375 - 0.02, 2.01, 1.28, s * 0.47 + e * 0.375 + 0.02, 2.06, 2.22); warm(w0);
  }
  b.set(BK, MAT.rubber); b.cyl(-0.82, 2.0, 1.1, -0.82, 2.16, 1.1, 0.035, 0.025, 6); b.cyl(-0.82, 2.16, 1.1, -0.82, 2.3, 1.1, 0.016, 0.016, 5); b.cyl(-0.82, 2.3, 1.1, -0.86, 3.95, 1.25, 0.008, 0.004, 4); // aerial
  // ---- engine deck on the falling rear roof: access covers, outlet louvres ----
  onPlane(b, [0, YR, 2.3], [0, 1.05, 0.14]);
  for (const s of [-1, 1]) { b.set(tint(0.94), MAT.rus); plate(b, [[s * 0.1, -0.1], [s * 0.82, -0.1], [s * 0.82, -0.6], [s * 0.1, -0.6]], 0, 0.025);
    b.set(DK, MAT.rus); b.box(s * 0.46 - 0.07, -0.37, 0.02, s * 0.46 + 0.07, -0.34, 0.05); for (const y of [-0.2, -0.5]) b.cyl(s * 0.83, y - 0.05, 0.02, s * 0.83, y + 0.05, 0.02, 0.02, 0.02, 5); }
  let w0 = b.v.length / 14; b.set(BK, MAT.void); b.box(-0.82, -1.0, -0.01, 0.82, -0.68, 0.012);
  b.set(GD, MAT.rus); for (let k = 0; k < 6; k++) b.box(-0.82, -0.995 + k * 0.053, 0.0, 0.82, -0.96 + k * 0.053, 0.04, 0, 0.012); b.box(-0.02, -1.0, 0, 0.02, -0.68, 0.045); for (const s of [-1, 1]) b.box(s * 0.84 - 0.02, -1.01, -0.01, s * 0.84 + 0.02, -0.67, 0.048); warm(w0);
  // ---- sides: door leaves between axles 2 and 3, firing ports with vision blocks, silencers, tools ----
  for (const sx of [-1, 1]) { const Z = (P) => P.map((p) => [-sx * p[0], p[1]]), X = (z) => -sx * z, lb = (z0, z1, y0, y1, d0, d1) => b.box(Math.min(-sx * z0, -sx * z1), y0, d0, Math.max(-sx * z0, -sx * z1), y1, d1);
    onPlane(b, [sx * XB, YB, 0], [sx * 0.72, 0.43, 0]);
    const DU = Z([[-0.47, 0.012], [0.27, 0.012], [0.27, 0.5], [-0.47, 0.5]]);
    b.set(tint(1.08), MAT.rus); plate(b, DU, 0, 0.022); frame(b, inset(DU, 0.07), 0.016, 0.022, 0.03); // upper leaf (opens upward)
    b.set(BK, MAT.void); for (const z of [-0.49, 0.27]) lb(z, z + 0.02, 0, 0.52, -0.01, 0.005); lb(-0.49, 0.29, 0.5, 0.52, -0.01, 0.005);
    b.set(DK, MAT.rus); for (const z of [-0.3, 0.1]) b.cyl(X(z - 0.05), 0.515, 0.02, X(z + 0.05), 0.515, 0.02, 0.02, 0.02, 6);
    b.set(BK, MAT.rubber); lb(-0.16, -0.04, 0.09, 0.12, 0, 0.05);
    for (const z of [-1.7, -0.95, -0.1, 0.85]) { const d = z === -0.1 ? 0.022 : 0;
      b.set(GD, MAT.rus); b.cyl(X(z), 0.3, d - 0.005, X(z), 0.3, d + 0.035, 0.11, 0.1, 8); b.set(tint(0.8), MAT.rus); b.cyl(X(z), 0.3, d + 0.03, X(z), 0.3, d + 0.05, 0.07, 0.065, 8); b.set(BK, MAT.rubber); b.box(X(z) - 0.012, 0.27, d + 0.045, X(z) + 0.012, 0.33, d + 0.065); // firing port
      if (!d) { b.set(GD, MAT.rus); lb(z - 0.1, z + 0.1, 0.66, 0.775, -0.005, 0.06); b.set(GLS, MAT.glass); lb(z - 0.075, z + 0.075, 0.685, 0.75, 0.05, 0.066); } } // vision block
    b.set(GD, MAT.rus); b.cyl(X(-2.1), 0.76, 0.05, X(-0.65), 0.76, 0.05, 0.014, 0.014, 4); for (const z of [-2.1, -1.37, -0.65]) b.cyl(X(z), 0.76, -0.01, X(z), 0.76, 0.05, 0.012, 0.012, 4, 0); // hand rail
    const v0 = b.v.length / 14; b.set(RST, MAT.rus); b.cyl(X(1.72), 0.42, 0.135, X(3.0), 0.42, 0.135, 0.1, 0.1, 10); b.cyl(X(1.58), 0.42, 0.11, X(1.72), 0.42, 0.135, 0.045, 0.1, 10, 0); // silencer
    b.cyl(X(3.0), 0.42, 0.135, X(3.24), 0.4, 0.15, 0.04, 0.04, 6); b.set(DK, MAT.rus); for (const z of [1.98, 2.76]) { b.cyl(X(z - 0.025), 0.42, 0.135, X(z + 0.025), 0.42, 0.135, 0.108, 0.108, 10); lb(z - 0.03, z + 0.03, 0.36, 0.48, -0.01, 0.06); }
    warm(v0);
    if (sx < 0) { b.set([0.05, 0.036, 0.02], MAT.rus); b.cyl(X(-2.72), 0.17, 0.03, X(-1.95), 0.17, 0.03, 0.017, 0.017, 5); b.set(DK, MAT.rus); plate(b, Z([[-2.97, 0.17], [-2.9, 0.09], [-2.72, 0.1], [-2.72, 0.24], [-2.9, 0.25]]), 0, 0.02); for (const z of [-2.5, -2.1]) lb(z, z + 0.03, 0.14, 0.2, 0, 0.05); } // shovel
    else { b.set(DK, MAT.rus); b.cyl(X(-2.85), 0.16, 0.025, X(-1.4), 0.16, 0.025, 0.018, 0.018, 5); for (const z of [-2.9, -1.35]) b.cyl(X(z), 0.16, 0, X(z), 0.16, 0.035, 0.05, 0.05, 8); for (const z of [-2.4, -1.9]) lb(z, z + 0.03, 0.13, 0.19, 0, 0.045); } // tow cable
    onPlane(b, [sx * XB, YB, 0], [sx * 0.68, -0.27, 0]);
    b.set(tint(1.08), MAT.rus); plate(b, Z([[-0.27, -0.69], [0.07, -0.69], [0.07, -0.4], [-0.27, -0.4]]), 0, 0.02); plate(b, Z([[-0.27, -0.4], [0.07, -0.4], [0.27, -0.12], [0.27, -0.02], [-0.47, -0.02], [-0.47, -0.12]]), 0, 0.02); // lower leaf (drops as a step)
    b.set(BK, MAT.void); lb(-0.295, -0.27, -0.7, -0.4, -0.01, 0.004); lb(0.07, 0.095, -0.7, -0.4, -0.01, 0.004); lb(-0.49, -0.47, -0.12, 0, -0.01, 0.004); lb(0.27, 0.29, -0.12, 0, -0.01, 0.004);
    b.set(DK, MAT.rus); for (const z of [-0.2, 0]) b.cyl(X(z - 0.04), -0.71, 0.015, X(z + 0.04), -0.71, 0.015, 0.02, 0.02, 6); lb(-0.2, 0, -0.3, -0.27, 0.01, 0.05); // hinges, step rung
  }
  // ---- rear: lamp clusters and covers on the upper plate, water-jet outlet with its two-leaf cover, tow hooks ----
  onPlane(b, [0, YB, 3.75], [0, 0.15, 0.32]);
  for (const s of [-1, 1]) { b.set(tint(0.95), MAT.rus); plate(b, [[s * 0.08, 0.05], [s * 0.74, 0.05], [s * 0.74, 0.3], [s * 0.08, 0.3]], 0, 0.02);
    b.set(BK, MAT.rubber); frame(b, [[s * 0.98 - 0.09, 0.09], [s * 0.98 + 0.09, 0.09], [s * 0.98 + 0.09, 0.25], [s * 0.98 - 0.09, 0.25]], 0.016, 0, 0.035);
    b.set([0.16, 0.01, 0.008], MAT.paint); b.box(s * 0.98 - 0.07, 0.108, -0.01, s * 0.98, 0.232, 0.016); b.set([0.22, 0.095, 0.012], MAT.paint); b.box(s * 0.98, 0.108, -0.01, s * 0.98 + 0.07, 0.232, 0.016); }
  onPlane(b, [0, YB, 3.75], [0, -0.14, 0.5]);
  b.set(GD, MAT.rus); b.cyl(0, -0.27, -0.03, 0, -0.27, 0.05, 0.28, 0.26, 16); b.set(tint(0.9), MAT.rus); b.cyl(0, -0.27, 0.05, 0, -0.27, 0.07, 0.235, 0.225, 16);
  b.set(BK, MAT.void); b.box(-0.01, -0.5, 0.06, 0.01, -0.04, 0.074); b.set(DK, MAT.rus); for (const s of [-1, 1]) { for (const y of [-0.38, -0.16]) b.box(s * 0.27 - 0.04, y - 0.03, 0, s * 0.27 + 0.04, y + 0.03, 0.075);
    b.box(s * 0.78 - 0.03, -0.42, -0.02, s * 0.78 + 0.03, -0.28, 0.1); b.cyl(s * 0.78 - 0.06, -0.37, 0.09, s * 0.78 + 0.06, -0.37, 0.09, 0.025, 0.025, 6); }
  b.box(-0.06, -0.52, -0.02, 0.06, -0.44, 0.12);
  b.at(0, 0, 0);
  AX.forEach((z, i) => { for (const sx of [-1, 1]) tyre(b, sx * 1.22, WR, z, WR, 0.36, 3 + i, GD, { seg: 16 }); });
  // ---- part 1: BPPU turret, a low truncated cone; trunnion cheeks, sight, hatch and smoke dischargers on it ----
  b.part = 1; const tz = BTR.tz, gy = BTR.gy, gz = BTR.gz, TR = 2.22;
  b.set(GD, MAT.rus); b.cyl(0, 2.015, tz, 0, 2.06, tz, 0.86, 0.85, 20); b.set(G, MAT.rus); b.cyl(0, 2.05, tz, 0, TR, tz, 0.82, 0.66, 20);
  for (const s of [-1, 1]) { b.box(s * 0.2 - 0.03, TR - 0.03, gz - 0.14, s * 0.2 + 0.03, gy + 0.19, gz + 0.14, 0, 0.05); b.set(DK, MAT.rus); b.cyl(s * 0.22, gy + 0.04, gz, s * 0.255, gy + 0.04, gz, 0.05, 0.045, 8); b.set(G, MAT.rus); }
  b.set(tint(0.92), MAT.rus); b.cyl(0.15, TR - 0.01, tz + 0.32, 0.15, TR + 0.035, tz + 0.32, 0.25, 0.24, 12); b.set(DK, MAT.rus); b.box(0.07, TR, tz + 0.55, 0.23, TR + 0.05, tz + 0.6); b.box(0.1, TR + 0.03, tz + 0.2, 0.2, TR + 0.06, tz + 0.23);
  b.set(OL, MAT.rus); b.box(-0.5, TR - 0.03, tz - 0.38, -0.28, 2.46, tz - 0.08, 0.008); b.box(-0.52, 2.46, tz - 0.44, -0.26, 2.485, tz - 0.08); // sight box with a hood
  b.set(BK, MAT.void); b.box(-0.475, 2.29, tz - 0.386, -0.305, 2.44, tz - 0.37); b.set([0.012, 0.008, 0.018], MAT.glass); b.box(-0.465, 2.3, tz - 0.39, -0.315, 2.43, tz - 0.38);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const a = 1.95 + k * 0.3, px = s * Math.sin(a) * 0.71, pz = tz - Math.cos(a) * 0.71; // 81 mm smoke dischargers
    b.set(DK, MAT.rus); b.cyl(px, 2.11, pz, px + s * 0.05, 2.3, pz - 0.2, 0.046, 0.046, 7); b.set(BK, MAT.rubber); b.cyl(px + s * 0.05, 2.3, pz - 0.2, px + s * 0.053, 2.31, pz - 0.21, 0.04, 0.04, 6); }
  b.set(DK, MAT.rus); b.cyl(-0.3, TR - 0.01, tz + 0.38, -0.3, TR + 0.05, tz + 0.38, 0.09, 0.07, 8); // ventilator
  // ---- part 2 (about the trunnion): cradle and receiver cover, the slender 2A72 with its muzzle brake, coaxial PKTM, searchlight ----
  b.part = 2; b.at(0, gy, gz); const ZM = BTR.mz - gz, by = 0.13;
  b.set(OL, MAT.rus); b.box(-0.14, 0.02, -0.62, 0.14, 0.25, 0.22, 0.025, 0.03); b.box(-0.1, 0.035, -0.92, 0.1, 0.225, -0.62, 0.02, 0);
  b.set(DK, MAT.rus); for (const s of [-1, 1]) b.cyl(s * 0.13, 0.04, 0, s * 0.172, 0.04, 0, 0.05, 0.05, 8);
  b.cyl(0, by, -0.92, 0, by, -1.25, 0.058, 0.046, 10); b.cyl(0, by, -1.25, 0, by, ZM + 0.2, 0.031, 0.025, 8, 0); // sleeve, barrel
  b.cyl(0, by, ZM + 0.27, 0, by, ZM + 0.2, 0.025, 0.041, 8, 0); b.cyl(0, by, ZM + 0.2, 0, by, ZM, 0.041, 0.041, 8); b.set(BK, MAT.void); b.cyl(0, by, ZM + 0.01, 0, by, ZM - 0.002, 0.018, 0.018, 6); // muzzle brake
  b.set(OL, MAT.rus); b.box(0.14, 0.03, -0.6, 0.3, 0.18, -0.2); b.set(DK, MAT.rus); b.cyl(0.22, 0.1, -0.6, 0.22, 0.1, -1.02, 0.021, 0.016, 6); b.cyl(0.22, 0.1, -1.02, 0.22, 0.1, -1.1, 0.024, 0.02, 6); // PKTM
  b.box(-0.22, 0.08, -0.52, -0.14, 0.15, -0.4); lamp(-0.29, 0.13, -0.56, 0.078, 0.13); // searchlight on the cradle
  b.at(0, 0, 0);
  return b.build();
}
