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
  // jump profiles measured from the lidar surface model (tools/geo/jumps.py): deck [d, y], wing [d, t, top y], block [from d, half width]
  jump: { top: [-865.1, 1152.8], lip: [-774.2, 1207.0], end: [-542.2, 1340.4], w: 6.5, plat: 18,
    deck: [[20, 420.8], [32, 411.6], [44, 404.2], [56, 396.2], [68, 390.6], [80, 386.2], [92, 382.3], [106, 380.2]],
    wing: [[56, 3.3, 399], [80, 9.2, 388], [104, 14, 379], [128, 22, 374.5], [146, 29, 367.4], [158, 33, 363.5], [176, 37, 358], [190, 40, 351], [198, 42, 343]], block: [60, 10] },
  mid: { top: [-338.1, 932.8], lip: [-247.9, 957.4], end: [-28.3, 1018.6], w: 4.5, plat: 8, skirt: 1,
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
      { f: 'jump', n: 16, seg: 9, r: [[225, -17.5, -50], [235, -16.5, -54], [245, -18, -56.5], [255, -20, -57.5], [265, -20, -58], [275, -19, -57], [285, -17.5, -55.5], [295, -15.5, -53], [305, -14.5, -49.5], [315, -14, -44.5], [325, -13, -37.5], [335, -12.5, -28.5], [345, -11.5, -19.5], [355, -10.5, -11]] },
      { f: 'jump', n: 16, seg: 9, r: [[225, 18, 54], [235, 18.5, 58], [245, 19, 59.5], [255, 19.5, 60], [265, 19, 59.5], [275, 19, 58.5], [285, 18, 57], [295, 17.5, 54.5], [305, 16.5, 50.5], [315, 16.5, 45], [325, 15.5, 38], [335, 13.5, 29], [345, 13, 20.5], [355, 11.5, 12]] },
      { f: 'jump', rw: 1.8, lift: 1.7, seg: 6, seat: 1, r: [[160, -18.5, -21], [170, -18, -30.5], [180, -19, -37], [190, -19, -39.5], [200, -17.5, -44.5], [210, -16, -46], [222, -16.5, -49]] },
      { f: 'jump', rw: 1.8, lift: 1.7, seg: 6, seat: 1, r: [[160, 19.5, 23], [170, 20, 33], [180, 20, 37], [190, 20, 39.5], [200, 19.5, 46.5], [210, 18.5, 48], [222, 18, 48.5]] },
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

  // ---- window border: the terrain beyond the map repeats the edge texels, so smooth the outer 160 m along the edge (no streaks to the horizon) ----
  { const BW = 80, R = 160, ps = new Float64Array(HN + 1), line = new Float32Array(HN);
    for (let side = 0; side < 4; side++) for (let r = 0; r < BW; r++) {
      const w = (1 - r / BW) ** 1.5, at = (t) => side === 0 ? r * HN + t : side === 1 ? (HN - 1 - r) * HN + t : side === 2 ? t * HN + r : t * HN + HN - 1 - r;
      for (let t = 0; t < HN; t++) ps[t + 1] = ps[t] + H[at(t)];
      for (let t = 0; t < HN; t++) { const t0 = Math.max(0, t - R), t1 = Math.min(HN, t + R + 1); line[t] = (ps[t1] - ps[t0]) / (t1 - t0); }
      for (let t = 0; t < HN; t++) { const k = at(t); H[k] = lerp(H[k], line[t], w); }
    } }

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
  // ---- Frognerseteren (the lit timber lodge) ----
  const cabin = { x: LM.frogner.x, z: LM.frogner.z, yaw: LM.frogner.yaw, col: [0.13, 0.085, 0.05] };
  cabin.y = heightAt(cabin.x, cabin.z) + 0.3;
  flatten(cabin.x, cabin.z, 30, 55, cabin.y);

  // inside a ski jump's footprint (inrun, wind screens, landing hill out to d = far along its axis, widened by m)?
  const inJump = (x, z, far, m) => { for (const J of [LM.jump, LM.mid]) { const ex = J.end[0] - J.top[0], ez = J.end[1] - J.top[1], l = Math.hypot(ex, ez), d = ((x - J.top[0]) * ex + (z - J.top[1]) * ez) / l, t = Math.abs((x - J.top[0]) * -ez + (z - J.top[1]) * ex) / l;
    if (d > -6 && d < (far || l) && t < m + 13 + 0.3 * clamp(d - 60, 0, 110)) return true; } return false; };
  // inside an arena stand, stand building or the shooting range (LM.arena), widened by m?
  const AR = LM.arena, arF = (f, x, z) => { const F = arenaFrame(f), dx = x - F[0], dz = z - F[1]; return [dx * F[2] + dz * F[3], -dx * F[3] + dz * F[2]]; };
  const inArena = (x, z, m) => { for (const S of AR.stands) { const p = arF(S.f, x, z), q = standAt(S.r, p[0]); if (q && p[1] > Math.min(q[0], q[1]) - m && p[1] < Math.max(q[0], q[1]) + m) return true; }
    for (const B of AR.boxes) { const p = arF(B.f, x, z); for (const c of B.b) if (p[0] > c[0] - m && p[0] < c[1] + m && p[1] > c[2] - m && p[1] < c[3] + m) return true; }
    const p = arF(AR.range.f, x, z); return p[0] > -6 - m && p[0] < 96 + m && p[1] > AR.range.fl - 6 - m && p[1] < AR.range.tg + 2 + m; };
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
  { // roads: flat bed along a smoothed profile, sunk under the ski bridges (tunnels) with headwalls as props
    const TUN = meta.tunnels, LID = meta.hstep < 8, DEPTH = LID ? 0 : 5, b = blob('roads'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 0;
    const dTun = (x, z) => { let m = 1e9; for (const t of TUN) for (let i = 0; i + 3 < t.length; i += 2) { const ax = t[i], az = t[i + 1], vx = t[i + 2] - ax, vz = t[i + 3] - az, u = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1); m = Math.min(m, Math.hypot(x - ax - vx * u, z - az - vz * u)); } return m; };
    const rE = new Float32Array(HN * HN).fill(99), rY = new Float32Array(HN * HN);
    for (const [n, w10] of meta.roads) {
      let pts = []; for (let i = 0; i < n; i++, o += 4) pts.push([dv.getInt16(o, true) / 8, dv.getInt16(o + 2, true) / 8]);
      pts = polish(pts, 3); mapRoads.push({ pts: Float32Array.from(pts.flat()), hw: w10 / 20 }); const m = pts.length, hw = w10 / 20, hs = new Float32Array(m), y = new Float32Array(m), dk = new Float32Array(m), dk2 = new Float32Array(m), cov = new Uint8Array(m);
      for (let i = 0; i < m; i++) { hs[i] = heightAt(pts[i][0], pts[i][1]); dk2[i] = dTun(pts[i][0], pts[i][1]); }
      for (let i = 0; i < m; i++) {
        // lidar terrain already has the road at its real level and the earth on top of the tunnel: keep the bump out of the road profile and do not sink anything
        let s = 0, c = 0; for (let k = Math.max(0, i - 8); k <= Math.min(m - 1, i + 8); k++) if (!LID || dk2[k] >= 8) { s += hs[k]; c++; }
        const dt = dk2[i]; dk[i] = c ? s / c : hs[i]; y[i] = dk[i] - DEPTH * (1 - smooth(8, 95, dt)); cov[i] = dt < 1 ? 2 : dt < 8 ? 1 : 0; // 1 = recess behind the portal face
      }
      if (LID) { for (let i = 1; i < m; i++) if (cov[i]) y[i] = y[i - 1]; for (let i = 0; i < m; i++) if (cov[i]) dk[i] = Math.max(hs[i], y[i] + 3.5); }
      for (let q0 = 0; q0 < m;) { let q1 = q0; while (q1 < m && dk2[q1] > 100) q1++; // runs of road well away from the tunnels
        if (q1 - q0 >= 20) { const f = new Float32Array((q1 - q0) * 2); for (let q = q0; q < q1; q++) { f[(q - q0) * 2] = pts[q][0]; f[(q - q0) * 2 + 1] = pts[q][1]; } roadNet.push({ pts: f, n: q1 - q0, hw }); }
        q0 = q1 + 1; }
      for (let q = 0; q < m; q++) {
        const cx = pts[q][0], cz = pts[q][1], R = hw + 18, i0 = Math.max(0, Math.floor(w2t(cx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + R))), j0 = Math.max(0, Math.floor(w2t(cz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + R)));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * HN + i, e = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz) - hw;
          if (e < rE[k]) { rE[k] = e; rY[k] = cov[q] === 2 ? -dk[q] : y[q]; } // negative: level deck on top of the tunnel
        }
        if (q && !cov[q] !== !cov[q - 1]) { const a = cov[q] ? q : q - 1, c = cov[q] ? q - 1 : q, dx = pts[a][0] - pts[c][0], dz = pts[a][1] - pts[c][1], l = Math.hypot(dx, dz); portals.push({ x: pts[a][0], z: pts[a][1], y: y[a], hw, dx: dx / l, dz: dz / l, top0: dk[a], top1: dk[clamp(a + (a - c) * 5, 0, m - 1)] }); }
      }
    }
    for (let k = 0; k < HN * HN; k++) if (rY[k] < 0) { if (rE[k] < 17 && mat[k * 4] < 9) H[k] = lerp(-rY[k], H[k], clamp((rE[k] - 9) / 8, 0, 1)); }
    else if (rE[k] < 10 && mat[k * 4] < 9) {
      const e = rE[k], yT = rY[k];
      H[k] = lerp(yT, H[k], clamp((e - 1) / Math.max(3, 1.6 * Math.abs(H[k] - yT)), 0, 1)); mat[k * 4 + 1] = Math.max(mat[k * 4 + 1], gOf(e)); // straight cut slope, gentle enough to stay snow-covered
    }
  }
  const roadAt = (x, z) => mat[(clamp(Math.round(w2t(z)), 0, HN - 1) * HN + clamp(Math.round(w2t(x)), 0, HN - 1)) * 4 + 1] / 255;
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
      if (Math.hypot(px - cabin.x, pz - cabin.z) < 15 || Math.abs(px) > PLAY + 200 || Math.abs(pz) > PLAY + 200 || W.lakeAt(px, pz) > 0.2 || roadAt(px, pz) > 0.3) continue;
      lamps.push({ x: px, z: pz, y: heightAt(px, pz), yaw: Math.atan2(x - px, z - pz) });
    }
  }
  const spill = [[-6, 21.5, 0.45], [6, 21.5, 0.45], [20.5, -4, 0.4], [20.5, 6, 0.4], [-22, -2, 0.35], [-2, -14, 0.35], [6, -14, 0.35]].map((q) => ({ x: cabin.x + Math.cos(cabin.yaw) * q[0] + Math.sin(cabin.yaw) * q[1], z: cabin.z - Math.sin(cabin.yaw) * q[0] + Math.cos(cabin.yaw) * q[1], yaw: 0, k: q[2], off: 0 }));
  for (const L of lamps.concat(spill)) {
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
  // the ground beyond the map samples the edge texels: blend normals and canopy to their average along the edge over the outer 160 m (no streaks to the horizon)
  { const BW = 80, R = 200, ps = new Float64Array(HN + 1);
    for (let c = 0; c < 3; c++) for (let side = 0; side < 4; side++) for (let r = 0; r < BW; r++) {
      const w = (1 - r / BW) ** 1.5, at = (t) => (side === 0 ? r * HN + t : side === 1 ? (HN - 1 - r) * HN + t : side === 2 ? t * HN + r : t * HN + HN - 1 - r) * 4 + c;
      for (let t = 0; t < HN; t++) ps[t + 1] = ps[t] + nrm[at(t)];
      for (let t = 0; t < HN; t++) { const t0 = Math.max(0, t - R), t1 = Math.min(HN, t + R + 1), k = at(t); nrm[k] = lerp(nrm[k], (ps[t1] - ps[t0]) / (t1 - t0), w); }
    } }

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
