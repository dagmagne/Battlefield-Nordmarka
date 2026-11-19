"""Functional bridges: measure the two ski bridges over Holmenkollveien at the arena from the lidar and write meta['bridges'].

Run from tools/geo with the venv:  .venv/bin/python bridges.py   (needs raw/dtm1.npy, raw/dom1.npy from fetch_hoyde.py)

Per crossing (the road segment under it is one of meta['tunnels']):
  v = along the road (the under-route), u = across it (the over-route); the slab is centred on c, |lu| <= hl, |lv| <= hw.
  - the lower level: the road grade fitted on the DTM along the road centre OUTSIDE both deck faces. Under a removed bridge deck
    the DTM holds a smooth interpolated fill (no ground points there), not the road and not earth, so it cannot be used.
  - the deck extent along the road: where the surface model stands more than 3 m over that grade on the road centre line.
  - the cavity across the road: where the DOM stands over the DTM (the fill) on rows inside the deck; the slab spans it plus 1.5 m
    bearings, and at least 7 m past the trench sides. The trench (the open road under the deck) is the road plus 4 m either side, clipped to the cavity; outside it the
    game keeps earth under the slab.
  - the deck plane: robust least squares on the DOM over the slab core. Slab thickness TH.
meta['bridges'] = [{name, tun, c: [x, z], u: [ux, uz], hl, hw, y0, gu, gv, th, tr: [ta, tb], r0, rg, clr}], where the deck top is
y0 + gu * lu + gv * lv, the trench is ta <= lu <= tb, the road under it r0 + rg * lv, and v = (-uz, ux).
"""
import math, numpy as np, pack

TH = 1.1          # slab thickness (assumed; the lidar sees only the top)
ROAD_M = 4.0      # trench margin either side of the asphalt
dtm = np.load('raw/dtm1.npy', mmap_mode='r'); dom = np.load('raw/dom1.npy', mmap_mode='r')

def s(A, x, z):
    fx, fz = x + 2048, z + 2048; i, j = int(math.floor(fx)), int(math.floor(fz)); a, b = fx - i, fz - j
    return float((A[j, i] * (1 - a) + A[j, i + 1] * a) * (1 - b) + (A[j + 1, i] * (1 - a) + A[j + 1, i + 1] * a) * b)

meta, blobs = pack.load()
road_hw = 3.5   # Holmenkollveien: 7 m asphalt (meta.roads width)
NAMES = ['Holmenkollveien under the stadium bridge', 'Holmenkollveien under the lower ski bridge']
out, rows = [], []
for k, (ax, az, bx, bz) in enumerate(meta['tunnels']):
    L = math.hypot(bx - ax, bz - az); vx, vz = (bx - ax) / L, (bz - az) / L; ux, uz = vz, -vx   # v = (-uz, ux)
    mx, mz = (ax + bx) / 2, (az + bz) / 2
    P = lambda d, t: (mx + vx * d + ux * t, mz + vz * d + uz * t)
    # road grade outside both ends (iterated once with the measured deck extent)
    d0, d1 = -L / 2, L / 2
    for it in range(2):
        ds = [d for d in np.arange(-60, 60.1, 1.0) if (d < d0 - 4 and d > d0 - 25) or (d > d1 + 4 and d < d1 + 25)]
        hs = [s(dtm, *P(d, 0)) for d in ds]; rg, ra = np.polyfit(ds, hs, 1); res = np.array(hs) - (ra + rg * np.array(ds))
        on = [d for d in np.arange(-40, 40.01, 0.5) if s(dom, *P(d, 0)) - (ra + rg * d) > 3.0]
        cen = min(on, key=abs); lo = hi = cen   # the contiguous run round the middle
        while lo - 0.5 in on: lo -= 0.5
        while hi + 0.5 in on: hi += 0.5
        d0, d1 = lo - 0.25, hi + 0.25
    # cavity across the road: DOM over the DTM fill, per row inside the deck; the median extent
    ex = []
    for d in np.arange(d0 + 3, d1 - 2.9, 2.0):
        on = [t for t in np.arange(-45, 45.01, 0.5) if s(dom, *P(d, t)) - s(dtm, *P(d, t)) > 0.4]
        if not on: continue
        lo = hi = min(on, key=abs)
        while lo - 0.5 in on: lo -= 0.5
        while hi + 0.5 in on: hi += 0.5
        ex.append((lo, hi))
    sa, sb = float(np.median([e[0] for e in ex])), float(np.median([e[1] for e in ex]))
    ta, tb = max(sa, -(road_hw + ROAD_M)), min(sb, road_hw + ROAD_M)
    # the slab reaches at least 7 m past the trench: the game keeps the road level 3 m behind the abutments and steps the ground up under
    # the slab, and a hull corner just past a slab end must not reach a road-level texel through the 2 m bilinear grid
    u0, u1 = min(sa - 1.5, ta - 7), max(sb + 1.5, tb + 7); uc = (u0 + u1) / 2; dc = (d0 + d1) / 2; hl = (u1 - u0) / 2; hw = (d1 - d0) / 2
    cx, cz = P(dc, uc)
    # deck plane on the DOM over the slab core (robust: drop parapets, snow piles, cables)
    pts = np.array([(t - uc, d - dc, s(dom, *P(d, t))) for d in np.arange(d0 + 1.5, d1 - 1.4, 1.0) for t in np.arange(u0 + 1, u1 - 0.9, 1.0)])
    keep = np.ones(len(pts), bool)
    for it in range(4):
        A = np.c_[np.ones(keep.sum()), pts[keep, 0], pts[keep, 1]]; cf = np.linalg.lstsq(A, pts[keep, 2], rcond=None)[0]
        r = pts[:, 2] - (cf[0] + cf[1] * pts[:, 0] + cf[2] * pts[:, 1]); keep = np.abs(r) < max(0.35, 2.5 * np.std(r[keep]))
    y0, gu, gv = (float(v) for v in cf); rms = float(np.sqrt((r[keep] ** 2).mean()))
    r0 = float(ra + rg * dc)
    clr = min(y0 + gu * a + gv * b - TH - (r0 + rg * b) for a in (ta - uc, tb - uc) for b in (-hw, hw))
    over = []
    tb_ = blobs['trails']; o = 0
    for ti, (nn, lit, name) in enumerate(meta['trails']):
        q = [(int.from_bytes(tb_[o + 4 * i:o + 4 * i + 2], 'little', signed=True) / 8, int.from_bytes(tb_[o + 4 * i + 2:o + 4 * i + 4], 'little', signed=True) / 8) for i in range(nn)]; o += 4 * nn
        for (x0, z0), (x1, z1) in zip(q, q[1:]):
            l0 = ((x0 - cx) * ux + (z0 - cz) * uz, -(x0 - cx) * uz + (z0 - cz) * ux); l1 = ((x1 - cx) * ux + (z1 - cz) * uz, -(x1 - cx) * uz + (z1 - cz) * ux)
            if abs(l0[1]) < hw + 2 and abs(l1[1]) < hw + 2 and (l0[0] - (ta - uc)) * (l1[0] - (ta - uc)) < 0:
                ang = math.degrees(math.acos(min(1, abs((x1 - x0) * vx + (z1 - z0) * vz) / math.hypot(x1 - x0, z1 - z0)))); over.append(f'trail {ti}{" (lit)" if lit else ""} at {ang:.0f} deg'); break
    rec = {'name': NAMES[k] if k < len(NAMES) else f'bridge {k}', 'tun': k, 'c': [round(cx, 2), round(cz, 2)], 'u': [round(ux, 5), round(uz, 5)], 'hl': round(hl, 2), 'hw': round(hw, 2),
           'y0': round(y0, 2), 'gu': round(gu, 4), 'gv': round(gv, 4), 'th': TH, 'tr': [round(ta - uc, 2), round(tb - uc, 2)], 'r0': round(r0, 2), 'rg': round(float(rg), 4), 'clr': round(clr, 2)}
    out.append(rec)
    rows.append((rec, float(np.sqrt((res ** 2).mean())), rms, sa, sb, d0, d1, over))

print(f'{"site":4s} {"centre x, z":>16s} {"yaw":>6s} {"slab u x v":>12s} {"deck top":>9s} {"gu":>7s} {"gv":>7s} {"road r0 + rg v":>17s} {"trench u":>14s} {"clear":>6s}  fit rms (road, deck)  cavity u  deck v  over')
for i, (r, rr, dr, sa, sb, d0, d1, over) in enumerate(rows):
    print(f'{i + 1:<4d} {r["c"][0]:7.1f} {r["c"][1]:8.1f} {math.degrees(math.atan2(r["u"][0], r["u"][1])):6.1f} {2 * r["hl"]:5.1f} x {2 * r["hw"]:4.1f} {r["y0"]:9.2f} {r["gu"]:+7.4f} {r["gv"]:+7.4f} {r["r0"]:9.2f} {r["rg"]:+7.4f} {r["tr"][0]:+6.1f}..{r["tr"][1]:+5.1f} {r["clr"]:6.2f}  {rr:5.2f} {dr:5.2f}  {sa:+.1f}..{sb:+.1f}  {d0:+.1f}..{d1:+.1f}  {", ".join(over) or "-"}')
meta['bridges'] = out
pack.save(meta, blobs)
