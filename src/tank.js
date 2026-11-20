// Procedural tanks. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
// Parts: 0 hull, 1 turret, 2 gun (elevation + recoil). The track loop constants must match objdeform.wgsl.
import { MB, MAT } from './mesh.js';
import { trs, mul, identity } from './math.js';

import { poly, extX, extY, mirror } from './vehutil.js';
import { TRK, runningGear, TRACK_WGSL, face, cbox, plate, lathe, pipe, fixWinding } from './gear.js';
export { TRK, TRACK_WGSL };
export * from './leopard.js';
export * from './wheeled.js';
export * from './bikes.js';

// ---------- T-72B3 ----------
export const T72 = { ty: 1.32, tz: -0.35, gy: 1.68, gz: -1.3, mz: -6.15, hl: 2.9, hw: 1.43, rad: 2.6, hh: 1.32, th: 2.1, tr: 1.35 };
export function buildT72(cage = false) {
  const b = new MB();
  const GRN = [0.03, 0.04, 0.024], DGRN = [0.022, 0.03, 0.019], DARK = [0.03, 0.031, 0.034], BLK = [0.012, 0.012, 0.013], BRN = [0.1, 0.065, 0.035];
  const GLASS = [0.02, 0.035, 0.05], RUB = [0.024, 0.025, 0.026], CANVAS = [0.05, 0.055, 0.04];
  // panels differ a little in shade so plates and modules read as separate pieces
  const rus = (c, k = 5) => { const f = 0.88 + ((k * 7) % 11) * 0.024; return b.set([c[0] * f, c[1] * f, c[2] * f], MAT.rus); };
  runningGear(b, 1, DGRN);
  const i0 = b.i.length;
  const bx = (x0, y0, z0, x1, y1, z1, c) => cbox(b, Math.min(x0, x1), y0, z0, Math.max(x0, x1), y1, z1, c);
  const box = (x0, y0, z0, x1, y1, z1) => b.box(Math.min(x0, x1), y0, z0, Math.max(x0, x1), y1, z1);
  // uv.x = -9: the paint shader lays no snow there (engine heat)
  const warm = (v0) => { for (let i = v0 * 14; i < b.v.length; i += 14) if (b.v[i + 9] === MAT.rus) b.v[i + 10] = -9; };
  b.part = 0;
  // ---------- hull: tub between the tracks, low upper hull with the long glacis running down to a sharp nose ----------
  rus(DGRN, 1); extX(b, [[0.45, -3.1], [0.89, -3.5], [0.93, -3.46], [1.03, -3.15], [1.03, 3.3], [0.62, 3.3], [0.45, 3.0]], -1.08, 1.08);
  rus(GRN, 2); extX(b, [[1.0, -3.2], [0.88, -3.52], [0.93, -3.55], [1.32, -2.25], [1.32, 3.32], [1.0, 3.34]], -1.3, 1.3);
  const GS = 0.3, GA = Math.atan(GS), Gy = (z) => 0.93 + (z + 3.55) * GS, GN = [0, Math.cos(GA), -Math.sin(GA)];
  // Kontakt-5 on the glacis: a full lower row, an upper row between the headlights
  for (let r = 0; r < 2; r++) for (let k = r; k < 8 - r; k++) { const x = -1.12 + k * 0.32, z = -3.2 + r * 0.43; b.at(x, Gy(z), z, 0, -GA); rus(r ? GRN : DGRN, k + r * 3); bx(-0.15, 0, -0.2, 0.15, 0.075, 0.2, 0.018); }
  b.at(0, 0, 0);
  // V-shaped splash guard behind them, the point forward
  rus(DGRN, 6);
  for (const s of [-1, 1]) { const P = (x, z) => [x, Gy(z) - 0.005, z]; plate(b, [P(0, -2.54), P(s * 1.22, -2.315), P(s * 1.22, -2.288), P(0, -2.513)], GN, 0.1); }
  // driver's hatch on the centre line, its single periscope at the top of the glacis
  rus(GRN, 7); lathe(b, 1, 0, 1.315, -1.84, [[0, 0.34], [0.04, 0.34], [0.055, 0.31], [0.057, 0]], 18);
  b.set(DARK, MAT.metal); pipe(b, [[-0.08, 1.37, -1.7], [-0.08, 1.4, -1.7], [0.08, 1.4, -1.7], [0.08, 1.37, -1.7]], 0.01, 4);
  rus(DGRN, 8); b.box(-0.14, 1.29, -2.33, 0.14, 1.425, -2.16, 0.012, 0.03, 0);
  b.set(GLASS, MAT.glass); face(b, [[-0.115, 1.34, -2.3209], [0.115, 1.34, -2.3209], [0.115, 1.41, -2.3053], [-0.115, 1.41, -2.3053]], [0, 0.2, -1]);
  // self-entrenching blade on the lower front plate, tow hooks
  rus(DGRN, 9); { const P = (x, t) => [x, 0.45 + 0.44 * t, -3.1 - 0.4 * t]; plate(b, [P(-0.98, 0.04), P(0.98, 0.04), P(0.98, 0.5), P(-0.98, 0.5)], [0, -0.673, -0.74], 0.035); }
  for (const sx of [-1, 1]) {
    rus(DGRN, 3); b.box(sx * 0.62 - 0.035, 0.7, -3.52, sx * 0.62 + 0.035, 0.86, -3.36); b.cyl(sx * 0.62 - 0.06, 0.77, -3.53, sx * 0.62 + 0.06, 0.77, -3.53, 0.028, 0.028, 8);
    // headlight on the glacis beside the upper row (left: white; right: the dark infra-red lamp), wire guard
    b.at(sx * 1.13, Gy(-2.78), -2.78, 0, -GA);
    rus(DGRN, 4); b.box(-0.09, 0, -0.06, 0.09, 0.035, 0.08);
    b.set(DARK, MAT.metal); b.cyl(0, 0.105, 0.06, 0, 0.105, -0.07, 0.05, 0.072, 12);
    if (sx < 0) b.set([1, 0.95, 0.82], MAT.head); else b.set(BLK, MAT.glass);
    b.cyl(0, 0.105, -0.07, 0, 0.105, -0.074, 0.06, 0.06, 12);
    b.set(DARK, MAT.metal); pipe(b, [[-0.11, 0, -0.1], [-0.11, 0.21, -0.1], [0.11, 0.21, -0.1], [0.11, 0, -0.1]], 0.009, 4); pipe(b, [[0, 0.21, -0.1], [0, 0.21, 0.07], [0, 0, 0.1]], 0.009, 4);
    pipe(b, [[-0.11, 0.105, -0.1], [0.11, 0.105, -0.1]], 0.007, 4);
    b.at(0, 0, 0);
    // fender shelf, mud guard falling over the idler with a rubber flap, rear flap
    rus(GRN, 10); box(sx * 1.28, 1.02, -3.0, sx * 1.77, 1.05, 3.42);
    extX(b, [[1.02, -3.0], [1.05, -3.0], [0.86, -3.62], [0.83, -3.6]], sx * 1.3, sx * 1.77);
    b.set(RUB, MAT.rubber); box(sx * 1.14, 0.7, -3.625, sx * 1.76, 0.85, -3.605); box(sx * 1.14, 0.72, 3.42, sx * 1.76, 1.03, 3.435);
    // rubber-fabric skirt in sections, the corners cut at both ends
    const Z = [-3.05, -2.0, -0.95, 0.1, 1.15, 2.2, 3.4];
    for (let k = 0; k < 6; k++) {
      const za = Z[k] + 0.006, zb = Z[k + 1] - 0.006, f = 0.9 + (k % 3) * 0.12; b.set([RUB[0] * f, RUB[1] * f, RUB[2] * f], MAT.rubber);
      extX(b, k === 0 ? [[1.06, za], [1.06, zb], [0.56, zb], [0.56, za + 0.3], [0.82, za]] : k === 5 ? [[1.06, za], [1.06, zb], [0.8, zb], [0.56, zb - 0.28], [0.56, za]] : [[1.06, za], [1.06, zb], [0.56, zb], [0.56, za]], sx * 1.77, sx * 1.8);
    }
    b.set(DARK, MAT.metal); box(sx * 1.8, 1.0, -3.0, sx * 1.812, 1.035, 3.36);
    b.set([0.017, 0.018, 0.019], MAT.rubber); box(sx * 1.8, 0.56, -0.9, sx * 1.808, 0.6, 3.1); for (let k = 0; k < 8; k++) { const z = -0.6 + k * 0.52; box(sx * 1.8, 0.6, z, sx * 1.807, 1.0, z + 0.035); }
    // Kontakt-5 panels on the front part of the skirt
    for (let k = 0; k < 4; k++) { const z0 = -2.98 + k * 0.52; rus(k & 1 ? GRN : DGRN, k + 2); bx(sx * 1.8, 0.64, z0, sx * 1.895, 1.04, z0 + 0.5, 0.02); b.set(DARK, MAT.metal); for (const y of [0.74, 0.94]) box(sx * 1.895, y, z0 + 0.22, sx * 1.905, y + 0.03, z0 + 0.28); }
    // fender tops: fuel cells (ribs, filler cap) and stowage bins (lid, latches); the left side also carries the exhaust
    const IT = sx > 0 ? [[-2.75, -1.95, 1, 0.2], [-1.9, -1.0, 1, 0.22], [-0.95, 0.0, 0, 0.2], [0.05, 1.05, 1, 0.22], [1.1, 2.1, 0, 0.2], [2.15, 3.1, 0, 0.17]]
      : [[-2.75, -1.95, 0, 0.2], [-1.9, -1.0, 1, 0.22], [-0.95, 0.0, 1, 0.22], [0.05, 0.85, 0, 0.2], [0.9, 1.65, 0, 0.18], [2.7, 3.2, 0, 0.15]];
    IT.forEach(([z0, z1, fuel, h], k) => {
      const yt = 1.05 + h; rus(k & 1 ? DGRN : GRN, k * 3 + (sx > 0 ? 1 : 2)); bx(sx * 1.31, 1.04, z0, sx * 1.74, yt, z1, 0.03);
      if (fuel) { rus(DGRN, k); for (const t of [0.25, 0.75]) { const zr = z0 + (z1 - z0) * t; box(sx * 1.3, 1.05, zr - 0.02, sx * 1.75, yt + 0.008, zr + 0.02); } b.cyl(sx * 1.5, yt, (z0 + z1) / 2, sx * 1.5, yt + 0.03, (z0 + z1) / 2, 0.045, 0.045, 8); }
      else { rus(DGRN, k + 4); bx(sx * 1.3, yt - 0.005, z0 - 0.01, sx * 1.75, yt + 0.018, z1 + 0.01, 0.008); b.set(DARK, MAT.metal); for (const t of [0.25, 0.75]) { const zr = z0 + (z1 - z0) * t; box(sx * 1.75, yt - 0.07, zr - 0.015, sx * 1.762, yt + 0.005, zr + 0.015); } }
    });
    // tail light on the fender end
    rus(DGRN, 2); box(sx * 1.45, 1.05, 3.3, sx * 1.6, 1.13, 3.4); b.set([0.12, 0.012, 0.01], MAT.glass); face(b, [[sx * 1.47, 1.07, 3.402], [sx * 1.58, 1.07, 3.402], [sx * 1.58, 1.115, 3.402], [sx * 1.47, 1.115, 3.402]], [0, 0, 1]);
    // external fuel drum on its cradle behind the rear plate: hoops, straps, filler
    rus(GRN, sx > 0 ? 6 : 9); lathe(b, 0, sx * 0.57, 1.13, 3.68, [[-0.45, 0], [-0.45, 0.25], [-0.43, 0.27], [-0.17, 0.27], [-0.16, 0.282], [-0.13, 0.282], [-0.12, 0.27], [0.12, 0.27], [0.13, 0.282], [0.16, 0.282], [0.17, 0.27], [0.43, 0.27], [0.45, 0.25], [0.45, 0]], 18);
    b.cyl(sx * 0.57, 1.39, 3.68, sx * 0.57, 1.425, 3.68, 0.04, 0.04, 8);
    b.set(DARK, MAT.metal);
    for (const e of [-0.31, 0.31]) { const x = sx * 0.57 + e; b.cyl(x - 0.02, 1.13, 3.68, x + 0.02, 1.13, 3.68, 0.277, 0.277, 18, 0); box(x - 0.025, 0.82, 3.3, x + 0.025, 0.865, 3.8); box(x - 0.025, 0.865, 3.3, x + 0.025, 1.2, 3.36); }
  }
  // unditching log under the drums, strapped to its brackets
  b.set(BRN, MAT.paint); b.cyl(-1.12, 0.69, 3.46, 1.12, 0.69, 3.46, 0.105, 0.098, 12);
  b.set(DARK, MAT.metal); for (const x of [-0.8, 0.8]) { b.cyl(x - 0.025, 0.69, 3.46, x + 0.025, 0.69, 3.46, 0.112, 0.112, 12, 0); b.box(x - 0.03, 0.56, 3.28, x + 0.03, 0.6, 3.5); }
  rus(DGRN, 5); bx(-0.2, 0.86, 3.3, 0.2, 1.0, 3.36, 0.01);
  // engine deck (warm: no snow): raised plate, engine cover with the intake louvres, the radiator grille across the rear
  { const v0 = b.v.length / 14;
    rus(GRN, 11); bx(-1.24, 1.3, 1.45, 1.24, 1.345, 3.3, 0.015);
    rus(DGRN, 12); bx(-0.92, 1.345, 1.55, 0.92, 1.372, 2.18, 0.01);
    b.set(BLK, MAT.metal); b.box(-0.7, 1.372, 1.66, 0.7, 1.376, 2.06);
    rus(DGRN, 2); for (let k = 0; k < 8; k++) { b.at(0, 1.386, 1.69 + k * 0.049, 0, 0.42); b.box(-0.7, -0.003, -0.022, 0.7, 0.003, 0.022); }
    b.at(0, 0, 0);
    b.set(BLK, MAT.metal); b.box(-1.06, 1.345, 2.3, 1.06, 1.35, 3.18);
    b.set(DARK, MAT.metal); for (let k = 0; k < 17; k++) { b.at(0, 1.364, 2.335 + k * 0.05, 0, 0.42); b.box(-1.06, -0.003, -0.023, 1.06, 0.003, 0.023); }
    b.at(0, 0, 0);
    rus(DGRN, 7); b.box(-1.1, 1.345, 2.26, 1.1, 1.4, 2.3); b.box(-1.1, 1.345, 3.18, 1.1, 1.4, 3.22); for (const x of [-1.08, -0.54, 0, 0.54, 1.08]) b.box(x - 0.02, 1.345, 2.3, x + 0.02, 1.4, 3.18);
    b.set(DARK, MAT.metal); for (const x of [-0.6, 0.6]) pipe(b, [[x - 0.08, 1.372, 1.6], [x - 0.08, 1.4, 1.6], [x + 0.08, 1.4, 1.6], [x + 0.08, 1.372, 1.6]], 0.009, 4);
    // exhaust outlet on the left fender: sooty box with a louvred mouth facing outward
    b.set([0.018, 0.02, 0.016], MAT.rus); bx(-1.79, 1.04, 1.75, -1.29, 1.3, 2.6, 0.03);
    b.set(BLK, MAT.void); face(b, [[-1.792, 1.09, 1.83], [-1.792, 1.09, 2.52], [-1.792, 1.26, 2.52], [-1.792, 1.26, 1.83]], [-1, 0, 0]);
    b.set(DARK, MAT.metal); for (let k = 0; k < 4; k++) b.box(-1.81, 1.1 + k * 0.042, 1.83, -1.792, 1.115 + k * 0.042, 2.52);
    b.box(-1.8, 1.07, 1.81, -1.79, 1.28, 1.83); b.box(-1.8, 1.07, 2.52, -1.79, 1.28, 2.54);
    warm(v0); }

  // ---------- turret (part 1): the low rounded casting, a little longer to the rear ----------
  b.part = 1; const tz = T72.tz;
  { const PR = [[1.3, 1.1], [1.335, 1.17], [1.4, 1.27], [1.5, 1.335], [1.6, 1.345], [1.72, 1.3], [1.83, 1.2], [1.92, 1.06], [1.99, 0.86], [2.04, 0.6], [2.065, 0.3], [2.07, 0]], SG = 32, n = PR.length, G = [];
    for (let j = 0; j < n; j++) for (let k = 0; k <= SG; k++) { const t = k / SG * Math.PI * 2, c = Math.cos(t), r = PR[j][1]; G.push([Math.sin(t) * r, PR[j][0], tz + c * r * (1 + 0.1 * Math.max(c, 0) ** 2)]); }
    rus(GRN, 5); const base = b.v.length / 14, at = (j, k) => G[Math.min(Math.max(j, 0), n - 1) * (SG + 1) + ((k + SG) % SG)];
    for (let j = 0; j < n; j++) for (let k = 0; k <= SG; k++) {
      const p = G[j * (SG + 1) + k], a = at(j, k + 1), c = at(j, k - 1), u = at(j + 1, k), d = at(j - 1, k);
      const ex = a[0] - c[0], ey = a[1] - c[1], ez = a[2] - c[2], fx = u[0] - d[0], fy = u[1] - d[1], fz = u[2] - d[2];
      let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { nx = 0; ny = 1; nz = 0; l = 1; }
      if (nx * p[0] + ny * 0.5 + nz * (p[2] - tz) < 0) l = -l;
      b.vert(p[0], p[1], p[2], nx / l, ny / l, nz / l, 0, 0);
    }
    for (let j = 0; j < n - 1; j++) for (let k = 0; k < SG; k++) { const e = base + j * (SG + 1) + k; b.i.push(e, e + 1, e + SG + 1); if (j < n - 2) b.i.push(e + 1, e + SG + 2, e + SG + 1); }
  }
  // gun mask between the cheeks
  rus(DGRN, 3); bx(-0.3, 1.47, -1.74, 0.3, 1.89, -1.5, 0.035);
  b.set(BLK, MAT.void); b.cyl(0.21, 1.72, -1.741, 0.21, 1.72, -1.743, 0.03, 0.03, 8);
  // Kontakt-5 wedges round the front: the pointed 'clam'
  const WP = [[1.4, -1.1], [1.4, -1.22], [1.52, -1.58], [1.6, -1.6], [1.92, -1.16], [1.92, -0.95]];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { b.at(0, 0, tz, s * (0.35 + k * 0.265)); rus(k & 1 ? DGRN : GRN, k * 2 + (s > 0 ? 3 : 6)); extX(b, WP, -0.165, 0.165); }
  b.at(0, 0, 0);
  // Sosna-U gunner's sight (left): armoured box with its window, hood
  rus(GRN, 8); bx(-0.78, 1.9, -0.97, -0.44, 2.21, -0.5, 0.02);
  b.set(BLK, MAT.void); face(b, [[-0.745, 2.01, -0.9715], [-0.475, 2.01, -0.9715], [-0.475, 2.18, -0.9715], [-0.745, 2.18, -0.9715]], [0, 0, -1]);
  b.set(GLASS, MAT.glass); face(b, [[-0.73, 2.025, -0.973], [-0.49, 2.025, -0.973], [-0.49, 2.165, -0.973], [-0.73, 2.165, -0.973]], [0, 0, -1]);
  rus(DGRN, 9); box(-0.8, 2.21, -1.02, -0.42, 2.225, -0.5); box(-0.8, 2.0, -1.0, -0.785, 2.21, -0.9); box(-0.435, 2.0, -1.0, -0.42, 2.21, -0.9);
  // Luna searchlight right of the gun on a bracket over the wedges: dark housing, dull dark-red lens
  b.set(DARK, MAT.metal); b.cyl(0.62, 1.98, -1.4, 0.62, 1.98, -1.62, 0.12, 0.145, 14); box(0.58, 1.76, -1.5, 0.66, 1.86, -1.44);
  b.cyl(0.62, 1.98, -1.62, 0.62, 1.98, -1.64, 0.15, 0.15, 14, 0);
  b.set([0.05, 0.009, 0.008], MAT.glass); b.cyl(0.62, 1.98, -1.622, 0.62, 1.98, -1.626, 0.132, 0.132, 14);
  // commander's cupola (right) with periscopes and the 12.7 mm machine gun; gunner's hatch (left)
  const cx = 0.55, cz = tz + 0.2;
  rus(GRN, 3); lathe(b, 1, cx, 1.98, cz, [[0, 0.37], [0.12, 0.37], [0.17, 0.33], [0.17, 0.27]], 18);
  rus(DGRN, 4); lathe(b, 1, cx, 1.98, cz, [[0.17, 0.28], [0.19, 0.27], [0.2, 0.22], [0.202, 0]], 18);
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.5; b.at(cx - Math.sin(a) * 0.345, 2.085, cz - Math.cos(a) * 0.345, a);
    rus(DGRN, 2); b.box(-0.07, 0, -0.035, 0.07, 0.07, 0.03, 0.008, 0.01, 0);
    b.set(GLASS, MAT.glass); face(b, [[-0.055, 0.015, -0.035], [0.055, 0.015, -0.035], [0.05, 0.058, -0.0287], [-0.05, 0.058, -0.0287]], [0, 0.2, -1]);
  }
  b.at(0, 0, 0);
  { const mx = cx - 0.2, my = 2.4;
    b.set(DARK, MAT.metal); b.cyl(mx, 2.14, cz - 0.27, mx, my - 0.07, cz - 0.27, 0.035, 0.028, 6); box(mx - 0.06, my - 0.075, cz - 0.42, mx + 0.06, my - 0.05, cz - 0.08);
    bx(mx - 0.045, my - 0.05, cz - 0.5, mx + 0.045, my + 0.045, cz + 0.22, 0.012); b.box(mx - 0.035, my + 0.045, cz - 0.3, mx + 0.035, my + 0.06, cz + 0.05);
    b.cyl(mx, my, cz - 0.5, mx, my, cz - 1.38, 0.021, 0.017, 8, 0); b.cyl(mx, my, cz - 1.38, mx, my, cz - 1.47, 0.03, 0.022, 8); b.cyl(mx, my, cz - 0.5, mx, my, cz - 0.62, 0.03, 0.03, 8);
    for (const e of [-1, 1]) b.cyl(mx + e * 0.05, my, cz + 0.22, mx + e * 0.07, my - 0.02, cz + 0.36, 0.014, 0.014, 5);
    b.box(mx - 0.012, my + 0.06, cz - 0.2, mx + 0.012, my + 0.11, cz - 0.12);
    rus(DGRN, 6); bx(mx - 0.23, my - 0.13, cz - 0.32, mx - 0.05, my + 0.03, cz - 0.04, 0.01);
  }
  rus(DGRN, 7); lathe(b, 1, -0.55, 2.0, tz + 0.25, [[0, 0.32], [0.05, 0.32], [0.068, 0.28], [0.07, 0]], 18);
  b.set(DARK, MAT.metal); pipe(b, [[-0.63, 2.07, tz + 0.4], [-0.63, 2.1, tz + 0.4], [-0.47, 2.1, tz + 0.4], [-0.47, 2.07, tz + 0.4]], 0.009, 4);
  // smoke grenade launchers on the turret sides, behind the wedges
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const a = 1.36 + k * 0.16, px = -s * Math.sin(a) * 1.3, pz = tz - Math.cos(a) * 1.3, y = 1.6 + (k & 1) * 0.03, dx = -s * 0.3 * Math.sin(a), dz = -0.75, dy = 0.6, l = 0.3 / Math.hypot(dx, dy, dz);
    rus(DGRN, k + 1); b.cyl(px, y, pz, px + dx * l, y + dy * l, pz + dz * l, 0.05, 0.05, 10);
    b.set(BLK, MAT.rubber); b.cyl(px + dx * l * 0.97, y + dy * l * 0.97, pz + dz * l * 0.97, px + dx * l * 1.01, y + dy * l * 1.01, pz + dz * l * 1.01, 0.043, 0.043, 10);
  }
  // stowage boxes round the rear, the snorkel tube strapped across behind them
  for (const [yaw, k] of [[0, 4], [0.72, 7], [-0.72, 10]]) {
    b.at(0, 0, tz, yaw); const z0 = yaw ? 1.2 : 1.25, z1 = yaw ? 1.6 : 1.66;
    rus(k & 1 ? DGRN : GRN, k); bx(-0.41, 1.46, z0, 0.41, 1.83, z1, 0.025);
    rus(DGRN, k + 1); bx(-0.42, 1.825, z0 + 0.1, 0.42, 1.85, z1 + 0.01, 0.008);
    b.set(DARK, MAT.metal); for (const x of [-0.2, 0.2]) b.box(x - 0.015, 1.75, z1, x + 0.015, 1.83, z1 + 0.012);
  }
  b.at(0, 0, 0);
  rus(GRN, 9); lathe(b, 0, -0.1, 1.68, tz + 1.8, [[-0.95, 0], [-0.95, 0.115], [-0.93, 0.125], [0.83, 0.125], [0.85, 0.115], [0.85, 0]], 14);
  b.set(DARK, MAT.metal); for (const x of [-0.3, 0.3]) { b.cyl(x - 0.02, 1.68, tz + 1.8, x + 0.02, 1.68, tz + 1.8, 0.131, 0.131, 14, 0); b.box(x - 0.02, 1.6, tz + 1.6, x + 0.02, 1.63, tz + 1.8); }
  // wind sensor mast, antenna
  b.cyl(0.1, 1.95, tz + 0.95, 0.1, 2.44, tz + 0.95, 0.016, 0.014, 6); b.cyl(0.1, 2.44, tz + 0.95, 0.1, 2.51, tz + 0.95, 0.04, 0.04, 8);
  b.cyl(-0.8, 1.85, tz + 0.8, -0.8, 2.02, tz + 0.8, 0.04, 0.03, 8); if (!cage) b.cyl(-0.8, 2.02, tz + 0.8, -0.86, 4.0, tz + 1.0, 0.009, 0.004, 4);
  if (cage) { // cope cage: welded posts round the turret carrying a slatted roof well above it (against drones dropping in from above)
    b.set([0.05, 0.05, 0.045], MAT.metal); const Y0 = 1.62, Y1 = 2.78, X = 1.5, Z0 = tz - 1.75, Z1 = tz + 1.65;
    for (const [x, z] of [[-X, Z0 + 0.1], [X, Z0 + 0.1], [-X, (Z0 + Z1) / 2], [X, (Z0 + Z1) / 2], [-X + 0.1, Z1], [X - 0.1, Z1]]) {
      b.box(x - 0.03, Y0, z - 0.03, x + 0.03, Y1, z + 0.03);
      // welded to the casting with a strut and a brace
      const l = Math.hypot(x, z - tz), k = 1.2 / l; b.cyl(x, Y0 + 0.03, z, x * k, 1.58, tz + (z - tz) * k, 0.025, 0.025, 5); b.cyl(x, Y0 + 0.5, z, x * k, 1.7, tz + (z - tz) * k, 0.02, 0.02, 5);
    }
    b.box(-X, Y1, Z0, X, Y1 + 0.05, Z0 + 0.06); b.box(-X, Y1, Z1 - 0.06, X, Y1 + 0.05, Z1); b.box(-X, Y1, Z0, -X + 0.06, Y1 + 0.05, Z1); b.box(X - 0.06, Y1, Z0, X, Y1 + 0.05, Z1); // roof frame
    for (let k = 1; k < 9; k++) { const z = Z0 + (Z1 - Z0) * k / 9; b.box(-X, Y1 + 0.01, z - 0.015, X, Y1 + 0.035, z + 0.015); } // slats across
    for (let k = 1; k < 6; k++) { const x = -X + 2 * X * k / 6; b.box(x - 0.012, Y1 + 0.035, Z0, x + 0.012, Y1 + 0.06, Z1); } // and along
    b.set(DARK, MAT.metal);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { // side grilles: a frame with upright bars
      const z = Z0 + 0.3 + k * 0.85;
      b.box(sx * X - 0.02, Y0 + 0.25, z - 0.36, sx * X + 0.02, Y0 + 0.28, z + 0.36); b.box(sx * X - 0.02, Y1 - 0.08, z - 0.36, sx * X + 0.02, Y1 - 0.05, z + 0.36);
      for (let j = -2; j <= 2; j++) b.box(sx * X - 0.012, Y0 + 0.28, z + j * 0.17 - 0.008, sx * X + 0.012, Y1 - 0.08, z + j * 0.17 + 0.008);
    }
  }
  // ---------- gun (part 2): canvas boot, 2A46M with its thermal sleeve sections, the fume extractor a third back from the muzzle ----------
  b.part = 2; const gy = T72.gy;
  b.set(CANVAS, MAT.cloth); lathe(b, 2, 0, gy, 0, [[-1.72, 0.2], [-1.8, 0.2], [-1.86, 0.172], [-1.92, 0.178], [-1.98, 0.152], [-2.04, 0.155], [-2.1, 0.125]], 16, 1, true);
  const brl = (za, zb, ra, rb, cap = 0) => b.cyl(0, gy, za, 0, gy, zb, ra, rb, 16, cap);
  rus(DGRN, 2); brl(-2.05, -5.9, 0.092, 0.088);
  rus(GRN, 4); brl(-2.14, -3.2, 0.108, 0.108, 1); rus(GRN, 7); brl(-3.24, -4.3, 0.107, 0.107, 1); rus(GRN, 1); brl(-5.1, -5.86, 0.104, 0.104, 1);
  rus(DGRN, 6); brl(-4.32, -4.4, 0.1, 0.15); brl(-4.4, -5.0, 0.15, 0.15); brl(-5.0, -5.08, 0.15, 0.1);
  rus(DGRN, 9); for (const z of [-2.2, -3.14, -3.3, -4.24, -5.16, -5.8]) brl(z, z - 0.04, 0.116, 0.116, 1);
  b.set(DARK, MAT.metal); for (const z of [-2.2, -3.3, -5.16]) b.box(-0.02, gy + 0.11, z - 0.04, 0.02, gy + 0.13, z);
  rus(DGRN, 3); brl(-5.9, -6.05, 0.088, 0.087); brl(-6.05, -6.07, 0.087, 0.096); brl(-6.07, T72.mz, 0.096, 0.095); lathe(b, 2, 0, gy, T72.mz, [[0, 0.095], [0, 0.064], [0.25, 0.062]], 16, 1, false, true);
  b.set(BLK, MAT.void); b.cyl(0, gy, T72.mz + 0.2, 0, gy, T72.mz + 0.21, 0.063, 0.063, 12);
  fixWinding(b, i0);
  return b.build();
}

// ---------- BMP-2 ----------
export const BMP = { ty: 1.5, tz: 0.15, gy: 1.76, gz: -0.55, mz: -3.4, hl: 2.8, hw: 1.43, rad: 2.5, hh: 1.5, th: 2.05, tr: 1.0 };
export function buildBMP() {
  const b = new MB();
  const GRN = [0.034, 0.044, 0.026], DGRN = [0.024, 0.032, 0.02], DARK = [0.03, 0.031, 0.034], STEEL = [0.16, 0.17, 0.17];
  runningGear(b, 2, DGRN);
  b.part = 0; b.set(DGRN, MAT.rus);
  extX(b, [[0.42, -2.9], [0.91, -3.381], [0.91, 3.29], [0.55, 3.29], [0.42, 3.0]], -1.08, 1.08);
  b.set(GRN, MAT.rus);
  extX(b, [[0.9, -3.4], [0.98, -3.45], [1.5, -1.5], [1.5, 3.3], [0.9, 3.3]], -1.55, 1.55);
  for (let k = 0; k < 7; k++) { const t = 0.12 + k * 0.12, y = 0.98 + t * 0.52, z = -3.45 + t * 1.95; b.at(0, y, z, 0, 0.26); b.box(-1.3, 0, -0.02, 1.3, 0.04, 0.02); } b.at(0, 0, 0); // ribbed glacis
  for (const sx of [-1, 1]) {
    b.set(GRN, MAT.rus); b.box(sx * 1.66 - 0.13, 0.9, -3.3, sx * 1.66 + 0.13, 0.96, 3.3); b.box(sx * 1.77 - 0.02, 0.6, -3.2, sx * 1.77 + 0.02, 0.92, 3.25);
    b.set([1, 0.95, 0.82], MAT.head); poly(b, [[sx * 1.2 - 0.09, 1.22, -2.602], [sx * 1.2 + 0.09, 1.22, -2.602], [sx * 1.2 + 0.09, 1.35, -2.602], [sx * 1.2 - 0.09, 1.35, -2.602]], [sx * 1.2, 1.28, 0]);
    b.set(DGRN, MAT.rus); b.box(sx * 1.2 - 0.12, 1.2, -2.6, sx * 1.2 + 0.12, 1.37, -2.45);
    b.box(sx * 0.68 - 0.52, 0.7, 3.3, sx * 0.68 + 0.52, 1.42, 3.42, 0.06, 0.0); // bulged rear doors (fuel tanks)
    for (let k = 0; k < 4; k++) b.box(sx * 0.68 - 0.44, 0.82 + k * 0.15, 3.42, sx * 0.68 + 0.44, 0.86 + k * 0.15, 3.44);
    b.set(DARK, MAT.metal); for (let k = 0; k < 3; k++) b.box(sx * 1.56 - 0.01, 1.3, 0.9 + k * 0.7, sx * 1.56 + 0.01, 1.4, 1.2 + k * 0.7); // firing ports
  }
  b.set(DARK, MAT.metal); b.box(0.2, 1.5, -1.3, 1.2, 1.52, 0.0); b.box(-0.9, 1.5, 1.4, 0.9, 1.53, 3.0);
  b.part = 1; const tz = BMP.tz;
  b.set(GRN, MAT.rus); b.cyl(0, 1.5, tz, 0, 1.96, tz, 1.0, 0.72, 18); b.cyl(0.35, 1.96, tz + 0.15, 0.35, 2.03, tz + 0.15, 0.3, 0.3, 12);
  b.set(DGRN, MAT.rus); b.box(-0.12, 1.96, tz - 0.5, 0.12, 2.12, tz + 0.5); b.cyl(0, 2.2, tz - 0.6, 0, 2.2, tz + 0.6, 0.085, 0.085, 10); // ATGM launcher
  b.set(DARK, MAT.metal); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) b.cyl(sx * 0.9, 1.75, tz - 0.3 + k * 0.14, sx * 1.05, 1.9, tz - 0.42 + k * 0.14, 0.045, 0.045, 6);
  b.cyl(-0.8, 1.96, tz + 0.5, -0.83, 3.6, tz + 0.65, 0.008, 0.004, 4);
  b.part = 2; const gy = BMP.gy;
  b.set(GRN, MAT.rus); b.box(-0.18, gy - 0.13, -1.0, 0.18, gy + 0.13, -0.6);
  b.set(DARK, MAT.metal); b.cyl(0, gy, -0.95, 0, gy, -2.2, 0.05, 0.04, 8, 0); b.cyl(0, gy, -2.2, 0, gy, BMP.mz, 0.035, 0.035, 8); b.cyl(0, gy, BMP.mz + 0.25, 0, gy, BMP.mz, 0.05, 0.05, 8);
  b.cyl(0.14, gy + 0.02, -0.95, 0.14, gy + 0.02, -1.5, 0.02, 0.02, 6);
  return b.build();
}

// wheels: one part per axle (3 + k) rolling about it by the distance driven
export function wheelParts(out, t, K) { // t.trL: distance driven
  for (let k = 0; k < K.ax.length; k++) { const z = K.ax[k], a = -(t.trL + t.trR) * 0.5 / K.wr;
    trs(T1, 0, K.wr, z, 0, a, 0); identity(T2); T2[13] = -K.wr; T2[14] = -z; mul(T3, T1, T2); mul(TM, BM, T3); out.set(TM, 16 * (3 + k)); }
}

// ---------- enemy loitering munition (Lancet-style: a slim body with two cruciform wing sets, pusher prop), nose at -z ----------
// parts: 0 airframe, 1 propeller
export function buildLancet() {
  const b = new MB(), G = [0.2, 0.22, 0.2], DK = [0.04, 0.042, 0.045];
  b.part = 0; b.set(G, MAT.paint); b.cyl(0, 0, -0.85, 0, 0, 0.75, 0.07, 0.065, 12); b.cyl(0, 0, -0.85, 0, 0, -1.0, 0.07, 0.02, 12); b.cyl(0, 0, 0.75, 0, 0, 0.82, 0.065, 0.03, 10);
  b.set([0.05, 0.06, 0.08], MAT.glass); b.cyl(0, -0.07, -0.65, 0, -0.07, -0.55, 0.025, 0.025, 8); // seeker window
  b.set(G, MAT.paint);
  for (const [z, sp, ch] of [[-0.35, 0.5, 0.2], [0.45, 0.55, 0.24]]) for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; b.at(0, 0, z, 0, 0, a); b.box(-0.008, 0.05, -ch / 2, 0.008, sp, ch / 2, 0, 0.04); b.at(0, 0, 0); } // X-wings
  b.part = 1; b.set(DK, MAT.rubber); b.box(-0.2, -0.015, 0.85, 0.2, 0.015, 0.87); b.box(-0.015, -0.2, 0.85, 0.015, 0.2, 0.87);
  return b.build();
}
// ---------- enemy recon drone (Orlan-10-style: fuselage, high straight wing, conventional tail, nose prop), nose at -z, about 3.1 m span ----------
export function buildOrlan() {
  const b = new MB(), G = [0.32, 0.34, 0.3], DK = [0.04, 0.042, 0.045];
  b.part = 0; b.set(G, MAT.paint); b.box(-0.1, -0.12, -0.75, 0.1, 0.1, 0.55, 0.03, 0.02); b.cyl(0, -0.01, 0.55, 0, 0.02, 1.15, 0.07, 0.035, 10); b.cyl(0, -0.01, -0.75, 0, -0.01, -0.9, 0.09, 0.05, 10);
  b.box(-1.55, 0.1, -0.35, 1.55, 0.13, -0.08, 0, 0.02); // high wing
  b.box(-0.5, 0.02, 1.0, 0.5, 0.04, 1.18, 0, 0.02); b.box(-0.01, 0.02, 0.98, 0.01, 0.38, 1.2, 0, 0.06); // tailplane, fin
  b.set(DK, MAT.metal); b.box(-0.06, -0.2, -0.3, 0.06, -0.12, -0.15); b.set([0.03, 0.04, 0.06], MAT.glass); b.cyl(0, -0.2, -0.25, 0, -0.27, -0.25, 0.05, 0.05, 10); // camera turret
  b.part = 1; b.set(DK, MAT.rubber); b.box(-0.03, -0.32, -0.93, 0.03, 0.32, -0.91);
  return b.build();
}
// enemy air units: airframe plus one propeller turning about the body's long axis at local z = pz
export function airParts(out, a, pz) { // a: {x,y,z,yaw,pitch,roll,spin}
  trs(BM, a.x, a.y, a.z, a.yaw, a.pitch, a.roll); out.set(BM, 0);
  trs(T1, 0, 0, pz, 0, 0, a.spin); identity(T2); T2[14] = -pz; mul(T3, T1, T2); mul(TM, BM, T3); out.set(TM, 16);
}

// ---------- anti-tank mine (TM-62 style: a squat olive disc with the fuze well on top), about 0.32 m across ----------
export function buildMine() {
  const b = new MB(), OLV = [0.15, 0.17, 0.1], DARK = [0.05, 0.055, 0.045];
  b.set(OLV, MAT.paint); b.cyl(0, 0, 0, 0, 0.09, 0, 0.16, 0.155, 14); b.cyl(0, 0.09, 0, 0, 0.115, 0, 0.13, 0.11, 14);
  b.set(DARK, MAT.metal); b.cyl(0, 0.115, 0, 0, 0.14, 0, 0.045, 0.04, 10); b.set(OLV, MAT.paint); b.box(-0.17, 0.035, -0.012, -0.15, 0.06, 0.012); // fuze, carrying handle lug
  const nm = b.v.length / 14; // the marking picket follows: a thin stake with a red flag beside the mine (shown once the mine is marked)
  b.set([0.42, 0.36, 0.26], MAT.wood); b.cyl(0.3, -0.1, 0.05, 0.3, 0.85, 0.05, 0.014, 0.011, 5);
  b.set([0.75, 0.06, 0.03], MAT.paint); b.box(0.31, 0.66, 0.045, 0.55, 0.82, 0.055, 0, 0); b.set([0.95, 0.85, 0.1], MAT.paint); b.box(0.31, 0.6, 0.045, 0.43, 0.66, 0.055, 0, 0);
  const m = b.build(); m.nm = nm; return m;
}

// ---------- FPV drone with an anti-tank warhead slung underneath (about 0.75 m across) ----------
// parts: 0 airframe, 1..4 rotors
export function buildDrone() {
  const b = new MB(), DARK = [0.03, 0.031, 0.034], GREY = [0.12, 0.125, 0.13], OLV = [0.05, 0.06, 0.035];
  b.part = 0; b.set(DARK, MAT.paint);
  b.box(-0.085, 0, -0.17, 0.085, 0.06, 0.17, 0.01, 0.01); b.set(GREY, MAT.metal); b.box(-0.06, 0.06, -0.09, 0.06, 0.11, 0.12); // frame, battery
  b.set(DARK, MAT.metal); b.box(-0.035, 0.03, -0.215, 0.035, 0.09, -0.17); b.set([0.02, 0.035, 0.05], MAT.glass); poly(b, [[-0.025, 0.04, -0.216], [0.025, 0.04, -0.216], [0.025, 0.08, -0.216], [-0.025, 0.08, -0.216]], [0, 0.06, 0]); // camera
  b.set([1, 0.05, 0.02], MAT.head); poly(b, [[-0.02, 0.02, 0.171], [0.02, 0.02, 0.171], [0.02, 0.045, 0.171], [-0.02, 0.045, 0.171]], [0, 0.03, 0]);
  b.set(DARK, MAT.metal); b.cyl(0.05, 0.11, 0.1, 0.07, 0.3, 0.14, 0.006, 0.003, 4);
  for (let i = 0; i < 4; i++) { const px = i & 1 ? 0.3 : -0.3, pz = i & 2 ? 0.3 : -0.3;
    b.part = 0; b.set(DARK, MAT.paint); b.cyl(px * 0.2, 0.03, pz * 0.4, px, 0.03, pz, 0.018, 0.016, 6); b.set(GREY, MAT.metal); b.cyl(px, 0.01, pz, px, 0.07, pz, 0.036, 0.03, 10);
    b.part = i + 1; b.set(DARK, MAT.rubber); b.box(px - 0.2, 0.072, pz - 0.018, px + 0.2, 0.08, pz + 0.018); b.box(px - 0.018, 0.072, pz - 0.2, px + 0.018, 0.08, pz + 0.2); }
  // warhead: shaped charge with its nose cone, strapped under the frame
  b.part = 0; b.set(OLV, MAT.rus); b.cyl(0, -0.065, 0.14, 0, -0.065, -0.08, 0.05, 0.05, 12); b.cyl(0, -0.065, -0.08, 0, -0.065, -0.3, 0.05, 0.012, 12); b.cyl(0, -0.065, 0.14, 0, -0.065, 0.24, 0.022, 0.022, 8);
  b.set(DARK, MAT.rubber); for (const z of [-0.04, 0.09]) b.box(-0.055, -0.12, z - 0.01, 0.055, 0.005, z + 0.01);
  return b.build();
}
export function droneParts(out, d) { // d: {x,y,z,yaw,tp,tr,spin}
  trs(BM, d.x, d.y, d.z, d.yaw, d.tp, d.tr); out.set(BM, 0);
  for (let i = 0; i < 4; i++) { const px = i & 1 ? 0.3 : -0.3, pz = i & 2 ? 0.3 : -0.3;
    trs(T1, px, 0, pz, d.spin * (i === 0 || i === 3 ? 1 : -1), 0, 0); identity(T2); T2[12] = -px; T2[14] = -pz; mul(T3, T1, T2); mul(TM, BM, T3); out.set(TM, 16 * (i + 1)); }
}

// part matrices: 0 hull, 1 turret (yaw about the ring), 2 gun (pitch about the trunnion, recoil along the bore)
const T1 = new Float32Array(16), T2 = new Float32Array(16), T3 = new Float32Array(16), BM = new Float32Array(16), TM = new Float32Array(16), GM = new Float32Array(16);
export function tankParts(out, t, K, yaw = t.turYaw) { // yaw: the turret yaw to draw, when it differs from the one aimed with (the motorcycle's pillion); // out: Float32Array(16*8), t: {x,y,z,yaw,pitch,roll,turYaw,gunPitch,recoil}
  trs(BM, t.x, t.y, t.z, t.yaw, t.pitch + t.dp, t.roll + t.dr);
  trs(T1, 0, K.ty + t.tl, K.tz, yaw, t.tt, t.tt * 0.6); identity(T2); T2[13] = -K.ty; T2[14] = -K.tz; mul(T3, T1, T2); mul(TM, BM, T3);
  trs(T1, 0, K.gy, K.gz, 0, t.gunPitch, 0); identity(T2); T2[13] = -K.gy; T2[14] = -K.gz + t.recoil; mul(T3, T1, T2); mul(GM, TM, T3);
  out.set(BM, 0); out.set(TM, 16); out.set(GM, 32);
  trs(T1, t.x, t.y, t.z, t.yaw, t.pitch, t.roll); out.set(T1, 48); // part 3: the running gear of the tracked vehicles stays on the ground while the hull rocks (wheeled ones overwrite it)
  return BM;
}
export const gunMat = () => GM, turMat = () => TM;
