// Tiny procedural mesh builder. Vertex = pos3 nrm3 col3 mat1 uv2 part1 pad1 (14 floats).
import { trs, identity } from './math.js';
export const VS = 14;
export const MAT = { paint: 0, wood: 1, snow: 2, stone: 3, glass: 4, metal: 5, lamp: 6, window: 7, bar: 8, rubber: 9, head: 10, beacon: 11, rock: 12, sign: 13, wheel: 14, finisher: 15, wire: 16, plank: 17, flag: 18, void: 19, camo: 20, rus: 21, rubble: 22, charred: 23, cloth: 24, skin: 25, gear: 26, pack: 27, glove: 28, ballast: 29, concrete: 30 };
export class MB {
  constructor() { this.v = []; this.i = []; this.c = [1, 1, 1]; this.mat = 0; this.part = 0; this.m = new Float32Array(16); identity(this.m); }
  at(x, y, z, yaw = 0, pitch = 0, roll = 0) { trs(this.m, x, y, z, yaw, pitch, roll); return this; }
  set(c, mat = 0) { this.c = c; this.mat = mat; return this; }
  vert(x, y, z, nx, ny, nz, u = 0, v = 0) {
    const m = this.m, V = this.v;
    V.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
      m[0] * nx + m[4] * ny + m[8] * nz, m[1] * nx + m[5] * ny + m[9] * nz, m[2] * nx + m[6] * ny + m[10] * nz,
      this.c[0], this.c[1], this.c[2], this.mat, u, v, this.part, 0);
    return V.length / VS - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  // quad from 4 points (ccw seen from the normal side), flat normal
  quad(p0, p1, p2, p3, uv) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const q = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    const a = this.vert(p0[0], p0[1], p0[2], nx, ny, nz, q[0], q[1]), b = this.vert(p1[0], p1[1], p1[2], nx, ny, nz, q[2], q[3]), c = this.vert(p2[0], p2[1], p2[2], nx, ny, nz, q[4], q[5]), d = this.vert(p3[0], p3[1], p3[2], nx, ny, nz, q[6], q[7]);
    this.i.push(a, b, c, a, c, d);
  }
  // box by min/max; optional taper of the top face (tx,tz shrink)
  box(x0, y0, z0, x1, y1, z1, tx = 0, tz = 0, tz1 = tz) {
    const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y0, z1], d = [x0, y0, z1];
    const e = [x0 + tx, y1, z0 + tz], f = [x1 - tx, y1, z0 + tz], g = [x1 - tx, y1, z1 - tz1], h = [x0 + tx, y1, z1 - tz1];
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    this.quad(e, h, g, f, [0, 0, 0, sz, sx, sz, sx, 0]); this.quad(a, b, c, d, [0, 0, sx, 0, sx, sz, 0, sz]);
    this.quad(d, c, g, h, [0, 0, sx, 0, sx, sy, 0, sy]); this.quad(b, a, e, f, [0, 0, sx, 0, sx, sy, 0, sy]);
    this.quad(a, d, h, e, [0, 0, sz, 0, sz, sy, 0, sy]); this.quad(c, b, f, g, [0, 0, sz, 0, sz, sy, 0, sy]);
  }
  // cylinder / cone between two points
  cyl(ax, ay, az, bx, by, bz, r0, r1, seg = 8, cap = 1) {
    let dx = bx - ax, dy = by - ay, dz = bz - az; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
    let ux = Math.abs(dy) > 0.9 ? 1 : 0, uy = Math.abs(dy) > 0.9 ? 0 : 1, uz = 0;
    let vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux; let l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
    ux = vy * dz - vz * dy; uy = vz * dx - vx * dz; uz = vx * dy - vy * dx;
    const base = this.v.length / VS;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), nx = ux * c + vx * s, ny = uy * c + vy * s, nz = uz * c + vz * s;
      this.vert(ax + nx * r0, ay + ny * r0, az + nz * r0, nx, ny, nz, i / seg, 0); this.vert(bx + nx * r1, by + ny * r1, bz + nz * r1, nx, ny, nz, i / seg, L);
    }
    for (let i = 0; i < seg; i++) { const k = base + i * 2; this.i.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    if (cap) for (let e = 0; e < 2; e++) {
      const r = e ? r1 : r0, px = e ? bx : ax, py = e ? by : ay, pz = e ? bz : az, sg = e ? 1 : -1; if (r < 1e-3) continue;
      const c0 = this.vert(px, py, pz, dx * sg, dy * sg, dz * sg, 0, 0), b2 = this.v.length / VS;
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); this.vert(px + (ux * c + vx * s) * r, py + (uy * c + vy * s) * r, pz + (uz * c + vz * s) * r, dx * sg, dy * sg, dz * sg, c, s); }
      for (let i = 0; i < seg; i++) { if (e) this.i.push(c0, b2 + i, b2 + i + 1); else this.i.push(c0, b2 + i + 1, b2 + i); }
    }
  }
  // noisy blob (rocks, snow pillows)
  blob(cx, cy, cz, rx, ry, rz, seed, rough = 0.25, seg = 7) {
    const base = this.v.length / VS, rings = Math.max(4, seg - 2);
    const h = (i, j) => { let n = Math.imul(i * 73856093 ^ j * 19349663 ^ seed * 83492791, 0x2c1b3c6d); n ^= n >>> 15; n = Math.imul(n, 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
    const P = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const th = j / rings * Math.PI, ph = (i % seg) / seg * Math.PI * 2, r = 1 + (h(i % seg, j === 0 || j === rings ? 0 : j) - 0.5) * 2 * rough;
      P.push([Math.sin(th) * Math.cos(ph) * rx * r, Math.cos(th) * ry * r, Math.sin(th) * Math.sin(ph) * rz * r]);
    }
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const p = P[j * (seg + 1) + i], a = P[j * (seg + 1) + (i + 1) % (seg + 1)], b = P[Math.min(rings, j + 1) * (seg + 1) + i], c = P[j * (seg + 1) + (i + seg) % (seg + 1)], d = P[Math.max(0, j - 1) * (seg + 1) + i];
      let nx = p[0] / (rx * rx), ny = p[1] / (ry * ry), nz = p[2] / (rz * rz);
      const ex = a[0] - c[0], ey = a[1] - c[1], ez = a[2] - c[2], fx = b[0] - d[0], fy = b[1] - d[1], fz = b[2] - d[2];
      let mx = ey * fz - ez * fy, my = ez * fx - ex * fz, mz = ex * fy - ey * fx;
      if (mx * nx + my * ny + mz * nz < 0) { mx = -mx; my = -my; mz = -mz; }
      let l = Math.hypot(mx, my, mz); if (l < 1e-6 || j === 0 || j === rings) { mx = nx; my = ny; mz = nz; l = Math.hypot(mx, my, mz); }
      this.vert(cx + p[0], cy + p[1], cz + p[2], mx / l, my / l, mz / l, i / seg, j / rings);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const k = base + j * (seg + 1) + i; this.i.push(k, k + 1, k + seg + 1, k + 1, k + seg + 2, k + seg + 1); }
  }
  build() { return { v: new Float32Array(this.v), i: new Uint32Array(this.i) }; }
}
