// Nordmarka (Holmenkollen – Frognerseteren – Tryvann) from real map data, with procedural detail on top.
// Macro shape comes from src/data/world.bin (built by tools/geo/prep.py from Kartverket elevation + OpenStreetMap):
// 8 m height grid, water / wetland / tree-density rasters, nordic trail polylines, building rectangles.
// Everything else (terrain detail, trees, snow, houses, landmarks) is generated here.
// World frame: x = east, z = south, metres; origin 59.9753 N, 10.6800 E.
import { clamp, lerp, smooth, hash1, hash2 } from './math.js';
import DATA from './data/world.bin';

export const WS = 4096, HN = 2048, TEX = WS / HN, HALF = WS / 2;
const PLAY = 1560, MW = 3200, TREELINE = 900;
export const NEAR = 32, NCN = WS / NEAR, FAR = 128, FCN = WS / FAR;
// landmark geometry (from tools/geo/raw/landmarks.json)
export const LM = {
  frogner: { x: -139.3, z: -266.1, yaw: 3.075 },
  jump: { top: [-865.1, 1152.8], lip: [-774.2, 1207.0], end: [-542.2, 1340.4], h: 60 },
  mid: { top: [-338.1, 932.8], lip: [-247.9, 957.4], end: [-28.3, 1018.6], h: 30 },
  tower: { x: -662.7, z: -1485.7, h: 118 },
  chapel: { x: -427.3, z: 1074.0, yaw: -1.425 },
};

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
  const waterM = blob('water'), wetM = blob('wet'), treeM = blob('tree'), TN = meta.tn;
  const col = new Float32Array(4);
  for (let j = 0; j < HN; j++) {
    const z = (j + 0.5) * TEX - HALF, gz = clamp((z + HALF) / meta.hstep, 1, GN - 2.001), jz = gz | 0, tz = gz - jz;
    for (let i = 0; i < HN; i++) {
      const x = (i + 0.5) * TEX - HALF, gx = clamp((x + HALF) / meta.hstep, 1, GN - 2.001), ix = gx | 0, tx = gx - ix, k = j * HN + i;
      for (let r = 0; r < 4; r++) { const o = clamp(jz - 1 + r, 0, GN - 1) * GN + ix; col[r] = cr(G[o - 1], G[o], G[o + 1], G[Math.min(o + 2, GN * GN - 1)], tx); }
      H[k] = cr(col[0], col[1], col[2], col[3], tz) + 1.6 * fbm(x * 0.011, z * 0.011, 3) + 0.45 * fbm(x * 0.06 + 5, z * 0.06, 2);
      mat[k * 4] = waterM[k]; mat[k * 4 + 2] = wetM[k] * 0.9;
    }
    if ((j & 255) === 255) await tick('Shaping terrain', j / HN * 0.4);
  }

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
  const dens = (x, z) => treeM[clamp(((z + HALF) / WS * TN) | 0, 0, TN - 1) * TN + clamp(((x + HALF) / WS * TN) | 0, 0, TN - 1)] / 255;

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

  // ---- buildings: rotated rectangles on levelled pads ----
  const buildings = [];
  { const b = blob('bld'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < meta.nb; i++) {
      const o = i * 12, B = { x: dv.getInt16(o, true) / 8, z: dv.getInt16(o + 2, true) / 8, w: dv.getUint16(o + 4, true) / 8, d: dv.getUint16(o + 6, true) / 8, yaw: dv.getInt16(o + 8, true) / 1e4, kind: b[o + 10], lv: b[o + 11] / 10 };
      if (Math.hypot(B.x - cabin.x, B.z - cabin.z) < 50 || Math.hypot(B.x - LM.chapel.x, B.z - LM.chapel.z) < 22 || W.lakeAt(B.x, B.z) > 0.3) continue;
      if (B.w * B.d > 2600) continue; // arena stands, hotel complexes: not box-shaped
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
  const portals = [], parks = [], roadNet = []; // roadNet: road centre lines for enemy routing, cut where they dip towards a tunnel
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
    const TUN = meta.tunnels, DEPTH = 5, b = blob('roads'), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 0;
    const dTun = (x, z) => { let m = 1e9; for (const t of TUN) for (let i = 0; i + 3 < t.length; i += 2) { const ax = t[i], az = t[i + 1], vx = t[i + 2] - ax, vz = t[i + 3] - az, u = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1); m = Math.min(m, Math.hypot(x - ax - vx * u, z - az - vz * u)); } return m; };
    const rE = new Float32Array(HN * HN).fill(99), rY = new Float32Array(HN * HN);
    for (const [n, w10] of meta.roads) {
      let pts = []; for (let i = 0; i < n; i++, o += 4) pts.push([dv.getInt16(o, true) / 8, dv.getInt16(o + 2, true) / 8]);
      pts = polish(pts, 3); const m = pts.length, hw = w10 / 20, hs = new Float32Array(m), y = new Float32Array(m), dk = new Float32Array(m), dk2 = new Float32Array(m), cov = new Uint8Array(m);
      for (let i = 0; i < m; i++) hs[i] = heightAt(pts[i][0], pts[i][1]);
      for (let i = 0; i < m; i++) {
        let s = 0, c = 0; for (let k = Math.max(0, i - 8); k <= Math.min(m - 1, i + 8); k++) { s += hs[k]; c++; }
        const dt = dTun(pts[i][0], pts[i][1]); dk[i] = s / c; dk2[i] = dt; y[i] = dk[i] - DEPTH * (1 - smooth(8, 95, dt)); cov[i] = dt < 1 ? 2 : dt < 8 ? 1 : 0; // 1 = recess behind the portal face
      }
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
  const spill = [[-3.3, 6.5, 0.5], [3.3, 6.5, 0.5], [0, 7.5, 0.6], [-3, -6.3, 0.4], [3, -6.3, 0.4], [8.5, 0, 0.35], [-8.5, 0, 0.35]].map((q) => ({ x: cabin.x + Math.cos(cabin.yaw) * q[0] + Math.sin(cabin.yaw) * q[1], z: cabin.z - Math.sin(cabin.yaw) * q[0] + Math.cos(cabin.yaw) * q[1], yaw: 0, k: q[2], off: 0 }));
  for (const L of lamps.concat(spill)) {
    const lx = L.x + Math.sin(L.yaw) * (L.k ? 0 : 1.6), lz = L.z + Math.cos(L.yaw) * (L.k ? 0 : 1.6), R = L.k ? 12 : 30, i0 = Math.max(0, Math.floor(w2t(lx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(lx + R))), j0 = Math.max(0, Math.floor(w2t(lz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(lz + R)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * HN + i, d2 = ((i + 0.5) * TEX - HALF - lx) ** 2 + ((j + 0.5) * TEX - HALF - lz) ** 2, h2 = 30.25;
      const v = L.k ? 255 * L.k * Math.exp(-d2 / 14) : 255 * 30 * 5.5 / Math.pow(d2 + h2, 1.5) * (1 - smooth(18, 30, Math.sqrt(d2)));
      nrm[k * 4 + 3] = Math.min(255, nrm[k * 4 + 3] + v);
    }
  }

  // ---- trees: procedural placement steered by the mapped forest / clearings ----
  let cap = 520000, td = new Float32Array(cap * 8), tc = 0;
  const nearStart = new Uint32Array(NCN * NCN), nearCnt = new Uint16Array(NCN * NCN * 3), nearY = new Float32Array(NCN * NCN * 2);
  const farStart = new Uint32Array(FCN * FCN), farCnt = new Uint32Array(FCN * FCN), farY = new Float32Array(FCN * FCN * 2);
  const tmp = [new Float32Array(8 * 128), new Float32Array(8 * 128), new Float32Array(8 * 128)], tn = [0, 0, 0];
  const can = new Float32Array(HN * HN);
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
          const dn = dens(x, z);
          if (dn < 0.04 || mat[ti * 4] > 8 || tD[ti] < 6.2 || mat[ti * 4 + 1] > 40) continue;
          const y = heightAt(x, z), slope = Math.hypot(H[ti + 1] - H[ti - 1], H[ti + HN] - H[ti - HN]) / (2 * TEX);
          if (slope > 1.1) continue;
          { const dx = x - cabin.x, dz = z - cabin.z, fr = Math.cos(cabin.yaw) * dz + Math.sin(cabin.yaw) * dx; if (Math.hypot(dx, dz) < (fr > 0 ? 75 : 34)) continue; } // open view in front of the lodge
          const bog = mat[ti * 4 + 2] / 255, r1 = hash2(hx, hz + 104729), r2 = hash2(hx + 31337, hz + 17), r3 = hash2(hx - 999, hz + 5);
          const fo = 0.6 + 0.9 * fbm(x * 0.006 + 40, z * 0.006, 2);
          let p = (0.35 + 0.65 * smooth(0.18, 0.5, fo)) * dn * (inner ? 0.5 : 0.62) * smooth(6.2, 9, tD[ti]);
          let sp = 0, ht = 0, wd = 1;
          if (bog > 0.5) { p = 0.05; sp = 1; ht = 1.6 + 2.6 * r2; wd = 1.5; }
          else {
            const bf = fbm(x * 0.008 + 90, z * 0.008 - 20, 2), pf = fbm(x * 0.005 - 30, z * 0.005 + 70, 2), gard = 1 - smooth(0.3, 0.7, dn);
            const pb = 0.05 + smooth(0.12, 0.3, bf) * 0.6 + bog * 0.5 + gard * 0.35, pp = 0.03 + smooth(0.2, 0.36, pf) * 0.14 + bog * 0.4 + smooth(0.45, 0.9, slope) * 0.3;
            if (r3 < pb) { sp = 2; ht = 6 + 9 * r2; wd = 0.9 + 0.3 * r1; }
            else if (r3 < pb + pp) { sp = 1; ht = 11 + 10 * r2; wd = 0.9 + 0.3 * r1; }
            else { sp = 0; ht = (7 + 17 * r2 * Math.sqrt(r2)) * (1 - 0.3 * gard); wd = 0.85 + 0.35 * r1; }
          }
          if (r1 > p * Q.trees || tn[sp] >= 127) continue;
          if (!inner) { ht *= 1.35; wd *= 1.25; }
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

  Object.assign(W, {
    PLAY, MW, TREELINE, name: 'nordmarka',
    mat, nrm, trails, kickers, cabin, lakes, buildings, lamps, pylons: [], signs: [], lm: LM, portals, parks, roadAt, roads: roadNet,
    trees: { data: td.subarray(0, tc * 8), count: tc, nearStart, nearCnt, nearY, farStart, farCnt, farY },
    start: { x: 0, z: 0, yaw: 0 },
  });
  // start on the trail point nearest the chosen place; that trail becomes trails[0] (scripted drives follow it)
  { const T = startAt === 'holmenkollen' ? [LM.jump.end[0] - 20, LM.jump.end[1] + 45] : [cabin.x + Math.sin(cabin.yaw) * 45, cabin.z + Math.cos(cabin.yaw) * 45];
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
