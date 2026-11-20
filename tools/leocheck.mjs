// Mesh check for the tracked vehicles (no GPU): triangle counts per part, NaNs, winding against the vertex normals, bounds per part.
// usage: node tools/leocheck.mjs
import * as T from '../src/tank.js';
let bad = 0;
for (const [name, f] of [['leopard', T.buildLeopard], ['t72', T.buildT72], ['bmp', T.buildBMP]]) {
  const m = f(), v = m.v, I = m.i, n = I.length / 3, per = {}, bb = {};
  let nan = 0, wrong = 0, deg = 0;
  for (let k = 0; k < v.length; k++) if (!Number.isFinite(v[k])) nan++;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 14, c = I[k + 1] * 14, d = I[k + 2] * 14, p = v[a + 12], bar = v[a + 9] === 8;
    per[p] = (per[p] || 0) + 1;
    const ux = v[c] - v[a], uy = v[c + 1] - v[a + 1], uz = v[c + 2] - v[a + 2], wx = v[d] - v[a], wy = v[d + 1] - v[a + 1], wz = v[d + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) { deg++; continue; }
    const dt = (nx * (v[a + 3] + v[c + 3] + v[d + 3]) + ny * (v[a + 4] + v[c + 4] + v[d + 4]) + nz * (v[a + 5] + v[c + 5] + v[d + 5])) / l / 3;
    if (dt < 0.05) wrong++;
    if (!bar) for (const q of [a, c, d]) { const B = bb[p] || (bb[p] = [9, 9, 9, -9, -9, -9]); for (let j = 0; j < 3; j++) { B[j] = Math.min(B[j], v[q + j]); B[j + 3] = Math.max(B[j + 3], v[q + j]); } }
  }
  console.log(`${name}: ${n} triangles, ${v.length / 14} vertices, per part ${JSON.stringify(per)}, NaN ${nan}, winding/normal mismatches ${wrong}, degenerate ${deg}`);
  for (const p of Object.keys(bb)) console.log(`  part ${p} bounds x ${bb[p][0].toFixed(2)}..${bb[p][3].toFixed(2)}  y ${bb[p][1].toFixed(2)}..${bb[p][4].toFixed(2)}  z ${bb[p][2].toFixed(2)}..${bb[p][5].toFixed(2)}`);
  if (nan || wrong > 0) bad = 1;
}
// proportions of the Leopard and the track loops
{ const G = await import('../src/gear.js'), m = T.buildLeopard(), v = m.v; let tw = 0, roof = 0, sk = 9;
  for (let k = 0; k < v.length; k += 14) { const x = Math.abs(v[k]), y = v[k + 1], z = v[k + 2], p = v[k + 12], mat = v[k + 9];
    if (p === 1 && mat === 20 && y > 1.7 && y < 1.95 && z < 0.7) tw = Math.max(tw, x);
    if (p === 1 && mat === 20 && v[k + 4] > 0.99 && y > 2.3 && y < 2.47) roof = Math.max(roof, y);
    if (p === 0 && mat === 20 && x > 1.86 && z > -2.8 && z < -1.1) sk = Math.min(sk, y); }
  const g = G.GEAR[0], pitch = (g.z1 - g.z0) / (g.n - 1), wy = g.wr + g.t;
  console.log(`leopard: road wheel dia ${(2 * g.wr).toFixed(2)} m, pitch ${pitch.toFixed(2)} m (gap ${(pitch - 2 * g.wr).toFixed(2)}), ${g.n} wheels span ${(g.z1 - g.z0).toFixed(2)} m, wheel ${g.t.toFixed(2)}..${(g.t + 2 * g.wr).toFixed(2)} m above the ground`);
  console.log(`  heavy skirt edge ${sk.toFixed(2)} m: ${Math.round((sk - g.t) / (2 * g.wr) * 100)} % of the wheel below it; turret roof ${roof.toFixed(2)} m; turret width ${(2 * tw).toFixed(2)} m = ${Math.round(2 * tw / 3.77 * 100)} % of 3.77 m over the skirts; hull deck 1.50 m (engine deck 1.56), LEO.hh ${T.LEO.hh}`);
  G.LOOPS.forEach((l, i) => { const a = l.seg[6], c = l.seg[2]; console.log(`  loop ${i}: length ${l.L.toFixed(2)} m, ground run ${l.seg[0].len.toFixed(2)} m, front rise ${(Math.atan2(-a.oz, -a.oy) * 57.3).toFixed(0)} deg to the idler (top ${(G.GEAR[i].id[1] + G.GEAR[i].id[2]).toFixed(2)}), rear rise ${(Math.atan2(c.oz, -c.oy) * 57.3).toFixed(0)} deg, rearmost ${(G.GEAR[i].sp[0] + G.GEAR[i].sp[2] + G.GEAR[i].t).toFixed(2)}`); }); }
process.exit(bad);
