// Nordmarka (Holmenkollen – Frognerseteren – Tryvann) from real map data, with procedural detail on top.
// Macro shape comes from src/data/world.bin (built by tools/geo/prep.py from Kartverket elevation + OpenStreetMap):
// 8 m height grid, water / wetland rasters, lidar tree cover + canopy height, nordic trail polylines, building rectangles.
// Everything else (terrain detail, trees, snow, houses, landmarks) is generated here.
// World frame: x = east, z = south, metres; origin 59.9753 N, 10.6800 E.
import { clamp, lerp, smooth, hash1, hash2 } from './math.js';
import DATA from './data/world.bin';

export const WS = 4096, HN = 2048, TEX = WS / HN, HALF = WS / 2;
const PLAY = 1560, MW = 3200, TREELINE = 900;
export const NEAR = 32, NCN = WS / NEAR, FAR = 128, FCN = WS / FAR;
// landmark geometry (from tools/geo/raw/landmarks.json)
export const LM = {
  frogner: { x: -139.5, z: -259.0, yaw: 0 }, // restaurant footprint centre from the lidar; local +z (front, terrace) faces south over the city
  // jump profiles: Midtstubakken deck [d, y] from the lidar surface model (tools/geo/jumps.py); wing [d, t, top y] lidar wing tops; block [from d, half width]
  jump: { top: [-865.1, 1152.8], lip: [-774.2, 1207.0], end: [-542.2, 1340.4], w: 6.5, plat: 16, roof: 423.5,
    track: { s: [18, 420.5], g: 36, lip: [106, 373], tl: 6.7, ta: 11 }, // analytic inrun (the section): start s [d, y], straight at g degrees, one arc, take-off table tl m at ta degrees to the lip [d, y]
    wing: [[82, 9, 381.5], [92, 10.8, 379.5], [102, 13, 378.5], [112, 17, 376.4], [120, 20, 376.5], [128, 22.5, 374], [146, 29, 367.4], [158, 33, 363.5], [176, 37, 358], [190, 40, 351], [198, 42, 343]], block: [86, 7], edge: [[112, 13.5], [128, 18], [146, 22.5], [160, 18.5], [190, 18.5], [222, 16], [260, 17.5]],
    hb: [[0, 5.2], [30, 5.2], [48, 6], [66, 7.8], [84, 9.5], [106, 11]], core: [80, 92, 5.5], strut: [44, 52], hut: [[186, 200, -56, -46, 7, 1], [204, 216, 49, 59, 9, 1], [32, 80, -31, -10, 8]] }, // hb [d, outer half width]; core [d0, d1, half width] the base under the knee; strut [d at the girder, d at the foot]; hut [d0, d1, t0, t1, height, dark]: judges, the dark block, visitor centre; edge [d, t] the landing hill edge
  mid: { top: [-338.1, 932.8], lip: [-247.9, 957.4], end: [-28.3, 1018.6], w: 4.5, plat: 8, skirt: 1, st: [1, 0], house: [-8.5, 1, -6.5, 3.5, 4.4],
    deck: [[0, 372.4], [8, 367.4], [16, 361.8], [24, 356.2], [32, 350.6], [40, 345.0], [48, 339.4], [56, 334.4], [64, 330.3], [72, 327.2], [80, 325.0], [94, 323.2]] },
  tower: { x: -663.5, z: -1486.2, h: 118 }, // centre of the drum in the lidar surface model
  lift: { a: [-693, -1558], b: [-1130, -1875], sp: 46, h: 9 }, // chairlift west of the tower: top station a, running out of the map to the north-west
  chapel: { x: -425.3, z: 1074.7, yaw: -1.431 }, // lidar: nave runs west (local +x), crossing tower and transept at the east end
  // Holmenkollen arena, measured from the lidar (tools/geo/stands.py; outlines guided by the OSM spectator_stand ways). Frame f: [ax, az, bx, bz]
  // (d along a -> b, t to its right) or 'jump' / 'mid' (that jump's top -> end axis). Stands: ribs r [d, t front, t back], rows run front -> back;
  // n = rows splitting the depth evenly (the bowl), else rows rw deep; treads at the ground + lift; ribs every seg m; seat = seat rows; ads = banner line at t.
  // box [d0, d1, t0, t1, top y, kind 0 building / 1 roof on posts]; range: 30 lanes, targets at t tg, firing line at t fl; mast [x, z, height].
  arena: {
    stands: [
      // the amphitheatre round Holmenkollbakken's outrun (architect's plan for shape, lidar for size): bowl rings, s = side (-1 north, +1 south),
      // outlines [d, |t|] from the oblique upper edge (where the wedge stands end; lidar t = 37.5 - 1.4 (d - 220) + 2.5 m walkway) down to the
      // outrun tail: o = top of the rows (a walkway runs round outside it), i = their foot (outrun wall top, or the south walkway curve), w = foot of the outrun wall (the front wall stands there).
      // Rows rw deep follow o (concentric), cut by i; ww = rim walkway width. The south side is a big outer bank above a walkway curve
      // and a steep concrete band below it (lidar: two walls; the plan's two curves).
      { f: 'jump', bowl: 1, s: -1, rw: 2, ww: 3.5, o: [[212.1, 52], [240, 52.5], [260, 52.5], [280, 52], [290, 51], [300, 49], [310, 44], [320, 38], [330, 30], [340, 22], [350, 14], [356, 10.5]],
        i: [[237.1, 17], [250, 18.5], [260, 20], [270, 20], [280, 18], [290, 16], [300, 15], [310, 14.5], [320, 14], [330, 13], [340, 12], [350, 11], [356, 10.5]],
        w: [[235, 16], [245, 15], [255, 16], [265, 16], [275, 15.5], [285, 15], [295, 12.5], [305, 12], [315, 12], [325, 11], [335, 11], [345, 10], [356, 9.5]] },
      { f: 'jump', bowl: 1, s: 1, rw: 2, ww: 3.5, o: [[212.1, 52], [240, 52], [260, 51.5], [280, 51], [290, 49], [300, 47], [310, 43], [320, 37], [330, 30], [340, 21], [350, 14], [356, 10.5]],
        i: [[225, 34], [238, 34], [260, 32], [280, 30], [300, 25.5], [310, 21], [322, 15], [330, 13.5], [340, 13.5], [350, 12.5], [356, 10.5]], w: [[322, 13], [335, 12], [345, 11], [356, 10.5]] },
      { f: 'jump', bowl: 1, s: 1, rw: 1.4, o: [[226.4, 32], [238, 32], [260, 30], [280, 28], [300, 23.5], [310, 19], [318, 16]], i: [[236.1, 18.5], [250, 19], [260, 19.5], [270, 19], [280, 18.5], [290, 17.5], [300, 17], [310, 16], [318, 16]],
        w: [[235, 17.5], [245, 16.5], [255, 17], [265, 16.5], [275, 17], [285, 16], [295, 15], [305, 14], [318, 14]] },
      { f: 'jump', x: 1, rh: 0.8, lift: 0.3, r: [[146, -23, -27.5], [160, -18.5, -31.5], [170, -18, -33.5], [180, -19, -37], [190, -19, -39.5], [200, -17.5, -44.5], [211, -16, -46.5], [232, -17, -17.2]] }, // lower end: the oblique line where the bowl begins
      { f: 'jump', x: 1, rh: 0.8, lift: 0.3, r: [[146, 23, 27.5], [160, 19.5, 31.5], [170, 20, 33.5], [180, 20, 37], [190, 20, 39.5], [200, 19.5, 46.5], [210, 18.5, 48], [232, 17.5, 17.7]] },
      { f: [-588, 1072, -502, 1196], rw: 1.5, lift: 0.3, seg: 12, seat: 1, ads: 8.5, r: [[-8, 6.5, -7.5], [160, 6.5, -7.5]] },
      { f: 'mid', rw: 1.5, lift: 1.4, seg: 12, seat: 1, r: [[160, 14.5, 22], [235, 14.5, 22]] },
      { f: 'mid', rw: 2, lift: 0.2, seg: 12, r: [[215, -12, -24], [315, -12, -24]] },
      { f: [-655, 1400, -578, 1388], rw: 2, lift: 0.2, seg: 12, r: [[0, -3, 10], [65, -3, 10]] },
    ],
    boxes: [{ f: [-588, 1072, -502, 1196], b: [[78, 146, -9.5, -3, 341.3, 0], [146, 162, -8.5, 5.5, 341, 1]] },
      { f: 'mid', b: [[143, 155, 25.5, 34.5, 306.8, 0], [155, 166, 25.5, 34.5, 302.4, 0], [166, 177, 25.5, 34.5, 297.7, 0]] }],
    range: { f: [-642, 1070, -688, 1148], n: 30, tg: -1, fl: -50 },
    finish: { f: [-588, 1072, -502, 1196], d: 75, t0: 9.5, t1: 25 }, // where the finish line is is a guess
    mast: [[-606, 1403, 14.9], [-641, 1409, 14.3], [-760, 1272, 40.6], [-711, 1185, 37.8], [-709, 1312, 40.4], [-616, 1375, 31.8], [-550, 1260, 31.9], [-651, 1211, 41.9], [-64, 1042, 27.4], [-225, 997, 28.9], [-274, 979, 27.1], [-315, 964, 27.5]],
  },
};
// an arena frame: origin, unit axis, length; the t front / back of a stand at d (linear between ribs), null outside it
export const arenaFrame = (f) => { const q = f === 'jump' ? [...LM.jump.top, ...LM.jump.end] : f === 'mid' ? [...LM.mid.top, ...LM.mid.end] : f, L = Math.hypot(q[2] - q[0], q[3] - q[1]); return [q[0], q[1], (q[2] - q[0]) / L, (q[3] - q[1]) / L, L]; };
// where a floodlight mast points: the nearer jump's axis, abreast of the mast (d clamped to the landing hill and outrun)
export const mastAim = (x, z) => { let best = 1e9, a = [x, z]; for (const f of ['jump', 'mid']) { const F = arenaFrame(f), dx = x - F[0], dz = z - F[1], d = clamp(dx * F[2] + dz * F[3], 150, F[4] + 60), t = -dx * F[3] + dz * F[2]; if (Math.abs(t) < best) { best = Math.abs(t); a = [F[0] + F[2] * d, F[1] + F[3] * d]; } } return a; };
export const standAt = (r, d) => { if (d < r[0][0] || d > r[r.length - 1][0]) return null; let i = 0; while (i < r.length - 2 && d > r[i + 1][0]) i++; const a = r[i], b = r[i + 1], k = (d - a[0]) / (b[0] - a[0] || 1); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
// a bowl ring's footprint as stand ribs [d, t foot, t top] (signed) for inArena: the foot is outline i, or the oblique upper edge above its first point
const polyT = (P, d) => { let k = 0; while (k < P.length - 2 && d > P[k + 1][0]) k++; const a = P[k], b = P[k + 1]; return a[1] + (b[1] - a[1]) * clamp((d - a[0]) / (b[0] - a[0] || 1), 0, 1); };
for (const S of LM.arena.stands) if (S.bowl) { const o = S.o, i = S.i, e = o[o.length - 1][0]; S.r = [];
  for (let d = o[0][0]; d < e + 1.99; d += 2) { const q = Math.min(d, e), ti = q < i[0][0] ? o[0][1] + (i[0][1] - o[0][1]) * (q - o[0][0]) / (i[0][0] - o[0][0]) : polyT(i, q); S.r.push([q, S.s * ti, S.s * polyT(o, q)]); } }

// ---------- noise ----------
const P = new Uint8Array(512);
{ const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (hash1(i * 7919 + 13) * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const GX = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0]), GY = new Float32Array([1, 1, -1, -1, 0, 0, 1, -1]);
export function pn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const aa = P[P[X] + Y] & 7, ab = P[P[X] + Y + 1] & 7, ba = P[P[X + 1] + Y] & 7, bb = P[P[X + 1] + Y + 1] & 7;
  const a = GX[aa] * xf + GY[aa] * yf, b = GX[ba] * (xf - 1) + GY[ba] * yf, c = GX[ab] * xf + GY[ab] * (yf - 1), d = GX[bb] * (xf - 1) + GY[bb] * (yf - 1);
  return (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.3;
}
export function fbm(x, y, o) { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * pn(x, y); x = x * 2.03 + 17.1; y = y * 2.03 - 9.3; a *= 0.5; } return s; }


// Blend the outer 80 texels of a HN x HN raster (stride values per texel, channel c) towards their running mean along the edge (+-R texels).
function edgeBlur(A, stride, c, R) {
  const BW = 80, ps = new Float64Array(HN + 1);
  for (let side = 0; side < 4; side++) for (let r = 0; r < BW; r++) {
    const w = (1 - r / BW) ** 1.5, o = side === 0 ? r * HN : side === 1 ? (HN - 1 - r) * HN : side === 2 ? r : HN - 1 - r, st = side < 2 ? 1 : HN;
    for (let t = 0; t < HN; t++) ps[t + 1] = ps[t] + A[(o + t * st) * stride + c];
    for (let t = 0; t < HN; t++) { const t0 = Math.max(0, t - R), t1 = Math.min(HN, t + R + 1), k = (o + t * st) * stride + c; A[k] = lerp(A[k], (ps[t1] - ps[t0]) / (t1 - t0), w); }
  }
}
// inside a ski jump's footprint (inrun, wind screens, landing hill out to d = far along its axis, widened by m)?
const inAB = (x, z) => x > -1100 && x < 200 && z > 750 && z < 1550; // everything below lies in this box: a cheap reject for the 1.3 M tree candidates
const inJump = (x, z, far, m) => { if (!inAB(x, z)) return false; for (const J of [LM.jump, LM.mid]) { const ex = J.end[0] - J.top[0], ez = J.end[1] - J.top[1], l = Math.hypot(ex, ez), d = ((x - J.top[0]) * ex + (z - J.top[1]) * ez) / l, ts = ((x - J.top[0]) * -ez + (z - J.top[1]) * ex) / l, t = Math.abs(ts);
  if (d > -10 && d < (far || l) && t < m + 13 + 0.3 * clamp(d - 60, 0, 110)) return true;
  for (const H of J.hut || []) if (d > H[0] - m - 2 && d < H[1] + m + 2 && ts > Math.min(H[2], H[3]) - m - 2 && ts < Math.max(H[2], H[3]) + m + 2) return true; } return false; }; // + the huts and the visitor centre
// inside an arena stand, stand building or the shooting range (LM.arena), widened by m?
const AR = LM.arena, arF = (f, x, z) => { const F = arenaFrame(f), dx = x - F[0], dz = z - F[1]; return [dx * F[2] + dz * F[3], -dx * F[3] + dz * F[2]]; };
const inArena = (x, z, m) => { if (!inAB(x, z)) return false; for (const S of AR.stands) { const p = arF(S.f, x, z), q = standAt(S.r, p[0]); if (q && p[1] > Math.min(q[0], q[1]) - m && p[1] < Math.max(q[0], q[1]) + m) return true; }
  for (const B of AR.boxes) { const p = arF(B.f, x, z); for (const c of B.b) if (p[0] > c[0] - m && p[0] < c[1] + m && p[1] > c[2] - m && p[1] < c[3] + m) return true; }
  const p = arF(AR.range.f, x, z); return p[0] > -6 - m && p[0] < 96 + m && p[1] > AR.range.fl - 6 - m && p[1] < AR.range.tg + 2 + m; };

// ---- plowed roads (module level: genWorld is close to V8's optimisation limit) ----
// meta.roads [n, width*10, class]: class 0 = the seven original roads, 1 secondary, 2 tertiary, 3 unclassified (major: the old wide bed),
// 4 residential, 5 living street, 6 service, 7 driveway / parking aisle (minor: a narrow bed that leaves the lidar cuttings alone).
// mat.G holds the distance to the asphalt edge (0.667 = edge, 6 m ramp). roadNet: centre lines for enemy routing (classes 0-3, and streets over 250 m).
const gOfR = (e) => 255 * clamp(1 - (e + 2) / 6, 0, 1);
const bilin = (A, x, z) => { let fx = clamp((x + HALF) / TEX - 0.5, 0, HN - 1.001), fz = clamp((z + HALF) / TEX - 0.5, 0, HN - 1.001); const ix = fx | 0, iz = fz | 0; fx -= ix; fz -= iz; const i = iz * HN + ix;
  return (A[i] * (1 - fx) + A[i + 1] * fx) * (1 - fz) + (A[i + HN] * (1 - fx) + A[i + HN + 1] * fx) * fz; };
const polyDist = (L, x, z) => { let m = 1e9; for (const t of L) for (let i = 0; i + 3 < t.length; i += 2) { const ax = t[i], az = t[i + 1], vx = t[i + 2] - ax, vz = t[i + 3] - az, u = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1); m = Math.min(m, Math.hypot(x - ax - vx * u, z - az - vz * u)); } return m; };
function footMask(buildings) { // house footprints + 1 m: road beds leave the ground there alone (no buried doorsteps, no cuts under walls)
  const fp = new Uint8Array(HN * HN);
  for (const B of buildings) { const cs = Math.cos(B.yaw), sn = Math.sin(B.yaw), hw = B.w / 2 + 1, hd = B.d / 2 + 1, r = Math.hypot(hw, hd), i0 = Math.max(0, Math.floor((B.x - r + HALF) / TEX)), i1 = Math.min(HN - 1, Math.ceil((B.x + r + HALF) / TEX)), j0 = Math.max(0, Math.floor((B.z - r + HALF) / TEX)), j1 = Math.min(HN - 1, Math.ceil((B.z + r + HALF) / TEX));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = (i + 0.5) * TEX - HALF - B.x, dz = (j + 0.5) * TEX - HALF - B.z; if (Math.abs(dx * cs - dz * sn) < hw && Math.abs(dx * sn + dz * cs) < hd) fp[j * HN + i] = 1; } }
  return fp;
}
function plowRoads(meta, b, H, H0, mat, polish, buildings, portals, roadNet, mapRoads) { // flat bed along a smoothed profile, sunk under the ski bridges (tunnels) with headwalls as props
  const TUN = meta.tunnels, BR = (meta.rbr || []).map((r) => r[0]), LID = meta.hstep < 8, DEPTH = LID ? 0 : 5, dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 0;
  const dTun = (x, z) => polyDist(TUN, x, z), fp = footMask(buildings), w2t = (x) => (x + HALF) / TEX - 0.5;
  const CV = (meta.bridges || []).map((B) => B.tun), TUC = TUN.filter((t, k) => !CV.includes(k)), TCV = TUN.filter((t, k) => CV.includes(k)); // tunnels turned into functional bridges (bridgeWorld): no sinking, no portals; the road runs through at grade
  const rE = new Float32Array(HN * HN).fill(99), rY = new Float32Array(HN * HN), rM = new Uint8Array(HN * HN); // nearest road: distance past its asphalt edge, bed level, 1 = minor
  for (const [n, w10, cls = 0] of meta.roads) {
    let pts = []; for (let i = 0; i < n; i++, o += 4) pts.push([dv.getInt16(o, true) / 8, dv.getInt16(o + 2, true) / 8]);
    pts = polish(pts, 3); const minor = cls >= 4; mapRoads.push({ pts: Float32Array.from(pts.flat()), hw: w10 / 20, cls }); const m = pts.length, hw = w10 / 20, hs = new Float32Array(m), y = new Float32Array(m), dk = new Float32Array(m), dk2 = new Float32Array(m), dkc = new Float32Array(m), cov = new Uint8Array(m), sd = new Float32Array(m);
    for (let i = 0; i < m; i++) { hs[i] = bilin(H0, pts[i][0], pts[i][1]); dk2[i] = cls ? 999 : dTun(pts[i][0], pts[i][1]); dkc[i] = cls || !TUC.length ? 999 : polyDist(TUC, pts[i][0], pts[i][1]); if (i) sd[i] = sd[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
    for (let i = 0; i < m; i++) {
      // lidar terrain already has the road at its real level and the earth on top of the tunnel: keep the bump out of the road profile and do not sink anything
      let s = 0, c = 0; for (let k = Math.max(0, i - 8); k <= Math.min(m - 1, i + 8); k++) if (!LID || dk2[k] >= 8) { s += hs[k]; c++; }
      const dt = dkc[i]; dk[i] = c ? s / c : hs[i]; y[i] = dk[i] - DEPTH * (1 - smooth(8, 95, dt)); cov[i] = dt < 1 ? 2 : dt < 8 ? 1 : 0; // 1 = recess behind the portal face
    }
    if (LID) { for (let i = 1; i < m; i++) if (cov[i]) y[i] = y[i - 1]; for (let i = 0; i < m; i++) if (cov[i]) dk[i] = Math.max(hs[i], y[i] + 3.5); }
    if (TCV.length && !cls) for (let i = 0; i < m;) { if (dk2[i] >= 8 || polyDist(TCV, pts[i][0], pts[i][1]) >= 8) { i++; continue; } // under a functional bridge: straight across between the levels outside it (the DTM holds a fill there)
      let j = i; while (j < m && dk2[j] < 8) j++; const a = Math.max(0, i - 1), c = Math.min(m - 1, j); for (let k = a + 1; k < c; k++) y[k] = lerp(y[a], y[c], (sd[k] - sd[a]) / (sd[c] - sd[a] || 1)); i = j + 1; }
    if (BR.length) for (let i = 0; i < m;) { if (polyDist(BR, pts[i][0], pts[i][1]) > 2.5) { i++; continue; } // tagged bridge: laid straight across at grade for now (the lidar ground there is the valley floor)
      let j = i; while (j < m && polyDist(BR, pts[j][0], pts[j][1]) <= 2.5) j++; const a = Math.max(0, i - 2), c = Math.min(m - 1, j + 1);
      for (let k = a + 1; k < c; k++) y[k] = lerp(y[a], y[c], (sd[k] - sd[a]) / (sd[c] - sd[a] || 1)); i = j + 1; }
    if (cls) { // junctions: where this road runs inside the asphalt of one laid before, take that level and blend it in over 30 m, so the two meet without a step
      const dl = new Float32Array(m).fill(NaN); let any = false;
      for (let i = 0; i < m; i++) { const k = clamp(Math.round(w2t(pts[i][1])), 0, HN - 1) * HN + clamp(Math.round(w2t(pts[i][0])), 0, HN - 1); if (rE[k] < -0.3 && rY[k] >= 0) { dl[i] = rY[k] - y[i]; any = true; } }
      if (any) { const f = new Float32Array(m), g = new Float32Array(m).fill(1e9); let ld = 0, ls = -1e9;
        for (let i = 0; i < m; i++) { if (dl[i] === dl[i]) { ld = dl[i]; ls = sd[i]; } const w = 1 - (sd[i] - ls) / 30; if (w > 0) { f[i] = ld * w; g[i] = sd[i] - ls; } }
        ls = 1e9; for (let i = m - 1; i >= 0; i--) { if (dl[i] === dl[i]) { ld = dl[i]; ls = sd[i]; } const w = 1 - (ls - sd[i]) / 30; if (w > 0 && ls - sd[i] < g[i]) f[i] = ld * w; }
        for (let i = 0; i < m; i++) y[i] += f[i]; } }
    if (cls <= 3 || (cls <= 5 && sd[m - 1] > 250)) for (let q0 = 0; q0 < m;) { let q1 = q0; while (q1 < m && dk2[q1] > 100 && Math.abs(pts[q1][0]) < PLAY - 50 && Math.abs(pts[q1][1]) < PLAY - 50) q1++; // runs of road well away from the tunnels, inside the playable area (enemies followed roads out to the edge)
      if (q1 - q0 >= 20) { const f = new Float32Array((q1 - q0) * 2); for (let q = q0; q < q1; q++) { f[(q - q0) * 2] = pts[q][0]; f[(q - q0) * 2 + 1] = pts[q][1]; } roadNet.push({ pts: f, n: q1 - q0, hw, cls }); }
      q0 = q1 + 1; }
    for (let q = 0; q < m; q++) {
      const cx = pts[q][0], cz = pts[q][1], R = hw + (minor ? 6 : 18), i0 = Math.max(0, Math.floor(w2t(cx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + R))), j0 = Math.max(0, Math.floor(w2t(cz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + R)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * HN + i, e = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz) - hw;
        if (e < rE[k]) { rE[k] = e; rY[k] = cov[q] === 2 ? -dk[q] : y[q]; rM[k] = minor ? 1 : 0; } // negative: level deck on top of the tunnel
      }
      if (q && !cov[q] !== !cov[q - 1]) { const a = cov[q] ? q : q - 1, c = cov[q] ? q - 1 : q, dx = pts[a][0] - pts[c][0], dz = pts[a][1] - pts[c][1], l = Math.hypot(dx, dz); portals.push({ x: pts[a][0], z: pts[a][1], y: y[a], hw, dx: dx / l, dz: dz / l, top0: dk[a], top1: dk[clamp(a + (a - c) * 5, 0, m - 1)] }); }
    }
  }
  for (let k = 0; k < HN * HN; k++) if (rY[k] < 0) { if (rE[k] < 17 && mat[k * 4] < 9) H[k] = lerp(-rY[k], H[k], clamp((rE[k] - 9) / 8, 0, 1)); }
  else if (rE[k] < 10 && mat[k * 4] < 9) {
    const e = rE[k], yT = rY[k];
    if (!fp[k]) H[k] = rM[k] ? lerp(yT, H[k], clamp((e - 0.3) / 2.5, 0, 1)) : lerp(yT, H[k], clamp((e - 1) / Math.max(3, 1.6 * Math.abs(H[k] - yT)), 0, 1)); // minor: the asphalt and a short shoulder (the lidar has the real cutting); major: straight cut slope, gentle enough to stay snow-covered
    mat[k * 4 + 1] = Math.max(mat[k * 4 + 1], gOfR(e));
  }
}

// ---- Holmenkollbanen (tools/geo/rail.py; module level like the roads) ----
// blob 'rail': per track n points (int16 x*8, int16 z*8, uint16 (y - hmin)*50 ballast top, uint8 flags 1 = bridge span, pad); meta.rail: see rail.py.
// Levels a 2.4 m strip either side of each track 0.3 m under the ballast top (the terrain shader adds up to ~0.4 m of soft snow near the camera) and the ground under the platforms to below their deck.
// Returns the decoded line for props.js (bed, rails, stations, train), the minimap and the tree mask; lamps = platform lamps, spill = their light on the snow.
function railWorld(meta, b, H, mat, buildings) {
  const M = meta.rail, dv = new DataView(b.buffer, b.byteOffset, b.byteLength), w2t = (x) => (x + HALF) / TEX - 0.5; let o = 0;
  const tr = M.tr.map((n) => { const x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n), f = new Uint8Array(n), s = new Float32Array(n);
    for (let i = 0; i < n; i++, o += 8) { x[i] = dv.getInt16(o, true) / 8; z[i] = dv.getInt16(o + 2, true) / 8; y[i] = meta.hmin + dv.getUint16(o + 4, true) / 50; f[i] = dv.getUint8(o + 6); if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
    return { n, x, z, y, f, s }; });
  const cg = new Int32Array(256 * 256).fill(-1), cell = (x, z) => clamp(((z + HALF) / 16) | 0, 0, 255) * 256 + clamp(((x + HALF) / 16) | 0, 0, 255); // 16 m cells the line passes through
  tr.forEach((t, ti) => { for (let q = 0; q < t.n; q++) cg[cell(t.x[q], t.z[q])] = ti; });
  for (const B of buildings) { const r = Math.hypot(B.w, B.d) / 2 + 2.4, cs = Math.cos(B.yaw), sn = Math.sin(B.yaw); // OSM outlines reaching within 2.2 m of a track (station shelters, roofs over a platform end): the station props replace them
    let hit = false; for (let dz = -r; dz <= r + 15.9 && !hit; dz += 16) for (let dx = -r; dx <= r + 15.9 && !hit; dx += 16) if (cg[cell(B.x + Math.min(dx, r), B.z + Math.min(dz, r))] >= 0) hit = true;
    if (hit) for (const t of tr) for (let q = 0; q < t.n; q++) { const dx = t.x[q] - B.x, dz = t.z[q] - B.z; if (Math.abs(dx) < r && Math.abs(dz) < r && Math.abs(dx * cs - dz * sn) < B.w / 2 + 2.2 && Math.abs(dx * sn + dz * cs) < B.d / 2 + 2.2) B.gone = 2; } }
  const mask = new Uint8Array(HN * HN), rE = new Uint8Array(HN * HN), rY = new Float32Array(HN * HN), touched = []; // rE: 1 + distance * 50 (0 = not near the line), only the touched texels are visited
  for (const t of tr) for (let q = 0; q < t.n; q++) {
    let nb = 0; for (let k = Math.max(0, q - 2); k <= Math.min(t.n - 1, q + 2); k++) nb |= t.f[k]; // bridge spans and their abutments keep the lidar ground (a road runs under them)
    const cx = t.x[q], cz = t.z[q], R = 5, i0 = Math.max(0, Math.floor(w2t(cx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + R))), j0 = Math.max(0, Math.floor(w2t(cz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + R)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * HN + i, e = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz);
      if (e < 3.6) mask[k] = 1; if (!nb && e < 5 && (!rE[k] || 1 + e * 50 < rE[k])) { if (!rE[k]) touched.push(k); rE[k] = 1 + e * 50; rY[k] = t.y[q]; } }
  }
  for (const k of touched) if (mat[k * 4] < 9) { const yT = rY[k] - 0.3; H[k] = lerp(yT, H[k], clamp(((rE[k] - 1) / 50 - 2.8) / Math.max(2, 1.4 * Math.abs(H[k] - yT)), 0, 1)); }
  const st = [], lamps = [], spill = [];
  for (const [name, cx, cz, P] of M.st) {
    const S = { name, x: cx, z: cz, p: [] };
    for (const [x, z, yaw, hl, hw, top, edge] of P) {
      const ax = Math.sin(yaw), az = Math.cos(yaw), bx = Math.cos(yaw), bz = -Math.sin(yaw), L = hl + 3, R = Math.hypot(L, hw) + 2;
      for (let j = Math.max(0, Math.floor(w2t(z - R))); j <= Math.min(HN - 1, Math.ceil(w2t(z + R))); j++) for (let i = Math.max(0, Math.floor(w2t(x - R))); i <= Math.min(HN - 1, Math.ceil(w2t(x + R))); i++) {
        const dx = (i + 0.5) * TEX - HALF - x, dz = (j + 0.5) * TEX - HALF - z, u = Math.abs(dx * ax + dz * az), v = Math.abs(dx * bx + dz * bz), k = j * HN + i;
        if (u < L + 1.5 && v < hw + 1.5) mask[k] = 1; if (u < L && v < hw) H[k] = Math.min(H[k], top - 0.3); }
      const Q = { x, z, yaw, hl, hw, top, edge, lamps: [], sh: [] }, ou = -edge * (hw - 0.45);
      for (let i = buildings.length - 1; i >= 0; i--) { const B = buildings[i], dx = B.x - x, dz = B.z - z, u = dx * ax + dz * az; const v = Math.abs(dx * bx + dz * bz); if ((Math.abs(u) < hl + 2 && v < hw + 2) || (B.gone === 2 && Math.abs(u) < hl + 12 && v < 10)) { B.gone = B.gone || 1; Q.sh.push([u, Math.max(B.w, B.d)]); } } // OSM shelters on the platform: rebuilt there by the station props
      for (let u = -hl + 3; u <= hl - 2.9; u += Math.max(10, (2 * hl - 6) / Math.max(1, Math.round((2 * hl - 6) / 13)))) {
        const lx = x + ax * u + bx * ou, lz = z + az * u + bz * ou; Q.lamps.push(u); lamps.push({ x: lx, z: lz, y: top }); spill.push({ x: lx + bx * edge * 1.1, z: lz + bz * edge * 1.1, yaw: 0, k: 0.32, off: 0 }); }
      S.p.push(Q);
    }
    st.push(S);
  }
  return { tr, st, bs: M.bs, cross: M.x, train: M.train, mask, lamps, spill };
}
function railMask(R, bm, BR) { if (R) for (let k = 0; k < HN * HN; k++) if (R.mask[k]) bm[k] = 1; // no tree trunks on the bed or the platforms, nor on a functional bridge and its ramps
  for (const B of BR) brTex(B, 11, 8, (k) => { bm[k] = 1; }); }

// ---- functional bridges (tools/geo/bridges.py, src/bridges.js; module level like the roads) ----
// The heightfield stays the lower level: the road runs through at its fitted grade in a hard trench under the deck; outside the trench the
// ground under the slab sits just below it (hidden behind the abutments and portal faces); beyond the slab ends the earth is ramped to the
// deck plane over 10 m, so a vehicle arrives on the deck at deck height. Returns the bridge records (W.brg).
function brTex(B, pu, pv, f) { // calls f(k, lu, lv) for every texel within the slab grown by pu along u and pv along v
  const ux = B.u[0], uz = B.u[1], R = Math.hypot(B.hl + pu, B.hw + pv), w2t = (x) => (x + HALF) / TEX - 0.5;
  for (let j = Math.max(0, Math.floor(w2t(B.c[1] - R))); j <= Math.min(HN - 1, Math.ceil(w2t(B.c[1] + R))); j++) for (let i = Math.max(0, Math.floor(w2t(B.c[0] - R))); i <= Math.min(HN - 1, Math.ceil(w2t(B.c[0] + R))); i++) {
    const dx = (i + 0.5) * TEX - HALF - B.c[0], dz = (j + 0.5) * TEX - HALF - B.c[1], lu = dx * ux + dz * uz, lv = dz * ux - dx * uz;
    if (Math.abs(lu) <= B.hl + pu && Math.abs(lv) <= B.hw + pv) f(j * HN + i, lu, lv); }
}
function bridgeWorld(meta, H) {
  const L = meta.bridges || [];
  for (const B of L) {
    const [ta, tb] = B.tr, hl = B.hl, hw = B.hw, top = (lu, lv) => B.y0 + B.gu * lu + B.gv * lv, bot = (lu, lv) => top(lu, lv) - B.th - 0.3, ux = B.u[0], uz = B.u[1];
    brTex(B, 10, 8, (k, lu, lv) => { const al = Math.abs(lu), av = Math.abs(lv);
      const wt = av < hw - 0.6 ? 3.2 : 0.2; // inside the faces the road level runs on 3 m behind the abutments, so the step up to the earth stays hidden under the slab
      if (lu >= ta - wt && lu <= tb + wt && al <= hl - 0.5 && av <= hw + 1.5) H[k] = B.r0 + B.rg * lv; // the trench: the road at grade
      else if (al <= hl - 3 && av <= hw - 1.2) H[k] = bot(lu, lv); // earth under the slab, behind the abutments
      else if (al <= hl && av <= hw - 1.2) H[k] = top(lu, lv); // the last 3 m under the slab ends at the deck plane: no dip between the ramp and the deck under a hull corner
      else if (al <= hl && av <= hw + 1.2) { const sv = Math.sign(lv) * (hw + 4.5); H[k] = Math.min(bilin(H, B.c[0] + ux * lu - uz * sv, B.c[1] + uz * lu + ux * sv), bot(lu, lv)); } // under the portal faces: the ground in front of them
      else if (al > hl) H[k] = lerp(H[k], top(lu, lv), (1 - smooth(hl + 3, hl + 10, al)) * (1 - smooth(hw, hw + 8, av))); }); // ramps: the earth meets the deck at its height (fully for 3 m, so the hull's corners meet no step)
  }
  return L;
}

async function inflate(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
  return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}

export async function genWorld(tick, Q, startAt) {
  const raw = await inflate(DATA), jl = new DataView(raw.buffer).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + jl)));
  const blob = (n) => raw.subarray(4 + jl + meta.blobs[n][0], 4 + jl + meta.blobs[n][0] + meta.blobs[n][1]);
  const H = new Float32Array(HN * HN);
  const mat = new Uint8Array(HN * HN * 4); // R lake, G creek, B bog, A alpine
  const W = { H, WS, HN };
  const w2t = (x) => (x + HALF) / TEX - 0.5;
  const heightAt = (x, z) => {
    let fx = clamp(w2t(x), 0, HN - 1.001), fz = clamp(w2t(z), 0, HN - 1.001);
    const ix = fx | 0, iz = fz | 0; fx -= ix; fz -= iz; const i = iz * HN + ix;
    return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fz) + (H[i + HN] * (1 - fx) + H[i + HN + 1] * fx) * fz;
  };
  W.heightAt = heightAt;

  // ---- real elevation: 8 m grid (decimetres, 2-D predicted) -> bicubic 2 m heightmap + procedural detail ----
  const GN = meta.hn, G = new Float32Array(GN * GN);
  { const b = blob('hgt'), q = new Int32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const k = j * GN + i, p = j && i ? q[k - 1] + q[k - GN] - q[k - GN - 1] : i ? q[k - 1] : j ? q[k - GN] : 0;
      q[k] = (p + b[k] + (b[GN * GN + k] << 8)) & 0xFFFF; G[k] = meta.hmin + q[k] * 0.1;
    } }
  const cr = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  const waterM = blob('water'), wetM = blob('wet'), covM = blob('cov'), CN = meta.cn, chM = blob('canh'), CHN = meta.chn;
  const col = new Float32Array(4);
  const NZ = meta.hstep < 8 ? 0.2 : 1; // lidar terrain carries its own detail: only a little noise on top
  for (let j = 0; j < HN; j++) {
    const z = (j + 0.5) * TEX - HALF, gz = clamp((z + HALF) / meta.hstep, 1, GN - 2.001), jz = gz | 0, tz = gz - jz;
    for (let i = 0; i < HN; i++) {
      const x = (i + 0.5) * TEX - HALF, gx = clamp((x + HALF) / meta.hstep, 1, GN - 2.001), ix = gx | 0, tx = gx - ix, k = j * HN + i;
      for (let r = 0; r < 4; r++) { const o = clamp(jz - 1 + r, 0, GN - 1) * GN + ix; col[r] = cr(G[o - 1], G[o], G[o + 1], G[Math.min(o + 2, GN * GN - 1)], tx); }
      H[k] = cr(col[0], col[1], col[2], col[3], tz) + NZ * (1.6 * fbm(x * 0.011, z * 0.011, 3) + 0.45 * fbm(x * 0.06 + 5, z * 0.06, 2));
      mat[k * 4] = waterM[k]; mat[k * 4 + 2] = wetM[k] * 0.9;
    }
    if ((j & 255) === 255) await tick('Shaping terrain', j / HN * 0.4);
  }

  // ---- detail insets: lidar heights at every 2 m texel (the ski arena), feathered into the base over 16 m ----
  for (let n = 0; n < (meta.insets || []).length; n++) {
    const [i0, j0, w, h] = meta.insets[n], b = blob('ins' + n), q = new Int32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, p = j && i ? q[k - 1] + q[k - w] - q[k - w - 1] : i ? q[k - 1] : j ? q[k - w] : 0;
      q[k] = (p + b[k] + (b[w * h + k] << 8)) & 0xFFFF;
      const f = smooth(0, 8, Math.min(i, j, w - 1 - i, h - 1 - j)), o = (j0 + j) * HN + i0 + i;
      H[o] = lerp(H[o], meta.hmin + q[k] * 0.1, f);
    }
  }

  edgeBlur(H, 1, 0, 160); // the terrain beyond the map repeats the edge texels: smooth the outer 160 m along the edge (no streaks to the horizon)

  // ---- lakes: connected water -> flat ice at the local water level ----
  const lakes = [];
  { const lab = new Int32Array(HN * HN), st = new Int32Array(HN * HN);
    for (let s = 0; s < HN * HN; s++) {
      if (waterM[s] < 128 || lab[s]) continue;
      const id = lakes.length + 1; let n = 0, sp = 0, sh = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0; st[sp++] = s; lab[s] = id;
      while (sp) { const k = st[--sp], i = k % HN, j = (k / HN) | 0; n++; sh += H[k]; sx += i; sz += j; sxx += i * i; szz += j * j; sxz += i * j;
        if (i > 0 && !lab[k - 1] && waterM[k - 1] >= 128) { lab[k - 1] = id; st[sp++] = k - 1; } if (i < HN - 1 && !lab[k + 1] && waterM[k + 1] >= 128) { lab[k + 1] = id; st[sp++] = k + 1; }
        if (j > 0 && !lab[k - HN] && waterM[k - HN] >= 128) { lab[k - HN] = id; st[sp++] = k - HN; } if (j < HN - 1 && !lab[k + HN] && waterM[k + HN] >= 128) { lab[k + HN] = id; st[sp++] = k + HN; } }
      const mx = sx / n, mz = sz / n, a = sxx / n - mx * mx, c = szz / n - mz * mz, b = sxz / n - mx * mz, th = 0.5 * Math.atan2(2 * b, a - c);
      lakes.push({ x: (mx + 0.5) * TEX - HALF, z: (mz + 0.5) * TEX - HALF, lv: sh / n - 0.25, area: n * TEX * TEX, ax: Math.cos(th), az: Math.sin(th), len: 4 * TEX * Math.sqrt(Math.max(a, c)) });
    }
    st.fill(0);
    for (let it = 0; it < 4; it++) { // grow labels over the antialiased fringe + shore
      for (let j = 1; j < HN - 1; j++) for (let i = 1; i < HN - 1; i++) { const k = j * HN + i; if (!lab[k]) { const v = lab[k - 1] || lab[k + 1] || lab[k - HN] || lab[k + HN]; if (v > 0) st[k] = v; else st[k] = 0; } else st[k] = 0; }
      for (let k = 0; k < HN * HN; k++) if (st[k]) lab[k] = st[k]; }
    for (let k = 0; k < HN * HN; k++) if (lab[k]) { const lv = lakes[lab[k] - 1].lv, c = smooth(0, 220, waterM[k]); H[k] = lerp(Math.max(H[k], lv + 0.25), lv, c); }
  }
  W.lakeAt = (x, z) => waterM[clamp(Math.round(w2t(z)), 0, HN - 1) * HN + clamp(Math.round(w2t(x)), 0, HN - 1)] / 255;
  // lidar forest (tools/geo/canopy.py): tree cover per 4 m cell, the same blurred over ~20 m (forest vs garden), canopy height (p90, 16 m cells)
  const cIdx = (x, z) => clamp(((z + HALF) / WS * CN) | 0, 0, CN - 1) * CN + clamp(((x + HALF) / WS * CN) | 0, 0, CN - 1);
  const cover = (x, z) => covM[cIdx(x, z)] / 255, covA = new Float32Array(CN * CN);
  { const t = new Float32Array(CN * CN);
    for (let j = 0; j < CN; j++) { let s = 0; for (let i = -2; i < CN + 2; i++) { if (i + 2 < CN) s += covM[j * CN + i + 2]; if (i - 3 >= 0) s -= covM[j * CN + i - 3]; if (i >= 0 && i < CN) t[j * CN + i] = s; } }
    for (let i = 0; i < CN; i++) { let s = 0; for (let j = -2; j < CN + 2; j++) { if (j + 2 < CN) s += t[(j + 2) * CN + i]; if (j - 3 >= 0) s -= t[(j - 3) * CN + i]; if (j >= 0 && j < CN) covA[j * CN + i] = s / (25 * 255); } } }
  const canH = (x, z) => { // bilinear over the cells that have canopy (0 = none), in metres; 0 where no cell has any
    const fx = clamp((x + HALF) / WS * CHN - 0.5, 0, CHN - 1.001), fz = clamp((z + HALF) / WS * CHN - 0.5, 0, CHN - 1.001), ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, k = iz * CHN + ix;
    const a = chM[k], b = chM[k + 1], c = chM[k + CHN], d = chM[k + CHN + 1], wa = a ? (1 - u) * (1 - v) : 0, wb = b ? u * (1 - v) : 0, wc = c ? (1 - u) * v : 0, wd = d ? u * v : 0, ws = wa + wb + wc + wd;
    return ws > 0 ? (a * wa + b * wb + c * wc + d * wd) / ws * 0.5 : 0; };

  const flatten = (cx, cz, r0, r1, y, k_ = 1) => {
    const i0 = Math.max(0, Math.floor(w2t(cx - r1))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + r1))), j0 = Math.max(0, Math.floor(w2t(cz - r1))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + r1)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz), k = j * HN + i;
      if (mat[k * 4] < 128) H[k] = lerp(H[k], y, k_ * (1 - smooth(r0, r1, d)));
    }
  };
  const H0 = H.slice(); // the ground before the lodge and house pads: road profiles follow this, so a pad beside a street puts no bump in it
  // ---- Frognerseteren (the lit timber lodge) ----
  const cabin = { x: LM.frogner.x, z: LM.frogner.z, yaw: LM.frogner.yaw, col: [0.13, 0.085, 0.05] };
  cabin.y = heightAt(cabin.x, cabin.z) + 0.3;
  flatten(cabin.x, cabin.z, 30, 55, cabin.y);

  // ---- buildings: rotated rectangles on levelled pads ----
  const buildings = [];
  { const b = blob('bld'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), bh = meta.blobs.bldh ? blob('bldh') : null; // bldh (tools/geo/buildings.py): lidar eave 0.2 m, rise 0.1 m, flags 1 valid 2 flat 4 ridge along d
    for (let i = 0; i < meta.nb; i++) {
      const o = i * 12, B = { x: dv.getInt16(o, true) / 8, z: dv.getInt16(o + 2, true) / 8, w: dv.getUint16(o + 4, true) / 8, d: dv.getUint16(o + 6, true) / 8, yaw: dv.getInt16(o + 8, true) / 1e4, kind: b[o + 10], lv: b[o + 11] / 10 };
      if (bh && bh[i * 3 + 2] & 1) B.h = { eave: bh[i * 3] * 0.2, rise: bh[i * 3 + 1] * 0.1, flat: (bh[i * 3 + 2] & 2) > 0, alt: (bh[i * 3 + 2] & 4) > 0 };
      if (Math.hypot(B.x - cabin.x, B.z - cabin.z) < 50 || Math.hypot(B.x - LM.chapel.x, B.z - LM.chapel.z) < 22 || W.lakeAt(B.x, B.z) > 0.3) continue;
      if (B.w * B.d > 2600) continue; // arena stands, hotel complexes: not box-shaped
      if (bh && bh[i * 3 + 2] & 8) continue; // an outline with no roof in the lidar (stands, ski-jump parts)
      if (inJump(B.x, B.z, 205, 0) || inArena(B.x, B.z, 0)) continue; // inside a ski jump or an arena stand: those are props
      B.y = heightAt(B.x, B.z); const r = Math.hypot(B.w, B.d) / 2;
      flatten(B.x, B.z, r * 0.7, r * 0.7 + 12, B.y, 0.75); buildings.push(B);
    } }
  await tick('Laying trails', 0.5);

  // ---- nordic trails from the map ----
  function polish(pts, win) { // resample 2 m + smooth
    let rs = [pts[0]], acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let ax = pts[i - 1][0], az = pts[i - 1][1]; const bx = pts[i][0], bz = pts[i][1]; let l = Math.hypot(bx - ax, bz - az);
      while (acc + l >= 2) { const t = (2 - acc) / l; ax = lerp(ax, bx, t); az = lerp(az, bz, t); rs.push([ax, az]); l = Math.hypot(bx - ax, bz - az); acc = 0; }
      acc += l;
    }
    rs.push(pts[pts.length - 1]);
    for (let it = 0; it < 3; it++) {
      const o = rs.map((p) => [p[0], p[1]]), n = rs.length;
      for (let i = 1; i < n - 1; i++) { const w = Math.min(win, i, n - 1 - i); let sx = 0, sz = 0; for (let k = -w; k <= w; k++) { sx += o[i + k][0]; sz += o[i + k][1]; } rs[i] = [sx / (2 * w + 1), sz / (2 * w + 1)]; }
    }
    return rs;
  }
  const trails = [];
  { const b = blob('trails'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 0;
    for (const [n, lit, name] of meta.trails) {
      let pts = []; for (let i = 0; i < n; i++, o += 4) pts.push([dv.getInt16(o, true) / 8, dv.getInt16(o + 2, true) / 8]);
      pts = polish(pts, 3); if (pts.length < 12) continue;
      const f = new Float32Array(pts.length * 2); pts.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
      trails.push({ name, lit: !!lit, pts: f, n: pts.length });
    } }
  await tick('Carving trails', 0.58);

  // ---- carve trails into the heightmap ----
  const tD = new Float32Array(HN * HN).fill(99), tT = new Float32Array(HN * HN);
  for (const t of trails) {
    const n = t.n, hs = new Float32Array(n);
    for (let i = 0; i < n; i++) hs[i] = heightAt(t.pts[i * 2], t.pts[i * 2 + 1]);
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 6); k <= Math.min(n - 1, i + 6); k++) { s += hs[k]; c++; } sm[i] = s / c; }
    t.y = sm;
    for (let q = 0; q < n; q++) {
      const cx = t.pts[q * 2], cz = t.pts[q * 2 + 1], R = 12, i0 = Math.max(0, Math.floor(w2t(cx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + R))), j0 = Math.max(0, Math.floor(w2t(cz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + R)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * HN + i, d = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz);
        if (d < tD[k]) { tD[k] = d; tT[k] = sm[q]; }
      }
    }
  }
  for (let k = 0; k < HN * HN; k++) if (tD[k] < 12 && mat[k * 4] < 128) H[k] = lerp(H[k], tT[k], 1 - smooth(3.4, 10, tD[k]));

  // ---- plowed roads + parking lots: mat.G holds the distance to the asphalt edge (0.667 = edge, 6 m ramp) ----
  const portals = [], parks = [], roadNet = [], mapRoads = []; // roadNet: road centre lines for enemy routing, cut where they dip towards a tunnel
  const gOf = (e) => 255 * clamp(1 - (e + 2) / 6, 0, 1);
  { // parking: least-squares plane through the lot, at most a gentle slope
    const b = blob('park'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 0;
    for (const n of meta.park) {
      const px = new Float32Array(n), pz = new Float32Array(n); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < n; i++, o += 4) { const x = px[i] = dv.getInt16(o, true) / 8, z = pz[i] = dv.getInt16(o + 2, true) / 8; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const i0 = Math.max(1, Math.floor(w2t(x0 - 6))), i1 = Math.min(HN - 2, Math.ceil(w2t(x1 + 6))), j0 = Math.max(1, Math.floor(w2t(z0 - 6))), j1 = Math.min(HN - 2, Math.ceil(w2t(z1 + 6)));
      const nw = i1 - i0 + 1, E = new Float32Array(nw * (j1 - j0 + 1)), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let s1 = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0, wet = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * TEX - HALF, z = (j + 0.5) * TEX - HALF, k = j * HN + i; let d = 1e9, ins = false;
        for (let a = 0, c = n - 1; a < n; c = a++) {
          const ax = px[c], az = pz[c], vx = px[a] - ax, vz = pz[a] - az, u = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz + 1e-9), 0, 1);
          d = Math.min(d, Math.hypot(x - ax - vx * u, z - az - vz * u));
          if ((az > z) !== (pz[a] > z) && x < ax + vx * (z - az) / vz) ins = !ins;
        }
        E[(j - j0) * nw + i - i0] = ins ? -d : d;
        if (ins) { const X = x - cx, Z = z - cz, y = H[k]; s1++; sx += X; sz += Z; sy += y; sxx += X * X; szz += Z * Z; sxz += X * Z; sxy += X * y; szy += Z * y; if (mat[k * 4] > 8) wet++; }
      }
      if (s1 < 12 || wet > s1 * 0.2) continue;
      const mx = sx / s1, mz = sz / s1, my = sy / s1, a = sxx - sx * mx, c = szz - sz * mz, bb = sxz - sx * mz, u = sxy - sx * my, v = szy - sz * my, det = a * c - bb * bb || 1;
      let gx = (u * c - v * bb) / det, gz = (v * a - u * bb) / det; const g = Math.hypot(gx, gz); if (g > 0.05) { gx *= 0.05 / g; gz *= 0.05 / g; }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * HN + i, e = E[(j - j0) * nw + i - i0]; if (e > 5 || mat[k * 4] > 8) continue;
        H[k] = lerp(my + gx * ((i + 0.5) * TEX - HALF - cx - mx) + gz * ((j + 0.5) * TEX - HALF - cz - mz), H[k], smooth(0, 5, e));
        mat[k * 4 + 1] = Math.max(mat[k * 4 + 1], Math.min(204, gOf(e))); // capped: the shader reads < 0.82 as 'lot'
      }
      parks.push({ px, pz, x: cx + mx, z: cz + mz, area: s1 * TEX * TEX });
    } }
  plowRoads(meta, blob('roads'), H, H0, mat, polish, buildings, portals, roadNet, mapRoads); // module level (genWorld is near the size where V8 stops optimising it)
  const roadAt = (x, z) => mat[(clamp(Math.round(w2t(z)), 0, HN - 1) * HN + clamp(Math.round(w2t(x)), 0, HN - 1)) * 4 + 1] / 255;
  const rail = W.rail = meta.rail ? railWorld(meta, blob('rail'), H, mat, buildings) : null; // Holmenkollbanen: bed levelling, stations (module level)
  W.brg = bridgeWorld(meta, H); // functional bridges: trench, earth under the slab, ramps to the deck (module level)
  await tick('Computing normals', 0.62);

  const kickers = []; // (the turbo-mode lake kickers were removed with the groomer)
  { let L = null; for (const l of lakes) if (Math.abs(l.x) < PLAY - 150 && Math.abs(l.z) < PLAY - 150 && (!L || l.area > L.area)) L = l; W.playLake = L; } // biggest lake in reach: open ground for the test scenes
  await tick('Computing normals', 0.64);

  // ---- normals ----
  const nrm = new Uint8Array(HN * HN * 4); // RG normal xz, B canopy, A lamp light
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const k = j * HN + i;
    const dx = (H[j * HN + Math.min(i + 1, HN - 1)] - H[j * HN + Math.max(i - 1, 0)]) / (2 * TEX), dz = (H[Math.min(j + 1, HN - 1) * HN + i] - H[Math.max(j - 1, 0) * HN + i]) / (2 * TEX);
    const l = 1 / Math.sqrt(dx * dx + dz * dz + 1);
    nrm[k * 4] = clamp((-dx * l * 0.5 + 0.5) * 255 + 0.5, 0, 255); nrm[k * 4 + 1] = clamp((-dz * l * 0.5 + 0.5) * 255 + 0.5, 0, 255);
  }
  await tick('Planting forest', 0.7);

  // ---- lamps along the lit trails ----
  const lamps = [];
  for (const t of trails) if (t.lit) {
    for (let i = 8; i < t.n - 6; i += 17) {
      const x = t.pts[i * 2], z = t.pts[i * 2 + 1], tx = t.pts[i * 2 + 2] - x, tz = t.pts[i * 2 + 3] - z, l = Math.hypot(tx, tz) || 1;
      const px = x - tz / l * 5.3, pz = z + tx / l * 5.3;
      if (Math.hypot(px - cabin.x, pz - cabin.z) < 15 || Math.abs(px) > PLAY + 200 || Math.abs(pz) > PLAY + 200 || W.lakeAt(px, pz) > 0.2 || roadAt(px, pz) > 0.3 || W.brg.some((B) => Math.abs((px - B.c[0]) * B.u[0] + (pz - B.c[1]) * B.u[1]) < B.hl + 11 && Math.abs((pz - B.c[1]) * B.u[0] - (px - B.c[0]) * B.u[1]) < B.hw + 6)) continue;
      lamps.push({ x: px, z: pz, y: heightAt(px, pz), yaw: Math.atan2(x - px, z - pz) });
    }
  }
  const spill = [[-6, 21.5, 0.45], [6, 21.5, 0.45], [20.5, -4, 0.4], [20.5, 6, 0.4], [-22, -2, 0.35], [-2, -14, 0.35], [6, -14, 0.35]].map((q) => ({ x: cabin.x + Math.cos(cabin.yaw) * q[0] + Math.sin(cabin.yaw) * q[1], z: cabin.z - Math.sin(cabin.yaw) * q[0] + Math.cos(cabin.yaw) * q[1], yaw: 0, k: q[2], off: 0 }));
  for (const L of lamps.concat(spill, rail ? rail.spill : [])) {
    const lx = L.x + Math.sin(L.yaw) * (L.k ? 0 : 1.6), lz = L.z + Math.cos(L.yaw) * (L.k ? 0 : 1.6), R = L.k ? 12 : 30, i0 = Math.max(0, Math.floor(w2t(lx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(lx + R))), j0 = Math.max(0, Math.floor(w2t(lz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(lz + R)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * HN + i, d2 = ((i + 0.5) * TEX - HALF - lx) ** 2 + ((j + 0.5) * TEX - HALF - lz) ** 2, h2 = 30.25;
      const v = L.k ? 255 * L.k * Math.exp(-d2 / 14) : 255 * 30 * 5.5 / Math.pow(d2 + h2, 1.5) * (1 - smooth(18, 30, Math.sqrt(d2)));
      nrm[k * 4 + 3] = Math.min(255, nrm[k * 4 + 3] + v);
    }
  }
  for (const M of LM.arena.mast) { // arena floodlights: a broad pool thrown towards the jump axis, wider and brighter for the tall masts
    const a = mastAim(M[0], M[1]), dx = a[0] - M[0], dz = a[1] - M[1], l = Math.hypot(dx, dz) || 1, o = Math.min(l, M[2] * 1.1), lx = M[0] + dx / l * o, lz = M[1] + dz / l * o, s2 = 2 * (M[2] * 1.1) ** 2, R = M[2] * 2.6;
    for (let j = Math.max(0, Math.floor(w2t(lz - R))); j <= Math.min(HN - 1, Math.ceil(w2t(lz + R))); j++) for (let i = Math.max(0, Math.floor(w2t(lx - R))); i <= Math.min(HN - 1, Math.ceil(w2t(lx + R))); i++) {
      const k = j * HN + i, d2 = ((i + 0.5) * TEX - HALF - lx) ** 2 + ((j + 0.5) * TEX - HALF - lz) ** 2; nrm[k * 4 + 3] = Math.min(255, nrm[k * 4 + 3] + 65 * Math.exp(-d2 / s2)); }
  }

  // ---- trees: jittered grid, kept with a chance from the lidar cover, heights from the lidar canopy height ----
  let cap = 520000, td = new Float32Array(cap * 8), tc = 0; const TK_IN = 0.5, TK_OUT = 0.72;
  const nearStart = new Uint32Array(NCN * NCN), nearCnt = new Uint16Array(NCN * NCN * 3), nearY = new Float32Array(NCN * NCN * 2);
  const farStart = new Uint32Array(FCN * FCN), farCnt = new Uint32Array(FCN * FCN), farY = new Float32Array(FCN * FCN * 2);
  const tmp = [new Float32Array(8 * 128), new Float32Array(8 * 128), new Float32Array(8 * 128)], tn = [0, 0, 0];
  const can = new Float32Array(HN * HN), bm = new Uint8Array(HN * HN); // bm: house footprints + 1.5 m, no trunks there
  for (const B of buildings) { const cs = Math.cos(B.yaw), sn = Math.sin(B.yaw), hw = B.w / 2 + 1.5, hd = B.d / 2 + 1.5, r = Math.hypot(hw, hd);
    for (let j = Math.max(0, Math.floor(w2t(B.z - r))); j <= Math.min(HN - 1, Math.ceil(w2t(B.z + r))); j++) for (let i = Math.max(0, Math.floor(w2t(B.x - r))); i <= Math.min(HN - 1, Math.ceil(w2t(B.x + r))); i++) {
      const dx = (i + 0.5) * TEX - HALF - B.x, dz = (j + 0.5) * TEX - HALF - B.z; if (Math.abs(dx * cs - dz * sn) < hw && Math.abs(dx * sn + dz * cs) < hd) bm[j * HN + i] = 1; } }
  railMask(rail, bm, W.brg);
  for (let fz = 0; fz < FCN; fz++) {
    for (let fx = 0; fx < FCN; fx++) {
      const fc = fz * FCN + fx; farStart[fc] = tc; let fy0 = 1e9, fy1 = -1e9;
      for (let q = 0; q < 16; q++) {
        const cx = fx * 4 + (q & 3), cz = fz * 4 + (q >> 2), nc = cz * NCN + cx, x0 = cx * NEAR - HALF, z0 = cz * NEAR - HALF;
        const inner = Math.abs(x0 + 16) < PLAY + 130 && Math.abs(z0 + 16) < PLAY + 130, g = inner ? 9 : 5, st = NEAR / g;
        tn[0] = tn[1] = tn[2] = 0; let y0 = 1e9, y1 = -1e9;
        for (let b = 0; b < g; b++) for (let a = 0; a < g; a++) {
          const hx = cx * 16 + a, hz = cz * 16 + b, r0 = hash2(hx, hz), x = x0 + (a + 0.15 + 0.7 * r0) * st, z = z0 + (b + 0.15 + 0.7 * hash2(hx + 7919, hz)) * st;
          const ti = clamp(Math.round(w2t(z)), 1, HN - 2) * HN + clamp(Math.round(w2t(x)), 1, HN - 2);
          const cv = cover(x, z);
          if (cv < 0.02 || bm[ti] || mat[ti * 4] > 8 || tD[ti] < 6.2 || mat[ti * 4 + 1] > 40) continue;
          const y = heightAt(x, z), slope = Math.hypot(H[ti + 1] - H[ti - 1], H[ti + HN] - H[ti - HN]) / (2 * TEX);
          if (slope > 1.1) continue;
          { const dx = x - cabin.x, dz = z - cabin.z, fr = Math.cos(cabin.yaw) * dz + Math.sin(cabin.yaw) * dx; if (Math.hypot(dx, dz) < (fr > 0 ? 75 : 24)) continue; } // open view in front of the lodge (south, over the city); the forest closes in behind
          if (inJump(x, z, 0, 4) || inArena(x, z, 3)) continue;
          const bog = mat[ti * 4 + 2] / 255, r1 = hash2(hx, hz + 104729), r2 = hash2(hx + 31337, hz + 17), r3 = hash2(hx - 999, hz + 5);
          let p = Math.min(1, cv * 1.35) * (inner ? TK_IN : TK_OUT) * smooth(6.2, 9, tD[ti]); // planting chance follows the measured cover (full from 75 %: the slim crowns leave gaps)
          const hc = canH(x, z) || 9, hf = 0.6 + 0.45 * Math.sqrt(r2); // p90 of the cell = its tallest trees; the rest stand lower
          let sp = 0, ht = 0, wd = 1;
          if (bog > 0.5) { p *= 0.6; sp = 1; ht = clamp(hc * hf * 0.8, 2, 12); wd = 1.4; }
          else {
            const bf = fbm(x * 0.008 + 90, z * 0.008 - 20, 2), pf = fbm(x * 0.005 - 30, z * 0.005 + 70, 2), gard = 1 - smooth(0.15, 0.5, covA[cIdx(x, z)]);
            const pb = 0.05 + smooth(0.12, 0.3, bf) * 0.6 + bog * 0.5 + gard * 0.35, pp = 0.03 + smooth(0.2, 0.36, pf) * 0.14 + bog * 0.4 + smooth(0.45, 0.9, slope) * 0.3;
            if (r3 < pb) { sp = 2; ht = clamp(hc * hf, 4, 20); wd = 0.9 + 0.3 * r1; }
            else if (r3 < pb + pp) { sp = 1; ht = clamp(hc * hf, 6, 28); wd = 0.9 + 0.3 * r1; }
            else { sp = 0; ht = clamp(hc * hf, 3.5, 32); wd = 0.85 + 0.35 * r1; }
          }
          if (r1 > p * Q.trees || tn[sp] >= 127) continue;
          if (!inner) { ht *= 1.1; wd *= 1.3; }
          if (mat[ti * 4 + 1] > 0 && 4 - mat[ti * 4 + 1] / 42.5 < 0.5 + 0.16 * ht * wd) continue; // the crown must not overhang a road or lot (G ramp -> metres past the asphalt edge)
          const o = tn[sp]++ * 8, T = tmp[sp];
          T[o] = x; T[o + 1] = y - 0.15; T[o + 2] = z; T[o + 3] = ht; T[o + 4] = r0 * 6.283; T[o + 5] = sp; T[o + 6] = r2 * 0.999 + ((hx * 7 + hz * 13) & 7); T[o + 7] = wd;
          if (y < y0) y0 = y; if (y + ht > y1) y1 = y + ht;
          const cr2 = ht * 0.16 * (sp === 0 ? 1 : 0.8); for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) can[ti + v * HN + u] += cr2 * cr2 * (u || v ? 0.5 : 1) * (inner ? 0.085 : 0.2);
        }
        nearStart[nc] = tc;
        for (let s = 0; s < 3; s++) { const n = Math.min(tn[s], cap - tc); nearCnt[nc * 3 + s] = n; td.set(tmp[s].subarray(0, n * 8), tc * 8); tc += n; }
        nearY[nc * 2] = y0; nearY[nc * 2 + 1] = y1; if (y0 < fy0) fy0 = y0; if (y1 > fy1) fy1 = y1;
      }
      farCnt[fc] = tc - farStart[fc]; farY[fc * 2] = fy0; farY[fc * 2 + 1] = fy1;
    }
    if ((fz & 7) === 7) await tick('Planting forest', 0.7 + 0.24 * fz / FCN);
  }
  // canopy density -> blurred into nrm.B
  { const t2 = new Float32Array(HN * HN);
    for (let j = 1; j < HN - 1; j++) for (let i = 1; i < HN - 1; i++) { const k = j * HN + i; t2[k] = (can[k] * 2 + can[k - 1] + can[k + 1] + can[k - HN] + can[k + HN]) / 6; }
    for (let j = 1; j < HN - 1; j++) for (let i = 1; i < HN - 1; i++) { const k = j * HN + i; nrm[k * 4 + 2] = clamp((t2[k] * 2 + t2[k - 1] + t2[k + 1] + t2[k - HN] + t2[k + HN]) / 6 * 255, 0, 255); } }
  for (let c = 0; c < 3; c++) edgeBlur(nrm, 4, c, 200); // same for the normals and the canopy the far ground samples

  Object.assign(W, {
    PLAY, MW, TREELINE, name: 'nordmarka',
    mat, nrm, trails, kickers, cabin, lakes, buildings, lamps, pylons: [], signs: [], lm: LM, portals, parks, roadAt, roads: roadNet, mapRoads,
    trees: { data: td.subarray(0, tc * 8), count: tc, nearStart, nearCnt, nearY, farStart, farCnt, farY },
    start: { x: 0, z: 0, yaw: 0 },
  });
  // start on the trail point nearest the chosen place; that trail becomes trails[0] (scripted drives follow it)
  { const T = startAt === 'holmenkollen' ? [LM.jump.end[0] - 20, LM.jump.end[1] + 45] : [cabin.x + 3, cabin.z - 52]; // Frognerseteren: the trail just north of the restaurant
    let bt = 0, bi = 20, bd = 1e9;
    trails.forEach((t, ti) => { if (t.n < 80) return; for (let q = 20; q < t.n - 20; q++) { const d = Math.hypot(t.pts[q * 2] - T[0], t.pts[q * 2 + 1] - T[1]); if (d < bd) { bd = d; bi = q; bt = ti; } } });
    const t = trails.splice(bt, 1)[0]; trails.unshift(t);
    W.startI = bi; W.start.x = t.pts[bi * 2]; W.start.z = t.pts[bi * 2 + 1]; W.start.yaw = Math.atan2(-(t.pts[bi * 2 + 4] - W.start.x), -(t.pts[bi * 2 + 5] - W.start.z)); }
  return W;
}

export function mipChain(src, n) { // rgba8 box-filter mips
  const out = [src]; let s = n, p = src;
  while (s > 1) {
    const h = s >> 1, d = new Uint8Array(h * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < h; i++) for (let c = 0; c < 4; c++) {
      const a = (j * 2 * s + i * 2) * 4 + c; d[(j * h + i) * 4 + c] = (p[a] + p[a + 4] + p[a + s * 4] + p[a + s * 4 + 4] + 2) >> 2;
    }
    out.push(d); p = d; s = h;
  }
  return out;
}
