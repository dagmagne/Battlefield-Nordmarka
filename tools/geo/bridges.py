"""Functional bridges: measure the crossings from the lidar and write meta['bridges'] (the game builds them in world.js / bridges.js).

Run from tools/geo with the venv:  .venv/bin/python bridges.py   (needs raw/dtm1.npy, raw/dom1.npy from fetch_hoyde.py)

Crossings come from the data, not a hard-coded list: meta['tunnels'] (roads under the ski bridges, k 0), meta['rail']['x'] kind 1 (the metro
over a road or path, k 1: the deck carries the track) and kind 2 / meta['rbr'] (a road or track over the metro, k 2: the lower level is the
rail bed), plus the small hand table CORR (skips, names). Crossings inside the playable area (and kind 2 a little outside) are built; under
3.4 m clearance they are built 'blocked' (blk 1: a deck so the track is continuous, a height barrier in front of the opening).
Per crossing:
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
import math, sys, numpy as np, pack

TH = [1.1, 1.3, 1.0]   # slab thickness per kind (assumed; the lidar sees only the top): ski bridge; rail deck: 0.9 m of concrete under the ballast's shoulders and 0.4 m of packed snow up to 5 cm under the ballast top; road deck
ROAD_M = 4.0      # trench margin either side of the asphalt
dtm = np.load('raw/dtm1.npy', mmap_mode='r'); dom = np.load('raw/dom1.npy', mmap_mode='r')

def s(A, x, z):
    fx, fz = x + 2048, z + 2048; i, j = int(math.floor(fx)), int(math.floor(fz)); a, b = fx - i, fz - j
    return float((A[j, i] * (1 - a) + A[j, i + 1] * a) * (1 - b) + (A[j + 1, i] * (1 - a) + A[j + 1, i + 1] * a) * b)

meta, blobs = pack.load()
PLAY = 1560
# ---- data: rail tracks (blob 'rail'), plowed roads (blob 'roads'), trails ----
def i16(b, o): return int.from_bytes(b[o:o + 2], 'little', signed=True)
TR = []; o = 0
for n in meta['rail']['tr']:
    a = np.frombuffer(blobs['rail'][o:o + 8 * n], dtype=np.dtype([('x', '<i2'), ('z', '<i2'), ('y', '<u2'), ('f', 'u1'), ('p', 'u1')])); o += 8 * n
    TR.append(np.c_[a['x'] / 8, a['z'] / 8, meta['hmin'] + a['y'] / 50, a['f']])
RD = []; o = 0
for n, w10, *c in meta['roads']:
    RD.append((np.frombuffer(blobs['roads'][o:o + 4 * n], dtype='<i2').reshape(-1, 2) / 8, w10 / 20, c[0] if c else 0)); o += 4 * n
TL = []; o = 0
for n, lit, name in meta['trails']:
    TL.append((np.array([(i16(blobs['trails'], o + 4 * i) / 8, i16(blobs['trails'], o + 4 * i + 2) / 8) for i in range(n)]), lit)); o += 4 * n
def tangent(P, x, z):  # nearest point on a polyline and its unit direction
    d = np.hypot(P[:, 0] - x, P[:, 1] - z); j = int(np.argmin(d)); a, c = max(0, j - 2), min(len(P) - 1, j + 2); t = P[c, :2] - P[a, :2]
    return float(d[j]), P[j, :2].copy(), t / (np.linalg.norm(t) or 1)
def runs(on, start):  # the contiguous run of 0.5 m samples round start
    lo = hi = min(on, key=lambda t: abs(t - start))
    while lo - 0.5 in on: lo -= 0.5
    while hi + 0.5 in on: hi += 0.5
    return lo, hi
# hand corrections: (x, z) of the data crossing, within 3 m -> fields (Heftyebakken: a forest track, crowns over the cutting spoil the surface model)
CORR = [((-470.8, 1975.7), {'skip': 'outside the playable area, 51 degree skew'}), ((-475.8, 1973.7), {'skip': 'beside Holmenkollveien (skipped)'}), ((-464.4, 1977.6), {'skip': 'outside, beside Holmenkollveien'}),
        ((-984.4, 1656.7), {'skip': 'no clearance (runs beside the line)'}), ((-1817.5, -40.5), {'skip': 'outside the playable area'}),
        ((-1460.7, 893.3), {'skip': 'the footway beside Lillevannsveien: under the same deck'}), ((197.3, 1552.4), {'skip': 'the footway beside Frognerseterveien: under the same deck'}),
        ((-446.8, -455.6), {'name': 'Holmenkollbanen over Øvreseterveien'}), ((-1464.2, 889.0), {'name': 'Holmenkollbanen over Lillevannsveien'}),
        ((-894.6, -553.1), {'name': 'Tomm Murstadbakken over Holmenkollbanen'}), ((426.3, 1479.5), {'name': 'The Heftyebakken track over Holmenkollbanen', 'cav': (-7, 11), 'deck': 'approach'}), ((-883.3, 1712.4), {'name': 'Lillevannsveien over Holmenkollbanen'})]
def corr(x, z):
    for (cx, cz), f in CORR:
        if math.hypot(cx - x, cz - z) < 3: return f
    return {}

def build(name, k, M, vx, vz, ux, uz, under, hwU, skew, deck, src, f={}, road=None):
    """M: a point of the under-route's centre line at the crossing, v its direction in the frame, u the over-route; under(d): the lower level
    along v; hwU: the half-width of what runs under; skew: the angle (rad) between v and the under-route; deck: 'dom' or a ballast sampler."""
    P = lambda d, t: (M[0] + vx * d + ux * t, M[1] + vz * d + uz * t)
    on = [d for d in np.arange(-40, 40.01, 0.5) if s(dom, *P(d, 0)) - under(d) > 3.0]
    if not on: return None, 'no deck over the under-route in the surface model'
    d0, d1 = runs(on, 0); d0 -= 0.25; d1 += 0.25
    ex = []
    for d in np.arange(d0 + 2, d1 - 1.9, 1.5):
        on = [t for t in np.arange(-45, 45.01, 0.5) if s(dom, *P(d, t)) - s(dtm, *P(d, t)) > 0.4]
        if on: ex.append(runs(on, 0))
    if not ex and 'cav' not in f: return None, 'no cavity under the deck'
    sa, sb = f['cav'] if 'cav' in f else (float(np.median([e[0] for e in ex])), float(np.median([e[1] for e in ex]))); hw = (d1 - d0) / 2; deck = f.get('deck', deck)
    half = hwU + ROAD_M + abs(math.tan(skew)) * hw
    ta, tb = max(sa, -half), min(sb, half)
    # the slab reaches at least 7 m past the trench: the game keeps the road level 3 m behind the abutments and steps the ground up under
    # the slab, and a hull corner just past a slab end must not reach a road-level texel through the 2 m bilinear grid
    u0, u1 = min(sa - 1.5, ta - 7), max(sb + 1.5, tb + 7); uc = (u0 + u1) / 2; dc = (d0 + d1) / 2; hl = (u1 - u0) / 2
    cx, cz = P(dc, uc)
    if deck in ('dom', 'approach'):  # deck plane on the DOM over the slab core (robust: drop parapets, snow piles, cables)
        pts = np.array([(t - uc, d - dc, s(dom, *P(d, t))) for d in np.arange(d0 + 1.5, d1 - 1.4, 1.0) for t in np.arange(u0 + 1, u1 - 0.9, 1.0)])
        keep = np.ones(len(pts), bool)
        for it in range(4):
            A = np.c_[np.ones(keep.sum()), pts[keep, 0], pts[keep, 1]]; cf = np.linalg.lstsq(A, pts[keep, 2], rcond=None)[0]
            r = pts[:, 2] - (cf[0] + cf[1] * pts[:, 0] + cf[2] * pts[:, 1]); keep = np.abs(r) < max(0.35, 2.5 * np.std(r[keep]))
        y0, gu, gv = (float(v) for v in cf); rms = float(np.sqrt((r[keep] ** 2).mean()))
        if rms > 0.5 or deck == 'approach':  # crowns over a forest track: the deck as the line between the over-route's approach levels (DTM) at both ends instead
            ap = [(t - uc, s(dtm, *P(dc, t))) for t in list(np.arange(sa - 6, sa - 0.9, 1.0)) + list(np.arange(sb + 1, sb + 6.1, 1.0))]
            g1, g0 = np.polyfit([a for a, b in ap], [b for a, b in ap], 1); y0, gu, gv = float(g0), float(g1), 0.0; rms = float(np.std([b - (g0 + g1 * a) for a, b in ap]))
    else:  # the metro on the deck: the deck surface (packed snow over the ballast's shoulders) 5 cm under the ballast top, level across
        lu = []; yy = []
        for T in TR:
            for x, z, y, f in T:
                a = (x - cx) * ux + (z - cz) * uz; b = -(x - cx) * uz + (z - cz) * ux
                if abs(a) < hl + 4 and abs(b) < hw: lu.append(a); yy.append(y)
        g1, g0 = np.polyfit(lu, yy, 1); y0, gu, gv = float(g0) - 0.05, float(g1), 0.0; rms = float(np.std(np.array(yy) - (g0 + g1 * np.array(lu))))
    # the lower level in the slab frame: r0 + rg * lv
    rg = (under(dc + 5) - under(dc - 5)) / 10; r0 = under(dc)
    th = TH[k]; clr = min(y0 + gu * -uc + gv * b - th - (r0 + rg * b) for b in (-hw, hw))  # over the under-route's centre line, at both faces
    rec = {'name': name, 'k': k, 'src': src, 'c': [round(cx, 2), round(cz, 2)], 'u': [round(ux, 5), round(uz, 5)], 'hl': round(hl, 2), 'hw': round(hw, 2),
           'y0': round(y0, 2), 'gu': round(gu, 4), 'gv': round(gv, 4), 'th': th, 'tr': [round(ta - uc, 2), round(tb - uc, 2)], 'r0': round(r0, 2), 'rg': round(float(rg), 4), 'clr': round(clr, 2)}
    if clr < 3.4: rec['blk'] = 1
    if k == 2 and road is not None:  # where the road runs on the deck (lv of its centre line at the slab centre, half-width)
        d_, q_, t_ = tangent(road[0], cx, cz); rec['rv'] = round(float(-(q_[0] - cx) * uz + (q_[1] - cz) * ux), 2); rec['rw'] = round(road[1], 2)
    return rec, (rms, sa, sb, d0, d1, math.degrees(skew))

def dtm_grade(M, vx, vz, half, c=0.0, w=(4, 25)):  # the under-route's level from the DTM just outside the deck (under a removed deck the DTM holds a fill)
    P = lambda d: (M[0] + vx * d, M[1] + vz * d)
    ds = [d for d in np.arange(-60, 60.1, 0.5) if half + w[0] < abs(d - c) < half + w[1]]; hs = [s(dtm, *P(d)) for d in ds]; g, a = np.polyfit(ds, hs, 1)
    return lambda d: float(a + g * d)
def road_grade(M, vx, vz, half0):  # iterate: the deck extent over a first guess, then the grade from 1.5-10 m outside its faces (roads sag under bridges)
    under = dtm_grade(M, vx, vz, half0, 0, (4, 25))
    for it in range(2):
        on = [d for d in np.arange(-40, 40.01, 0.5) if s(dom, M[0] + vx * d, M[1] + vz * d) - under(d) > 3.0]
        if not on: break
        d0, d1 = runs(on, 0); under = dtm_grade(M, vx, vz, (d1 - d0) / 2, (d0 + d1) / 2, (1.5, 10))
    return under

out, rows, notes = [], [], []
# k 0: roads under the ski bridges (meta.tunnels)
for k, (ax, az, bx, bz) in enumerate(meta['tunnels']):
    L = math.hypot(bx - ax, bz - az); vx, vz = (bx - ax) / L, (bz - az) / L; M = ((ax + bx) / 2, (az + bz) / 2)
    under = road_grade(M, vx, vz, L / 2)
    rec, info = build(['Holmenkollveien under the stadium bridge', 'Holmenkollveien under the lower ski bridge'][k] if k < 2 else f'tunnel {k}', 0, M, vx, vz, vz, -vx, under, 3.5, 0.0, 'dom', f'tunnels[{k}]')
    rec['tun'] = k; out.append(rec); rows.append((rec, info))
# k 1 / 2: the metro crossings
done = [(r['c'][0], r['c'][1]) for r in out]
for X in meta['rail']['x']:
    x, z, kind, clr0, what, name = X[:6]; f = corr(x, z)
    if kind == 0: continue
    if f.get('skip'): notes.append(f'{what} {name} ({x:.0f}, {z:.0f}): skipped, {f["skip"]}'); continue
    if (abs(x) > PLAY or abs(z) > PLAY) and kind == 1: notes.append(f'{what} {name} ({x:.0f}, {z:.0f}): outside the playable area'); continue
    if any(math.hypot(x - a, z - b) < 25 for a, b in done): continue
    dr = sorted((tangent(T, x, z) + (ti,) for ti, T in enumerate(TR)), key=lambda q: q[0])
    rt = dr[0][2]  # the metro's direction
    if kind == 1:  # the metro over a road / path: u along the track, v across it, oriented along the road; the road (plowed) or the valley floor under
        rr = min(((tangent(P_, x, z), hw_) for P_, hw_, c_ in RD), key=lambda q: q[0][0]); (dd, q, wd), hwr = rr
        ux, uz = rt; vx, vz = -uz, ux
        if dd < 8: M = q; sk = math.acos(min(1, abs(wd[0] * vx + wd[1] * vz))); hwU = hwr; M = (M[0], M[1])
        else: M = (x, z); sk = 0.0; hwU = 1.5   # a path or track that is not plowed: across the line at the crossing
        if wd @ np.array([vx, vz]) < 0 and dd < 8: vx, vz, ux, uz = -vx, -vz, -ux, -uz
        under = road_grade(M, vx, vz, 6); deck = 'rail'
    else:  # a road or track over the metro: v along the line, the rail bed under (its ballast profile, the game levels the bed 0.3 m under it)
        vx, vz = rt; ux, uz = vz, -vx
        q2 = [tangent(T, x, z)[1] for T in TR if tangent(T, x, z)[0] < 8]; M = tuple(np.mean(q2, axis=0)); sep = max(0.0, (max(np.hypot(*(a - b)) for a in q2 for b in q2)) if len(q2) > 1 else 0)
        rb = [r for r in meta['rbr'] if min(math.hypot(r[0][i] - x, r[0][i + 1] - z) for i in range(0, len(r[0]), 2)) < 15]
        rr = min(((tangent(P_, x, z), hw_, P_) for P_, hw_, c_ in RD), key=lambda q: q[0][0]); road = (rr[2], rr[1]) if rr[0][0] < 15 else None
        sk = 0.0
        if rb: P_ = np.array(rb[0][0]).reshape(-1, 2); t = P_[-1] - P_[0]; t /= np.linalg.norm(t); sk = math.acos(min(1, abs(t[0] * ux + t[1] * uz)))
        lv = []; yy = []
        for T in TR:
            for px, pz, py, pf in T:
                a = (px - M[0]) * vx + (pz - M[1]) * vz; b = (px - M[0]) * ux + (pz - M[1]) * uz
                if abs(a) < 45 and abs(b) < 6: lv.append(a); yy.append(py)
        g1, g0 = np.polyfit(lv, yy, 1); under = (lambda a, b: (lambda d: float(a + b * d) - 0.3))(g0, g1); hwU = sep / 2 + 2.7 - ROAD_M + 1.5; deck = 'dom'
    nm = f.get('name') or (name or what)
    rec, info = build(nm, 1 if kind == 1 else 2, M, vx, vz, ux, uz, under, hwU, sk, deck, f'rail.x {what} {name}'.strip(), f, road if kind == 2 else None)
    if rec is None: notes.append(f'{what} {name} ({x:.0f}, {z:.0f}): not built: {info}'); continue
    out.append(rec); rows.append((rec, info)); done.append((x, z))
# meta.rbr bridges that are not a metro crossing: report what is under them
for R_ in meta['rbr']:
    P_ = np.array(R_[0]).reshape(-1, 2); c = P_.mean(axis=0)
    if any(math.hypot(c[0] - a, c[1] - b) < 30 for a, b in done): continue
    t = P_[-1] - P_[0]; t /= np.linalg.norm(t); n_ = np.array([-t[1], t[0]])
    prof = [s(dtm, *(c + n_ * d)) for d in range(-30, 31, 2)]; deck = s(dom, *c)
    near = [f'road {i} at {tangent(P2, *c)[0]:.0f} m' for i, (P2, hw_, c_) in enumerate(RD) if tangent(P2, *c)[0] < 20 and tangent(P2, *c)[0] > 3] + [f'trail at {tangent(T2, *c)[0]:.0f} m' for T2, l_ in TL if tangent(T2, *c)[0] < 20]
    notes.append(f'rbr {R_[3] or "(unnamed)"} class {R_[1]} at ({c[0]:.0f}, {c[1]:.0f}): deck {deck:.1f}, DTM across it {min(prof):.1f}..{max(prof):.1f} (lowest {deck - 1 - min(prof):.1f} m under the deck), nearby {", ".join(near) or "no mapped way"}')

print(f'{"#":>2s} {"k":1s} {"name":44s} {"centre x, z":>16s} {"slab u x v":>12s} {"deck top":>9s} {"gu":>7s} {"gv":>7s} {"lower r0 + rg v":>17s} {"trench u":>14s} {"clear":>6s} {"skew":>5s} rms  state')
for i, (r, (rms, sa, sb, d0, d1, skd)) in enumerate(rows):
    print(f'{i + 1:2d} {r["k"]} {r["name"][:44]:44s} {r["c"][0]:7.1f} {r["c"][1]:8.1f} {2 * r["hl"]:5.1f} x {2 * r["hw"]:4.1f} {r["y0"]:9.2f} {r["gu"]:+7.4f} {r["gv"]:+7.4f} {r["r0"]:9.2f} {r["rg"]:+7.4f} {r["tr"][0]:+6.1f}..{r["tr"][1]:+5.1f} {r["clr"]:6.2f} {skd:5.1f} {rms:4.2f} {"blocked" if r.get("blk") else "functional"}')
for n_ in notes: print('  note:', n_)
meta['bridges'] = out
if '--dry' not in sys.argv: pack.save(meta, blobs)
