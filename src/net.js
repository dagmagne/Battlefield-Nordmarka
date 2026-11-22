// The Leopard's camouflage net (K): a winter net draped over hull, turret and gun, in the tank's own part spaces (0 hull, 1 turret,
// 2 gun), so main.js draws it with the tank's part matrices and it follows a traversed turret. Three height fields laid as flat-shaded
// quads: inside a part's outline the net lies on it (with lumps), outside it falls to the hem over a short run, and quads far enough
// out are left away, which gives the ragged edge. MAT.net cuts the garnish holes in the shader.
import { MB, MAT } from './mesh.js';
import { LEO } from './leopard.js';

const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const lump = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  return (hash(xi, zi) * (1 - sx) + hash(xi + 1, zi) * sx) * (1 - sz) + (hash(xi, zi + 1) * (1 - sx) + hash(xi + 1, zi + 1) * sx) * sz; };
const COL = [[0.8, 0.82, 0.84], [0.8, 0.82, 0.84], [0.74, 0.77, 0.8], [0.52, 0.55, 0.56], [0.36, 0.41, 0.33]]; // mostly white, some grey, a little olive

// one draped sheet: x0..x1, z0..z1 on a grid of step s; out(x, z) = metres outside the covered outline (<= 0 inside); top(x, z) the height
// inside; hem the height the net hangs down to; run the distance over which it falls; cut the distance beyond which there is no net
function sheet(b, x0, x1, z0, z1, s, out, top, hem, run, cut, seed) {
  const nx = Math.round((x1 - x0) / s), nz = Math.round((z1 - z0) / s), P = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + i * s + (hash(i + seed, j) - 0.5) * s * 0.3, z = z0 + j * s + (hash(i, j + seed) - 0.5) * s * 0.3, d = out(x, z);
    const t = Math.min(1, Math.max(0, d / run)), f = t * t * (3 - 2 * t), h = top(x, z) + 0.05 + 0.16 * lump(x * 1.7 + seed, z * 1.7);
    P.push([x, hem + (h - hem) * (1 - f) + (f > 0.99 ? 0.03 * hash(i, j) : 0), z, d + (lump(x * 1.3, z * 1.3 + seed) - 0.5) * cut * 0.9]); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = P[j * (nx + 1) + i], c = P[j * (nx + 1) + i + 1], d = P[(j + 1) * (nx + 1) + i + 1], e = P[(j + 1) * (nx + 1) + i];
    if (Math.min(a[3], c[3], d[3], e[3]) > cut) continue;
    const k = lump((x0 + i * s) * 0.9 + seed * 3.1, (z0 + j * s) * 0.9), col = COL[Math.min(COL.length - 1, Math.floor(k * k * 1.6 * COL.length))];
    b.set(col, MAT.net); b.quad(a, e, d, c); }
}
const box = (x, z, hx, z0, z1) => Math.max(Math.abs(x) - hx, z0 - z, z - z1); // metres outside a rectangle (corners are not rounded: a net hangs square off a hull)

export function buildNet() {
  const b = new MB();
  // hull: over the deck (the engine deck stands highest, the glacis lower), hanging to the ground round the tracks
  b.part = 0; sheet(b, -3.1, 3.1, -5, 5, 0.42, (x, z) => box(x, z, 1.9, -3.75, 3.85), (x, z) => 1.52 + 0.36 * Math.max(0, Math.min(1, (z - 0.6) / 0.8)) - 0.6 * Math.max(0, Math.min(1, (-2.4 - z) / 1.3)), 0.04, 0.95, 0.75, 1);
  // turret: the roof with the cupola and the sight as bumps, hanging to just above the deck
  b.part = 1; sheet(b, -2.6, 2.6, -3.1, 4.1, 0.36, (x, z) => box(x, z, 1.75, -2.3, 3.25), (x, z) => LEO.th + 0.16 + 0.28 * Math.exp(-((x - 0.55) ** 2 + (z - 0.2) ** 2) / 0.25) + 0.2 * Math.exp(-((x + 0.6) ** 2 + (z + 0.6) ** 2) / 0.2), 1.72, 0.5, 0.42, 7);
  // gun: a strip over the barrel, sagging off both sides
  b.part = 2; sheet(b, -0.75, 0.75, LEO.mz + 0.5, -2.1, 0.3, (x) => Math.abs(x) - 0.12, () => LEO.gy + 0.12, LEO.gy - 0.55, 0.38, 0.3, 13);
  return b.build();
}
