// Time-of-day presets, interpolated into the globals buffer.
// fields: sunAz, sunEl, lightAz, lightEl, light rgb, ambSky rgb, ambGnd rgb, zen rgb, hor rgb, glow rgb,
//         fogDens, exposure, stars, night, sparkle, sunDisc, moon, farShade, cloud, fogTint
const D = Math.PI / 180;
const P = [
  // midday
  [-18, 15, -18, 15, 3.5, 3.15, 2.6, 0.42, 0.56, 0.86, 0.36, 0.40, 0.48, 0.09, 0.22, 0.60, 0.50, 0.66, 0.90, 0.55, 0.42, 0.26, 0.00016, 0.50, 0, 0, 1, 1, 0, 0.42, 0.55, 1],
  // golden hour
  [-58, 4.2, -58, 5.5, 4.4, 2.25, 0.95, 0.27, 0.35, 0.64, 0.27, 0.25, 0.29, 0.10, 0.19, 0.46, 0.80, 0.56, 0.44, 1.5, 0.62, 0.22, 0.00022, 0.56, 0, 0.15, 1, 1, 0, 0.36, 0.75, 1],
  // blue hour
  [-74, -5.5, -74, 14, 0.2, 0.17, 0.22, 0.085, 0.14, 0.33, 0.04, 0.06, 0.12, 0.018, 0.045, 0.16, 0.10, 0.15, 0.34, 0.8, 0.28, 0.1, 0.00026, 1.5, 0.3, 1, 0.2, 0, 0, 0.7, 0.5, 1],
  // night
  [-110, -32, 50, 30, 0.03, 0.04, 0.066, 0.007, 0.012, 0.03, 0.004, 0.006, 0.013, 0.0025, 0.005, 0.016, 0.01, 0.017, 0.04, 0, 0, 0, 0.00022, 2.7, 1, 1, 0.6, 0, 1, 0.55, 0.3, 1],
];
export const NF = P[0].length;
export const cur = new Float32Array(NF);
const from = new Float32Array(NF), to = new Float32Array(NF);
let tt = 1;
export let todIndex = 0;
export function setTod(i, instant) {
  todIndex = i; from.set(cur); to.set(P[i]);
  // shortest way round for azimuths
  for (const k of [0, 2]) { while (to[k] - from[k] > 180) to[k] -= 360; while (to[k] - from[k] < -180) to[k] += 360; }
  tt = instant ? 1 : 0; if (instant) cur.set(to);
}
// returns true while changing (shadow bake needed)
export function updateTod(dt) {
  if (tt >= 1) return false;
  tt = Math.min(1, tt + dt / 2.5);
  const s = tt * tt * (3 - 2 * tt);
  for (let i = 0; i < NF; i++) cur[i] = from[i] + (to[i] - from[i]) * s;
  return true;
}
// writes into globals array g at the given float offsets
export function writeTod(g, O) {
  const c = cur;
  const ce = Math.cos(c[1] * D), le = Math.cos(c[3] * D);
  g[O.skySun] = Math.sin(c[0] * D) * ce; g[O.skySun + 1] = Math.sin(c[1] * D); g[O.skySun + 2] = Math.cos(c[0] * D) * ce; g[O.skySun + 3] = c[27];
  g[O.sunDir] = Math.sin(c[2] * D) * le; g[O.sunDir + 1] = Math.sin(c[3] * D); g[O.sunDir + 2] = Math.cos(c[2] * D) * le; g[O.sunDir + 3] = c[28];
  g[O.sunCol] = c[4]; g[O.sunCol + 1] = c[5]; g[O.sunCol + 2] = c[6]; g[O.sunCol + 3] = c[26];
  g[O.ambSky] = c[7]; g[O.ambSky + 1] = c[8]; g[O.ambSky + 2] = c[9];
  g[O.ambGnd] = c[10]; g[O.ambGnd + 1] = c[11]; g[O.ambGnd + 2] = c[12];
  g[O.skyZen] = c[13]; g[O.skyZen + 1] = c[14]; g[O.skyZen + 2] = c[15]; g[O.skyZen + 3] = c[24];
  g[O.skyHor] = c[16]; g[O.skyHor + 1] = c[17]; g[O.skyHor + 2] = c[18]; g[O.skyHor + 3] = c[30];
  g[O.fogSun] = c[19]; g[O.fogSun + 1] = c[20]; g[O.fogSun + 2] = c[21]; g[O.fogSun + 3] = 0.012;
  g[O.fogCol] = c[31]; g[O.fogCol + 1] = c[31]; g[O.fogCol + 2] = c[31]; g[O.fogCol + 3] = c[22];
  g[O.misc] = c[25]; g[O.misc + 2] = c[23]; g[O.misc + 3] = c[29];
}
