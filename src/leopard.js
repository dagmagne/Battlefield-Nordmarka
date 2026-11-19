// Leopard 2A4NO, the player's tank. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
// Parts: 0 hull, 1 turret (turns about (0, *, LEO.tz)), 2 gun (elevates about (LEO.gy, LEO.gz), muzzle at z = LEO.mz).
import { MB, MAT } from './mesh.js';
import { extX, mirror } from './vehutil.js';
import { runningGear, face, cbox, plate, lathe, pipe, fixWinding } from './gear.js';

// turret ring centre, gun trunnion and muzzle of the Leopard (hull coordinates)
export const LEO = { ty: 1.58, tz: -0.25, gy: 1.97, gz: -1.6, mz: -6.2, hl: 2.9, hw: 1.43, rad: 2.6, hh: 1.6, th: 2.45, tr: 1.75 };

// welded shell from a plan: P = [x, z, yTop, yBelt, bottom x, bottom z, bottom y] per corner. Vertical walls from the belt up to a small
// chamfer (ch) under the roof, an undercut from the belt in to the bottom outline; roofs / floors = corner index lists of flat caps
function shell(b, P, ch, roofs, floors) {
  const n = P.length; let ar = 0;
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; }
  const s = ar > 0 ? 1 : -1, N = [];
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; N.push([s * dz / l, -s * dx / l]); }
  const T = [], W = [], B = [], U = [];
  for (let i = 0; i < n; i++) {
    const p = P[i], a = N[(i + n - 1) % n], c = N[i]; let mx = a[0] + c[0], mz = a[1] + c[1]; const k = 1 / Math.max(0.3, (mx * c[0] + mz * c[1]));
    mx *= k; mz *= k;
    T.push([p[0] - mx * ch, p[2], p[1] - mz * ch]); W.push([p[0], p[2] - ch, p[1]]); B.push([p[0], p[3], p[1]]); U.push([p[4], p[6], p[5]]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, h = N[i];
    face(b, [W[i], W[j], T[j], T[i]], [h[0], 1, h[1]]); face(b, [B[i], B[j], W[j], W[i]], [h[0], 0, h[1]]); face(b, [U[i], U[j], B[j], B[i]], [h[0], -0.6, h[1]]);
  }
  for (const r of roofs) face(b, r.map((i) => T[i]), [0, 1, 0]);
  for (const r of floors) face(b, r.map((i) => U[i]), [0, -1, 0]);
}

export function buildLeopard() {
  const b = new MB();
  const GRN = [0.042, 0.052, 0.03], DGRN = [0.03, 0.037, 0.023], DARK = [0.03, 0.031, 0.034], STEEL = [0.2, 0.21, 0.22], GLASS = [0.02, 0.035, 0.05];
  const BLK = [0.012, 0.012, 0.013], CANVAS = [0.075, 0.08, 0.055], TARP = [0.2, 0.21, 0.17];
  runningGear(b, 7, 0.35, -2.35, 2.45, DGRN, true);
  const i0 = b.i.length;
  const bx = (x0, y0, z0, x1, y1, z1, c) => cbox(b, x0, y0, z0, x1, y1, z1, c);
  b.part = 0;
  // ---------- hull: lower tub between the tracks, upper hull with the sponsons over them ----------
  b.set(DGRN, MAT.camo);
  extX(b, [[0.5, -3.2], [0.97, -3.77], [0.97, 3.76], [0.62, 3.76], [0.48, 3.42]], -1.08, 1.08); // stops inside the upper hull: no coplanar faces
  b.set(GRN, MAT.camo);
  extX(b, [[0.93, -3.7], [1.0, -3.84], [1.05, -3.82], [1.47, -2.3], [1.5, 3.66], [1.44, 3.78], [0.93, 3.78]], -1.78, 1.78);
  const GA = Math.atan2(0.42, 1.52), Gy = (z) => 1.05 + (z + 3.82) * 0.42 / 1.52, GN = [0, Math.cos(GA), -Math.sin(GA)];
  // glacis armour plate, the joint to the roof, lifting eyes
  plate(b, [[-1.66, Gy(-3.72), -3.72], [1.66, Gy(-3.72), -3.72], [1.66, Gy(-2.52), -2.52], [-1.66, Gy(-2.52), -2.52]], GN, 0.022);
  b.set(DGRN, MAT.camo); bx(-1.72, 1.455, -2.36, 0.24, 1.492, -2.27, 0.012); bx(1.08, 1.455, -2.36, 1.72, 1.492, -2.27, 0.012);
  // driver's hatch (right) with three periscopes on the glacis top
  b.set(GRN, MAT.camo); bx(0.28, 1.47, -2.27, 1.04, 1.545, -1.6, 0.02);
  b.set(DGRN, MAT.camo); bx(0.36, 1.545, -2.2, 0.96, 1.56, -1.72, 0.008); b.set(STEEL, MAT.metal); b.box(0.5, 1.56, -2.0, 0.54, 1.585, -1.86);
  for (const x of [0.42, 0.66, 0.9]) {
    b.set(DGRN, MAT.camo); b.box(x - 0.1, 1.4, -2.44, x + 0.1, 1.535, -2.27, 0.012, 0.03, 0.0);
    b.set(GLASS, MAT.glass); face(b, [[x - 0.08, 1.46, -2.431], [x + 0.08, 1.46, -2.431], [x + 0.076, 1.52, -2.4175], [x - 0.076, 1.52, -2.4175]], [0, 0.3, -1]);
  }
  for (const sx of [-1, 1]) {
    // headlight cluster on the glacis: housing, main lamp, blackout lamp, guard bar
    b.at(sx * 1.32, Gy(-3.12), -3.12, 0, -GA);
    b.set(DGRN, MAT.camo); bx(-0.2, 0.0, -0.11, 0.2, 0.16, 0.1, 0.02);
    b.set(STEEL, MAT.metal); b.cyl(-sx * 0.085, 0.085, -0.1, -sx * 0.085, 0.085, -0.125, 0.064, 0.064, 12, 0); b.cyl(sx * 0.1, 0.08, -0.1, sx * 0.1, 0.08, -0.12, 0.04, 0.04, 8, 0);
    b.set([1, 0.95, 0.82], MAT.head); b.cyl(-sx * 0.085, 0.085, -0.118, -sx * 0.085, 0.085, -0.122, 0.055, 0.055, 12);
    b.set(GLASS, MAT.glass); b.cyl(sx * 0.1, 0.08, -0.114, sx * 0.1, 0.08, -0.117, 0.032, 0.032, 8);
    b.set(DARK, MAT.metal); pipe(b, [[-0.2, 0.0, -0.16], [-0.2, 0.2, -0.14], [0.2, 0.2, -0.14], [0.2, 0.0, -0.16]], 0.012, 5);
    b.at(0, 0, 0);
    b.set(STEEL, MAT.metal); b.box(sx * 1.52 - 0.02, Gy(-2.62) - 0.01, -2.68, sx * 1.52 + 0.02, Gy(-2.62) + 0.07, -2.58); // lifting eye
    // rear-view mirror on a stalk at the glacis corner
    b.set(DARK, MAT.metal); pipe(b, [[sx * 1.62, Gy(-3.3), -3.3], [sx * 1.7, Gy(-3.3) + 0.3, -3.36], [sx * 1.74, Gy(-3.3) + 0.42, -3.36]], 0.012, 5);
    bx(Math.min(sx * 1.66, sx * 1.84), Gy(-3.3) + 0.36, -3.385, Math.max(sx * 1.66, sx * 1.84), Gy(-3.3) + 0.5, -3.36, 0.008);
    b.set(GLASS, MAT.glass); face(b, [[sx * 1.675, Gy(-3.3) + 0.375, -3.357], [sx * 1.825, Gy(-3.3) + 0.375, -3.357], [sx * 1.825, Gy(-3.3) + 0.485, -3.357], [sx * 1.675, Gy(-3.3) + 0.485, -3.357]], [0, 0, 1]);
    // tow shackle on the lower front plate, rubber mud flap in front of the track
    b.box(sx * 0.72 - 0.04, 0.68, -3.62, sx * 0.72 + 0.04, 0.9, -3.48); b.set(DARK, MAT.metal); b.cyl(sx * 0.72 - 0.07, 0.78, -3.64, sx * 0.72 + 0.07, 0.78, -3.64, 0.035, 0.035, 8);
    b.set(DARK, MAT.rubber); b.box(sx * 1.43 - 0.34, 0.56, -3.735, sx * 1.43 + 0.34, 0.935, -3.7);
    // side skirts: three heavy armour modules at the front ...
    b.set(GRN, MAT.camo);
    extX(b, [[0.42, -3.2], [0.66, -3.75], [1.17, -3.75], [1.17, -2.86], [0.42, -2.86]], sx * 1.79, sx * 1.885);
    bx(Math.min(sx * 1.79, sx * 1.885), 0.42, -2.84, Math.max(sx * 1.79, sx * 1.885), 1.17, -1.96, 0.018);
    bx(Math.min(sx * 1.79, sx * 1.885), 0.42, -1.94, Math.max(sx * 1.79, sx * 1.885), 1.17, -1.06, 0.018);
    b.set(DGRN, MAT.camo);
    for (let k = 0; k < 3; k++) { const z = -3.62 + k * 0.9; plate(b, k ? [[sx * 1.885, 0.5, z], [sx * 1.885, 0.5, z + 0.72], [sx * 1.885, 1.1, z + 0.72], [sx * 1.885, 1.1, z]] : [[sx * 1.885, 0.5, -3.3], [sx * 1.885, 0.5, -2.9], [sx * 1.885, 1.1, -2.9], [sx * 1.885, 1.1, -3.62], [sx * 1.885, 0.72, -3.62]], [sx, 0, 0], 0.012); pipe(b, [[sx * 1.897, 0.92, z + 0.22], [sx * 1.93, 0.92, z + 0.22], [sx * 1.93, 0.92, z + 0.5], [sx * 1.897, 0.92, z + 0.5]], 0.011, 4); } // bolted-on face plates, grab handles
    // ... and four light plates with cut lower corners behind them, hung from a rail
    b.set(GRN, MAT.camo);
    for (let k = 0; k < 4; k++) {
      const z0 = -1.04 + k * 0.94, z1 = z0 + 0.92;
      extX(b, [[0.66, z0], [0.52, z0 + 0.16], [0.52, z1 - 0.16], [0.66, z1], [1.13, z1], [1.13, z0]], sx * 1.795, sx * 1.83);
      b.box(Math.min(sx * 1.83, sx * 1.842), 0.56, z0 + 0.44, Math.max(sx * 1.83, sx * 1.842), 1.1, z0 + 0.48);
      for (const zz of [z0 + 0.14, z1 - 0.2]) b.box(Math.min(sx * 1.785, sx * 1.86), 1.1, zz, Math.max(sx * 1.785, sx * 1.86), 1.2, zz + 0.06); // hinge brackets
    }
    b.set(DGRN, MAT.camo); b.box(Math.min(sx * 1.785, sx * 1.85), 1.125, -1.04, Math.max(sx * 1.785, sx * 1.85), 1.165, 2.72);
    b.set(DGRN, MAT.camo); b.box(Math.min(sx * 1.77, sx * 1.805), 1.455, -2.3, Math.max(sx * 1.77, sx * 1.805), 1.49, 3.7);
    // rear mud guard over the sprocket, rubber flap behind the track
    b.set(GRN, MAT.camo); b.box(Math.min(sx * 1.785, sx * 1.82), 0.9, 2.74, Math.max(sx * 1.785, sx * 1.82), 1.165, 3.78);
    b.set(DARK, MAT.rubber); b.box(sx * 1.43 - 0.35, 0.5, 3.785, sx * 1.43 + 0.35, 0.94, 3.81);
    // tow cable along the roof edge with its eyes, cable clamps
    b.set(STEEL, MAT.metal); pipe(b, [[sx * 1.6, 1.525, -1.9], [sx * 1.68, 1.525, -1.5], [sx * 1.68, 1.53, 1.3], [sx * 1.62, 1.585, 1.74], [sx * 1.62, 1.585, 3.3]], 0.022, 6);
    b.cyl(sx * 1.6, 1.51, -1.98, sx * 1.6, 1.545, -1.98, 0.07, 0.07, 8); b.cyl(sx * 1.62, 1.565, 3.38, sx * 1.62, 1.6, 3.38, 0.07, 0.07, 8);
    b.set(DGRN, MAT.camo); for (const z of [-0.9, 0.3, 2.3]) b.box(sx * 1.66 - 0.05, z < 1.7 ? 1.5 : 1.555, z, sx * 1.66 + 0.05, z < 1.7 ? 1.565 : 1.62, z + 0.06);
    // ---------- engine deck: fan grille (rim, dark mesh with rings and ribs, hub), intake louvres ----------
    const fx = sx * 0.86, fz = 2.98, dy = 1.555;
    b.set(GRN, MAT.camo); lathe(b, 1, fx, dy, fz, [[0, 0.57], [0.04, 0.555], [0.04, 0.5], [0.012, 0.5]], 22);
    b.set(BLK, MAT.metal); b.cyl(fx, dy, fz, fx, dy + 0.012, fz, 0.5, 0.5, 22);
    b.set(DARK, MAT.metal); for (const r of [0.16, 0.28, 0.4]) lathe(b, 1, fx, dy + 0.012, fz, [[0, r + 0.022], [0.02, r], [0, r - 0.022]], 18);
    for (let k = 0; k < 6; k++) { b.at(fx, dy, fz, k * Math.PI / 6); b.box(-0.5, 0.012, -0.012, 0.5, 0.036, 0.012); } b.at(0, 0, 0);
    b.set(DGRN, MAT.camo); b.cyl(fx, dy + 0.012, fz, fx, dy + 0.05, fz, 0.1, 0.085, 10);
    b.set(BLK, MAT.metal); b.box(sx * 0.92 - 0.5, dy, 1.84, sx * 0.92 + 0.5, dy + 0.008, 2.3);
    b.set(DGRN, MAT.camo); for (let k = 0; k < 6; k++) { b.at(sx * 0.92, dy + 0.02, 1.88 + k * 0.076, 0, 0.5); b.box(-0.5, -0.004, -0.032, 0.5, 0.004, 0.032); } b.at(0, 0, 0);
    b.box(sx * 0.92 - 0.53, dy, 1.81, sx * 0.92 - 0.5, dy + 0.045, 2.33); b.box(sx * 0.92 + 0.5, dy, 1.81, sx * 0.92 + 0.53, dy + 0.045, 2.33);
    // ---------- rear plate: round exhaust grille with louvres, tail light cluster, tow hook ----------
    const ex = sx * 1.24, ey = 1.19, ez = 3.782;
    b.set(GRN, MAT.camo); lathe(b, 2, ex, ey, ez, [[0, 0.33], [0.035, 0.315], [0.035, 0.27], [0.01, 0.27]], 20);
    b.set(BLK, MAT.metal); b.cyl(ex, ey, ez, ex, ey, ez + 0.01, 0.27, 0.27, 20);
    b.set(DARK, MAT.metal); for (let k = -3; k <= 3; k++) { const yy = k * 0.07, hw = Math.sqrt(0.27 * 0.27 - yy * yy) - 0.01; b.at(ex, ey + yy, ez + 0.02, 0, -0.5); b.box(-hw, -0.004, -0.03, hw, 0.004, 0.03); } b.at(0, 0, 0);
    b.set(DGRN, MAT.camo); bx(sx * 0.62 - 0.12, 1.22, 3.775, sx * 0.62 + 0.12, 1.32, 3.82, 0.01);
    b.set([1, 0.05, 0.02], MAT.head); face(b, [[sx * 0.62 - 0.095, 1.24, 3.822], [sx * 0.62 - 0.01, 1.24, 3.822], [sx * 0.62 - 0.01, 1.3, 3.822], [sx * 0.62 - 0.095, 1.3, 3.822]], [0, 0, 1]);
    b.set([0.22, 0.07, 0.01], MAT.glass); face(b, [[sx * 0.62 + 0.02, 1.24, 3.822], [sx * 0.62 + 0.095, 1.24, 3.822], [sx * 0.62 + 0.095, 1.3, 3.822], [sx * 0.62 + 0.02, 1.3, 3.822]], [0, 0, 1]);
    b.set(STEEL, MAT.metal); b.box(sx * 0.78 - 0.04, 0.66, 3.74, sx * 0.78 + 0.04, 0.88, 3.88); b.set(DARK, MAT.metal); b.cyl(sx * 0.78 - 0.07, 0.76, 3.9, sx * 0.78 + 0.07, 0.76, 3.9, 0.035, 0.035, 8);
  }
  // raised engine deck with its cover plates, travel lock for the gun at the rear edge
  b.set(GRN, MAT.camo); bx(-1.56, 1.49, 1.72, 1.56, 1.555, 3.66, 0.02);
  b.set(DGRN, MAT.camo); bx(-0.3, 1.555, 1.8, 0.3, 1.6, 3.2, 0.015); b.set(GRN, MAT.camo); bx(-0.22, 1.6, 1.95, 0.22, 1.615, 2.5, 0.006);
  b.set(STEEL, MAT.metal); for (const z of [2.75, 3.05]) pipe(b, [[-0.1, 1.6, z], [-0.1, 1.64, z], [0.1, 1.64, z], [0.1, 1.6, z]], 0.01, 4);
  b.set(DGRN, MAT.camo); pipe(b, [[-0.3, 1.555, 3.58], [-0.1, 1.64, 3.4], [0.1, 1.64, 3.4], [0.3, 1.555, 3.58]], 0.026, 6); b.set(DARK, MAT.metal); lathe(b, 1, 0, 1.63, 3.3, [[0, 0.11], [0.05, 0.11], [0.05, 0.08], [0, 0.08], [0, 0.11]], 10);
  // rear plate centre: convoy cross, towing pintle, infantry phone box, spare track links
  b.set(BLK, MAT.metal); bx(-0.11, 1.12, 3.775, 0.11, 1.34, 3.8, 0.008);
  b.set([0.8, 0.8, 0.78], MAT.paint); b.box(-0.075, 1.218, 3.8, 0.075, 1.242, 3.806); b.box(-0.012, 1.155, 3.8, 0.012, 1.305, 3.806);
  b.set(STEEL, MAT.metal); b.box(-0.07, 0.7, 3.74, 0.07, 0.86, 3.9); b.cyl(0, 0.9, 3.86, 0, 0.66, 3.86, 0.03, 0.03, 8);
  b.set(DGRN, MAT.camo); bx(-0.78, 0.97, 3.775, -0.6, 1.16, 3.86, 0.012);
  b.set(DARK, MAT.metal); for (let k = 0; k < 3; k++) { const x = 0.28 + k * 0.17; bx(x, 0.98, 3.775, x + 0.15, 1.12, 3.835, 0.012); }
  b.set(DGRN, MAT.camo); b.box(0.24, 0.955, 3.775, 0.82, 0.975, 3.85);

  // ---------- turret (part 1): welded slab-sided shell, roof falling to the front, undercut bustle ----------
  b.part = 1;
  b.set(DGRN, MAT.camo); b.cyl(0, 1.5, LEO.tz, 0, 1.61, LEO.tz, 1.15, 1.15, 28, 0);
  b.set(GRN, MAT.camo);
  const RS = 0.075, RA = Math.atan(RS), RY = (z) => (z < -0.9 ? 2.4 + (z + 0.9) * RS : 2.4), RN = [0, Math.cos(RA), -Math.sin(RA)];
  const half = [[0.47, -1.84, 1.64, 0.47, -1.84, 1.6], [0.47, -2.06, 1.64, 0.47, -2.02, 1.6], [1.36, -1.9, 1.66, 1.28, -1.86, 1.6], [1.5, -0.9, 1.67, 1.4, -0.9, 1.6],
    [1.52, 0.75, 1.67, 1.42, 0.72, 1.6], [1.5, 1.05, 1.85, 1.42, 1.1, 1.81], [1.26, 2.62, 1.85, 1.18, 2.56, 1.81]].map((p) => [p[0], p[1], RY(p[1]), p[2], p[3], p[4], p[5]]);
  const TP = half.concat(half.slice().reverse().map((p) => [-p[0], p[1], p[2], p[3], -p[4], p[5], p[6]]));
  shell(b, TP, 0.03, [[0, 1, 2, 3], [13, 12, 11, 10], [0, 3, 10, 13], [3, 4, 5, 6, 7, 8, 9, 10]], [[0, 1, 2, 3], [13, 12, 11, 10], [0, 3, 10, 13], [3, 4, 9, 10], [4, 5, 8, 9], [5, 6, 7, 8]]);
  b.set(BLK, MAT.void); face(b, [[-0.46, 1.64, -1.846], [0.46, 1.64, -1.846], [0.46, 2.3, -1.846], [-0.46, 2.3, -1.846]], [0, 0, -1]);
  // roof plates: the left front armour plate on the slope, blow-off panels on the bustle
  b.set(DGRN, MAT.camo);
  plate(b, [[-1.2, RY(-1.78), -1.78], [-0.55, RY(-1.78), -1.78], [-0.55, RY(-1.0), -1.0], [-1.3, RY(-1.0), -1.0]], RN, 0.018);
  plate(b, [[-1.12, 2.4, 1.3], [-0.16, 2.4, 1.3], [-0.16, 2.4, 2.46], [-1.12, 2.4, 2.46]], [0, 1, 0], 0.02);
  plate(b, [[0.22, 2.4, 1.42], [1.08, 2.4, 1.42], [1.08, 2.4, 2.46], [0.22, 2.4, 2.46]], [0, 1, 0], 0.02);
  b.set(STEEL, MAT.metal); for (const [x, z] of [[-1.05, -1.5], [-0.3, -0.75], [0.0, 1.9]]) pipe(b, [[x - 0.05, RY(z), z], [x - 0.05, RY(z) + 0.055, z], [x + 0.05, RY(z) + 0.055, z], [x + 0.05, RY(z), z]], 0.011, 4);
  // EMES 15 gunner's sight on the right front roof: armoured housing, window with its doors swung open, the trough in front of it
  b.set(GRN, MAT.camo); bx(0.66, 2.2, -1.52, 1.3, 2.6, -0.92, 0.028);
  b.set(BLK, MAT.void); face(b, [[0.72, 2.4, -1.523], [1.24, 2.4, -1.523], [1.24, 2.565, -1.523], [0.72, 2.565, -1.523]], [0, 0, -1]);
  b.set(GLASS, MAT.glass); face(b, [[0.76, 2.42, -1.526], [1.2, 2.42, -1.526], [1.2, 2.55, -1.526], [0.76, 2.55, -1.526]], [0, 0, -1]);
  b.set(DGRN, MAT.camo); b.box(0.665, 2.3, -1.74, 0.69, 2.585, -1.52); b.box(1.27, 2.3, -1.74, 1.295, 2.585, -1.52); b.box(0.66, 2.585, -1.62, 1.3, 2.61, -1.5);
  b.at(0.98, RY(-1.75), -1.75, 0, -RA); b.box(-0.34, 0, -0.14, -0.31, 0.05, 0.25); b.box(0.31, 0, -0.14, 0.34, 0.05, 0.25); b.at(0, 0, 0);
  // gunner's auxiliary sight port in the right cheek
  b.set(DGRN, MAT.camo); b.cyl(0.66, 2.04, -1.98, 0.66, 2.04, -2.05, 0.062, 0.055, 10); b.set(BLK, MAT.void); b.cyl(0.66, 2.04, -2.051, 0.66, 2.04, -2.053, 0.036, 0.036, 10);
  // PERI R17 commander's panoramic sight
  b.set(GRN, MAT.camo); b.cyl(0.6, 2.39, -0.52, 0.6, 2.5, -0.52, 0.18, 0.17, 14); bx(0.46, 2.5, -0.68, 0.74, 2.83, -0.38, 0.035);
  b.set(GLASS, MAT.glass); face(b, [[0.5, 2.59, -0.683], [0.7, 2.59, -0.683], [0.7, 2.77, -0.683], [0.5, 2.77, -0.683]], [0, 0, -1]);
  // commander's cupola: ring with periscopes all round, domed hatch
  const cx = 0.62, cz = 0.3;
  b.set(GRN, MAT.camo); lathe(b, 1, cx, 0, cz, [[2.39, 0.5], [2.46, 0.5], [2.52, 0.44], [2.52, 0.37]], 20);
  b.set(DGRN, MAT.camo); lathe(b, 1, cx, 0, cz, [[2.52, 0.385], [2.55, 0.375], [2.572, 0.24], [2.58, 0]], 20, 1, true);
  b.set(STEEL, MAT.metal); pipe(b, [[cx - 0.08, 2.57, cz + 0.2], [cx - 0.08, 2.61, cz + 0.2], [cx + 0.08, 2.61, cz + 0.2], [cx + 0.08, 2.57, cz + 0.2]], 0.01, 4);
  for (let k = 0; k < 8; k++) {
    const a = (k - 3.5) * 0.62;
    b.at(cx - Math.sin(a) * 0.45, 2.455, cz - Math.cos(a) * 0.45, a);
    b.set(DGRN, MAT.camo); b.box(-0.1, 0, -0.045, 0.1, 0.085, 0.05, 0.01, 0.012, 0.0);
    b.set(GLASS, MAT.glass); face(b, [[-0.08, 0.015, -0.047], [0.08, 0.015, -0.047], [0.075, 0.07, -0.036], [-0.075, 0.07, -0.036]], [0, 0.2, -1]);
  }
  b.at(0, 0, 0);
  // loader's hatch (left) with the MG3 on its skate rail
  const lx = -0.62, lz = 0.3;
  b.set(GRN, MAT.camo); lathe(b, 1, lx, 0, lz, [[2.39, 0.46], [2.445, 0.46], [2.46, 0.43], [2.46, 0.37]], 18);
  b.set(DGRN, MAT.camo); lathe(b, 1, lx, 0, lz, [[2.46, 0.375], [2.485, 0.365], [2.495, 0.22], [2.498, 0]], 18, 1, true);
  b.box(lx - 0.1, 2.44, lz - 0.52, lx + 0.1, 2.52, lz - 0.42, 0.01, 0.012, 0.0); b.set(GLASS, MAT.glass); face(b, [[lx - 0.08, 2.455, lz - 0.522], [lx + 0.08, 2.455, lz - 0.522], [lx + 0.075, 2.505, lz - 0.512], [lx - 0.075, 2.505, lz - 0.512]], [0, 0.2, -1]);
  b.set(DARK, MAT.metal); lathe(b, 1, lx, 0, lz, [[2.5, 0.54], [2.53, 0.54], [2.53, 0.57], [2.5, 0.57], [2.5, 0.54]], 20);
  for (let k = 0; k < 5; k++) { const a = 0.4 + k * Math.PI * 0.4; b.cyl(lx + Math.sin(a) * 0.555, 2.4, lz + Math.cos(a) * 0.555, lx + Math.sin(a) * 0.555, 2.5, lz + Math.cos(a) * 0.555, 0.014, 0.014, 5, 0); }
  { const mx = -1.02, my = 2.7; // MG3: cradle, receiver with feed cover, perforated jacket, booster, stock, belt box
    b.cyl(mx, 2.52, -0.08, mx, my - 0.05, -0.08, 0.028, 0.022, 6); b.box(mx - 0.05, my - 0.07, -0.2, mx + 0.05, my - 0.045, 0.04);
    bx(mx - 0.034, my - 0.045, -0.3, mx + 0.034, my + 0.04, 0.2, 0.01); b.box(mx - 0.03, my + 0.04, -0.2, mx + 0.03, my + 0.058, 0.1);
    b.cyl(mx, my, -0.3, mx, my, -0.8, 0.024, 0.024, 8, 0); b.cyl(mx, my, -0.8, mx, my, -0.88, 0.03, 0.022, 8); b.box(mx - 0.004, my + 0.024, -0.78, mx + 0.004, my + 0.05, -0.75);
    b.cyl(mx, my - 0.005, 0.2, mx, my - 0.03, 0.5, 0.024, 0.04, 6); b.box(mx - 0.015, my - 0.13, 0.1, mx + 0.015, my - 0.04, 0.15);
    b.set(DGRN, MAT.camo); bx(mx - 0.15, my - 0.12, -0.2, mx - 0.045, my + 0.03, 0.02, 0.008);
  }
  // loading hatch in the left side, turret-side grab rails
  b.set(DGRN, MAT.camo); b.cyl(-1.5, 2.1, -0.1, -1.54, 2.1, -0.1, 0.2, 0.19, 16); b.set(STEEL, MAT.metal); b.box(-1.555, 2.08, -0.16, -1.54, 2.12, -0.04);
  for (const sx of [-1, 1]) {
    // smoke grenade dischargers: a bracket carrying two rows of four tubes fanned forward
    b.set(DGRN, MAT.camo); bx(Math.min(sx * 1.49, sx * 1.56), 1.98, 0.1, Math.max(sx * 1.49, sx * 1.56), 2.32, 0.74, 0.012);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
      const z = 0.2 + k * 0.15, y = 2.04 + r * 0.16, dx = sx * (0.5 + k * 0.1), dz = -0.62 + k * 0.17, dyy = 0.42, l = 0.25 / Math.hypot(dx, dz, dyy);
      b.set(DARK, MAT.metal); b.cyl(sx * 1.555, y, z, sx * 1.555 + dx * l, y + dyy * l, z + dz * l, 0.05, 0.05, 8);
      b.set(BLK, MAT.rubber); b.cyl(sx * 1.555 + dx * l, y + dyy * l, z + dz * l, sx * 1.555 + dx * l * 1.03, y + dyy * l * 1.03, z + dz * l * 1.03, 0.043, 0.043, 8);
    }
    // Norwegian flag on the turret side, behind the dischargers
    const wx = (z) => 1.5 - (z - 1.05) * 0.24 / 1.57, fx = (z) => sx * (wx(z) + 0.006);
    b.set([1, 1, 1], MAT.flag); const z0 = sx > 0 ? 1.7 : 1.22, z1 = sx > 0 ? 1.22 : 1.7; // hoist towards the front on both sides
    b.quad([fx(z1), 2.0, z1], [fx(z0), 2.0, z0], [fx(z0), 2.31, z0], [fx(z1), 2.31, z1], sx > 0 ? [0, 1, 1, 1, 1, 0, 0, 0] : [1, 1, 0, 1, 0, 0, 1, 0]);
    // stowage bin lid on the bustle side with its handle and hinges
    const wn = [sx * 0.9886, 0, 0.1511];
    b.set(DGRN, MAT.camo); plate(b, [[sx * wx(1.84), 1.91, 1.84], [sx * wx(2.56), 1.91, 2.56], [sx * wx(2.56), 2.34, 2.56], [sx * wx(1.84), 2.34, 1.84]], wn, 0.016);
    b.set(STEEL, MAT.metal); pipe(b, [[sx * (wx(2.1) + 0.016), 2.12, 2.1], [sx * (wx(2.1) + 0.05), 2.12, 2.1], [sx * (wx(2.3) + 0.05), 2.12, 2.3], [sx * (wx(2.3) + 0.016), 2.12, 2.3]], 0.009, 4);
    // grab rails on the turret side
    b.set(STEEL, MAT.metal);
    for (const [za, zb, y] of [[-1.5, -1.1, 2.0], [-0.75, -0.35, 1.82]]) { const xa = 1.36 + (za + 1.9) * 0.14 + 0.004, xb = 1.36 + (zb + 1.9) * 0.14 + 0.004; pipe(b, [[sx * xa, y, za], [sx * (xa + 0.045), y, za], [sx * (xb + 0.045), y, zb], [sx * xb, y, zb]], 0.01, 4); }
    // antenna on a sprung base
    b.set(DARK, MAT.metal); b.cyl(sx * 1.14, 2.4, 2.5, sx * 1.14, 2.47, 2.5, 0.045, 0.04, 8); b.cyl(sx * 1.14, 2.47, 2.5, sx * 1.14, 2.6, 2.5, 0.022, 0.018, 6); b.cyl(sx * 1.14, 2.6, 2.5, sx * 1.14 - sx * 0.05, 4.4, 2.68, 0.009, 0.004, 4);
  }
  b.set(STEEL, MAT.metal); b.cyl(0, 2.4, 2.42, 0, 2.76, 2.42, 0.02, 0.02, 5); b.cyl(0, 2.76, 2.42, 0, 2.84, 2.42, 0.045, 0.045, 8); // crosswind sensor
  // stowage basket on the bustle rear: tube frame, mesh floor, a rolled tarpaulin and a box
  b.set(DGRN, MAT.camo);
  for (const y of [1.87, 2.33]) pipe(b, [[-1.22, y, 2.6], [-1.22, y, 3.0], [1.22, y, 3.0], [1.22, y, 2.6]], 0.017, 6);
  for (const x of [-1.22, -0.61, 0, 0.61, 1.22]) b.cyl(x, 1.87, 3.0, x, 2.33, 3.0, 0.014, 0.014, 5, 0);
  b.set(DARK, MAT.metal); b.box(-1.21, 1.86, 2.62, 1.21, 1.872, 2.99);
  b.set(TARP, MAT.cloth); lathe(b, 0, 0, 2.025, 2.81, [[-1.1, 0], [-1.1, 0.12], [-1.02, 0.145], [-0.5, 0.135], [0.1, 0.15], [0.26, 0.13], [0.3, 0.1], [0.3, 0]], 10, 1, true);
  b.set(DARK, MAT.rubber); for (const x of [-0.85, -0.1]) b.cyl(x - 0.015, 2.025, 2.81, x + 0.015, 2.025, 2.81, 0.152, 0.152, 10, 0);
  b.set(GRN, MAT.camo); bx(0.5, 1.873, 2.66, 1.1, 2.2, 2.95, 0.015); b.set(DGRN, MAT.camo); b.box(0.49, 2.15, 2.65, 1.11, 2.165, 2.96);

  // ---------- gun (part 2): mantlet, canvas cover, Rh-120 L/44 with thermal sleeve, fume extractor and muzzle reference mirror ----------
  b.part = 2; const gy = LEO.gy;
  b.set(GRN, MAT.camo); bx(-0.44, gy - 0.32, -2.1, 0.44, gy + 0.3, -1.7, 0.035); b.set(DGRN, MAT.camo); bx(-0.2, gy - 0.2, -2.16, 0.2, gy + 0.2, -2.08, 0.03);
  b.set(DGRN, MAT.camo); b.cyl(-0.3, gy + 0.1, -2.09, -0.3, gy + 0.1, -2.14, 0.055, 0.05, 10); b.set(BLK, MAT.void); b.cyl(-0.3, gy + 0.1, -2.141, -0.3, gy + 0.1, -2.143, 0.03, 0.03, 8); // coax port
  b.set(CANVAS, MAT.cloth); lathe(b, 2, 0, gy, 0, [[-2.15, 0.19], [-2.2, 0.185], [-2.27, 0.15], [-2.33, 0.158], [-2.4, 0.125], [-2.45, 0.13], [-2.5, 0.108]], 16, 1, true);
  b.set(DGRN, MAT.camo);
  const brl = (za, zb, ra, rb, yo = 0) => b.cyl(0, gy + yo, za, 0, gy + yo, zb, ra, rb, 16, 0);
  brl(-2.48, -3.76, 0.098, 0.096);
  brl(-3.76, -3.84, 0.096, 0.136, 0.005); brl(-3.84, -4.52, 0.136, 0.136, 0.01); brl(-4.52, -4.62, 0.136, 0.094, 0.005); // fume extractor, slightly eccentric
  brl(-4.62, -6.0, 0.094, 0.088);
  b.set(GRN, MAT.camo); for (const z of [-2.52, -3.12, -3.71, -4.64, -5.12, -5.58]) brl(z, z - 0.045, 0.103, 0.103); // sleeve joints and clamps
  b.set(DARK, MAT.metal); for (const z of [-3.12, -5.12]) b.box(-0.02, gy + 0.095, z - 0.04, 0.02, gy + 0.115, z);
  b.set([0.07, 0.07, 0.072], MAT.metal); brl(-6.0, -6.03, 0.088, 0.1); brl(-6.03, LEO.mz, 0.1, 0.096); lathe(b, 2, 0, gy, LEO.mz, [[0, 0.096], [0, 0.064], [0.25, 0.062]], 16, 1, false, true);
  b.set(DARK, MAT.metal); b.box(0.02, gy + 0.09, -6.13, 0.08, gy + 0.15, -6.06); b.set(GLASS, MAT.glass); face(b, [[0.03, gy + 0.1, -6.058], [0.07, gy + 0.1, -6.058], [0.07, gy + 0.14, -6.058], [0.03, gy + 0.14, -6.058]], [0, 0, 1]); // muzzle reference mirror
  b.set(BLK, MAT.void); b.cyl(0, gy, LEO.mz + 0.2, 0, gy, LEO.mz + 0.21, 0.063, 0.063, 12);
  fixWinding(b, i0);
  return b.build();
}
