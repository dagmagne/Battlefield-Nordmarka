// Static set pieces merged into one mesh: cabin, bridge, dam, power line, lamp posts, signs, boulders.
import { MB, MAT } from './mesh.js';
import { hash1, clamp } from './math.js';
import { TREELINE, PLAY } from './world.js';

const RED = [0.4, 0.055, 0.04], WHITE = [0.85, 0.85, 0.82], WOOD = [0.2, 0.13, 0.08], DWOOD = [0.1, 0.07, 0.05], STONE = [0.36, 0.36, 0.37], DARK = [0.03, 0.03, 0.035];

function slab(b, p0, p1, p2, p3, th) { // quad p0..p3 (ccw from above) extruded downwards by th
  const d = (p) => [p[0], p[1] - th, p[2]];
  b.quad(p0, p1, p2, p3); b.quad(d(p3), d(p2), d(p1), d(p0));
  b.quad(d(p0), d(p1), p1, p0); b.quad(d(p1), d(p2), p2, p1); b.quad(d(p2), d(p3), p3, p2); b.quad(d(p3), d(p0), p0, p3);
}

function cabin(b, c, W) {
  b.at(c.x, c.y, c.z, c.yaw);
  const hx = 6.2, hz = 4.1, y0 = 0.55, y1 = 3.5, yr = 5.9;
  b.set(STONE, MAT.stone); b.box(-hx - 0.15, -1.5, -hz - 0.15, hx + 0.15, y0, hz + 0.15);
  b.set(RED, MAT.plank);
  b.quad([-hx, y0, hz], [hx, y0, hz], [hx, y1, hz], [-hx, y1, hz], [0, y0, 2 * hx, y0, 2 * hx, y1, 0, y1]);
  b.quad([hx, y0, -hz], [-hx, y0, -hz], [-hx, y1, -hz], [hx, y1, -hz], [0, y0, 2 * hx, y0, 2 * hx, y1, 0, y1]);
  for (const s of [-1, 1]) {
    b.quad([s * hx, y0, s * hz], [s * hx, y0, -s * hz], [s * hx, y1, -s * hz], [s * hx, y1, s * hz], [0, y0, 2 * hz, y0, 2 * hz, y1, 0, y1]);
    const a = b.vert(s * hx, y1, s * hz, s, 0, 0, 0, y1), d = b.vert(s * hx, y1, -s * hz, s, 0, 0, 2 * hz, y1), e = b.vert(s * hx, yr, 0, s, 0, 0, hz, yr); b.tri(a, d, e);
  }
  // corner boards + base trim
  b.set(WHITE, MAT.paint);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * hx - 0.09, y0, sz * hz - 0.09, sx * hx + 0.09, y1, sz * hz + 0.09);
  // windows (white frame + lit glass)
  const win = (x, y, z, w, h, nx, nz, id) => {
    const tx = -nz, tz = nx, o = 0.04;
    b.set(WHITE, MAT.paint);
    b.quad([x - tx * (w + 0.1) + nx * o, y - 0.1, z - tz * (w + 0.1) + nz * o], [x + tx * (w + 0.1) + nx * o, y - 0.1, z + tz * (w + 0.1) + nz * o], [x + tx * (w + 0.1) + nx * o, y + h + 0.1, z + tz * (w + 0.1) + nz * o], [x - tx * (w + 0.1) + nx * o, y + h + 0.1, z - tz * (w + 0.1) + nz * o]);
    b.set(WHITE, MAT.window); const p = o + 0.02;
    b.quad([x - tx * w + nx * p, y, z - tz * w + nz * p], [x + tx * w + nx * p, y, z + tz * w + nz * p], [x + tx * w + nx * p, y + h, z + tz * w + nz * p], [x - tx * w + nx * p, y + h, z - tz * w + nz * p], [id, 1, id + 1, 1, id + 1, 0, id, 0]);
  };
  let id = 0;
  for (const x of [-4.4, -2.3, 2.3, 4.4]) win(x, 1.45, hz, 0.62, 1.35, 0, 1, id++);
  for (const x of [-4, -1.3, 1.3, 4]) win(x, 1.45, -hz, 0.62, 1.35, 0, -1, id++);
  for (const s of [-1, 1]) { win(s * hx, 1.45, 1.7, 0.62, 1.35, s, 0, id++); win(s * hx, 1.45, -1.7, 0.62, 1.35, s, 0, id++); win(s * hx, 3.9, 0, 0.5, 0.9, s, 0, id++); }
  // door + porch
  b.set([0.1, 0.16, 0.12], MAT.wood); b.box(-0.6, y0, hz, 0.6, y0 + 2.1, hz + 0.06);
  b.set(WHITE, MAT.paint); b.box(-0.72, y0, hz, -0.6, y0 + 2.2, hz + 0.08); b.box(0.6, y0, hz, 0.72, y0 + 2.2, hz + 0.08); b.box(-0.72, y0 + 2.1, hz, 0.72, y0 + 2.22, hz + 0.08);
  b.set(WOOD, MAT.wood); b.box(-1.7, y0 - 0.25, hz, 1.7, y0 - 0.02, hz + 2.0); b.box(-1.9, y0 - 0.5, hz + 2.0, 1.9, y0 - 0.27, hz + 2.5);
  for (const sx of [-1, 1]) b.box(sx * 1.55 - 0.07, y0, hz + 1.75, sx * 1.55 + 0.07, y0 + 2.45, hz + 1.9);
  b.set(DARK, MAT.metal); slab(b, [-1.9, y0 + 2.5, hz + 2.2], [1.9, y0 + 2.5, hz + 2.2], [1.9, y0 + 2.95, hz], [-1.9, y0 + 2.95, hz], 0.1);
  b.set(WHITE, MAT.snow); slab(b, [-1.95, y0 + 2.78, hz + 2.25], [1.95, y0 + 2.78, hz + 2.25], [1.95, y0 + 3.25, hz], [-1.95, y0 + 3.25, hz], 0.28);
  // roof + snow blanket
  const ox = hx + 0.7, oz = hz + 0.8, ye = y1 - (yr - y1) / hz * 0.8;
  for (const s of [-1, 1]) {
    const P = [[-ox, ye, s * oz], [ox, ye, s * oz], [ox, yr, 0], [-ox, yr, 0]]; if (s < 0) P.reverse();
    b.set(DARK, MAT.metal); slab(b, ...P, 0.14);
    const up = (p, t) => [p[0] * (p[0] > 0 ? 1 : 1) * 1.01, p[1] + t, p[2] * 1.02];
    b.set(WHITE, MAT.snow); slab(b, ...P.map((p) => up(p, 0.5)), 0.5);
  }
  b.set(WHITE, MAT.snow); b.box(-ox * 1.01, yr + 0.3, -0.5, ox * 1.01, yr + 0.56, 0.5, 0, 0.3);
  // chimney
  b.set(STONE, MAT.stone); b.box(2.2, 4.2, -1.5, 3.1, 7.0, -0.6);
  b.set(WHITE, MAT.snow); b.box(2.15, 7.0, -1.55, 3.15, 7.12, -0.55, 0.3, 0.3);
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  c.chimney = [c.x + cs * 2.65 + sn * -1.05, c.y + 7.1, c.z - sn * 2.65 + cs * -1.05];
  // flagpole
  b.set(WHITE, MAT.paint); b.cyl(9.5, -0.5, 7, 9.5, 9.5, 7, 0.07, 0.04, 8);
  b.set(WHITE, MAT.flag); b.quad([9.55, 8.0, 7], [11.2, 7.75, 7.5], [11.2, 8.95, 7.5], [9.55, 9.2, 7], [0, 1, 1, 1, 1, 0, 0, 0]);
  b.quad([11.2, 7.75, 7.5], [9.55, 8.0, 7], [9.55, 9.2, 7], [11.2, 8.95, 7.5], [1, 1, 0, 1, 0, 0, 1, 0]);
  // firewood stack + bench by the wall
  b.set(WOOD, MAT.wood); b.box(-5.6, y0 - 0.5, -hz - 1.0, -2.2, y0 + 0.9, -hz - 0.1);
  W.colliders.push(c.x, c.z, 8.2, c.x + cs * 9.5 + sn * 7, c.z - sn * 9.5 + cs * 7, 0.5);
}

function bridge(b, B) {
  b.at(B.x, B.y, B.z, B.yaw);
  const hl = B.len / 2, hw = 4.9, drop = B.y - B.bed + 1.0;
  b.set(WOOD, MAT.wood); b.box(-hw, -0.32, -hl, hw, -0.03, hl);
  for (const s of [-1, 1]) {
    b.set(DWOOD, MAT.wood); b.box(s * hw - 0.2, -0.75, -hl - 0.6, s * hw + 0.2, 0.12, hl + 0.6);
    b.set([0.008, 0.008, 0.01], MAT.paint);
    b.quad([s * (hw - 0.25), -drop, -hl + 2], [s * (hw - 0.25), -drop, hl - 2], [s * (hw - 0.25), -0.7, hl - 2], [s * (hw - 0.25), -0.7, -hl + 2]);
    b.quad([s * (hw - 0.25), -drop, hl - 2], [s * (hw - 0.25), -drop, -hl + 2], [s * (hw - 0.25), -0.7, -hl + 2], [s * (hw - 0.25), -0.7, hl - 2]);
    b.set(DWOOD, MAT.wood);
    for (let z = -hl + 2; z <= hl - 1.9; z += (B.len - 4) / 5) {
      b.cyl(s * hw, -drop, z, s * hw, -0.7, z, 0.17, 0.15, 7);
      if (z < hl - 3) { b.cyl(s * hw, -drop * 0.85, z, s * hw, -0.9, z + (B.len - 4) / 5, 0.07, 0.07, 5); }
    }
    // railing
    for (let z = -hl; z <= hl + 0.01; z += B.len / 10) b.box(s * hw - 0.08, 0.1, z - 0.08, s * hw + 0.08, 1.25, z + 0.08);
    b.box(s * hw - 0.06, 1.12, -hl - 0.3, s * hw + 0.06, 1.24, hl + 0.3); b.box(s * hw - 0.04, 0.62, -hl, s * hw + 0.04, 0.72, hl);
  }
  for (const e of [-1, 1]) { b.set(STONE, MAT.stone); b.box(-hw - 0.5, -drop, e * hl - 1.2, hw + 0.5, -0.3, e * hl + 1.2); }
}

function dam(b, D) {
  b.at(D.x, 0, D.z, D.yaw);
  const top = D.top, base = D.base, hl = 17;
  b.set(STONE, MAT.stone);
  b.box(-hl, base, -0.8, -3.2, top, 0.8, 0, 0.1); b.box(3.2, base, -0.8, hl, top, 0.8, 0, 0.1);
  b.box(-3.2, base, -0.8, 3.2, top - 0.85, 0.8);
  for (const x of [-12, -7.5, -3.6, 3.6, 7.5, 12]) b.box(x - 0.45, base, -3.0, x + 0.45, top - 0.5, -0.7, 0, 0, 0), b.quad([x - 0.45, top - 0.5, -0.8], [x + 0.45, top - 0.5, -0.8], [x + 0.45, base + 0.5, -3.4], [x - 0.45, base + 0.5, -3.4]);
  // frozen spillway
  b.set([0.5, 0.68, 0.8], MAT.glass);
  b.blob(0, (top + base) / 2 - 0.6, -1.25, 2.6, (top - base) / 2, 0.75, 7, 0.22, 9);
  b.blob(0.3, base + 0.4, -2.6, 3.3, 0.7, 1.6, 9, 0.3, 8);
  // walkway + railing
  b.set(DARK, MAT.metal);
  for (const z of [-0.7, 0.7]) { for (let x = -hl; x <= hl; x += 2.125) b.box(x - 0.03, top, z - 0.03, x + 0.03, top + 1.05, z + 0.03); b.box(-hl, top + 1.0, z - 0.025, hl, top + 1.05, z + 0.025); b.box(-hl, top + 0.5, z - 0.02, hl, top + 0.54, z + 0.02); }
  b.box(-3.3, top - 0.08, -0.75, 3.3, top, 0.75);
  // gate house
  b.set(RED, MAT.plank); b.box(-hl - 0.2, top, -1.3, -hl + 2.6, top + 2.3, 1.3);
  b.set(WHITE, MAT.snow); b.box(-hl - 0.5, top + 2.3, -1.6, -hl + 2.9, top + 2.75, 1.6, 0.2, 0.2);
}

function pylon(b, p) {
  b.at(p.x, p.y, p.z, p.yaw);
  b.set(DWOOD, MAT.wood);
  for (const s of [-1, 1]) b.cyl(s * 2.6, -1, 0, s * 2.6, 13, 0, 0.19, 0.14, 8);
  b.box(-4.6, 11.4, -0.12, 4.6, 11.7, 0.12);
  b.cyl(-2.6, 6, 0.05, 2.6, 10.8, 0.05, 0.06, 0.06, 5); b.cyl(2.6, 6, -0.05, -2.6, 10.8, -0.05, 0.06, 0.06, 5);
  b.set([0.25, 0.3, 0.3], MAT.glass);
  for (const x of [-4.2, 0, 4.2]) b.cyl(x, 10.75, 0, x, 11.4, 0, 0.07, 0.07, 6);
}
function wires(b, a, c) {
  b.at(0, 0, 0); b.set(DARK, MAT.wire);
  const N = 10, rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
  for (const o of [-4.2, 0, 4.2]) {
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = a.x + (c.x - a.x) * t + rx * o, z = a.z + (c.z - a.z) * t + rz * o, y = a.y + (c.y - a.y) * t + 10.7 - 3.2 * 4 * t * (1 - t);
      if (i) b.cyl(px, py, pz, x, y, z, 0.035, 0.035, 3, 0);
      px = x; py = y; pz = z;
    }
  }
}
function lamp(b, L) {
  b.at(L.x, L.y, L.z, L.yaw);
  b.set(DWOOD, MAT.wood); b.cyl(0, -0.8, 0, 0, 6.1, 0, 0.12, 0.085, 7);
  b.set(DARK, MAT.metal); b.cyl(0, 5.9, 0, 0, 6.15, 1.5, 0.035, 0.035, 5); b.box(-0.14, 6.05, 1.25, 0.14, 6.2, 1.85, 0.03, 0.03);
  b.set([1, 0.76, 0.46], MAT.lamp); b.quad([-0.11, 6.045, 1.8], [0.11, 6.045, 1.8], [0.11, 6.045, 1.3], [-0.11, 6.045, 1.3]);
  b.quad([-0.11, 6.05, 1.851], [0.11, 6.05, 1.851], [0.11, 6.12, 1.851], [-0.11, 6.12, 1.851]);
}
function sign(b, S) {
  b.at(S.x, S.y, S.z, S.yaw);
  b.set(DWOOD, MAT.wood); b.cyl(0, -0.6, 0, 0, 2.7, 0, 0.06, 0.05, 6);
  const board = (y, dir, k) => {
    b.set([0.5 + k * 0.001, 0.04 + k * 0.01, 0.035], MAT.sign);
    const x0 = dir > 0 ? -0.1 : -1.0, x1 = dir > 0 ? 1.0 : 0.1, tip = dir > 0 ? x1 + 0.14 : x0 - 0.14;
    for (const z of [0.065, -0.065]) {
      const f = z > 0 ? 1 : -1, u0 = dir * f > 0 ? 0 : 1;
      b.quad([f > 0 ? x0 : x1, y, z], [f > 0 ? x1 : x0, y, z], [f > 0 ? x1 : x0, y + 0.2, z], [f > 0 ? x0 : x1, y + 0.2, z], [u0, 1, 1 - u0, 1, 1 - u0, 0, u0, 0]);
      const a = b.vert(dir > 0 ? x1 : x0, y, z, 0, 0, f, 0.99, 0.9), c = b.vert(tip, y + 0.1, z, 0, 0, f, 0.99, 0.9), d = b.vert(dir > 0 ? x1 : x0, y + 0.2, z, 0, 0, f, 0.99, 0.9); b.tri(a, c, d);
    }
  };
  board(2.35, 1, S.a); board(2.08, -1, S.b); board(1.81, 1, S.b + 3);
}

export function buildProps(W) {
  const b = new MB();
  W.colliders = [];
  cabin(b, W.cabin, W); bridge(b, W.bridge); dam(b, W.dam);
  for (let i = 0; i < W.pylons.length; i++) { pylon(b, W.pylons[i]); if (i) wires(b, W.pylons[i - 1], W.pylons[i]); W.colliders.push(W.pylons[i].x + Math.cos(W.pylons[i].yaw) * 2.6, W.pylons[i].z - Math.sin(W.pylons[i].yaw) * 2.6, 0.5, W.pylons[i].x - Math.cos(W.pylons[i].yaw) * 2.6, W.pylons[i].z + Math.sin(W.pylons[i].yaw) * 2.6, 0.5); }
  for (const L of W.lamps) { lamp(b, L); W.colliders.push(L.x, L.z, 0.35); }
  for (const S of W.signs) { sign(b, S); W.colliders.push(S.x, S.z, 0.3); }
  // boulders: alpine outcrops + a few in the forest
  b.at(0, 0, 0); b.set([0.2, 0.2, 0.2], MAT.rock);
  const HN = W.HN;
  let placed = 0;
  for (let i = 0; i < 9000 && placed < 420; i++) {
    const x = (hash1(i * 3 + 1) * 2 - 1) * (PLAY + 250), z = (hash1(i * 3 + 2) * 2 - 1) * (PLAY + 250), r = hash1(i * 3 + 3);
    const k = (clamp(Math.round((z + 2048) / 2 - 0.5), 0, HN - 1) * HN + clamp(Math.round((x + 2048) / 2 - 0.5), 0, HN - 1)) * 4;
    const alp = W.mat[k + 3] / 255; if (W.mat[k] > 0 || W.mat[k + 1] > 0 || W.mat[k + 2] > 20) continue;
    if (r > alp * 0.5 + 0.012) continue;
    let near = false; for (const t of W.trails) { for (let q = 0; q < t.n; q += 3) if (Math.abs(t.pts[q * 2] - x) < 6 && Math.abs(t.pts[q * 2 + 1] - z) < 6) { near = true; break; } if (near) break; }
    if (near || Math.hypot(x - W.cabin.x, z - W.cabin.z) < 40) continue;
    const s = 0.5 + 2.6 * hash1(i * 7 + 5) ** 2, y = W.heightAt(x, z);
    b.blob(x, y + s * 0.25, z, s * (0.8 + 0.6 * hash1(i + 9)), s * (0.55 + 0.4 * hash1(i + 19)), s * (0.8 + 0.6 * hash1(i + 29)), i, 0.28, 7);
    W.colliders.push(x, z, s * 0.9); placed++;
  }
  W.colliders = new Float32Array(W.colliders);
  return b.build();
}
