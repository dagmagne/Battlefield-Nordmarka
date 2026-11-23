// Minimap base layer: the whole world rendered once at load into a hidden canvas at the minimap's own pixel scale
// (relief shading, forest, water, bog, parking lots, ski trails, roads, buildings, the playable border), so a map
// update is one integer-aligned drawImage of the window around the player plus the dynamic markers on top.
// Building damage repaints just that building (B.onState, a rare event).
export const MAP_M = 2400, MAP_PX = 464; // metres across the minimap, backing pixels (CSS shows it at 232 px on desktop, so 2x for Retina)

// kOpt: pixels per metre (default the minimap's); the large map view builds a second, sharper copy on first use (a rare event)
export function initMinimap(W, B, HALF, kOpt) {
  if (typeof document === 'undefined') return null;
  const k = kOpt || MAP_PX / MAP_M, ls = k / (MAP_PX / MAP_M), N = Math.ceil(2 * HALF * k), HN = W.HN, TEX = 2 * HALF / HN, real = W.name !== 'fantasy';
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'); if (!c) return null;
  const mat = W.mat, nrm = W.nrm, PLAY = W.PLAY;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---- raster layer: relief + forest + water + bog, averaged over the texels under each map pixel ----
  const img = c.createImageData(N, N), d = img.data, Lx = -0.55, Ly = 0.62, Lz = -0.55; // light from the north-west (z is south)
  for (let py = 0; py < N; py++) {
    const z = (py + 0.5) / k - HALF, tj = Math.round((z + HALF) / TEX - 0.5);
    for (let px = 0; px < N; px++) {
      const x = (px + 0.5) / k - HALF, ti = Math.round((x + HALF) / TEX - 0.5);
      let wa = 0, cr = 0, bg = 0, sh = 0, ck = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = Math.min(HN - 1, Math.max(0, ti + di)), j = Math.min(HN - 1, Math.max(0, tj + dj)), q = (j * HN + i) * 4;
        wa += mat[q]; if (!real && mat[q + 1] > ck) ck = mat[q + 1]; cr += nrm[q + 2]; bg += mat[q + 2];
        const nx = nrm[q] / 127.5 - 1, nz = nrm[q + 1] / 127.5 - 1, ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
        sh += nx * Lx + ny * Ly + nz * Lz - Ly; n++;
      }
      wa /= n * 255; cr /= n * 255; bg /= n * 255; sh /= n;
      const f = sm(0.05, 0.6, cr), w = Math.max(sm(0.35, 0.6, wa), 0.85 * sm(120, 220, ck)), b = sm(0.2, 0.7, bg) * 0.5, s = Math.max(0.6, Math.min(1.5, 1 + 1.9 * sh));
      let r = (50 + (27 - 50) * f + (48 - 50) * b) * s, g = (61 + (60 - 61) * f + (68 - 61) * b) * s, bl = (76 + (48 - 76) * f + (72 - 76) * b) * s;
      r += (44 - r) * w; g += (92 - g) * w; bl += (138 - bl) * w;
      const out = W.inP(x, z) ? 1 : 0.45, o = (py * N + px) * 4;
      d[o] = r * out; d[o + 1] = g * out; d[o + 2] = bl * out; d[o + 3] = 228;
    }
  }
  c.putImageData(img, 0, 0);
  const X = (x) => (x + HALF) * k;
  c.lineJoin = c.lineCap = 'round';

  // ---- parking lots ----
  if (W.parks) { c.fillStyle = '#616a74'; for (const p of W.parks) { c.beginPath(); for (let i = 0; i < p.px.length; i++) c.lineTo(X(p.px[i]), X(p.pz[i])); c.closePath(); c.fill(); } }
  // ---- ski trails: dashed pale blue ----
  const line = (pts, n) => { c.beginPath(); for (let i = 0; i < n; i++) c.lineTo(X(pts[i * 2]), X(pts[i * 2 + 1])); c.stroke(); };
  c.setLineDash([3.5 * ls, 2.5 * ls]); c.strokeStyle = real ? '#8fb8e088' : '#a8cdf0d0'; c.lineWidth = (real ? 1.1 : 1.5) * ls;
  for (const t of W.trails) line(t.pts, t.pts.length >> 1);
  c.setLineDash([]);
  // ---- roads: dark casing, then the fill; streets and service roads (cls >= 4) thin and dim, wide roads brighter and wider ----
  if (W.mapRoads) {
    const tier = (r) => (r.cls >= 4 ? 0 : r.hw >= 3.2 ? 2 : 1), CW = [2.3, 3.6, 5], FW = [1.05, 1.9, 3], FC = ['#8d897f', '#b4aea0', '#f3eee2'];
    for (let t = 0; t < 3; t++) { c.strokeStyle = t ? '#0c1218e0' : '#0c121890'; for (const r of W.mapRoads) if (tier(r) === t) { c.lineWidth = CW[t] * ls; line(r.pts, r.pts.length >> 1); } }
    for (let t = 0; t < 3; t++) { c.strokeStyle = FC[t]; for (const r of W.mapRoads) if (tier(r) === t) { c.lineWidth = FW[t] * ls; line(r.pts, r.pts.length >> 1); } }
  }
  // ---- Holmenkollbanen: dark casing with white dashes, platforms, station rings; names on the large map ----
  if (W.rail) {
    const R = W.rail, tl = (t) => { c.beginPath(); for (let i = 0; i < t.n; i++) c.lineTo(X(t.x[i]), X(t.z[i])); c.stroke(); }, dashed = [];
    for (const t of R.tr.slice().sort((a, b) => b.n - a.n)) { const m = t.n >> 1; if (!dashed.some((u) => { for (let k = 0; k < u.n; k += 3) if (Math.hypot(u.x[k] - t.x[m], u.z[k] - t.z[m]) < 8) return true; return false; })) dashed.push(t); } // one dash pattern per double track
    c.strokeStyle = '#15171cf0'; c.lineWidth = 3.6 * ls; for (const t of R.tr) tl(t);
    c.strokeStyle = '#eceef0'; c.lineWidth = 1.7 * ls; c.setLineDash([4.5 * ls, 4.5 * ls]); for (const t of dashed) tl(t); c.setLineDash([]);
    for (const S of R.st) for (const Q of S.p) { const ax = Math.sin(Q.yaw), az = Math.cos(Q.yaw); c.setTransform(az * k, -ax * k, ax * k, az * k, X(Q.x), X(Q.z)); c.fillStyle = '#d9d4c8'; c.fillRect(-Math.max(Q.hw, 2.2), -Q.hl, 2 * Math.max(Q.hw, 2.2), 2 * Q.hl); }
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const S of R.st) { c.beginPath(); c.arc(X(S.x), X(S.z), 3.2 * ls, 0, 6.2832); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.4 * ls; c.strokeStyle = '#1a3f9a'; c.stroke(); }
    if (ls > 1.4) { c.font = `600 ${Math.round(8.5 * ls)}px system-ui, sans-serif`; c.textBaseline = 'middle'; c.lineWidth = 2.5 * ls; c.strokeStyle = '#101418d0'; c.fillStyle = '#dfe8ff';
      for (const S of R.st) { c.strokeText(S.name, X(S.x) + 5 * ls, X(S.z) - 4 * ls); c.fillText(S.name, X(S.x) + 5 * ls, X(S.z) - 4 * ls); } }
  }
  // ---- functional bridges (src/bridges.js): the deck covers the road under it; the over-route redrawn across it, the parapets as a dark casing with short ticks at the ends ----
  if (W.br && W.br.n) for (const Bq of W.br.list) {
    const ux = Bq.u[0], uz = Bq.u[1], P = /** @type {(lu: number, lv: number) => [number, number]} */ ((lu, lv) => [X(Bq.c[0] + ux * lu - uz * lv), X(Bq.c[1] + uz * lu + ux * lv)]), hl = Bq.hl, hw = Bq.hw - 0.3, t = 3.5;
    c.beginPath(); for (const [a, e] of [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]) c.lineTo(...P(a, e)); c.closePath(); c.fillStyle = '#c9d2dc'; c.fill();
    c.save(); c.clip(); c.setLineDash([3.5 * ls, 2.5 * ls]); c.strokeStyle = '#6d93ba'; c.lineWidth = 1.4 * ls; for (const tr of W.trails) line(tr.pts, tr.pts.length >> 1); c.restore(); c.setLineDash([]);
    c.strokeStyle = '#0c1218f0'; c.lineWidth = 1.5 * ls;
    for (const sv of [-1, 1]) { c.beginPath(); c.moveTo(...P(-hl - t, sv * (hw + t))); c.lineTo(...P(-hl, sv * hw)); c.lineTo(...P(hl, sv * hw)); c.lineTo(...P(hl + t, sv * (hw + t))); c.stroke(); }
  }
  // ---- fantasy set pieces: dam, bridge, cabin ----
  if (!real) {
    c.fillStyle = '#c9c2b2';
    for (const p of [W.dam, W.bridge, W.cabin]) if (p) { c.save(); c.translate(X(p.x), X(p.z)); c.rotate(-(p.yaw || 0)); const L = p === W.bridge ? (p.len || 26) : p === W.dam ? 30 : 10; c.fillRect(-1.6 * ls, -L * k / 2, 3.2 * ls, L * k); c.restore(); }
  }
  // ---- buildings (repainted on damage) ----
  const COL = ['#e2d2ad', '#b07a52', '#7a3a26'];
  const paint = (i, s) => {
    if (B.fix && B.fix[i]) return; // platforms and trains: drawn with the railway
    const bx = B.box; c.fillStyle = COL[s];
    for (let q = B.b0[i]; q < B.b1[i]; q++) { const o = q * 10, ux = bx[o + 2], uz = bx[o + 3], hw = Math.max(bx[o + 4], 2.6), hd = Math.max(bx[o + 5], 2.6);
      c.setTransform(ux * k, uz * k, -uz * k, ux * k, X(bx[o]), X(bx[o + 1])); c.fillRect(-hw, -hd, 2 * hw, 2 * hd); }
    c.setTransform(1, 0, 0, 1, 0, 0);
  };
  if (B && B.n) { for (let i = 0; i < B.n; i++) paint(i, 0); const prev = B.onState; B.onState = prev ? (i, s) => { prev(i, s); paint(i, s); } : paint; } // a second map copy chains onto the first
  // ---- playable border ----
  c.strokeStyle = '#ffcf5ac0'; c.lineWidth = 2 * ls; c.setLineDash([7 * ls, 4 * ls]); c.strokeRect(X(W.PB[0]), X(W.PB[1]), (W.PB[2] - W.PB[0]) * k, (W.PB[3] - W.PB[1]) * k); c.setLineDash([]);

  // blit the MAP_PX window centred as close as possible to (x, z) at an integer offset; returns nothing, sets M.cx/M.cz to the true centre
  const M = { k, cx: 0, cz: 0 };
  M.draw = (dc, x, z) => {
    const sx = Math.round(X(x) - MAP_PX / 2), sy = Math.round(X(z) - MAP_PX / 2);
    M.cx = (sx + MAP_PX / 2) / k - HALF; M.cz = (sy + MAP_PX / 2) / k - HALF;
    dc.clearRect(0, 0, MAP_PX, MAP_PX);
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(N, sx + MAP_PX), y1 = Math.min(N, sy + MAP_PX); // clip the source rect by hand (Safari draws nothing for out-of-range ones)
    if (x1 > x0 && y1 > y0) dc.drawImage(cv, x0, y0, x1 - x0, y1 - y0, x0 - sx, y0 - sy, x1 - x0, y1 - y0);
  };
  // the large map: the world square [wx0, wx0 + m] × [wz0, wz0 + m] scaled into (0, 0, w, h) of dc
  M.rect = (dc, wx0, wz0, m, w, h) => { dc.clearRect(0, 0, w, h); const sx = X(wx0), sy = X(wz0), sm = m * k; dc.drawImage(cv, Math.max(0, sx), Math.max(0, sy), Math.min(N, sx + sm) - Math.max(0, sx), Math.min(N, sy + sm) - Math.max(0, sy), Math.max(0, -sx) / sm * w, Math.max(0, -sy) / sm * h, (Math.min(N, sx + sm) - Math.max(0, sx)) / sm * w, (Math.min(N, sy + sm) - Math.max(0, sy)) / sm * h); };
  return M;
}
