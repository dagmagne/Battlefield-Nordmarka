// Procedural Nordmarka-like world: heightmap, lakes, creek, trails, trees, set-piece placement.
import { clamp, lerp, smooth, hash1, hash2 } from './math.js';

export const WS = 4096, HN = 2048, TEX = WS / HN, HALF = WS / 2, PLAY = 1000, TREELINE = 338;
export const NEAR = 32, NCN = WS / NEAR, FAR = 128, FCN = WS / FAR;

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

// ---------- layout ----------
const MTS = [
  { x: 850, z: -650, R: 760, H: 175 },
  { x: -770, z: -700, R: 640, H: 140 },
  { x: -700, z: 810, R: 560, H: 112 },
];
const LAKES = [
  { x: 240, z: 30, rx: 250, rz: 175 },
  { x: -390, z: 310, rx: 78, rz: 60 },
  { x: 450, z: 620, rx: 95, rz: 75 },
  { x: -30, z: -610, rx: 66, rz: 50 },
  { x: 1380, z: 420, rx: 190, rz: 130 },
  { x: -250, z: 1450, rx: 170, rz: 120 },
  { x: -1450, z: -60, rx: 150, rz: 200 },
];
const BOGS = [{ x: 330, z: -500, r: 135 }, { x: -500, z: -150, r: 115 }, { x: 60, z: 520, r: 90 }];
const PL0 = [-330, -1700], PL1 = [-150, 1700]; // power line

function baseH(x, z) {
  const wx = x + 90 * pn(x * 0.0021 + 3.1, z * 0.0021 - 7.7), wz = z + 90 * pn(x * 0.0021 - 11.3, z * 0.0021 + 5.2);
  let h = 252 + 44 * fbm(wx * 0.0011, wz * 0.0011, 3) + 25 * fbm(wx * 0.0034 + 9, wz * 0.0034 - 4, 4) + 5 * fbm(x * 0.012, z * 0.012, 3);
  const ax = Math.abs(x), az = Math.abs(z), d = Math.max(ax, az) * 0.65 + Math.hypot(x, z) * 0.35;
  if (d > 850) h += 100 * smooth(850, 1550, d) * (0.8 + 0.5 * pn(x * 0.0016, z * 0.0016));
  for (let i = 0; i < 3; i++) {
    const m = MTS[i], dx = wx - m.x, dz = wz - m.z, dd = Math.sqrt(dx * dx + dz * dz) / m.R;
    if (dd < 1) {
      const s = 0.5 + 0.5 * Math.cos(Math.PI * dd), p = smooth(0, 0.9, s) * 0.55 + s * 0.45;
      const rg = 1 - Math.abs(pn(x * 0.006 + i * 31, z * 0.006));
      h += m.H * p * (0.86 + 0.2 * rg) + 16 * p * (1 - p) * 4 * (rg * rg - 0.5) + 7 * p * pn(x * 0.02, z * 0.02);
    }
  }
  return h;
}
function lakeS(L, x, z) {
  const dx = (x - L.x) / L.rx, dz = (z - L.z) / L.rz;
  return Math.sqrt(dx * dx + dz * dz) * (1 + 0.28 * pn(x * 0.009 + L.x, z * 0.009) + 0.1 * pn(x * 0.03, z * 0.03));
}
const segDist = (x, z, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az; const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1); return Math.hypot(x - ax - vx * t, z - az - vz * t); };

export async function genWorld(tick, Q) {
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
  const texAt = (arr, ch, x, z) => arr[(clamp(Math.round(w2t(z)), 0, HN - 1) * HN + clamp(Math.round(w2t(x)), 0, HN - 1)) * 4 + ch] / 255;

  // lake / bog levels
  for (const L of LAKES) L.lv = baseH(L.x, L.z) - 5;
  LAKES[0].lv = Math.min(LAKES[0].lv, 238);
  LAKES[2].lv = Math.min(LAKES[2].lv, LAKES[0].lv - 9);
  for (const B of BOGS) B.lv = baseH(B.x, B.z) - 1;

  // ---- base heights ----
  for (let j = 0; j < HN; j++) {
    const z = (j + 0.5) * TEX - HALF;
    for (let i = 0; i < HN; i++) {
      const x = (i + 0.5) * TEX - HALF; let h = baseH(x, z); const k = j * HN + i;
      for (let b = 0; b < BOGS.length; b++) {
        const B = BOGS[b], dx = x - B.x, dz = z - B.z;
        if (Math.abs(dx) < B.r * 1.5 && Math.abs(dz) < B.r * 1.5) {
          const s = Math.hypot(dx, dz) / B.r * (1 + 0.3 * pn(x * 0.012, z * 0.012 + b * 9)), m = 1 - smooth(0.7, 1.15, s);
          if (m > 0) { h = lerp(h, B.lv + 0.35 * pn(x * 0.11, z * 0.11), m); mat[k * 4 + 2] = m * 255; }
        }
      }
      for (let l = 0; l < LAKES.length; l++) {
        const L = LAKES[l];
        if (Math.abs(x - L.x) < L.rx * 3.2 && Math.abs(z - L.z) < L.rz * 3.2) {
          const s = lakeS(L, x, z);
          if (s < 2.6) {
            const g = smooth(1, 2.2, s), up = L.lv + 0.6 * smooth(1, 1.2, s) + Math.max(h - L.lv, 0) * g;
            h = s < 1 ? L.lv : lerp(up, h, smooth(1.8, 2.6, s));
            mat[k * 4] = smooth(1.02, 0.985, s) * 255;
          }
        }
      }
      H[k] = h;
    }
    if ((j & 255) === 255) await tick('Shaping terrain', j / HN * 0.5);
  }

  // ---- cabin site ----
  const L0 = LAKES[0];
  const shore = (L, dx, dz, sT) => { let t = 0, x = L.x, z = L.z; while (lakeS(L, x, z) < sT && t < 900) { t += 2; x = L.x + dx * t; z = L.z + dz * t; } return [x, z]; };
  const cab = shore(L0, -0.985, 0.17, 1.2); const cabin = { x: cab[0], z: cab[1], yaw: Math.PI / 2 + 0.2 };
  cabin.y = heightAt(cabin.x, cabin.z) + 0.3;
  const flatten = (cx, cz, r0, r1, y) => {
    const i0 = Math.max(0, Math.floor(w2t(cx - r1))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + r1))), j0 = Math.max(0, Math.floor(w2t(cz - r1))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + r1)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz), k = j * HN + i;
      if (mat[k * 4] < 128) H[k] = lerp(y, H[k], smooth(r0, r1, d));
    }
  };
  flatten(cabin.x, cabin.z, 16, 34, cabin.y);

  // ---- creek + dam ----
  const L2 = LAKES[2];
  { const dx = L2.x - L0.x, dz = L2.z - L0.z, l = Math.hypot(dx, dz); var cdx = dx / l, cdz = dz / l; }
  const damP = shore(L0, cdx, cdz, 1.03), endP = shore(L2, -cdx, -cdz, 1.0);
  const creek = [];
  { const n = Math.ceil(Math.hypot(endP[0] - damP[0], endP[1] - damP[1]) / 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.sin(t * Math.PI) * (26 * Math.sin(t * 9) + 14 * Math.sin(t * 23 + 1));
      creek.push([lerp(damP[0], endP[0], t) - cdz * w, lerp(damP[1], endP[1], t) + cdx * w, 0]);
    }
    let bed = L0.lv - 3.2;
    for (let i = 0; i <= n; i++) { const c = creek[i], t = i / n; bed = Math.min(bed, lerp(L0.lv - 3.2, L2.lv + 0.1, t), heightAt(c[0], c[1]) - 1.3); c[2] = Math.max(bed, L2.lv + 0.1); }
    for (let q = 2; q <= n; q++) {
      const c = creek[q], R = 44, i0 = Math.floor(w2t(c[0] - R)), i1 = Math.ceil(w2t(c[0] + R)), j0 = Math.floor(w2t(c[1] - R)), j1 = Math.ceil(w2t(c[1] + R));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * HN + i, x = (i + 0.5) * TEX - HALF, z = (j + 0.5) * TEX - HALF, d = Math.hypot(x - c[0], z - c[1]);
        if (mat[k * 4] > 100) continue;
        const tg = c[2] + Math.max(0, d - 1.4) * 0.4 + Math.max(0, d - 9) * 0.25;
        if (tg < H[k]) H[k] = tg;
        const cm = (1 - smooth(1.2, 2.6, d)) * 255; if (cm > mat[k * 4 + 1]) mat[k * 4 + 1] = cm;
      }
    }
  }
  const dam = { x: damP[0] + cdx * 1.5, z: damP[1] + cdz * 1.5, yaw: Math.atan2(-cdx, -cdz), top: L0.lv + 1.0, base: L0.lv - 4.5 };
  await tick('Routing trails', 0.55);

  // ---- trail routing (A*) ----
  const GN = 256, GC = 8, gH = new Float32Array(GN * GN), gP = new Float32Array(GN * GN);
  const g2w = (i) => (i + 0.5) * GC - 1024;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = g2w(i), z = g2w(j), k = j * GN + i; gH[k] = heightAt(x, z);
    let p = 1; if (texAt(mat, 0, x, z) > 0.3) p = 5; if (texAt(mat, 1, x, z) > 0.05 || segDist(x, z, damP[0], damP[1], endP[0], endP[1]) < 22) p = 80;
    if (Math.abs(x) > PLAY - 30 || Math.abs(z) > PLAY - 30) p = 30;
    if (Math.hypot(x - cabin.x, z - cabin.z) < 20) p = 40;
    gP[k] = p;
  }
  const gS = new Float32Array(GN * GN), fS = new Float32Array(GN * GN), from = new Int32Array(GN * GN), heap = new Int32Array(GN * GN * 4), stt = new Uint8Array(GN * GN);
  function route(ax, az, bx, bz, ice) {
    const a = clamp(Math.floor((az + 1024) / GC), 0, GN - 1) * GN + clamp(Math.floor((ax + 1024) / GC), 0, GN - 1), b = clamp(Math.floor((bz + 1024) / GC), 0, GN - 1) * GN + clamp(Math.floor((bx + 1024) / GC), 0, GN - 1);
    gS.fill(1e30); stt.fill(0); let hn = 0;
    const push = (n) => { let i = hn++; heap[i] = n; while (i > 0) { const p = (i - 1) >> 1; if (fS[heap[p]] <= fS[heap[i]]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const pop = () => { const r = heap[0]; heap[0] = heap[--hn]; let i = 0; for (;;) { let l = i * 2 + 1, m = i; if (l < hn && fS[heap[l]] < fS[heap[m]]) m = l; if (l + 1 < hn && fS[heap[l + 1]] < fS[heap[m]]) m = l + 1; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } return r; };
    const bi = b % GN, bj = (b / GN) | 0;
    gS[a] = 0; fS[a] = 0; from[a] = -1; push(a);
    while (hn) {
      const c = pop(); if (c === b) break; if (stt[c]) continue; stt[c] = 1;
      const ci = c % GN, cj = (c / GN) | 0;
      for (let d = 0; d < 8; d++) {
        const ni = ci + [1, -1, 0, 0, 1, 1, -1, -1][d], nj = cj + [0, 0, 1, -1, 1, -1, 1, -1][d];
        if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
        const n = nj * GN + ni; if (stt[n]) continue;
        const len = d < 4 ? GC : GC * 1.4142, sl = (gH[n] - gH[c]) / len;
        let pen = gP[n]; if (ice && pen === 5) pen = 0.8;
        const g = gS[c] + len * (1 + 220 * sl * sl) * pen;
        if (g < gS[n]) { gS[n] = g; from[n] = c; fS[n] = g + Math.hypot(ni - bi, nj - bj) * GC; push(n); }
      }
    }
    const out = []; let c = b; while (c >= 0) { out.push([g2w(c % GN), g2w((c / GN) | 0)]); c = from[c]; if (out.length > 9999) break; }
    out.reverse(); out[0] = [ax, az]; out[out.length - 1] = [bx, bz]; return out;
  }
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
  const bi = Math.floor(creek.length * 0.5), bc = creek[bi], bt = [creek[bi + 4][0] - creek[bi - 4][0], creek[bi + 4][1] - creek[bi - 4][1]];
  { const l = Math.hypot(bt[0], bt[1]); bt[0] /= l; bt[1] /= l; }
  let bn = [-bt[1], bt[0]]; if (bn[0] > 0) bn = [-bn[0], -bn[1]]; // bn points west
  const bridge = { x: bc[0], z: bc[1], yaw: Math.atan2(bn[0], bn[1]), len: 26, bed: bc[2] };
  const BR0 = [bc[0] + bn[0] * 46, bc[1] + bn[1] * 46], BR3 = [bc[0] - bn[0] * 46, bc[1] - bn[1] * 46];
  const C = [cabin.x - 16, cabin.z - 24]; // trail hub west of the cabin
  const sum = MTS.map((m) => { let bx = m.x, bz = m.z, bh = 0; for (let a = -120; a <= 120; a += 20) for (let b = -120; b <= 120; b += 20) { const x = clamp(m.x + a, -PLAY + 60, PLAY - 60), z = clamp(m.z + b, -PLAY + 60, PLAY - 60), h = heightAt(x, z); if (h > bh) { bh = h; bx = x; bz = z; } } return [bx, bz]; });
  const WP = { A: [70, -300], B: [-210, -380], Cc: [-350, -110], S: [20, 250], E: [600, 400], T1: [-300, 250], G: [-140, 640], Bg: [330, -400], Le: shore(L0, 0.97, -0.2, 1.12), Lw: shore(L0, -0.95, -0.25, 1.1) };
  const defs = [
    { n: 'lys', lit: 1, via: [C, WP.A, WP.B, WP.Cc, C] },
    { n: 'syd', via: [C, WP.S, BR0, BR3, WP.E, sum[0]] },
    { n: 'myr', via: [WP.A, WP.Bg, sum[0]] },
    { n: 'vest', via: [WP.Cc, [-520, -260], sum[1]] },
    { n: 'tjern', via: [C, WP.T1, sum[2]] },
    { n: 'rund', via: [sum[2], WP.G, BR0] },
    { n: 'is', ice: 1, via: [C, WP.Lw, WP.Le, WP.E] },
    { n: 'nord', via: [WP.B, [-100, -520], [-420, -640], sum[1]] },
  ];
  const trails = [];
  for (const d of defs) {
    let pts = [];
    for (let i = 1; i < d.via.length; i++) {
      const a = d.via[i - 1], b = d.via[i];
      const seg = (a === BR0 && b === BR3) || (d.ice && a === WP.Lw) ? [a, b] : route(a[0], a[1], b[0], b[1], d.ice);
      pts = pts.concat(i > 1 ? seg.slice(1) : seg);
    }
    pts = polish(pts, 9);
    const f = new Float32Array(pts.length * 2); pts.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
    trails.push({ name: d.n, lit: !!d.lit, pts: f, n: pts.length });
  }
  await tick('Carving trails', 0.62);

  // ---- carve trails into the heightmap ----
  const tD = new Float32Array(HN * HN).fill(99), tT = new Float32Array(HN * HN);
  const brY0 = heightAt(bc[0] + bn[0] * 13, bc[1] + bn[1] * 13), brY1 = heightAt(bc[0] - bn[0] * 13, bc[1] - bn[1] * 13);
  bridge.y = (brY0 + brY1) / 2;
  for (const t of trails) {
    const n = t.n, hs = new Float32Array(n), isB = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = t.pts[i * 2], z = t.pts[i * 2 + 1]; hs[i] = heightAt(x, z);
      const s = (x - bc[0]) * bn[0] + (z - bc[1]) * bn[1], o = Math.abs((x - bc[0]) * bt[0] + (z - bc[1]) * bt[1]);
      if (Math.abs(s) < 14 && o < 6) { hs[i] = bridge.y; isB[i] = 1; }
    }
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 6); k <= Math.min(n - 1, i + 6); k++) { s += hs[k]; c++; } sm[i] = isB[i] ? hs[i] : s / c; }
    t.y = sm;
    for (let q = 0; q < n; q++) {
      const cx = t.pts[q * 2], cz = t.pts[q * 2 + 1], R = 12, i0 = Math.max(0, Math.floor(w2t(cx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(cx + R))), j0 = Math.max(0, Math.floor(w2t(cz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(cz + R)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * HN + i, d = Math.hypot((i + 0.5) * TEX - HALF - cx, (j + 0.5) * TEX - HALF - cz) + (isB[q] ? 0 : 0.01);
        if (d < tD[k]) { tD[k] = d; tT[k] = isB[q] ? -sm[q] : sm[q]; }
      }
    }
  }
  for (let k = 0; k < HN * HN; k++) if (tD[k] < 12 && mat[k * 4] < 128) {
    const b = tT[k] < 0, w = b ? 1 - smooth(3.0, 4.6, tD[k]) : 1 - smooth(3.4, 10, tD[k]);
    H[k] = lerp(H[k], Math.abs(tT[k]), w);
    if (b && w > 0.5) mat[k * 4 + 1] = 0;
  }
  await tick('Computing normals', 0.68);

  // ---- alpine mask + normals ----
  const nrm = new Uint8Array(HN * HN * 4); // RG normal xz, B canopy, A lamp light
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const k = j * HN + i, x = (i + 0.5) * TEX - HALF, z = (j + 0.5) * TEX - HALF;
    const dx = (H[j * HN + Math.min(i + 1, HN - 1)] - H[j * HN + Math.max(i - 1, 0)]) / (2 * TEX), dz = (H[Math.min(j + 1, HN - 1) * HN + i] - H[Math.max(j - 1, 0) * HN + i]) / (2 * TEX);
    const l = 1 / Math.sqrt(dx * dx + dz * dz + 1);
    nrm[k * 4] = clamp((-dx * l * 0.5 + 0.5) * 255 + 0.5, 0, 255); nrm[k * 4 + 1] = clamp((-dz * l * 0.5 + 0.5) * 255 + 0.5, 0, 255);
    mat[k * 4 + 3] = smooth(TREELINE - 18, TREELINE + 28, H[k] + 10 * pn(x * 0.016, z * 0.016)) * 255;
  }
  await tick('Planting forest', 0.74);

  // ---- power line ----
  const pylons = [];
  { const dx = PL1[0] - PL0[0], dz = PL1[1] - PL0[1], l = Math.hypot(dx, dz), n = Math.round(l / 170);
    for (let i = 0; i <= n; i++) { const x = PL0[0] + dx * i / n, z = PL0[1] + dz * i / n; pylons.push({ x, z, y: heightAt(x, z), yaw: Math.atan2(dx, dz) }); } }

  // ---- lamps along the lit trail ----
  const lamps = [];
  for (const t of trails) if (t.lit) {
    for (let i = 8; i < t.n - 6; i += 17) {
      const x = t.pts[i * 2], z = t.pts[i * 2 + 1], tx = t.pts[i * 2 + 2] - x, tz = t.pts[i * 2 + 3] - z, l = Math.hypot(tx, tz) || 1;
      const side = 1, px = x - tz / l * 4.3 * side, pz = z + tx / l * 4.3 * side;
      if (Math.hypot(px - cabin.x, pz - cabin.z) < 15) continue;
      lamps.push({ x: px, z: pz, y: heightAt(px, pz), yaw: Math.atan2(x - px, z - pz) });
    }
  }
  for (const L of lamps) {
    const lx = L.x + Math.sin(L.yaw) * 1.6, lz = L.z + Math.cos(L.yaw) * 1.6, R = 30, i0 = Math.max(0, Math.floor(w2t(lx - R))), i1 = Math.min(HN - 1, Math.ceil(w2t(lx + R))), j0 = Math.max(0, Math.floor(w2t(lz - R))), j1 = Math.min(HN - 1, Math.ceil(w2t(lz + R)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * HN + i, d2 = ((i + 0.5) * TEX - HALF - lx) ** 2 + ((j + 0.5) * TEX - HALF - lz) ** 2, h2 = 30.25;
      const v = 255 * 30 * 5.5 / Math.pow(d2 + h2, 1.5) * (1 - smooth(18, 30, Math.sqrt(d2)));
      nrm[k * 4 + 3] = Math.min(255, nrm[k * 4 + 3] + v);
    }
  }

  // ---- trees ----
  let cap = 420000, td = new Float32Array(cap * 8), tc = 0;
  const nearStart = new Uint32Array(NCN * NCN), nearCnt = new Uint16Array(NCN * NCN * 3), nearY = new Float32Array(NCN * NCN * 2);
  const farStart = new Uint32Array(FCN * FCN), farCnt = new Uint32Array(FCN * FCN), farY = new Float32Array(FCN * FCN * 2);
  const tmp = [new Float32Array(8 * 128), new Float32Array(8 * 128), new Float32Array(8 * 128)], tn = [0, 0, 0];
  const can = new Float32Array(HN * HN);
  const colliders = [];
  for (let fz = 0; fz < FCN; fz++) {
    for (let fx = 0; fx < FCN; fx++) {
      const fc = fz * FCN + fx; farStart[fc] = tc; let fy0 = 1e9, fy1 = -1e9;
      for (let q = 0; q < 16; q++) {
        const cx = fx * 4 + (q & 3), cz = fz * 4 + (q >> 2), nc = cz * NCN + cx, x0 = cx * NEAR - HALF, z0 = cz * NEAR - HALF;
        const inner = Math.abs(x0 + 16) < 1130 && Math.abs(z0 + 16) < 1130, g = inner ? 9 : 5, st = NEAR / g;
        tn[0] = tn[1] = tn[2] = 0; let y0 = 1e9, y1 = -1e9;
        for (let b = 0; b < g; b++) for (let a = 0; a < g; a++) {
          const hx = cx * 16 + a, hz = cz * 16 + b, r0 = hash2(hx, hz), x = x0 + (a + 0.15 + 0.7 * r0) * st, z = z0 + (b + 0.15 + 0.7 * hash2(hx + 7919, hz)) * st;
          const ti = clamp(Math.round(w2t(z)), 1, HN - 2) * HN + clamp(Math.round(w2t(x)), 1, HN - 2);
          if (mat[ti * 4] > 8 || mat[ti * 4 + 1] > 40 || tD[ti] < 6.2) continue;
          const y = heightAt(x, z), slope = Math.hypot(H[ti + 1] - H[ti - 1], H[ti + HN] - H[ti - HN]) / (2 * TEX);
          if (slope > 0.95) continue;
          const pd = segDist(x, z, PL0[0], PL0[1], PL1[0], PL1[1]); if (pd < 13) continue;
          const dc = Math.hypot(x - cabin.x, z - cabin.z); if (dc < 27) continue;
          if (Math.hypot(x - dam.x, z - dam.z) < 16) continue;
          const bog = mat[ti * 4 + 2] / 255, r1 = hash2(hx, hz + 104729), r2 = hash2(hx + 31337, hz + 17), r3 = hash2(hx - 999, hz + 5);
          const alt = y + 14 * pn(x * 0.02, z * 0.02) + 6 * pn(x * 0.07, z * 0.07), af = 1 - smooth(TREELINE - 42, TREELINE + 10, alt);
          let ls = 9; for (let l = 0; l < LAKES.length; l++) { const L = LAKES[l]; if (Math.abs(x - L.x) < L.rx * 1.6 && Math.abs(z - L.z) < L.rz * 1.6) ls = Math.min(ls, lakeS(L, x, z)); }
          if (ls < 1.05) continue;
          const fo = 0.6 + 0.9 * fbm(x * 0.006 + 40, z * 0.006, 2);
          let p = smooth(0.22, 0.5, fo) * (0.25 + 0.75 * af) * af * (inner ? 0.86 : 0.95) * smooth(6.2, 9, tD[ti]) * smooth(13, 17, pd);
          let sp = 0, ht = 0, wd = 1;
          if (bog > 0.5) { p = 0.045; sp = 1; ht = 1.6 + 2.6 * r2; wd = 1.5; }
          else {
            const bf = fbm(x * 0.008 + 90, z * 0.008 - 20, 2), pf = fbm(x * 0.005 - 30, z * 0.005 + 70, 2);
            let pb = 0.05 + smooth(0.12, 0.3, bf) * 0.8 + (1 - smooth(1.05, 1.3, ls)) * 0.5 + (1 - smooth(0.25, 0.6, af)) * 0.6 + bog * 0.5;
            const pp = 0.06 + smooth(0.12, 0.28, pf) * 0.55 + bog * 0.4;
            if (r3 < pb) { sp = 2; ht = (6 + 9 * r2) * (0.3 + 0.7 * smooth(0.1, 0.7, af)); wd = 0.9 + 0.3 * r1 + (1 - af) * 0.5; }
            else if (r3 < pb + pp) { sp = 1; ht = (11 + 10 * r2) * (0.35 + 0.65 * smooth(0.2, 0.8, af)); wd = 0.9 + 0.3 * r1; }
            else { sp = 0; ht = (7 + 17 * r2 * Math.sqrt(r2)) * (0.22 + 0.78 * smooth(0.1, 0.85, af)); wd = 0.85 + 0.35 * r1 + (1 - af) * 0.4; }
          }
          if (r1 > p * Q.trees || tn[sp] >= 127) continue;
          if (!inner) { ht *= 1.35; wd *= 1.25; }
          const o = tn[sp]++ * 8, T = tmp[sp];
          T[o] = x; T[o + 1] = y - 0.15; T[o + 2] = z; T[o + 3] = ht; T[o + 4] = r0 * 6.283; T[o + 5] = sp; T[o + 6] = r2 * 0.999 + ((hx * 7 + hz * 13) & 7); T[o + 7] = wd;
          if (y < y0) y0 = y; if (y + ht > y1) y1 = y + ht;
          const cr = ht * 0.16 * (sp === 0 ? 1 : 0.8); for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) can[ti + v * HN + u] += cr * cr * (u || v ? 0.5 : 1) * (inner ? 0.085 : 0.2);
        }
        nearStart[nc] = tc;
        for (let s = 0; s < 3; s++) { const n = Math.min(tn[s], cap - tc); nearCnt[nc * 3 + s] = n; td.set(tmp[s].subarray(0, n * 8), tc * 8); tc += n; }
        nearY[nc * 2] = y0; nearY[nc * 2 + 1] = y1; if (y0 < fy0) fy0 = y0; if (y1 > fy1) fy1 = y1;
      }
      farCnt[fc] = tc - farStart[fc]; farY[fc * 2] = fy0; farY[fc * 2 + 1] = fy1;
    }
    if ((fz & 7) === 7) await tick('Planting forest', 0.74 + 0.2 * fz / FCN);
  }
  // canopy density -> blurred into nrm.B
  { const t2 = new Float32Array(HN * HN);
    for (let j = 1; j < HN - 1; j++) for (let i = 1; i < HN - 1; i++) { const k = j * HN + i; t2[k] = (can[k] * 2 + can[k - 1] + can[k + 1] + can[k - HN] + can[k + HN]) / 6; }
    for (let j = 1; j < HN - 1; j++) for (let i = 1; i < HN - 1; i++) { const k = j * HN + i; nrm[k * 4 + 2] = clamp((t2[k] * 2 + t2[k - 1] + t2[k + 1] + t2[k - HN] + t2[k + HN]) / 6 * 255, 0, 255); } }

  // ---- signs at junctions ----
  const signs = [];
  const addSign = (p, yaw, a, b) => { const x = p[0] + Math.sin(yaw + 1.3) * 5.2, z = p[1] + Math.cos(yaw + 1.3) * 5.2; signs.push({ x, z, y: heightAt(x, z), yaw, a, b }); };
  addSign(C, 0.4, 0, 1); addSign(WP.A, 2.2, 2, 3); addSign(WP.Cc, -1.2, 4, 0); addSign(WP.S, 1.6, 5, 2); addSign(BR0, bridge.yaw + 0.3, 1, 5); addSign(WP.E, 0.2, 3, 4); addSign(WP.B, 3.4, 4, 2);

  Object.assign(W, {
    mat, nrm, trails, cabin, dam, bridge, creek, lakes: LAKES, bogs: BOGS, mts: MTS, summits: sum, pylons, lamps, signs, hub: C, wp: WP,
    trees: { data: td.subarray(0, tc * 8), count: tc, nearStart, nearCnt, nearY, farStart, farCnt, farY },
    start: { x: C[0] + 6, z: C[1] - 26 },
  });
  // find start heading along lys trail
  { const t = trails[0]; W.start.x = t.pts[26]; W.start.z = t.pts[27]; W.start.yaw = Math.atan2(-(t.pts[30] - t.pts[26]), -(t.pts[31] - t.pts[27])); }
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
