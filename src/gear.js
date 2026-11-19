// Shared mesh helpers for the tracked vehicles and their running gear (belts, link bars, wheels, sprocket, idler).
// The track loop constants must match objdeform.wgsl.
import { MAT } from './mesh.js';

export const TRK = { A: 2.95, R: 0.4, yc: 0.42, x: 1.43, w: 0.64 };

// flat polygon whose normal agrees with the hint h (any direction on the outside of the face)
export function face(b, P, h) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
  const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return;
  nx /= l; ny /= l; nz /= l;
  const flip = nx * h[0] + ny * h[1] + nz * h[2] < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const base = b.v.length / 14;
  for (const p of P) b.vert(p[0], p[1], p[2], nx, ny, nz, 0, 0);
  for (let i = 1; i < P.length - 1; i++) { if (flip) b.i.push(base, base + i + 1, base + i); else b.i.push(base, base + i, base + i + 1); }
}
// box with chamfered edges (c); 44 triangles
export function cbox(b, x0, y0, z0, x1, y1, z1, c = 0.015) {
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  c = Math.min(c, (x1 - x0) * 0.45, (y1 - y0) * 0.45, (z1 - z0) * 0.45);
  // P(corner bits, face axis): the corner of the face that is normal to that axis
  const P = (k, ax) => { const p = [0, 0, 0]; for (let a = 0; a < 3; a++) { const up = (k >> a) & 1; p[a] = a === ax ? (up ? hi[a] : lo[a]) : (up ? hi[a] - c : lo[a] + c); } return p; };
  for (let ax = 0; ax < 3; ax++) {
    const u = (ax + 1) % 3, w = (ax + 2) % 3;
    for (let s = 0; s < 2; s++) {
      const k0 = s << ax, h = [0, 0, 0]; h[ax] = s ? 1 : -1;
      face(b, [P(k0, ax), P(k0 | (1 << u), ax), P(k0 | (1 << u) | (1 << w), ax), P(k0 | (1 << w), ax)], h);
    }
    // the four edges running along ax
    for (let s = 0; s < 4; s++) {
      const k0 = ((s & 1) << u) | ((s >> 1) << w), k1 = k0 | (1 << ax), h = [0, 0, 0]; h[u] = (s & 1) ? 1 : -1; h[w] = (s >> 1) ? 1 : -1;
      face(b, [P(k0, u), P(k1, u), P(k1, w), P(k0, w)], h);
    }
  }
  for (let k = 0; k < 8; k++) face(b, [P(k, 0), P(k, 1), P(k, 2)], [(k & 1) ? 1 : -1, (k & 2) ? 1 : -1, (k & 4) ? 1 : -1]);
}
// thin plate standing t proud of a surface: Q = its outline on the surface, n = the surface normal
export function plate(b, Q, n, t) {
  const T = Q.map((p) => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t]);
  let cx = 0, cy = 0, cz = 0; for (const p of Q) { cx += p[0]; cy += p[1]; cz += p[2]; } cx /= Q.length; cy /= Q.length; cz /= Q.length;
  face(b, T, n);
  for (let i = 0; i < Q.length; i++) { const j = (i + 1) % Q.length; face(b, [Q[i], Q[j], T[j], T[i]], [(Q[i][0] + Q[j][0]) / 2 - cx, (Q[i][1] + Q[j][1]) / 2 - cy, (Q[i][2] + Q[j][2]) / 2 - cz]); }
}
// surface of revolution about axis ax (0 x, 1 y, 2 z) through (cx, cy, cz): prof = [[a, r, mat?, col?], ...] (a along the axis, scaled by sa).
// Flat across the profile segments unless sm; smooth round the axis. A segment takes the material / colour of its first point when given.
export function lathe(b, ax, cx, cy, cz, prof, seg, sa = 1, sm = false, inv = false) {
  const n = prof.length, C = [cx, cy, cz], u = (ax + 1) % 3, w = (ax + 2) % 3;
  // the solid lies between the axis and the profile (inv: outside it, as for a bore)
  const cl = prof.concat([[prof[n - 1][0], 0], [prof[0][0], 0]]); let ar = 0;
  for (let i = 0; i < cl.length; i++) { const p = cl[i], q = cl[(i + 1) % cl.length]; ar += p[0] * sa * q[1] - q[0] * sa * p[1]; }
  const s = (ar > 0 ? 1 : -1) * (inv ? -1 : 1);
  const SN = [];
  for (let i = 0; i < n - 1; i++) { const ta = (prof[i + 1][0] - prof[i][0]) * sa, tr = prof[i + 1][1] - prof[i][1], l = Math.hypot(ta, tr) || 1; SN.push([s * tr / l, -s * ta / l]); }
  const V = (p, nn, t) => { const c = Math.cos(t), sn = Math.sin(t), P = [0, 0, 0], N = [0, 0, 0]; P[ax] = C[ax] + p[0] * sa; P[u] = C[u] + p[1] * c; P[w] = C[w] + p[1] * sn; N[ax] = nn[0]; N[u] = nn[1] * c; N[w] = nn[1] * sn; return b.vert(P[0], P[1], P[2], N[0], N[1], N[2], 0.1, 0); };
  const c0 = b.c, m0 = b.mat;
  for (let i = 0; i < n - 1; i++) {
    const p = prof[i], q = prof[i + 1]; if (p[2] !== undefined) b.mat = p[2]; if (p[3]) b.c = p[3];
    let na = SN[i], nb = SN[i];
    if (sm) { const a = SN[Math.max(i - 1, 0)], c = SN[Math.min(i + 1, n - 2)]; na = [a[0] + SN[i][0], a[1] + SN[i][1]]; nb = [c[0] + SN[i][0], c[1] + SN[i][1]]; let l = Math.hypot(na[0], na[1]) || 1; na = [na[0] / l, na[1] / l]; l = Math.hypot(nb[0], nb[1]) || 1; nb = [nb[0] / l, nb[1] / l]; }
    const base = b.v.length / 14;
    for (let k = 0; k <= seg; k++) { const t = k / seg * Math.PI * 2; V(p, na, t); V(q, nb, t); }
    for (let k = 0; k < seg; k++) { const e = base + k * 2; if (p[1] > 1e-4) b.i.push(e, e + 2, e + 1); if (q[1] > 1e-4) b.i.push(e + 1, e + 2, e + 3); }
  }
  b.c = c0; b.mat = m0;
}
// tube along a polyline
export function pipe(b, P, r, seg = 6) { for (let i = 0; i < P.length - 1; i++) b.cyl(P[i][0], P[i][1], P[i][2], P[i + 1][0], P[i + 1][1], P[i + 1][2], r, r, seg, i === 0 || i === P.length - 2 ? 1 : 0); }
// make every triangle from index i0 wind the way its vertex normals point (the helpers above only guarantee the normals)
export function fixWinding(b, i0 = 0) {
  const v = b.v, I = b.i;
  for (let k = i0; k < I.length; k += 3) {
    const a = I[k] * 14, c = I[k + 1] * 14, d = I[k + 2] * 14;
    const ux = v[c] - v[a], uy = v[c + 1] - v[a + 1], uz = v[c + 2] - v[a + 2], wx = v[d] - v[a], wy = v[d + 1] - v[a + 1], wz = v[d + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * (v[a + 3] + v[c + 3] + v[d + 3]) + ny * (v[a + 4] + v[c + 4] + v[d + 4]) + nz * (v[a + 5] + v[c + 5] + v[d + 5]) < 0) { I[k + 1] = d / 14; I[k + 2] = c / 14; }
  }
}
// toothed ring about the x axis between xa and xb: n teeth from radius r0 to r1, both side faces closed to the axis
function cog(b, xa, xb, cy, cz, r0, r1, n) {
  const P = [];
  for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2, d = Math.PI * 2 / n; for (const [o, r] of [[-0.3, r0], [-0.13, r1], [0.13, r1], [0.3, r0]]) P.push([cy + Math.cos(t + o * d) * r, cz + Math.sin(t + o * d) * r]); }
  const m = P.length;
  for (let i = 0; i < m; i++) {
    const p = P[i], q = P[(i + 1) % m], hy = (p[0] + q[0]) / 2 - cy, hz = (p[1] + q[1]) / 2 - cz;
    face(b, [[xa, p[0], p[1]], [xb, p[0], p[1]], [xb, q[0], q[1]], [xa, q[0], q[1]]], [0, hy + (q[1] - p[1]) * 0, hz]);
    face(b, [[xa, cy, cz], [xa, p[0], p[1]], [xa, q[0], q[1]]], [xa - xb, 0, 0]); face(b, [[xb, cy, cz], [xb, p[0], p[1]], [xb, q[0], q[1]]], [xb - xa, 0, 0]);
  }
}

// running gear shared by all tanks: animated belts and link bars, dual road wheels, return rollers, idler (front) and sprocket (rear).
// hi: track links with rubber pads and end connectors (the player's tank)
export function runningGear(b, nWheel, wr, z0, z1, wc, hi = false) {
  const { A, R, yc } = TRK, L = 4 * A + 2 * Math.PI * R, DARK = [0.03, 0.031, 0.034], i0 = b.i.length;
  const STL = [0.17, 0.17, 0.165], HUB = [wc[0] * 0.8, wc[1] * 0.8, wc[2] * 0.8], WM = MAT.wheel, RB = MAT.rubber;
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
      const s0 = k / NBAR * L; let col = [0.3, 0.31, 0.33];
      const V = (x, al, out, nx, na, no) => { b.v.push(x, al, out, nx, na, no, col[0], col[1], col[2], MAT.bar, s0, side, 0, 0); return b.v.length / 14 - 1; };
      const Q = (p, q, r, s2, n) => { const a = V(...p, ...n), c = V(...q, ...n), d = V(...r, ...n), e = V(...s2, ...n); b.i.push(a, c, d, a, d, e); };
      if (!hi) {
        const hw = 0.07, ht = 0.05;
        Q([x0, -hw, 0], [x1, -hw, 0], [x1, -hw * 0.7, ht], [x0, -hw * 0.7, ht], [0, -1, 0.3]);
        Q([x1, hw, 0], [x0, hw, 0], [x0, hw * 0.7, ht], [x1, hw * 0.7, ht], [0, 1, 0.3]);
        Q([x0, -hw * 0.7, ht], [x1, -hw * 0.7, ht], [x1, hw * 0.7, ht], [x0, hw * 0.7, ht], [0, 0, 1]);
        Q([x0, -hw, 0], [x0, -hw * 0.7, ht], [x0, hw * 0.7, ht], [x0, hw, 0], [-1, 0, 0]);
        Q([x1, hw, 0], [x1, hw * 0.7, ht], [x1, -hw * 0.7, ht], [x1, -hw, 0], [1, 0, 0]);
        continue;
      }
      // link body, two rubber pads, an end connector on the outer edge
      const blk = (xa, xb, hw, o0, o1, ends) => {
        const h2 = hw * 0.8;
        Q([xa, -hw, o0], [xb, -hw, o0], [xb, -h2, o1], [xa, -h2, o1], [0, -1, 0.35]);
        Q([xb, hw, o0], [xa, hw, o0], [xa, h2, o1], [xb, h2, o1], [0, 1, 0.35]);
        Q([xa, -h2, o1], [xb, -h2, o1], [xb, h2, o1], [xa, h2, o1], [0, 0, 1]);
        if (ends & 1) Q([xa, -hw, o0], [xa, -h2, o1], [xa, h2, o1], [xa, hw, o0], [-1, 0, 0]);
        if (ends & 2) Q([xb, hw, o0], [xb, h2, o1], [xb, -h2, o1], [xb, -hw, o0], [1, 0, 0]);
      };
      col = [0.2, 0.2, 0.2]; blk(x0 + 0.03, x1 - 0.03, 0.08, 0, 0.028, 0);
      col = [0.035, 0.035, 0.037]; blk(x0 + 0.075, cx - 0.04, 0.062, 0.028, 0.058, 3); blk(cx + 0.04, x1 - 0.075, 0.062, 0.028, 0.058, 3);
      col = [0.24, 0.24, 0.235]; if (side < 0) blk(x0, x0 + 0.055, 0.05, 0, 0.046, 1); else blk(x1 - 0.055, x1, 0.05, 0, 0.046, 2);
    }
    // dual road wheels: the outer disc is turned (hub cap, bolt flange, dished disc, rim, rubber tyre), the inner one is plain
    const wy = yc - R + wr, xo = cx + side * 0.28, sg = hi ? 14 : 10;
    b.set(wc, WM);
    for (let k = 0; k < nWheel; k++) {
      const z = z0 + k * (z1 - z0) / (nWheel - 1);
      lathe(b, 0, xo, wy, z, [[0.045, 0, WM, HUB], [0.045, 0.14 * wr], [0.02, 0.22 * wr], [0.0, 0.38 * wr, WM, wc], [-0.042, 0.47 * wr], [-0.042, 0.66 * wr], [-0.008, 0.74 * wr, RB, DARK], [0.0, 0.77 * wr], [0.0, 0.94 * wr], [-0.035, wr], [-0.22, wr]], sg, side);
      b.set(DARK, RB); b.cyl(cx - side * 0.06, wy, z, cx - side * 0.28, wy, z, wr, wr, sg - 2); b.set(wc, WM);
    }
    // return rollers under the upper run
    const nr = nWheel > 6 ? 4 : 3;
    for (let k = 0; k < nr; k++) { const z = z0 + (k + 0.5) * (z1 - z0) / nr; b.cyl(cx + side * 0.05, yc + R - 0.13, z, cx + side * 0.27, yc + R - 0.13, z, 0.1, 0.1, 8); }
    // idler at the front: a steel wheel with a deep dish
    const ri = R - 0.035;
    lathe(b, 0, xo, yc, -A, [[0.04, 0, WM, HUB], [0.04, 0.09], [0.012, 0.15], [-0.035, 0.23, WM, wc], [-0.035, 0.29], [0.0, 0.325], [0.0, ri], [-0.22, ri]], sg, side);
    b.cyl(cx - side * 0.06, yc, -A, cx - side * 0.28, yc, -A, ri, ri, 12);
    // sprocket at the rear: hub and drum with two toothed rings
    lathe(b, 0, xo, yc, A, [[0.06, 0, WM, HUB], [0.06, 0.08], [0.035, 0.125], [0.012, 0.25, WM, wc], [-0.03, 0.27], [-0.03, 0.2], [-0.5, 0.2]], 12, side);
    b.set(STL, WM); cog(b, xo - side * 0.035, xo - side * 0.075, yc, A, 0.34, 0.385, 12); if (hi) cog(b, xo - side * 0.47, xo - side * 0.51, yc, A, 0.34, 0.385, 12); else b.cyl(xo - side * 0.47, yc, A, xo - side * 0.51, yc, A, 0.36, 0.36, 11);
    b.set([0.1, 0.1, 0.11], MAT.metal); b.box(cx - 0.05, yc - 0.12, -A, cx + 0.05, yc + 0.1, A);
  }
  fixWinding(b, i0);
}
