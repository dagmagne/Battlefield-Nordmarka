// Solid, destructible buildings (real world): records, oriented boxes on a grid, damage states and the
// vertex edits that show them. Every query here is allocation-free; a state change (rare) may allocate.
import { MB, MAT, VS } from './mesh.js';
import { clamp, hash1, hash2 } from './math.js';

const CG = 16, MARGIN = 4.5; // grid cell (m); a box is listed in every cell within MARGIN of it, so a point or a circle up to MARGIN needs only its own cell
export const DMAX = 6144;    // debris boxes (ring buffer, 24 vertices each)
const BS = 10;               // box stride: cx cz ux uz hw hd y wall rise building
const RUB = [0.05, 0.04, 0.03], GREY = [0.3, 0.29, 0.28];

export function initBuildings(W, mesh, HALF) {
  const L = W.bld || [], n = L.length; let nb = 0; for (const b of L) nb += b.boxes.length;
  const B = { n, nb, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), hp: new Float32Array(n), hpM: new Float32Array(n), st: new Uint8Array(n),
    v0: new Uint32Array(n), v1: new Uint32Array(n), b0: new Uint32Array(n), b1: new Uint32Array(n), size: new Float32Array(n), box: new Float32Array(nb * BS),
    fix: new Uint8Array(n), mesh, upload: null, debUpload: null, dv: new Float32Array(DMAX * 24 * VS), di: null, dN: 0, dHead: 0, changed: [], pris: new Array(n) };
  const X = B.box;
  let k = 0;
  L.forEach((r, i) => {
    B.x[i] = r.x; B.y[i] = r.y; B.z[i] = r.z; B.fix[i] = r.fix ? 1 : 0; B.v0[i] = r.v0; B.v1[i] = r.v1; B.b0[i] = k;
    B.hpM[i] = B.hp[i] = clamp(60 + 0.5 * r.area, 60, 400); B.size[i] = Math.sqrt(r.area);
    for (const q of r.boxes) { const o = k++ * BS; X[o] = q.x; X[o + 1] = q.z; X[o + 2] = Math.cos(q.th); X[o + 3] = -Math.sin(q.th); X[o + 4] = q.hw; X[o + 5] = q.hd; X[o + 6] = q.y; X[o + 7] = q.wall; X[o + 8] = q.rise; X[o + 9] = i; }
    B.b1[i] = k;
  });
  // grid: box indices per 16 m cell
  const NG = Math.ceil(2 * HALF / CG), gs = new Uint32Array(NG * NG + 1), cell = (v) => clamp(Math.floor((v + HALF) / CG), 0, NG - 1);
  const each = (f) => { for (let q = 0; q < nb; q++) { const o = q * BS, r = Math.hypot(X[o + 4], X[o + 5]) + MARGIN;
    for (let j = cell(X[o + 1] - r); j <= cell(X[o + 1] + r); j++) for (let i = cell(X[o] - r); i <= cell(X[o] + r); i++) f(j * NG + i, q); } };
  const cnt = new Uint32Array(NG * NG); each((c) => cnt[c]++); for (let c = 0; c < NG * NG; c++) gs[c + 1] = gs[c] + cnt[c];
  const gi = new Uint32Array(gs[NG * NG]); cnt.fill(0); each((c, q) => { gi[gs[c] + cnt[c]++] = q; });
  const stamp = new Uint32Array(nb), bstamp = new Uint32Array(n); let qid = 0;
  const cellOf = (x, z) => cell(z) * NG + cell(x);
  // roof height of box o at local z (gable ridge along local x)
  const top = (o, lz) => X[o + 6] + X[o + 7] + X[o + 8] * Math.max(0, 1 - Math.abs(lz) / X[o + 5]);

  // building whose (intact or damaged) box contains the point, grown by pad; -1 if none
  B.at = (x, y, z, pad) => {
    if (!nb) return -1; const c = cellOf(x, z);
    for (let q = gs[c]; q < gs[c + 1]; q++) { const o = gi[q] * BS, bi = X[o + 9]; if (B.st[bi] === 2) continue;
      const dx = x - X[o], dz = z - X[o + 1], lx = dx * X[o + 2] + dz * X[o + 3], lz = dz * X[o + 2] - dx * X[o + 3];
      if (Math.abs(lx) < X[o + 4] + pad && Math.abs(lz) < X[o + 5] + pad && y < top(o, lz) + pad && y > X[o + 6] - 6) return bi; }
    return -1;
  };
  // is the point on a rubble footprint (slows vehicles)?
  B.rubble = (x, z) => {
    if (!nb) return false; const c = cellOf(x, z);
    for (let q = gs[c]; q < gs[c + 1]; q++) { const o = gi[q] * BS; if (B.st[X[o + 9]] !== 2) continue;
      const dx = x - X[o], dz = z - X[o + 1], lx = dx * X[o + 2] + dz * X[o + 3], lz = dz * X[o + 2] - dx * X[o + 3];
      if (Math.abs(lx) < X[o + 4] + 1.5 && Math.abs(lz) < X[o + 5] + 1.5) return true; }
    return false;
  };
  // push a circle (radius r <= MARGIN) out of the solid boxes. out = [x, z, nx, nz, depth] (deepest contact's normal); returns the number of contacts
  B.push = (x, z, r, out) => {
    out[0] = x; out[1] = z; out[4] = 0; if (!nb) return 0; let hits = 0; const c = cellOf(x, z);
    for (let q = gs[c]; q < gs[c + 1]; q++) { const o = gi[q] * BS; if (B.st[X[o + 9]] === 2) continue;
      const ux = X[o + 2], uz = X[o + 3], hw = X[o + 4], hd = X[o + 5], dx = out[0] - X[o], dz = out[1] - X[o + 1], lx = dx * ux + dz * uz, lz = dz * ux - dx * uz;
      if (Math.abs(lx) >= hw + r || Math.abs(lz) >= hd + r) continue;
      let px = 0, pz = 0, d = 0; // push in local axes
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) { const ax = hw - Math.abs(lx), az = hd - Math.abs(lz); if (ax < az) { d = ax + r; px = lx < 0 ? -1 : 1; } else { d = az + r; pz = lz < 0 ? -1 : 1; } }
      else { const cx = lx - clamp(lx, -hw, hw), cz = lz - clamp(lz, -hd, hd), l = Math.hypot(cx, cz); if (l >= r || l < 1e-6) continue; d = r - l; px = cx / l; pz = cz / l; }
      const nx = px * ux - pz * uz, nz = px * uz + pz * ux; out[0] += nx * d; out[1] += nz * d; hits++;
      if (d > out[4]) { out[2] = nx; out[3] = nz; out[4] = d; } }
    return hits;
  };
  // first intact or damaged building along the segment: fraction of the way (2 if none); any = stop at the first hit found (line of sight)
  B.ray = (x0, y0, z0, x1, y1, z1, any) => {
    if (!nb) return 2; qid = (qid + 1) >>> 0; if (qid === 0) { stamp.fill(0); bstamp.fill(0); qid = 1; }
    const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0, L = Math.hypot(dx, dz), ns = Math.max(1, Math.ceil(L / 8)); let pc = -1, best = 2;
    for (let s = 0; s <= ns; s++) { const f = s / ns; if (f > best + 8 / Math.max(L, 1)) break; const c = cellOf(x0 + dx * f, z0 + dz * f); if (c === pc) continue; pc = c;
      for (let q = gs[c]; q < gs[c + 1]; q++) { const bq = gi[q]; if (stamp[bq] === qid) continue; stamp[bq] = qid; const o = bq * BS; if (B.st[X[o + 9]] === 2) continue;
        const ux = X[o + 2], uz = X[o + 3], hw = X[o + 4], hd = X[o + 5], ox = x0 - X[o], oz = z0 - X[o + 1];
        const lx = ox * ux + oz * uz, lz = oz * ux - ox * uz, ex = dx * ux + dz * uz, ez = dz * ux - dx * uz; let t0 = 0, t1 = 1;
        if (Math.abs(ex) < 1e-9) { if (Math.abs(lx) > hw) continue; } else { let a = (-hw - lx) / ex, b = (hw - lx) / ex; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
        if (Math.abs(ez) < 1e-9) { if (Math.abs(lz) > hd) continue; } else { let a = (-hd - lz) / ez, b = (hd - lz) / ez; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
        if (t0 > t1 || t0 >= best) continue;
        const below = (t) => y0 + dy * t < top(o, lz + ez * t); let t = -1;
        if (below(t0)) t = t0; else if (below(t1)) { let a = t0, b = t1; for (let it = 0; it < 6; it++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m; } t = b; }
        else if (X[o + 8] > 0 && below((t0 + t1) / 2)) t = (t0 + t1) / 2; // over a gable: in at one eave, out at the other
        if (t >= 0 && t < best) { best = t; if (any) return t; } } }
    return best;
  };
  B.seg = (x0, y0, z0, x1, y1, z1) => B.ray(x0, y0, z0, x1, y1, z1, true) < 1.5;

  // ---------- state changes: edit the building's range of the props vertex array ----------
  const V = mesh.v;
  const hq = (x, y, z) => hash2((Math.round(x * 10) + Math.imul(Math.round(y * 10), 7919)) | 0, Math.round(z * 10)); // same position, same value (shared corners stay shut)
  const vn = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1); return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; };
  const near = (i, x, z) => { let best = B.b0[i], bd = 1e9; // the building's box nearest to the point
    for (let q = B.b0[i]; q < B.b1[i]; q++) { const o = q * BS, dx = x - X[o], dz = z - X[o + 1], lx = dx * X[o + 2] + dz * X[o + 3], lz = dz * X[o + 2] - dx * X[o + 3], d = Math.max(Math.abs(lx) - X[o + 4], Math.abs(lz) - X[o + 5]); if (d < bd) { bd = d; best = q; } }
    return best * BS; };
  // rubble: the pile's height above the pad at local (lx, lz) of box o (a mound, highest in the middle)
  const pileH = (o) => Math.max(2.1, (X[o + 7] + X[o + 8]) * 0.4);
  const heap = (o, lx, lz, wx, wz) => { const e = Math.max(Math.abs(lx) / X[o + 4], Math.abs(lz) / X[o + 5]), m = e < 1 ? 0.3 + 0.7 * (1 - e * e) : 0.3 * Math.max(0, 1 - (e - 1) * 3.5);
    return pileH(o) * m * (0.6 + 0.4 * vn(wx * 0.35, wz * 0.35)); };
  const scorch = (m) => m === MAT.paint || m === MAT.snow || m === MAT.wood || m === MAT.plank;
  function damaged(i) {
    const seed = i * 7 + 3, sx = hash1(seed) < 0.5 ? -1 : 1, sz = hash1(seed + 1) < 0.5 ? -1 : 1, sag = 1.1 + 0.6 * hash1(seed + 5); let wv = 0;
    for (let v = B.v0[i]; v < B.v1[i]; v++) {
      const p = v * VS, x = V[p], y = V[p + 1], z = V[p + 2], m = V[p + 9], o = near(i, x, z), dx = x - X[o], dz = z - X[o + 1], lx = dx * X[o + 2] + dz * X[o + 3], lz = dz * X[o + 2] - dx * X[o + 3];
      const h = y - X[o + 6], wall = X[o + 7], rise = X[o + 8], ez = Math.abs(lz) / X[o + 5], e = Math.max(Math.abs(lx) / X[o + 4], ez);
      if (m === MAT.window) { if (hash1(seed * 31 + (wv++ >> 2)) < 0.55) { V[p + 9] = MAT.paint; V[p + 6] = 0.012; V[p + 7] = 0.012; V[p + 8] = 0.014; } continue; } // blown-out windows
      // sag: the ridge drops in the middle and one corner settles
      if (h > wall - 0.3) V[p + 1] -= (rise > 0 ? 1 - Math.min(1, ez) : 1 - Math.min(1, e)) * sag * clamp(1.15 - Math.abs(lx) / X[o + 4] * 0.5, 0, 1);
      const cr = clamp((lx * sx / X[o + 4] + lz * sz / X[o + 5] - 0.6) / 1.4, 0, 1) * clamp((h - 0.35 * wall) / (0.65 * wall), 0, 1); V[p + 1] -= cr * 1.6;
      // scorched: the charred material draws soot and burnt-through patches; the colours dull a little
      if (scorch(m)) { const k = m === MAT.snow ? 0.8 : 0.75; V[p + 6] *= k; V[p + 7] *= k * 0.97; V[p + 8] *= k * 0.93; V[p + 9] = MAT.charred; }
    }
  }
  // rubble: the intact shell sinks out of sight (wall boxes already reach 5 m below the pad); the heap itself is built from debris boxes
  function rubble(i) { for (let v = B.v0[i]; v < B.v1[i]; v++) { const p = v * VS, o = near(i, V[p], V[p + 2]); V[p + 1] = X[o + 6] - 9; V[p + 9] = MAT.rubble; } }
  // the debris pile: beams, wall slabs, roof sheets, masonry; a few wall stumps and corner posts still stand
  function debris(i, col) {
    const mb = new MB(), nb0 = B.b1[i] - B.b0[i]; let total = 0;
    for (let q = B.b0[i]; q < B.b1[i]; q++) total += X[q * BS + 4] * X[q * BS + 5] * 4;
    const N = clamp(Math.round(total / 2.2), 26, 170), sc = clamp(Math.sqrt(total) / 11, 0.8, 1.7);
    let made = 0;
    const put = (x, y, z, yaw, pit, rol, sx, sy, sz, cc) => { mb.at(x, y, z, yaw, pit, rol); mb.set(cc, MAT.rubble); mb.box(-sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2); made++; };
    // the mound: a jumble of tilted blocks over the footprint, spilling a cell beyond the walls
    for (let q = B.b0[i]; q < B.b1[i]; q++) {
      const o = q * BS, hw = X[o + 4], hd = X[o + 5], cs = clamp(Math.sqrt(total) / 5, 1.8, 3.2), nx = Math.max(1, Math.round(2 * hw / cs)), nz = Math.max(1, Math.round(2 * hd / cs)), cx = 2 * hw / nx, cz = 2 * hd / nz, th = Math.atan2(-X[o + 3], X[o + 2]);
      for (let iz = -1; iz <= nz; iz++) for (let ix = -1; ix <= nx; ix++) {
        const hs = (k) => hash1(i * 7919 + q * 131 + iz * 61 + ix * 17 + k * 3), edge = ix < 0 || iz < 0 || ix >= nx || iz >= nz;
        if (edge && hs(0) < 0.35) continue;
        const lx = -hw + (ix + 0.5) * cx + (hs(1) - 0.5) * cx * 0.9, lz = -hd + (iz + 0.5) * cz + (hs(2) - 0.5) * cz * 0.9, wx = X[o] + lx * X[o + 2] - lz * X[o + 3], wz = X[o + 1] + lx * X[o + 3] + lz * X[o + 2];
        const h = Math.max(0.35, heap(o, lx, lz, wx, wz) * (0.8 + 0.4 * hs(3))) + 0.6, r = hs(4), g = 0.65 + 0.5 * hs(5);
        const cc = r < 0.45 ? [0.2 * g, 0.19 * g, 0.18 * g] : r < 0.75 ? [RUB[0] * g * 1.4, RUB[1] * g * 1.4, RUB[2] * g * 1.4] : r < 0.9 ? [col[0] * 0.5 * g, col[1] * 0.5 * g, col[2] * 0.5 * g] : [0.36 * g, 0.35 * g, 0.34 * g];
        put(wx, X[o + 6] - 0.6 + h / 2, wz, th + hs(6) * 3.14, (hs(7) - 0.5) * 0.6, (hs(8) - 0.5) * 0.6, cx * (1.05 + 0.35 * hs(9)), h, cz * (1.05 + 0.35 * hs(10)), cc);
      }
    }
    for (let c = 0; c < N; c++) {
      const hs = (k) => hash1(i * 977 + c * 31 + k * 7 + 11);
      let o = B.b0[i] * BS; if (nb0 > 1) { let t = hs(0) * total; for (let q = B.b0[i]; q < B.b1[i]; q++) { t -= X[q * BS + 4] * X[q * BS + 5] * 4; if (t <= 0) { o = q * BS; break; } } }
      const lx = (hs(1) * 2 - 1) * X[o + 4] * 1.08, lz = (hs(2) * 2 - 1) * X[o + 5] * 1.08, wx = X[o] + lx * X[o + 2] - lz * X[o + 3], wz = X[o + 1] + lx * X[o + 3] + lz * X[o + 2];
      const hy = X[o + 6] + heap(o, lx, lz, wx, wz) * (0.85 + 0.3 * hs(12)) + 0.15, r = hs(3), g = 0.6 + 0.6 * hs(4), yaw = hs(5) * 6.283;
      if (r < 0.34) put(wx, hy, wz, yaw, (hs(8) - 0.5) * 1.3, (hs(9) - 0.5) * 0.6, (2.5 + 3.5 * hs(6)) * Math.min(sc, 1.2), 0.2 + 0.08 * hs(7), 0.22, [RUB[0] * g * 1.3, RUB[1] * g * 1.3, RUB[2] * g * 1.3]);
      else if (r < 0.62) put(wx, hy, wz, yaw, (hs(8) - 0.5) * 2.8, 0.3 + hs(9) * 1.2, (1.4 + 2.2 * hs(6)) * sc, 0.22 * sc, (0.8 + 1.5 * hs(7)) * sc, hs(10) < 0.6 ? [col[0] * 0.6 * g, col[1] * 0.6 * g, col[2] * 0.6 * g] : [GREY[0] * g, GREY[1] * g, GREY[2] * g]);
      else if (r < 0.8) { const w = 0.3 + 0.3 * g; put(wx, hy, wz, yaw, (hs(8) - 0.5) * 1.4, (hs(9) - 0.5) * 1.4, (1.8 + 2.2 * hs(6)) * sc, 0.13, (1.3 + 1.6 * hs(7)) * sc, [w, w * 0.98, w * 0.95]); }
      else { const a = (0.4 + 0.7 * hs(6)) * sc; put(wx, hy, wz, yaw, hs(9) * 0.8, hs(10) * 0.8, a, a * (0.6 + 0.5 * hs(7)), a * (0.7 + 0.6 * hs(8)), [GREY[0] * g, GREY[1] * g, GREY[2] * g]); }
    }
    // standing remains: wall stumps along the outline, charred corner posts
    for (let q = B.b0[i]; q < B.b1[i]; q++) {
      const o = q * BS, hw = X[o + 4], hd = X[o + 5], wall = X[o + 7], ns = 1 + Math.round((hw + hd) / 9);
      for (let c = 0; c < ns; c++) {
        const hs = (k) => hash1(i * 613 + q * 101 + c * 37 + k * 5 + 3), side = (hs(0) * 4) | 0, t = hs(1) * 1.6 - 0.8, al = side < 2;
        const lx = al ? t * hw : (side === 2 ? -hw : hw), lz = al ? (side === 0 ? -hd : hd) : t * hd, wx = X[o] + lx * X[o + 2] - lz * X[o + 3], wz = X[o + 1] + lx * X[o + 3] + lz * X[o + 2];
        const hgt = Math.min(wall * 0.75, 1.4 + 2.6 * hs(2)), wid = (1.4 + 2.4 * hs(3)) * Math.min(sc, 1.3), th = Math.atan2(-X[o + 3], X[o + 2]) + (al ? 0 : Math.PI / 2), g = 0.55 + 0.4 * hs(4);
        put(wx, X[o + 6] + hgt / 2 - 0.3, wz, th + (hs(5) - 0.5) * 0.2, 0, (hs(6) - 0.5) * 0.5, wid, hgt, 0.24, [col[0] * g, col[1] * g, col[2] * g]);
      }
      for (let c = 0; c < 4; c++) { const hs = (k) => hash1(i * 433 + q * 59 + c * 13 + k * 3 + 1); if (hs(0) < 0.45) continue;
        const lx = (c & 1 ? 1 : -1) * hw, lz = (c & 2 ? 1 : -1) * hd, wx = X[o] + lx * X[o + 2] - lz * X[o + 3], wz = X[o + 1] + lx * X[o + 3] + lz * X[o + 2], hgt = Math.min(wall * 0.9, 1.8 + 2.4 * hs(1));
        put(wx, X[o + 6] + hgt / 2 - 0.2, wz, hs(2) * 3, (hs(3) - 0.5) * 0.35, (hs(4) - 0.5) * 0.35, 0.26, hgt, 0.26, [RUB[0] * 1.2, RUB[1] * 1.2, RUB[2] * 1.2]); }
    }
    if (B.dHead + made > DMAX) B.dHead = 0;
    B.dv.set(mb.v, B.dHead * 24 * VS); if (B.debUpload) B.debUpload(B.dHead, made);
    B.dHead += made; B.dN = Math.min(DMAX, Math.max(B.dN, B.dHead));
  }
  // static index pattern for the debris boxes (MB.box: 6 quads of 4 vertices)
  B.di = new Uint32Array(DMAX * 36); for (let q = 0; q < DMAX * 6; q++) { const a = q * 4, o = q * 6; B.di[o] = a; B.di[o + 1] = a + 1; B.di[o + 2] = a + 2; B.di[o + 3] = a; B.di[o + 4] = a + 2; B.di[o + 5] = a + 3; }

  function show(i) {
    const a = B.v0[i] * VS, b = B.v1[i] * VS;
    if (!B.pris[i]) { B.pris[i] = V.slice(a, b); B.changed.push(i); }
    V.set(B.pris[i], a);
    if (B.st[i] === 1) damaged(i); else if (B.st[i] === 2) rubble(i);
    if (B.upload) B.upload(B.v0[i], B.v1[i]);
  }
  // damage building i; returns its new state when it changed, else -1
  B.damage = (i, d) => {
    if (i < 0 || i >= n || B.st[i] === 2 || d <= 0 || B.fix[i]) return -1; // fix: solid but not destructible (platforms, the parked trains)
    B.hp[i] = Math.max(0, B.hp[i] - d);
    const s = B.hp[i] <= 0 ? 2 : B.hp[i] < 0.5 * B.hpM[i] ? 1 : 0; if (s === B.st[i]) return -1;
    B.st[i] = s; show(i); if (s === 2) debris(i, L[i].col); if (B.onState) B.onState(i, s); return s;
  };
  // area damage (HE, drone): up to dmax at the wall, falling to 0 at radius r; skip = building already hit directly. Calls f(i, newState) on changes.
  B.splash = (x, y, z, r, dmax, skip, f) => {
    if (!nb) return; qid = (qid + 1) >>> 0; if (qid === 0) { stamp.fill(0); bstamp.fill(0); qid = 1; }
    const c0 = cell(x - r), c1 = cell(x + r), r0 = cell(z - r), r1 = cell(z + r);
    for (let j = r0; j <= r1; j++) for (let ii = c0; ii <= c1; ii++) { const c = j * NG + ii;
      for (let q = gs[c]; q < gs[c + 1]; q++) { const bq = gi[q], o = bq * BS, bi = X[o + 9]; if (bstamp[bi] === qid) continue; if (bi === skip || B.st[bi] === 2) continue;
        const dx = x - X[o], dz = z - X[o + 1], lx = dx * X[o + 2] + dz * X[o + 3], lz = dz * X[o + 2] - dx * X[o + 3];
        const ox = Math.max(0, Math.abs(lx) - X[o + 4]), oz = Math.max(0, Math.abs(lz) - X[o + 5]), oy = Math.max(0, y - top(o, lz)), d = Math.hypot(ox, oz, oy);
        if (d < r) { bstamp[bi] = qid; const s = B.damage(bi, dmax * (1 - d / r)); if (s >= 0 && f) f(bi, s); } } }
  };
  B.restore = () => {
    if (B.onState) for (const i of B.changed) B.onState(i, 0);
    for (const i of B.changed) { V.set(B.pris[i], B.v0[i] * VS); B.pris[i] = null; if (B.upload) B.upload(B.v0[i], B.v1[i]); }
    B.changed.length = 0; B.st.fill(0); B.hp.set(B.hpM); B.dN = 0; B.dHead = 0;
  };
  return B;
}
