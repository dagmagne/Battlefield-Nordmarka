// Assault buggy and motorcycle team, with their seated riders. Local frame as in tank.js: x right, y up, forward = -z.
import { MB, MAT } from './mesh.js';
import { poly, extX, extY, mirror } from './vehutil.js';
import { tyre } from './wheeled.js';
const rider = (b, x, y, z, lean, gun) => { // seated soldier in white winter overalls, helmet, rifle across (phase 6 brings proper infantry)
  const W = [0.3, 0.32, 0.3], WD = [0.22, 0.24, 0.22], SK = [0.36, 0.28, 0.22], k = 0.85, bx = (x0, y0, z0, x1, y1, z1, t, u) => b.box(x0 * k, y0 * k, z0 * k, x1 * k, y1 * k, z1 * k, (t || 0) * k, (u || 0) * k); // 85 % scale, grey-white overalls
  b.at(x, y, z, 0, lean); b.set(W, MAT.paint); bx(-0.19, 0.0, -0.12, 0.19, 0.55, 0.13, 0.03, 0.02); // torso
  b.set(WD, MAT.paint); bx(-0.19, -0.08, -0.45, -0.03, 0.06, 0.05); bx(0.03, -0.08, -0.45, 0.19, 0.06, 0.05); bx(-0.18, -0.5, -0.5, -0.04, -0.06, -0.38); bx(0.04, -0.5, -0.5, 0.18, -0.06, -0.38); // thighs, shins
  b.set(W, MAT.paint); bx(-0.27, 0.22, -0.32, -0.17, 0.5, -0.06); bx(0.17, 0.22, -0.32, 0.27, 0.5, -0.06); b.set([0.12, 0.12, 0.11], MAT.paint); bx(-0.27, 0.2, -0.4, -0.17, 0.3, -0.3); bx(0.17, 0.2, -0.4, 0.27, 0.3, -0.3); // arms forward, gloves
  b.set(SK, MAT.paint); bx(-0.07, 0.56, -0.08, 0.07, 0.72, 0.07); b.set([0.36, 0.38, 0.35], MAT.paint); b.cyl(0, 0.68 * k, 0, 0, 0.82 * k, 0, 0.13 * k, 0.1 * k, 10); // face, helmet with a grey-white cover
  if (gun) { b.set([0.04, 0.04, 0.04], MAT.metal); bx(-0.26, 0.24, -0.8, -0.2, 0.32, 0.05); }
  b.at(0, 0, 0);
};
export const BUGGY = { ty: 1.55, tz: 0.45, gy: 1.78, gz: 0.45, mz: -0.55, hl: 1.45, hw: 0.82, rad: 1.6, hh: 1.45, th: 1.95, tr: 0.25, bx: 0.95, bz: 1.75, cr: 1.0, cs: 0.8, wr: 0.38, ax: [-1.15, 1.15] };
export function buildBuggy() { // light assault buggy: tube frame, two crew, PKM on the roll bar
  const b = new MB(), T = [0.11, 0.12, 0.1], DK = [0.03, 0.031, 0.034], P = [0.07, 0.085, 0.05];
  b.part = 0; b.set(P, MAT.rus); b.box(-0.62, 0.42, -1.55, 0.62, 0.62, 1.45, 0.05, 0.05); b.box(-0.45, 0.62, -1.6, 0.45, 0.82, -0.75, 0.05, 0.12); // floor pan, nose
  b.set(DK, MAT.metal); b.box(-0.55, 0.62, 1.0, 0.55, 0.9, 1.5); b.box(-0.82, 0.45, 1.55, 0.82, 0.58, 1.65); // engine box, rear bumper
  b.set(T, MAT.metal); const tube = (x0, y0, z0, x1, y1, z1) => b.cyl(x0, y0, z0, x1, y1, z1, 0.03, 0.03, 6);
  for (const sx of [-1, 1]) { tube(sx * 0.6, 0.62, -1.1, sx * 0.55, 1.45, -0.35); tube(sx * 0.55, 1.45, -0.35, sx * 0.55, 1.5, 0.75); tube(sx * 0.55, 1.5, 0.75, sx * 0.6, 0.62, 1.3); tube(sx * 0.6, 0.62, -1.1, sx * 0.62, 0.62, 1.3); tube(sx * 0.62, 0.8, 1.0, sx * 0.85, 0.75, 1.15); }
  tube(-0.55, 1.45, -0.35, 0.55, 1.45, -0.35); tube(-0.55, 1.5, 0.75, 0.55, 1.5, 0.75); tube(-0.55, 1.5, 0.2, 0.55, 1.5, 0.2);
  for (const sx of [-1, 1]) { b.set(DK, MAT.rubber); b.box(sx * 0.3 - 0.2, 0.62, -0.25, sx * 0.3 + 0.2, 0.8, 0.2); b.box(sx * 0.3 - 0.2, 0.8, 0.15, sx * 0.3 + 0.2, 1.25, 0.25); } // seats
  rider(b, -0.3, 0.86, 0.0, -0.05, false); rider(b, 0.3, 0.86, 0.0, -0.05, false);
  b.set(DK, MAT.metal); b.cyl(-0.3, 1.18, -0.42, -0.3, 1.25, -0.6, 0.16, 0.16, 10); // steering wheel
  for (const z of BUGGY.ax) for (const sx of [-1, 1]) tyre(b, sx * 0.86, BUGGY.wr, z, BUGGY.wr, 0.28, z < 0 ? 3 : 4, [0.1, 0.1, 0.09]);
  b.part = 1; b.set(DK, MAT.metal); b.cyl(0, 1.5, BUGGY.tz, 0, 1.72, BUGGY.tz, 0.03, 0.03, 6);
  b.part = 2; const gy = BUGGY.gy; b.set(DK, MAT.metal); b.box(-0.05, gy - 0.07, 0.25, 0.05, gy + 0.05, 0.75); b.cyl(0, gy, 0.25, 0, gy, BUGGY.mz, 0.02, 0.02, 6); b.box(-0.08, gy - 0.18, 0.3, 0.08, gy - 0.07, 0.45); // PKM, ammo box
  return b.build();
}
export const MOTO = { ty: 1.0, tz: 0.15, gy: 1.35, gz: 0.15, mz: -0.4, hl: 0.9, hw: 0.35, rad: 1.0, hh: 1.3, th: 1.3, tr: 0, bx: 0.42, bz: 1.1, cr: 0.7, cs: 0.5, wr: 0.33, ax: [-0.72, 0.68] };
export function buildMoto() { // dirt bike with a rider and a pillion gunner
  const b = new MB(), DK = [0.03, 0.031, 0.034], P = [0.08, 0.09, 0.06];
  b.part = 0; b.set(P, MAT.paint); b.box(-0.12, 0.62, -0.45, 0.12, 0.9, 0.15, 0.03, 0.05); b.box(-0.1, 0.78, 0.1, 0.1, 0.86, 0.75); // tank, seat
  b.set(DK, MAT.metal); b.box(-0.13, 0.32, -0.25, 0.13, 0.62, 0.2, 0.02, 0.02); b.cyl(0.14, 0.4, 0.1, 0.16, 0.55, 0.75, 0.05, 0.04, 8); // engine, exhaust
  b.cyl(0, 0.33, -0.72, 0, 1.0, -0.5, 0.025, 0.025, 6); b.cyl(-0.38, 1.02, -0.5, 0.38, 1.02, -0.5, 0.015, 0.015, 6); b.cyl(0, 0.33, 0.68, 0, 0.62, 0.15, 0.025, 0.025, 6); // forks, bars, swing arm
  b.set(P, MAT.paint); b.box(-0.09, 0.66, -0.85, 0.09, 0.7, -0.55); b.box(-0.08, 0.62, 0.55, 0.08, 0.66, 0.95); // mudguards
  rider(b, 0, 0.84, -0.1, 0.25, false); rider(b, 0, 0.84, 0.45, 0.1, true);
  for (const [k, z] of MOTO.ax.entries()) tyre(b, 0.05, MOTO.wr, z, MOTO.wr, 0.11, 3 + k, [0.12, 0.12, 0.12]);
  b.part = 1; b.part = 2; b.set(DK, MAT.metal); b.box(-0.02, 1.32, 0.1, 0.02, 1.37, MOTO.mz); // the pillion's PKM barrel (parts 1/2 follow the gunner's aim)
  return b.build();
}
