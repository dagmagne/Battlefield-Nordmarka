// Procedural tanks. Local frame: x right, y up, forward = -z, origin on the snow between the tracks.
// Parts: 0 hull, 1 turret, 2 gun (elevation + recoil). The track loop constants must match objdeform.wgsl.
import { MB, MAT } from './mesh.js';
import { trs, mul, identity } from './math.js';

import { poly, extX, extY, mirror } from './vehutil.js';
import { TRK, runningGear } from './gear.js';
export { TRK };
export * from './leopard.js';
export * from './wheeled.js';
export * from './bikes.js';

// ---------- T-72B3 ----------
export const T72 = { ty: 1.32, tz: -0.35, gy: 1.68, gz: -1.3, mz: -6.15, hl: 2.9, hw: 1.43, rad: 2.6, hh: 1.32, th: 2.1, tr: 1.35 };
export function buildT72(cage = false) {
  const b = new MB();
  const GRN = [0.03, 0.04, 0.024], DGRN = [0.022, 0.03, 0.019], DARK = [0.03, 0.031, 0.034], STEEL = [0.16, 0.17, 0.17], BRN = [0.1, 0.065, 0.035];
  runningGear(b, 6, 0.375, -2.45, 2.5, DGRN);
  b.part = 0; b.set(DGRN, MAT.rus);
  extX(b, [[0.45, -3.15], [0.85, -3.55], [0.91, -3.384], [0.91, 3.29], [0.62, 3.29], [0.45, 3.0]], -1.08, 1.08);
  b.set(GRN, MAT.rus);
  extX(b, [[0.9, -3.45], [1.32, -2.25], [1.32, 3.3], [0.9, 3.3]], -1.26, 1.26);
  // glacis ERA bricks and the V-shaped splash board
  b.set(DGRN, MAT.rus);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { const x = -1.05 + k * 0.36, t = 0.2 + r * 0.38, y = 0.9 + t * 0.42, z = -3.45 + t * 1.2; b.at(x + 0.15, y + 0.05, z, 0, 0.34); b.box(-0.15, 0, -0.2, 0.15, 0.07, 0.2); } b.at(0, 0, 0);
  for (const sx of [-1, 1]) {
    b.set(GRN, MAT.rus);
    b.box(sx * 1.52 - 0.28, 0.9, -3.3, sx * 1.52 + 0.28, 0.96, 3.35); // fender shelf
    b.box(sx * 1.52 - 0.24, 0.96, -1.6, sx * 1.52 + 0.24, 1.2, 0.2, 0.02, 0.02); b.box(sx * 1.52 - 0.24, 0.96, 0.4, sx * 1.52 + 0.24, 1.24, 2.6, 0.02, 0.02); // fender fuel cells and stowage
    b.set(DARK, MAT.rubber); b.box(sx * 1.79 - 0.02, 0.52, -3.2, sx * 1.79 + 0.02, 0.92, 3.3); // rubber skirt
    b.box(sx * 1.43 - 0.36, 0.5, -3.42, sx * 1.43 + 0.36, 0.95, -3.38); b.box(sx * 1.43 - 0.36, 0.4, 3.36, sx * 1.43 + 0.36, 0.95, 3.39);
    b.set(DGRN, MAT.rus); for (let k = 0; k < 5; k++) b.box(sx * 1.83 - 0.04, 0.56, -3.1 + k * 0.5, sx * 1.83 + 0.04, 0.9, -2.66 + k * 0.5); // ERA on the front skirts
    b.set([1, 0.95, 0.82], MAT.head); poly(b, [[sx * 0.95 - 0.09, 1.2, -2.52], [sx * 0.95 + 0.09, 1.2, -2.52], [sx * 0.95 + 0.09, 1.33, -2.52], [sx * 0.95 - 0.09, 1.33, -2.52]], [sx * 0.95, 1.25, 0]);
    b.set(GRN, MAT.rus); b.cyl(sx * 0.95, 1.14, 3.58, sx * 0.05, 1.14, 3.58, 0.27, 0.27, 14); // external fuel drums
    b.set(STEEL, MAT.metal); b.box(sx * 0.5 - 0.03, 0.85, 3.3, sx * 0.5 + 0.03, 1.4, 3.6);
  }
  b.set(BRN, MAT.paint); b.cyl(-1.15, 0.72, 3.42, 1.15, 0.72, 3.42, 0.11, 0.11, 8); // unditching log
  b.set(DARK, MAT.metal); b.box(-1.0, 1.32, 2.0, 1.0, 1.34, 3.1); b.box(-0.2, 1.32, -2.0, 0.2, 1.38, -1.75); // engine grille, driver periscope
  // --- turret: cast dome ---
  b.part = 1; const tz = T72.tz;
  b.set(GRN, MAT.rus);
  b.cyl(0, 1.32, tz, 0, 1.52, tz, 1.3, 1.33, 22, 0); b.cyl(0, 1.52, tz, 0, 1.8, tz, 1.33, 1.12, 22, 0); b.cyl(0, 1.8, tz, 0, 1.98, tz, 1.12, 0.72, 22, 0); b.cyl(0, 1.98, tz, 0, 2.03, tz, 0.72, 0.3, 22);
  b.set(DGRN, MAT.rus);
  for (let k = -4; k <= 4; k++) { if (k === 0) continue; const a = k * 0.26; b.at(-Math.sin(a) * 1.36, 1.5, tz - Math.cos(a) * 1.36, a, 0.5); b.box(-0.16, -0.12, -0.3, 0.16, 0.14, 0.12); } b.at(0, 0, 0); // turret ERA wedges
  b.box(-0.75, 1.5, tz + 1.25, 0.75, 1.9, tz + 1.75, 0.03, 0.03); // rear stowage box
  b.cyl(-0.9, 1.72, tz + 1.9, 0.9, 1.72, tz + 1.9, 0.14, 0.14, 10); // snorkel tube
  b.cyl(0.55, 2.0, tz + 0.15, 0.55, 2.16, tz + 0.15, 0.36, 0.33, 14); b.cyl(-0.55, 1.98, tz + 0.2, -0.55, 2.03, tz + 0.2, 0.33, 0.33, 14);
  b.set(DARK, MAT.metal); b.cyl(0.55, 2.16, tz + 0.1, 0.55, 2.36, tz + 0.1, 0.03, 0.03, 6); b.box(0.5, 2.33, tz - 0.4, 0.6, 2.43, tz + 0.5); b.cyl(0.55, 2.38, tz - 0.4, 0.55, 2.4, tz - 1.25, 0.022, 0.022, 6); // NSVT
  b.box(0.5, 1.72, tz - 1.5, 0.95, 2.0, tz - 1.2); b.cyl(-1.0, 2.0, tz + 0.9, -1.05, 4.0, tz + 1.1, 0.009, 0.004, 4);
  b.set([0.1, 0.02, 0.02], MAT.glass); poly(b, [[0.54, 1.75, tz - 1.503], [0.91, 1.75, tz - 1.503], [0.91, 1.97, tz - 1.503], [0.54, 1.97, tz - 1.503]], [0.7, 1.85, 0]); // Luna searchlight
  if (cage) { // cope cage: welded posts round the turret carrying a slatted roof well above it (against drones dropping in from above)
    b.set([0.05, 0.05, 0.045], MAT.metal); const Y0 = 1.62, Y1 = 2.78, X = 1.5, Z0 = tz - 1.75, Z1 = tz + 1.65;
    for (const [x, z] of [[-X, Z0 + 0.1], [X, Z0 + 0.1], [-X, (Z0 + Z1) / 2], [X, (Z0 + Z1) / 2], [-X + 0.1, Z1], [X - 0.1, Z1]]) b.box(x - 0.03, Y0, z - 0.03, x + 0.03, Y1, z + 0.03);
    b.box(-X, Y1, Z0, X, Y1 + 0.05, Z0 + 0.06); b.box(-X, Y1, Z1 - 0.06, X, Y1 + 0.05, Z1); b.box(-X, Y1, Z0, -X + 0.06, Y1 + 0.05, Z1); b.box(X - 0.06, Y1, Z0, X, Y1 + 0.05, Z1); // roof frame
    for (let k = 1; k < 9; k++) { const z = Z0 + (Z1 - Z0) * k / 9; b.box(-X, Y1 + 0.01, z - 0.015, X, Y1 + 0.035, z + 0.015); } // slats across
    for (let k = 1; k < 6; k++) { const x = -X + 2 * X * k / 6; b.box(x - 0.012, Y1 + 0.035, Z0, x + 0.012, Y1 + 0.06, Z1); } // and along
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const z = Z0 + 0.3 + k * 0.85; b.at(sx * X, (Y0 + Y1) / 2 + 0.1, z, 0, 0, sx * 0.0); b.box(-0.012, -0.45, -0.35, 0.012, 0.45, 0.35, 0, 0); b.at(0, 0, 0); } // side grilles
    b.set(DARK, MAT.metal); for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const z = Z0 + 0.3 + k * 0.85; for (let j = -2; j <= 2; j++) b.box(sx * X - 0.02, Y0 + 0.25, z + j * 0.14 - 0.008, sx * X + 0.02, Y1 - 0.05, z + j * 0.14 + 0.008); }
  }
  // --- gun 2A46M ---
  b.part = 2; const gy = T72.gy;
  b.set(GRN, MAT.rus); b.box(-0.3, gy - 0.2, -1.95, 0.3, gy + 0.2, -1.5, 0.03, 0, 0);
  b.set(DGRN, MAT.rus);
  b.cyl(0, gy, -1.9, 0, gy, -3.5, 0.115, 0.1, 12, 0);
  b.cyl(0, gy, -3.5, 0, gy, -3.58, 0.1, 0.145, 12, 0); b.cyl(0, gy, -3.58, 0, gy, -4.2, 0.145, 0.145, 12, 0); b.cyl(0, gy, -4.2, 0, gy, -4.28, 0.145, 0.095, 12, 0);
  b.cyl(0, gy, -4.28, 0, gy, T72.mz, 0.095, 0.085, 12, 0);
  for (const z of [-2.5, -3.1, -4.9, -5.6]) b.cyl(0, gy, z, 0, gy, z - 0.06, 0.125, 0.125, 12);
  b.set(DARK, MAT.void); b.cyl(0, gy, T72.mz, 0, gy, T72.mz - 0.003, 0.063, 0.063, 12);
  return b.build();
}

// ---------- BMP-2 ----------
export const BMP = { ty: 1.5, tz: 0.15, gy: 1.76, gz: -0.55, mz: -3.4, hl: 2.8, hw: 1.43, rad: 2.5, hh: 1.5, th: 2.05, tr: 1.0 };
export function buildBMP() {
  const b = new MB();
  const GRN = [0.034, 0.044, 0.026], DGRN = [0.024, 0.032, 0.02], DARK = [0.03, 0.031, 0.034], STEEL = [0.16, 0.17, 0.17];
  runningGear(b, 6, 0.3, -2.4, 2.45, DGRN);
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
export function tankParts(out, t, K) { // out: Float32Array(16*8), t: {x,y,z,yaw,pitch,roll,turYaw,gunPitch,recoil}
  trs(BM, t.x, t.y, t.z, t.yaw, t.pitch + t.dp, t.roll + t.dr);
  trs(T1, 0, K.ty + t.tl, K.tz, t.turYaw, t.tt, t.tt * 0.6); identity(T2); T2[13] = -K.ty; T2[14] = -K.tz; mul(T3, T1, T2); mul(TM, BM, T3);
  trs(T1, 0, K.gy, K.gz, 0, t.gunPitch, 0); identity(T2); T2[13] = -K.gy; T2[14] = -K.gz + t.recoil; mul(T3, T1, T2); mul(GM, TM, T3);
  out.set(BM, 0); out.set(TM, 16); out.set(GM, 32);
  return BM;
}
export const gunMat = () => GM, turMat = () => TM;
