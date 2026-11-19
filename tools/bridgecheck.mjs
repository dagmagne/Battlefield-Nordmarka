// Checks the bridge queries (src/bridges.js) without a GPU, on the bridges in src/data/world.bin (meta.bridges):
// seg against brute-force fine stepping with inSolid on random rays, the STEP rule of top / groundAt, over, push at both levels
// (the bridges world.js builds: blocked ones under 1.8 m are not; abutments only for trench traffic, parapets only for deck traffic, normals pointing out of the wall), and a million mixed queries
// without heap growth.  usage: node --expose-gc tools/bridgecheck.mjs
import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';
import { initBridges, STEP } from '../src/bridges.js';
const raw = inflateRawSync(readFileSync(new URL('../src/data/world.bin', import.meta.url))), jl = raw.readUInt32LE(0), meta = JSON.parse(raw.subarray(4, 4 + jl).toString());
const list = (meta.bridges || []).filter((B) => !B.blk || B.clr >= 1.8); let fail = 0; const bad = (m) => { console.log('FAIL', m); fail++; };
if (list.length < 2) bad('expected at least the two arena bridges in meta.bridges, found ' + list.length);
const ground = (x, z) => 100 + 0.01 * x; // a stand-in terrain far below the decks (seg / inSolid / push do not use it; groundAt does)
const BR = initBridges(list, ground);
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const toW = (B, lu, lv) => [B.c[0] + B.u[0] * lu - B.u[1] * lv, B.c[1] + B.u[1] * lu + B.u[0] * lv];
const topOf = (B, lu, lv) => B.y0 + B.gu * lu + B.gv * lv;
console.log(`bridges ${BR.n}, walls ${BR.nw}, STEP ${STEP}`);

// ---- 1. seg against brute force ----
{ let n = 0, hits = 0, worst = 0, miss = 0;
  for (let k = 0; k < 4000; k++) {
    const B = list[k % list.length], a = toW(B, (rnd() - 0.5) * 2.6 * B.hl, (rnd() - 0.5) * 2.6 * B.hw), b = toW(B, (rnd() - 0.5) * 2.6 * B.hl, (rnd() - 0.5) * 2.6 * B.hw);
    const ya = B.r0 - 2 + rnd() * 14, yb = B.r0 - 2 + rnd() * 14, f = BR.seg(a[0], ya, a[1], b[0], yb, b[1]);
    const L = Math.hypot(b[0] - a[0], yb - ya, b[1] - a[1]), N = Math.ceil(L / 0.005); let g = 2;
    for (let i = 0; i <= N; i++) { const t = i / N; if (BR.inSolid(a[0] + (b[0] - a[0]) * t, ya + (yb - ya) * t, a[1] + (b[1] - a[1]) * t) >= 0) { g = t; break; } }
    n++; if (g <= 1) hits++;
    if ((f <= 1) !== (g <= 1)) { // a graze thinner than the brute-force step is not an error
      const t = f <= 1 ? f : g, p = [a[0] + (b[0] - a[0]) * t, ya + (yb - ya) * t, a[1] + (b[1] - a[1]) * t]; let near = false;
      for (const d of [-0.01, 0.01]) if (BR.inSolid(p[0] + d, p[1], p[2]) >= 0 || BR.inSolid(p[0], p[1] + d, p[2]) >= 0 || BR.inSolid(p[0], p[1], p[2] + d) >= 0) near = true;
      if (!near || f > 1) miss++; continue; }
    if (g <= 1) worst = Math.max(worst, Math.abs(f - g) * L); }
  console.log(`seg vs brute force: ${n} rays, ${hits} hits, worst entry error ${(worst * 100).toFixed(2)} cm, disagreements ${miss}`);
  if (worst > 0.02 || miss > 0) bad('seg disagrees with fine stepping'); }

// ---- 2. the STEP rule ----
for (const B of list) {
  const [x, z] = toW(B, (B.tr[0] + B.tr[1]) / 2, B.hw * 0.3), t = topOf(B, (B.tr[0] + B.tr[1]) / 2, B.hw * 0.3);
  const on = BR.top(x, z, t - STEP + 0.01), off = BR.top(x, z, t - STEP - 0.01), above = BR.groundAt(x, z, t + 20), under = BR.groundAt(x, z, B.r0), ov = BR.over(x, z, B.r0 + 1);
  console.log(`${B.name}: top at ${t.toFixed(2)}, querier STEP-0.01 below -> ${on.toFixed(2)}, STEP+0.01 below -> ${off}, groundAt from above ${above.toFixed(2)}, from the road ${under.toFixed(2)}, ceiling over the road ${ov.toFixed(2)} (clearance ${(ov - B.r0 - B.rg * B.hw * 0.3).toFixed(2)} m)`);
  if (Math.abs(on - t) > 1e-3 || off > -1e8 || Math.abs(above - t) > 1e-3 || Math.abs(under - ground(x, z)) > 1e-6 || Math.abs(ov - (t - B.th)) > 1e-3) bad('STEP rule / groundAt / over at ' + B.name);
  const [fx, fz] = toW(B, B.hl + 3, 0); if (BR.top(fx, fz, 1e5) > -1e8 || BR.id(fx, fz, 0) >= 0 || BR.id(fx, fz, 4) < 0) bad('footprint edge at ' + B.name);
}
// ---- 3. push: abutments block the trench, parapets block the deck, normals point out of the wall ----
{ const O = new Float32Array(5);
  for (const B of list) {
    const ta = B.tr[0], lv = B.hw * 0.2, [x, z] = toW(B, ta + 1.2, lv), yr = B.r0 + B.rg * lv; // a 1.9 m circle 1.2 m inside the trench edge at road level: overlaps the abutment
    const n1 = BR.push(x, z, yr, 1.9, O), nl1 = O[2] * B.u[0] + O[3] * B.u[1], d1 = O[4], ok1 = n1 > 0 && nl1 > 0.99 && Math.abs(d1 - 0.7) < 0.02;
    const n2 = BR.push(x, z, topOf(B, ta + 1.2, lv), 1.9, O); // the same spot at deck level: the abutment is below
    const pv = B.hw - 1.2, [px, pz] = toW(B, 0, pv), yt = topOf(B, 0, pv); // near the parapet on the deck
    const n3 = BR.push(px, pz, yt, 1.9, O), nv = -O[2] * B.u[1] + O[3] * B.u[0], ok3 = n3 > 0 && nv < -0.99;
    const n4 = BR.push(px, pz, B.r0 + B.rg * pv, 1.9, O); // at road level under that spot: the parapet is far above, the face wall is 0.9 m away (no contact at 1.2 - 0.6)
    console.log(`${B.name}: abutment at road level ${n1} contact(s), normal.u ${nl1.toFixed(3)}, depth ${d1.toFixed(2)} | at deck level ${n2} | parapet on deck ${n3}, normal.v ${nv.toFixed(3)} | at road level ${n4}`);
    if (!ok1 || n2 || !ok3) bad('push at ' + B.name); } }

// ---- 4. a million mixed queries without heap growth ----
{ const O = new Float32Array(5), B = list[0], P = new Float32Array(4096 * 4); for (let i = 0; i < 4096; i++) { const [x, z] = toW(B, (rnd() - 0.5) * 3 * B.hl, (rnd() - 0.5) * 3 * B.hw); P[i * 4] = x; P[i * 4 + 1] = z; P[i * 4 + 2] = B.r0 - 2 + rnd() * 14; P[i * 4 + 3] = rnd() * 40 - 20; }
  let acc = 0; const run = (n) => { let a = 0; for (let i = 0; i < n; i++) { const o = (i & 4095) * 4, x = P[o], z = P[o + 1], y = P[o + 2];
    switch (i & 7) { case 0: a += BR.groundAt(x, z, y); break; case 1: a += BR.top(x, z, y); break; case 2: a += BR.over(x, z, y); break; case 3: a += BR.inSolid(x, y, z); break;
      case 4: a += BR.seg(x, y, z, x + P[o + 3], y - 3, z - P[o + 3]); break; case 5: a += BR.push(x, z, y, 1.9, O); break; case 6: a += BR.id(x, z, 3); break; default: a += BR.groundAt(x + 900, z, y); } } return a; }; // (a local sum: a double written to a closure variable is boxed on every write)
  acc += run(200000); if (global.gc) global.gc(); const h0 = process.memoryUsage().heapUsed, t0 = performance.now();
  acc += run(1000000); const ms = performance.now() - t0, h1 = process.memoryUsage().heapUsed;
  console.log(`1e6 queries: ${ms.toFixed(0)} ms (${(ms / 1000).toFixed(3)} us each), heap ${((h1 - h0) / 1024).toFixed(0)} kB growth${global.gc ? '' : ' (run with --expose-gc for a clean baseline)'} [${acc.toFixed(0)}]`);
  if (h1 - h0 > 4096 * 1024) bad('heap grew by ' + ((h1 - h0) / 1024).toFixed(0) + ' kB over a million queries'); } // one allocation per query would be >= 16 MB; up to ~1 MB is JIT and IC noise (an empty loop shows the same)
console.log(fail ? `${fail} FAILED` : 'all bridge checks passed');
process.exit(fail ? 1 : 0);
