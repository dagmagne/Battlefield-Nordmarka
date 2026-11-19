// Tigr-M and BTR-82A, and the tyre shared by the wheeled vehicles. Local frame as in tank.js: x right, y up, forward = -z.
import { MB, MAT } from './mesh.js';
import { poly, extX, extY, mirror } from './vehutil.js';
// ---------- light and wheeled vehicles (phase 4): parts 0 hull, 1 mount, 2 weapon, 3.. one per axle (both wheels turn with it) ----------
// K adds: bx/bz hull half-extents for hits, cr collision circle radius and spacing cs, wr wheel radius, ax axle z positions
export const tyre = (b, x, y, z, r, w, part, rim) => { // a tyre on an axle across x, with a tread ring of blocks and a hub
  b.part = part; const sx = Math.sign(x) || 1, x0 = x - sx * w / 2, x1 = x + sx * w / 2;
  b.set([0.035, 0.035, 0.038], MAT.rubber); b.cyl(x0, y, z, x1, y, z, r * 0.94, r * 0.94, 16);
  b.cyl(x0, y, z, x0 - sx * 0.001, y, z, r * 0.94, r * 0.7, 16); // inner sidewall
  const nl = Math.max(12, Math.round(r * 40)); for (let k = 0; k < nl; k++) { const a = k * 2 * Math.PI / nl; b.at(x, y + Math.cos(a) * r * 0.94, z + Math.sin(a) * r * 0.94, 0, -a); b.box(-w * 0.46, 0, -0.022, w * 0.46, 0.02, 0.022); b.at(0, 0, 0); } // low tread lugs
  b.set(rim, MAT.metal); b.cyl(x1, y, z, x1 + sx * 0.012, y, z, r * 0.55, r * 0.5, 10); b.set([0.06, 0.06, 0.06], MAT.metal); b.cyl(x1 + sx * 0.012, y, z, x1 + sx * 0.05, y, z, r * 0.16, r * 0.12, 8);
  b.part = 0;
};
export const TIGR = { ty: 2.1, tz: 0.35, gy: 2.42, gz: 0.35, mz: -1.0, hl: 2.4, hw: 1.0, rad: 2.2, hh: 2.1, th: 2.75, tr: 0.45, bx: 1.2, bz: 2.85, cr: 1.35, cs: 1.4, wr: 0.48, ax: [-1.72, 1.95] };
export function buildTigr() { // GAZ Tigr with a Kornet launcher on a roof mount
  const b = new MB(), G = [0.06, 0.075, 0.045], GD = [0.045, 0.056, 0.034], DK = [0.03, 0.031, 0.034], GL = [0.03, 0.04, 0.05];
  b.part = 0; b.set(DK, MAT.metal); b.box(-0.7, 0.42, -2.6, 0.7, 0.62, 2.55); // chassis
  b.set(G, MAT.rus);
  extX(b, [[0.62, -2.85], [1.05, -2.9], [1.32, -1.75], [1.42, -0.85], [2.1, -0.55], [2.1, 2.4], [0.62, 2.5]], -1.12, 1.12); // body: nose, hood, windscreen, cabin
  b.set(GD, MAT.rus); for (const sx of [-1, 1]) { b.box(sx * 1.12 - (sx > 0 ? 0.12 : 0), 0.62, -2.35, sx * 1.12 + (sx > 0 ? 0 : 0.12), 1.0, -1.05); b.box(sx * 1.12 - (sx > 0 ? 0.12 : 0), 0.62, 1.3, sx * 1.12 + (sx > 0 ? 0 : 0.12), 1.0, 2.45); } // wheel arches
  b.set(GL, MAT.glass); poly(b, [[-0.95, 1.47, -0.8], [0.95, 1.47, -0.8], [0.92, 2.02, -0.58], [-0.92, 2.02, -0.58]], [0, 1.8, -2]); // windscreen
  for (const sx of [-1, 1]) for (const [z0, z1] of [[-0.45, 0.55], [0.75, 1.75]]) poly(b, [[sx * 1.121, 1.5, z0], [sx * 1.121, 1.5, z1], [sx * 1.121, 1.95, z1], [sx * 1.121, 1.95, z0]], [sx * 3, 1.7, (z0 + z1) / 2]);
  b.set(GD, MAT.rus); for (const sx of [-1, 1]) { b.box(sx * 1.13 - 0.02, 0.8, -0.5, sx * 1.13 + 0.02, 1.42, 1.9); for (const z of [0.6, 1.8]) b.box(sx * 1.14 - 0.015, 1.1, z - 0.12, sx * 1.14 + 0.015, 1.16, z + 0.02); } // doors, handles
  b.set(DK, MAT.metal); b.box(-1.0, 0.65, -2.98, 1.0, 0.95, -2.86); for (let k = -3; k <= 3; k++) b.box(k * 0.13 - 0.04, 1.0, -2.92, k * 0.13 + 0.04, 1.28, -2.88); // bumper, grille
  b.set([1, 0.95, 0.82], MAT.head); for (const sx of [-1, 1]) poly(b, [[sx * 0.8 - 0.1, 1.08, -2.885], [sx * 0.8 + 0.1, 1.08, -2.885], [sx * 0.8 + 0.1, 1.2, -2.885], [sx * 0.8 - 0.1, 1.2, -2.885]], [sx * 0.8, 1.14, -4]);
  b.set(DK, MAT.metal); b.box(-0.9, 2.1, 1.5, 0.9, 2.18, 2.3); b.cyl(1.0, 2.1, 2.1, 1.04, 3.6, 2.25, 0.008, 0.004, 4); b.box(-0.4, 1.0, 2.5, 0.4, 1.55, 2.58); // roof rack, aerial, spare
  for (const z of TIGR.ax) for (const sx of [-1, 1]) tyre(b, sx * 0.98, TIGR.wr, z, TIGR.wr, 0.34, z < 0 ? 3 : 4, [0.15, 0.16, 0.12]);
  b.part = 1; const tz = TIGR.tz; b.set(GD, MAT.rus); b.cyl(0, 2.1, tz, 0, 2.25, tz, 0.42, 0.38, 14); b.box(-0.06, 2.25, tz - 0.1, 0.06, 2.45, tz + 0.1); // mount ring, pedestal
  b.set(DK, MAT.metal); b.box(-0.32, 2.25, tz - 0.05, -0.2, 2.6, tz + 0.12); b.box(0.22, 2.3, tz - 0.25, 0.42, 2.55, tz + 0.05); // shield post, sight box
  b.part = 2; const gy = TIGR.gy; b.set([0.09, 0.11, 0.065], MAT.paint);
  for (const sx of [-0.2, 0.2]) { b.cyl(sx, gy, TIGR.gz + 0.6, sx, gy, TIGR.mz, 0.1, 0.1, 14); b.cyl(sx, gy, TIGR.gz + 0.6, sx, gy, TIGR.gz + 0.66, 0.11, 0.11, 14); b.cyl(sx, gy, TIGR.mz + 0.06, sx, gy, TIGR.mz, 0.11, 0.11, 14); } // twin launch tubes with end rings
  b.set(DK, MAT.metal); for (const sx of [-0.2, 0.2]) b.cyl(sx, gy, TIGR.mz, sx, gy, TIGR.mz - 0.01, 0.085, 0.085, 12); b.box(-0.09, gy - 0.1, TIGR.gz - 0.15, 0.09, gy + 0.12, TIGR.gz + 0.25); b.set([0.04, 0.06, 0.09], MAT.glass); b.box(-0.06, gy - 0.05, TIGR.gz - 0.152, 0.06, gy + 0.07, TIGR.gz - 0.15); // sight between them
  return b.build();
}
export const BTR = { ty: 2.02, tz: -0.75, gy: 2.25, gz: -1.05, mz: -3.55, hl: 3.0, hw: 1.2, rad: 2.6, hh: 2.02, th: 2.6, tr: 0.82, bx: 1.45, bz: 3.75, cr: 1.6, cs: 2.0, wr: 0.55, ax: [-2.35, -0.95, 0.75, 2.15] };
export function buildBTR() { // BTR-82A: eight wheels, boat hull, one-man turret with the 30 mm
  const b = new MB(), G = [0.075, 0.092, 0.052], GD = [0.06, 0.075, 0.045], DK = [0.03, 0.031, 0.034];
  b.part = 0; b.set(GD, MAT.rus);
  extX(b, [[0.5, -3.1], [0.95, -3.85], [1.35, -3.75], [2.0, -2.2], [2.02, 3.0], [1.62, 3.82], [0.75, 3.75], [0.5, 3.2]], -1.18, 1.18); // lower and upper hull
  b.set(G, MAT.rus); for (const sx of [-1, 1]) extX(b, [[1.1, -3.1], [1.62, -2.3], [1.95, -2.2], [1.95, 3.0], [1.55, 3.6], [1.1, 3.4]], sx > 0 ? 1.18 : -1.47, sx > 0 ? 1.47 : -1.18); // sloped side sponsons
  for (const sx of [-1, 1]) { b.set(GD, MAT.rus); b.box(sx * 1.47 - 0.04, 1.2, -0.2, sx * 1.47 + 0.04, 1.75, 0.6); b.set(DK, MAT.metal); for (let k = 0; k < 3; k++) b.box(sx * 1.46 - 0.02, 1.62, -2.0 + k * 1.6, sx * 1.46 + 0.02, 1.72, -1.8 + k * 1.6); } // side hatches, firing ports
  b.set([0.03, 0.04, 0.05], MAT.glass); for (const sx of [-1, 1]) poly(b, [[sx * 0.55 - 0.22, 1.72, -2.47], [sx * 0.55 + 0.22, 1.72, -2.47], [sx * 0.55 + 0.22, 1.85, -2.29], [sx * 0.55 - 0.22, 1.85, -2.29]], [sx * 0.55, 1.8, -3]); // driver's vision blocks
  b.set([1, 0.95, 0.82], MAT.head); for (const sx of [-1, 1]) poly(b, [[sx * 0.95 - 0.08, 1.38, -3.79], [sx * 0.95 + 0.08, 1.38, -3.79], [sx * 0.95 + 0.08, 1.5, -3.77], [sx * 0.95 - 0.08, 1.5, -3.77]], [sx * 0.95, 1.44, -5]);
  b.set(DK, MAT.metal); b.box(-0.6, 2.02, 1.2, 0.6, 2.05, 2.6); for (let k = 0; k < 6; k++) b.box(-0.55, 2.05, 1.3 + k * 0.22, 0.55, 2.07, 1.38 + k * 0.22); // engine grille
  b.box(-1.25, 0.95, -3.95, 1.25, 1.02, -3.82); // trim vane edge
  for (const z of BTR.ax) for (const sx of [-1, 1]) tyre(b, sx * 1.22, BTR.wr, z, BTR.wr, 0.36, 3 + BTR.ax.indexOf(z), [0.05, 0.065, 0.04]);
  b.part = 1; const tz = BTR.tz; b.set(G, MAT.rus); b.cyl(0, 2.02, tz, 0, 2.4, tz, 0.82, 0.62, 16); b.cyl(0.25, 2.4, tz + 0.2, 0.25, 2.46, tz + 0.2, 0.26, 0.26, 12);
  b.set(DK, MAT.metal); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) b.cyl(sx * 0.72, 2.25, tz + 0.1 + k * 0.13, sx * 0.86, 2.38, tz + k * 0.13, 0.04, 0.04, 6); b.box(-0.55, 2.3, tz - 0.62, -0.3, 2.5, tz - 0.4);
  b.part = 2; const gy = BTR.gy; b.set(G, MAT.rus); b.box(-0.16, gy - 0.12, -1.35, 0.16, gy + 0.12, -0.95);
  b.set(DK, MAT.metal); b.cyl(0, gy, -1.3, 0, gy, BTR.mz, 0.035, 0.032, 8); b.cyl(0, gy, BTR.mz + 0.22, 0, gy, BTR.mz, 0.05, 0.05, 8); b.cyl(0.16, gy, -1.3, 0.16, gy, -1.9, 0.018, 0.018, 6);
  return b.build();
}
