// Static set pieces merged into one mesh: cabin, bridge, dam, power line, lamp posts, signs, boulders.
import { MB, MAT } from './mesh.js';
import { hash1, clamp } from './math.js';

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
  b.set(c.col || RED, MAT.plank);
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

const HCOL = [[0.74, 0.73, 0.69], [0.4, 0.06, 0.045], [0.5, 0.36, 0.14], [0.14, 0.095, 0.065], [0.27, 0.3, 0.27], [0.6, 0.58, 0.48], [0.19, 0.22, 0.28], [0.74, 0.73, 0.69], [0.4, 0.06, 0.045]];
const SNOWC = [0.92, 0.94, 0.97];
function gable(b, hw, hd, y0, rise, o) { // snow-covered pitched roof, ridge along local x
  const e = y0 - o * rise / hd, t = y0 + rise;
  b.quad([-hw - o, e, hd + o], [hw + o, e, hd + o], [hw + o, t, 0], [-hw - o, t, 0]);
  b.quad([hw + o, e, -hd - o], [-hw - o, e, -hd - o], [-hw - o, t, 0], [hw + o, t, 0]);
}
function house(b, B, i, W) {
  const r = hash1(i * 13 + 1), r2 = hash1(i * 29 + 7), r3 = hash1(i * 53 + 3), hw = B.w / 2, hd = B.d / 2, k = B.kind;
  const wall = k === 2 ? 2.5 : k === 1 ? 2.7 : k === 3 ? Math.max(6.5, (B.lv || 3) * 3) : B.lv ? B.lv * 2.8 : 4.4 + 2.4 * r2;
  const flat = k === 3 && (B.w > 34 || r > 0.6), rise = flat ? 0 : Math.min(hd * (k === 1 ? 0.6 : 0.8), 4.8);
  const col = k === 1 ? HCOL[3] : k === 3 ? HCOL[r < 0.5 ? 0 : 5] : HCOL[(r * 9) | 0];
  b.at(B.x, B.y, B.z, -B.yaw);
  b.set(col, MAT.paint); b.box(-hw, -5, -hd, hw, wall, hd);
  if (flat) { b.set(SNOWC, MAT.snow); b.box(-hw - 0.2, wall, -hd - 0.2, hw + 0.2, wall + 0.4, hd + 0.2); }
  else {
    for (const s of [-1, 1]) { const a = b.vert(s * hw, wall, s * hd, s, 0, 0), d = b.vert(s * hw, wall, -s * hd, s, 0, 0), e = b.vert(s * hw, wall + rise, 0, s, 0, 0); b.tri(a, d, e); }
    b.set(SNOWC, MAT.snow); gable(b, hw, hd, wall, rise, 0.45);
  }
  if (k !== 2 && r3 < 0.6) { // a row of lit windows on each long wall
    b.set([1, 0.78, 0.45], MAT.window);
    const n = Math.max(1, Math.min(5, (B.w / 4.2) | 0)), y = k === 1 ? 1.1 : 1.3;
    for (let f = 0; f < (wall > 5.6 && r2 > 0.4 ? 2 : 1); f++) for (let q = 0; q < n; q++) {
      if (hash1(i * 7 + q * 3 + f) < 0.35) continue;
      const x = (q + 0.5) / n * B.w - hw, s = hash1(i + q) < 0.5 ? 1 : -1, yy = y + f * 2.8;
      b.quad([x - s * 0.55, yy, s * (hd + 0.03)], [x + s * 0.55, yy, s * (hd + 0.03)], [x + s * 0.55, yy + 1.15, s * (hd + 0.03)], [x - s * 0.55, yy + 1.15, s * (hd + 0.03)]);
    }
  }
  const n = Math.max(1, Math.round(B.w / B.d)), c = Math.cos(B.yaw), sn = Math.sin(B.yaw);
  for (let q = 0; q < n; q++) { const t = ((q + 0.5) / n - 0.5) * B.w; W.colliders.push(B.x + c * t, B.z + sn * t, Math.max(0.5, hd * 0.95 - 0.9)); }
}
// Frognerseteren: dark dragon-style timber lodge — long hall, steep snow roofs, cross wing, veranda.
function lodge(b, c, W) {
  const TIM = [0.115, 0.075, 0.045], TRIM = [0.2, 0.13, 0.07], cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const wpos = (lx, lz) => [c.x + cs * lx + sn * lz, c.z - sn * lx + cs * lz];
  const wing = (lx, lz, yaw, hw, hd, y0, wall, rise, wins) => {
    const p = wpos(lx, lz); b.at(p[0], c.y, p[1], c.yaw + yaw);
    b.set(TIM, MAT.paint); b.box(-hw, y0, -hd, hw, wall, hd);
    for (const s of [-1, 1]) { const a = b.vert(s * hw, wall, s * hd, s, 0, 0), d = b.vert(s * hw, wall, -s * hd, s, 0, 0), e = b.vert(s * hw, wall + rise, 0, s, 0, 0); b.tri(a, d, e); }
    b.set(TRIM, MAT.paint); b.box(-hw - 0.9, wall - 0.25, -hd - 0.9, hw + 0.9, wall, hd + 0.9);
    b.set(SNOWC, MAT.snow); gable(b, hw + 0.5, hd + 0.3, wall + 0.25, rise, 0.9);
    b.set(TIM, MAT.paint); for (const s of [-1, 1]) b.cyl(s * (hw + 1.2), wall + rise + 0.2, 0, s * (hw + 2.6), wall + rise + 2.0, 0, 0.2, 0.03, 4); // dragon heads
    b.set([1, 0.74, 0.4], MAT.window);
    for (let f = 0; f < 2; f++) for (let q = 0; q < wins; q++) for (const s of [-1, 1]) {
      const x = ((q + 0.5) / wins - 0.5) * 2 * (hw - 1), y = 1.9 + f * 2.9, z = s * (hd + 0.04);
      b.quad([x - s * 0.6, y, z], [x + s * 0.6, y, z], [x + s * 0.6, y + 1.5, z], [x - s * 0.6, y + 1.5, z]);
    }
    for (const s of [-1, 1]) b.quad([s * (hw + 0.04), 2, s * 1.2], [s * (hw + 0.04), 2, -s * 1.2], [s * (hw + 0.04), 3.6, -s * 1.2], [s * (hw + 0.04), 3.6, s * 1.2]);
  };
  b.at(c.x, c.y, c.z, c.yaw);
  b.set(STONE, MAT.stone); b.box(-17, -4, -7, 17, 0.7, 7); b.box(-6.5, -4, 6, 6.5, 0.7, 14.5);
  wing(0, 0, 0, 16, 6, 0.7, 7.0, 5.6, 9);
  wing(0, 9.5, Math.PI / 2, 8, 5.2, 0.7, 7.0, 5.0, 3);
  wing(-11.5, -8, Math.PI / 2, 4.5, 3.6, 0.7, 4.6, 3.4, 2);
  b.at(c.x, c.y, c.z, c.yaw);
  b.set(WOOD, MAT.wood); b.box(6.5, 0.2, 6, 16.5, 0.75, 10.5); b.box(-16.5, 0.2, 6, -6.5, 0.75, 10.5);
  for (let q = 0; q <= 5; q++) for (const s of [-1, 1]) b.box(s * (6.5 + q * 2) - 0.08, 0.75, 10.3, s * (6.5 + q * 2) + 0.08, 1.75, 10.46);
  for (const s of [-1, 1]) b.box(s * 11.5 - 5, 1.7, 10.3, s * 11.5 + 5, 1.82, 10.46);
  b.set(SNOWC, MAT.snow); for (const s of [-1, 1]) b.box(s * 11.5 - 5, 0.75, 6.2, s * 11.5 + 5, 0.95, 10.3);
  b.set(STONE, MAT.stone); b.box(9.2, 9, -1.6, 10.8, 14.6, 0); b.box(-10.8, 9, 0, -9.4, 14.2, 1.4);
  b.set(SNOWC, MAT.snow); b.box(9.1, 14.6, -1.7, 10.9, 14.8, 0.1); b.box(-10.9, 14.2, -0.1, -9.3, 14.4, 1.5);
  const ch = wpos(10, -0.8); c.chimney = [ch[0], c.y + 14.8, ch[1]];
  b.set(WHITE, MAT.paint); b.cyl(21, -0.5, 13, 21, 11.5, 13, 0.08, 0.04, 8);
  b.set(WHITE, MAT.flag); b.quad([21.05, 9.6, 13], [23, 9.3, 13.5], [23, 10.7, 13.5], [21.05, 11, 13], [0, 1, 1, 1, 1, 0, 0, 0]);
  b.quad([23, 9.3, 13.5], [21.05, 9.6, 13], [21.05, 11, 13], [23, 10.7, 13.5], [1, 1, 0, 1, 0, 0, 1, 0]);
  for (const [lx, lz, r] of [[-11, 0, 5.2], [-3.7, 0, 5.2], [3.7, 0, 5.2], [11, 0, 5.2], [0, 9.5, 5], [-11.5, -8, 3]]) { const q = wpos(lx, lz); W.colliders.push(q[0], q[1], r); }
}
// Ski jump: cantilevered inrun from the tower top down to the take-off; the landing hill is real terrain.
function skiJump(b, W, J, wd) {
  const dx = J.top[0] - J.lip[0], dz = J.top[1] - J.lip[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, rx = -uz, rz = ux;
  const yl = W.heightAt(J.lip[0], J.lip[1]) + 2.5, yt = Math.max(yl + J.h, W.heightAt(J.top[0], J.top[1]) + J.h * 0.45), N = 14;
  const P = (s, y, t) => [J.lip[0] + ux * s + rx * t, y, J.lip[1] + uz * s + rz * t];
  const yd = (u) => yl + (yt - yl) * (0.12 * u + 0.88 * u * u * (1.6 - 0.6 * u)), yb = (u) => yd(u) - 1.2 - J.h * 0.22 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.5;
  b.at(0, 0, 0);
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, s0 = u0 * L, s1 = u1 * L, a0 = yd(u0), a1 = yd(u1), c0 = yb(u0), c1 = yb(u1), h = wd / 2;
    b.set(SNOWC, MAT.snow); b.quad(P(s0, a0, h), P(s0, a0, -h), P(s1, a1, -h), P(s1, a1, h));
    b.set([0.5, 0.52, 0.55], MAT.metal);
    for (const s of [-1, 1]) { // wind screens + girder flanks, both faces
      const w = s * h, top = 2.6;
      const q = [P(s0, c0, w), P(s1, c1, w), P(s1, a1 + top, w), P(s0, a0 + top, w)];
      if (s > 0) { b.quad(q[1], q[0], q[3], q[2]); b.quad(q[0], q[1], q[2], q[3]); } else { b.quad(q[0], q[1], q[2], q[3]); b.quad(q[1], q[0], q[3], q[2]); }
    }
    b.quad(P(s0, c0, -h), P(s0, c0, h), P(s1, c1, h), P(s1, c1, -h));
  }
  b.set([0.42, 0.44, 0.47], MAT.metal);
  for (const [u, t] of [[0.3, 0.6], [0.3, -0.6], [0.62, 1], [0.62, -1]]) { const p = P(u * L, yb(u) + 0.5, t * wd * 0.45), g = P(u * L + J.h * 0.12, 0, t * wd * 1.1); b.cyl(g[0], W.heightAt(g[0], g[2]) - 2, g[2], p[0], p[1], p[2], wd * 0.2, wd * 0.14, 8); W.colliders.push(g[0], g[2], wd * 0.2); }
  // start house on top
  const tp = P(L + wd * 0.5, yt, 0);
  b.at(tp[0], tp[1], tp[2], Math.atan2(-ux, -uz));
  b.set([0.5, 0.52, 0.55], MAT.metal); b.box(-wd * 0.7, -1.5, -wd * 0.6, wd * 0.7, 0.4, wd * 0.6);
  b.set([0.03, 0.05, 0.075], MAT.glass); b.box(-wd * 0.62, 0.4, -wd * 0.52, wd * 0.62, 3.6, wd * 0.52);
  b.set(SNOWC, MAT.snow); b.box(-wd * 0.75, 3.6, -wd * 0.65, wd * 0.75, 4.0, wd * 0.65);
  b.set([1, 0.2, 0.1], MAT.beacon); b.cyl(0, 4, 0, 0, 4.6, 0, 0.25, 0.2, 6);
}
function tvTower(b, W, T) {
  const y = W.heightAt(T.x, T.z) - 2; b.at(T.x, y, T.z);
  b.set([0.62, 0.62, 0.6], MAT.stone); b.cyl(0, 0, 0, 0, 62, 0, 4.6, 3.1, 14);
  b.set([0.5, 0.52, 0.55], MAT.metal); b.cyl(0, 56, 0, 0, 60, 0, 4.2, 8.2, 16); b.cyl(0, 64.5, 0, 0, 68, 0, 8.6, 5.5, 16);
  b.set([0.03, 0.05, 0.075], MAT.glass); b.cyl(0, 60, 0, 0, 64.5, 0, 8.2, 8.6, 16);
  b.set([0.62, 0.62, 0.6], MAT.stone); b.cyl(0, 68, 0, 0, 80, 0, 2.6, 2.0, 10);
  for (let i = 0; i < 6; i++) { b.set(i & 1 ? [0.85, 0.85, 0.85] : [0.6, 0.08, 0.06], MAT.paint); b.cyl(0, 80 + i * 6.3, 0, 0, 86.3 + i * 6.3, 0, 1.1 - i * 0.14, 0.96 - i * 0.14, 8); }
  b.set([1, 0.15, 0.08], MAT.beacon); b.cyl(0, T.h, 0, 0, T.h + 0.8, 0, 0.35, 0.25, 6); b.cyl(0, 68, 0, 0, 68.7, 0, 5.6, 5.5, 8);
  W.colliders.push(T.x, T.z, 3.5);
}
function chapel(b, W, C) {
  const y = W.heightAt(C.x, C.z); b.at(C.x, y, C.z, -C.yaw + Math.PI / 2);
  const DW = [0.11, 0.075, 0.05];
  b.set(DW, MAT.paint); b.box(-9, -2, -5, 9, 4.2, 5); b.box(-13, -2, -3.2, -9, 3.2, 3.2);
  for (const s of [-1, 1]) { const a = b.vert(s * 9, 4.2, s * 5, s, 0, 0), d = b.vert(s * 9, 4.2, -s * 5, s, 0, 0), e = b.vert(s * 9, 11, 0, s, 0, 0); b.tri(a, d, e); }
  b.set(SNOWC, MAT.snow); gable(b, 9, 5, 4.2, 6.8, 0.6);
  b.at(C.x, y, C.z, -C.yaw + Math.PI / 2);
  b.set(DW, MAT.paint); b.box(4.2, 9, -1.6, 7.4, 15, 1.6); b.cyl(5.8, 15, 0, 5.8, 31, 0, 2.3, 0.08, 4);
  b.set([1, 0.78, 0.45], MAT.window); for (let q = -2; q <= 2; q++) for (const s of [-1, 1]) b.quad([q * 3.2 - s * 0.5, 1.4, s * 5.03], [q * 3.2 + s * 0.5, 1.4, s * 5.03], [q * 3.2 + s * 0.5, 3.2, s * 5.03], [q * 3.2 - s * 0.5, 3.2, s * 5.03]);
  W.colliders.push(C.x, C.z, 5);
}

function portal(b, W, p) { // concrete headwall where a road dives under a ski bridge; local +z points into the tunnel
  const yaw = Math.atan2(p.dx, p.dz), cs = Math.cos(yaw), sn = Math.sin(yaw), a = p.hw + 1, wd = a + 8.5, c = 4.3, z0 = -1.5, z1 = 8;
  const t0 = Math.max(p.top0 - p.y, c + 0.7), t1 = t0 + (p.top1 - p.top0) * 0.95, T = Math.min(t0, t1) - 0.1, d = (t1 - t0) / 10; // deck height at the face / 10 m in
  b.at(p.x, p.y, p.z, yaw);
  b.set([0.17, 0.17, 0.168], MAT.stone);
  b.box(-wd, -1.5, z0, -a, T, z1); b.box(a, -1.5, z0, wd, T, z1); b.box(-a, c, z0, a, T, z1); b.box(-wd, T, z0, wd, t0 + 1.1, z0 + 0.4);
  b.set(DARK, MAT.void); b.quad([a, -0.5, 2.8], [-a, -0.5, 2.8], [-a, c, 2.8], [a, c, 2.8]);
  b.set(SNOWC, MAT.snow);
  const y0 = t0 + 0.55 + d * (z0 + 0.4), y1 = t0 + 0.55 + d * z1;   // clear of the soft-snow displacement on the deck
  slab(b, [-wd, y1, z1], [wd, y1, z1], [wd, y0, z0 + 0.4], [-wd, y0, z0 + 0.4], Math.max(y0, y1) - T);
  b.box(-wd - 0.05, t0 + 1.1, z0 - 0.05, wd + 0.05, t0 + 1.27, z0 + 0.45);
  for (let x = -wd; x <= wd; x += 3) W.colliders.push(p.x + cs * x + sn * 4.6, p.z - sn * x + cs * 4.6, 2.6); // stops the groomer in the mouth and short of the edge on top
}

export function buildProps(W) {
  const b = new MB();
  W.colliders = [];
  const PLAY = W.PLAY;
  if (W.name === 'fantasy') { cabin(b, W.cabin, W); bridge(b, W.bridge); dam(b, W.dam); }
  else { lodge(b, W.cabin, W); W.buildings.forEach((B, i) => house(b, B, i, W)); skiJump(b, W, W.lm.jump, 6.5); skiJump(b, W, W.lm.mid, 4.5); tvTower(b, W, W.lm.tower); chapel(b, W, W.lm.chapel); W.portals.forEach((p) => portal(b, W, p)); }
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
    if ((W.buildings || []).some((B) => Math.abs(B.x - x) < 14 && Math.abs(B.z - z) < 14)) continue;
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
