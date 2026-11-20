// Shared mesh helpers for the tracked vehicles and their running gear (belts, link bars, wheels, sprocket, idler).
// The track loop tables are generated here for both the mesh and objdeform.wgsl (TRACK_WGSL).
import { MAT } from './mesh.js';

export const TRK = { x: 1.43, w: 0.64 }; // track centre line and width; the loop shapes are in GEAR

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
// uvr: write uv = (r / uvr)(cos, sin) for MAT.wheel (in object.wgsl: bolt ring at 0.31, dish 0.36-0.78, rubber tyre beyond 0.76; a constant
// uv outside the pattern otherwise)
export function lathe(b, ax, cx, cy, cz, prof, seg, sa = 1, sm = false, inv = false, uvr = 0) {
  const n = prof.length, C = [cx, cy, cz], u = (ax + 1) % 3, w = (ax + 2) % 3;
  // the solid lies between the axis and the profile (inv: outside it, as for a bore)
  const cl = prof.concat([[prof[n - 1][0], 0], [prof[0][0], 0]]); let ar = 0;
  for (let i = 0; i < cl.length; i++) { const p = cl[i], q = cl[(i + 1) % cl.length]; ar += p[0] * sa * q[1] - q[0] * sa * p[1]; }
  const s = (ar > 0 ? 1 : -1) * (inv ? -1 : 1);
  const SN = [];
  for (let i = 0; i < n - 1; i++) { const ta = (prof[i + 1][0] - prof[i][0]) * sa, tr = prof[i + 1][1] - prof[i][1], l = Math.hypot(ta, tr) || 1; SN.push([s * tr / l, -s * ta / l]); }
  const V = (p, nn, t) => { const c = Math.cos(t), sn = Math.sin(t), P = [0, 0, 0], N = [0, 0, 0]; P[ax] = C[ax] + p[0] * sa; P[u] = C[u] + p[1] * c; P[w] = C[w] + p[1] * sn; N[ax] = nn[0]; N[u] = nn[1] * c; N[w] = nn[1] * sn; return b.vert(P[0], P[1], P[2], N[0], N[1], N[2], uvr ? p[1] / uvr * c : 3, uvr ? p[1] / uvr * sn : 0); };
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
    face(b, [[xa, p[0], p[1]], [xb, p[0], p[1]], [xb, q[0], q[1]], [xa, q[0], q[1]]], [0, hy, hz]);
    face(b, [[xa, cy, cz], [xa, p[0], p[1]], [xa, q[0], q[1]]], [xa - xb, 0, 0]); face(b, [[xb, cy, cz], [xb, p[0], p[1]], [xb, q[0], q[1]]], [xb - xa, 0, 0]);
  }
}

// ---------- track loops ----------
// Per tracked vehicle (0 Leopard, 1 T-72, 2 BMP): n road wheels of radius wr from z0 to z1, idler (front) and sprocket (rear) as [z, y, r],
// link thickness t (the road wheels stand on the links, so the link's outer face is the ground line).
export const GEAR = [
  { n: 7, wr: 0.35, z0: -2.36, z1: 2.56, id: [-3.0, 0.61, 0.25], sp: [3.36, 0.59, 0.3], t: 0.07 },
  { n: 6, wr: 0.375, z0: -2.4, z1: 2.3, id: [-3.08, 0.6, 0.25], sp: [3.0, 0.57, 0.28], t: 0.05 },
  { n: 6, wr: 0.3, z0: -2.4, z1: 2.45, id: [-3.0, 0.56, 0.24], sp: [3.0, 0.56, 0.27], t: 0.05 }];
// The loop is the convex hull of four circles (first road wheel, last road wheel, sprocket, idler): 4 straight runs and 4 arcs, in the
// direction the lower run moves when driving forward (to the rear). A segment is { s (start), r (0 = straight), py, pz, oy, oz (straight:
// start point and outward normal; arc: centre), f0 (arc: start angle; outward = (-cos f, sin f) in (y, z)), len }. The tangent is (o.z, -o.y).
export function trackLoop(g) {
  const wy = g.wr + g.t, C = [[wy, g.z0, g.wr], [wy, g.z1, g.wr], [g.sp[1], g.sp[0], g.sp[2]], [g.id[1], g.id[0], g.id[2]]], O = [], seg = [];
  for (let i = 0; i < 4; i++) {
    const a = C[i], c = C[(i + 1) % 4], dy = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dy, dz), ty = dy / L, tz = dz / L, k = (a[2] - c[2]) / L, q = Math.sqrt(1 - k * k);
    O.push([ty * k - tz * q, tz * k + ty * q, L * q]);
  }
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = C[i], c = C[(i + 1) % 4], o = O[i], o2 = O[(i + 1) % 4];
    seg.push({ s, r: 0, py: a[0] + a[2] * o[0], pz: a[1] + a[2] * o[1], oy: o[0], oz: o[1], f0: 0, len: o[2] }); s += o[2];
    const f0 = Math.atan2(o[1], -o[0]); let d = Math.atan2(o2[1], -o2[0]) - f0; while (d < 0) d += Math.PI * 2;
    seg.push({ s, r: c[2], py: c[0], pz: c[1], oy: 0, oz: 0, f0, len: c[2] * d }); s += c[2] * d;
  }
  return { seg, L: s };
}
export const LOOPS = GEAR.map(trackLoop);
// point on a loop: out = [y, z, outward y, outward z]
export function loopAt(lp, s, out) {
  s -= Math.floor(s / lp.L) * lp.L; let g = lp.seg[0]; for (const q of lp.seg) if (s >= q.s) g = q;
  const u = s - g.s;
  if (g.r > 0) { const f = g.f0 + u / g.r; out[2] = -Math.cos(f); out[3] = Math.sin(f); out[0] = g.py + g.r * out[2]; out[1] = g.pz + g.r * out[3]; }
  else { out[2] = g.oy; out[3] = g.oz; out[0] = g.py + g.oz * u; out[1] = g.pz - g.oy * u; }
  return out;
}
// the same tables for objdeform.wgsl (main.js puts this in front of it): two vec4 per segment, 8 segments per vehicle
const f6 = (v) => { const t = v.toFixed(6); return t.includes('.') ? t : t + '.0'; };
export const TRACK_WGSL = `const TRKL=array<f32,${LOOPS.length}>(${LOOPS.map((l) => f6(l.L)).join(',')});const TRKT=array<vec4f,${LOOPS.length * 16}>(${LOOPS.map((l) => l.seg.map((g) => `vec4f(${f6(g.s)},${f6(g.r)},${f6(g.f0)},0.0),vec4f(${f6(g.py)},${f6(g.pz)},${f6(g.oy)},${f6(g.oz)})`).join(',')).join(',')});\n`;

// running gear of a tracked vehicle (type = index into GEAR): animated belts and link bars, dual road wheels, return rollers, swing arms,
// idler and sprocket. hi: track links with rubber pads and end connectors, rounder wheels (the player's tank)
export function runningGear(b, type, wc, hi = false) {
  const g = GEAR[type], lp = LOOPS[type], L = lp.L, wr = g.wr, DARK = [0.03, 0.031, 0.034], i0 = b.i.length, Q4 = [0, 0, 0, 0];
  const STL = [0.028, 0.028, 0.03], HUB = [wc[0] * 0.8, wc[1] * 0.8, wc[2] * 0.8], WM = MAT.wheel, RB = MAT.rubber;
  for (const side of [-1, 1]) {
    const cx = side * TRK.x, x0 = cx - TRK.w / 2, x1 = cx + TRK.w / 2;
    b.part = 0; b.set(DARK, MAT.rubber);
    // the belt under the links: sampled at the segment joints and along the arcs
    const P = [];
    for (const q of lp.seg) { const n = q.r > 0 ? Math.max(2, Math.ceil(q.len / (q.r * 0.26))) : 1; for (let k = 0; k < n; k++) { const sv = q.s + q.len * k / n; loopAt(lp, sv + 1e-7, Q4); P.push([Q4[0], Q4[1], Q4[2], Q4[3], sv]); } }
    P.push([P[0][0], P[0][1], P[0][2], P[0][3], L]);
    for (let i = 0; i < P.length - 1; i++) {
      const p = P[i], q = P[i + 1], xa = x0 + 0.02, xb = x1 - 0.02;
      const a = b.vert(xa, p[0], p[1], 0, p[2], p[3], 0, p[4]), c = b.vert(xb, p[0], p[1], 0, p[2], p[3], 1, p[4]), d = b.vert(xb, q[0], q[1], 0, q[2], q[3], 1, q[4]), e = b.vert(xa, q[0], q[1], 0, q[2], q[3], 0, q[4]);
      b.i.push(a, c, d, a, d, e);
    }
    // track links (animated along the loop in the vertex shader): pos = (x, along, outward), uv = (s0, side), last float = vehicle type
    const NBAR = Math.round(L / (hi ? 0.184 : 0.19)), GUN = [0.026, 0.026, 0.028], PAD = [0.007, 0.007, 0.008], SNOW = [0.07, 0.072, 0.077];
    for (let k = 0; k < NBAR; k++) {
      const s0 = k / NBAR * L; let col = GUN;
      const V = (x, al, out, nx, na, no) => { b.v.push(x, al, out, nx, na, no, col[0], col[1], col[2], MAT.bar, s0, side, 0, type); return b.v.length / 14 - 1; };
      const Q = (p, q, r, s2, n) => { const a = V(...p, ...n), c = V(...q, ...n), d = V(...r, ...n), e = V(...s2, ...n); b.i.push(a, c, d, a, d, e); };
      // a block from o0 to o1 outward; ends: 1 / 2 = close the -x / +x end; ct = colour of its outer face
      const blk = (xa, xb, hw, o0, o1, ends, ct) => {
        const h2 = hw * 0.85, c0 = col;
        Q([xa, -hw, o0], [xb, -hw, o0], [xb, -h2, o1], [xa, -h2, o1], [0, -1, 0.3]);
        Q([xb, hw, o0], [xa, hw, o0], [xa, h2, o1], [xb, h2, o1], [0, 1, 0.3]);
        if (ends & 1) Q([xa, -hw, o0], [xa, -h2, o1], [xa, h2, o1], [xa, hw, o0], [-1, 0, 0]);
        if (ends & 2) Q([xb, hw, o0], [xb, h2, o1], [xb, -h2, o1], [xb, -hw, o0], [1, 0, 0]);
        if (ct) col = ct;
        Q([xa, -h2, o1], [xb, -h2, o1], [xb, h2, o1], [xa, h2, o1], [0, 0, 1]); col = c0;
      };
      if (!hi) { blk(x0, x1, 0.074, 0, g.t, 3, null); continue; }
      // link body with packed snow between the pads, two rubber pads, an end connector on the outer edge
      blk(x0 + 0.02, x1 - 0.02, 0.078, 0, 0.042, side < 0 ? 2 : 1, SNOW);
      col = PAD; blk(x0 + 0.08, cx - 0.035, 0.064, 0.042, g.t, 3, null); blk(cx + 0.035, x1 - 0.08, 0.064, 0.042, g.t, 3, null);
      col = [0.034, 0.034, 0.036]; if (side < 0) blk(x0, x0 + 0.05, 0.05, 0, 0.055, 1, null); else blk(x1 - 0.05, x1, 0.05, 0, 0.055, 2, null);
    }
    // dual road wheels: the outer disc is turned (hub cap, bolt flange, shallow dish, rim, rubber tyre), the inner one is plain;
    // a trailing swing arm from the hull side to each hub
    const wy = wr + g.t, xo = cx + side * 0.28, sg = hi ? 24 : 16;
    b.set(wc, WM);
    for (let k = 0; k < g.n; k++) {
      const z = g.z0 + k * (g.z1 - g.z0) / (g.n - 1);
      lathe(b, 0, xo, wy, z, [[0.04, 0, WM, HUB], [0.04, 0.15 * wr], [0.012, 0.23 * wr, WM, wc], [0.0, 0.4 * wr], [-0.022, 0.48 * wr], [-0.022, 0.68 * wr], [0.0, 0.765 * wr, WM, DARK], [0.0, 0.95 * wr], [-0.03, wr], [-0.22, wr]], sg, side, false, false, wr);
      b.set(DARK, WM); lathe(b, 0, cx - side * 0.28, wy, z, [[0, 0], [0, wr], [0.22, wr]], sg - 4, side, false, false, wr);
      b.set(HUB, MAT.metal); b.at(side * 1.13, wy, z, 0, -0.56); b.box(-0.045, -0.055, -0.03, 0.045, 0.055, 0.4); b.at(0, 0, 0); b.cyl(side * 1.09, wy, z, cx - side * 0.27, wy, z, 0.07, 0.07, 8, 0);
      b.set(wc, WM);
    }
    // return rollers under the upper run
    const top = lp.seg[4], nr = g.n > 6 ? 4 : 3;
    for (let k = 0; k < nr; k++) { const u = top.len * (k + 0.5) / nr * 0.8 + top.len * 0.12, y = top.py + top.oz * u - top.oy * 0.09, z = top.pz - top.oy * u - top.oz * 0.09; b.cyl(cx + side * 0.05, y, z, cx + side * 0.27, y, z, 0.09, 0.09, 10); }
    // idler at the front: a steel wheel with a deep dish
    const ri = g.id[2], iy = g.id[1], iz = g.id[0];
    lathe(b, 0, xo, iy, iz, [[0.04, 0, WM, HUB], [0.04, 0.3 * ri], [0.012, 0.45 * ri, WM, wc], [-0.03, 0.62 * ri], [-0.03, 0.8 * ri], [0.0, 0.9 * ri], [0.0, ri], [-0.22, ri]], sg, side, false, false, ri);
    b.cyl(cx - side * 0.06, iy, iz, cx - side * 0.28, iy, iz, ri, ri, 12);
    // sprocket at the rear: hub and drum with two toothed rings
    const rs = g.sp[2], sy = g.sp[1], sz = g.sp[0];
    lathe(b, 0, xo, sy, sz, [[0.05, 0, WM, HUB], [0.05, 0.2 * rs], [0.02, 0.26 * rs, WM, wc], [0.0, 0.42 * rs], [0.0, 0.84 * rs], [-0.03, 0.86 * rs], [-0.03, 0.66 * rs], [-0.5, 0.66 * rs]], sg, side, false, false, rs);
    b.set(STL, WM); cog(b, xo - side * 0.035, xo - side * 0.075, sy, sz, rs - 0.04, rs + 0.012, 12);
    if (hi) cog(b, xo - side * 0.47, xo - side * 0.51, sy, sz, rs - 0.04, rs + 0.012, 12); else b.cyl(xo - side * 0.47, sy, sz, xo - side * 0.51, sy, sz, rs - 0.02, rs - 0.02, 12);
  }
  fixWinding(b, i0);
}
