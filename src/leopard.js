// Leopard 2A4NO, the player's tank. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
// Parts: 0 hull, 1 turret (turns about (0, *, LEO.tz)), 2 gun (elevates about (LEO.gy, LEO.gz), muzzle at z = LEO.mz).
import { MB, MAT } from './mesh.js';
import { extX } from './vehutil.js';
import { runningGear, face, cbox, plate, lathe, pipe, fixWinding } from './gear.js';

// turret ring centre, gun trunnion and muzzle of the Leopard (hull coordinates)
export const LEO = { ty: 1.58, tz: -0.25, gy: 1.97, gz: -1.6, mz: -6.2, hl: 2.9, hw: 1.43, rad: 2.6, hh: 1.6, th: 2.45, tr: 1.75 };

// welded shell from a plan: P = [x, z, yTop, yBelt, bottom x, bottom z, bottom y] per corner. Vertical walls from the belt up to a small
// chamfer (ch) under the roof, an undercut from the belt in to the bottom outline; roofs / floors = corner index lists of flat caps.
// Two corners at the same (x, z) with different tops make a step in the wall top. Returns the roof corners (inset by the chamfer).
function shell(b, P, ch, roofs, floors) {
  const n = P.length; let ar = 0;
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; }
  const s = ar > 0 ? 1 : -1, N = [];
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); N.push(l < 1e-6 ? null : [s * dz / l, -s * dx / l]); }
  const deg = N.map((q) => !q); for (let k = 0; k < 2 * n; k++) { const i = k % n; if (!N[i]) N[i] = N[(i + n - 1) % n]; }
  const T = [], W = [], B = [], U = [];
  for (let i = 0; i < n; i++) {
    const p = P[i], a = N[(i + n - 1) % n], c = N[i]; let mx = a[0] + c[0], mz = a[1] + c[1]; const k = 1 / Math.max(0.3, (mx * c[0] + mz * c[1]));
    mx *= k; mz *= k;
    T.push([p[0] - mx * ch, p[2], p[1] - mz * ch]); W.push([p[0], p[2] - ch, p[1]]); B.push([p[0], p[3], p[1]]); U.push([p[4], p[6], p[5]]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, h = N[i]; if (deg[i]) continue;
    face(b, [W[i], W[j], T[j], T[i]], [h[0], 1, h[1]]); face(b, [B[i], B[j], W[j], W[i]], [h[0], 0, h[1]]); face(b, [U[i], U[j], B[j], B[i]], [h[0], -0.6, h[1]]);
  }
  for (const r of roofs) face(b, r.map((i) => T[i]), [0, 1, 0]);
  for (const r of floors) face(b, r.map((i) => U[i]), [0, -1, 0]);
  return T;
}

export function buildLeopard() {
  const b = new MB();
  const GRN = [0.042, 0.052, 0.03], DGRN = [0.03, 0.037, 0.023], DARK = [0.03, 0.031, 0.034], STEEL = [0.2, 0.21, 0.22], GLASS = [0.02, 0.035, 0.05];
  const BLK = [0.012, 0.012, 0.013], CANVAS = [0.075, 0.08, 0.055], TARP = [0.2, 0.21, 0.17];
  // the camouflage pattern is offset by the green channel (object.wgsl), so a slightly different green gives a panel its own brushwork
  const tint = (c, k) => [c[0], c[1] + (Math.abs(k) % 13) * 0.00035, c[2]];
  runningGear(b, 0, DGRN, true);
  const i0 = b.i.length;
  const bx = (x0, y0, z0, x1, y1, z1, c) => cbox(b, Math.min(x0, x1), y0, z0, Math.max(x0, x1), y1, z1, c);
  const box = (x0, y0, z0, x1, y1, z1) => b.box(Math.min(x0, x1), y0, z0, Math.max(x0, x1), y1, z1);
  b.part = 0;
  // ---------- hull: lower tub between the tracks, upper hull with the sponsons over them, the nose tapering to an edge ----------
  b.set(tint(DGRN, 9), MAT.camo);
  extX(b, [[0.5, -3.1], [0.99, -3.56], [0.99, 3.76], [0.62, 3.76], [0.48, 3.42]], -1.08, 1.08); // stops inside the upper hull: no coplanar faces
  b.set(GRN, MAT.camo);
  extX(b, [[0.98, -3.5], [0.99, -3.62], [1.14, -3.6], [1.47, -2.3], [1.5, 3.66], [1.44, 3.78], [0.98, 3.78]], -1.78, 1.78);
  const GA = Math.atan2(0.33, 1.3), Gy = (z) => 1.14 + (z + 3.6) * 0.33 / 1.3, GN = [0, Math.cos(GA), -Math.sin(GA)];
  // glacis armour plate, the joint to the roof
  b.set(tint(GRN, 3), MAT.camo); plate(b, [[-1.66, Gy(-3.54), -3.54], [1.66, Gy(-3.54), -3.54], [1.66, Gy(-2.52), -2.52], [-1.66, Gy(-2.52), -2.52]], GN, 0.022);
  b.set(DGRN, MAT.camo); bx(-1.72, 1.455, -2.36, 0.24, 1.492, -2.27, 0.012); bx(1.08, 1.455, -2.36, 1.72, 1.492, -2.27, 0.012);
  // driver's hatch (right) with three periscopes on the glacis top
  b.set(tint(GRN, 5), MAT.camo); bx(0.28, 1.47, -2.27, 1.04, 1.545, -1.6, 0.02);
  b.set(tint(DGRN, 6), MAT.camo); bx(0.36, 1.545, -2.2, 0.96, 1.56, -1.72, 0.008); b.set(DARK, MAT.metal); b.box(0.5, 1.56, -2.0, 0.54, 1.585, -1.86);
  for (const x of [0.42, 0.66, 0.9]) {
    b.set(DGRN, MAT.camo); b.box(x - 0.1, 1.4, -2.44, x + 0.1, 1.535, -2.27, 0.012, 0.03, 0.0);
    b.set(GLASS, MAT.glass); face(b, [[x - 0.08, 1.46, -2.431], [x + 0.08, 1.46, -2.431], [x + 0.076, 1.52, -2.4175], [x - 0.076, 1.52, -2.4175]], [0, 0.3, -1]);
  }
  for (const sx of [-1, 1]) {
    // headlight cluster let into the glacis: low housing, main lamp, blackout lamp, guard bar
    b.at(sx * 1.32, Gy(-3.05), -3.05, 0, -GA);
    b.set(DGRN, MAT.camo); bx(-0.2, 0.0, -0.1, 0.2, 0.1, 0.12, 0.02);
    b.set(BLK, MAT.void); face(b, [[-0.17, 0.012, -0.102], [0.17, 0.012, -0.102], [0.17, 0.088, -0.102], [-0.17, 0.088, -0.102]], [0, 0, -1]);
    b.set(DARK, MAT.metal); b.cyl(-sx * 0.08, 0.05, -0.09, -sx * 0.08, 0.05, -0.112, 0.04, 0.04, 12, 0); b.cyl(sx * 0.08, 0.05, -0.09, sx * 0.08, 0.05, -0.11, 0.03, 0.03, 8, 0);
    b.set([1, 0.95, 0.82], MAT.head); b.cyl(-sx * 0.08, 0.05, -0.106, -sx * 0.08, 0.05, -0.109, 0.035, 0.035, 12);
    b.set(GLASS, MAT.glass); b.cyl(sx * 0.08, 0.05, -0.104, sx * 0.08, 0.05, -0.107, 0.024, 0.024, 8);
    b.set(DARK, MAT.metal); pipe(b, [[-0.2, 0.0, -0.15], [-0.2, 0.13, -0.14], [0.2, 0.13, -0.14], [0.2, 0.0, -0.15]], 0.011, 5);
    b.at(0, 0, 0);
    b.set(DGRN, MAT.camo); b.box(sx * 1.52 - 0.02, Gy(-2.62) - 0.01, -2.68, sx * 1.52 + 0.02, Gy(-2.62) + 0.07, -2.58); // lifting eye
    // rear-view mirror on a stalk at the glacis corner
    b.set(DARK, MAT.metal); pipe(b, [[sx * 1.62, Gy(-3.3), -3.2], [sx * 1.7, Gy(-3.3) + 0.3, -3.26], [sx * 1.74, Gy(-3.3) + 0.42, -3.26]], 0.012, 5);
    bx(sx * 1.66, Gy(-3.3) + 0.36, -3.285, sx * 1.84, Gy(-3.3) + 0.5, -3.26, 0.008);
    b.set(GLASS, MAT.glass); face(b, [[sx * 1.675, Gy(-3.3) + 0.375, -3.257], [sx * 1.825, Gy(-3.3) + 0.375, -3.257], [sx * 1.825, Gy(-3.3) + 0.485, -3.257], [sx * 1.675, Gy(-3.3) + 0.485, -3.257]], [0, 0, 1]);
    // tow shackle on the lower front plate, a short rubber flap under the thin fender end
    b.set(DGRN, MAT.camo); b.box(sx * 0.72 - 0.035, 0.7, -3.44, sx * 0.72 + 0.035, 0.88, -3.3); b.cyl(sx * 0.72 - 0.06, 0.78, -3.46, sx * 0.72 + 0.06, 0.78, -3.46, 0.03, 0.03, 8);
    b.set(DARK, MAT.rubber); b.box(sx * 1.43 - 0.32, 0.86, -3.5, sx * 1.43 + 0.32, 0.985, -3.48);
    // side skirts: three heavy armour modules at the front, the first cut away so the idler and the rising track show ...
    b.set(tint(GRN, 11), MAT.camo);
    extX(b, [[0.5, -2.86], [1.0, -3.3], [1.1, -3.5], [1.17, -3.38], [1.17, -2.86]], sx * 1.79, sx * 1.885);
    b.set(tint(GRN, 17), MAT.camo); bx(sx * 1.79, 0.5, -2.84, sx * 1.885, 1.17, -1.96, 0.018);
    b.set(tint(GRN, 23), MAT.camo); bx(sx * 1.79, 0.5, -1.94, sx * 1.885, 1.17, -1.06, 0.018);
    for (let k = 0; k < 3; k++) { // bolted-on face plates, grab handles
      const z = -3.62 + k * 0.9; b.set(tint(DGRN, 11 + k * 6), MAT.camo);
      plate(b, k ? [[sx * 1.885, 0.58, z], [sx * 1.885, 0.58, z + 0.72], [sx * 1.885, 1.1, z + 0.72], [sx * 1.885, 1.1, z]] : [[sx * 1.885, 0.68, -2.92], [sx * 1.885, 1.1, -2.92], [sx * 1.885, 1.1, -3.36], [sx * 1.885, 1.02, -3.26]], [sx, 0, 0], 0.012);
      const hz = k ? z + 0.22 : -3.19; b.set(DARK, MAT.metal); pipe(b, [[sx * 1.897, 0.92, hz], [sx * 1.93, 0.92, hz], [sx * 1.93, 0.92, hz + 0.26], [sx * 1.897, 0.92, hz + 0.26]], 0.011, 4);
    }
    // ... and four light plates with cut lower corners behind them, hung from a rail
    for (let k = 0; k < 4; k++) {
      const z0 = -1.04 + k * 0.94, z1 = z0 + 0.92; b.set(tint(GRN, 30 + k * 7), MAT.camo);
      extX(b, [[0.68, z0], [0.54, z0 + 0.16], [0.54, z1 - 0.16], [0.68, z1], [1.13, z1], [1.13, z0]], sx * 1.795, sx * 1.83);
      box(sx * 1.83, 0.6, z0 + 0.44, sx * 1.842, 1.1, z0 + 0.48);
      b.set(DGRN, MAT.camo); for (const zz of [z0 + 0.14, z1 - 0.2]) box(sx * 1.785, 1.1, zz, sx * 1.86, 1.2, zz + 0.06); // hinge brackets
    }
    b.set(DGRN, MAT.camo); box(sx * 1.785, 1.125, -1.04, sx * 1.85, 1.165, 2.72);
    box(sx * 1.77, 1.455, -2.3, sx * 1.805, 1.49, 3.7); // roof-edge lip
    // thin mud guard over the sprocket (the return run shows under it), thin rubber flap behind the track
    b.set(tint(GRN, 60), MAT.camo); box(sx * 1.785, 1.0, 2.74, sx * 1.81, 1.165, 3.78);
    b.set(DARK, MAT.rubber); b.box(sx * 1.43 - 0.32, 0.64, 3.762, sx * 1.43 + 0.32, 0.985, 3.78);
    // tow cable lying along the roof edge in its clamps, an eye at each end
    b.set(DARK, MAT.metal); pipe(b, [[sx * 1.6, 1.522, -1.9], [sx * 1.68, 1.522, -1.5], [sx * 1.68, 1.525, 1.3], [sx * 1.62, 1.577, 1.74], [sx * 1.62, 1.577, 3.3]], 0.022, 6);
    lathe(b, 1, sx * 1.6, 1.5, -1.97, [[0, 0.03], [0.022, 0.03], [0.022, 0.068], [0, 0.068], [0, 0.03]], 10); lathe(b, 1, sx * 1.62, 1.555, 3.37, [[0, 0.03], [0.022, 0.03], [0.022, 0.068], [0, 0.068], [0, 0.03]], 10);
    b.set(DGRN, MAT.camo); for (const z of [-0.9, 0.3, 2.3]) b.box(sx * 1.66 - 0.05, z < 1.7 ? 1.5 : 1.555, z, sx * 1.66 + 0.05, z < 1.7 ? 1.555 : 1.61, z + 0.06);
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
    // ---------- rear plate: round exhaust outlet with louvres, tail light cluster, tow shackle ----------
    const ex = sx * 1.26, ey = 1.17, ez = 3.782;
    b.set(GRN, MAT.camo); lathe(b, 2, ex, ey, ez, [[0, 0.265], [0.035, 0.25], [0.035, 0.215], [0.01, 0.215]], 20);
    b.set(BLK, MAT.metal); b.cyl(ex, ey, ez, ex, ey, ez + 0.01, 0.215, 0.215, 20);
    b.set(DARK, MAT.metal); for (let k = -2; k <= 2; k++) { const yy = k * 0.075, hw = Math.sqrt(0.215 * 0.215 - yy * yy) - 0.01; b.at(ex, ey + yy, ez + 0.02, 0, -0.5); b.box(-hw, -0.004, -0.03, hw, 0.004, 0.03); } b.at(0, 0, 0);
    b.set(DGRN, MAT.camo); bx(sx * 0.78 - 0.11, 1.07, 3.775, sx * 0.78 + 0.11, 1.16, 3.815, 0.01);
    b.set([1, 0.05, 0.02], MAT.head); face(b, [[sx * 0.78 - 0.09, 1.085, 3.817], [sx * 0.78 - 0.01, 1.085, 3.817], [sx * 0.78 - 0.01, 1.145, 3.817], [sx * 0.78 - 0.09, 1.145, 3.817]], [0, 0, 1]);
    b.set([0.22, 0.07, 0.01], MAT.glass); face(b, [[sx * 0.78 + 0.02, 1.085, 3.817], [sx * 0.78 + 0.09, 1.085, 3.817], [sx * 0.78 + 0.09, 1.145, 3.817], [sx * 0.78 + 0.02, 1.145, 3.817]], [0, 0, 1]);
    b.set(DGRN, MAT.camo); b.box(sx * 0.78 - 0.035, 0.68, 3.74, sx * 0.78 + 0.035, 0.86, 3.86); b.cyl(sx * 0.78 - 0.06, 0.76, 3.88, sx * 0.78 + 0.06, 0.76, 3.88, 0.03, 0.03, 8);
  }
  // raised engine deck with its cover plates, travel lock for the gun folded down at the rear edge
  b.set(tint(GRN, 70), MAT.camo); bx(-1.56, 1.49, 1.72, 1.56, 1.555, 3.66, 0.02);
  b.set(tint(DGRN, 75), MAT.camo); bx(-0.3, 1.555, 1.8, 0.3, 1.6, 3.2, 0.015); b.set(tint(GRN, 80), MAT.camo); bx(-0.22, 1.6, 1.95, 0.22, 1.615, 2.5, 0.006);
  b.set(DARK, MAT.metal); for (const z of [2.75, 3.05]) pipe(b, [[-0.1, 1.6, z], [-0.1, 1.64, z], [0.1, 1.64, z], [0.1, 1.6, z]], 0.01, 4);
  b.set(DGRN, MAT.camo); pipe(b, [[-0.3, 1.565, 3.58], [-0.1, 1.64, 3.4], [0.1, 1.64, 3.4], [0.3, 1.565, 3.58]], 0.026, 6); b.set(DARK, MAT.metal); lathe(b, 1, 0, 1.63, 3.3, [[0, 0.11], [0.05, 0.11], [0.05, 0.08], [0, 0.08], [0, 0.11]], 10);
  // rear plate: the recessed louvre band across the top between the outlets, convoy cross, pintle, infantry phone box, spare track links
  b.set(BLK, MAT.void); b.box(-0.9, 1.25, 3.775, 0.9, 1.41, 3.784);
  b.set(DGRN, MAT.camo); b.box(-0.93, 1.41, 3.775, 0.93, 1.435, 3.81); b.box(-0.93, 1.225, 3.775, 0.93, 1.25, 3.81); b.box(-0.93, 1.25, 3.775, -0.9, 1.41, 3.81); b.box(0.9, 1.25, 3.775, 0.93, 1.41, 3.81);
  for (const x of [-0.3, 0.3]) b.box(x - 0.012, 1.25, 3.78, x + 0.012, 1.41, 3.806);
  b.set(DARK, MAT.metal); for (let k = 0; k < 5; k++) { b.at(0, 1.27 + k * 0.03, 3.795, 0, -0.6); b.box(-0.9, -0.003, -0.014, 0.9, 0.003, 0.014); } b.at(0, 0, 0);
  b.set(BLK, MAT.metal); bx(-0.1, 0.99, 3.775, 0.1, 1.19, 3.8, 0.008);
  b.set([0.8, 0.8, 0.78], MAT.paint); b.box(-0.07, 1.079, 3.8, 0.07, 1.101, 3.806); b.box(-0.011, 1.02, 3.8, 0.011, 1.16, 3.806);
  b.set(DGRN, MAT.camo); b.box(-0.06, 0.72, 3.74, 0.06, 0.86, 3.86); b.set(DARK, MAT.metal); b.cyl(0, 0.9, 3.83, 0, 0.68, 3.83, 0.028, 0.028, 8);
  b.set(tint(DGRN, 85), MAT.camo); bx(-0.52, 0.99, 3.775, -0.34, 1.17, 3.85, 0.012);
  b.set(DARK, MAT.metal); for (let k = 0; k < 3; k++) { const x = 0.28 + k * 0.17; bx(x, 0.985, 3.775, x + 0.15, 1.055, 3.83, 0.012); }
  b.set(DGRN, MAT.camo); b.box(0.24, 0.965, 3.775, 0.82, 0.985, 3.845);

  // ---------- turret (part 1): welded slab-sided shell, roof falling to the front, undercut bustle, the EMES 15 notch in the right cheek ----------
  b.part = 1;
  b.set(DGRN, MAT.camo); b.cyl(0, 1.5, LEO.tz, 0, 1.61, LEO.tz, 1.15, 1.15, 28, 0);
  b.set(tint(GRN, 4), MAT.camo);
  const RT = 2.46, RS = 0.075, RA = Math.atan(RS), RY = (z) => (z < -0.9 ? RT + (z + 0.9) * RS : RT), RN = [0, Math.cos(RA), -Math.sin(RA)];
  const ZF = (x) => -2.06 + (x - 0.47) * 0.16 / 0.99; // the cheek front in plan
  const NX0 = 0.7, NX1 = 1.3, NZ = -1.68, NF = 2.17; // the notch: x range, back wall, floor
  const pt = (x, z, belt, ux, uz, uy, top) => [x, z, top === undefined ? RY(z) : top, belt, ux, uz, uy];
  const base = [[0.47, -1.84, 1.64, 0.47, -1.84, 1.6], [0.47, -2.06, 1.64, 0.47, -2.02, 1.6], [1.46, -1.9, 1.66, 1.38, -1.86, 1.6], [1.6, -0.9, 1.67, 1.5, -0.9, 1.6],
    [1.6, 0.8, 1.67, 1.5, 0.77, 1.6], [1.58, 1.1, 1.85, 1.5, 1.15, 1.81], [1.42, 2.75, 1.85, 1.34, 2.69, 1.81]];
  const nb = (x) => [x, ZF(x), 1.645, x - 0.02, ZF(x) + 0.04, 1.6];
  const right = [pt(...base[0]), pt(...base[1]), pt(...nb(NX0)), pt(...nb(NX0), NF), pt(...nb(NX1), NF), pt(...nb(NX1)), ...base.slice(2).map((p) => pt(...p))];
  const left = base.slice().reverse().map((p) => pt(-p[0], p[1], p[2], -p[3], p[4], p[5]));
  const T = shell(b, right.concat(left), 0.03, [[17, 16, 15, 14], [0, 7, 14, 17], [7, 8, 9, 10, 11, 12, 13, 14]], [[0, 1, 6, 7], [17, 16, 15, 14], [0, 7, 14, 17], [7, 8, 13, 14], [8, 9, 12, 13], [9, 10, 11, 12]]);
  { // right cheek roof round the notch, the notch floor and walls
    const n1 = [NX0, RY(NZ), NZ], n2 = [NX1, RY(NZ), NZ], f1 = [NX0, NF, NZ], f2 = [NX1, NF, NZ];
    face(b, [T[0], T[1], T[2], n1], [0, 1, 0]); face(b, [T[0], n1, T[7]], [0, 1, 0]); face(b, [n1, n2, T[7]], [0, 1, 0]); face(b, [n2, T[5], T[6], T[7]], [0, 1, 0]);
    b.set(tint(DGRN, 95), MAT.camo);
    face(b, [T[3], T[4], f2, f1], [0, 1, 0]); face(b, [T[3], f1, n1, T[2]], [1, 0, 0]); face(b, [T[4], f2, n2, T[5]], [-1, 0, 0]); face(b, [f1, f2, n2, n1], [0, 0, -1]);
  }
  b.set(BLK, MAT.void); face(b, [[-0.46, 1.64, -1.846], [0.46, 1.64, -1.846], [0.46, 2.36, -1.846], [-0.46, 2.36, -1.846]], [0, 0, -1]);
  // EMES 15 gunner's sight seated in the notch: armoured head with twin windows, only a little above the roof line
  b.set(tint(GRN, 100), MAT.camo); bx(NX0 + 0.035, NF - 0.02, -1.74, NX1 - 0.035, RY(NZ) + 0.09, -1.18, 0.025);
  for (const x of [0.79, 1.03]) {
    b.set(BLK, MAT.void); face(b, [[x - 0.01, 2.235, -1.7425], [x + 0.19, 2.235, -1.7425], [x + 0.19, 2.435, -1.7425], [x - 0.01, 2.435, -1.7425]], [0, 0, -1]);
    b.set(GLASS, MAT.glass); face(b, [[x, 2.245, -1.745], [x + 0.18, 2.245, -1.745], [x + 0.18, 2.425, -1.745], [x, 2.425, -1.745]], [0, 0, -1]);
  }
  b.set(DGRN, MAT.camo); b.box(NX0 + 0.03, RY(NZ) + 0.075, -1.8, NX1 - 0.03, RY(NZ) + 0.1, -1.72);
  // roof plates: the left front armour plate on the slope, blow-off panels on the bustle
  b.set(tint(DGRN, 105), MAT.camo);
  plate(b, [[-1.28, RY(-1.78), -1.78], [-0.55, RY(-1.78), -1.78], [-0.55, RY(-1.0), -1.0], [-1.4, RY(-1.0), -1.0]], RN, 0.018);
  b.set(tint(DGRN, 111), MAT.camo); plate(b, [[-1.24, RT, 1.35], [-0.16, RT, 1.35], [-0.16, RT, 2.6], [-1.24, RT, 2.6]], [0, 1, 0], 0.02);
  b.set(tint(DGRN, 117), MAT.camo); plate(b, [[0.22, RT, 1.45], [1.2, RT, 1.45], [1.2, RT, 2.6], [0.22, RT, 2.6]], [0, 1, 0], 0.02);
  b.set(DARK, MAT.metal); for (const [x, z] of [[-1.1, -1.5], [-0.3, -0.75], [0.0, 1.9]]) pipe(b, [[x - 0.05, RY(z), z], [x - 0.05, RY(z) + 0.055, z], [x + 0.05, RY(z) + 0.055, z], [x + 0.05, RY(z), z]], 0.011, 4);
  // gunner's auxiliary sight port in the right cheek
  b.set(DGRN, MAT.camo); b.cyl(0.6, 1.98, -1.99, 0.6, 1.98, -2.065, 0.062, 0.055, 10); b.set(BLK, MAT.void); b.cyl(0.6, 1.98, -2.066, 0.6, 1.98, -2.068, 0.036, 0.036, 10);
  // PERI R17 commander's panoramic sight
  b.set(tint(GRN, 120), MAT.camo); b.cyl(0.6, RT - 0.01, -0.52, 0.6, RT + 0.1, -0.52, 0.18, 0.17, 14); bx(0.46, RT + 0.1, -0.68, 0.74, RT + 0.4, -0.38, 0.035);
  b.set(GLASS, MAT.glass); face(b, [[0.5, RT + 0.19, -0.683], [0.7, RT + 0.19, -0.683], [0.7, RT + 0.35, -0.683], [0.5, RT + 0.35, -0.683]], [0, 0, -1]);
  // commander's cupola: ring with periscopes all round, low hatch lid
  const cx = 0.66, cz = 0.3;
  b.set(GRN, MAT.camo); lathe(b, 1, cx, RT, cz, [[-0.01, 0.5], [0.06, 0.5], [0.12, 0.44], [0.12, 0.37]], 20);
  b.set(tint(DGRN, 125), MAT.camo); lathe(b, 1, cx, RT, cz, [[0.12, 0.385], [0.145, 0.375], [0.155, 0.33], [0.158, 0]], 20);
  b.set(DARK, MAT.metal); pipe(b, [[cx - 0.08, RT + 0.156, cz + 0.2], [cx - 0.08, RT + 0.195, cz + 0.2], [cx + 0.08, RT + 0.195, cz + 0.2], [cx + 0.08, RT + 0.156, cz + 0.2]], 0.01, 4);
  for (let k = 0; k < 8; k++) {
    const a = (k - 3.5) * 0.62;
    b.at(cx - Math.sin(a) * 0.45, RT + 0.055, cz - Math.cos(a) * 0.45, a);
    b.set(DGRN, MAT.camo); b.box(-0.1, 0, -0.045, 0.1, 0.085, 0.05, 0.01, 0.012, 0.0);
    b.set(GLASS, MAT.glass); face(b, [[-0.08, 0.015, -0.047], [0.08, 0.015, -0.047], [0.075, 0.07, -0.0375], [-0.075, 0.07, -0.0375]], [0, 0.2, -1]);
  }
  b.at(0, 0, 0);
  // loader's hatch (left) with the MG3 on its skate rail
  const lx = -0.66, lz = 0.3;
  b.set(GRN, MAT.camo); lathe(b, 1, lx, RT, lz, [[-0.01, 0.46], [0.045, 0.46], [0.06, 0.43], [0.06, 0.37]], 18);
  b.set(tint(DGRN, 130), MAT.camo); lathe(b, 1, lx, RT, lz, [[0.06, 0.375], [0.082, 0.365], [0.09, 0.32], [0.092, 0]], 18);
  b.box(lx - 0.1, RT + 0.04, lz - 0.52, lx + 0.1, RT + 0.12, lz - 0.42, 0.01, 0.012, 0.0); b.set(GLASS, MAT.glass); face(b, [[lx - 0.08, RT + 0.055, lz - 0.522], [lx + 0.08, RT + 0.055, lz - 0.522], [lx + 0.075, RT + 0.105, lz - 0.512], [lx - 0.075, RT + 0.105, lz - 0.512]], [0, 0.2, -1]);
  b.set(DARK, MAT.metal); lathe(b, 1, lx, RT, lz, [[0.1, 0.54], [0.13, 0.54], [0.13, 0.57], [0.1, 0.57], [0.1, 0.54]], 20);
  for (let k = 0; k < 5; k++) { const a = 0.4 + k * Math.PI * 0.4; b.cyl(lx + Math.sin(a) * 0.555, RT, lz + Math.cos(a) * 0.555, lx + Math.sin(a) * 0.555, RT + 0.1, lz + Math.cos(a) * 0.555, 0.014, 0.014, 5, 0); }
  { const mx = lx - 0.4, my = RT + 0.3; // MG3: cradle, receiver with feed cover, perforated jacket, booster, stock, belt box
    b.cyl(mx, RT + 0.12, -0.08, mx, my - 0.05, -0.08, 0.028, 0.022, 6); b.box(mx - 0.05, my - 0.07, -0.2, mx + 0.05, my - 0.045, 0.04);
    bx(mx - 0.034, my - 0.045, -0.3, mx + 0.034, my + 0.04, 0.2, 0.01); b.box(mx - 0.03, my + 0.04, -0.2, mx + 0.03, my + 0.058, 0.1);
    b.cyl(mx, my, -0.3, mx, my, -0.8, 0.024, 0.024, 8, 0); b.cyl(mx, my, -0.8, mx, my, -0.88, 0.03, 0.022, 8); b.box(mx - 0.004, my + 0.024, -0.78, mx + 0.004, my + 0.05, -0.75);
    b.cyl(mx, my - 0.005, 0.2, mx, my - 0.03, 0.5, 0.024, 0.04, 6); b.box(mx - 0.015, my - 0.13, 0.1, mx + 0.015, my - 0.04, 0.15);
    b.set(DGRN, MAT.camo); bx(mx - 0.15, my - 0.12, -0.2, mx - 0.045, my + 0.03, 0.02, 0.008);
  }
  // ammunition loading hatch, in the left side only
  b.set(tint(DGRN, 135), MAT.camo); b.cyl(-1.59, 2.12, -0.1, -1.63, 2.12, -0.1, 0.2, 0.19, 18); b.set(DARK, MAT.metal); b.box(-1.645, 2.1, -0.16, -1.63, 2.14, -0.04);
  for (const sx of [-1, 1]) {
    // smoke grenade dischargers: a bracket carrying two tight groups of four short cups
    b.set(DGRN, MAT.camo); bx(sx * 1.59, 2.0, 0.1, sx * 1.635, 2.33, 0.76, 0.012);
    for (let gq = 0; gq < 2; gq++) for (let k = 0; k < 4; k++) {
      const z = 0.27 + gq * 0.32 + ((k & 1) - 0.5) * 0.125, y = 2.1 + (k >> 1) * 0.135, dx = sx * 0.74, dz = -0.42 + gq * 0.3 + ((k & 1) - 0.5) * 0.12, dyy = 0.5, l = 0.2 / Math.hypot(dx, dz, dyy);
      const ax = sx * 1.625, ex = ax + dx * l, ey = y + dyy * l, ez = z + dz * l;
      b.set(DGRN, MAT.camo); b.cyl(ax, y, z, ex, ey, ez, 0.056, 0.056, 10, 0);
      b.set(BLK, MAT.rubber); b.cyl(ex - dx * l * 0.04, ey - dyy * l * 0.04, ez - dz * l * 0.04, ex, ey, ez, 0.05, 0.05, 10);
    }
    // Norwegian flag on the turret side, behind the dischargers
    const wx = (z) => 1.58 - (z - 1.1) * 0.16 / 1.65, fxx = (z) => sx * (wx(z) + 0.006);
    b.set([1, 1, 1], MAT.flag); const z0 = sx > 0 ? 1.67 : 1.33, z1 = sx > 0 ? 1.33 : 1.67; // hoist towards the front on both sides
    b.quad([fxx(z1), 2.08, z1], [fxx(z0), 2.08, z0], [fxx(z0), 2.3, z0], [fxx(z1), 2.3, z1], sx > 0 ? [0, 1, 1, 1, 1, 0, 0, 0] : [1, 1, 0, 1, 0, 0, 1, 0]);
    // stowage bin lid on the bustle side with its handle
    const wn = [sx * 0.9953, 0, 0.0965];
    b.set(tint(DGRN, 140 + sx), MAT.camo); plate(b, [[sx * wx(1.92), 1.92, 1.92], [sx * wx(2.7), 1.92, 2.7], [sx * wx(2.7), 2.39, 2.7], [sx * wx(1.92), 2.39, 1.92]], wn, 0.016);
    b.set(DARK, MAT.metal); pipe(b, [[sx * (wx(2.2) + 0.016), 2.15, 2.2], [sx * (wx(2.2) + 0.05), 2.15, 2.2], [sx * (wx(2.4) + 0.05), 2.15, 2.4], [sx * (wx(2.4) + 0.016), 2.15, 2.4]], 0.009, 4);
    // grab rails on the turret side
    for (const [za, zb, y] of [[-1.5, -1.1, 2.02], [-0.75, -0.35, 1.84]]) { const xa = 1.46 + (za + 1.9) * 0.14 + 0.004, xb = 1.46 + (zb + 1.9) * 0.14 + 0.004; pipe(b, [[sx * xa, y, za], [sx * (xa + 0.045), y, za], [sx * (xb + 0.045), y, zb], [sx * xb, y, zb]], 0.01, 4); }
    b.set(DGRN, MAT.camo); box(sx * 1.6, 1.68, -0.91, sx * 1.612, RT - 0.03, -0.89); box(sx * 1.58, 1.86, 1.09, sx * 1.592, RT - 0.03, 1.11); // weld lines
    b.set(DARK, MAT.metal);
    // antenna on a sprung base
    b.cyl(sx * 1.28, RT, 2.62, sx * 1.28, RT + 0.07, 2.62, 0.045, 0.04, 8); b.cyl(sx * 1.28, RT + 0.07, 2.62, sx * 1.28, RT + 0.2, 2.62, 0.022, 0.018, 6); b.cyl(sx * 1.28, RT + 0.2, 2.62, sx * 1.28 - sx * 0.05, 4.45, 2.8, 0.009, 0.004, 4);
  }
  b.set(DARK, MAT.metal); b.cyl(0, RT, 2.55, 0, RT + 0.36, 2.55, 0.02, 0.02, 5); b.cyl(0, RT + 0.36, 2.55, 0, RT + 0.44, 2.55, 0.045, 0.045, 8); // crosswind sensor
  // stowage basket on the bustle rear: tube frame, mesh floor, a rolled tarpaulin and a box
  b.set(DGRN, MAT.camo);
  for (const y of [1.87, 2.36]) pipe(b, [[-1.37, y, 2.73], [-1.37, y, 3.12], [1.37, y, 3.12], [1.37, y, 2.73]], 0.017, 6);
  for (const x of [-1.37, -0.69, 0, 0.69, 1.37]) b.cyl(x, 1.87, 3.12, x, 2.36, 3.12, 0.014, 0.014, 5, 0);
  b.set(DARK, MAT.metal); b.box(-1.36, 1.86, 2.75, 1.36, 1.872, 3.11);
  b.set(TARP, MAT.cloth); lathe(b, 0, 0, 2.025, 2.93, [[-1.2, 0], [-1.2, 0.135], [-1.17, 0.148], [-0.5, 0.14], [0.2, 0.15], [0.32, 0.148], [0.35, 0.135], [0.35, 0]], 16);
  b.set(DARK, MAT.rubber); for (const x of [-0.9, -0.1]) b.cyl(x - 0.015, 2.025, 2.93, x + 0.015, 2.025, 2.93, 0.154, 0.154, 16, 0);
  b.set(tint(GRN, 150), MAT.camo); bx(0.55, 1.873, 2.79, 1.25, 2.2, 3.08, 0.015); b.set(DGRN, MAT.camo); b.box(0.54, 2.15, 2.78, 1.26, 2.165, 3.09);

  // ---------- gun (part 2): wedge mantlet set back between the cheeks, canvas collar, Rh-120 L/44 with thermal sleeve, fume extractor, muzzle reference mirror ----------
  b.part = 2; const gy = LEO.gy;
  b.set(tint(GRN, 160), MAT.camo); extX(b, [[gy - 0.33, -1.9], [gy - 0.13, -2.01], [gy + 0.13, -2.01], [gy + 0.345, -1.94], [gy + 0.345, -1.62], [gy - 0.33, -1.62]], -0.445, 0.445);
  b.set(DGRN, MAT.camo); bx(-0.17, gy - 0.13, -2.06, 0.17, gy + 0.13, -2.0, 0.025);
  b.cyl(-0.31, gy + 0.05, -2.0, -0.31, gy + 0.05, -2.04, 0.05, 0.045, 10); b.set(BLK, MAT.void); b.cyl(-0.31, gy + 0.05, -2.041, -0.31, gy + 0.05, -2.043, 0.028, 0.028, 8); // coax port, left of the gun
  b.set(CANVAS, MAT.cloth); lathe(b, 2, 0, gy, 0, [[-2.05, 0.15], [-2.1, 0.148], [-2.16, 0.128], [-2.22, 0.134], [-2.28, 0.115], [-2.33, 0.118], [-2.38, 0.105]], 16, 1, true);
  b.set(DGRN, MAT.camo);
  const brl = (za, zb, ra, rb, yo = 0) => b.cyl(0, gy + yo, za, 0, gy + yo, zb, ra, rb, 16, 0);
  brl(-2.35, -3.76, 0.098, 0.096);
  brl(-3.76, -3.84, 0.096, 0.136, 0.005); brl(-3.84, -4.52, 0.136, 0.136, 0.01); brl(-4.52, -4.62, 0.136, 0.094, 0.005); // fume extractor, slightly eccentric
  brl(-4.62, -6.0, 0.094, 0.088);
  b.set(GRN, MAT.camo); for (const z of [-2.42, -3.12, -3.71, -4.64, -5.12, -5.58]) brl(z, z - 0.045, 0.103, 0.103); // sleeve joints and clamps
  b.set(DARK, MAT.metal); for (const z of [-3.12, -5.12]) b.box(-0.02, gy + 0.095, z - 0.04, 0.02, gy + 0.115, z);
  b.set(tint(DGRN, 7), MAT.camo); brl(-6.0, -6.02, 0.088, 0.097); brl(-6.02, LEO.mz, 0.097, 0.096); lathe(b, 2, 0, gy, LEO.mz, [[0, 0.096], [0, 0.064], [0.25, 0.062]], 16, 1, false, true);
  b.set(DARK, MAT.metal); b.box(0.02, gy + 0.09, -6.13, 0.08, gy + 0.15, -6.06); b.set(GLASS, MAT.glass); face(b, [[0.03, gy + 0.1, -6.058], [0.07, gy + 0.1, -6.058], [0.07, gy + 0.14, -6.058], [0.03, gy + 0.14, -6.058]], [0, 0, 1]); // muzzle reference mirror
  b.set(BLK, MAT.void); b.cyl(0, gy, LEO.mz + 0.2, 0, gy, LEO.mz + 0.21, 0.063, 0.063, 12);
  fixWinding(b, i0);
  return b.build();
}
