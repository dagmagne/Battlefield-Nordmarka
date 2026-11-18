// Procedural tree meshes (unit height). Vertex = pos3 nrm3 uv2 kind1 ao1 (10 floats).
// kind: 0 bark, 1 needle frond, 2 twig card, 3 birch bark
import { hash1 } from './math.js';

class TB {
  constructor() { this.v = []; this.i = []; }
  vert(x, y, z, nx, ny, nz, u, v, kind, ao) { const l = Math.hypot(nx, ny, nz) || 1; this.v.push(x, y, z, nx / l, ny / l, nz / l, u, v, kind, ao); return this.v.length / 10 - 1; }
  // tapered tube along a polyline of [x,y,z,r]
  tube(pts, sides, kind, ao0 = 0.8, ao1 = 1) {
    const base = this.v.length / 10, n = pts.length;
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
      let ux = Math.abs(dy) > 0.95 ? 1 : -dz, uy = 0, uz = Math.abs(dy) > 0.95 ? 0 : dx; let l = Math.hypot(ux, uz); ux /= l; uz /= l;
      const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
      for (let s = 0; s <= sides; s++) {
        const an = s / sides * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an), nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
        this.vert(p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], nx, ny, nz, s / sides, p[1], kind, ao0 + (ao1 - ao0) * k / (n - 1));
      }
    }
    for (let k = 0; k < n - 1; k++) for (let s = 0; s < sides; s++) { const q = base + k * (sides + 1) + s; this.i.push(q, q + sides + 1, q + 1, q + 1, q + sides + 1, q + sides + 2); }
  }
  // drooping spruce frond
  frond(y0, phi, len, droop, w, aoB, uo = 0, seg = 4, ox = 0, oz = 0) {
    const dx = Math.cos(phi), dz = Math.sin(phi), tx = -dz, tz = dx, base = this.v.length / 10;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, r = len * (0.05 + 0.95 * t), y = y0 - len * droop * (1.5 * t - 0.8 * t * t), hw = w * Math.pow(Math.sin(Math.PI * Math.min(t * 0.88 + 0.12, 1)), 0.7);
      const ao = aoB * (0.4 + 0.6 * t), cx = ox + dx * r, cz = oz + dz * r, ny = 0.75, nr = 0.35 + 0.3 * t;
      this.vert(cx - tx * hw, y - hw * 0.22, cz - tz * hw, dx * nr - tx * 0.55, ny, dz * nr - tz * 0.55, t + uo, -1, 1, ao);
      this.vert(cx, y + hw * 0.28, cz, dx * nr, ny + 0.2, dz * nr, t + uo, 0, 1, ao);
      this.vert(cx + tx * hw, y - hw * 0.22, cz + tz * hw, dx * nr + tx * 0.55, ny, dz * nr + tz * 0.55, t + uo, 1, 1, ao);
    }
    for (let i = 0; i < seg; i++) { const q = base + i * 3; this.i.push(q, q + 1, q + 3, q + 1, q + 4, q + 3, q + 1, q + 2, q + 4, q + 2, q + 5, q + 4); }
  }
  // star-shaped cone skirt (one whorl of branches)
  // jit > 0: irregular whorl (each branch its own length, angle and droop; seeded by js)
  tier(cx, y, cz, len, droop, lobes, rot, aoB, rise = 0.5, uo = 4, jit = 0, js = 0) {
    const A = (u, v, ny = 1) => this.vert(cx, y + len * rise, cz, 0, ny, 0, u + uo, v, 1, aoB * 0.45);
    for (let j = 0; j < lobes; j++) {
      const ja = jit * (R(js * 13 + j) - 0.5) * 0.7, jl = 1 + jit * (R(js * 29 + j + 3) - 0.45) * 0.75, jd = 1 + jit * (R(js * 7 + j + 11) - 0.5) * 0.8;
      const a0 = rot + (j - 0.5) / lobes * Math.PI * 2, a1 = rot + (j + ja) / lobes * Math.PI * 2, a2 = rot + (j + 0.5) / lobes * Math.PI * 2;
      const L = len * jl, rn = len * 0.5, yt = y - L * droop * jd, yn = y - len * droop * 0.25;
      const ap = A(0, 0), n0 = this.vert(cx + Math.cos(a0) * rn, yn, cz + Math.sin(a0) * rn, Math.cos(a0) * 0.6, 0.7, Math.sin(a0) * 0.6, 0.6 + uo, -1, 1, aoB * 0.7);
      const tp = this.vert(cx + Math.cos(a1) * L, yt, cz + Math.sin(a1) * L, Math.cos(a1) * 0.75, 0.6, Math.sin(a1) * 0.75, 1 + uo, 0, 1, aoB);
      const n1 = this.vert(cx + Math.cos(a2) * rn, yn, cz + Math.sin(a2) * rn, Math.cos(a2) * 0.6, 0.7, Math.sin(a2) * 0.6, 0.6 + uo, 1, 1, aoB * 0.7);
      this.i.push(ap, n0, tp, ap, tp, n1);
    }
  }
  card(cx, cy, cz, phi, w, h, tilt, ao) { // hanging twig card, top edge at cy
    const dx = Math.cos(phi), dz = Math.sin(phi), ox = -dz * tilt * h, oz = dx * tilt * h;
    const nx = -dz, nz = dx;
    const a = this.vert(cx - dx * w, cy, cz - dz * w, nx * 0.5, 0.8, nz * 0.5, 0, 0, 2, ao), b = this.vert(cx + dx * w, cy, cz + dz * w, nx * 0.5, 0.8, nz * 0.5, 1, 0, 2, ao);
    const c = this.vert(cx + dx * w * 1.15 + ox, cy - h, cz + dz * w * 1.15 + oz, nx * 0.5, 0.8, nz * 0.5, 1, 1, 2, ao * 0.8), d = this.vert(cx - dx * w * 1.15 + ox, cy - h, cz - dz * w * 1.15 + oz, nx * 0.5, 0.8, nz * 0.5, 0, 1, 2, ao * 0.8);
    this.i.push(a, b, c, a, c, d);
  }
}
const R = (n) => hash1(n * 2654435761 | 0);

function spruce(lod) {
  const b = new TB();
  if (lod === 0) {
    b.tube([[0, 0, 0, 0.017], [0, 0.5, 0, 0.011], [0, 0.97, 0, 0.002]], 6, 0, 0.55, 0.8);
    const K = 19;
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1), y = 0.09 + 0.87 * Math.pow(t, 0.8) + (k && k < K - 1 ? (R(k + 500) - 0.5) * 0.018 : 0), len = 0.165 * Math.pow(1 - y, 0.72) + 0.012, nb = Math.round(8.6 - 4.2 * t);
      for (let j = 0; j < nb; j++) {
        const r = R(k * 17 + j), ph = (j + 0.6 * r) / nb * Math.PI * 2 + k * 2.4;
        const fl = len * (0.78 + 0.44 * R(k * 31 + j + 5)), fd = (0.8 - 0.5 * t) * (0.75 + 0.5 * R(k * 7 + j * 3)), fy = y + (r - 0.5) * 0.025;
        b.frond(fy, ph, fl, fd, len * 0.36, 0.62 + 0.38 * y);
        b.frond(fy - len * 0.045, ph + 0.05, fl * 1.04, fd * 1.3, len * 0.4, 0.5 + 0.3 * y, 2, 3); // lower skirt: 3 segments (mostly seen edge-on or from below; saves 12 % of the near-model triangles, most of them in the shadow passes)
      }
    }
    b.tier(0, 0.955, 0, 0.022, 1.2, 5, 0.3, 1, 2.0);
  } else if (lod === 1) {
    b.tube([[0, 0, 0, 0.017], [0, 0.9, 0, 0.003]], 4, 0, 0.55, 0.8);
    const K = 11; // whorls closer together near the top (where they are short), so the crown has no see-through gaps
    for (let k = 0; k < K; k++) { const t = k / (K - 1), y = 0.11 + 0.83 * Math.pow(t, 0.8) + (k && k < K - 1 ? (R(k + 300) - 0.5) * 0.03 : 0), len = 0.17 * Math.pow(1 - y, 0.72) + 0.02; b.tier(0, y, 0, len, 0.72 - 0.4 * t, k & 1 ? 5 : 6, k * 2.4, 0.62 + 0.38 * y, 0.62 + 0.25 * t, 4, 1, k + 50); }
  } else if (lod === 2) {
    b.tube([[0, 0, 0, 0.016], [0, 0.5, 0, 0.008]], 3, 0, 0.55, 0.7);
    for (let k = 0; k < 5; k++) { const y = 0.12 + 0.81 * Math.pow(k / 4, 0.85), len = 0.17 * Math.pow(1 - y, 0.72) + 0.02; b.tier(0, y, 0, len, 0.7, 4, k * 2.4, 0.7 + 0.3 * y, k === 4 ? 2.6 : 1.5, 4, 0.8, k + 90); }
  } else {
    b.tier(0, 0.1, 0, 0.15, 0.5, 4, 0.4, 0.8, 3.2); b.tier(0, 0.5, 0, 0.085, 0.6, 4, 1.3, 0.95, 5.6);
  }
  return b;
}
function pine(lod) {
  const b = new TB();
  if (lod === 0) {
    b.tube([[0, 0, 0, 0.021], [0.008, 0.3, 0.004, 0.017], [-0.006, 0.62, 0.006, 0.012], [0.004, 0.93, 0, 0.004]], 6, 0, 0.7, 1);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), y = 0.54 + 0.4 * f + (R(i + 40) - 0.5) * 0.03, ph = i * 2.4 + R(i) * 0.8, ro = (0.035 + 0.1 * (1 - f * f * 0.8)) * (0.8 + 0.4 * R(i + 9));
      const cx = Math.cos(ph) * ro, cz = Math.sin(ph) * ro, rad = 0.105 * (1.15 - 0.45 * f) * (0.85 + 0.3 * R(i + 77));
      b.tube([[0, y - 0.07, 0, 0.007], [cx * 0.6, y - 0.03, cz * 0.6, 0.005], [cx, y, cz, 0.002]], 4, 0, 0.7, 0.9);
      b.tier(cx, y - 0.005, cz, rad, 0.34, 6, i * 0.9, 0.75 + 0.25 * f, 0.5, 4, 1.1, i + 200);
      b.tier(cx * 0.9, y + 0.022, cz * 0.9, rad * 0.62, 0.36, 5, i * 1.7 + 0.5, 0.9, 0.6, 4, 1.1, i + 230);
    }
    b.tier(0, 0.95, 0, 0.055, 0.3, 6, 0.2, 1, 0.9);
  } else {
    b.tube([[0, 0, 0, 0.021], [0, 0.9, 0, 0.005]], 4, 0, 0.7, 1);
    for (let i = 0; i < 9; i++) { const f = i / 8, y = 0.47 + 0.46 * f + (R(i + 260) - 0.5) * 0.04, ph = i * 2.4 + R(i + 270), ro = (0.03 + 0.075 * (1 - f * 0.8)) * (0.8 + 0.4 * R(i + 280)); b.tier(Math.cos(ph) * ro, y, Math.sin(ph) * ro, 0.105 * (1.12 - 0.45 * f) * (0.85 + 0.3 * R(i + 290)), 0.36, 4, i * 1.3, 0.75 + 0.25 * f, 0.6, 4, 1.1, i + 300); }
  }
  return b;
}
function birch(lod) {
  const b = new TB();
  const sides = lod ? 4 : 6, nl = lod ? 5 : 9;
  b.tube([[0, 0, 0, 0.021], [0.012, 0.3, -0.006, 0.016], [-0.01, 0.62, 0.012, 0.009], [0.008, 0.93, 0, 0.0025]], sides, 3, 0.0, 0.35);
  for (let i = 0; i < nl; i++) {
    const f = i / (nl - 1), y = 0.27 + 0.52 * f, ph = i * 2.4 + R(i + 3), len = 0.3 * (1 - f * 0.5) * (0.8 + 0.4 * R(i + 11)), up = 0.55 + 0.3 * R(i + 5);
    const ex = Math.cos(ph) * len * (1 - up * 0.45), ez = Math.sin(ph) * len * (1 - up * 0.45), ey = y + len * up;
    const mx = ex * 0.5, mz = ez * 0.5, my = y + len * up * 0.6;
    b.tube([[0, y, 0, 0.0075], [mx, my, mz, 0.0045], [ex, ey, ez, 0.0012]], lod ? 3 : 4, 3, 0.55, 1);
    // twig sprays: fan cards whose apex sits on the limb
    const w = lod ? 0.15 : 0.115, h = lod ? 0.3 : 0.25;
    b.card(ex, ey + 0.02, ez, ph + 1.1, w, h, 0.5, 0.95); b.card(ex, ey - 0.01, ez, ph - 0.5, w * 0.9, -h * 0.75, -0.6, 1);
    if (!lod) {
      b.card(mx, my + 0.015, mz, ph + 2.3, w, h * 0.95, 0.5, 0.8); b.card(mx, my - 0.01, mz, ph + 0.4, w * 0.9, -h * 0.7, -0.6, 0.9);
      const sx = Math.cos(ph + 1.2) * len * 0.3, sz = Math.sin(ph + 1.2) * len * 0.3;
      b.tube([[mx, my, mz, 0.003], [mx + sx, my + len * 0.22, mz + sz, 0.001]], 3, 3, 0.9, 1);
      b.card(mx + sx, my + len * 0.22 + 0.01, mz + sz, ph + 2.9, w * 0.85, h * 0.8, 0.4, 0.9);
    }
  }
  b.card(0, 0.9, 0, 0.3, 0.09, -0.2, 0.2, 1); b.card(0, 0.9, 0, 1.9, 0.09, -0.2, -0.2, 1);
  if (!lod) { b.card(0.01, 0.94, 0, 2.6, 0.11, 0.24, 0.4, 1); b.card(0, 0.9, 0.01, 1.1, 0.11, 0.24, -0.4, 0.9); }
  return b;
}

// returns { v, i, parts: [{first,count,base}] }: parts 0-2 = LOD0 spruce/pine/birch, 3-5 = LOD1, 6 = LOD2 generic, 7 = LOD3 generic
export function buildTrees() {
  const list = [spruce(0), pine(0), birch(0), spruce(1), pine(1), birch(1), spruce(2), spruce(3)];
  let nv = 0, ni = 0; for (const m of list) { nv += m.v.length; ni += m.i.length; }
  const v = new Float32Array(nv), i = new Uint32Array(ni), parts = []; let ov = 0, oi = 0;
  for (const m of list) { v.set(m.v, ov); i.set(m.i, oi); parts.push({ first: oi, count: m.i.length, base: ov / 10 }); ov += m.v.length; oi += m.i.length; }
  return { v, i, parts };
}
