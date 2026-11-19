// Functional bridges: crossings where one route passes over another and both levels work. The heightfield stays the lower level
// (the road under the deck, in a trench); each deck is an overlay slab and the walls are oriented boxes that block only at their own
// height. Nothing here goes into W.colliders or W.bld (both are 2-D and would block both levels). Every ground query takes the querier's
// own height: a querier at y >= top - STEP stands on the deck, one lower is under it.
// Bridge records (W.brg, from tools/geo/bridges.py via world.js): c centre, u axis (along the over-route), hl, hw, deck top y0 + gu lu + gv lv,
// th slab thickness, tr trench [ta, tb] in lu, road under it r0 + rg lv; v = (-uz, ux) runs along the under-route.
// Built once into typed arrays; the queries allocate nothing.
export const STEP = 1.0, DS = 10, WS = 9;

export function initBridges(list, heightAt) {
  const nb = list.length, walls = [];
  const DK = new Float32Array(Math.max(1, nb) * DS), BB = new Float32Array(Math.max(1, nb) * 4).fill(0), GB = [1e9, 1e9, -1e9, -1e9, 1e9, -1e9]; // per-bridge xz AABB; global x0 z0 x1 z1 y0 y1
  // a wall: centre (lu, lv) in the bridge frame, along u (al = 0) or v (al = 1), half-length, half-thickness, bottom / top at its centre, slope along its axis
  const wall = (i, B, kind, lu, lv, al, hl, hw, yb, yt, g) => { const ux = B.u[0], uz = B.u[1], vx = -uz, vz = ux;
    walls.push([i, kind, B.c[0] + ux * lu + vx * lv, B.c[1] + uz * lu + vz * lv, al ? vx : ux, al ? vz : uz, hl, hw, yb, yt, g]); };
  for (let i = 0; i < nb; i++) {
    const B = list[i], o = i * DS, top = (lu, lv) => B.y0 + B.gu * lu + B.gv * lv, road = (lv) => B.r0 + B.rg * lv, [ta, tb] = B.tr, hl = B.hl, hw = B.hw;
    DK[o] = B.c[0]; DK[o + 1] = B.c[1]; DK[o + 2] = B.u[0]; DK[o + 3] = B.u[1]; DK[o + 4] = hl; DK[o + 5] = hw; DK[o + 6] = B.y0; DK[o + 7] = B.gu; DK[o + 8] = B.gv; DK[o + 9] = B.th;
    // abutments at the trench sides, from below the road to the slab bottom (they block only trench traffic)
    for (const [e, s] of [[ta, -1], [tb, 1]]) { const lu = e + s * 0.45, sl = B.gv, yt = top(lu, 0) - B.th, yb = Math.min(road(0) - 1.2, yt - 2) - Math.abs(B.rg - sl) * hw;
      wall(i, B, 0, lu, 0, 1, hw, 0.45, yb, yt, sl); }
    // faces outside the trench (the portal headwalls under the fascia), parapets on the deck edges (they block only deck traffic)
    for (const s of [-1, 1]) { const lv = s * (hw - 0.3);
      for (const [a, b] of [[-hl, ta - 0.9], [tb + 0.9, hl]]) if (b - a > 0.5) { const m = (a + b) / 2, h = (b - a) / 2, yt = top(m, lv) - B.th; wall(i, B, 1, m, lv, 0, h, 0.3, Math.min(road(lv) - 1.5, yt - 2) - Math.abs(B.gu) * h, yt, B.gu); }
      const pv = s * (hw - 0.2), ty = top(0, pv); wall(i, B, 2, 0, pv, 0, hl, 0.2, ty - 0.2, ty + 1.1, B.gu); }
    // wing walls beside the trench outside each face, where the ground beside the trench mouth stands over the road: 9 m long, the top falling
    // from the slab bottom to the ground level at the far end (never below 0.8 m over the road)
    B.wings = [];
    for (const [e, s] of [[ta, -1], [tb, 1]]) for (const f of [-1, 1]) {
      const lu = e + s * 0.45, L = 9, ux = B.u[0], uz = B.u[1], gh = (lv) => heightAt(B.c[0] + ux * (lu + s * 2) - uz * lv, B.c[1] + uz * (lu + s * 2) + ux * lv);
      const hF = gh(f * (hw + 2)), hE = gh(f * (hw + L)); if (Math.max(hF, hE) < road(f * (hw + 2)) + 1.2) continue;
      const y0 = top(lu, f * hw) - B.th, y1 = Math.min(y0 - 0.5, Math.max(road(f * (hw + L)) + 0.8, hE + 0.15)), g = (y1 - y0) / L * f, cv = f * (hw + L / 2), yt = (y0 + y1) / 2;
      wall(i, B, 3, lu, cv, 1, L / 2, 0.45, Math.min(road(cv) - 1.2, yt - 2) - Math.abs(g - B.rg) * L / 2, yt, g); B.wings.push([lu, f, L]); }
  }
  const nw = walls.length, WL = new Float32Array(Math.max(1, nw) * WS), WB = new Int16Array(Math.max(1, nw)), WK = new Uint8Array(Math.max(1, nw)); // WK: 0 abutment, 1 portal face, 2 parapet, 3 wing wall
  walls.forEach((w, k) => { WB[k] = w[0]; WK[k] = w[1]; for (let q = 0; q < WS; q++) WL[k * WS + q] = w[q + 2]; });
  // AABBs: the slab and every wall of a bridge, in xz; the global box also holds the y range (for segments)
  const grow = (i, x, z, y0, y1) => { const o = i * 4; if (x < BB[o]) BB[o] = x; if (z < BB[o + 1]) BB[o + 1] = z; if (x > BB[o + 2]) BB[o + 2] = x; if (z > BB[o + 3]) BB[o + 3] = z;
    if (x < GB[0]) GB[0] = x; if (z < GB[1]) GB[1] = z; if (x > GB[2]) GB[2] = x; if (z > GB[3]) GB[3] = z; if (y0 < GB[4]) GB[4] = y0; if (y1 > GB[5]) GB[5] = y1; };
  for (let i = 0; i < nb; i++) { const o = i * 4; BB[o] = BB[o + 1] = 1e9; BB[o + 2] = BB[o + 3] = -1e9; }
  for (let i = 0; i < nb; i++) { const o = i * DS, ux = DK[o + 2], uz = DK[o + 3];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const lu = a * DK[o + 4], lv = b * DK[o + 5], t = DK[o + 6] + DK[o + 7] * lu + DK[o + 8] * lv; grow(i, DK[o] + ux * lu - uz * lv, DK[o + 1] + uz * lu + ux * lv, t - DK[o + 9], t); } }
  for (let k = 0; k < nw; k++) { const o = k * WS, ax = WL[o + 2], az = WL[o + 3];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const l = a * WL[o + 4], m = b * WL[o + 5]; grow(WB[k], WL[o] + ax * l - az * m, WL[o + 1] + az * l + ax * m, WL[o + 6] + WL[o + 8] * l, WL[o + 7] + WL[o + 8] * l); } }
  const inBB = (i, x, z, p) => { const o = i * 4; return x >= BB[o] - p && x <= BB[o + 2] + p && z >= BB[o + 1] - p && z <= BB[o + 3] + p; };
  const away = (x, z, p) => !nb || x < GB[0] - p || x > GB[2] + p || z < GB[1] - p || z > GB[3] + p;

  const R = { n: nb, nw, DK, WL, WB, WK, BB, GB, list, STEP };
  // highest deck top the querier at y stands on or above (-1e9: none)
  R.top = (x, z, y) => { let best = -1e9; if (away(x, z, 0)) return best;
    for (let i = 0; i < nb; i++) { if (!inBB(i, x, z, 0)) continue; const o = i * DS, dx = x - DK[o], dz = z - DK[o + 1], lu = dx * DK[o + 2] + dz * DK[o + 3], lv = dz * DK[o + 2] - dx * DK[o + 3];
      if (Math.abs(lu) > DK[o + 4] || Math.abs(lv) > DK[o + 5]) continue; const t = DK[o + 6] + DK[o + 7] * lu + DK[o + 8] * lv; if (y >= t - STEP && t > best) best = t; }
    return best; };
  R.groundAt = (x, z, y) => { const h = heightAt(x, z); if (away(x, z, 0)) return h; const t = R.top(x, z, y); return t > h ? t : h; };
  // lowest slab bottom above y (1e9: open sky)
  R.over = (x, z, y) => { let best = 1e9; if (away(x, z, 0)) return best;
    for (let i = 0; i < nb; i++) { if (!inBB(i, x, z, 0)) continue; const o = i * DS, dx = x - DK[o], dz = z - DK[o + 1], lu = dx * DK[o + 2] + dz * DK[o + 3], lv = dz * DK[o + 2] - dx * DK[o + 3];
      if (Math.abs(lu) > DK[o + 4] || Math.abs(lv) > DK[o + 5]) continue; const b = DK[o + 6] + DK[o + 7] * lu + DK[o + 8] * lv - DK[o + 9]; if (b > y && b < best) best = b; }
    return best; };
  // bridge whose slab or a wall contains the point (-1: none)
  R.inSolid = (x, y, z) => { if (away(x, z, 0) || y < GB[4] || y > GB[5]) return -1;
    for (let i = 0; i < nb; i++) { if (!inBB(i, x, z, 0)) continue; const o = i * DS, dx = x - DK[o], dz = z - DK[o + 1], lu = dx * DK[o + 2] + dz * DK[o + 3], lv = dz * DK[o + 2] - dx * DK[o + 3];
      if (Math.abs(lu) <= DK[o + 4] && Math.abs(lv) <= DK[o + 5]) { const t = DK[o + 6] + DK[o + 7] * lu + DK[o + 8] * lv; if (y <= t && y >= t - DK[o + 9]) return i; } }
    for (let k = 0; k < nw; k++) { const o = k * WS, dx = x - WL[o], dz = z - WL[o + 1], l = dx * WL[o + 2] + dz * WL[o + 3], m = dz * WL[o + 2] - dx * WL[o + 3];
      if (Math.abs(l) <= WL[o + 4] && Math.abs(m) <= WL[o + 5] && y >= WL[o + 6] + WL[o + 8] * l && y <= WL[o + 7] + WL[o + 8] * l) return WB[k]; }
    return -1; };
  // a sheared box (|l| <= hl, |m| <= hw, yb <= y - gl l - gm m <= yt) against the segment p0 + (p1 - p0) t: entry fraction, or 2
  const box = (cx, cz, ax, az, hl, hw, yb, yt, gl, gm, x0, y0, z0, ex, ey, ez) => {
    const dx = x0 - cx, dz = z0 - cz, l0 = dx * ax + dz * az, m0 = dz * ax - dx * az, el = ex * ax + ez * az, em = ez * ax - ex * az, h0 = y0 - gl * l0 - gm * m0, eh = ey - gl * el - gm * em;
    let t0 = 0, t1 = 1;
    if (Math.abs(el) < 1e-12) { if (Math.abs(l0) > hl) return 2; } else { let a = (-hl - l0) / el, b = (hl - l0) / el; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; }
    if (Math.abs(em) < 1e-12) { if (Math.abs(m0) > hw) return 2; } else { let a = (-hw - m0) / em, b = (hw - m0) / em; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; }
    if (Math.abs(eh) < 1e-12) { if (h0 < yb || h0 > yt) return 2; } else { let a = (yb - h0) / eh, b = (yt - h0) / eh; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; }
    return t0;
  };
  // first entry into any slab or wall along the segment: fraction 0..1 (0 when it starts inside), 2 if none
  R.seg = (x0, y0, z0, x1, y1, z1) => { if (!nb) return 2;
    if (Math.max(x0, x1) < GB[0] || Math.min(x0, x1) > GB[2] || Math.max(z0, z1) < GB[1] || Math.min(z0, z1) > GB[3] || Math.max(y0, y1) < GB[4] || Math.min(y0, y1) > GB[5]) return 2;
    const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0; let best = 2;
    for (let i = 0; i < nb; i++) { const b = i * 4; if (Math.max(x0, x1) < BB[b] || Math.min(x0, x1) > BB[b + 2] || Math.max(z0, z1) < BB[b + 1] || Math.min(z0, z1) > BB[b + 3]) continue;
      const o = i * DS, t = box(DK[o], DK[o + 1], DK[o + 2], DK[o + 3], DK[o + 4], DK[o + 5], DK[o + 6] - DK[o + 9], DK[o + 6], DK[o + 7], DK[o + 8], x0, y0, z0, ex, ey, ez); if (t < best) best = t;
      for (let k = 0; k < nw; k++) { if (WB[k] !== i) continue; const q = k * WS, s = box(WL[q], WL[q + 1], WL[q + 2], WL[q + 3], WL[q + 4], WL[q + 5], WL[q + 6], WL[q + 7], WL[q + 8], 0, x0, y0, z0, ex, ey, ez); if (s < best) best = s; } }
    return best; };
  // push a circle (radius r) at height y (a vehicle's ground level) out of the walls whose span overlaps [y + 0.3, y + 2.5]; out = [x, z, nx, nz, depth] like the buildings' push
  R.push = (x, z, y, r, out) => { out[0] = x; out[1] = z; out[4] = 0; if (away(x, z, r + 1)) return 0; let hits = 0;
    for (let k = 0; k < nw; k++) { if (!inBB(WB[k], out[0], out[1], r + 1)) continue; const o = k * WS, ux = WL[o + 2], uz = WL[o + 3], hl = WL[o + 4], hw = WL[o + 5], dx = out[0] - WL[o], dz = out[1] - WL[o + 1], lx = dx * ux + dz * uz, lz = dz * ux - dx * uz;
      if (Math.abs(lx) >= hl + r || Math.abs(lz) >= hw + r) continue;
      const lc = lx < -hl ? -hl : lx > hl ? hl : lx, yb = WL[o + 6] + WL[o + 8] * lc, yt = WL[o + 7] + WL[o + 8] * lc; if (yt < y + 0.3 || yb > y + 2.5) continue;
      let px = 0, pz = 0, d = 0;
      if (Math.abs(lx) < hl && Math.abs(lz) < hw) { const a = hl - Math.abs(lx), b = hw - Math.abs(lz); if (a < b) { d = a + r; px = lx < 0 ? -1 : 1; } else { d = b + r; pz = lz < 0 ? -1 : 1; } }
      else { const cx = lx - lc, cz = lz - (lz < -hw ? -hw : lz > hw ? hw : lz), l = Math.hypot(cx, cz); if (l >= r || l < 1e-6) continue; d = r - l; px = cx / l; pz = cz / l; }
      const nx = px * ux - pz * uz, nz = px * uz + pz * ux; out[0] += nx * d; out[1] += nz * d; hits++;
      if (d > out[4]) { out[2] = nx; out[3] = nz; out[4] = d; } }
    return hits; };
  // bridge whose slab footprint grown by pad contains the point (-1: none): spawn, mine, lamp and tree rejections
  R.id = (x, z, pad) => { if (away(x, z, pad)) return -1;
    for (let i = 0; i < nb; i++) { const o = i * DS, dx = x - DK[o], dz = z - DK[o + 1], lu = dx * DK[o + 2] + dz * DK[o + 3], lv = dz * DK[o + 2] - dx * DK[o + 3]; if (Math.abs(lu) <= DK[o + 4] + pad && Math.abs(lv) <= DK[o + 5] + pad) return i; }
    return -1; };
  // the road under a deck reads as shaded: canopy density (nrm B) in the trench, which the terrain shader turns into less sky light and, beyond the cascades, less sun
  R.shade = (nrm, HN, HALF) => { const T = 2 * HALF / HN;
    for (let i = 0; i < nb; i++) { const B = list[i], o = i * 4;
      for (let j = Math.max(0, Math.floor((BB[o + 1] + HALF) / T)); j <= Math.min(HN - 1, Math.ceil((BB[o + 3] + HALF) / T)); j++) for (let q = Math.max(0, Math.floor((BB[o] + HALF) / T)); q <= Math.min(HN - 1, Math.ceil((BB[o + 2] + HALF) / T)); q++) {
        const dx = (q + 0.5) * T - HALF - B.c[0], dz = (j + 0.5) * T - HALF - B.c[1], lu = dx * B.u[0] + dz * B.u[1], lv = dz * B.u[0] - dx * B.u[1];
        if (lu < B.tr[0] - 1 || lu > B.tr[1] + 1 || Math.abs(lv) > B.hw + 3) continue; const k = (j * HN + q) * 4 + 2, w = 1 - Math.max(0, Math.abs(lv) - B.hw + 3) / 6;
        nrm[k] = Math.max(nrm[k], Math.round(110 * w)); } } };
  return R;
}
