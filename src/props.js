// Static set pieces merged into one mesh: cabin, bridge, dam, power line, lamp posts, signs, boulders.
import { MB, MAT, VS } from './mesh.js';
import { hash1, clamp, lerp } from './math.js';
import { arenaFrame, standAt, mastAim } from './world.js';

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
  const r = hash1(i * 13 + 1), r2 = hash1(i * 29 + 7), r3 = hash1(i * 53 + 3), k = B.kind, H = B.h, alt = H && H.alt; // lidar heights from world.js; with alt the ridge runs along the short side
  const hw = (alt ? B.d : B.w) / 2, hd = (alt ? B.w : B.d) / 2, yaw = alt ? B.yaw + Math.PI / 2 : B.yaw, L = 2 * hw; // builder frame: ridge along local x
  const flat = H ? H.flat : k === 3 && (B.w > 34 || r > 0.6), rise = flat ? 0 : H ? H.rise : Math.min(hd * (k === 1 ? 0.6 : 0.8), 4.8);
  const wall = H ? Math.max(1.8, H.eave - (flat ? 0.3 : 0)) : k === 2 ? 2.5 : k === 1 ? 2.7 : k === 3 ? Math.max(6.5, (B.lv || 3) * 3) : B.lv ? B.lv * 2.8 : 4.4 + 2.4 * r2;
  const col = k === 1 ? HCOL[3] : k === 3 ? HCOL[r < 0.5 ? 0 : 5] : HCOL[(r * 9) | 0];
  const v0 = b.v.length / VS;
  b.at(B.x, B.y, B.z, -yaw);
  b.set(col, MAT.paint); b.box(-hw, -5, -hd, hw, wall, hd);
  if (flat) { b.set(SNOWC, MAT.snow); b.box(-hw - 0.2, wall, -hd - 0.2, hw + 0.2, wall + 0.4, hd + 0.2); }
  else {
    for (const s of [-1, 1]) { const a = b.vert(s * hw, wall, s * hd, s, 0, 0), d = b.vert(s * hw, wall, -s * hd, s, 0, 0), e = b.vert(s * hw, wall + rise, 0, s, 0, 0); b.tri(a, d, e); }
    b.set(SNOWC, MAT.snow); gable(b, hw, hd, wall, rise, 0.45);
  }
  const y = k === 1 ? 1.1 : 1.3, nf = H ? Math.min(10, Math.floor((wall - y - 1.45) / 2.8) + 1) : wall > 5.6 && r2 > 0.4 ? 2 : 1, tall = nf > 2;
  if (k !== 2 && (r3 < 0.6 || tall)) { // rows of lit windows on the eave walls: measured walls get one row per 2.8 m storey that fits, blocks of 3+ storeys on both walls
    b.set([1, 0.78, 0.45], MAT.window);
    const n = Math.max(1, Math.min(tall ? 14 : 5, (L / 4.2) | 0));
    for (let f = 0; f < nf; f++) for (let q = 0; q < n; q++) for (const s of tall ? [-1, 1] : [hash1(i + q + f * 17) < 0.5 ? 1 : -1]) {
      if (hash1(i * 7 + q * 3 + f + (tall && s < 0 ? 977 : 0)) < 0.35) continue;
      const x = (q + 0.5) / n * L - hw, yy = y + f * 2.8;
      b.quad([x - s * 0.55, yy, s * (hd + 0.03)], [x + s * 0.55, yy, s * (hd + 0.03)], [x + s * 0.55, yy + 1.15, s * (hd + 0.03)], [x - s * 0.55, yy + 1.15, s * (hd + 0.03)]);
    }
  }
  W.bld.push({ x: B.x, y: B.y, z: B.z, th: -yaw, v0, v1: b.v.length / VS, area: B.w * B.d, col, boxes: [box(B.x, B.z, -yaw, hw, hd, B.y, flat ? wall + 0.4 : wall, rise)] });
}
// a solid oriented box: centre, yaw of the builder frame (local x = (cos, -sin)), half-extents, pad height, wall height, gable rise (ridge along local x)
const box = (x, z, th, hw, hd, y, wall, rise) => ({ x, z, th, hw, hd, y, wall, rise });
// Frognerseteren restaurant (1891): dark log dragon-style lodge. Measured (lidar), local +x east, +z south (front, terrace): a centre hall
// (ridge east-west at 8.4 m) with a low glazed veranda in front and a flat-roofed rear block; west of it the cross gable facing the terrace
// (ridge 8.2 m, spire on its apex); a low black-tarred wing at the west end; the tall east wing (ridge north-south at 10.6 m) with a
// dragon head at each gable; white chimneys; a stone-walled terrace in front. The annex north-east is a record of its own.
function lodge(b, c, W) {
  const TIM = [0.075, 0.046, 0.027], TAR = [0.03, 0.027, 0.025], UN = [0.06, 0.04, 0.025], RED = [0.4, 0.06, 0.04], WH = [0.8, 0.78, 0.74], ST = [0.27, 0.265, 0.255];
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), F = 0.7, v0 = b.v.length / VS;
  const wpos = (lx, lz) => [c.x + cs * lx + sn * lz, c.z - sn * lx + cs * lz];
  // a gabled volume centred at lodge-local (lx, lz); rot 1 turns its ridge north-south. Builds in its own frame (ridge along x) and leaves that frame set.
  const vol = (lx, lz, rot, hw, hd, wall, rise, col, y0, og = 0.7, o = 0.8) => {
    const p = wpos(lx, lz); b.at(p[0], y0, p[1], c.yaw + rot * Math.PI / 2);
    b.set(ST, MAT.stone); b.box(-hw - 0.15, -3, -hd - 0.15, hw + 0.15, F, hd + 0.15);
    b.set(col, MAT.plank); b.box(-hw, F, -hd, hw, wall, hd);
    for (const s of [-1, 1]) gtri(b, [s * hw, wall, -hd], [s * hw, wall, hd], [s * hw, wall + rise, 0], [s, 0, 0]);
    const e = wall - o * rise / hd;
    for (const s of [-1, 1]) roofQ(b, [[-hw - og, e, s * (hd + o)], [hw + og, e, s * (hd + o)], [hw + og, wall + rise, 0], [-hw - og, wall + rise, 0]], UN, 0.25);
    b.set(RED, MAT.paint); for (const s of [-1, 1]) b.box(s * hw - 0.1, F, -hd - 0.1, s * hw + 0.1, wall, -hd + 0.1), b.box(s * hw - 0.1, F, hd - 0.1, s * hw + 0.1, wall, hd + 0.1); // red corner boards
  };
  // dragon head at a ridge end of the current volume frame: a neck that rises out of the crossed barge boards and curls back
  const dragon = (x, yy, s) => { b.set(TIM, MAT.wood); const P = [[0, 0], [0.7, 0.5], [1.25, 1.35], [1.3, 2.1], [0.95, 2.5], [0.6, 2.35]], R = [0.2, 0.18, 0.15, 0.13, 0.11, 0.06];
    for (let i = 0; i < 5; i++) b.cyl(x + s * P[i][0], yy + P[i][1], 0, x + s * P[i + 1][0], yy + P[i + 1][1], 0, R[i], R[i + 1], 5); };
  const chim = (x, yy, z, h) => { b.set(WH, MAT.paint); b.box(x - 0.55, yy - 2, z - 0.55, x + 0.55, yy + h, z + 0.55); b.set(DARK, MAT.metal); b.box(x - 0.68, yy + h, z - 0.68, x + 0.68, yy + h + 0.18, z + 0.68); b.set(SNOWC, MAT.snow); b.box(x - 0.66, yy + h + 0.18, z - 0.66, x + 0.66, yy + h + 0.3, z + 0.66); };
  // centre hall + rear block + front veranda (lodge frame)
  vol(1.75, 0.25, 0, 6.75, 6.75, 4.8, 3.6, TIM, c.y, 0.2);
  b.at(c.x, c.y, c.z, c.yaw);
  b.set(ST, MAT.stone); b.box(-5, -3, -12.2, 8.5, F, -6.5); b.set(TIM, MAT.plank); b.box(-5, F, -12, 8.5, 4.3, -6.5);
  roofQ(b, [[-5.3, 4.3, -12.4], [8.8, 4.3, -12.4], [8.8, 4.55, -6.5], [-5.3, 4.55, -6.5]], UN, 0.3);
  for (let q = 0; q < 5; q++) win(b, -3.5 + q * 2.6, 1.6, -12, 1.0, 1.3, 0, -1, RED);
  b.set(TIM, MAT.plank); b.box(-4.5, F, 7, 8.5, 3.2, 10.5); b.set(RED, MAT.paint); b.box(-4.5, F, 10.4, 8.5, 1.15, 10.62); b.box(-4.5, 3.05, 10.4, 8.5, 3.3, 10.62);
  roofQ(b, [[-4.8, 3.2, 11.0], [8.6, 3.2, 11.0], [8.6, 4.75, 7], [-4.8, 4.75, 7]], UN, 0.18);
  for (let q = 0; q < 8; q++) win(b, -3.7 + q * 1.62, 1.25, 10.5, 1.3, 1.65, 0, 1, RED);
  for (const s of [-1, 1]) win(b, s > 0 ? 8.5 : -4.5, 1.25, 8.75, 1.6, 1.65, s, 0, RED);
  for (const x of [-1, 4.5]) chim(x, 8.0, -0.6, 2.4);
  c.chimney = (() => { const p = wpos(-1, -0.6); return [p[0], c.y + 10.7, p[1]]; })();
  // west cross gable facing the terrace (ridge north-south: frame x = north, z = east)
  vol(-9.25, -0.5, 1, 11.5, 4.25, 4.6, 3.6, TIM, c.y);
  for (const q of [-1.6, 0, 1.6]) win(b, -11.5, 1.5, q, 1.1, 1.6, -1, 0, RED);
  for (const q of [-1.1, 1.1]) win(b, -11.5, 4.9, q, 0.9, 1.4, -1, 0, RED);
  win(b, -11.5, 6.6, 0, 0.6, 0.8, -1, 0, RED);
  for (const q of [-10, -8.2]) win(b, q, 1.6, -4.25, 1.0, 1.5, 0, -1, RED);
  for (const q of [-1.2, 1.2]) win(b, 11.5, 1.6, q, 1.0, 1.5, 1, 0, RED);
  b.set(RED, MAT.paint); b.box(-12.8, 3.6, -3.2, -11.5, 3.75, 3.2); b.set(TIM, MAT.wood); for (const q of [-3, -1, 1, 3]) b.box(-12.8, 3.75, q - 0.05, -12.7, 4.6, q + 0.05); b.box(-12.8, 4.55, -3.1, -12.7, 4.68, 3.1); // balcony on the front gable
  b.set(TIM, MAT.wood); b.cyl(-12.2, 8.2, 0, -12.2, 10.8, 0, 0.16, 0.05, 6); b.set([0.7, 0.55, 0.2], MAT.metal); b.cyl(-12.2, 10.8, 0, -12.2, 12.0, 0, 0.05, 0.03, 4); b.cyl(-12.2, 11.1, 0, -12.2, 11.4, 0, 0.16, 0.16, 6); b.box(-12.24, 11.6, -0.15, -12.16, 11.95, 0.75); // spire, ball and vane
  dragon(12.2, 8.15, 1); chim(4, 8.0, 0, 2.2);
  // low black wing at the west end, gable to the west
  vol(-16.75, -1.5, 0, 3.25, 7.5, 3.8, 2.6, TAR, c.y, 0.6, 0.6);
  win(b, -3.25, 1.4, -2.5, 0.9, 1.2, -1, 0, RED); win(b, -3.25, 1.4, 2.5, 0.9, 1.2, -1, 0, RED); win(b, -3.25, 4.4, 0, 0.7, 0.9, -1, 0, RED);
  for (const q of [-1.6, 1.6]) win(b, q, 1.4, 7.5, 1.0, 1.2, 0, 1, RED);
  // tall east wing, gables north and south, a dragon head on each
  vol(13.5, 0.75, 1, 11.75, 5, 7.0, 3.6, TIM, c.y);
  for (const q of [-2.8, 0, 2.8]) for (const f of [0, 1]) win(b, -11.75, 1.4 + f * 3.1, q, 1.1, 1.6, -1, 0, RED);
  win(b, -11.75, 7.6, 0, 1.2, 1.4, -1, 0, RED); b.set(RED, MAT.paint); b.box(-12.9, 4.15, -2.6, -11.75, 4.3, 2.6); // balcony
  for (const q of [-1.8, 1.8]) win(b, 11.75, 1.6, q, 1.0, 1.4, 1, 0, RED);
  for (let q = 0; q < 6; q++) for (const f of [0, 1]) win(b, -9.5 + q * 3.8, 1.4 + f * 3.1, 5, 1.1, 1.5, 0, 1, RED);
  dragon(-12.45, 10.55, -1); dragon(12.45, 10.55, 1); chim(-4, 10.4, 0, 1.6);
  // the stone-walled terrace in front, a railing on its parapet
  b.at(c.x, c.y, c.z, c.yaw);
  b.set(ST, MAT.stone); b.box(-14, -3, 10.5, 19.5, F + 0.2, 20); b.box(-14, F + 0.2, 19.4, 19.5, F + 0.9, 20); b.box(-14, F + 0.2, 12.5, -13.4, F + 0.9, 20); b.box(18.9, F + 0.2, 13, 19.5, F + 0.9, 20);
  b.set(SNOWC, MAT.snow); b.box(-13.4, F + 0.2, 13, 18.9, F + 0.32, 19.4);
  b.set(TIM, MAT.wood); for (let q = 0; q <= 11; q++) b.box(-13.8 + q * 3, F + 0.9, 19.55, -13.6 + q * 3, F + 1.9, 19.85); b.box(-14, F + 1.8, 19.6, 19.5, F + 1.95, 19.8);
  const q = (lx, lz, t, hw, hd, wall, rise) => { const p = wpos(lx, lz); return box(p[0], p[1], c.yaw + t, hw, hd, c.y, wall, rise); }, H = Math.PI / 2;
  W.bld.push({ x: c.x, y: c.y, z: c.z, th: c.yaw, v0, v1: b.v.length / VS, area: 828, col: TIM,
    boxes: [q(1.75, 0.25, 0, 6.75, 6.75, 4.8, 3.6), q(1.75, -9.35, 0, 6.75, 2.85, 4.6, 0), q(2, 8.75, 0, 6.5, 1.75, 3.2, 0), q(-9.25, -0.5, H, 11.5, 4.25, 4.6, 3.6),
      q(-16.75, -1.5, 0, 3.25, 7.5, 3.8, 2.6), q(13.5, 0.75, H, 11.75, 5, 7, 3.6), q(2.75, 16.25, 0, 16.75, 3.75, F + 0.9, 0)] });
  // the annex north-east of the restaurant (its own building record)
  const ap = wpos(24, -29.1), ay = W.heightAt(ap[0], ap[1]), a0 = b.v.length / VS;
  vol(24, -29.1, 1, 8.5, 5.25, 4.3, 3.8, TIM, ay);
  for (const s of [-1, 1]) { for (let k = 0; k < 4; k++) win(b, -6 + k * 4, 1.5, s * 5.25, 1.1, 1.4, 0, s, RED); win(b, s * 8.5, 1.5, 0, 1.0, 1.4, s, 0, RED); win(b, s * 8.5, 5, 0, 0.8, 1.1, s, 0, RED); }
  chim(2, 7.6, 0, 1.6);
  W.bld.push({ x: ap[0], y: ay, z: ap[1], th: c.yaw + H, v0: a0, v1: b.v.length / VS, area: 17 * 10.5, col: TIM, boxes: [box(ap[0], ap[1], c.yaw + H, 8.5, 5.25, ay, 4.3, 3.8)] });
}
// Ski jumps from lidar profiles (LM.jump / LM.mid in world.js). Positions are (d, t): d metres from the top along the axis
// top -> end, t to the side; heights are absolute. `deck` is the inrun track (two ice grooves), flat for `plat` metres at the top;
// `hb` the inrun's outer half width (track, stairs, walls), `st` which sides have stairs. Holmenkollbakken (2010): a steel box girder
// clad in vertical stainless slats, cantilevered ~55 m from a concrete `core` (an inclined glass lift beside it), its take-off resting
// on the low visitor-centre `block` through steel columns; a glazed top gallery with a flag and a red beacon; the lattice wind-screen
// arches (`wing`: lidar top edge) sweeping down both sides of the landing hill to the judges' and coaches' huts (`hut`). Midtstubakken
// (`skirt`): the inrun lies on the ground between low concrete walls, a green glass start `house` on a stone base. Lamps along both.
function skiJump(b, W, J) {
  const ex = J.end[0] - J.top[0], ez = J.end[1] - J.top[1], El = Math.hypot(ex, ez), ux = ex / El, uz = ez / El, rx = -uz, rz = ux;
  const TK = J.track, D = J.deck, d0 = TK ? TK.s[0] : D[0][0], yt = TK ? TK.s[1] : D[0][1], L = TK ? TK.lip[0] : Math.hypot(J.lip[0] - J.top[0], J.lip[1] - J.top[1]), h = J.w / 2, dP = d0 - J.plat, SK = !!J.skirt, RH = SK ? 1.0 : 1.3;
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const SV = [0.58, 0.6, 0.64], DST = [0.3, 0.31, 0.33], CN = [0.6, 0.6, 0.58], ICE = [0.6, 0.68, 0.77], STP = [0.44, 0.45, 0.46], LMP = [1, 0.9, 0.72];
  const P = (d, y, t) => [J.top[0] + ux * d + rx * t, y, J.top[1] + uz * d + rz * t];
  const G = (d, t) => W.heightAt(J.top[0] + ux * d + rx * t, J.top[1] + uz * d + rz * t);
  const col = (d, t, r) => { const p = P(d, 0, t); W.colliders.push(p[0], p[2], r); };
  const tab = (T, d, c) => { let i = 0; while (i < T.length - 2 && d > T[i + 1][0]) i++; const a = T[i], q = T[i + 1], f = clamp((d - a[0]) / (q[0] - a[0]), 0, 1); return a[c] + (q[c] - a[c]) * f; };
  // the track: Holmenkollbakken's is analytic (`track`: the standard inrun of the section, a straight at gamma from the start s, one circular arc tangent to it, then the
  // take-off table tl m long at ta degrees ending at the lip; the straight's length and the arc radius are solved from the two ends). Midtstubakken's is the lidar `deck` table.
  let yd, dA = d0, dE = L;
  if (TK) { const g = TK.g * Math.PI / 180, a = TK.ta * Math.PI / 180, sg = Math.sin(g), cg = Math.cos(g), sa = Math.sin(a), ca = Math.cos(a); dE = L - TK.tl * ca; const yE = TK.lip[1] + TK.tl * sa, X = dE - d0, Y = yt - yE;
    const r1 = (X * sg - Y * cg) / ((sg - sa) * sg - (ca - cg) * cg), Ls = (Y - r1 * (ca - cg)) / sg, yA = yt - Ls * sg; dA = d0 + Ls * cg; const cx = dA + r1 * sg, cy = yA + r1 * cg;
    yd = (d) => d <= d0 ? yt : d <= dA ? yt - (d - d0) * sg / cg : d <= dE ? cy - Math.sqrt(Math.max(0, r1 * r1 - (d - cx) ** 2)) : yE - (d - dE) * sa / ca; }
  else yd = (d) => { const e = 5; return d <= d0 ? yt : (tab(D, d - e, 1) + 2 * tab(D, d, 1) + tab(D, d + e, 1)) / 4 + (d < d0 + e ? (yt - tab(D, d0 + e, 1)) * (1 - (d - d0) / e) / 4 : 0); };
  const sw = (s) => J.st ? J.st[s > 0 ? 1 : 0] : 1, eo = (d, s) => J.hb ? tab(J.hb, d, 1) : h + 0.3 + (sw(s) ? 1.6 : 0); // outer edge |t| on side s
  // Holmenkollbakken's girder is a wedge (the architect's section): the deck on top, a straight bottom chord from 1.2 m under the tip down to the ground at the base (c0 + 6)
  const c0 = J.core ? J.core[0] : 62, dB = c0 + 6, kc = SK ? 0 : (yt - 1.2 - G(dB, 0) + 0.5) / (dB - dP), chord = (d) => yt - 1.2 - kc * (d - dP);
  const dep = (d) => d < dB ? yd(d) - chord(d) : lerp(yd(dB) - chord(dB), 3, clamp((d - dB) / (L - dB), 0, 1));
  const ub = (d, t) => SK ? Math.min(G(d, t), yd(d)) - 1 : yd(d) - dep(d); // underside of the inrun
  const sq = (pa, pb, pc, pd, uv) => b.quad(pa, pb, pc, pd, uv); // the props pass draws both faces (no culling), so every panel is one quad
  const mem = (p, q, w) => { // a steel member p -> q (world points) as two crossed strips of width w
    const vx = q[0] - p[0], vy = q[1] - p[1], vz = q[2] - p[2]; let ax = -vz, ay = 0, az = vx, la = Math.hypot(ax, az); if (la < 1e-4) { ax = ux; az = uz; la = 1; } ax *= w / 2 / la; az *= w / 2 / la;
    let bx = vy * az - vz * ay, by = vz * ax - vx * az, bz = vx * ay - vy * ax; const lb = Math.hypot(bx, by, bz) || 1; bx *= w / 2 / lb; by *= w / 2 / lb; bz *= w / 2 / lb;
    sq([p[0] - ax, p[1] - ay, p[2] - az], [q[0] - ax, q[1] - ay, q[2] - az], [q[0] + ax, q[1] + ay, q[2] + az], [p[0] + ax, p[1] + ay, p[2] + az]);
    sq([p[0] - bx, p[1] - by, p[2] - bz], [q[0] - bx, q[1] - by, q[2] - bz], [q[0] + bx, q[1] + by, q[2] + bz], [p[0] + bx, p[1] + by, p[2] + bz]); };
  b.at(0, 0, 0);
  const SD = [], seg = (a, z, n) => { for (let k = 0; k < n; k++) SD.push(a + (z - a) * k / n); };
  if (TK) { seg(dP, d0, 2); seg(d0, dA, Math.ceil((dA - d0) / 4)); seg(dA, dE, 28); seg(dE, L, 4); } else seg(dP, L, Math.ceil((L - dP) / 4));
  SD.push(L);
  for (let i = 0; i + 1 < SD.length; i++) {
    const s0 = SD[i], s1 = SD[i + 1], a0 = yd(s0), a1 = yd(s1);
    b.set(SNOWC, MAT.snow); sq(P(s0, a0, -h), P(s1, a1, -h), P(s1, a1, h), P(s0, a0, h));
    b.set(ICE, MAT.paint); for (const g of [-0.31, 0.19]) sq(P(s0, a0 + 0.02, g), P(s1, a1 + 0.02, g), P(s1, a1 + 0.02, g + 0.12), P(s0, a0 + 0.02, g + 0.12));
    for (const s of [-1, 1]) {
      const e0 = eo(s0, s), e1 = eo(s1, s), u0 = ub(s0, s * e0), u1 = ub(s1, s * e1), r0 = a0 + RH, r1 = a1 + RH;
      if (e0 - h > 0.7) { b.set(STP, MAT.paint); sq(P(s0, a0 - 0.12, s * h), P(s1, a1 - 0.12, s * h), P(s1, a1 - 0.12, s * (e1 - 0.3)), P(s0, a0 - 0.12, s * (e0 - 0.3))); } // stairs, swept clear of snow
      if (SK) { b.set(CN, MAT.stone); // low concrete walls with a cap, lit along the top, lamp heads outside
        sq(P(s0, u0, s * e0), P(s1, u1, s * e1), P(s1, r1, s * e1), P(s0, r0, s * e0));
        sq(P(s0, a0 - 0.15, s * (e0 - 0.3)), P(s1, a1 - 0.15, s * (e1 - 0.3)), P(s1, r1, s * (e1 - 0.3)), P(s0, r0, s * (e0 - 0.3)));
        b.set(CN, MAT.metal); sq(P(s0, r0, s * (e0 - 0.3)), P(s1, r1, s * (e1 - 0.3)), P(s1, r1, s * e1), P(s0, r0, s * e0));
        b.set(LMP, MAT.lamp); sq(P(s0, r0 + 0.03, s * (e0 - 0.3)), P(s1, r1 + 0.03, s * (e1 - 0.3)), P(s1, r1 + 0.03, s * (e1 - 0.16)), P(s0, r0 + 0.03, s * (e0 - 0.16)));
        if (i % 2) { const c = (s0 + s1) / 2 - 0.5, y = yd(c) + RH; sq(P(c, y - 0.42, s * (e0 + 0.03)), P(c + 1, y - 0.42, s * (e0 + 0.03)), P(c + 1, y - 0.08, s * (e0 + 0.03)), P(c, y - 0.08, s * (e0 + 0.03))); }
      } else if (s0 >= d0) { b.set(LMP, MAT.lamp); sq(P(s0, a0 + 0.9, s * (e0 - 0.06)), P(s1, a1 + 0.9, s * (e1 - 0.06)), P(s1, a1 + 1.08, s * (e1 - 0.06)), P(s0, a0 + 1.08, s * (e0 - 0.06))); } // track lighting on the screens
    }
    const el0 = eo(s0, -1), el1 = eo(s1, -1), er0 = eo(s0, 1), er1 = eo(s1, 1);
    if (!SK && s0 < dB) { b.set(DST, MAT.metal); sq(P(s0, a0 - 1.5, -el0), P(s0, a0 - 1.5, er0), P(s1, a1 - 1.5, er1), P(s1, a1 - 1.5, -el1)); } // deck plate under the clad band
    else if (!SK) { b.set(SV, MAT.wood); sq(P(s0, ub(s0, 0), -el0), P(s0, ub(s0, 0), er0), P(s1, ub(s1, 0), er1), P(s1, ub(s1, 0), -el1), [-el0 / 2.4, s0, er0 / 2.4, s0, er1 / 2.4, s1, -el1 / 2.4, s1]); } // soffit
    if (ub(s0, 0) - G(s0, 0) < 3.6) col((s0 + s1) / 2, (er0 - el0) / 2, (er0 + el0) / 2 + 0.2);
  }
  if (!SK) { const n = Math.ceil((dB - dP) / 4.3); // the cantilever: open Warren trusses down both sides from the clad band to the bottom chord, cross beams and plan bracing
    for (let i = 0; i < n; i++) { const s0 = dP + (dB - dP) * i / n, s1 = dP + (dB - dP) * (i + 1) / n, k0 = yd(s0) - 1.5, k1 = yd(s1) - 1.5, c0y = ub(s0, 0), c1y = ub(s1, 0), el0 = eo(s0, -1), el1 = eo(s1, -1), er0 = eo(s0, 1), er1 = eo(s1, 1);
      b.set([0.22, 0.23, 0.25], MAT.metal);
      for (const s of [-1, 1]) { const t0 = s * (s < 0 ? el0 : er0), t1 = s * (s < 0 ? el1 : er1); mem(P(s0, c0y, t0), P(s1, c1y, t1), 0.55); mem(P(s0, c0y, t0), P(s0, k0, t0), 0.4); mem(i & 1 ? P(s0, k0, t0) : P(s0, c0y, t0), i & 1 ? P(s1, c1y, t1) : P(s1, k1, t1), 0.4); }
      mem(P(s0, c0y, -el0), P(s0, c0y, er0), 0.35); mem(P(s0, c0y, i & 1 ? -el0 : er0), P(s1, c1y, i & 1 ? er1 : -el1), 0.25); } }
  { const el = eo(L, -1), er = eo(L, 1), uL = ub(L, 0); b.set(SK ? CN : SV, SK ? MAT.stone : MAT.wood); sq(P(L, uL, -el), P(L, uL, er), P(L, yd(L), er), P(L, yd(L), -el)); }
  if (SK) { // start house: stone base, green glass box with a dark frame over the start
    const [ha, hz, ta, tz, hh] = J.house, g = Math.min(G(ha, ta), G(ha, tz), G(hz, ta), G(hz, tz)) - 1, y1 = yt + hh, C = [[ha, ta], [hz, ta], [hz, tz], [ha, tz]];
    for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) & 3];
      b.set([0.2, 0.19, 0.18], MAT.stone); sq(P(p[0], g, p[1]), P(q[0], g, q[1]), P(q[0], yt - 0.1, q[1]), P(p[0], yt - 0.1, p[1]));
      b.set([0.05, 0.12, 0.1], MAT.glass); sq(P(p[0], yt - 0.1, p[1]), P(q[0], yt - 0.1, q[1]), P(q[0], y1 - 0.45, q[1]), P(p[0], y1 - 0.45, p[1]));
      b.set(DST, MAT.metal); sq(P(p[0], y1 - 0.45, p[1]), P(q[0], y1 - 0.45, q[1]), P(q[0], y1, q[1]), P(p[0], y1, p[1])); b.cyl(...P(p[0], yt - 0.1, p[1]), ...P(p[0], y1, p[1]), 0.12, 0.12, 4, 0);
      for (let m = 1; m < 3; m++) { const f = m / 3, x = lerp(p[0], q[0], f), z = lerp(p[1], q[1], f); b.cyl(...P(x, yt - 0.1, z), ...P(x, y1 - 0.45, z), 0.05, 0.05, 3, 0); } }
    b.set([0.07, 0.14, 0.12], MAT.glass); sq(P(ha, y1, ta), P(hz, y1, ta), P(hz, y1, tz), P(ha, y1, tz));
    b.set([1, 0.15, 0.08], MAT.beacon); b.cyl(...P(ha + 0.6, y1, tz - 0.6), ...P(ha + 0.6, y1 + 0.5, tz - 0.6), 0.18, 0.14, 6);
    col((ha + hz) / 2, (ta + tz) / 2, Math.min(hz - ha, tz - ta) / 2 + 0.5);
    return;
  }
  // the tip: a slender wedge cut square, a thin flat roof plate over the start (lidar 422-423.5 m over the top 18 m) on the clad sides, a clad end face
  const e = eo(dP, 1), yr = J.roof || yt + 2.7, uP = ub(dP, 0), ge = e + 0.4;
  b.set(SV, MAT.wood); sq(P(dP, uP, -e), P(dP, uP, e), P(dP, yr - 0.35, e), P(dP, yr - 0.35, -e), [0, uP, 2 * e / 2.4, uP, 2 * e / 2.4, yr, 0, yr]);
  b.set(DST, MAT.metal); for (const [a, c] of [[[dP - 0.6, -ge], [d0, -ge]], [[d0, ge], [dP - 0.6, ge]], [[dP - 0.6, ge], [dP - 0.6, -ge]]]) sq(P(a[0], yr - 0.35, a[1]), P(c[0], yr - 0.35, c[1]), P(c[0], yr, c[1]), P(a[0], yr, a[1]));
  sq(P(dP - 0.6, yr - 0.35, -ge), P(d0, yr - 0.35, -ge), P(d0, yr - 0.35, ge), P(dP - 0.6, yr - 0.35, ge));
  b.set(SNOWC, MAT.snow); sq(P(dP - 0.6, yr, -ge), P(d0, yr, -ge), P(d0, yr, ge), P(dP - 0.6, yr, ge));
  b.set(DST, MAT.metal); sq(P(d0 - 3, yt + 0.75, -h), P(d0 - 3, yt + 0.75, h), P(d0 - 3, yt + 0.85, h), P(d0 - 3, yt + 0.85, -h)); // start bar
  b.set(WHITE, MAT.paint); b.cyl(...P(dP + 1.2, yr, 0), ...P(dP + 1.2, yr + 7, 0), 0.07, 0.05, 6);
  b.set(WHITE, MAT.flag); { const a = P(dP + 1.2, yr + 5.6, 0), c = P(dP + 1.2, yr + 6.9, 0), f = P(dP + 3.2, yr + 5.7, 0.3), g = P(dP + 3.2, yr + 6.85, 0.3); sq(a, f, g, c, [0, 1, 1, 1, 1, 0, 0, 0]); }
  b.set([1, 0.15, 0.08], MAT.beacon); for (const s of [-1, 1]) b.cyl(...P(dP + 0.3, yr, s * (ge - 0.4)), ...P(dP + 0.3, yr + 0.55, s * (ge - 0.4)), 0.22, 0.17, 6);
  if (J.core) { // the compact dark base where the bottom chord meets the knoll, a pair of slender raking struts under the cantilever
    const [ca, cz, cw] = J.core, g = Math.min(G(ca, 0), G(cz, 0)) - 2, C = [[ca, -cw], [cz, -cw], [cz, cw], [ca, cw]]; b.set([0.17, 0.17, 0.18], MAT.stone);
    for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) & 3]; sq(P(p[0], g, p[1]), P(q[0], g, q[1]), P(q[0], ub(q[0], q[1]) + 0.2, q[1]), P(p[0], ub(p[0], p[1]) + 0.2, p[1])); }
    for (let d = ca + cw; d < cz; d += 2 * cw) col(d, 0, cw + 0.4);
    if (J.strut) { b.set([0.22, 0.23, 0.25], MAT.metal); const [sa, sz] = J.strut; for (const t of [-3, 3]) { mem(P(sz, G(sz, t) - 0.5, t), P(sa, ub(sa, 0), t * 1.4), 0.6); col(sz, t, 0.8); } }
  }
  if (J.block) { // visitor centre and take-off foundation: low concrete block, glazed back, steel columns up to the girder
    const [da, hw] = J.block, dz = L + 2, g = Math.min(G(da, -hw), G(da, hw), G(dz, -hw), G(dz, hw)) - 2, yB0 = Math.max(G(da, -hw), G(da, hw), G(dz, -hw), G(dz, hw), G((da + dz) / 2, 0)) + 3.5, yB = Math.min(yB0, ub(L, 0) - 0.3); // never above the girder at the lip
    const C = [[da, -hw], [dz, -hw], [dz, hw], [da, hw]];
    b.set(CN, MAT.stone); for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) & 3]; sq(P(p[0], g, p[1]), P(q[0], g, q[1]), P(q[0], yB, q[1]), P(p[0], yB, p[1])); }
    b.set(SNOWC, MAT.snow); sq(P(da - 0.4, yB, -hw - 0.4), P(dz, yB, -hw - 0.4), P(dz, yB, hw + 0.4), P(da - 0.4, yB, hw + 0.4));
    b.set([1, 0.8, 0.5], MAT.window); { const yw = G(da, 0) + 0.6; sq(P(da - 0.03, yw, -hw + 1), P(da - 0.03, yw, hw - 1), P(da - 0.03, yw + 2.4, hw - 1), P(da - 0.03, yw + 2.4, -hw + 1), [0, 0, (2 * hw - 2) / 1.6, 0, (2 * hw - 2) / 1.6, 1, 0, 1]); }
    b.set(DST, MAT.metal); for (const d of [da + 3, (da + L) / 2, L - 4]) for (const s of [-1, 1]) { const t = s * (eo(d, s) - 1); if (ub(d, t) > yB + 0.5) for (const o of [-3, 3]) mem(P(d, yB, t), P(d + o, ub(d + o, t), t), 0.45); } // V struts up to the girder
  }
  if (J.wing) { // wind screens: one smooth shell from the gallery down both inrun sides (the track lies in a trough), past the take-off and out round the
    // landing hill (`wing`: lidar top edge), flaring out; silver slats, vertical ribs, a dark coping; down to the soffit on the cantilever, to the ground from the core on
    // the top line: band top = track + a screen height growing smoothly from the roof plate's underside at the start to 7.5 m at the lip; past the lip one cubic in d
    // for the height and one for the sideways offset, leaving the lip with the band's own height, slope and flare, least-squares fitted to the lidar wing tops
    const hsT = (d) => lerp(yr - 0.35 - yt, 7.5, sm((d - d0) / (L - d0))), topI = (d) => d <= d0 ? yr - 0.35 : yd(d) + hsT(d);
    const WP = J.wing.filter((w) => w[0] > L + 1), wE = WP[WP.length - 1][0], dM = (L + wE) / 2;
    const fit = (y0, s0, c) => { let A = 0, B = 0, C = 0, p = 0, q = 0; for (const w of WP) { const x = w[0] - L, r = w[c] - y0 - s0 * x, x2 = x * x, x3 = x2 * x; A += x2 * x2; B += x2 * x3; C += x3 * x3; p += x2 * r; q += x3 * r; }
      const det = A * C - B * B, c2 = (p * C - q * B) / det, c3 = (A * q - B * p) / det; return (d) => { const x = d - L; return y0 + s0 * x + c2 * x * x + c3 * x * x * x; }; };
    const fit3 = (y0, c) => { const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0]; for (const w of WP) { const x = w[0] - L, X = [x, x * x, x * x * x]; for (let i = 0; i < 3; i++) { v[i] += X[i] * (w[c] - y0); for (let j = 0; j < 3; j++) M[i][j] += X[i] * X[j]; } } // free slope (the plan flare)
      const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]), D0 = det3(M), k = [0, 1, 2].map((i) => det3(M.map((r, j) => r.map((q, l) => l === i ? v[j] : q))) / D0);
      return (d) => { const x = d - L; return y0 + k[0] * x + k[1] * x * x + k[2] * x * x * x; }; };
    const yW = fit(topI(L), (topI(L) - topI(L - 0.5)) / 0.5, 2), tW = fit3(eo(L, 1), 1), R = [[dP, e, topI(dP)], [d0, eo(d0, 1), topI(d0)]], m0 = (eo(L - 14, 1) - eo(L - 16, 1)) / 2, m1 = (tW(L + 0.01) - tW(L)) / 0.01;
    const tI = (d) => { if (d <= L - 14) return eo(d, 1); const u = (d - L + 14) / 14, u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * eo(L - 14, 1) + (u3 - 2 * u2 + u) * 14 * m0 + (3 * u2 - 2 * u3) * tW(L) + (u3 - u2) * 14 * m1; }; // the plan flare starts 14 m before the lip, smoothly
    for (let k = 1, n = Math.ceil((L - d0) / 3); k <= n; k++) { const d = d0 + (L - d0) * k / n; R.push([d, tI(d), topI(d)]); }
    for (let k = 1, n = Math.ceil((wE - L) / 3); k <= n; k++) { const d = L + (wE - L) * k / n; R.push([d, tW(d), yW(d)]); }
    const wd0 = topI(dB) - (yd(dB) - 1.5); // the inrun band's depth where the wing band takes over
    for (const s of [-1, 1]) {
      // the wings: a clad canopy band, its depth (in elevation) from the inrun band's at dB to 8 m at the take-off, 8 m to mid-wing, then tapering to 1.5 m at the tip;
      // the lower edge leans in towards the hill (by 0.35-0.9 of the depth: further where that lands it on the knoll; the lean is smoothed along the wing); closed to the
      // ground where it comes within 2 m of it, open framing below it elsewhere. bot returns [band bottom, its t, ground (0: none)]
      const dwf = (d) => d < L ? lerp(wd0, 8, sm((d - dB) / (L - dB))) : lerp(8, 1.5, sm((d - dM) / (wE - dM))), rp = (d) => clamp((d - dB) / 20, 0, 1);
      const LN = R.map((p) => { if (p[0] < dB) return 0.35; const dw = dwf(p[0]); for (let f = 0.35; f < 0.91; f += 0.05) if (p[2] - dw - G(p[0], s * (p[1] - f * dw * rp(p[0]))) + 0.6 < 2.5) return f; return 0.35; });
      for (let k = 0; k < 3; k++) for (let i = 1; i + 1 < LN.length; i++) LN[i] = Math.max(LN[i], (LN[i - 1] + 2 * LN[i] + LN[i + 1]) / 4);
      const bot = (p, i) => { if (p[0] < dB) return [yd(p[0]) - 1.5, p[1], 0]; const dw = dwf(p[0]), tb = p[1] - LN[i] * dw * rp(p[0]), g = G(p[0], s * tb) - 0.6, bb = p[2] - dw; return [bb - g < 2.5 ? g : Math.max(g, bb), tb, g]; };
      let arc = 0;
      for (let i = 0; i + 1 < R.length; i++) {
        const A = R[i], B = R[i + 1], dd = B[0] - A[0], dt = B[1] - A[1], l = Math.hypot(dd, dt), nd = -dt / l, nt = dd / l, [ba, ta, ga] = bot(A, i), [bb, tb, gb] = bot(B, i + 1), ua = arc / 2.4, uv2 = (arc + l) / 2.4;
        b.set(SV, MAT.wood); sq(P(A[0], ba, s * ta), P(B[0], bb, s * tb), P(B[0], B[2], s * B[1]), P(A[0], A[2], s * A[1]), [ua, ba, uv2, bb, uv2, B[2], ua, A[2]]);
        b.set(DST, MAT.metal); sq(P(A[0] - nd * 0.3, A[2], s * (A[1] - nt * 0.3)), P(B[0] - nd * 0.3, B[2], s * (B[1] - nt * 0.3)), P(B[0] + nd * 0.3, B[2], s * (B[1] + nt * 0.3)), P(A[0] + nd * 0.3, A[2], s * (A[1] + nt * 0.3)));
        if (i % 2 === 0 && i) { b.set([0.36, 0.38, 0.41], MAT.metal); for (const o of [-0.1, 0.1]) { const w0 = 0.35 / l; sq(P(A[0] + nd * o, ba, s * (ta + nt * o)), P(A[0] + nd * o + dd * w0, ba, s * (ta + nt * o + dt * w0)), P(A[0] + nd * o + dd * w0, A[2] - 0.3, s * (A[1] + nt * o + dt * w0)), P(A[0] + nd * o, A[2] - 0.3, s * (A[1] + nt * o))); } }
        b.set([0.26, 0.27, 0.29], MAT.metal); { const o = 0.25, f = i & 1, y0 = f ? A[2] - 0.5 : ba + 0.3, y1 = f ? bb + 0.3 : B[2] - 0.5, t0 = f ? A[1] : ta, t1 = f ? tb : B[1], w = 0.4 / l; // outer-face truss diagonal
          sq(P(A[0] + nd * o, y0, s * (t0 + nt * o)), P(A[0] + nd * o + dd * w, y0, s * (t0 + nt * o + dt * w)), P(B[0] + nd * o + dd * w, y1, s * (t1 + nt * o + dt * w)), P(B[0] + nd * o, y1, s * (t1 + nt * o))); }
        if (ga && ba > ga + 1) { mem(P(A[0], ba, s * ta), P(B[0], bb, s * tb), 0.45); if (i % 2 === 0 || ba - ga < 6) { mem(P(A[0], ga, s * ta), P(A[0], ba, s * ta), 0.5); mem(P(A[0], ga, s * ta), P(B[0], bb, s * tb), 0.35); } } // open framing under the band
        if (A[0] >= c0 && ga && ba - ga < 3) col(A[0], s * ta, 2.3); else if (A[0] >= c0 && ga && ba - ga < 6) col(A[0], s * ta, 1.6); else if (A[0] >= c0 && i % 2 === 0) col(A[0], s * ta, 0.8); // solid where the blade comes down to the ground, the posts elsewhere
        arc += l;
      }
    }
  }
  if (J.edge) { // banner boards along both edges of the landing hill
    for (let d = J.edge[0][0], i = 0; d < J.edge[J.edge.length - 1][0]; d += 6, i++) { const q = d + 5.8, ta = tab(J.edge, d, 1), tq = tab(J.edge, q, 1);
      for (const s of [-1, 1]) { const ga = G(d, s * ta), gq = G(q, s * tq); b.set(ADC[(i + (s > 0 ? 2 : 0)) % ADC.length], MAT.paint); sq(P(d, ga - 0.3, s * ta), P(q, gq - 0.3, s * tq), P(q, gq + 0.9, s * tq), P(d, ga + 0.9, s * ta)); } }
  }
  // flat-roofed buildings [d0, d1, t0, t1, height above the highest corner]: grey slatted walls, a glazed band towards the hill and downhill
  const hall = (ha, hz, ta, tz, hh, dk) => {
    const gM = Math.max(G(ha, ta), G(ha, tz), G(hz, ta), G(hz, tz)), g = Math.max(Math.min(G(ha, ta), G(ha, tz), G(hz, ta), G(hz, tz)) - 0.5, gM - hh - 4), y1 = gM + hh, C = [[ha, ta], [hz, ta], [hz, tz], [ha, tz]], tf = Math.abs(ta) < Math.abs(tz) ? ta : tz, sg = Math.sign(tz - ta), wy = Math.max(y1 - 3.4, g + 1.2);
    b.set(dk ? [0.11, 0.11, 0.12] : [0.36, 0.37, 0.38], MAT.wood); for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) & 3], w = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2.4; sq(P(p[0], g, p[1]), P(q[0], g, q[1]), P(q[0], y1, q[1]), P(p[0], y1, p[1]), [0, g, w, g, w, y1, 0, y1]); }
    const o = -Math.sign(tf) * 0.04, nw = (hz - ha - 1) / 1.3, nt = (Math.abs(tz - ta) - 1) / 1.3; b.set([0.85, 0.85, 0.85], MAT.window);
    sq(P(ha + 0.5, wy, tf + o), P(hz - 0.5, wy, tf + o), P(hz - 0.5, y1 - 0.7, tf + o), P(ha + 0.5, y1 - 0.7, tf + o), [0, 0, nw, 0, nw, 2, 0, 2]);
    sq(P(hz + 0.04, wy, ta + sg * 0.5), P(hz + 0.04, wy, tz - sg * 0.5), P(hz + 0.04, y1 - 0.7, tz - sg * 0.5), P(hz + 0.04, y1 - 0.7, ta + sg * 0.5), [0, 0, nt, 0, nt, 2, 0, 2]);
    b.set(DST, MAT.metal); sq(P(ha - 0.3, y1, ta - 0.3 * sg), P(hz + 0.3, y1, ta - 0.3 * sg), P(hz + 0.3, y1 + 0.35, ta - 0.3 * sg), P(ha - 0.3, y1 + 0.35, ta - 0.3 * sg)); sq(P(ha - 0.3, y1, tz + 0.3 * sg), P(hz + 0.3, y1, tz + 0.3 * sg), P(hz + 0.3, y1 + 0.35, tz + 0.3 * sg), P(ha - 0.3, y1 + 0.35, tz + 0.3 * sg));
    b.set(SNOWC, MAT.snow); sq(P(ha - 0.3, y1 + 0.35, ta - 0.3 * sg), P(hz + 0.3, y1 + 0.35, ta - 0.3 * sg), P(hz + 0.3, y1 + 0.35, tz + 0.3 * sg), P(ha - 0.3, y1 + 0.35, tz + 0.3 * sg));
    const lw = hz - ha, lt = Math.abs(tz - ta), r = Math.min(lw, lt) / 2 + 0.3, n = Math.max(1, Math.ceil(Math.max(lw, lt) / r / 1.4)); // solid: circles along the long side
    for (let k = 0; k < n; k++) { const f = n > 1 ? k / (n - 1) : 0.5; if (lw >= lt) col(lerp(ha + r - 0.3, hz - r + 0.3, f), (ta + tz) / 2, r); else col((ha + hz) / 2, lerp(ta + sg * (r - 0.3), tz - sg * (r - 0.3), f), r); }
  };
  if (J.hut) for (const H of J.hut) hall(...H); // judges' and coaches' huts at the feet of the arches; the visitor centre beside the inrun
}
// Chairlift (Tryvann): T-pylons on a straight line (LM.lift, read off the lidar), two cables and chairs
function skiLift(b, W, L) {
  const dx = L.b[0] - L.a[0], dz = L.b[1] - L.a[1], len = Math.hypot(dx, dz), rx = -dz / len, rz = dx / len, n = Math.round(len / L.sp), h = L.h, G = [0.34, 0.36, 0.38];
  b.at(0, 0, 0); let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= n; i++) {
    const x = L.a[0] + dx * i / n, z = L.a[1] + dz * i / n, y = W.heightAt(x, z);
    b.set(G, MAT.metal); b.cyl(x, y - 1, z, x, y + h, z, i ? 0.28 : 0.5, i ? 0.2 : 0.4, 8); b.cyl(x - rx * 2.6, y + h, z - rz * 2.6, x + rx * 2.6, y + h, z + rz * 2.6, 0.12, 0.12, 6);
    if (!i) b.cyl(x, y + h - 0.35, z, x, y + h - 0.1, z, 2.5, 2.5, 14);
    if (Math.abs(x) < 1600 && Math.abs(z) < 1600) W.colliders.push(x, z, 0.7);
    if (i) for (const s of [-2.4, 2.4]) {
      b.set(DARK, MAT.wire); b.cyl(px + rx * s, py + h - 0.1, pz + rz * s, x + rx * s, y + h - 0.1, z + rz * s, 0.035, 0.035, 4);
      for (const f of [0.25, 0.75]) {
        const cx = lerp(px, x, f) + rx * s, cz = lerp(pz, z, f) + rz * s, cy = lerp(py, y, f) + h - 0.1;
        b.set(G, MAT.metal); b.cyl(cx, cy, cz, cx, cy - 2.7, cz, 0.04, 0.04, 4); b.cyl(cx - rx * 1.1, cy - 2.7, cz - rz * 1.1, cx + rx * 1.1, cy - 2.7, cz + rz * 1.1, 0.14, 0.14, 5); b.cyl(cx - rx * 1.1, cy - 2.1, cz - rz * 1.1, cx + rx * 1.1, cy - 2.1, cz + rz * 1.1, 0.04, 0.04, 4);
      }
    }
    px = x; py = y; pz = z;
  }
}
// Tryvannstårnet (1962): plain concrete shaft (r 3.5) to ~22 m, a tall ribbed cream drum (r 6.3, lidar) to 55 m with a dark
// window band under its cap, an equipment drum hung with dishes and a platform at 65 m (lidar top), then a galvanised lattice mast and whip to 118 m
function tvTower(b, W, T) {
  const y = W.heightAt(T.x, T.z) - 1.5, CON = [0.48, 0.47, 0.44], DRUM = [0.6, 0.55, 0.44], GAL = [0.56, 0.58, 0.6], R = 6.3; b.at(T.x, y, T.z);
  b.set(CON, MAT.stone); b.cyl(0, -1, 0, 0, 1.6, 0, 4.6, 4.4, 20); b.cyl(0, 1.6, 0, 0, 23.5, 0, 3.55, 3.45, 20);
  b.set(DRUM, MAT.stone); b.cyl(0, 22.5, 0, 0, 25.5, 0, 3.4, R, 28, 0); b.cyl(0, 25.5, 0, 0, 51, 0, R, R, 32, 0);
  for (let i = 0; i < 28; i++) { b.at(T.x, y, T.z, i / 28 * Math.PI * 2); b.box(-0.14, 25.6, R - 0.05, 0.14, 50.8, R + 0.16); } // vertical ribs
  b.at(T.x, y, T.z);
  b.set([0.03, 0.045, 0.06], MAT.glass); b.cyl(0, 51, 0, 0, 54, 0, R + 0.02, R + 0.02, 32, 0);
  b.set([0.9, 0.82, 0.62], MAT.window); // a few lit panes in the band (staff and equipment rooms)
  for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2, d = Math.PI / 16 * 0.7, r = R + 0.06, P = (e, h) => [Math.cos(a + e) * r, h, Math.sin(a + e) * r]; if (hash1(i * 5 + 1) < 0.5) b.quad(P(d, 51.6), P(-d, 51.6), P(-d, 53.4), P(d, 53.4), [0.12, 0.14, 0.44, 0.14, 0.44, 0.52, 0.12, 0.52]); } // uv inside one pane: plain glass by day, lit at night
  b.set(DRUM, MAT.stone); b.cyl(0, 54, 0, 0, 55.4, 0, R + 0.25, R + 0.25, 32); b.cyl(0, 55.4, 0, 0, 56.2, 0, R + 0.1, 4.2, 24);
  b.set(GAL, MAT.metal); b.cyl(0, 56, 0, 0, 64.6, 0, 3.6, 3.3, 16); b.cyl(0, 64.4, 0, 0, 65.2, 0, 5.2, 5.2, 24);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; b.cyl(Math.cos(a) * 5.1, 65.2, Math.sin(a) * 5.1, Math.cos(a) * 5.1, 66.3, Math.sin(a) * 5.1, 0.04, 0.04, 3, 0); }
  b.set(WHITE, MAT.paint); // dishes and drum antennas on the equipment level, pointing out
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3, h = 57.5 + (i % 3) * 2.2, rr = i % 3 === 1 ? 1.25 : 0.9, c = Math.cos(a), s = Math.sin(a); b.cyl(c * 3.5, h, s * 3.5, c * 3.9, h, s * 3.9, rr * 0.75, rr, 10); b.cyl(c * 3.2, h, s * 3.2, c * 3.55, h, s * 3.55, 0.2, 0.2, 4, 0); }
  b.set(GAL, MAT.metal); // lattice mast: four legs, X bracing per face, a dark feeder core so it still reads at range
  const m0 = 65.2, m1 = 104, w0 = 1.15, w1 = 0.42, n = 13, hw = (t) => w0 + (w1 - w0) * t;
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) b.cyl(sx * w0, m0, sz * w0, sx * w1, m1, sz * w1, 0.09, 0.06, 4, 0);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, ya = m0 + (m1 - m0) * t0, yb = m0 + (m1 - m0) * t1, a = hw(t0), c = hw(t1);
    for (let f = 0; f < 4; f++) { const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]], p = C[f], q = C[(f + 1) & 3];
      b.cyl(p[0] * a, ya, p[1] * a, q[0] * c, yb, q[1] * c, 0.035, 0.035, 3, 0); b.cyl(q[0] * a, ya, q[1] * a, p[0] * c, yb, p[1] * c, 0.035, 0.035, 3, 0); b.cyl(p[0] * a, ya, p[1] * a, q[0] * a, ya, q[1] * a, 0.04, 0.04, 3, 0); }
  }
  b.set([0.32, 0.33, 0.34], MAT.metal); b.cyl(0, m0, 0, 0, m1, 0, 0.45, 0.22, 6); b.set(GAL, MAT.metal); b.cyl(0, m1, 0, 0, T.h - 0.8, 0, 0.26, 0.09, 6);
  for (const h of [78, 91]) b.cyl(0, h, 0, 0, h + 0.5, 0, hw((h - m0) / (m1 - m0)) * 1.5, hw((h - m0) / (m1 - m0)) * 1.5, 8);
  b.set([1, 0.15, 0.08], MAT.beacon); b.cyl(0, T.h - 0.8, 0, 0, T.h, 0, 0.3, 0.2, 6); b.cyl(0, 91.5, 0, 0, 92.1, 0, 0.5, 0.5, 6);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; b.cyl(Math.cos(a) * 5, 66.3, Math.sin(a) * 5, Math.cos(a) * 5, 66.8, Math.sin(a) * 5, 0.22, 0.18, 6); }
  W.colliders.push(T.x, T.z, 4.4); // the foot ring
}
// shared by the chapel and the lodge: a roof face as a dark board slab with a snow skin; any winding (made ccw from above here)
function roofQ(b, P, under, th = 0.22) {
  const ux = P[1][0] - P[0][0], uz = P[1][2] - P[0][2], vx = P[3][0] - P[0][0], vz = P[3][2] - P[0][2]; if (uz * vx - ux * vz < 0) P = [P[3], P[2], P[1], P[0]];
  b.set(under, MAT.wood); slab(b, P[0], P[1], P[2], P[3], th); b.set(SNOWC, MAT.snow); b.quad(...P.map((p) => [p[0], p[1] + 0.1, p[2]]));
}
const gtri = (b, p, q, r, n) => b.tri(b.vert(...p, ...n), b.vert(...q, ...n), b.vert(...r, ...n)); // gable-end triangle with an explicit normal
// lit window with a frame on an axis-aligned wall: centre-bottom (x, y, z) on the face, normal (nx, 0, nz)
function win(b, x, y, z, w, h, nx, nz, fr) {
  const tx = -nz, tz = nx, Q = (o, a, y0, y1) => [[x - tx * a + nx * o, y0, z - tz * a + nz * o], [x + tx * a + nx * o, y0, z + tz * a + nz * o], [x + tx * a + nx * o, y1, z + tz * a + nz * o], [x - tx * a + nx * o, y1, z - tz * a + nz * o]];
  if (fr) { b.set(fr, MAT.paint); b.quad(...Q(0.04, w / 2 + 0.12, y - 0.12, y + h + 0.12)); }
  const nu = Math.max(1, Math.round(w / 1.1)), nv = Math.max(1, Math.round(h / 1.3)); // one uv unit = a four-pane sash in the window shader
  b.set([1, 0.78, 0.45], MAT.window); b.quad(...Q(0.07, w / 2, y, y + h), [0, 0, nu, 0, nu, nv, 0, nv]);
}
// Holmenkollen kapell (1903, rebuilt 1996): dark tarred stave-church style. Measured (lidar): nave 10 m wide (local +x = west) with
// low pent-roofed aisles to 13.6 m and its ridge at 13.3 m; a transept at the east end 15 m across; the square belfry over the crossing with
// a flared eave and a tall octagonal shingle spire (lidar ~30 m, tip missed); a round turret with two conical roofs in the north corner.
function chapel(b, W, C) {
  const y = W.heightAt(C.x, C.z), v0 = b.v.length / VS, th = -C.yaw + Math.PI / 2, cs = Math.cos(th), sn = Math.sin(th);
  const DW = [0.055, 0.037, 0.025], UN = [0.04, 0.03, 0.022], TR = [0.2, 0.135, 0.08], SH = [0.16, 0.17, 0.18], PL = [0.36, 0.32, 0.26], F = 0.6, E = 5.6, RN = 13.3, RT = 13;
  const wp = (lx, lz) => [C.x + cs * lx + sn * lz, C.z - sn * lx + cs * lz];
  b.at(C.x, y, C.z, th);
  b.set(PL, MAT.stone); b.box(-13, -3.5, -2.3, -11.6, F, 2.3); b.box(-0.6, -3.5, -7, 12.7, F, 7); b.box(-11.7, -3.5, -9.4, -0.4, F, 9.4); b.box(12.6, -3.5, -2.8, 15.6, F, 2.8);
  b.set(DW, MAT.wood); b.box(-0.5, F, -4.8, 12.5, E, 4.8); b.box(-11.5, F, -7.6, -0.5, E, 7.6); b.box(12.5, F, -2.6, 15.4, 3.4, 2.6); b.box(-12.9, F, -2.1, -11.5, 4.3, 2.1); // last: sacristy on the east wall
  for (const s of [-1, 1]) { b.box(-0.5, F, s > 0 ? 4.8 : -6.8, 12.5, 2.7, s > 0 ? 6.8 : -4.8); b.box(-11, F, s > 0 ? 7.6 : -9.2, -1, 2.6, s > 0 ? 9.2 : -7.6); }
  gtri(b, [12.5, E, -4.8], [12.5, E, 4.8], [12.5, RN, 0], [1, 0, 0]); gtri(b, [15.4, 3.4, -2.6], [15.4, 3.4, 2.6], [15.4, 5.6, 0], [1, 0, 0]); gtri(b, [-12.9, 4.3, -2.1], [-12.9, 4.3, 2.1], [-12.9, 6.35, 0], [-1, 0, 0]);
  for (const s of [-1, 1]) gtri(b, [-11.5, E, s * 7.6], [-0.5, E, s * 7.6], [-6, RT, s * 7.6], [0, 0, s]);
  const o = 0.5, eN = E - o * (RN - E) / 4.8, eT = E - o * (RT - E) / 5.5;
  for (const s of [-1, 1]) {
    roofQ(b, [[-6, eN, s * 5.3], [13.1, eN, s * 5.3], [13.1, RN, 0], [-6, RN, 0]], UN);
    roofQ(b, [[-6 + s * 6, eT, -8.2], [-6 + s * 6, eT, 8.2], [-6, RT, 8.2], [-6, RT, -8.2]], UN);
    roofQ(b, [[-0.5, 2.45, s * 7.25], [12.9, 2.45, s * 7.25], [12.9, 4.95, s * 4.8], [-0.5, 4.95, s * 4.8]], UN, 0.16);
    roofQ(b, [[-11.3, 2.35, s * 9.65], [-0.7, 2.35, s * 9.65], [-0.7, 4.5, s * 7.6], [-11.3, 4.5, s * 7.6]], UN, 0.16);
    roofQ(b, [[12.3, 3.15, s * 3.0], [15.8, 3.15, s * 3.0], [15.8, 5.6, 0], [12.3, 5.6, 0]], UN, 0.16);
    roofQ(b, [[-13.3, 4.05, s * 2.45], [-11.5, 4.05, s * 2.45], [-11.5, 6.4, 0], [-13.3, 6.4, 0]], UN, 0.16);
  }
  b.set(TR, MAT.wood); // gable crosses
  for (const [x, yy, z, ax] of [[13.05, RN, 0, 0], [-6, RT, 8.15, 1], [-6, RT, -8.15, 1], [15.75, 5.6, 0, 0]]) { b.box(x - 0.08, yy, z - 0.08, x + 0.08, yy + 1.7, z + 0.08); if (ax) b.box(x - 0.45, yy + 1.0, z - 0.07, x + 0.45, yy + 1.18, z + 0.07); else b.box(x - 0.07, yy + 1.0, z - 0.45, x + 0.07, yy + 1.18, z + 0.45); }
  // belfry: square timber tower on the crossing, louvred openings, a trim band
  const tx = -5.8, ht = 2.5;
  b.set(DW, MAT.wood); b.box(tx - ht, 10.5, -ht, tx + ht, 21, ht);
  b.set(TR, MAT.wood); b.box(tx - ht - 0.12, 16.9, -ht - 0.12, tx + ht + 0.12, 17.3, ht + 0.12);
  b.set(DARK, MAT.void);
  for (const s of [-1, 1]) for (const q of [-0.9, 0.9]) { b.quad([tx + q - 0.35, 17.7, s * (ht + 0.02)], [tx + q + 0.35, 17.7, s * (ht + 0.02)], [tx + q + 0.35, 20.2, s * (ht + 0.02)], [tx + q - 0.35, 20.2, s * (ht + 0.02)]); b.quad([tx + s * (ht + 0.02), 17.7, q - 0.35], [tx + s * (ht + 0.02), 17.7, q + 0.35], [tx + s * (ht + 0.02), 20.2, q + 0.35], [tx + s * (ht + 0.02), 20.2, q - 0.35]); }
  // windows: rows in the aisle walls, tall gridded windows in the gables and the transept's east wall
  for (const s of [-1, 1]) {
    for (let q = 0; q < 8; q++) win(b, 0.9 + q * 1.5, 1.25, s * 6.8, 0.95, 0.95, 0, s, null);
    for (let q = 0; q < 6; q++) win(b, -10.2 + q * 1.6, 1.2, s * 9.2, 1.0, 0.9, 0, s, null);
    for (const dx of [-1.25, 0, 1.25]) { win(b, -6 + dx, 5.9, s * 7.6, 1.0, 1.6, 0, s, TR); win(b, -6 + dx, 7.8, s * 7.6, 1.0, 1.6, 0, s, TR); }
    win(b, -6, 9.9, s * 7.6, 1.0, 1.3, 0, s, TR);
    win(b, 12.5, 6.4, s * 0.65, 0.9, 2.0, 1, 0, TR);
  }
  for (const dz of [-5.4, -3.5, 3.5, 5.4]) win(b, -11.5, 1.5, dz, 1.0, 3.2, -1, 0, TR);
  win(b, -12.9, 1.6, 0, 0.8, 1.4, -1, 0, TR);
  win(b, 15.4, 0.6, 0, 1.4, 2.2, 1, 0, TR);
  // round turret in the north corner between transept and nave: drum, cone, a smaller drum, a pointed cone
  const rx = 0.9, rz = 6.3; b.set(DW, MAT.wood); b.cyl(rx, F, rz, rx, 6.3, rz, 1.6, 1.6, 12); b.cyl(rx, 7.6, rz, rx, 8.5, rz, 0.85, 0.85, 10);
  b.set(SH, MAT.paint); b.cyl(rx, 6.3, rz, rx, 7.7, rz, 2.05, 0.8, 12); b.cyl(rx, 8.5, rz, rx, 10.9, rz, 1.1, 0.04, 10);
  // the flared skirt and the octagonal spire, faces square to the tower (frame turned by 22.5 degrees)
  const tp = wp(tx, 0); b.at(tp[0], y, tp[1], th + Math.PI / 8);
  b.set(SH, MAT.paint); b.cyl(0, 20.8, 0, 0, 22.3, 0, 3.75, 2.45, 8); b.cyl(0, 22.3, 0, 0, 33, 0, 2.45, 0.05, 8);
  b.set(TR, MAT.metal); b.box(-0.05, 32.6, -0.05, 0.05, 34.6, 0.05); b.box(-0.4, 33.8, -0.04, 0.4, 33.92, 0.04);
  const bx = (lx, lz, t, hw, hd, wall, rise) => { const p = wp(lx, lz); return box(p[0], p[1], t, hw, hd, y, wall, rise); };
  W.bld.push({ x: C.x, y, z: C.z, th, v0, v1: b.v.length / VS, area: 391, col: DW, boxes: [bx(6, 0, th, 6.5, 4.8, E, RN - E), bx(-6, 0, th - Math.PI / 2, 7.6, 5.5, E, RT - E), bx(tx, 0, th, ht, ht, 21, 0),
    bx(6, 5.8, th, 6.5, 1, 2.7, 0), bx(-12.2, 0, th, 0.7, 2.1, 4.3, 2), bx(6, -5.8, th, 6.5, 1, 2.7, 0), bx(-6, 8.4, th, 5, 0.8, 2.6, 0), bx(-6, -8.4, th, 5, 0.8, 2.6, 0), bx(13.95, 0, th, 1.45, 2.6, 3.4, 2.2)] });
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

// ---------- Holmenkollen arena (LM.arena in world.js): stands stepped on the measured ground, stand buildings, biathlon range, floodlights ----------
const CONC = [0.46, 0.46, 0.45], SEAT = [0.07, 0.12, 0.26], AISLE = [0.6, 0.6, 0.58], STEEL = [0.5, 0.52, 0.55];
const bx = (b, x0, y0, z0, x1, y1, z1) => b.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)); // box with its corners in any order
function nq(b, p0, p1, p2, p3, nx, ny, nz) { const a = b.vert(p0[0], p0[1], p0[2], nx, ny, nz), c = b.vert(p1[0], p1[1], p1[2], nx, ny, nz), d = b.vert(p2[0], p2[1], p2[2], nx, ny, nz), e = b.vert(p3[0], p3[1], p3[2], nx, ny, nz); b.i.push(a, c, d, a, d, e); }
function arenaXf(W, f) { // frame helpers: P(d, t, y) -> world point, G(d, t) ground, the right vector
  const F = arenaFrame(f), rx = -F[3], rz = F[2];
  return { F, rx, rz, P: (d, t, y) => [F[0] + F[2] * d + rx * t, y, F[1] + F[3] * d + rz * t], G: (d, t) => W.heightAt(F[0] + F[2] * d + rx * t, F[1] + F[3] * d + rz * t) };
}
// one stand: rows between the front and back lines of its ribs, the treads in even steps up the rib's fitted rake, raised to clear the ground, + lift. S.n rows split
// the depth evenly (so in the bowl they curve with its outline and close up at the narrow end); otherwise rows S.rw deep run parallel
// to the front. Ribs every S.seg m. Treads are snow, risers seats or concrete, aisles every S.ai m, a front wall down to the ground
// in front, a back wall and railing, solid circles along the middle.
// A stand whose rows run across the slope (the terraces beside a landing hill): the treads are the contour bands, S.rh high, of the plane
// fitted to the ground under the stand, so they step down the hill at right angles to the rows of the bowl below. Ribs r as in stand().
function standX(b, W, S) {
  const X = arenaXf(W, S.f), { P, G, F } = X, r = S.r, sg = Math.sign(r[0][2] - r[0][1]), h = S.rh || 0.5, d0 = r[0][0], d1 = r[r.length - 1][0];
  let poly = []; for (const q of r) poly.push([q[0], Math.abs(q[1])]); for (let i = r.length - 1; i >= 0; i--) poly.push([r[i][0], Math.abs(r[i][2])]);
  const pt = []; let md = 0, ms = 0, my = 0;
  for (let d = d0; d <= d1; d += 2) { const q = standAt(r, d), s0 = Math.min(Math.abs(q[0]), Math.abs(q[1])), s1 = Math.max(Math.abs(q[0]), Math.abs(q[1])); for (let t = s0; t <= s1; t += 2) { const y = G(d, sg * t); pt.push(d, t, y); md += d; ms += t; my += y; } }
  const n = pt.length / 3; md /= n; ms /= n; my /= n; let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) { const u = pt[i * 3] - md, v = pt[i * 3 + 1] - ms, y = pt[i * 3 + 2] - my; a11 += u * u; a12 += u * v; a22 += v * v; b1 += u * y; b2 += v * y; }
  const det = a11 * a22 - a12 * a12 || 1, kd = (b1 * a22 - b2 * a12) / det, ks = (a11 * b2 - a12 * b1) / det, V = (q) => kd * (q[0] - md) + ks * (q[1] - ms);
  let off = 0; for (let i = 0; i < n; i++) off = Math.max(off, pt[i * 3 + 2] - my - kd * (pt[i * 3] - md) - ks * (pt[i * 3 + 1] - ms)); off = Math.min(off, 1.2) + (S.lift || 0.3);
  const clip = (pl, L, keepAbove) => { const o = []; for (let i = 0; i < pl.length; i++) { const A = pl[i], B = pl[(i + 1) % pl.length], va = V(A) - L, vb = V(B) - L, ia = keepAbove ? va >= 0 : va <= 0, ib = keepAbove ? vb >= 0 : vb <= 0;
    if (ia) o.push(A); if (ia !== ib) { const k = va / (va - vb); o.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]); } } return o; };
  let v0 = 1e9, v1 = -1e9; for (const q of poly) { v0 = Math.min(v0, V(q)); v1 = Math.max(v1, V(q)); }
  const gl = Math.hypot(kd, ks) || 1, nx = -(kd * F[2] + ks * sg * X.rx) / gl, nz = -(kd * F[3] + ks * sg * X.rz) / gl, W3 = (q, y) => P(q[0], sg * q[1], y);
  b.at(0, 0, 0);
  for (let L = Math.floor(v0 / h) * h; L < v1; L += h) {
    const band = clip(clip(poly, L, true), L + h, false); if (band.length < 3) continue; const Y = my + L + h + off;
    b.set(SNOWC, MAT.snow); for (let i = 1; i + 1 < band.length; i++) nq(b, W3(band[0], Y), W3(band[i], Y), W3(band[i + 1], Y), W3(band[i + 1], Y), 0, 1, 0);
    const lo = band.filter((q) => Math.abs(V(q) - L) < 1e-4); // the band's downhill edge: its riser
    if (lo.length >= 2) { b.set(CONC, MAT.stone); nq(b, W3(lo[0], Y - h - 0.05), W3(lo[lo.length - 1], Y - h - 0.05), W3(lo[lo.length - 1], Y), W3(lo[0], Y), nx, 0, nz); }
  }
  b.set(CONC, MAT.stone); // walls down to the ground along the front (the hill side) and across the lower end
  const yP = (d, t) => my + kd * (d - md) + ks * (t - ms) + off + h;
  for (let i = 0; i + 1 < r.length; i++) { const A = r[i], B = r[i + 1], ta = Math.abs(A[1]), tb = Math.abs(B[1]);
    nq(b, P(A[0], A[1], G(A[0], A[1]) - 0.6), P(B[0], B[1], G(B[0], B[1]) - 0.6), P(B[0], B[1], yP(B[0], tb)), P(A[0], A[1], yP(A[0], ta)), -sg * X.rx, 0, -sg * X.rz); }
  for (let i = 0; i + 1 < r.length; i++) { const A = r[i], B = r[i + 1]; // and along the back, which ends in the oblique line above the bowl
    nq(b, P(A[0], A[2], G(A[0], A[2]) - 0.6), P(B[0], B[2], G(B[0], B[2]) - 0.6), P(B[0], B[2], yP(B[0], Math.abs(B[2]))), P(A[0], A[2], yP(A[0], Math.abs(A[2]))), sg * X.rx, 0, sg * X.rz); }
  { const E = r[r.length - 1], ta = Math.abs(E[1]), tb = Math.abs(E[2]); nq(b, P(E[0], E[1], G(E[0], E[1]) - 0.6), P(E[0], E[2], G(E[0], E[2]) - 0.6), P(E[0], E[2], yP(E[0], tb)), P(E[0], E[1], yP(E[0], ta)), F[2], 0, F[3]); }
  for (let d = d0; d <= d1 + 0.01;) { const q = standAt(r, Math.min(d, d1)), rr = Math.abs(q[1] - q[0]) / 2, p = P(Math.min(d, d1), (q[0] + q[1]) / 2, 0);
    if (rr > 0.5) W.colliders.push(p[0], p[2], rr); d += Math.max(2.5, rr * 0.55); }
}
// The amphitheatre round an outrun (LM.arena bowl rings): ribs pair the top outline o with the foot outline i at equal fractions of their
// length, from the oblique upper edge down to the tail. Rows rw deep are measured in from o along every rib, so they run concentric with
// the rim and end where i cuts them (the last row on a rib takes up any leftover under 0.4 rw, so there are no slivers). Rows are level
// (rim height minus k risers, the same on every rib); radial aisles every 24 m of rim; a front wall at the foot of the outrun wall; a walkway
// S.ww wide with a railing round o; solid circles over the ring.
const plen = (Q) => { const c = [0]; for (let k = 1; k < Q.length; k++) c.push(c[k - 1] + Math.hypot(Q[k][0] - Q[k - 1][0], Q[k][1] - Q[k - 1][1])); return c; };
const ptT = (Q, d) => { let k = 0; while (k < Q.length - 2 && d > Q[k + 1][0]) k++; return Q[k][1] + (Q[k + 1][1] - Q[k][1]) * clamp((d - Q[k][0]) / (Q[k + 1][0] - Q[k][0] || 1), 0, 1); }, BRISE = [0.27, 0.27, 0.27]; // |t| of an outline at d; bowl risers
const pat = (Q, C, f) => { const L = f * C[C.length - 1]; let k = 0; while (k < Q.length - 2 && L > C[k + 1]) k++; const g = clamp((L - C[k]) / (C[k + 1] - C[k] || 1), 0, 1); return [Q[k][0] + (Q[k + 1][0] - Q[k][0]) * g, Q[k][1] + (Q[k + 1][1] - Q[k][1]) * g]; };
function bowl(b, W, S) {
  const X = arenaXf(W, S.f), { P, G, F } = X, s = S.s, rw = S.rw, lift = S.lift || 0.25, ww = S.ww || 0, Co = plen(S.o), Ci = plen(S.i), Lo = Co[Co.length - 1], i0 = b.i.length, c0 = W.colliders.length;
  const us = []; { const n = Math.ceil(Lo / 8.5); for (let k = 0; k <= n; k++) us.push(k / n); for (let a = 24; a < Lo - 10; a += 24) us.push((a - 0.7) / Lo, (a + 0.7) / Lo); us.sort((p, q) => p - q); }
  const isA = (u) => { for (let a = 24; a < Lo - 10; a += 24) if (Math.abs(u * Lo - a) < 0.71) return true; return false; };
  const rib = (u) => { const O = pat(S.o, Co, u), I = pat(S.i, Ci, u), l = Math.hypot(I[0] - O[0], I[1] - O[1]); return { u, O, I, l, nd: l > 0.01 ? (I[0] - O[0]) / l : 0, nt: l > 0.01 ? (I[1] - O[1]) / l : 0 }; };
  let J = 0; const R = us.map(rib); for (const q of R) J = Math.max(J, Math.ceil(q.l / rw));
  const Q = (q, x, y) => P(q.O[0] + q.nd * x, s * (q.O[1] + q.nt * x), y), Gq = (q, x) => G(q.O[0] + q.nd * x, s * (q.O[1] + q.nt * x));
  // level rows: tread k is flat at YR - k risers on every rib, so the rows are true contour rings. Each rib's ground is close to a straight
  // rake (fitted per rib); a row's edges are where that rake crosses its level, so rows follow the bowl's contours, start where the ground
  // reaches them below the rim and end where they meet the foot line. One riser per ring, from the median rake.
  const med = (a) => { const b2 = a.slice().sort((p, q) => p - q); return b2[b2.length >> 1]; };
  let off = 0; for (const q of R) { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (let x = 0; x <= q.l + 0.01; x += 1) { const g = Gq(q, x); n++; sx += x; sy += g; sxx += x * x; sxy += x * g; }
    q.kk = Math.min(-0.05, n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : -0.05); q.a = (sy - q.kk * sx) / n; for (let x = 0; x <= q.l + 0.01; x += 1) off = Math.max(off, Math.min(0.6, Gq(q, x) - q.a - q.kk * x)); }
  const YR = Math.max(...R.map((q) => q.a)), H = rw * med(R.map((q) => -q.kk)); J = Math.ceil((YR - Math.min(...R.map((q) => q.a + q.kk * q.l))) / H) + 1;
  for (const q of R) {
    const c = q.c = new Float32Array(J + 1), y = q.y = new Float32Array(J); for (let k = 0; k <= J; k++) c[k] = clamp((q.a - (YR - k * H)) / -q.kk, 0, q.l);
    for (let k = 0; k < J; k++) y[k] = YR - k * H + off + lift;
    q.kt = 0; while (q.kt < J - 1 && c[q.kt + 1] - c[q.kt] < 0.01) q.kt++; q.kl = q.kt; while (q.kl < J - 1 && c[q.kl + 2] - c[q.kl + 1] > 0.01) q.kl++;
    const ft = S.w && q.I[0] >= S.w[0][0] ? Math.min(q.I[1], ptT(S.w, q.I[0])) : q.I[1]; q.F = [q.I[0], ft < q.I[1] - 0.5 ? ft - 1 : ft]; // the wall stands at the foot of the outrun wall (w), the rows begin at its top (i)
    q.gf = G(q.I[0], s * (ft - 1.5)) - 0.6; q.gw = Gq(q, -ww) - 0.5; q.yw = q.a + off + lift;
  }
  W.bowlRiser = (W.bowlRiser || []).concat([[+YR.toFixed(2), +H.toFixed(3)]]); // top level and riser per ring (for tests)
  b.at(0, 0, 0);
  const wv = (q) => [F[2] * q.nd - F[3] * s * q.nt, F[3] * q.nd + F[2] * s * q.nt]; // the rib's inward direction in the world
  for (let m = 0; m + 1 < R.length; m++) {
    const A = R[m], B = R[m + 1], aisle = isA((A.u + B.u) / 2), na = wv(A), nb = wv(B), nx = na[0] + nb[0], nz = na[1] + nb[1], nl = Math.hypot(nx, nz) || 1, fx = nx / nl, fz = nz / nl;
    for (let k = 0; k < J; k++) {
      const ea = A.c[k + 1] - A.c[k] > 0.01, eb = B.c[k + 1] - B.c[k] > 0.01; if (!ea && !eb) continue;
      b.set(aisle ? AISLE : SNOWC, aisle ? MAT.stone : MAT.snow); nq(b, Q(A, A.c[k], A.y[k]), Q(A, A.c[k + 1], A.y[k]), Q(B, B.c[k + 1], B.y[k]), Q(B, B.c[k], B.y[k]), 0, 1, 0); // aisles are cleared concrete stairs
      if (k + 1 >= J) continue; const fa = A.c[k + 2] - A.c[k + 1] > 0.01, fb = B.c[k + 2] - B.c[k + 1] > 0.01; if (!fa && !fb) continue; // riser down to the next row
      b.set(aisle ? AISLE : BRISE, MAT.stone); nq(b, Q(A, A.c[k + 1], fa ? A.y[k + 1] - 0.05 : A.y[k]), Q(B, B.c[k + 1], fb ? B.y[k + 1] - 0.05 : B.y[k]), Q(B, B.c[k + 1], B.y[k]), Q(A, A.c[k + 1], A.y[k]), fx, 0, fz);
    }
    const FA = (y) => P(A.F[0], s * A.F[1], y), FB = (y) => P(B.F[0], s * B.F[1], y); // front wall at the foot, a coping from it to the first row, hand rail
    b.set(CONC, MAT.stone); nq(b, FA(A.gf), FB(B.gf), FB(B.y[B.kl]), FA(A.y[A.kl]), fx, 0, fz);
    b.set(SNOWC, MAT.snow); nq(b, FA(A.y[A.kl]), FB(B.y[B.kl]), Q(B, B.l, B.y[B.kl]), Q(A, A.l, A.y[A.kl]), 0, 1, 0);
    b.set(DARK, MAT.metal); nq(b, FA(A.y[A.kl] + 0.94), FB(B.y[B.kl] + 0.94), FB(B.y[B.kl] + 1.02), FA(A.y[A.kl] + 1.02), fx, 0, fz);
    if (ww) { // rim walkway, its outer wall and railing
      b.set(SNOWC, MAT.snow); nq(b, Q(A, -ww, A.yw), Q(A, 0, A.yw), Q(B, 0, B.yw), Q(B, -ww, B.yw), 0, 1, 0);
      b.set(BRISE, MAT.stone); nq(b, Q(A, 0, A.yw - 0.05), Q(B, 0, B.yw - 0.05), Q(B, 0, B.y[B.kt]), Q(A, 0, A.y[A.kt]), fx, 0, fz); // up to the top row
      b.set(CONC, MAT.stone); nq(b, Q(A, -ww, A.gw), Q(B, -ww, B.gw), Q(B, -ww, B.yw), Q(A, -ww, A.yw), -fx, 0, -fz);
      b.set(DARK, MAT.metal); nq(b, Q(A, -ww, A.yw + 0.98), Q(B, -ww, B.yw + 0.98), Q(B, -ww, B.yw + 1.06), Q(A, -ww, A.yw + 1.06), -fx, 0, -fz);
    }
  }
  { const E = R[0], E1 = R[1], o = P(E.O[0], s * E.O[1], 0), o1 = P(E1.O[0], s * E1.O[1], 0), el = Math.hypot(o[0] - o1[0], o[2] - o1[2]) || 1, ex = (o[0] - o1[0]) / el, ez = (o[2] - o1[2]) / el; // the oblique upper end: stepped profile down to the ground
    b.set(CONC, MAT.stone); for (let k = 0; k < J; k++) { if (E.c[k + 1] - E.c[k] < 0.01) continue; const bot = Math.min(Gq(E, E.c[k]), Gq(E, E.c[k + 1])) - 0.6; nq(b, Q(E, E.c[k], bot), Q(E, E.c[k + 1], bot), Q(E, E.c[k + 1], E.y[k]), Q(E, E.c[k], E.y[k]), ex, 0, ez); }
    if (ww) nq(b, Q(E, -ww, E.gw), Q(E, 0, E.gw), Q(E, 0, E.yw), Q(E, -ww, E.yw), ex, 0, ez); }
  // solid circles from the outer edge of the walkway to the foot of the outrun wall
  for (let u = 0; u <= 1.0001;) { const q = rib(Math.min(u, 1)), e = S.w && q.I[0] >= S.w[0][0] ? Math.max(0, q.I[1] - ptT(S.w, q.I[0])) : 0, rr = (q.l + ww + e) / 2, p = Q(q, (q.l + e - ww) / 2, 0); if (rr > 0.6) W.colliders.push(p[0], p[2], rr); u += Math.max(2.5, rr * 0.55) / Lo; }
  W.bowlStat = W.bowlStat || [0, 0]; W.bowlStat[0] += (b.i.length - i0) / 3; W.bowlStat[1] += (W.colliders.length - c0) / 3; // triangles, circles (for tests)
}
function stand(b, W, S) {
  if (S.bowl) return bowl(b, W, S);
  if (S.x) return standX(b, W, S);
  const X = arenaXf(W, S.f), { P, G } = X, r = S.r, d0 = r[0][0], d1 = r[r.length - 1][0], sg = Math.sign(r[0][2] - r[0][1]), lift = S.lift || 0.25, AI = S.ai || 30;
  const ds = []; { const n = Math.ceil((d1 - d0) / (S.seg || 8)); for (let i = 0; i <= n; i++) ds.push(d0 + (d1 - d0) * i / n); for (let a = d0 + AI; a < d1 - 8; a += AI) ds.push(a - 0.7, a + 0.7); ds.sort((p, q) => p - q); }
  const isA = (d) => { for (let a = d0 + AI; a < d1 - 8; a += AI) if (Math.abs(d - a) < 0.71) return true; return false; };
  let J = S.n; if (!J) { let w = 0; for (const q of r) w = Math.max(w, Math.abs(q[2] - q[1])); J = Math.ceil(w / S.rw - 0.3); }
  const R = ds.map((d) => { // per rib: row edges c[0..J] (signed t) and tread heights y[0..J-1] at the highest ground under each row + lift
    const [tf, tb] = standAt(r, d), w = Math.abs(tb - tf), c = new Float32Array(J + 1), y = new Float32Array(J);
    for (let k = 0; k <= J; k++) c[k] = tf + sg * (S.n ? w * k / J : Math.min(k * S.rw, w)); c[J] = tb;
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (let s = 0; s <= w + 0.01; s += 1) { const g = G(d, tf + sg * s); n++; sx += s; sy += g; sxx += s * s; sxy += s * g; }
    const kk = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : 0, a0 = (sy - kk * sx) / n; let off = 0; // even steps on the rib's straight rake, raised to clear the ground
    for (let s = 0; s <= w + 0.01; s += 1) off = Math.max(off, G(d, tf + sg * s) - a0 - kk * s);
    for (let k = 0; k < J; k++) y[k] = a0 + kk * Math.abs(c[k + 1] - tf) + off + lift;
    let jf = 0; while (jf < J - 1 && Math.abs(c[jf + 1] - c[jf]) < 0.01) jf++; let jl = J - 1; while (jl > jf && Math.abs(c[jl + 1] - c[jl]) < 0.01) jl--;
    return { d, tf, tb, c, y, jf, jl, gf: Math.min(G(d, tf - sg * 2.5), G(d, tf)) - 0.6, gb: G(d, tb) - 0.5 };
  });
  b.at(0, 0, 0);
  const fx = -sg * X.rx, fz = -sg * X.rz; // horizontal normal facing the front
  for (let k = 0; k + 1 < R.length; k++) {
    const A = R[k], B = R[k + 1], aisle = isA((A.d + B.d) / 2);
    for (let j = 0; j < J; j++) {
      const wa = Math.abs(A.c[j + 1] - A.c[j]), wb = Math.abs(B.c[j + 1] - B.c[j]); if (wa < 0.01 && wb < 0.01) continue;
      b.set(SNOWC, MAT.snow); nq(b, P(A.d, A.c[j], A.y[j]), P(A.d, A.c[j + 1], A.y[j]), P(B.d, B.c[j + 1], B.y[j]), P(B.d, B.c[j], B.y[j]), 0, 1, 0);
      if (j <= A.jf && j <= B.jf) continue; // the front wall covers the first riser
      b.set(aisle ? AISLE : S.seat ? SEAT : CONC, aisle ? MAT.stone : S.seat ? MAT.paint : MAT.stone);
      const ya = j > A.jf ? A.y[j - 1] - 0.05 : A.gf, yb = j > B.jf ? B.y[j - 1] - 0.05 : B.gf;
      nq(b, P(A.d, A.c[j], ya), P(B.d, B.c[j], yb), P(B.d, B.c[j], B.y[j]), P(A.d, A.c[j], A.y[j]), fx, 0, fz);
    }
    b.set(CONC, MAT.stone); // front wall, back wall
    nq(b, P(A.d, A.tf, A.gf), P(B.d, B.tf, B.gf), P(B.d, B.tf, B.y[B.jf]), P(A.d, A.tf, A.y[A.jf]), fx, 0, fz);
    nq(b, P(A.d, A.tb, A.gb), P(B.d, B.tb, B.gb), P(B.d, B.tb, B.y[B.jl] + 0.15), P(A.d, A.tb, A.y[A.jl] + 0.15), -fx, 0, -fz);
    b.set(DARK, MAT.metal); // hand rails (a thin strip each)
    nq(b, P(A.d, A.tb, A.y[A.jl] + 0.98), P(B.d, B.tb, B.y[B.jl] + 0.98), P(B.d, B.tb, B.y[B.jl] + 1.06), P(A.d, A.tb, A.y[A.jl] + 1.06), fx, 0, fz);
    if (S.lift > 1 || S.n) nq(b, P(A.d, A.tf, A.y[A.jf] + 0.94), P(B.d, B.tf, B.y[B.jf] + 0.94), P(B.d, B.tf, B.y[B.jf] + 1.02), P(A.d, A.tf, A.y[A.jf] + 1.02), fx, 0, fz);
  }
  for (const E of [R[0], R[R.length - 1]]) { // end caps: the stepped profile down to the ground
    b.set(CONC, MAT.stone); const s = E === R[0] ? -1 : 1;
    for (let j = E.jf; j <= E.jl; j++) { const bot = Math.min(G(E.d, E.c[j]), G(E.d, E.c[j + 1]), E.gf + 0.6) - 0.6;
      nq(b, P(E.d, E.c[j], bot), P(E.d, E.c[j + 1], bot), P(E.d, E.c[j + 1], E.y[j]), P(E.d, E.c[j], E.y[j]), s * X.F[2], 0, s * X.F[3]); }
  }
  if (S.ads !== undefined) for (let i = 0; d0 + i * 6 < d1; i++) { // banner boards along the foot of the stand
    const da = d0 + i * 6, db = Math.min(d1, da + 5.8), ga = G(da, S.ads), gb = G(db, S.ads); b.set(ADC[i % ADC.length], MAT.paint);
    nq(b, P(da, S.ads, ga - 0.3), P(db, S.ads, gb - 0.3), P(db, S.ads, gb + 0.95), P(da, S.ads, ga + 0.95), fx, 0, fz);
    b.set(DARK, MAT.paint); nq(b, P(da, S.ads + sg * 0.12, ga - 0.3), P(db, S.ads + sg * 0.12, gb - 0.3), P(db, S.ads + sg * 0.12, gb + 0.95), P(da, S.ads + sg * 0.12, ga + 0.95), -fx, 0, -fz);
  }
  for (let d = d0; d <= d1 + 0.01;) { const q = standAt(r, Math.min(d, d1)), rr = Math.abs(q[1] - q[0]) / 2, p = P(Math.min(d, d1), (q[0] + q[1]) / 2, 0); // solid: circles along the middle
    if (rr > 0.5) W.colliders.push(p[0], p[2], rr); d += Math.max(2.5, rr * 0.55); }
}
const ADC = [[0.55, 0.06, 0.05], [0.85, 0.85, 0.82], [0.08, 0.15, 0.4], [0.85, 0.85, 0.82], [0.75, 0.55, 0.05]];
function standBox(b, W, B) { // stand buildings (commentator boxes, judges' tower) and roofs on posts
  const X = arenaXf(W, B.f), { P, G, F } = X;
  b.at(F[0], 0, F[1], Math.atan2(-F[3], F[2])); // builder frame: local x = d, local z = t
  for (const [d0, d1, t0, t1, top, kind] of B.b) {
    const g = Math.min(G(d0, t0), G(d1, t0), G(d0, t1), G(d1, t1)) - 1, wf = Math.abs(t1) < Math.abs(t0) ? t1 : t0, s = wf === t1 ? 1 : -1;
    if (kind === 0) {
      b.set([0.36, 0.37, 0.38], MAT.paint); b.box(d0, g, t0, d1, top - 0.4, t1);
      b.set(SNOWC, MAT.snow); b.box(d0 - 0.3, top - 0.4, t0 - 0.3, d1 + 0.3, top, t1 + 0.3);
      b.set([1, 0.8, 0.5], MAT.window); const yw = top - 2.6; for (let d = d0 + 0.6; d < d1 - 1; d += 3.2) { const z = wf + s * 0.03, Q = [[d, yw, z], [d + 2.6, yw, z], [d + 2.6, yw + 1.5, z], [d, yw + 1.5, z]]; if (s < 0) Q.reverse(); b.quad(...Q); }
      const c = P((d0 + d1) / 2, (t0 + t1) / 2, 0); W.colliders.push(c[0], c[2], Math.min(d1 - d0, Math.abs(t1 - t0)) / 2);
    } else {
      b.set(DARK, MAT.metal); b.box(d0, top - 0.9, t0, d1, top - 0.35, t1);
      b.set(SNOWC, MAT.snow); b.box(d0 - 0.2, top - 0.35, t0 - 0.2, d1 + 0.2, top, t1 + 0.2);
      b.set(STEEL, MAT.metal); for (let d = d0 + 0.5; d <= d1; d += (d1 - d0 - 1) / 2) { const tb = Math.abs(t0) > Math.abs(t1) ? t0 + 0.4 : t1 - 0.4; b.cyl(d, G(d, tb) - 0.5, tb, d, top - 0.9, tb, 0.2, 0.2, 6); }
    }
  }
}
function bRange(b, W, A) { // biathlon range: target wall with 30 white plates and black discs at tg, mats and lane boards on the firing line fl
  const X = arenaXf(W, A.f), { P, G, F } = X, L = F[4], s = Math.sign(A.fl - A.tg); // s: from the targets towards the shooters
  b.at(F[0], 0, F[1], Math.atan2(-F[3], F[2]));
  for (let i = 0; i < 10; i++) { const da = i * L / 10, db = da + L / 10, g = G((da + db) / 2, A.tg + s * 2.5); b.set(CONC, MAT.stone); b.box(da, g - 1, A.tg - 0.6, db, g + 1.25, A.tg + 0.6); b.set(SNOWC, MAT.snow); b.box(da - 0.02, g + 1.25, A.tg - 0.7, db + 0.02, g + 1.45, A.tg + 0.7); const c = P((da + db) / 2, A.tg, 0); W.colliders.push(c[0], c[2], 1.6); }
  for (let i = 0; i < A.n; i++) {
    const d = (i + 0.5) * L / A.n, g = G(d, A.tg + s * 2.5), z = A.tg + s * 0.62, gf = G(d, A.fl), zb = A.fl - s * 0.15;
    b.set(WHITE, MAT.paint); nq(b, [d - 1.05, g + 0.55, z], [d + 1.05, g + 0.55, z], [d + 1.05, g + 1.15, z], [d - 1.05, g + 1.15, z], 0, 0, s);
    b.set(DARK, MAT.void); for (let k = 0; k < 5; k++) { const x = d - 0.8 + k * 0.4, zz = z + s * 0.02; nq(b, [x - 0.1, g + 0.75, zz], [x + 0.1, g + 0.75, zz], [x + 0.1, g + 0.95, zz], [x - 0.1, g + 0.95, zz], 0, 0, s); }
    b.set([0.12, 0.13, 0.14], MAT.rubber); nq(b, [d - 0.75, gf + 0.12, A.fl - s * 0.2], [d + 0.75, gf + 0.12, A.fl - s * 0.2], [d + 0.75, gf + 0.12, A.fl + s * 2.2], [d - 0.75, gf + 0.12, A.fl + s * 2.2], 0, 1, 0);
    b.set(i % 2 ? [0.75, 0.6, 0.06] : WHITE, MAT.sign); nq(b, [d - 0.3, gf - 0.2, zb], [d + 0.3, gf - 0.2, zb], [d + 0.3, gf + 0.9, zb], [d - 0.3, gf + 0.9, zb], 0, 0, s);
  }
  for (let i = 0; i <= 4; i++) { const d = i * L / 4, t = (A.tg + A.fl) / 2, g = G(d, t); b.set(WHITE, MAT.paint); b.cyl(d, g - 0.5, t, d, g + 4.5, t, 0.05, 0.04, 5); b.set(i % 2 ? [0.8, 0.1, 0.05] : [0.85, 0.75, 0.1], MAT.flag); b.quad([d, g + 4.4, t], [d + 1.2, g + 4.3, t + 0.3], [d + 1.2, g + 3.7, t + 0.3], [d, g + 3.8, t], [0, 0, 1, 0, 1, 1, 0, 1]); }
}
function finish(b, W, A) { // finish gantry across the stadium floor
  const X = arenaXf(W, A.f), { P, G, F } = X, ga = G(A.d, A.t0), gb = G(A.d, A.t1), top = Math.max(ga, gb) + 6;
  b.at(F[0], 0, F[1], Math.atan2(-F[3], F[2]));
  b.set([0.8, 0.08, 0.06], MAT.paint); b.box(A.d - 0.5, ga - 0.5, A.t0 - 0.5, A.d + 0.5, top, A.t0 + 0.5); b.box(A.d - 0.5, gb - 0.5, A.t1 - 0.5, A.d + 0.5, top, A.t1 + 0.5);
  b.box(A.d - 0.4, top - 1.4, A.t0, A.d + 0.4, top, A.t1); b.set(WHITE, MAT.paint); for (const s of [-1, 1]) b.box(A.d + s * 0.42 - 0.01, top - 1.0, (A.t0 + A.t1) / 2 - 3, A.d + s * 0.42 + 0.01, top - 0.4, (A.t0 + A.t1) / 2 + 3);
  b.set(SNOWC, MAT.snow); b.box(A.d - 0.45, top, A.t0 - 0.5, A.d + 0.45, top + 0.18, A.t1 + 0.5);
  for (const t of [A.t0, A.t1]) { const c = P(A.d, t, 0); W.colliders.push(c[0], c[2], 0.9); }
}
function mast(b, W, M, A) { // floodlight mast, the lamp head turned towards the nearest jump axis
  const [x, z, h] = M, y = W.heightAt(x, z) - 0.5, a = mastAim(x, z), yaw = Math.atan2(a[0] - x, a[1] - z);
  b.at(x, y, z, yaw); // local +z faces the arena
  W.glows.push(x + Math.sin(yaw) * 0.4, y + h + 0.6, z + Math.cos(yaw) * 0.4);
  b.set([0.55, 0.56, 0.58], MAT.metal); b.cyl(0, 0, 0, 0, h + 0.5, 0, 0.42, 0.2, 6); b.box(-1.7, h - 0.4, -0.25, 1.7, h + 1.6, 0.05);
  b.set([1, 0.92, 0.75], MAT.lamp); for (let q = 0; q < 3; q++) for (let p = 0; p < 2; p++) { const x0 = -1.5 + q * 1.05, y0 = h - 0.2 + p * 0.9; b.quad([x0, y0, 0.07], [x0 + 0.85, y0, 0.07], [x0 + 0.85, y0 + 0.7, 0.07], [x0, y0 + 0.7, 0.07]); }
  W.colliders.push(x, z, 0.8);
}
function arena(b, W, A) {
  W.glows = []; // floodlight heads (x, y, z), drawn as night glows in main.js
  const i0 = b.i.length, c0 = W.colliders.length;
  for (const S of A.stands) stand(b, W, S);
  for (const B of A.boxes) standBox(b, W, B);
  bRange(b, W, A.range); finish(b, W, A.finish);
  for (const M of A.mast) mast(b, W, M, A);
  W.arenaStat = { tris: (b.i.length - i0) / 3, circles: (W.colliders.length - c0) / 3 }; // for tests (props mesh triangles, solid circles)
}
export function buildProps(W) {
  const b = new MB();
  W.colliders = []; W.bld = []; // circle colliders (x, z, r); building records with their solid boxes (see buildings.js)
  const PLAY = W.PLAY;
  if (W.name === 'fantasy') { cabin(b, W.cabin, W); bridge(b, W.bridge); dam(b, W.dam); }
  else { lodge(b, W.cabin, W); W.buildings.forEach((B, i) => house(b, B, i, W)); skiJump(b, W, W.lm.jump); skiJump(b, W, W.lm.mid); arena(b, W, W.lm.arena); tvTower(b, W, W.lm.tower); skiLift(b, W, W.lm.lift); chapel(b, W, W.lm.chapel); W.portals.forEach((p) => portal(b, W, p)); }
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
