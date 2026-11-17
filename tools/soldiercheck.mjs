// Checks the procedural soldier meshes: triangle counts per part, winding against the vertex normals, non-finite values.
// usage: node tools/soldiercheck.mjs
import { buildSoldier } from '../src/soldier.js';
let fail = false;
for (const lo of [0, 1]) {
  const m = buildSoldier(lo), v = m.v, I = m.i, per = new Array(13).fill(0), badP = new Array(13).fill(0); let bad = 0, nan = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 14, b = I[t + 1] * 14, c = I[t + 2] * 14;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; if (Math.hypot(nx, ny, nz) < 1e-10) continue;
    const vn = (v[a + 3] + v[b + 3] + v[c + 3]) * nx + (v[a + 4] + v[b + 4] + v[c + 4]) * ny + (v[a + 5] + v[b + 5] + v[c + 5]) * nz;
    const p = v[a + 12]; per[p]++; if (vn < 0) { bad++; badP[p]++; }
  }
  for (const x of v) if (!Number.isFinite(x)) nan++;
  console.log(lo ? 'far ' : 'near', 'tris', I.length / 3, 'verts', v.length / 14, 'inverted', bad, 'nan', nan, '| per part', per.join(','), '| inverted per part', badP.join(','));
  if (bad || nan) fail = true;
}
process.exit(fail ? 1 : 0);
