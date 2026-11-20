// Assault buggy and motorcycle team, with their seated riders. Local frame as in tank.js: x right, y up, forward = -z.
// The riders are the infantry model (soldier.js) posed once at load and baked into the vehicle mesh (part 0, rigid with it).
import { MB, MAT, VS } from './mesh.js';
import { poly, extX } from './vehutil.js';
import { buildSoldier, initSoldiers, loft, RIG, RIF_PTS } from './soldier.js';

// ---------- mesh helpers (build time only) ----------
// a triangle wound to agree with its vertex normals
function tri(b, i0, i1, i2) {
  const V = b.v, a = i0 * VS, c = i1 * VS, d = i2 * VS;
  const ux = V[c] - V[a], uy = V[c + 1] - V[a + 1], uz = V[c + 2] - V[a + 2], vx = V[d] - V[a], vy = V[d + 1] - V[a + 1], vz = V[d + 2] - V[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * (V[a + 3] + V[c + 3] + V[d + 3]) + ny * (V[a + 4] + V[c + 4] + V[d + 4]) + nz * (V[a + 5] + V[c + 5] + V[d + 5]) < 0) b.i.push(i0, i2, i1);
  else b.i.push(i0, i1, i2);
}
// round the inner corners of a polyline (k extra points per corner)
function fillet(P, rad, k = 1) {
  const o = [P[0]], n = P.length;
  for (let j = 1; j < n - 1; j++) {
    const a = P[j - 1], p = P[j], c = P[j + 1], la = Math.hypot(a[0] - p[0], a[1] - p[1], a[2] - p[2]), lc = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
    const ra = Math.min(rad, la * 0.45) / la, rc = Math.min(rad, lc * 0.45) / lc;
    for (let i = 0; i <= k + 1; i++) {
      const t = i / (k + 1), w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t, q = [0, 0, 0];
      for (let e = 0; e < 3; e++) q[e] = w0 * (p[e] + (a[e] - p[e]) * ra) + w1 * p[e] + w2 * (p[e] + (c[e] - p[e]) * rc);
      o.push(q);
    }
  }
  o.push(P[n - 1]); return o;
}
// a tube along a polyline [[x, y, z], ...] with smooth radial normals; r is one radius or one per point; caps: 1 start, 2 end
function tube(b, P, r, seg = 6, caps = 3) {
  const n = P.length, base = b.v.length / VS, T = [], F = [];
  for (let j = 0; j < n; j++) {
    const p = P[Math.max(0, j - 1)], q = P[Math.min(n - 1, j + 1)], tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2], l = Math.hypot(tx, ty, tz) || 1;
    T.push([tx / l, ty / l, tz / l]);
  }
  let ux = Math.abs(T[0][1]) < 0.9 ? 0 : 1, uy = Math.abs(T[0][1]) < 0.9 ? 1 : 0, uz = 0;
  for (let j = 0; j < n; j++) {
    const t = T[j], d = ux * t[0] + uy * t[1] + uz * t[2]; ux -= t[0] * d; uy -= t[1] * d; uz -= t[2] * d;
    const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const vx = t[1] * uz - t[2] * uy, vy = t[2] * ux - t[0] * uz, vz = t[0] * uy - t[1] * ux, rr = typeof r === 'number' ? r : r[j];
    F.push([ux, uy, uz, vx, vy, vz, rr]);
    for (let i = 0; i <= seg; i++) {
      const a = (i % seg) / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), nx = ux * c + vx * s, ny = uy * c + vy * s, nz = uz * c + vz * s;
      b.vert(P[j][0] + nx * rr, P[j][1] + ny * rr, P[j][2] + nz * rr, nx, ny, nz, i / seg, j);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) { const k = base + j * (seg + 1) + i; tri(b, k, k + 1, k + seg + 1); tri(b, k + 1, k + seg + 2, k + seg + 1); }
  for (let e = 0; e < 2; e++) {
    if (!(caps & (e + 1))) continue;
    const j = e ? n - 1 : 0, t = T[j], f = F[j], sg = e ? 1 : -1, c0 = b.vert(P[j][0], P[j][1], P[j][2], t[0] * sg, t[1] * sg, t[2] * sg, 0, 0), k0 = b.v.length / VS;
    for (let i = 0; i <= seg; i++) {
      const a = (i % seg) / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      b.vert(P[j][0] + (f[0] * c + f[3] * s) * f[6], P[j][1] + (f[1] * c + f[4] * s) * f[6], P[j][2] + (f[2] * c + f[5] * s) * f[6], t[0] * sg, t[1] * sg, t[2] * sg, c, s);
    }
    for (let i = 0; i < seg; i++) tri(b, c0, k0 + i, k0 + i + 1);
  }
}
const pipe = (b, P, r, seg = 5, rad = 0.06, caps = 3) => tube(b, fillet(P, rad), r, seg, caps);
// a surface of revolution about the x axis through (cy, cz): profile [[x, r], ...], outside to the left of its direction;
// a doubled point makes a hard edge; s = -1 mirrors the profile in x
function lathe(b, cx, cy, cz, P, n = 16, s = 1) {
  const m = P.length, base = b.v.length / VS;
  for (let j = 0; j < m; j++) {
    let nx = 0, nr = 0;
    for (let e = 0; e < 2; e++) {
      const p = P[j - 1 + e], q = P[j + e]; if (!p || !q) continue;
      const dx = q[0] - p[0], dr = q[1] - p[1], l = Math.hypot(dx, dr); if (l < 1e-6) continue;
      nx -= dr / l; nr += dx / l;
    }
    const l = Math.hypot(nx, nr) || 1; nx /= l; nr /= l;
    for (let i = 0; i <= n; i++) { const a = (i % n) / n * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); b.vert(cx + s * P[j][0], cy + P[j][1] * c, cz + P[j][1] * sn, s * nx, nr * c, nr * sn, i / n, j); }
  }
  for (let j = 0; j < m - 1; j++) {
    if (Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]) < 1e-6) continue;
    for (let i = 0; i < n; i++) { const k = base + j * (n + 1) + i; if (P[j][1] > 1e-5) tri(b, k, k + 1, k + n + 1); if (P[j + 1][1] > 1e-5) tri(b, k + 1, k + n + 2, k + n + 1); }
  }
}
// a bent plate (mudguards, panels): profile [[y, z], ...] across x0 +- hw, thickness t under the profile, the middle raised by crown
function plate(b, P, hw, t, crown = 0, x0 = 0) {
  const n = P.length, base = b.v.length / VS, N = [], tilt = crown ? Math.min(0.9, 2 * crown / hw) : 0;
  for (let j = 0; j < n; j++) { const p = P[Math.max(0, j - 1)], q = P[Math.min(n - 1, j + 1)], dy = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dy, dz) || 1; N.push([dz / l, -dy / l]); }
  for (let j = 0; j < n; j++) {
    const ny = N[j][0], nz = N[j][1];
    for (let e = 0; e < 2; e++) for (let s = -1; s <= 1; s++) {
      const lift = (s ? 0 : crown) - e * t, sg = e ? -1 : 1, il = 1 / Math.hypot(1, s * tilt);
      b.vert(x0 + s * hw, P[j][0] + ny * lift, P[j][1] + nz * lift, sg * s * tilt * il, sg * ny * il, sg * nz * il, (s + 1) / 2, j);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let e = 0; e < 2; e++) for (let s = 0; s < 2; s++) { const k = base + j * 6 + e * 3 + s; tri(b, k, k + 1, k + 6); tri(b, k + 1, k + 7, k + 6); }
  for (let j = 0; j < n - 1; j++) for (const s of [-1, 1]) {
    const a = N[j], c = N[j + 1], x = x0 + s * hw;
    b.quad([x, P[j][0], P[j][1]], [x, P[j + 1][0], P[j + 1][1]], [x, P[j + 1][0] - c[0] * t, P[j + 1][1] - c[1] * t], [x, P[j][0] - a[0] * t, P[j][1] - a[1] * t]);
    const q = b.v.length / VS - 4; for (let e = 0; e < 4; e++) { b.v[(q + e) * VS + 3] = s; b.v[(q + e) * VS + 4] = 0; b.v[(q + e) * VS + 5] = 0; }
    b.i.length -= 6; tri(b, q, q + 1, q + 2); tri(b, q, q + 2, q + 3);
  }
}
// transform every vertex from index v0 on by a 4x4 (column-major) matrix
function xform(b, v0, M) {
  const V = b.v;
  for (let k = v0 * VS; k < V.length; k += VS) {
    const x = V[k], y = V[k + 1], z = V[k + 2], nx = V[k + 3], ny = V[k + 4], nz = V[k + 5];
    V[k] = M[0] * x + M[4] * y + M[8] * z + M[12]; V[k + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; V[k + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    V[k + 3] = M[0] * nx + M[4] * ny + M[8] * nz; V[k + 4] = M[1] * nx + M[5] * ny + M[9] * nz; V[k + 5] = M[2] * nx + M[6] * ny + M[10] * nz;
  }
}
const cnt = (b) => b.v.length / VS;
// a tread block: a box without its bottom face, the top shrunk by t
function knob(b, x0, y0, z0, x1, y1, z1, t = 0) {
  const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1], E = [x0 + t, y1, z0 + t], F = [x1 - t, y1, z0 + t], G = [x1 - t, y1, z1 - t], H = [x0 + t, y1, z1 - t];
  b.quad(E, H, G, F); b.quad(D, C, G, H); b.quad(B, A, E, F); b.quad(A, D, H, E); b.quad(C, B, F, G);
}
// a box with its long axis from p to q (cross-section hw x hh, hh in the vertical plane of the axis)
function beam(b, p, q, hw, hh) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz), h = Math.hypot(dx, dz);
  b.at(p[0], p[1], p[2], Math.atan2(-dx, -dz), Math.atan2(dy, h)); b.box(-hw, -hh, -L, hw, hh, 0); b.at(0, 0, 0);
}

// ---------- riders: the infantry model in a seated pose ----------
const SOLM = buildSoldier(0, 8), SOL = initSoldiers(1, () => 0), PP = new Float32Array(RIG.NP);
const s3 = (k, x, y, z) => { PP[k] = x; PP[k + 1] = y; PP[k + 2] = z; };
// pose parameters in vehicle space: hip joint centre, pelvis and torso and head angles (yaw, pitch, roll), ankles, knee poles, hands, elbow poles
function pose(hip, pel, tor, head, ankL, ankR, kneeL, kneeR, handL, handR, elbL, elbR) {
  RIG.base(PP); s3(0, hip[0], hip[1], hip[2]); s3(3, pel[0], pel[1], pel[2]); s3(6, tor[0], tor[1], tor[2]); s3(9, head[0], head[1], head[2]);
  s3(12, ankL[0], ankL[1], ankL[2]); s3(15, ankR[0], ankR[1], ankR[2]); s3(18, kneeL[0], kneeL[1], kneeL[2]); s3(21, kneeR[0], kneeR[1], kneeR[2]);
  if (handL) { s3(24, handL[0], handL[1], handL[2]); s3(27, handR[0], handR[1], handR[2]); }
  s3(30, elbL[0], elbL[1], elbL[2]); s3(33, elbR[0], elbR[1], elbR[2]);
}
// an outward-facing band round the vertical axis of the current frame: ellipse rx, rz about (0, cz), from angle a0 to a1 (0 = front, -z)
function band(b, y0, y1, rx, rz, cz, a0, a1, n) {
  const k0 = cnt(b);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, sn = Math.sin(a), c = Math.cos(a), l = Math.hypot(sn / rx, c / rz);
    b.vert(rx * sn, y0, cz - rz * c, sn / rx / l, 0, -c / rz / l, i / n, 0); b.vert(rx * sn, y1, cz - rz * c, sn / rx / l, 0, -c / rz / l, i / n, 1);
  }
  for (let i = 0; i < n; i++) { const k = k0 + i * 2; tri(b, k, k + 2, k + 1); tri(b, k + 1, k + 2, k + 3); }
}
// solve PP and append the soldier. o: rifle = vehicle part for the AK (-1 none), pack 0 drops the pack (it would sit inside a seat back),
// toe = extra toe-down angle (the soles are levelled first: the model's ankle is rigid), up = vehicle part of the torso, head and arms,
// straps = harness straps over the shoulders. The overall is toned down to a warm grey-white and darkened where it is worn and where the
// body shades itself (seat, inner thighs, knees, cuffs, undersides): the object shader has no occlusion for it.
function bakeRider(b, o) {
  SOL.place(PP, 0, 0, 0, 0, 0, 1, 0, 0);
  const M = SOL.out, v = SOLM.v, idx = SOLM.i, map = new Int32Array(v.length / VS).fill(-1), fa = [0, 0], up = o.up || 0, arm = o.arm === undefined ? up : o.arm, rifle = o.rifle, vS = cnt(b);
  for (let s = 0; s < 2; s++) { const m = (9 + s) * 16; fa[s] = Math.atan2(M[m + 9], M[m + 5]) + (o.toe || 0); }
  for (let t = 0; t < idx.length; t += 3) {
    const p = v[idx[t] * VS + 12]; if (p === 12 || (p === 11 && rifle < 0)) continue;
    if (p === 1 && v[idx[t] * VS + 9] === MAT.gear && Math.min(v[idx[t] * VS + 2], v[idx[t + 1] * VS + 2], v[idx[t + 2] * VS + 2]) > 0.19) continue; // the pack's compression strap: its corners stand out of the pack as a spike at this range
    if (!o.pack && p === 1) { // no pack: nor its compression strap, nor its shoulder straps (they would stand off the shoulders as loose tabs)
      if (v[idx[t] * VS + 9] === MAT.pack || Math.min(v[idx[t] * VS + 2], v[idx[t + 1] * VS + 2], v[idx[t + 2] * VS + 2]) > 0.145) continue;
      let st = v[idx[t] * VS + 9] === MAT.gear;
      for (let e = 0; e < 3 && st; e++) { const q = idx[t + e] * VS, ax = Math.abs(v[q]); st = v[q + 1] > 0.299 && v[q + 1] < 0.426 && ax > 0.06 && ax < 0.11 && v[q + 2] > -0.05 && v[q + 2] < 0.16; }
      if (st) continue;
    }
    for (let e = 0; e < 3; e++) {
      const i = idx[t + e];
      if (map[i] < 0) {
        const q = i * VS, m = p * 16, x0 = v[q], yy = v[q + 1], mt = v[q + 9]; let x = x0, y = yy, z = v[q + 2], nx = v[q + 3], ny = v[q + 4], nz = v[q + 5];
        if (p === 1 && mt === MAT.gear && y > 0.42 && z > 0.1 && Math.abs(x) > 0.06 && Math.abs(x) < 0.11) y = 0.365; // the shoulder straps run down to the pack instead of standing off behind the neck
        if ((p === 9 || p === 10) && y < -0.418) { // level the foot about the ankle
          const c = Math.cos(fa[p - 9]), s = Math.sin(fa[p - 9]), y0 = y + 0.42, n0 = ny;
          y = -0.42 + y0 * c - z * s; z = y0 * s + z * c; ny = n0 * c - nz * s; nz = n0 * s + nz * c;
        }
        let wx = M[m] * nx + M[m + 4] * ny + M[m + 8] * nz, wy = M[m + 1] * nx + M[m + 5] * ny + M[m + 9] * nz, wz = M[m + 2] * nx + M[m + 6] * ny + M[m + 10] * nz;
        const l = Math.hypot(wx, wy, wz) || 1; wx /= l; wy /= l; wz /= l;
        let f = 1, fb = 1;
        if (mt === MAT.cloth || mt === MAT.gear || mt === MAT.pack) {
          f = mt === MAT.cloth ? 0.86 : 0.9; if (mt === MAT.cloth) fb = 0.93;
          if (p === 0) f *= yy < 0 ? 0.7 : 0.88;
          else if (p === 7 || p === 8) f *= (1 - 0.3 * Math.max(0, (p === 7 ? x0 : -x0) / 0.1)) * (yy < -0.33 ? 0.82 : 1) * (yy > -0.06 ? 0.84 : 1);
          else if (p === 9 || p === 10) f *= yy < -0.2 ? 0.78 : yy > -0.06 ? 0.82 : 0.94;
          else if (p === 5 || p === 6) f *= yy < -0.15 ? 0.8 : 0.94;
          else if (p === 3 || p === 4) f *= yy < -0.24 ? 0.86 : 1;
          else if (p === 1) f *= (yy < 0.06 ? 0.84 : 1) * (Math.abs(x0) > 0.15 && yy < 0.3 ? 0.88 : 1);
          if (wy < -0.25) f *= 0.84;
        }
        map[i] = cnt(b);
        b.v.push(M[m] * x + M[m + 4] * y + M[m + 8] * z + M[m + 12], M[m + 1] * x + M[m + 5] * y + M[m + 9] * z + M[m + 13], M[m + 2] * x + M[m + 6] * y + M[m + 10] * z + M[m + 14],
          wx, wy, wz, v[q + 6] * f, v[q + 7] * f * (0.5 + 0.5 * fb), v[q + 8] * f * fb, mt, v[q + 10], v[q + 11], p === 11 ? rifle : p === 1 ? up : p >= 2 && p <= 6 ? arm : 0, 0);
      }
      b.i.push(map[i]);
    }
  }
  const p0 = b.part; b.part = up;
  b.m.set(M.subarray(16, 32)); b.set([0.6, 0.59, 0.55], MAT.cloth); // shoulders run into the torso
  for (const sx of [-1, 1]) b.blob(sx * 0.158, 0.38, 0.002, 0.08, 0.06, 0.082, 3, 0, 6);
  if (o.straps) { b.set([0.1, 0.11, 0.09], MAT.gear); for (const sx of [-1, 1]) { b.box(sx * 0.085 - 0.02, 0.235, -0.166, sx * 0.085 + 0.02, 0.43, -0.15, 0, 0); b.box(sx * 0.085 - 0.02, 0.428, -0.166, sx * 0.085 + 0.02, 0.447, 0.13); } b.box(-0.08, 0.3, -0.17, 0.08, 0.33, -0.156); }
  if (o.hem) { // a jacket hem and belt round the waist: they turn with the torso and cover the seam to the pelvis (part 0)
    b.set([0.5, 0.49, 0.455], MAT.cloth); b.blob(0, -0.035, 0.005, 0.178, 0.075, 0.138, 5, 0, 8);
    b.set([0.09, 0.09, 0.08], MAT.gear); band(b, -0.05, -0.02, 0.181, 0.141, 0.005, 0, Math.PI * 2, 12);
  }
  b.part = arm; b.m.set(M.subarray(32, 48)); // goggles: a curved lens in a thin frame under the helmet brim, the strap round the cover
  b.set([0.03, 0.04, 0.06], MAT.paint); band(b, 0.134, 0.152, 0.087, 0.127, 0, -0.95, 0.95, 8); b.set([0.07, 0.09, 0.12], MAT.paint); band(b, 0.152, 0.17, 0.086, 0.125, 0, -0.95, 0.95, 8);
  b.set([0.16, 0.16, 0.14], MAT.gear); band(b, 0.126, 0.134, 0.088, 0.127, 0, -1.0, 1.0, 8); band(b, 0.17, 0.178, 0.088, 0.127, 0, -1.0, 1.0, 8);
  b.set([0.09, 0.09, 0.085], MAT.gear); band(b, 0.176, 0.198, 0.118, 0.136, 0.008, 0.95, Math.PI * 2 - 0.95, 12);
  b.at(0, 0, 0); b.part = p0;
  if (o.xf) { // move the upper body (every vertex not in part 0): shift, then a turn by xf[3] about the vertical axis at z = xf[4]
    const X = o.xf, c = Math.cos(X[3]), s = Math.sin(X[3]), V = b.v;
    for (let q = vS * VS; q < V.length; q += VS) {
      if (!V[q + 12]) continue;
      const x = V[q] + X[0], z = V[q + 2] + X[2] - X[4], nx = V[q + 3], nz = V[q + 5];
      V[q] = x * c + z * s; V[q + 1] += X[1]; V[q + 2] = X[4] - x * s + z * c; V[q + 3] = nx * c + nz * s; V[q + 5] = -nx * s + nz * c;
    }
  }
}
// the rifle held as in the infantry's low-ready (torso frame), hands on its grips
// the rifle at the shoulder with the infantry's cheek weld (butt in the right shoulder pocket), then swung by yaw about the butt
function shouldered(yaw) {
  RIG.wAimed(PP, 36, 0, 0.05, RIG.RIF_BUTT[0], RIG.RIF_BUTT[1], RIG.RIF_BUTT[2], RIG.AIM[0], RIG.AIM[1], RIG.AIM[2]);
  const c = Math.cos(yaw), sn = Math.sin(yaw), B = RIG.RIF_BUTT, rot = (k) => { const x = PP[k], z = PP[k + 2]; PP[k] = c * x + sn * z; PP[k + 2] = -sn * x + c * z; };
  const bx = PP[45] + PP[36] * B[0] + PP[39] * B[1] + PP[42] * B[2], by = PP[46] + PP[37] * B[0] + PP[40] * B[1] + PP[43] * B[2], bz = PP[47] + PP[38] * B[0] + PP[41] * B[1] + PP[44] * B[2];
  rot(36); rot(39); rot(42); rot(30); rot(33);
  PP[45] = bx - (PP[36] * B[0] + PP[39] * B[1] + PP[42] * B[2]); PP[46] = by - (PP[37] * B[0] + PP[40] * B[1] + PP[43] * B[2]); PP[47] = bz - (PP[38] * B[0] + PP[41] * B[1] + PP[44] * B[2]);
  RIG.handsOn(PP, 36, RIG.RIF_L[0], RIG.RIF_L[1], RIG.RIF_L[2], RIG.RIF_R[0], RIG.RIF_R[1], RIG.RIF_R[2]);
}
function lowReady(x, y, z, yaw, pitch, roll) { RIG.wFromTorso(PP, 36, x, y, z, yaw, pitch, roll); RIG.handsOn(PP, 36, RIG.RIF_L[0], RIG.RIF_L[1], RIG.RIF_L[2], RIG.RIF_R[0], RIG.RIF_R[1], RIG.RIF_R[2]); }

const DK = [0.03, 0.031, 0.034], STEEL = [0.2, 0.2, 0.21], ALU = [0.21, 0.21, 0.215], BLK = [0.02, 0.02, 0.022], OLV = [0.065, 0.08, 0.048], OLD = [0.045, 0.055, 0.036], CANV = [0.2, 0.2, 0.15], LENS = [1, 0.95, 0.82];
const SNOW = [0.93, 0.95, 0.98];
const snow = (b, x, y, z, rx, ry, rz, seed, seg = 7) => { b.set(SNOW, MAT.snow); b.blob(x, y, z, rx, ry, rz, seed, 0.06, seg); }; // a pillow of settled snow
// a lamp facing -z: dark shell, grey lens in a rim, a small bright core
function lamp(b, x, y, z, r, core) {
  b.set(DK, MAT.metal); b.cyl(x, y, z + r * 0.9, x, y, z, r * 0.75, r * 1.08, 10); b.set([0.3, 0.31, 0.3], MAT.metal); b.cyl(x, y, z, x, y, z - 0.004, r * 0.9, r * 0.9, 10);
  if (core) { b.set(LENS, MAT.head); b.cyl(x, y, z - 0.004, x, y, z - 0.007, r * 0.36, r * 0.36, 7); }
}
// stowage: a rolled or stuffed canvas bundle along x, a jerry can, an ammunition box
function roll(b, x0, x1, y, z, r, col = CANV) { b.set(col, MAT.pack); lathe(b, 0, y, z, [[x0, 0], [x0 + 0.02, r * 0.8], [x0 + 0.06, r], [x1 - 0.06, r], [x1 - 0.02, r * 0.8], [x1, 0]], 9); b.set(BLK, MAT.gear); for (const k of [0.28, 0.72]) { const x = x0 + (x1 - x0) * k; lathe(b, 0, y, z, [[x - 0.012, r + 0.004], [x + 0.012, r + 0.004]], 9); } }
function jerry(b, x, y, z, yaw) { // 20 l can: 0.165 x 0.47 x 0.345, origin at the middle of its base
  b.at(x, y, z, yaw); b.set(OLD, MAT.rus); b.box(-0.082, 0, -0.172, 0.082, 0.4, 0.172, 0.006, 0.006); b.box(-0.07, 0.4, -0.16, 0.07, 0.44, 0.1, 0.02, 0.03);
  b.box(-0.084, 0.1, -0.12, 0.084, 0.3, 0.12, 0.0, 0.03); b.set(DK, MAT.metal); b.box(-0.05, 0.44, -0.11, 0.05, 0.465, 0.07); b.box(-0.02, 0.43, -0.165, 0.02, 0.475, -0.125); b.at(0, 0, 0);
}
function ammoBox(b, x, y, z, yaw) { b.at(x, y, z, yaw); b.set(OLD, MAT.rus); b.box(-0.075, 0, -0.18, 0.075, 0.17, 0.18); b.box(-0.079, 0.17, -0.184, 0.079, 0.19, 0.184); b.set(DK, MAT.metal); b.box(-0.015, 0.19, -0.07, 0.015, 0.205, 0.07); b.box(-0.02, 0.1, -0.19, 0.02, 0.17, -0.18); b.at(0, 0, 0); }

// ---------- assault buggy ----------
export const BUGGY = { ty: 1.55, tz: 0.45, gy: 1.78, gz: 0.45, mz: -0.55, hl: 1.45, hw: 0.82, rad: 1.6, hh: 1.45, th: 1.95, tr: 0.25, bx: 0.95, bz: 1.75, cr: 1.0, cs: 0.8, wr: 0.38, ax: [-1.15, 1.15] };
// wide off-road wheel on an axle across x, centred at (x, r, z); sx = the outer side
function buggyWheel(b, x, y, z, sx, part, w) {
  const h = w / 2; b.part = part; b.set(BLK, MAT.rubber);
  lathe(b, x, y, z, [[-h + 0.018, 0.212], [-h, 0.26], [-h + 0.006, 0.315], [-h + 0.03, 0.35], [-h + 0.06, 0.364], [h - 0.06, 0.364], [h - 0.03, 0.35], [h - 0.006, 0.315], [h, 0.26], [h - 0.018, 0.212]], 14, sx);
  for (let k = 0; k < 32; k++) { // two staggered rows of blocks, every other one carried over the shoulder
    const a = k * Math.PI / 16, sd = k & 1 ? 1 : -1; b.at(x, y + Math.cos(a) * 0.361, z + Math.sin(a) * 0.361, 0, a);
    knob(b, sd > 0 ? -0.012 : -h + 0.022, 0, -0.017, sd > 0 ? h - 0.022 : 0.012, 0.018, 0.017, 0.004);
    if (!(k & 6)) knob(b, sd * (h - 0.014) - 0.011, -0.05, -0.014, sd * (h - 0.014) + 0.011, -0.006, 0.014, 0.003);
  }
  b.at(0, 0, 0); b.set([0.075, 0.085, 0.06], MAT.rus);
  lathe(b, x, y, z, [[h - 0.018, 0.212], [h - 0.006, 0.205], [h - 0.006, 0.185], [h - 0.04, 0.172], [h - 0.095, 0.1], [h - 0.095, 0.1], [h - 0.075, 0.085], [h - 0.075, 0.0]], 14, sx); // rim: lip, dish, hub face
  b.set(DK, MAT.metal); lathe(b, x, y, z, [[-h + 0.04, 0], [-h + 0.04, 0.12], [-h + 0.018, 0.212]], 12, sx); // the inner side
  lathe(b, x, y, z, [[h - 0.075, 0.03], [h - 0.05, 0.028], [h - 0.05, 0]], 8, sx); // hub cap
  for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4; b.cyl(x + sx * (h - 0.075), y + Math.cos(a) * 0.058, z + Math.sin(a) * 0.058, x + sx * (h - 0.06), y + Math.cos(a) * 0.058, z + Math.sin(a) * 0.058, 0.011, 0.011, 4); } // wheel nuts
  b.part = 0;
}
// PKM: bore along z at height y, muzzle at z = zm (1.17 m long); ammunition box and belt
function pkm(b, y, zm, stock = 1) {
  const z0 = zm + 0.61; // front of the receiver
  b.set(DK, MAT.metal);
  b.cyl(0, y, zm, 0, y, zm + 0.075, 0.017, 0.013, 7); b.cyl(0, y, zm + 0.075, 0, y, z0, 0.011, 0.015, 7, 0); // flash hider, barrel
  b.cyl(0, y - 0.034, zm + 0.33, 0, y - 0.034, z0, 0.012, 0.012, 6); b.box(-0.016, y - 0.05, zm + 0.31, 0.016, y + 0.016, zm + 0.345); // gas tube under the barrel, gas block
  b.box(-0.004, y, zm + 0.085, 0.004, y + 0.05, zm + 0.1); b.box(-0.014, y + 0.036, zm + 0.08, 0.014, y + 0.052, zm + 0.105); // front sight with its ears
  for (const sx of [-1, 1]) b.cyl(sx * 0.02, y - 0.05, zm + 0.32, sx * 0.03, y - 0.062, zm + 0.62, 0.006, 0.006, 4); // folded bipod
  b.box(-0.03, y - 0.062, z0, 0.03, y + 0.03, z0 + 0.3, 0.004, 0); b.box(-0.033, y + 0.03, z0 + 0.02, 0.033, y + 0.05, z0 + 0.2, 0.006, 0.01); // receiver, feed cover
  b.box(-0.012, y + 0.05, z0 + 0.2, 0.012, y + 0.068, z0 + 0.25); b.box(0.03, y - 0.01, z0 + 0.21, 0.05, y + 0.006, z0 + 0.25); // rear sight, charging handle
  b.at(0, y + 0.02, z0 - 0.03, 0.5, 0, 0); b.box(-0.008, 0, -0.008, 0.008, 0.035, 0.008); b.box(-0.011, 0.035, -0.06, 0.011, 0.058, 0.03); b.at(0, 0, 0); // carrying handle
  b.box(-0.005, y - 0.105, z0 + 0.19, 0.005, y - 0.097, z0 + 0.27); // trigger guard
  b.set([0.05, 0.035, 0.025], MAT.paint);
  b.at(0, y - 0.062, z0 + 0.275, 0, 0.3); b.box(-0.015, -0.1, -0.02, 0.015, 0, 0.022); b.at(0, 0, 0); // pistol grip
  if (stock) { b.box(-0.017, y - 0.002, z0 + 0.3, 0.017, y + 0.024, z0 + 0.54); beam(b, [0, y - 0.045, z0 + 0.3], [0, y - 0.1, z0 + 0.54], 0.015, 0.011); b.box(-0.019, y - 0.115, z0 + 0.535, 0.019, y + 0.026, z0 + 0.56); } // skeleton stock, butt plate
  else { b.set(DK, MAT.metal); b.box(-0.026, y - 0.06, z0 + 0.3, 0.026, y + 0.028, z0 + 0.315); } // pintle gun: the stock taken off, a plate on the receiver
  b.set(OLD, MAT.rus); b.box(-0.05, y - 0.215, z0 + 0.02, 0.045, y - 0.064, z0 + 0.2); b.box(-0.053, y - 0.085, z0 + 0.016, 0.048, y - 0.07, z0 + 0.204); // 100-round box under the receiver
  b.set([0.42, 0.3, 0.1], MAT.metal); for (let k = 0; k < 5; k++) b.cyl(0.034 + (k > 2 ? (k - 2) * 0.008 : 0), y - 0.06 + k * 0.02, z0 + 0.075, 0.034 + (k > 2 ? (k - 2) * 0.008 : 0), y - 0.06 + k * 0.02, z0 + 0.135, 0.0075, 0.006, 4); // belt up into the feed tray
}
// bucket seat: origin on the floor under the hip point, leaning back by rec
function bucketSeat(b, x, y, z, rec) {
  const C = [0.045, 0.047, 0.045];
  b.set(DK, MAT.metal); for (const sx of [-1, 1]) b.box(x + sx * 0.17 - 0.015, y, z - 0.3, x + sx * 0.17 + 0.015, y + 0.05, z + 0.1); // runners
  b.set(C, MAT.paint); b.at(x, y + 0.05, z, 0, 0.1); b.box(-0.21, 0, -0.36, 0.21, 0.075, 0.14, 0.015, 0.02); // cushion, front edge raised
  for (const sx of [-1, 1]) b.box(sx * 0.215 - 0.035, 0.03, -0.3, sx * 0.215 + 0.035, 0.16, 0.14, 0.012, 0.04, 0.0); // thigh bolsters
  b.at(x, y + 0.1, z + 0.115, 0, rec); b.box(-0.2, 0, 0, 0.2, 0.62, 0.07, 0.03, 0); // back
  for (const sx of [-1, 1]) b.box(sx * 0.21 - 0.035, 0.04, -0.09, sx * 0.21 + 0.035, 0.42, 0.06, 0.014, 0, 0.0); // side bolsters
  b.box(-0.13, 0.62, 0.005, 0.13, 0.8, 0.065, 0.03, 0.006); // head rest
  b.set([0.27, 0.28, 0.25], MAT.gear); for (const sx of [-1, 1]) { b.box(sx * 0.075 - 0.022, 0.5, -0.012, sx * 0.075 + 0.022, 0.8, 0.0); b.box(sx * 0.075 - 0.022, 0.795, -0.012, sx * 0.075 + 0.022, 0.807, 0.075); } // harness straps over the top
  b.at(0, 0, 0);
}
export function buildBuggy() { // light assault buggy: welded tube space frame, rear engine, driver and passenger, a gunner standing in a ring behind them at the PKM (his torso, head and arms are part 1: he twists at the waist with the gun)
  const b = new MB(), FR = [0.05, 0.06, 0.042], R = 0.026, WR = BUGGY.wr, FZ = BUGGY.ax[0], RZ = BUGGY.ax[1];
  b.part = 0;
  const fr = (P, r = R, rad = 0.09) => pipe(b, P, r, 5, rad), m2 = (P, f) => { for (const sx of [-1, 1]) f(P.map((p) => [p[0] * sx, p[1], p[2]]), sx); };
  // ---- space frame ----
  b.set(FR, MAT.rus);
  m2([[0.25, 0.44, -1.47], [0.52, 0.36, -0.7], [0.52, 0.36, 0.95], [0.4, 0.46, 1.5]], (P) => fr(P)); // lower rails
  m2([[0.52, 0.36, -0.7], [0.52, 0.8, -0.72], [0.46, 1.5, -0.22], [0.46, 1.5, 0.45], [0.4, 0.82, 1.5], [0.4, 0.46, 1.5]], (P) => fr(P, R, 0.12)); // A-pillar, roof rail, rear stay
  m2([[0.52, 0.36, 0.45], [0.53, 0.82, 0.45], [0.46, 1.5, 0.45]], (P) => fr(P, 0.03, 0.14)); // main hoop legs
  m2([[0.52, 0.8, -0.72], [0.25, 0.64, -1.47], [0.25, 0.44, -1.47]], (P) => fr(P)); // hood rails down to the nose
  m2([[0.53, 0.82, 0.45], [0.4, 0.82, 1.5]], (P) => fr(P, 0.022)); // engine bay side rails
  m2([[0.53, 0.8, -0.72], [0.545, 0.62, 0.45]], (P) => fr(P, 0.022)); // door bars
  m2([[0.52, 0.36, -0.52], [0.76, 0.4, -0.4], [0.76, 0.4, 0.36], [0.52, 0.36, 0.5]], (P) => fr(P, 0.024, 0.1)); // nerf bars
  m2([[0.46, 1.5, 0.45], [0.5, 0.36, 0.95]], (P) => fr(P, 0.02)); // diagonal braces down to the rear of the floor
  for (const [x, y, z, r] of [[0.25, 0.44, -1.47, R], [0.25, 0.64, -1.47, R], [0.52, 0.36, -0.7, R], [0.52, 0.8, -0.72, R], [0.46, 1.5, -0.22, R], [0.52, 0.36, 0.45, R], [0.52, 0.36, 0.95, R], [0.4, 0.46, 1.5, R], [0.4, 0.82, 1.5, R], [0.46, 1.5, 0.1, 0.02]]) tube(b, [[-x, y, z], [x, y, z]], r, 6, 0); // cross tubes
  { const ring = []; for (let k = 0; k <= 16; k++) { const a = k * Math.PI / 8; ring.push([Math.sin(a) * 0.34, 1.5, 0.45 + Math.cos(a) * 0.34]); } tube(b, ring, 0.026, 6, 0); } // the gunner's ring in the main hoop
  for (const sx of [-1, 1]) { tube(b, [[sx * 0.46, 1.5, 0.45], [sx * 0.34, 1.5, 0.45]], 0.03, 6, 0); tube(b, [[sx * 0.46, 1.5, 0.12], [sx * 0.22, 1.5, 0.2]], 0.02, 5, 0); tube(b, [[sx * 0.445, 1.34, 0.7], [sx * 0.22, 1.5, 0.7]], 0.02, 5, 0); }
  // ---- panels ----
  b.set(OLV, MAT.rus);
  b.box(-0.52, 0.325, -0.7, 0.52, 0.345, 0.95); // floor pan
  poly(b, [[-0.5, 0.815, -0.72], [0.5, 0.815, -0.72], [0.24, 0.655, -1.47], [-0.24, 0.655, -1.47]], [0, 0, -1]); poly(b, [[-0.5, 0.8, -0.72], [0.5, 0.8, -0.72], [0.24, 0.64, -1.47], [-0.24, 0.64, -1.47]], [0, 2, -1]); // hood, both faces
  poly(b, [[-0.25, 0.42, -1.48], [0.25, 0.42, -1.48], [0.52, 0.335, -0.7], [-0.52, 0.335, -0.7]], [0, 1, -1]); poly(b, [[-0.25, 0.432, -1.47], [0.25, 0.432, -1.47], [0.52, 0.347, -0.7], [-0.52, 0.347, -0.7]], [0, -1, -1]); // skid plate
  for (const sx of [-1, 1]) {
    for (const o of [0.03, 0.012]) poly(b, [[sx * (0.52 + o), 0.36, -0.7], [sx * (0.52 + o), 0.8, -0.72], [sx * (0.25 + o), 0.64, -1.47], [sx * (0.25 + o), 0.44, -1.47]], [o > 0.02 ? 0 : sx * 2, 0.6, -1]); // nose sides
    b.box(sx * 0.55 - 0.012, 0.345, -0.7, sx * 0.55 + 0.012, 0.6, 0.45); // sill panels
  }
  poly(b, [[-0.25, 0.44, -1.5], [0.25, 0.44, -1.5], [0.25, 0.64, -1.5], [-0.25, 0.64, -1.5]], [0, 0.5, 0]); // nose plate
  b.box(-0.44, 1.527, -0.2, 0.44, 1.541, 0.1); // roof sheet over the crew
  b.set(DK, MAT.metal); b.box(-0.47, 0.345, -0.775, 0.47, 0.78, -0.755); b.box(-0.5, 0.345, 0.74, 0.5, 0.8, 0.76); // firewalls
  // ---- nose: bumper, lamps, tow hook, a rolled tarpaulin on the hood ----
  b.set(FR, MAT.rus); fr([[-0.25, 0.44, -1.47], [-0.3, 0.46, -1.62], [0.3, 0.46, -1.62], [0.25, 0.44, -1.47]], 0.024, 0.08); fr([[-0.25, 0.64, -1.47], [-0.2, 0.62, -1.62], [0.2, 0.62, -1.62], [0.25, 0.64, -1.47]], 0.02, 0.07);
  for (const sx of [-1, 1]) lamp(b, sx * 0.15, 0.54, -1.56, 0.075, 1);
  roll(b, -0.3, 0.3, 0.8, -1.22, 0.085); snow(b, 0, 0.875, -1.21, 0.24, 0.022, 0.06, 5);
  b.at(0.3, 0.765, -1.0, 0.36, 0.21); b.set([0.3, 0.19, 0.09], MAT.wood); b.cyl(0, 0.01, -0.12, 0, 0.01, 0.34, 0.016, 0.016, 6); // shovel strapped to the hood: wooden handle, steel blade
  b.set([0.3, 0.3, 0.31], MAT.metal); b.box(-0.085, 0, -0.34, 0.085, 0.014, -0.12, 0.0, 0.0); b.box(-0.05, 0.0, -0.4, 0.05, 0.012, -0.34); b.box(-0.02, 0.0, -0.13, 0.02, 0.03, -0.08);
  b.set(BLK, MAT.gear); b.box(-0.035, -0.002, 0.1, 0.035, 0.032, 0.13); b.box(-0.095, -0.002, -0.24, 0.095, 0.018, -0.21); b.at(0, 0, 0);
  snow(b, -0.18, 0.745, -0.98, 0.19, 0.03, 0.17, 7, 10); snow(b, 0.03, 0.685, -1.37, 0.16, 0.025, 0.07, 9, 9);
  // ---- front suspension: double wishbones, coil-overs, tie rods ----
  for (const sx of [-1, 1]) {
    b.set(DK, MAT.metal);
    for (const z of [FZ + 0.17, FZ - 0.17]) { tube(b, [[sx * 0.3, 0.42, z], [sx * 0.71, 0.3, FZ]], 0.018, 5, 0); tube(b, [[sx * 0.33, 0.62, z * 0.92 + FZ * 0.08], [sx * 0.69, 0.5, FZ]], 0.015, 5, 0); }
    tube(b, [[sx * 0.72, 0.27, FZ], [sx * 0.69, 0.53, FZ]], 0.028, 6); tube(b, [[sx * 0.7, WR, FZ], [sx * 0.87, WR, FZ]], 0.035, 6); // upright, stub axle
    tube(b, [[sx * 0.2, 0.5, FZ + 0.2], [sx * 0.7, 0.42, FZ + 0.12]], 0.011, 4, 0); // tie rod
    const s0 = [sx * 0.6, 0.34, FZ], s1 = [sx * 0.38, 0.74, FZ + 0.04], sp = [], sr = [];
    for (let k = 0; k <= 8; k++) { const t = 0.12 + 0.6 * k / 8; sp.push([s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t, s0[2] + (s1[2] - s0[2]) * t]); sr.push(k & 1 ? 0.04 : 0.03); }
    b.set(STEEL, MAT.metal); tube(b, [s0, s1], 0.017, 6); b.set([0.035, 0.035, 0.04], MAT.metal); tube(b, sp, sr, 6, 0); // damper and spring
  }
  b.set(DK, MAT.metal); b.box(-0.2, 0.47, FZ + 0.16, 0.2, 0.53, FZ + 0.24); // steering rack
  // ---- cockpit: dash, steering, pedals, levers, seats ----
  b.set(DK, MAT.metal); b.box(-0.5, 0.7, -0.74, 0.5, 0.84, -0.66, 0, 0.01); b.set([0.12, 0.13, 0.12], MAT.glass); for (const x of [-0.42, -0.19]) b.cyl(x, 0.78, -0.66, x, 0.78, -0.655, 0.035, 0.035, 8);
  b.set(DK, MAT.metal); b.cyl(-0.32, 0.77, -0.69, -0.32, 0.955, -0.355, 0.016, 0.016, 6);
  { const v0 = cnt(b), ring = []; for (let k = 0; k <= 14; k++) { const a = k * Math.PI / 7; ring.push([Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0]); }
    b.set(BLK, MAT.rubber); tube(b, ring, 0.014, 5, 0); b.set(DK, MAT.metal); for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + k * Math.PI * 2 / 3; tube(b, [[0, 0, 0.03], [Math.cos(a) * 0.165, Math.sin(a) * 0.165, 0]], 0.009, 4, 0); } b.cyl(0, 0, 0.04, 0, 0, 0.0, 0.035, 0.03, 8);
    b.at(-0.32, 0.97, -0.33, 0, -0.5); xform(b, v0, b.m); b.at(0, 0, 0); } // steering wheel
  for (const x of [-0.42, -0.32, -0.22]) { b.at(x, 0.4, -0.72, 0, 0.6); b.box(-0.03, 0, -0.008, 0.03, 0.1, 0.008); b.at(0, 0, 0); } // pedals
  b.cyl(0, 0.345, -0.1, 0.0, 0.62, -0.18, 0.011, 0.011, 5); b.set(BLK, MAT.rubber); b.cyl(0, 0.62, -0.18, 0, 0.67, -0.195, 0.022, 0.018, 6); b.set(DK, MAT.metal); b.box(-0.03, 0.345, 0.0, 0.03, 0.42, 0.25); b.cyl(0.0, 0.42, 0.2, 0, 0.56, 0.05, 0.012, 0.012, 5); // gear lever, tunnel, hand brake
  bucketSeat(b, -0.32, 0.345, -0.02, 0.3); bucketSeat(b, 0.32, 0.345, -0.02, 0.3);
  // ---- crew: driver on the left with his hands on the wheel, passenger with his AK upright between his knees ----
  pose([-0.32, 0.565, -0.02], [0, 0.3, 0], [0, 0.0, 0], [0, -0.24, 0], [-0.42, 0.47, -0.66], [-0.23, 0.47, -0.66], [-0.6, 1, -0.4], [0.3, 1, -0.4], [-0.47, 1.0, -0.345], [-0.17, 1.0, -0.345], [-0.3, -1, 0.3], [0.5, -1, 0.3]);
  bakeRider(b, { rifle: -1, toe: 0.5, straps: 1 });
  pose([0.32, 0.565, -0.02], [0, 0.3, 0], [0.0, 0.0, 0], [0.1, -0.24, 0], [0.2, 0.47, -0.62], [0.44, 0.47, -0.6], [-0.4, 1, -0.4], [0.6, 1, -0.4], null, null, [-0.8, -0.6, 0.3], [0.9, -0.5, 0.3]);
  lowReady(0.01, 0.06, -0.3, -0.12, 0.95, 0.0); bakeRider(b, { rifle: 0, toe: 0.35, straps: 1 });
  // ---- the gunner: he stands on the floor behind the seats, leaning on a webbing sling, his legs fixed and his upper body turning with the mount ----
  pose([0, 1.16, 0.5], [0, 0.0, 0], [0, -0.1, 0], [0, 0.12, 0], [-0.17, 0.43, 0.6], [0.17, 0.43, 0.62], [-0.3, 0.1, -1], [0.3, 0.1, -1], [-0.075, 1.63, 0.19], [0.012, 1.672, 0.338], [-0.6, -0.8, 0.5], [0.5, -0.8, 0.7]);
  bakeRider(b, { rifle: -1, up: 1 });
  b.set([0.22, 0.23, 0.19], MAT.gear); b.box(-0.52, 1.0, 0.615, 0.52, 1.09, 0.625);
  // ---- fuel tank and stowage over the gearbox ----
  b.set(OLD, MAT.rus); b.box(-0.44, 0.6, 0.78, 0.44, 0.9, 0.98, 0.02, 0.02); b.set(DK, MAT.metal); b.cyl(-0.3, 0.9, 0.88, -0.3, 0.94, 0.88, 0.04, 0.04, 8); for (const x of [-0.15, 0.15]) b.box(x - 0.015, 0.595, 0.775, x + 0.015, 0.905, 0.985);
  jerry(b, -0.645, 0.46, 0.6, 0); jerry(b, 0.645, 0.46, 0.6, 0);
  b.set(DK, MAT.metal); for (const sx of [-1, 1]) { b.box(sx * 0.645 - 0.1, 0.44, 0.42, sx * 0.645 + 0.1, 0.46, 0.78); b.box(sx * 0.74 - 0.006, 0.46, 0.44, sx * 0.74 + 0.006, 0.7, 0.47); b.box(sx * 0.74 - 0.006, 0.46, 0.73, sx * 0.74 + 0.006, 0.7, 0.76); b.box(sx * 0.645 - 0.1, 0.69, 0.585, sx * 0.645 + 0.1, 0.705, 0.615); snow(b, sx * 0.645, 0.905, 0.6, 0.07, 0.014, 0.14, 11 + sx, 5); } // can trays and straps
  roll(b, -0.4, 0.4, 0.985, 0.88, 0.085, [0.24, 0.24, 0.19]); snow(b, 0, 1.06, 0.88, 0.3, 0.02, 0.06, 13); ammoBox(b, 0.4, 0.345, 0.58, 0); ammoBox(b, -0.4, 0.345, 0.58, 0);
  // ---- engine and transaxle (air-cooled flat four behind the rear axle) ----
  b.set(ALU, MAT.metal); b.cyl(0, 0.46, 0.74, 0, 0.46, 1.05, 0.085, 0.12, 8); b.cyl(0, 0.46, 1.05, 0, 0.46, 1.2, 0.17, 0.17, 10); // gearbox, bell housing
  b.set(STEEL, MAT.metal); b.box(-0.2, 0.36, 1.2, 0.2, 0.6, 1.5, 0.02, 0.01); // crankcase
  for (const sx of [-1, 1]) { b.set(ALU, MAT.metal); b.box(sx * 0.29 - 0.09, 0.4, 1.22, sx * 0.29 + 0.09, 0.56, 1.48); b.set(DK, MAT.metal); for (let k = 0; k < 5; k++) b.box(sx * 0.3 - 0.105, 0.385, 1.235 + k * 0.055, sx * 0.3 + 0.105, 0.575, 1.25 + k * 0.055); b.box(sx * 0.4 - 0.02, 0.41, 1.22, sx * 0.4 + 0.02, 0.55, 1.48, 0.0, 0.02); } // heads, fins, rocker covers
  b.set([0.13, 0.15, 0.11], MAT.rus); b.cyl(0, 0.84, 1.26, 0, 0.84, 1.4, 0.2, 0.2, 12); b.box(-0.2, 0.56, 1.26, 0.2, 0.84, 1.4); // fan shroud
  b.set(DK, MAT.metal); b.cyl(0, 0.84, 1.4, 0, 0.84, 1.43, 0.08, 0.08, 10); b.cyl(0, 0.5, 1.5, 0, 0.5, 1.53, 0.075, 0.075, 10); b.box(-0.012, 0.5, 1.435, 0.012, 0.84, 1.445); b.cyl(0, 0.84, 1.26, 0, 0.84, 1.255, 0.15, 0.15, 12); // pulleys, belt, fan intake
  for (const sx of [-1, 1]) { b.set(STEEL, MAT.metal); b.cyl(sx * 0.16, 0.66, 1.33, sx * 0.3, 0.66, 1.33, 0.03, 0.03, 6); b.set([0.1, 0.1, 0.09], MAT.paint); b.cyl(sx * 0.3, 0.6, 1.33, sx * 0.3, 0.9, 1.33, 0.065, 0.065, 9); b.set(DK, MAT.metal); b.cyl(sx * 0.3, 0.9, 1.33, sx * 0.3, 0.92, 1.33, 0.07, 0.05, 9); } // carburettor stubs, air filters
  b.set([0.11, 0.075, 0.055], MAT.metal);
  for (const sx of [-1, 1]) { pipe(b, [[sx * 0.33, 0.42, 1.28], [sx * 0.33, 0.33, 1.3], [sx * 0.3, 0.33, 1.6]], 0.02, 5, 0.05, 0); pipe(b, [[sx * 0.33, 0.42, 1.43], [sx * 0.33, 0.33, 1.45], [sx * 0.3, 0.33, 1.6]], 0.02, 5, 0.05, 0); b.cyl(sx * 0.22, 0.385, 1.66, sx * 0.23, 0.4, 1.83, 0.03, 0.026, 7); } // headers, short stingers
  lathe(b, 0, 0.38, 1.63, [[-0.38, 0], [-0.38, 0.06], [-0.35, 0.08], [0.35, 0.08], [0.38, 0.06], [0.38, 0]], 10); // one silencer across the tail
  b.set(DK, MAT.metal); b.box(-0.4, 0.285, 0.95, 0.4, 0.3, 1.56); b.at(0, 0.3, 1.56, 0, -0.5); b.box(-0.4, -0.015, 0, 0.4, 0, 0.16); b.at(0, 0, 0); // skid plate under the engine
  b.set(FR, MAT.rus); fr([[-0.4, 0.46, 1.5], [-0.42, 0.5, 1.74], [0.42, 0.5, 1.74], [0.4, 0.46, 1.5]], 0.022, 0.08); // rear bumper round the silencer
  b.set([0.5, 0.04, 0.03], MAT.paint); for (const sx of [-1, 1]) b.box(sx * 0.4 - 0.035, 0.72, 1.5, sx * 0.4 + 0.035, 0.78, 1.53); // tail lamps
  // ---- rear suspension: trailing arms, drive shafts, coil-overs ----
  for (const sx of [-1, 1]) {
    b.set(DK, MAT.metal); beam(b, [sx * 0.5, 0.38, 0.52], [sx * 0.71, 0.38, RZ + 0.03], 0.03, 0.045); tube(b, [[sx * 0.66, WR, RZ], [sx * 0.78, WR, RZ]], 0.05, 7);
    tube(b, [[sx * 0.13, 0.46, RZ - 0.08], [sx * 0.68, WR, RZ]], 0.02, 5, 0); b.set(BLK, MAT.rubber); tube(b, [[sx * 0.13, 0.46, RZ - 0.08], [sx * 0.22, 0.447, RZ - 0.067]], [0.05, 0.028], 6, 0); tube(b, [[sx * 0.58, 0.395, RZ - 0.015], [sx * 0.67, 0.382, RZ]], [0.028, 0.05], 6, 0); // drive shaft, boots
    const s0 = [sx * 0.64, 0.42, RZ - 0.06], s1 = [sx * 0.435, 1.1, RZ - 0.3], sp = [], sr = [];
    for (let k = 0; k <= 8; k++) { const t = 0.1 + 0.62 * k / 8; sp.push([s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t, s0[2] + (s1[2] - s0[2]) * t]); sr.push(k & 1 ? 0.042 : 0.031); }
    b.set(STEEL, MAT.metal); tube(b, [s0, s1], 0.018, 6); b.set([0.035, 0.035, 0.04], MAT.metal); tube(b, sp, sr, 6, 0);
  }
  // ---- spare wheel lying on the rear stays, light bar, aerial ----
  b.set(FR, MAT.rus); for (const t of [0.36, 0.8]) tube(b, [[-0.46 + 0.06 * t, 1.5 - 0.68 * t, 0.45 + 1.05 * t], [0.46 - 0.06 * t, 1.5 - 0.68 * t, 0.45 + 1.05 * t]], 0.02, 5, 0);
  { const v0 = cnt(b); buggyWheel(b, 0, 0, 0, 1, 0, 0.225); snow(b, 0.045, 0.02, 0.0, 0.035, 0.15, 0.15, 21, 8); b.at(0, 1.2, 1.26, 0, 0.575, Math.PI / 2); xform(b, v0, b.m); b.at(0, 0, 0);
    b.set(BLK, MAT.gear); for (const sx of [-1, 1]) beam(b, [sx * 0.2, 1.47, 0.96], [sx * 0.2, 1.07, 1.57], 0.02, 0.004); }
  b.set(DK, MAT.metal); b.box(-0.4, 1.555, -0.27, 0.4, 1.575, -0.21);
  for (const x of [-0.3, -0.1, 0.1, 0.3]) { lamp(b, x, 1.63, -0.27, 0.05, 0); b.box(x - 0.008, 1.57, -0.25, x + 0.008, 1.6, -0.22); snow(b, x, 1.683, -0.235, 0.04, 0.012, 0.035, 30 + x * 10, 5); }
  b.set(OLV, MAT.rus); snow(b, 0.05, 1.54, -0.04, 0.34, 0.025, 0.13, 17, 10);
  b.set(DK, MAT.metal); b.cyl(0.4, 0.84, 1.5, 0.4, 0.96, 1.5, 0.022, 0.016, 6); tube(b, [[0.4, 0.96, 1.5], [0.41, 1.9, 1.56], [0.43, 2.85, 1.66]], [0.011, 0.008, 0.005], 5); // aerial, about 2 m
  for (const sx of [-1, 1]) { snow(b, sx * 0.76, 0.428, -0.02, 0.03, 0.014, 0.3, 40 + sx, 5); }
  for (const z of BUGGY.ax) for (const sx of [-1, 1]) { const w = z < 0 ? 0.17 : 0.225; buggyWheel(b, sx * (1.0 - w / 2), WR, z, sx, z < 0 ? 3 : 4, w); }
  // ---- PKM on the ring: 1 = the carriage on the ring with its arm and yoke (and the gunner's upper body), 2 = the gun ----
  b.part = 1; const gy = BUGGY.gy;
  b.set(DK, MAT.metal); b.box(-0.07, 1.468, 0.075, 0.07, 1.54, 0.15); b.box(-0.05, 1.54, 0.09, 0.05, 1.56, 0.14);
  pipe(b, [[0, 1.55, 0.115], [0, 1.64, 0.04], [0, 1.7, 0.04]], 0.02, 6, 0.04); b.box(-0.045, 1.695, 0.02, 0.045, 1.715, 0.06); for (const sx of [-1, 1]) b.box(sx * 0.04 - 0.007, 1.715, 0.025, sx * 0.04 + 0.007, gy - 0.02, 0.055);
  b.part = 2; pkm(b, gy, BUGGY.mz, 0);
  return b.build();
}

// ---------- motorcycle team ----------
// the aim pivots are the pillion's: yaw about his spine (tz), pitch about his shoulders (gy at the bore's height, gz), mz the AK's muzzle;
// ya = the arcs the upper body is shown in (left from, to; right from, to; rad, left positive): never across the driver's back
export const MOTO = { ty: 1.0, tz: 0.64, gy: 1.54, gz: 0.59, mz: -0.3, ya: [0.6, 2.6, -1.7, -0.6], hl: 0.9, hw: 0.35, rad: 1.0, hh: 1.3, th: 1.3, tr: 0, bx: 0.42, bz: 1.1, cr: 0.7, cs: 0.5, wr: 0.33, ax: [-0.72, 0.68] };
// wire-spoked enduro wheel in the x = 0 plane: knobbly tyre of width w and section height hs on a narrow rim
function motoWheel(b, z, part, w, hs, front) {
  const R = MOTO.wr, y = R, Rt = R - 0.013, rr = Rt - hs, rc = rr + hs * 0.5, T = [];
  b.part = part; b.set(BLK, MAT.rubber);
  for (let k = 0; k <= 6; k++) { const t = -2.15 + 4.3 * k / 6; T.push([Math.sin(t) * w * 0.5, rc + Math.cos(t) * hs * 0.5]); }
  lathe(b, 0, y, z, T, 18);
  for (let k = 0; k < 44; k++) { // knobs: two staggered rows of small blocks
    const a = k * Math.PI / 22, sx = k & 1 ? 1 : -1; b.at(0, y + Math.cos(a) * (Rt - 0.004), z + Math.sin(a) * (Rt - 0.004), 0, a);
    knob(b, sx * w * 0.2 - w * 0.17, 0, -0.011, sx * w * 0.2 + w * 0.17, 0.016, 0.011, 0.003);
  }
  b.at(0, 0, 0); const wr = w * 0.36, lip = rr + hs * 0.2;
  b.set([0.16, 0.16, 0.165], MAT.metal); lathe(b, 0, y, z, [[wr, lip], [wr, rr - 0.012], [wr, rr - 0.012], [-wr, rr - 0.012], [-wr, rr - 0.012], [-wr, lip]], 18); // rim
  const hw = front ? 0.04 : 0.048, hr = front ? 0.036 : 0.055;
  b.set(front ? STEEL : [0.06, 0.06, 0.065], MAT.metal);
  lathe(b, 0, y, z, [[-hw - 0.012, 0], [-hw - 0.012, 0.022], [-hw, hr], [-hw + 0.01, hr], [0, hr * (front ? 0.6 : 0.92)], [hw - 0.01, hr], [hw, hr], [hw + 0.012, 0.022], [hw + 0.012, 0]], 9); // hub with spoke flanges (the rear a drum)
  b.set([0.42, 0.42, 0.43], MAT.metal);
  for (let k = 0; k < 14; k++) for (const sx of [-1, 1]) { // crossed wire spokes
    const a0 = (k + (sx > 0 ? 0.5 : 0)) * Math.PI / 7, a1 = a0 + (k & 1 ? 0.5 : -0.5), r0 = hr - 0.004, r1 = rr - 0.01;
    b.cyl(sx * (hw - 0.004), y + Math.cos(a0) * r0, z + Math.sin(a0) * r0, sx * 0.008, y + Math.cos(a1) * r1, z + Math.sin(a1) * r1, 0.0042, 0.0042, 3, 0);
  }
  b.set([0.07, 0.07, 0.075], MAT.metal);
  if (front) lathe(b, 0, y, z, [[-0.056, 0.045], [-0.056, 0.108], [-0.056, 0.108], [-0.051, 0.108], [-0.051, 0.108], [-0.051, 0.045]], 12); // brake disc
  else { b.set(DK, MAT.metal); b.set([0.06, 0.06, 0.065], MAT.metal); lathe(b, 0, y, z, [[-0.071, 0.05], [-0.071, 0.1], [-0.071, 0.1], [-0.063, 0.1], [-0.063, 0.1], [-0.063, 0.05]], 14); } // sprocket
  b.part = 0;
}
export function buildMoto() { // military enduro with a rider and a pillion gunner: his pelvis and legs are part 0, his torso part 1 (yaw about MOTO.tz) and his head, arms and AK part 2 (pitch about the shoulders)
  const b = new MB(), FZ = MOTO.ax[0], RZ = MOTO.ax[1], WR = MOTO.wr, rk = 27 * Math.PI / 180, sr = Math.sin(rk), cr = Math.cos(rk);
  const fk = (x, s, off = 0) => [x, WR + s * cr - off * sr, FZ + s * sr + off * cr]; // a point s up the fork from the axle, off behind it
  const FRM = [0.035, 0.037, 0.038], m2 = (P, f) => { for (const sx of [-1, 1]) f(P.map((p) => [p[0] * sx, p[1], p[2]]), sx); };
  b.part = 0;
  // ---- front end: telescopic fork with gaiters, triple clamps, axle, high mudguard, headlamp with a guard ----
  for (const sx of [-1, 1]) {
    b.set(FRM, MAT.metal); tube(b, [fk(sx * 0.1, -0.035), fk(sx * 0.1, 0.27)], 0.031, 7); b.box(sx * 0.1 - 0.02, WR - 0.03, FZ - 0.03, sx * 0.1 + 0.02, WR + 0.03, FZ + 0.03);
    b.set([0.5, 0.5, 0.52], MAT.metal); tube(b, [fk(sx * 0.1, 0.27), fk(sx * 0.1, 0.73)], 0.018, 6);
    b.set(BLK, MAT.rubber); const gp = [], gr = []; for (let k = 0; k <= 8; k++) { gp.push(fk(sx * 0.1, 0.26 + k * 0.031)); gr.push(k & 1 ? 0.036 : 0.027); } tube(b, gp, gr, 6, 0);
  }
  b.set(STEEL, MAT.metal); tube(b, [[-0.125, WR, FZ], [0.125, WR, FZ]], 0.011, 5);
  b.set(FRM, MAT.metal); for (const s of [0.52, 0.705]) { b.at(0, WR + s * cr, FZ + s * sr, 0, rk); b.box(-0.128, -0.016, -0.034, 0.128, 0.016, 0.075, 0.0, 0.0); b.at(0, 0, 0); }
  tube(b, [fk(0, 0.49, 0.045), fk(0, 0.73, 0.045)], 0.03, 8); // steering head
  b.set([0.25, 0.25, 0.26], MAT.metal); b.box(-0.075, WR - 0.005, FZ + 0.06, -0.045, WR + 0.06, FZ + 0.13); // brake caliper
  b.set(OLV, MAT.rus); plate(b, [[0.78, -1.1], [0.8, -1.0], [0.808, -0.86], [0.8, -0.72], [0.78, -0.58], [0.745, -0.47], [0.69, -0.4]], 0.07, 0.008, 0.02);
  b.set(FRM, MAT.metal); for (const sx of [-1, 1]) tube(b, [[sx * 0.065, 0.79, -0.6], fk(sx * 0.1, 0.5)], 0.007, 4, 0); // mudguard stays
  b.set(OLD, MAT.rus);
  { const v0 = cnt(b); lathe(b, 0, 0, 0, [[0.02, 0], [0.04, 0.06], [0.09, 0.086], [0.14, 0.09], [0.14, 0.09], [0.15, 0.082]], 12); b.set([0.3, 0.31, 0.3], MAT.metal); lathe(b, 0, 0, 0, [[0.15, 0.082], [0.156, 0.05], [0.158, 0.03]], 12); b.set(LENS, MAT.head); lathe(b, 0, 0, 0, [[0.158, 0.03], [0.16, 0]], 8);
    b.set(DK, MAT.metal); lathe(b, 0, 0, 0, [[0.175, 0.097], [0.185, 0.097], [0.185, 0.097], [0.185, 0.085]], 12); for (const o of [-0.045, 0, 0.045]) { b.box(0.176, o - 0.004, -0.09, 0.184, o + 0.004, 0.09); } for (const o of [-0.09, 0.09]) b.box(0.13, -0.004, o - 0.004, 0.185, 0.004, o + 0.004);
    b.at(0, 0.875, -0.455, Math.PI / 2, 0, 0); xform(b, v0, b.m); b.at(0, 0, 0); } // headlamp shell, lens, stone guard (built along x, turned to face forward)
  b.set(DK, MAT.metal); b.cyl(0, 0.985, -0.43, 0, 1.02, -0.415, 0.045, 0.045, 9); for (const sx of [-1, 1]) b.box(sx * 0.1 - 0.012, 0.85, -0.5, sx * 0.1 + 0.012, 0.9, -0.44); // speedometer, lamp brackets
  // ---- handlebar with crossbrace, grips, levers, mirrors ----
  b.set(FRM, MAT.metal); for (const sx of [-1, 1]) b.box(sx * 0.05 - 0.016, 0.965, -0.415, sx * 0.05 + 0.016, 1.03, -0.375);
  b.set([0.3, 0.3, 0.31], MAT.metal); pipe(b, [[-0.3, 1.096, -0.352], [-0.19, 1.085, -0.372], [-0.09, 1.02, -0.39], [0.09, 1.02, -0.39], [0.19, 1.085, -0.372], [0.3, 1.096, -0.352]], 0.012, 6, 0.03); tube(b, [[-0.17, 1.075, -0.377], [0.17, 1.075, -0.377]], 0.007, 5, 0);
  for (const sx of [-1, 1]) {
    b.set(BLK, MAT.rubber); tube(b, [[sx * 0.29, 1.095, -0.354], [sx * 0.405, 1.106, -0.333]], 0.018, 7);
    b.set(DK, MAT.metal); b.box(sx * 0.265 - 0.02, 1.075, -0.385, sx * 0.265 + 0.02, 1.11, -0.345); pipe(b, [[sx * 0.265, 1.09, -0.385], [sx * 0.29, 1.085, -0.415], [sx * 0.4, 1.09, -0.4]], 0.006, 4, 0.02); // lever perch, lever
    tube(b, [[sx * 0.245, 1.1, -0.36], [sx * 0.3, 1.25, -0.34], [sx * 0.33, 1.27, -0.335]], 0.006, 4, 0); b.cyl(sx * 0.335, 1.275, -0.342, sx * 0.335, 1.275, -0.33, 0.042, 0.042, 8); // mirror
  }
  // ---- frame: backbone, down tube and double cradle, seat tubes, subframe, rack ----
  b.set(FRM, MAT.metal);
  pipe(b, [fk(0, 0.7, 0.07), [0, 0.85, -0.05], [0, 0.8, 0.13]], 0.024, 6, 0.1); pipe(b, [fk(0, 0.52, 0.07), [0, 0.5, -0.33]], 0.024, 6);
  m2([[0.02, 0.5, -0.33], [0.085, 0.3, -0.26], [0.09, 0.27, 0.1], [0.085, 0.42, 0.17], [0.08, 0.8, 0.13]], (P) => pipe(b, P, 0.018, 6, 0.06));
  m2([[0.08, 0.8, 0.1], [0.1, 0.815, 0.8], [0.12, 0.85, 1.04]], (P) => pipe(b, P, 0.015, 5, 0.06)); m2([[0.085, 0.47, 0.18], [0.1, 0.81, 0.66]], (P) => tube(b, P, 0.013, 5, 0));
  tube(b, [[-0.12, 0.85, 1.04], [0.12, 0.85, 1.04]], 0.015, 5, 0); tube(b, [[-0.115, 0.845, 0.84], [0.115, 0.845, 0.84]], 0.012, 5, 0); tube(b, [[-0.09, 0.3, -0.24], [0.09, 0.3, -0.24]], 0.014, 5, 0);
  b.set(DK, MAT.metal); b.box(-0.1, 0.262, -0.25, 0.1, 0.272, 0.08); // sump guard
  // ---- single-cylinder engine: finned barrel and head, crankcase with covers, gearbox, carburettor, air box ----
  b.set([0.1, 0.1, 0.105], MAT.metal);
  lathe(b, 0, 0.41, -0.07, [[-0.1, 0], [-0.1, 0.1], [-0.085, 0.118], [0.085, 0.118], [0.1, 0.1], [0.1, 0]], 12); b.box(-0.095, 0.3, -0.03, 0.095, 0.5, 0.2, 0.0, 0.02);
  b.set([0.075, 0.075, 0.08], MAT.metal); lathe(b, 0, 0.41, -0.07, [[0.1, 0.1], [0.135, 0.092], [0.14, 0.08], [0.14, 0]], 12); lathe(b, 0, 0.42, 0.1, [[0.095, 0.075], [0.125, 0.07], [0.128, 0]], 10); lathe(b, 0, 0.41, -0.07, [[-0.14, 0], [-0.14, 0.07], [-0.13, 0.085], [-0.1, 0.09]], 12);
  b.at(0, 0.41, -0.07, 0, -0.17);
  b.set([0.13, 0.13, 0.135], MAT.metal); b.box(-0.062, 0.1, -0.062, 0.062, 0.25, 0.062); b.box(-0.075, 0.25, -0.08, 0.075, 0.315, 0.08); b.box(-0.055, 0.315, -0.065, 0.055, 0.345, 0.065, 0.012, 0.012);
  b.set([0.09, 0.09, 0.095], MAT.metal); for (let k = 0; k < 6; k++) b.box(-0.092, 0.118 + k * 0.022, -0.092, 0.092, 0.126 + k * 0.022, 0.092); for (let k = 0; k < 3; k++) b.box(-0.09, 0.258 + k * 0.02, -0.095, 0.09, 0.265 + k * 0.02, 0.095);
  b.at(0, 0, 0);
  b.set(STEEL, MAT.metal); b.cyl(0, 0.665, -0.03, 0, 0.68, 0.09, 0.03, 0.034, 7); b.set(DK, MAT.metal); b.box(-0.075, 0.56, 0.08, 0.075, 0.76, 0.22);
  b.set(OLV, MAT.rus); for (const sx of [-1, 1]) extX(b, [[0.8, 0.09], [0.8, 0.33], [0.63, 0.15]], sx > 0 ? 0.1 : -0.11, sx > 0 ? 0.11 : -0.1); // small side covers
  // ---- fuel tank, seat ----
  b.at(0, 0.845, 0.075, 0, -Math.PI / 2); b.set(OLV, MAT.rus);
  loft(b, [[0, 0.06, 0.03, 0, -0.03], [0.04, 0.105, 0.065, 0, -0.01], [0.14, 0.135, 0.092, 0, 0.012], [0.27, 0.138, 0.1, 0, 0.03], [0.36, 0.115, 0.088, 0, 0.035], [0.415, 0.07, 0.06, 0, 0.032], [0.43, 0.03, 0.03, 0, 0.03]], 10);
  b.at(0, 0, 0); b.set(STEEL, MAT.metal); b.cyl(0, 0.97, -0.25, 0, 0.995, -0.25, 0.035, 0.03, 8); b.set(BLK, MAT.rubber); for (const sx of [-1, 1]) b.box(sx * 0.133 - 0.008, 0.8, -0.2, sx * 0.133 + 0.008, 0.9, -0.02, 0.0, 0.02); // filler cap, knee pads
  b.at(0, 0.835, 0.82, 0, -Math.PI / 2); b.set([0.035, 0.035, 0.033], MAT.paint);
  loft(b, [[0, 0.07, 0.02, 0, 0.012], [0.03, 0.11, 0.042, 0, 0.012], [0.3, 0.115, 0.045, 0, 0.004], [0.55, 0.105, 0.045, 0, 0], [0.72, 0.085, 0.05, 0, 0.012], [0.78, 0.05, 0.035, 0, 0.03]], 9);
  b.at(0, 0, 0);
  // ---- exhaust: header round the right of the barrel, high silencer under the seat with a heat shield ----
  b.set([0.13, 0.085, 0.06], MAT.metal); pipe(b, [[0.02, 0.67, -0.2], [0.07, 0.67, -0.29], [0.14, 0.58, -0.25], [0.155, 0.6, -0.02], [0.16, 0.7, 0.2], [0.165, 0.745, 0.36]], 0.02, 6, 0.06, 0);
  b.set([0.17, 0.165, 0.16], MAT.metal); tube(b, [[0.165, 0.735, 0.34], [0.167, 0.755, 0.43], [0.172, 0.805, 0.9], [0.173, 0.81, 0.94]], [0.022, 0.046, 0.046, 0.028], 9); b.set(DK, MAT.metal); b.cyl(0.173, 0.81, 0.94, 0.174, 0.815, 0.99, 0.017, 0.017, 6);
  for (const z of [0.46, 0.88]) lathe(b, 0.17, 0.758 + (z - 0.43) * 0.106, z, [[-0.01, 0.05], [0.01, 0.05]], 9);
  b.set([0.06, 0.06, 0.065], MAT.metal); b.at(0.222, 0.782, 0.66, 0, 0.106); b.box(-0.004, -0.03, -0.17, 0.004, 0.03, 0.17); b.set([0.2, 0.2, 0.2], MAT.metal); for (let k = 0; k < 5; k++) b.box(0.004, -0.018, -0.14 + k * 0.06, 0.006, 0.018, -0.1 + k * 0.06); b.at(0, 0, 0);
  // ---- swing arm, twin shocks, chain and guard, pegs, stand, pedals ----
  b.set(FRM, MAT.metal);
  for (const sx of [-1, 1]) {
    beam(b, [sx * 0.092, 0.42, 0.17], [sx * 0.092, WR, RZ + 0.05], 0.014, 0.024);
    const s0 = [sx * 0.122, 0.37, RZ - 0.07], s1 = [sx * 0.112, 0.795, 0.44], sp = [], sq = [];
    for (let k = 0; k <= 8; k++) { const t = 0.18 + 0.7 * k / 8; sp.push([s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t, s0[2] + (s1[2] - s0[2]) * t]); sq.push(k & 1 ? 0.034 : 0.024); }
    b.set(DK, MAT.metal); tube(b, [s0, s1], 0.015, 5); b.set([0.36, 0.36, 0.37], MAT.metal); tube(b, sp, sq, 6, 0);
    b.set(FRM, MAT.metal); tube(b, [[sx * 0.09, 0.335, 0.1], [sx * 0.24, 0.335, 0.1]], 0.014, 5); tube(b, [[sx * 0.1, 0.6, 0.4], [sx * 0.12, 0.47, 0.46], [sx * 0.235, 0.47, 0.46]], 0.012, 5); // rider and pillion pegs
  }
  tube(b, [[-0.11, 0.42, 0.17], [0.11, 0.42, 0.17]], 0.016, 6); tube(b, [[-0.14, WR, RZ], [0.14, WR, RZ]], 0.011, 5);
  b.set(DK, MAT.metal); lathe(b, 0, 0.42, 0.1, [[-0.07, 0.02], [-0.07, 0.034], [-0.07, 0.034], [-0.062, 0.034], [-0.062, 0.034], [-0.062, 0.02]], 8);
  b.set([0.2, 0.2, 0.21], MAT.metal); beam(b, [-0.067, 0.452, 0.1], [-0.067, 0.443, RZ], 0.007, 0.011); beam(b, [-0.067, 0.388, 0.1], [-0.067, 0.218, RZ], 0.007, 0.011); // chain runs
  b.set(FRM, MAT.metal); beam(b, [-0.068, 0.478, 0.2], [-0.068, 0.462, RZ - 0.05], 0.014, 0.004); // chain guard
  tube(b, [[-0.1, 0.285, 0.1], [-0.125, 0.275, 0.5]], 0.011, 4); pipe(b, [[0.1, 0.34, 0.05], [0.16, 0.33, -0.06], [0.2, 0.345, -0.1]], 0.008, 4, 0.02); pipe(b, [[-0.13, 0.4, -0.04], [-0.17, 0.37, -0.1], [-0.215, 0.375, -0.12]], 0.008, 4, 0.02); // side stand, brake pedal, gear lever
  // ---- tail: mudguard, lamp, plate, rack with a pack and a jerry can, panniers ----
  b.set(OLV, MAT.rus); plate(b, [[0.69, 0.3], [0.745, 0.48], [0.765, 0.7], [0.75, 0.9], [0.7, 1.04], [0.62, 1.12]], 0.075, 0.008, 0.02);
  b.set([0.5, 0.04, 0.03], MAT.paint); b.box(-0.035, 0.705, 1.06, 0.035, 0.75, 1.1); b.set([0.26, 0.25, 0.22], MAT.rus); b.at(0, 0.6, 1.135, 0, 0.35); b.box(-0.085, 0, -0.004, 0.085, 0.1, 0.004); b.at(0, 0, 0);
  roll(b, -0.19, 0.19, 0.93, 0.95, 0.07); snow(b, 0, 0.995, 0.95, 0.15, 0.016, 0.05, 3);
  for (const sx of [-1, 1]) { // small canvas panniers on a frame: lid with a seam, two straps, snow on top
    b.set(FRM, MAT.metal); tube(b, [[sx * 0.11, 0.83, 0.78], [sx * 0.135, 0.56, 0.8]], 0.008, 4, 0); tube(b, [[sx * 0.115, 0.84, 1.0], [sx * 0.135, 0.56, 0.98]], 0.008, 4, 0);
    b.set([0.17, 0.17, 0.125], MAT.pack); b.box(sx * 0.19 - 0.055, 0.55, 0.78, sx * 0.19 + 0.055, 0.72, 1.0, 0.006, 0.008); b.set([0.21, 0.21, 0.155], MAT.pack); b.box(sx * 0.19 - 0.06, 0.715, 0.775, sx * 0.19 + 0.06, 0.765, 1.005, 0.014, 0.014);
    b.set([0.05, 0.05, 0.045], MAT.gear); for (const z of [0.835, 0.945]) b.box(sx * 0.19 - 0.062, 0.6, z - 0.01, sx * 0.19 + 0.062, 0.768, z + 0.01, 0.012, 0);
    snow(b, sx * 0.19, 0.768, 0.89, 0.04, 0.012, 0.09, 5 + sx, 5);
  }
  // ---- the riders: the driver crouched over the bars; the pillion sits square on the seat and his upper body, in the infantry's standing aim (butt in the shoulder, cheek on the stock), follows the target ----
  pose([0, 0.955, 0.22], [0, -0.17, 0], [0, -0.57, 0], [0, 0.72, 0], [-0.175, 0.455, 0.15], [0.175, 0.455, 0.15], [-0.1, 0.2, -1], [0.1, 0.2, -1], [-0.345, 1.105, -0.343], [0.345, 1.105, -0.343], [-1, 0.0, 0.35], [1, 0.0, 0.35]);
  bakeRider(b, { rifle: -1, toe: 0.12 });
  // posed aiming straight ahead (the frame of parts 1 and 2 at rest). The bore lies about 13 cm right of his spine: the upper body is shifted
  // 7 cm left and turned a few degrees about the yaw axis, so that the muzzle is exactly the point the game fires from, (0, gy, mz)
  pose([0.0, 0.965, 0.64], [0, -0.02, 0], [-0.65, -0.1, 0.05], [0.6, -0.42, -0.42], [-0.17, 0.575, 0.5], [0.17, 0.575, 0.5], [-0.25, 0.2, -1], [0.25, 0.2, -1], null, null, [-0.25, -1, 0.1], [0.9, -0.35, 0.3]);
  shouldered(0);
  const sh = -0.07, ex = PP[45] + sh, hy = MOTO.tz - MOTO.mz, Lz = Math.sqrt(hy * hy - ex * ex);
  bakeRider(b, { rifle: 2, pack: 1, toe: 0.1, up: 1, arm: 2, hem: 1, xf: [sh, MOTO.gy - PP[46], MOTO.tz - Lz - (PP[47] + RIF_PTS.muzzle), Math.atan2(ex, Lz), MOTO.tz] });
  motoWheel(b, FZ, 3, 0.092, 0.07, true); motoWheel(b, RZ, 4, 0.122, 0.088, false);
  return b.build();
}
