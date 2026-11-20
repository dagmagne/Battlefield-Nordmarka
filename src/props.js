// Static set pieces merged into one mesh: cabin, bridge, dam, power line, lamp posts, signs, boulders.
import { MB, MAT, VS } from './mesh.js';
import { poly, extX } from './vehutil.js';
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

// ---------- functional bridges (src/bridges.js): the deck slab, parapets, abutments, portal faces and wing walls, drawn from the same boxes the game collides with ----------
// obox: a box |l| in [l0, l1], m in [m0, m1] round (cx, cz) with axis (ax, az), bottom yb / top yt sheared by gl along l and gm along m (faces as in MB.box)
function obox(b, cx, cz, ax, az, l0, l1, m0, m1, yb, yt, gl, gm) {
  const P = (l, m, y) => [cx + ax * l - az * m, y + gl * l + gm * m, cz + az * l + ax * m];
  const a = P(l0, m0, yb), c1 = P(l1, m0, yb), c = P(l1, m1, yb), d = P(l0, m1, yb), e = P(l0, m0, yt), f = P(l1, m0, yt), g = P(l1, m1, yt), h = P(l0, m1, yt), sx = l1 - l0, sy = yt - yb, sz = m1 - m0;
  b.quad(e, h, g, f, [0, 0, 0, sz, sx, sz, sx, 0]); b.quad(a, c1, c, d, [0, 0, sx, 0, sx, sz, 0, sz]);
  b.quad(d, c, g, h, [0, 0, sx, 0, sx, sy, 0, sy]); b.quad(c1, a, e, f, [0, 0, sx, 0, sx, sy, 0, sy]);
  b.quad(a, d, h, e, [0, 0, sz, 0, sz, sy, 0, sy]); b.quad(c, c1, f, g, [0, 0, sz, 0, sz, sy, 0, sy]);
}
const BCON = [0.28, 0.28, 0.272], BDARK = [0.16, 0.16, 0.16], BFAS = [0.34, 0.34, 0.33]; // MAT.concrete: no sight fade (the soffit and walls sit right over a commander camera under the deck)
function overpass(b, W, i) {
  const BR = W.br, B = BR.list[i], D = BR.DK, o = i * 10, cx = D[o], cz = D[o + 1], ux = D[o + 2], uz = D[o + 3], hl = D[o + 4], hw = D[o + 5], y0 = D[o + 6], gu = D[o + 7], gv = D[o + 8], th = D[o + 9], [ta, tb] = B.tr;
  b.at(0, 0, 0);
  b.set(BDARK, MAT.concrete); obox(b, cx, cz, ux, uz, -hl, hl, -hw + 0.2, hw - 0.2, y0 - th, y0 - 0.02, gu, gv); // the slab: a dark soffit seen from the road
  for (const s of [-1, 1]) { b.set(BFAS, MAT.concrete); obox(b, cx, cz, ux, uz, -hl, hl, s < 0 ? -hw : hw - 0.2, s < 0 ? -hw + 0.2 : hw, y0 - th - 0.12, y0 + 0.06, gu, gv); } // fascia beams along both faces, a little deeper than the slab
  for (let v = -hw + 2.2; v < hw - 1.5; v += 2.6) { b.set(BDARK, MAT.concrete); obox(b, cx, cz, ux, uz, ta - 0.9, tb + 0.9, v - 0.22, v + 0.22, y0 - th - 0.32, y0 - th + 0.01, gu, gv); } // ribs under the soffit across the span
  const K = B.k || 0, sb = K === 1 ? y0 - 0.45 : y0 - 0.3, st = K === 1 ? y0 : y0 + 0.13; // the deck surface: snow (k 0), packed snow round the metro's ballast up to 5 cm under its top (k 1), a plowed road with snow beside it (k 2)
  if (K === 2 && B.rw) { const r0 = Math.max(-hw + 0.35, B.rv - B.rw), r1 = Math.min(hw - 0.35, B.rv + B.rw); b.set([0.3, 0.31, 0.33], MAT.paint); obox(b, cx, cz, ux, uz, -hl - 0.6, hl + 0.6, r0, r1, y0 - 0.3, y0 + 0.02, gu, gv);
    b.set(SNOWC, MAT.snow); if (r0 > -hw + 0.6) obox(b, cx, cz, ux, uz, -hl - 1.2, hl + 1.2, -hw + 0.35, r0, sb, y0 + 0.22, gu, gv); if (r1 < hw - 0.6) obox(b, cx, cz, ux, uz, -hl - 1.2, hl + 1.2, r1, hw - 0.35, sb, y0 + 0.22, gu, gv); }
  else { b.set(SNOWC, MAT.snow); obox(b, cx, cz, ux, uz, -hl, hl, -hw + 0.35, hw - 0.35, sb, st, gu, gv);
    for (const e of [-1, 1]) obox(b, cx + ux * e * hl, cz + uz * e * hl, ux, uz, e < 0 ? -1.6 : 0, e < 0 ? 0 : 1.6, -hw + 0.35, hw - 0.35, y0 + gu * e * hl - 0.6, y0 + gu * e * hl + (st - y0), gu - e * 0.28, gv); } // a wedge at each end that runs down into the earth's snow (no scalloped edge where the ramp's soft snow meets the deck)
  for (let k = 0; k < BR.nw; k++) { if (BR.WB[k] !== i) continue; const q = k * 9, W_ = BR.WL, K = BR.WK[k], ax = W_[q + 2], az = W_[q + 3], l = W_[q + 4], m = W_[q + 5], yb = W_[q + 6], yt = W_[q + 7], g = W_[q + 8];
    if (K === 4) { const yB = yb + 1 + B.clr - 0.55; for (let v = -l, n = 0; v < l - 0.01; v += 0.6, n++) { b.set(n & 1 ? [0.06, 0.06, 0.06] : [0.85, 0.65, 0.05], MAT.paint); obox(b, W_[q], W_[q + 1], ax, az, v, Math.min(l, v + 0.6), -0.12, 0.12, yB, yB + 0.35, g, 0); } // height barrier: a striped beam on two posts
      b.set([0.35, 0.36, 0.38], MAT.metal); for (const e of [-l, l]) obox(b, W_[q], W_[q + 1], ax, az, e - 0.12, e + 0.12, -0.12, 0.12, yb + 0.5, yB + 0.35, g, 0); continue; }
    b.set(K === 0 ? [0.25, 0.25, 0.245] : BCON, MAT.concrete); obox(b, W_[q], W_[q + 1], ax, az, -l, l, -m, m, yb, yt - (K === 1 ? 0.05 : 0), g, 0);
    if (K === 2 || K === 3) { b.set(SNOWC, MAT.snow); obox(b, W_[q], W_[q + 1], ax, az, -l, l, -m - 0.04, m + 0.04, yt, yt + 0.12, g, 0); } // snow caps
    if (K === 0) for (let v = -l + 4; v < l - 2; v += 9) { b.set([1, 0.86, 0.62], MAT.lamp); const s = Math.sign((W_[q] - cx) * ux + (W_[q + 1] - cz) * uz - (ta + tb) / 2) || 1, lu0 = s * (m + 0.03);
      obox(b, W_[q], W_[q + 1], ax, az, v - 0.5, v + 0.5, lu0 - 0.05, lu0 + 0.05, yt - 1.05, yt - 0.85, g, 0); } } // tunnel lights on the abutment faces
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
// ---- Holmenkollbanen (world.js railWorld, tools/geo/rail.py): bed, rails, third rail, platforms, shelters, lamps, signs, buffer stops, parked MX3000 units ----
const RUST = [0.15, 0.1, 0.075], HEADC = [0.55, 0.55, 0.57], TRC = [0.1, 0.1, 0.095], TRT = [0.36, 0.33, 0.22], CONP = [0.46, 0.46, 0.45], PAVE = [0.27, 0.27, 0.28], TBLUE = [0.03, 0.12, 0.42];
const MXW = [0.63, 0.625, 0.605], MXB = [0.025, 0.027, 0.03], STW = [0.14, 0.085, 0.05];
const railAt = (t, s, o) => { s = clamp(s, 0, t.s[t.n - 1]); let a = 0, c = t.n - 1; while (c - a > 1) { const m = (a + c) >> 1; if (t.s[m] > s) c = m; else a = m; } const f = (s - t.s[a]) / (t.s[c] - t.s[a] || 1); o[0] = lerp(t.x[a], t.x[c], f); o[1] = lerp(t.y[a], t.y[c], f); o[2] = lerp(t.z[a], t.z[c], f); return o; };
// extrude cross-section faces (offset and height of both ends, colour, material, optional segment skip test) along the breakpoints K of track t; uv: offset, distance
function railStrip(b, t, K, faces) {
  const n = K.length, rx = new Float32Array(n), rz = new Float32Array(n);
  for (let q = 0; q < n; q++) { const a = K[Math.max(0, q - 1)], c = K[Math.min(n - 1, q + 1)], dx = t.x[c] - t.x[a], dz = t.z[c] - t.z[a], l = Math.hypot(dx, dz) || 1; rx[q] = -dz / l; rz[q] = dx / l; }
  for (const F of faces) {
    const [o0, d0, o1, d1, col, mt, skip] = F, ex = o1 - o0, ey = d1 - d0, el = Math.hypot(ex, ey) || 1, nr = -ey / el, ny = ex / el; b.set(col, mt); let prev = -1;
    for (let q = 0; q < n; q++) { const k = K[q], x = t.x[k], y = t.y[k], z = t.z[k], s = t.s[k];
      const v0 = b.vert(x + rx[q] * o0, y + d0, z + rz[q] * o0, rx[q] * nr, ny, rz[q] * nr, o0, s), v1 = b.vert(x + rx[q] * o1, y + d1, z + rz[q] * o1, rx[q] * nr, ny, rz[q] * nr, o1, s);
      if (prev >= 0 && !(skip && skip(K[q - 1], k))) b.i.push(prev, v0, v1, prev, v1, prev + 1); prev = v0; }
  }
}
// ---- MX3000 car (Siemens / Porsche Design). Local frame: x across, y above the rail head, z along the car; c 0 / 2 = driving car with the cab at -z / +z, 1 = middle car ----
const MXD = [0.15, 0.155, 0.165], MXR = [0.4, 0.41, 0.43], MXL = [0.46, 0.46, 0.45], MXU = [0.11, 0.11, 0.12], MXJ = [0.24, 0.24, 0.25], MXDZ = [-5.5, 0, 5.5];
// half cross-section, sole bar to roof centre: a little tumblehome under the floor, flat sides leaning in 3 degrees from the floor (1.1 m) to the cant rail, a rounded roof
// (the roof points are a spline through the hand-set ones, so the shoulder shades smoothly); points on the side at the heights the window band and the cab screen need
const mxX = (y) => 1.58 - (y - 1.1) * 0.05676; // half width of the side at height y
const MXP = (() => { const S = [[1.5, 0.9], [1.57, 1.0]], R = [[1.58, 1.1], [1.475, 2.95], [1.445, 3.1], [1.38, 3.26], [1.26, 3.4], [1.06, 3.51], [0.76, 3.59], [0.4, 3.635], [0, 3.65], [-0.4, 3.635]];
  for (const y of [1.1, 1.52, 1.565, 1.67, 1.97]) S.push([mxX(y), y]);
  for (let k = 1; k < R.length - 2; k++) { const a = R[k - 1], p = R[k], q = R[k + 1], d = R[k + 2]; S.push(p); if (k > 1) S.push([0, 1].map((i) => (-a[i] + 9 * p[i] + 9 * q[i] - d[i]) / 16)); else S.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); }
  S.push([0, 3.65]); return S; })();
const MXN = MXP.length, MXRING = MXP.concat(MXP.slice(0, -1).reverse().map((p) => [-p[0], p[1]])), mxSeg = (i) => (i < MXN - 1 ? i : 2 * MXN - 3 - i), mxMid = (k) => (MXP[k][1] + MXP[k + 1][1]) / 2;
const mxRoofY = (x) => { x = Math.abs(x); for (let k = MXN - 1; k > 0; k--) if (x <= MXP[k - 1][0]) return lerp(MXP[k][1], MXP[k - 1][1], (x - MXP[k][0]) / (MXP[k - 1][0] - MXP[k][0])); return 3.1; };
// smooth-shaded grid of nj x ni points [x, y, z]; col(j, i) gives [colour, material] per cell (or null); the normals face away from the point c; uv = (point[ux], height)
function mxGrid(b, P, nj, ni, c, col, ux = 2) {
  const N = [];
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const p = P[j * ni + i], a = P[j * ni + Math.max(0, i - 1)], d = P[j * ni + Math.min(ni - 1, i + 1)], e = P[Math.max(0, j - 1) * ni + i], f = P[Math.min(nj - 1, j + 1) * ni + i];
    const ax = d[0] - a[0], ay = d[1] - a[1], az = d[2] - a[2], bx = f[0] - e[0], by = f[1] - e[1], bz = f[2] - e[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) { nx = p[0] - c[0]; ny = p[1] - c[1]; nz = p[2] - c[2]; l = Math.hypot(nx, ny, nz) || 1; }
    if (nx * (p[0] - c[0]) + ny * (p[1] - c[1]) + nz * (p[2] - c[2]) < 0) l = -l;
    N.push([nx / l, ny / l, nz / l]);
  }
  for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) {
    const k = col(j, i); if (!k) continue; b.set(k[0], k[1]);
    const q = [j * ni + i, j * ni + i + 1, (j + 1) * ni + i + 1, (j + 1) * ni + i], v = q.map((o) => b.vert(P[o][0], P[o][1], P[o][2], N[o][0], N[o][1], N[o][2], P[o][ux], P[o][1]));
    const p0 = P[q[0]], p1 = P[q[1]], p2 = P[q[2]], p3 = P[q[3]], ux2 = p2[0] - p0[0], uy = p2[1] - p0[1], uz = p2[2] - p0[2], vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
    const g = (uy * vz - uz * vy) * (N[q[0]][0] + N[q[2]][0]) + (uz * vx - ux2 * vz) * (N[q[0]][1] + N[q[2]][1]) + (ux2 * vy - uy * vx) * (N[q[0]][2] + N[q[2]][2]);
    if (g >= 0) b.i.push(v[0], v[1], v[2], v[0], v[2], v[3]); else b.i.push(v[0], v[2], v[1], v[0], v[3], v[2]);
  }
}
// a flat quad whose normal faces away from c
function mxQ(b, p0, p1, p2, p3, c, uv) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
  if ((uy * vz - uz * vy) * (p0[0] - c[0]) + (uz * vx - ux * vz) * (p0[1] - c[1]) + (ux * vy - uy * vx) * (p0[2] - c[2]) >= 0) b.quad(p0, p1, p2, p3, uv); else b.quad(p1, p0, p3, p2, uv && [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]]);
}
// a panel lying on the car side s between z0..z1 and y0..y1, off metres proud of the skin; uf: glazing uv (metres along the car * uf, height)
function mxSide(b, s, z0, z1, y0, y1, off, uf) {
  const xa = s * (mxX(y0) + off), xb = s * (mxX(y1) + off), za = Math.min(z0, z1), zb = Math.max(z0, z1);
  mxQ(b, [xa, y0, za], [xa, y0, zb], [xb, y1, zb], [xb, y1, za], [0, y0, za], uf ? [uf * za, y0, uf * zb, y0, uf * zb, y1, uf * za, y1] : undefined);
}
// bands of revolution about an axle along x through (y, z) on side s: prof = [|x|, r] from the inside outwards (a step in r at one x is a flat face)
function mxLathe(b, s, y, z, prof, seg) {
  for (let k = 0; k < prof.length - 1; k++) { const x0 = prof[k][0], r0 = prof[k][1], x1 = prof[k + 1][0], r1 = prof[k + 1][1], dx = x1 - x0, dr = r1 - r0, l = Math.hypot(dx, dr) || 1, na = -dr / l * s, nr = dx / l, base = b.v.length / VS;
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); b.vert(s * x0, y + c * r0, z + sn * r0, na, c * nr, sn * nr); b.vert(s * x1, y + c * r1, z + sn * r1, na, c * nr, sn * nr); }
    for (let i = 0; i < seg; i++) { const q = base + i * 2; if (s > 0) b.i.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); else b.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
}
function mxDisc(b, x, y, z, r, n) { const c = b.vert(x, y, z, 0, 1, 0), q = b.v.length / VS; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; b.vert(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, 1, 0); } for (let i = 0; i < n; i++) b.i.push(c, q + i + 1, q + i); }
function mxBogie(b, zc, seed, shoe) {
  const ST = [0.25, 0.24, 0.235], FR = [0.15, 0.15, 0.16], YL = [0.5, 0.42, 0.06];
  for (const w of [-1, 1]) { const z = zc + w * 1.0;
    b.set([0.1, 0.095, 0.09], MAT.metal); b.cyl(-0.68, 0.42, z, 0.68, 0.42, z, 0.085, 0.085, 6, 0);
    for (const s of [-1, 1]) {
      b.set(ST, MAT.metal); mxLathe(b, s, 0.42, z, [[0.66, 0.455], [0.69, 0.42], [0.8, 0.42], [0.8, 0.355]], 20); // flange lip, tread, rim face
      b.set([0.075, 0.07, 0.07], MAT.stone); mxLathe(b, s, 0.42, z, [[0.8, 0.355], [0.775, 0.16]], 20); // dished web
      b.set([0.2, 0.195, 0.19], MAT.metal); mxLathe(b, s, 0.42, z, [[0.775, 0.16], [0.84, 0.12], [0.84, 0]], 6); // hub
      b.set(FR, MAT.stone); bx2(b, s * 0.93, 0.27, z - 0.17, s * 1.13, 0.58, z + 0.17); b.set([0.3, 0.3, 0.31], MAT.metal); mxLathe(b, s, 0.42, z, [[1.13, 0.1], [1.16, 0.1], [1.16, 0]], 6); // axle box and its cover
      b.set(YL, MAT.metal); b.cyl(s * 1.03, 0.58, z, s * 1.03, 0.73, z, 0.085, 0.085, 6, 0); b.set(FR, MAT.stone); b.cyl(s * 1.03, 0.635, z, s * 1.03, 0.675, z, 0.1, 0.1, 6, 0); // primary spring
      b.cyl(s * 1.14, 0.36, z + w * 0.05, s * 1.14, 0.78, z - w * 0.3, 0.035, 0.03, 5, 0); // damper
    }
  }
  for (const s of [-1, 1]) {
    b.set(FR, MAT.stone); bx2(b, s * 0.94, 0.72, zc - 1.22, s * 1.12, 0.84, zc - 0.62); bx2(b, s * 0.94, 0.72, zc + 0.62, s * 1.12, 0.84, zc + 1.22); bx2(b, s * 0.94, 0.42, zc - 0.36, s * 1.12, 0.56, zc + 0.36); // side frame: high over the axle boxes, dropped in the middle
    for (const w of [-1, 1]) extX(b, [[0.84, zc + w * 0.62], [0.72, zc + w * 0.62], [0.42, zc + w * 0.36], [0.56, zc + w * 0.3]], s * 0.94, s * 1.12);
    b.set([0.035, 0.035, 0.04], MAT.metal); b.cyl(s * 0.98, 0.56, zc, s * 0.98, 0.7, zc, 0.27, 0.25, 10, 0); b.cyl(s * 0.98, 0.7, zc, s * 0.98, 0.9, zc, 0.31, 0.3, 10, 0); // air spring
    if (s !== shoe) continue;
    // third-rail collector on the conductor-rail side: an insulated beam under the frame, an arm, the shoe on the rail
    b.set([0.42, 0.3, 0.12], MAT.wood); bx2(b, s * 1.12, 0.22, zc - 0.42, s * 1.22, 0.42, zc + 0.42);
    b.set([0.16, 0.15, 0.15], MAT.metal); extX(b, [[0.3, zc - 0.07], [0.3, zc + 0.07], [0.15, zc + 0.07], [0.15, zc - 0.07]], s * 1.22, s * 1.4); bx2(b, s * 1.38, 0.085, zc - 0.2, s * 1.54, 0.15, zc + 0.2);
  }
  b.set(MXU, MAT.stone); b.box(-0.9, 0.5, zc - 0.2, 0.9, 0.72, zc + 0.2); for (const w of [-1, 1]) b.box(-0.55, 0.2, zc + w * 0.72 - 0.3, 0.45, 0.66, zc + w * 0.72 + 0.3); // bolster and motors
  b.set(SNOWC, MAT.snow); for (let k = 0; k < 2; k++) { const s = hash1(seed + k * 7) > 0.5 ? 1 : -1, z = zc + (k ? 0.92 : -0.92); b.blob(s * 1.03, 0.85, z, 0.1, 0.04, 0.26, seed + k, 0.2, 5); } // snow lying on the frame ends
}
function mxCar(b, L, c, seed, white, shoe) {
  const h = L / 2, C0 = [0, 1.9, 0], uf = c === 0 ? -1 : 1, WHITE = [MXW, MAT.coach], BLK = [MXB, MAT.paint], DRK = [MXD, MAT.coach];
  const cab = (g) => (c === 0 && g < 0) || (c === 2 && g > 0), zEnd = (g) => g * (h - (cab(g) ? 0.75 : 0.1));
  const tg = (s) => b.set([-s * uf > 0 ? 0 : 1, c === 1 ? 0 : 1, 0], MAT.tglass);
  // ---- shell ----
  { const P = []; for (const g of [-1, 1]) for (const p of MXRING) P.push([p[0], p[1], zEnd(g)]);
    mxGrid(b, P, 2, MXRING.length, C0, (j, i) => { const y = mxMid(mxSeg(i)); return y < 1.0 ? DRK : y > 1.97 && y < 2.95 ? BLK : y < 3.1 ? WHITE : [MXR, MAT.coach]; }); }
  b.set(MXU, MAT.stone); b.box(-1.47, 0.84, -h + 0.7, 1.47, 0.95, h - 0.7); // floor pan
  // ---- sides: windows, panel joints, doors ----
  for (const s of [-1, 1]) {
    const spans = [[MXDZ[0] + 0.8, MXDZ[1] - 0.8], [MXDZ[1] + 0.8, MXDZ[2] - 0.8]], J = [];
    for (const g of [-1, 1]) if (!cab(g)) spans.push(g < 0 ? [-h + 0.45, MXDZ[0] - 0.8] : [MXDZ[2] + 0.8, h - 0.45]);
    for (const [za, zb] of spans) { const np = Math.ceil((zb - za) / 2.45), w = (zb - za + 0.07) / np;
      for (let k = 0; k < np; k++) { const z0 = za + k * w, z1 = z0 + w - 0.07; tg(s); mxSide(b, s, z0, z1, 2.03, 2.89, 0.006, uf); if (k) J.push(z0 - 0.035);
        b.set([0.05, 0.05, 0.055], MAT.paint); mxSide(b, s, z0 + 0.05, z1 - 0.05, 2.615, 2.63, 0.009); } } // the hopper vent's frame line
    b.set(MXJ, MAT.coach); for (const z of J) mxSide(b, s, z - 0.006, z + 0.006, 1.1, 1.97, 0.003); // panel joints under the window pillars
    for (const g of [-1, 1]) if (!cab(g)) mxSide(b, s, g * (h - 0.33), g * (h - 0.318), 1.1, 1.97, 0.003);
    for (const dz of MXDZ) { // flush plug doors: two leaves in a 1.5 cm seam, planar glass, a header strip and a sill 3 cm proud
      b.set(MXJ, MAT.coach); mxSide(b, s, dz - 0.735, dz + 0.735, 1.085, 3.02, 0.003);
      for (const w of [-1, 1]) {
        b.set(MXL, MAT.coach); mxSide(b, s, dz + w * 0.0075, dz + w * 0.72, 1.1, 3.005, 0.007);
        b.set([0.03, 0.03, 0.034], MAT.paint); mxSide(b, s, dz + w * 0.11, dz + w * 0.62, 1.48, 2.89, 0.0095); tg(s); mxSide(b, s, dz + w * 0.13, dz + w * 0.6, 1.5, 2.87, 0.012, uf);
        b.set([0.3, 0.31, 0.32], MAT.metal); mxSide(b, s, dz + w * 0.04, dz + w * 0.1, 1.29, 1.41, 0.011); b.set([0.08, 0.5, 0.16], MAT.head); mxSide(b, s, dz + w * 0.052, dz + w * 0.088, 1.33, 1.37, 0.014); // door button
      }
      b.set([0.3, 0.31, 0.33], MAT.coach); mxSide(b, s, dz - 0.8, dz + 0.8, 3.02, 3.055, 0.004); // header
      b.set([0.75, 0.3, 0.03], MAT.head); mxSide(b, s, dz - 0.04, dz + 0.04, 3.027, 3.048, 0.007); // door-open lamp
      b.set([0.8, 0.62, 0.05], MAT.coach); bx2(b, s * 1.57, 1.062, dz - 0.72, s * 1.608, 1.099, dz + 0.72); // sill
    }
    for (const g of [-1, 1]) if (cab(g)) {
      b.set([0, 0, 1], MAT.tglass); mxSide(b, s, g * (h - 1.72), g * (h - 0.8), 2.03, 2.89, 0.006, 1); // cab side window
      b.set(MXJ, MAT.coach); mxSide(b, s, g * (h - 2.395), g * (h - 1.785), 1.085, 3.02, 0.003);
      b.set(MXW, MAT.coach); mxSide(b, s, g * (h - 2.38), g * (h - 1.8), 1.1, 3.005, 0.007); b.set([0.03, 0.03, 0.034], MAT.paint); mxSide(b, s, g * (h - 2.31), g * (h - 1.87), 2.01, 2.88, 0.0095);
      b.set([0, 0, 1], MAT.tglass); mxSide(b, s, g * (h - 2.29), g * (h - 1.89), 2.03, 2.86, 0.012, 1);
      b.set([0.3, 0.31, 0.32], MAT.metal); bx2(b, s * (mxX(1.7) + 0.005), 1.6, g * (h - 2.31), s * (mxX(1.7) + 0.03), 1.78, g * (h - 2.27)); bx2(b, s * 1.5, 0.78, g * (h - 2.38), s * 1.6, 0.84, g * (h - 1.8)); // handle and step
      // T roundel under the cab window
      const zt = g * (h - 1.25), xr = mxX(1.5); b.set(TBLUE, MAT.coach); mxLathe(b, s, 1.5, zt, [[xr - 0.01, 0.18], [xr + 0.008, 0.18], [xr + 0.008, 0]], 24);
      b.set([0.8, 0.8, 0.78], MAT.coach); bx2(b, s * xr, 1.55, zt - 0.1, s * (xr + 0.013), 1.605, zt + 0.1); bx2(b, s * xr, 1.39, zt - 0.03, s * (xr + 0.013), 1.6, zt + 0.03);
    }
  }
  // ---- ends ----
  for (const g of [-1, 1]) {
    if (cab(g)) mxCab(b, h, g, white);
    else { const z0 = zEnd(g);
      b.set(MXD, MAT.coach); poly(b, MXRING.map((p) => [p[0], p[1], z0]), C0);
      // gangway bellows: a dark ribbed sleeve to the middle of the gap, set in 7 cm from the skin, from the floor up
      const R = MXRING.filter((p, i) => p[1] > 1.05 && (p[1] < 3.0 || mxSeg(i) % 2 === 1 || p[0] === 0)).map((p) => { const ny = p[1] > 2.95 ? Math.min(1, (p[1] - 2.95) / 0.5) : 0, l = Math.hypot(1 - ny, ny) || 1; return [p[0] - Math.sign(p[0]) * 0.07 * (1 - ny) / l, p[1] - 0.07 * ny / l]; }), nr = 5, P = [];
      for (let k = 0; k < nr; k++) { const f = k & 1 ? 0.05 : 0; for (const p of R) P.push([p[0] * (1 - f * 0.7), 2.1 + (p[1] - 2.1) * (1 - f * 0.7), z0 + g * k * (0.3 / (nr - 1))]); }
      mxGrid(b, P, nr, R.length, [0, 2.1, z0], () => [[0.08, 0.08, 0.085], MAT.coach]);
      b.set([0.17, 0.17, 0.18], MAT.stone); b.box(-0.12, 0.6, Math.min(z0, g * (h + 0.2)), 0.12, 0.84, Math.max(z0, g * (h + 0.2))); // the bar coupler between the cars
    }
  }
  // ---- roof: a snow blanket with a rounded, drooping edge, air conditioning units and a resistor box under snow caps ----
  { const za = zEnd(-1) + (cab(-1) ? 0.55 : 0.2), zb = zEnd(1) - (cab(1) ? 0.55 : 0.2), nj = 12, X = [-1.34, -1.25, -1.02, -0.5, 0, 0.5, 1.02, 1.25, 1.34], TH = [-0.012, 0.035, 0.06, 0.07, 0.075, 0.07, 0.06, 0.035, -0.012], P = [], ph = seed * 0.7;
    for (let j = 0; j < nj; j++) { const z = lerp(za, zb, j / (nj - 1)), e = Math.min(j, nj - 1 - j), ke = e === 0 ? 0 : e === 1 ? 0.6 : 1, kx = (e === 0 ? 0.8 : e === 1 ? 0.95 : 1) * (1 + 0.025 * Math.sin(z * 1.1 + ph)), kt = ke * (0.85 + 0.3 * Math.sin(z * 0.63 + ph * 1.7));
      for (let i = 0; i < 9; i++) { const x = X[i] * kx; P.push([x, mxRoofY(x) + (TH[i] > 0 ? TH[i] * kt : TH[i]), z]); } }
    mxGrid(b, P, nj, 9, C0, () => [SNOWC, MAT.snow]);
    const cap = (x0, x1, z0, z1, y, t, sd) => { const G = []; for (const [fz, kz] of [[0, 0], [0.12, 1], [0.88, 1], [1, 0]]) for (const [fx, kx] of [[0, 0], [0.15, 1], [0.5, 1.15], [0.85, 1], [1, 0]]) G.push([lerp(x0, x1, fx), y + t * kz * kx * (kz && kx ? 0.75 + 0.5 * hash1(sd + fx * 9 + fz * 5) : 1) - (kz && kx ? 0 : 0.01), lerp(z0, z1, fz)]); mxGrid(b, G, 4, 5, [0, y - 1, (z0 + z1) / 2], () => [SNOWC, MAT.snow]); };
    for (const zc of [-4.3, 4.3]) { b.set(MXR, MAT.coach); b.box(-0.82, 3.56, zc - 1.35, 0.82, 3.86, zc + 1.35, 0.1, 0.18); b.set([0.05, 0.05, 0.055], MAT.paint);
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const y0 = 3.63 + k * 0.08, xg = (y) => s * (0.823 - (y - 3.56) / 3); mxQ(b, [xg(y0), y0, zc - 1.0], [xg(y0), y0, zc + 1.0], [xg(y0 + 0.05), y0 + 0.05, zc + 1.0], [xg(y0 + 0.05), y0 + 0.05, zc - 1.0], C0); } // grilles on the sloping sides
      cap(-0.74, 0.74, zc - 1.2, zc + 1.2, 3.86, 0.075, seed + (zc > 0 ? 3 : 11));
      b.set([0.04, 0.04, 0.045], MAT.void); for (const w of [-0.6, 0.6]) mxDisc(b, 0, 3.972, zc + w, 0.27, 16); } // fan grilles, kept clear
    b.set(MXR, MAT.coach); b.box(-0.6, 3.6, -0.9, 0.6, 3.78, 0.9, 0.05, 0.05); b.set([0.07, 0.07, 0.075], MAT.coach); for (let k = 0; k < 5; k++) b.box(-0.62, 3.66, -0.78 + k * 0.36, 0.62, 3.75, -0.66 + k * 0.36);
    cap(-0.56, 0.56, -0.86, 0.86, 3.78, 0.06, seed + 5);
  }
  // ---- underfloor equipment between the bogies ----
  for (const s of [-1, 1]) { let z = -h + 4.75;
    for (let k = 0; z < h - 5.4; k++) { const r = hash1(seed + k * 17 + (s > 0 ? 3 : 71)), len = 1.0 + 1.5 * r, y0 = 0.3 + 0.2 * hash1(seed + k * 5 + (s > 0 ? 1 : 2)), z1 = Math.min(z + len, h - 4.75), g = 0.1 + 0.1 * hash1(seed + k * 29 + 4), xf = s * 1.447, fq = (ya, yb, zq0, zq1) => mxQ(b, [xf, ya, zq0], [xf, ya, zq1], [xf, yb, zq1], [xf, yb, zq0], C0);
      b.set([g * 1.3, g * 1.3, g * 1.38], MAT.stone); bx2(b, s * 0.72, y0, z, s * 1.43, 0.86, z1);
      b.set([g * 1.45, g * 1.45, g * 1.5], MAT.coach); mxQ(b, [s * 1.438, y0 + 0.06, z + 0.07], [s * 1.438, y0 + 0.06, z1 - 0.07], [s * 1.438, 0.8, z1 - 0.07], [s * 1.438, 0.8, z + 0.07], C0); // hatch
      b.set([0.03, 0.03, 0.032], MAT.paint);
      if (r > 0.66) for (let q = 0; q < 5; q++) fq(y0 + 0.12 + q * 0.07, y0 + 0.15 + q * 0.07, z + 0.16, z1 - 0.16); // louvres
      else if (r > 0.33) for (const zl of [z + 0.14, z1 - 0.22]) fq(0.66, 0.72, zl, zl + 0.08); // latches
      else { for (let q = 1; q < 4; q++) fq(y0 + 0.08, 0.78, lerp(z, z1, q / 4) - 0.012, lerp(z, z1, q / 4) + 0.012); b.set([0.6, 0.5, 0.08], MAT.coach); fq(0.6, 0.7, z + 0.12, z + 0.26); } // a ribbed cover with a warning plate
      z = z1 + 0.12; }
  }
  b.set([0.2, 0.2, 0.21], MAT.metal); b.cyl(0.25, 0.55, -1.6, 0.25, 0.55, 0.2, 0.17, 0.17, 8); b.cyl(-0.3, 0.55, 0.4, -0.3, 0.55, 1.9, 0.15, 0.15, 8); // air reservoirs
  mxBogie(b, -h + 3.1, seed + 100, shoe); mxBogie(b, h - 3.1, seed + 200, shoe);
}
// cab end g: the cross-section shrinks round a 0.4 m plan corner radius into a face with 9 degrees of rake and a slight bow. The face is built row by row from the
// outline: each row runs outline - screen edge - ... - screen edge - outline, so the edge of the black screen (a rounded trapezoid inside a thin rim) lies on mesh edges;
// at window-band height the rim is glazed too and the screen runs round the corner into the cab side windows
function mxCab(b, h, g, white) {
  const zb = h - 0.75, D = 0.55, WHITE = [MXW, MAT.coach], GLS = [[0, 1, 1], MAT.tglass], GLB = [[0, 0, 1], MAT.tglass], DRK = [MXD, MAT.coach], C1 = [0, 1.9, g * (zb - 2)];
  const rk = (x, y) => 0.158 * Math.max(0, y - 1.1) + 0.13 * (x / 1.2) ** 2, n2 = (x, y, th) => { const q = 1 - Math.cos(th); return [x * (1 - 0.25 * q), y > 2.1 ? 2.1 + (y - 2.1) * (1 - 0.09 * q) : y]; };
  const nose = (x, y, th) => { const p = n2(x, y, th); return [p[0], p[1], g * (zb + (D - rk(p[0], p[1])) * Math.sin(th))]; }, fp = (x, y, o = 0) => [x, y, g * (zb + D - rk(x, y) + o)];
  { const NT = 4, P = []; for (let j = 0; j <= NT; j++) for (const p of MXRING) P.push(nose(p[0], p[1], j / NT * Math.PI / 2));
    mxGrid(b, P, NT + 1, MXRING.length, C1, (j, i) => { const y = mxMid(mxSeg(i)); return y < 1.0 ? DRK : y > 1.97 && y < 2.95 ? GLB : WHITE; }); }
  { const O = MXP.map((p) => n2(p[0], p[1], Math.PI / 2)), W = 0.13, F = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1], P = [], xs = O[3][0] - W, kb = MXP.findIndex((p) => p[1] > 1.96);
    const I = O.map((o, k) => { const y = MXP[k][1]; if (k === MXN - 1) return [0, o[1] - W]; if (y < 1.5) return [o[0] * 0.86, o[1]]; if (y < 1.6) return [xs - (y < 1.54 ? 0.15 : 0.044), o[1]]; if (y < 2.96) return [o[0] - W, o[1]];
      const a = O[k - 1], c = O[k + 1], tx = c[0] - a[0], ty = c[1] - a[1], l = Math.hypot(tx, ty); return [o[0] - ty / l * W, o[1] + tx / l * W]; }); // (the tangent runs up and inwards: turned left it points into the face)
    for (let k = 0; k < MXN; k++) { P.push(fp(-O[k][0], O[k][1])); for (const f of F) P.push(fp(f * I[k][0], I[k][1])); P.push(fp(O[k][0], O[k][1])); }
    mxGrid(b, P, MXN, F.length + 2, C1, (k, i) => { const rim = i === 0 || i === F.length, y = MXP[k][1]; return k === 0 ? DRK : rim ? (k === kb ? GLB : WHITE) : y > 1.5 ? GLS : WHITE; }, 0); }
  // obstacle deflector under the nose
  { const X = [-1.14, -0.9, -0.5, -0.17, 0.17, 0.5, 0.9, 1.14], P = [];
    for (const [y, o, k] of [[0.92, -0.02, 1], [0.66, -0.05, 1], [0.44, -0.2, 0.97]]) { P.push([-1.44 * k, y, g * (zb - 0.5)], [-1.42 * k, y, g * (zb + 0.05 + o)]); for (const x of X) P.push([x * k, y, fp(x, 1.0, o)[2]]); P.push([1.42 * k, y, g * (zb + 0.05 + o)], [1.44 * k, y, g * (zb - 0.5)]); }
    mxGrid(b, P, 3, X.length + 4, C1, () => [[0.1, 0.1, 0.11], MAT.coach]); }
  // Scharfenberg coupler: a dark head on a short drawbar, an octagonal face plate with the cone and the funnel, the electrical head beneath
  { const zh = h + 0.02, CP = [0.17, 0.17, 0.18];
    b.set(CP, MAT.stone); b.cyl(0, 0.74, g * (zb - 0.1), 0, 0.74, g * zh, 0.085, 0.085, 8, 0); b.cyl(0, 0.74, g * zh, 0, 0.74, g * (zh + 0.2), 0.17, 0.19, 8);
    b.set([0.2, 0.2, 0.21], MAT.metal); b.cyl(0.075, 0.74, g * (zh + 0.2), 0.075, 0.74, g * (zh + 0.31), 0.06, 0.02, 8);
    b.set([0.01, 0.01, 0.01], MAT.void); b.cyl(-0.075, 0.74, g * (zh + 0.2), -0.075, 0.74, g * (zh + 0.204), 0.062, 0.062, 8);
    b.set([0.2, 0.2, 0.21], MAT.stone); bx2(b, -0.15, 0.44, g * (zh + 0.02), 0.15, 0.555, g * (zh + 0.19)); }
  // light clusters: a recessed dark bezel each side with two headlights and a tail light; the leading end shows white, the trailing end red, unlit lenses are grey
  for (const s of [-1, 1]) {
    b.set([0.03, 0.03, 0.034], MAT.coach); for (let k = 0; k < 3; k++) { const xa = s * (0.56 + k * 0.18), xb = s * (0.74 + k * 0.18); mxQ(b, fp(xa, 1.2, 0.01), fp(xb, 1.2, 0.01), fp(xb, 1.44, 0.01), fp(xa, 1.44, 0.01), C1); }
    for (const [x, r, red] of [[0.65, 0.07, 0], [0.83, 0.07, 0], [1.01, 0.055, 1]]) { const on = red ? !white : white, zq = fp(s * x, 1.32)[2];
      b.set([0.12, 0.12, 0.13], MAT.metal); b.cyl(s * x, 1.32, zq + g * 0.004, s * x, 1.32, zq + g * 0.034, r + 0.012, r + 0.012, 10, 0);
      b.set(on ? (red ? [0.9, 0.05, 0.03] : [0.62, 0.6, 0.56]) : red ? [0.16, 0.05, 0.05] : [0.2, 0.21, 0.23], on ? (red ? MAT.beacon : MAT.head) : MAT.glass); b.cyl(s * x, 1.32, zq + g * 0.02, s * x, 1.32, zq + g * 0.03, r, r, 10); }
  }
  // destination display behind the top of the screen
  { let x = -0.6; for (let k = 0; x < 0.58; k++) { const w = k === 0 ? 0.1 : 0.05 + 0.1 * hash1(k * 7 + 3), x1 = Math.min(x + w, 0.6); b.set([0.36, 0.17, 0.02], MAT.head);
      mxQ(b, fp(x, 3.15, 0.008), fp(x1, 3.15, 0.008), fp(x1, 3.23, 0.008), fp(x, 3.23, 0.008), C1); x = x1 + (k === 0 ? 0.12 : 0.025 + (hash1(k * 5) > 0.75 ? 0.06 : 0)); } }
  // wiper: a dark arm from the pivot under the screen, the blade parked low
  b.set([0.03, 0.03, 0.033], MAT.coach); { const a = fp(0.05, 1.5, 0.03), c = fp(-0.5, 1.63, 0.035), d = fp(-0.98, 1.61, 0.03), e = fp(-0.08, 1.66, 0.03); b.cyl(a[0], a[1], a[2], c[0], c[1], c[2], 0.015, 0.015, 4); b.cyl(d[0], d[1], d[2], e[0], e[1], e[2], 0.012, 0.012, 4, 0); }
  // antenna on the cab roof
  b.set([0.12, 0.12, 0.13], MAT.metal); b.cyl(0.45, 3.55, g * (zb - 0.6), 0.45, 3.63, g * (zb - 0.6), 0.09, 0.06, 8); b.cyl(0.45, 3.63, g * (zb - 0.6), 0.45, 3.95, g * (zb - 0.6), 0.012, 0.008, 4);
}
function railway(b, W, R) {
  const i0 = b.i.length, c0 = W.colliders.length, bl0 = W.bld.length; W.railGlow = []; b.at(0, 0, 0); let nSeg = 0, tT = 0; // the strips are written in world coordinates
  const LX = R.cross.filter((c) => c[2] === 0), nearLX = (x, z, r) => LX.some((c) => Math.hypot(c[0] - x, c[1] - z) < r);
  const fx = (x0, y0, z0, th, boxes, area) => W.bld.push({ x: x0, y: y0, z: z0, th, v0: 0, v1: 0, area: 1e4, col: CONP, fix: 1, boxes });
  // ---- bed and rails: breakpoints as far apart as the curve allows (8 cm off the measured line, at most 40 m), continuous over the bridge spans ----
  for (const t of R.tr) {
    let side = 1; { const m = t.n >> 1; let bd = 1e9; for (const u of R.tr) if (u !== t) for (let k = 0; k < u.n; k += 2) { const d = Math.hypot(u.x[k] - t.x[m], u.z[k] - t.z[m]); if (d < bd) { bd = d; const a = Math.max(0, m - 1), c = Math.min(t.n - 1, m + 1); side = Math.sign(-(t.z[c] - t.z[a]) * (u.x[k] - t.x[m]) + (t.x[c] - t.x[a]) * (u.z[k] - t.z[m])) || 1; } } } // third rail between the tracks: clear of the side platforms
    t.s3 = side; const gap = new Uint8Array(t.n); // (no gaps any more: the spans are metro decks (meta.bridges k 1) or, low over a path, run on an embankment)
    for (let a = 0; a < t.n - 1;) {
      if (gap[a + 1]) { a++; continue; } let e = a + 1; while (e < t.n - 1 && !gap[e + 1]) e++; // run of points a..e clear of bridge spans and their abutments
      const K = [a]; let i = a;
      while (i < e) { let j = i + 1; const lim = nearLX(t.x[i], t.z[i], 16) ? 2 : 20;
        while (j < e && j - i < lim) { const c = j + 1, dx = t.x[c] - t.x[i], dz = t.z[c] - t.z[i], dy = t.y[c] - t.y[i], L = Math.hypot(dx, dz) || 1; let ok = true;
          for (let k = i + 1; k < c && ok; k++) { const f = ((t.x[k] - t.x[i]) * dx + (t.z[k] - t.z[i]) * dz) / (L * L); if (Math.abs((t.x[k] - t.x[i]) * dz - (t.z[k] - t.z[i]) * dx) / L > 0.08 || Math.abs(t.y[i] + dy * f - t.y[k]) > 0.08) ok = false; }
          if (!ok) break; j++; }
        K.push(j); i = j; nSeg++; }
      const atLX = (p, q) => nearLX((t.x[p] + t.x[q]) / 2, (t.z[p] + t.z[q]) / 2, 7), g = 0.7175 + 0.036, s3 = side * 1.5;
      railStrip(b, t, K, [[-2.7, -0.45, -1.45, 0.05, CONP, MAT.ballast, atLX], [-1.45, 0.05, 1.45, 0.05, CONP, MAT.ballast, atLX], [1.45, 0.05, 2.7, -0.45, CONP, MAT.ballast, atLX],
        [-g - 0.036, 0.02, -g - 0.036, 0.19, RUST, MAT.metal], [-g - 0.036, 0.19, -g + 0.036, 0.19, HEADC, MAT.metal], [-g + 0.036, 0.19, -g + 0.036, 0.02, RUST, MAT.metal],
        [g - 0.036, 0.02, g - 0.036, 0.19, RUST, MAT.metal], [g - 0.036, 0.19, g + 0.036, 0.19, HEADC, MAT.metal], [g + 0.036, 0.19, g + 0.036, 0.02, RUST, MAT.metal],
        [s3 - 0.04, -0.05, s3 - 0.04, 0.27, TRC, MAT.metal, atLX], [s3 - 0.04, 0.27, s3 + 0.05, 0.27, TRT, MAT.wood, atLX], [s3 + 0.05, 0.27, s3 + 0.05, -0.05, TRC, MAT.metal, atLX]]);
      a = e;
    }
  }
  tT = (b.i.length - i0) / 3;
  // ---- buffer stops: steel frame with a striped beam on a concrete block ----
  for (const [x, z, yaw] of R.bs) {
    const y = W.heightAt(x, z) + 0.1;
    b.at(x, y, z, yaw); b.set([0.4, 0.4, 0.39], MAT.stone); b.box(-1.4, -0.6, 0.6, 1.4, 1.0, 2.4);
    b.set([0.2, 0.2, 0.21], MAT.metal); for (const s of [-1, 1]) { b.box(s * 0.75 - 0.1, 0, -0.2, s * 0.75 + 0.1, 1.15, 0.1); b.cyl(s * 0.75, 0.2, 0.1, s * 0.75, 1.0, 1.7, 0.07, 0.07, 5); }
    for (let k = 0; k < 6; k++) { b.set(k & 1 ? [0.85, 0.85, 0.82] : [0.6, 0.06, 0.04], MAT.paint); b.box(-1.25 + k * 0.4167, 0.7, -0.32, -1.25 + (k + 1) * 0.4167, 1.05, -0.12); }
    b.set([0.6, 0.06, 0.04], MAT.lamp); b.box(-0.12, 1.15, -0.3, 0.12, 1.4, -0.1);
    fx(x, y, z, yaw, [box(x + Math.sin(yaw) * 1.0, z + Math.cos(yaw) * 1.0, yaw, 1.5, 1.5, y - 0.6, 1.7, 0)]);
  }
  // ---- stations ----
  for (const S of R.st) {
    const big = S.name === 'Frognerseteren' || S.name === 'Holmenkollen';
    S.p.forEach((Q, pi) => {
      const { x, z, yaw, hl, hw, top, edge } = Q, sl = Q.sl || 0, ax = Math.sin(yaw), az = Math.cos(yaw), bx = Math.cos(yaw), bz = -Math.sin(yaw), ex = edge, oc = -edge;
      let yb = top; for (let u = -1; u <= 1; u += 0.5) for (const v of [-1, 1]) yb = Math.min(yb, W.heightAt(x + ax * u * (hl + 3) + bx * v * hw, z + az * u * (hl + 3) + bz * v * hw)); yb -= 0.6;
      const ybw = yb; yb -= Math.abs(sl) * (hl + 4); // (local heights are sheared by the slope below: the slab bottom stays under the lowest ground)
      b.at(x, 0, z, yaw); b.m[9] += sl; const T = top; // the top follows the rail head along the platform (world.js platFit): local y is sheared along the platform, uprights stay upright
      b.set(CONP, MAT.stone); b.box(-hw, yb, -hl, hw, T - 0.02, hl);
      b.set(PAVE, MAT.paint); b.quad([-hw, T, hl], [hw, T, hl], [hw, T, -hl], [-hw, T, -hl]);
      b.set([0.8, 0.8, 0.77], MAT.paint); bx2(b, ex * hw, T - 0.25, -hl, ex * (hw - 0.3), T + 0.012, hl); // coping
      b.set([0.85, 0.66, 0.06], MAT.paint); bx2(b, ex * (hw - 0.55), T, -hl, ex * (hw - 0.85), T + 0.014, hl); // tactile warning line
      b.set(SNOWC, MAT.snow); bx2(b, oc * hw, T, -hl, oc * (hw - 0.7), T + 0.12, hl);
      for (const e of [-1, 1]) { b.set(CONP, MAT.stone); // ramps down at both ends
        const za = e * hl, zb = e * (hl + 4), g = W.heightAt(x + ax * e * (hl + 4), z + az * e * (hl + 4)) + 0.05 - sl * zb;
        b.quad([-hw, T, za], [hw, T, za], [hw, g, zb], [-hw, g, zb]); for (const s of [-1, 1]) b.quad([s * hw, T, za], [s * hw, g, zb], [s * hw, yb, zb], [s * hw, yb, za]);
        b.set([0.2, 0.2, 0.21], MAT.metal); b.cyl(oc * (hw - 0.1), T + 1.0, za, oc * (hw - 0.1), g + 1.0, zb, 0.03, 0.03, 4); }
      { const nb = Math.max(1, Math.ceil(Math.abs(sl) * (2 * hl + 8) / 0.3)), hd = (hl + 4) / nb, bxs = []; // solid boxes: stepped along a sloping platform, each within 0.15 m of the top
        for (let k = 0; k < nb; k++) { const u = -hl - 4 + (2 * k + 1) * hd; bxs.push(box(x + ax * u, z + az * u, yaw, hw, hd, ybw, T + sl * u - ybw, 0)); }
        fx(x, T, z, yaw, bxs); }
      // shelters: where the OSM shelter stood, else one in the middle; timber at Frognerseteren and Holmenkollen, glass and steel elsewhere
      const SH = Q.sh.length ? Q.sh : [[hl * 0.2, 6]];
      for (const [u, len] of SH) {
        const L = clamp(len, 4, Math.min(12, 2 * hl - 6)) / 2, uc = clamp(u, -hl + L + 1, hl - L - 1), d = 1.7, x0 = oc * (hw - 0.35), x1 = x0 - oc * d, hh = 2.55;
        if (big) {
          b.set(STW, MAT.plank); bx2(b, x0, T, uc - L, x0 + oc * 0.15, T + hh, uc + L); bx2(b, x0, T, uc - L, x1, T + hh, uc - L + 0.15); bx2(b, x0, T, uc + L - 0.15, x1, T + hh, uc + L);
          b.set([1, 0.78, 0.45], MAT.window); b.quad([x0 - oc * 0.01, T + 1.2, uc - L + 0.8], [x0 - oc * 0.01, T + 1.2, uc + L - 0.8], [x0 - oc * 0.01, T + 2.1, uc + L - 0.8], [x0 - oc * 0.01, T + 2.1, uc - L + 0.8], [0, 0, Math.round((2 * L - 1.6) / 1.1), 0, Math.round((2 * L - 1.6) / 1.1), 1, 0, 1]);
          b.set([0.3, 0.07, 0.05], MAT.wood); slab(b, [x0 + oc * 0.5, T + hh + 0.3, uc - L - 0.4], [x0 + oc * 0.5, T + hh + 0.3, uc + L + 0.4], [x1 - oc * 0.6, T + hh - 0.1, uc + L + 0.4], [x1 - oc * 0.6, T + hh - 0.1, uc - L - 0.4], 0.12);
          b.set(SNOWC, MAT.snow); slab(b, [x0 + oc * 0.52, T + hh + 0.5, uc - L - 0.42], [x0 + oc * 0.52, T + hh + 0.5, uc + L + 0.42], [x1 - oc * 0.62, T + hh + 0.1, uc + L + 0.42], [x1 - oc * 0.62, T + hh + 0.1, uc - L - 0.42], 0.2);
        } else {
          b.set([0.12, 0.13, 0.14], MAT.metal); for (const zz of [uc - L, uc + L]) for (const xx of [x0, x1]) b.box(xx - 0.05, T, zz - 0.05, xx + 0.05, T + hh, zz + 0.05);
          b.set([0.35, 0.45, 0.5], MAT.glass); b.quad([x0, T + 0.1, uc - L], [x0, T + 0.1, uc + L], [x0, T + hh - 0.1, uc + L], [x0, T + hh - 0.1, uc - L]); for (const zz of [uc - L, uc + L]) b.quad([x0, T + 0.1, zz], [x1 + oc * 0.5, T + 0.1, zz], [x1 + oc * 0.5, T + hh - 0.1, zz], [x0, T + hh - 0.1, zz]);
          b.set([0.12, 0.13, 0.14], MAT.metal); bx2(b, x0 + oc * 0.15, T + hh, uc - L - 0.2, x1 - oc * 0.3, T + hh + 0.12, uc + L + 0.2); b.set(SNOWC, MAT.snow); bx2(b, x0 + oc * 0.12, T + hh + 0.12, uc - L - 0.17, x1 - oc * 0.27, T + hh + 0.3, uc + L + 0.17);
        }
        b.set(WOOD, MAT.wood); bx2(b, x0 - oc * 0.1, T + 0.42, uc - L + 0.4, x0 - oc * 0.5, T + 0.48, uc + L - 0.4);
      }
      // lamps on the back edge, heads over the platform
      for (const u of Q.lamps) { const lx = oc * (hw - 0.45);
        b.set([0.2, 0.21, 0.22], MAT.metal); b.cyl(lx, T, u, lx, T + 4.6, u, 0.07, 0.05, 6); b.cyl(lx, T + 4.5, u, lx + ex * 1.1, T + 4.6, u, 0.035, 0.035, 4); bx2(b, lx + ex * 0.8, T + 4.45, u - 0.25, lx + ex * 1.3, T + 4.65, u + 0.25);
        b.set([1, 0.95, 0.82], MAT.lamp); b.quad([lx + ex * 0.82, T + 4.44, u - 0.22], [lx + ex * 1.28, T + 4.44, u - 0.22], [lx + ex * 1.28, T + 4.44, u + 0.22], [lx + ex * 0.82, T + 4.44, u + 0.22]);
        const wx = lx + ex * 1.05; W.railGlow.push(x + bx * wx + ax * u, T + 4.35 + sl * u, z + bz * wx + az * u); }
      // name boards (both ends) and the T sign at the entrance end
      for (const e of [-1, 1]) { const zz = e * hl * 0.55, xs = oc * (hw - 0.3);
        b.set([0.2, 0.21, 0.22], MAT.metal); for (const o of [-1.1, 1.1]) b.cyl(xs, T, zz + o, xs, T + 2.5, zz + o, 0.04, 0.04, 5);
        b.set(TBLUE.map((c, k) => c + (k === 0 ? 0.002 * (pi + 3 * e + S.name.length) : 0)), MAT.sign); b.quad([xs + ex * 0.04, T + 1.9, zz - 1.2], [xs + ex * 0.04, T + 1.9, zz + 1.2], [xs + ex * 0.04, T + 2.45, zz + 1.2], [xs + ex * 0.04, T + 2.45, zz - 1.2], [0, 0, 1, 0, 1, 1, 0, 1]); }
      if (pi === 0) { const zz = hl + 2.5, xs = oc * (hw + 0.6), gy = W.heightAt(x + ax * zz + bx * xs, z + az * zz + bz * xs) - sl * zz;
        b.set([0.2, 0.21, 0.22], MAT.metal); b.cyl(xs, gy - 0.3, zz, xs, gy + 3.2, zz, 0.05, 0.05, 6);
        b.set(TBLUE, MAT.paint); b.cyl(xs, gy + 3.2, zz - 0.05, xs, gy + 3.2, zz + 0.05, 0.42, 0.42, 16);
        b.set([0.92, 0.92, 0.9], MAT.paint); for (const s of [-1, 1]) { bx2(b, xs - 0.26, gy + 3.33, zz + s * 0.06, xs + 0.26, gy + 3.45, zz + s * 0.07); bx2(b, xs - 0.06, gy + 2.95, zz + s * 0.06, xs + 0.06, gy + 3.4, zz + s * 0.07); } }
    });
  }
  // ---- parked MX3000 units (3 cars: see mxCar) ----
  const tS = b.i.length;
  const P0 = new Float32Array(3), P1 = new Float32Array(3);
  for (const [ti, sc] of R.train) {
    const t = R.tr[ti], CL = [18.2, 17.9, 18.2], len = CL[0] + CL[1] + CL[2] + 0.8, boxes = []; let s0 = sc - len / 2;
    for (let c = 0; c < 3; c++) {
      const L = CL[c], h = L / 2; railAt(t, s0, P0); railAt(t, s0 + L, P1); s0 += L + 0.4;
      const cx = (P0[0] + P1[0]) / 2, cy = (P0[1] + P1[1]) / 2 + 0.19, cz = (P0[2] + P1[2]) / 2, yaw = Math.atan2(P1[0] - P0[0], P1[2] - P0[2]), pitch = -Math.atan2(P1[1] - P0[1], Math.hypot(P1[0] - P0[0], P1[2] - P0[2]));
      b.at(cx, cy, cz, yaw, pitch);
      mxCar(b, L, c, ti * 977 + c * 131 + 7, (c === 0) === (R.train.findIndex((q) => q[0] === ti && q[1] === sc) % 2 === 0), -(t.s3 || 0)); // one end of each unit shows headlights, the other tail lights; shoes on the conductor-rail side
      boxes.push(box(cx, cz, yaw, 1.6, h, cy - 0.2, 3.85, 0));
    }
    fx(boxes[1].x, boxes[1].y, boxes[1].z, boxes[1].th, boxes);
  }
  b.at(0, 0, 0);
  W.railStat = { seg: nSeg, track: tT, train: (b.i.length - tS) / 3, tris: (b.i.length - i0) / 3, circles: (W.colliders.length - c0) / 3, boxes: W.bld.slice(bl0).reduce((s, r) => s + r.boxes.length, 0) };
}
const bx2 = (b, x0, y0, z0, x1, y1, z1) => b.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1));
export function buildProps(W) {
  const b = new MB();
  W.colliders = []; W.bld = []; // circle colliders (x, z, r); building records with their solid boxes (see buildings.js)
  const PLAY = W.PLAY;
  if (W.name === 'fantasy') { cabin(b, W.cabin, W); bridge(b, W.bridge); dam(b, W.dam); }
  else { lodge(b, W.cabin, W); W.buildings.forEach((B, i) => B.gone || house(b, B, i, W)); skiJump(b, W, W.lm.jump); skiJump(b, W, W.lm.mid); arena(b, W, W.lm.arena); tvTower(b, W, W.lm.tower); skiLift(b, W, W.lm.lift); chapel(b, W, W.lm.chapel); W.portals.forEach((p) => portal(b, W, p)); if (W.br) { const i0 = b.i.length; for (let i = 0; i < W.br.n; i++) overpass(b, W, i); W.br.tris = (b.i.length - i0) / 3; } }
  if (W.rail) railway(b, W, W.rail); // Holmenkollbanen
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
    if (W.rail && W.rail.mask[k >> 2]) continue; // not on the track bed or a platform
    if (W.br && W.br.id(x, z, 10) >= 0) continue; // nor on a bridge or its ramps
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
