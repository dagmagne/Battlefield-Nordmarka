#!/usr/bin/env python3
"""Post-pass on world.bin: measure every OSM building rectangle (blob 'bld') in Kartverket's 1 m lidar
(raw/dom1.npy surface, raw/dtm1.npy ground) and add blob 'bldh', 3 bytes per building in 'bld' order:
  u8 eave  wall height at the eave above the ground under the footprint, 0.2 m units
  u8 rise  ridge above eave, 0.1 m units (0 for flat roofs)
  u8 flags 1 valid, 2 flat roof, 4 ridge along d (the short side, local z) instead of w (local x), 8 nothing there (large outline without a roof: the game skips it)
Invalid entries (no building in the lidar, too few samples, implausible fit) keep the game's old guess.
Run after prep.py: .venv/bin/python buildings.py [--overlay]   (overlays go to ../../shots/geo/bld/)"""
import sys, math
import numpy as np
from scipy.ndimage import map_coordinates, uniform_filter
from geo import SIZE
import pack

HALF = SIZE / 2
dom = np.load('raw/dom1.npy').astype(np.float32); dtm = np.load('raw/dtm1.npy').astype(np.float32)
nd = dom - dtm                                                   # height above ground
# roofness: planar surfaces have ~0 second derivative (except at the ridge line); tree crowns are rough
cv = np.abs(dom[1:-1, :-2] + dom[1:-1, 2:] - 2 * dom[1:-1, 1:-1]) + np.abs(dom[:-2, 1:-1] + dom[2:, 1:-1] - 2 * dom[1:-1, 1:-1])
cv = np.pad(cv, 1, constant_values=9)
rough = uniform_filter(cv, 3)                                    # ridge lines alone stay well below tree values
roof = ((nd > 1.8) & (rough < 0.9)).astype(np.float32)
del cv

meta, blobs = pack.load()
nb = meta['nb']
B = np.frombuffer(blobs['bld'], dtype=np.dtype([('x', '<i2'), ('z', '<i2'), ('w', '<u2'), ('d', '<u2'), ('yaw', '<i2'), ('k', 'u1'), ('lv', 'u1')]))
assert len(B) == nb

def samp(a, x, z, order=1): return map_coordinates(a, [z + HALF, x + HALF], order=order, mode='nearest')

SH = np.arange(-2, 2.01, 0.5)
out = np.zeros((nb, 3), np.uint8); rec = []
for n in range(nb):
    cx, cz, w, d, yaw, kind = B['x'][n] / 8, B['z'][n] / 8, B['w'][n] / 8, B['d'][n] / 8, B['yaw'][n] / 1e4, int(B['k'][n])
    ux, uz = math.cos(yaw), math.sin(yaw)                        # local x (along w); local z = (-uz, ux) (along d)
    hw, hd = w / 2, d / 2
    mw, md = max(0.35 * hw, hw - 1.2), max(0.35 * hd, hd - 1.2)   # shrink for the alignment error
    st = 0.5 if w * d < 400 else 1.0
    lu, lv = np.meshgrid(np.arange(-mw, mw + 1e-6, st), np.arange(-md, md + 1e-6, st)); lu = lu.ravel(); lv = lv.ravel()
    wx0 = cx + lu * ux - lv * uz; wz0 = cz + lu * uz + lv * ux
    # shift up to 2 m so the most roof-like samples fall inside
    best = (-1, 0, 0)
    for dx in SH:
        for dz in SH:
            c = samp(roof, wx0 + dx, wz0 + dz, 0).mean() - 0.01 * math.hypot(dx, dz)
            if c > best[0]: best = (c, dx, dz)
    cov, dx, dz = best
    wx, wz = wx0 + dx, wz0 + dz
    ok = samp(roof, wx, wz, 0) > 0.5
    gnd = np.median(samp(dtm, wx, wz))                           # ground under the footprint (the game levels a pad at the centre)
    h = samp(dom, wx, wz) - gnd
    r = dict(n=n, x=cx, z=cz, w=w, d=d, yaw=yaw, k=kind, cov=cov, dx=dx, dz=dz, ok=False)
    rec.append(r)
    if cov < 0.2 and w * d > 200: out[n] = [0, 0, 8]; continue   # a large outline with no roof in the lidar: stands, ski-jump parts, demolished
    if cov < (0.33 if w * d > 150 else 0.45) or ok.sum() < 8: continue   # big L-shapes and courtyards cover less of their rectangle
    hu, hv, hh = lu[ok], lv[ok], h[ok]
    # robust fits (trimmed least squares; overhanging crowns, chimneys and dormers fall out as outliers):
    # flat h = a; shed h = a + b u + c v; gable h = a - b |t - t0| with the ridge along local x (t = v) or local z (t = u), ridge offset t0
    def fit(A):
        m = np.ones(len(hh), bool)
        for it in range(4):
            c = np.linalg.lstsq(A[m], hh[m], rcond=None)[0]; res = hh - A @ c
            s = max(0.2, 1.5 * np.median(np.abs(res[m]))); m2 = np.abs(res) < 2.5 * s
            if m2.sum() < 6: break
            m = m2
        return c, np.sqrt(np.mean(res[m] ** 2)) + 0.3 * (1 - m.mean())   # rms of the inliers, penalised by the outlier share
    one = np.ones(len(hh))
    F = fit(one[:, None]); P = fit(np.stack([one, hu, hv], 1))
    G = (None, 9, '', 0)
    for ax, t, half in (('x', hv, hd), ('z', hu, hw)):
        if ax == 'z' and min(mw, md) < 1.5: continue
        for t0 in np.linspace(-0.3, 0.3, 7) * half:
            c, e = fit(np.stack([one, -np.abs(t - t0)], 1)); e += 0.04 * (ax == 'z') + 0.1 * abs(t0) / half  # bias to the builder's default, centred ridge
            if c[1] > 0.12 and e < G[1]: G = (c, e, ax, half)
    flat = G[0] is None or G[1] > 0.8 * min(F[1], P[1])             # a gable must beat both the flat and the single-plane fit clearly
    if flat: eave, rise, alt, mono = F[0][0], 0.0, False, math.hypot(P[0][1], P[0][2])   # shed roofs: flat at the median height
    else:
        a, b = G[0]; half = G[3]; mono = 0.0
        rise = min(b * half, 1.2 * half, 12.0); eave = a - rise; alt = G[2] == 'z'
    r.update(eave=eave, rise=rise, flat=flat, alt=alt, rms=G[1] if not flat else F[1], mono=mono)
    if not (1.8 <= eave <= 50) or r['rms'] > (5 if flat else 2.5): continue   # stepped blocks on slopes: median height
    if eave > 4 + 1.4 * min(w, d) or (kind == 2 and eave > 6): continue   # a tall thin box or a tall shed: a crown or mast, not the building
    r['ok'] = True
    out[n] = [min(255, round(eave / 0.2)), min(255, round(rise / 0.1)), 1 | (2 if flat else 0) | (4 if alt else 0)]

V = [r for r in rec if r['ok']]
print(f'buildings {nb}, valid {len(V)} ({100 * len(V) / nb:.0f} %), by kind (valid/all):',
      {k: f'{sum(1 for r in V if r["k"] == k)}/{sum(1 for r in rec if r["k"] == k)}' for k in range(5)})
inv = [r for r in rec if not r['ok']]
print('invalid: low coverage', sum(1 for r in inv if 'eave' not in r), 'implausible fit', sum(1 for r in inv if 'eave' in r))
e = np.array([r['eave'] for r in V]); s = np.array([r['rise'] for r in V]); f = np.array([r['flat'] for r in V]); a = np.array([r['alt'] for r in V])
print('eave m percentiles 5/25/50/75/95:', np.round(np.percentile(e, [5, 25, 50, 75, 95]), 1), 'max', round(e.max(), 1))
print('eave histogram (2 m bins):', np.histogram(e, bins=[0, 2, 4, 6, 8, 10, 12, 16, 20, 30, 60])[0])
print('rise (pitched) percentiles 5/50/95:', np.round(np.percentile(s[~f], [5, 50, 95]), 1))
print(f'flat {f.mean() * 100:.0f} % (of which tilted > 0.15, shed roofs: {np.mean([r["mono"] > 0.15 for r in V if r["flat"]]) * 100:.0f} %), ridge along the short side {a[~f].mean() * 100:.0f} % of pitched')
sh = np.array([math.hypot(r['dx'], r['dz']) for r in V]); print('shift m median', np.median(sh), 'mean dx/dz', round(np.mean([r['dx'] for r in V]), 2), round(np.mean([r['dz'] for r in V]), 2))
for k in range(4):
    kk = np.array([r['k'] == k for r in V])
    if kk.any(): print(f'  kind {k}: eave median {np.median(e[kk]):.1f}, flat {f[kk].mean() * 100:.0f} %')

if '--overlay' in sys.argv:
    from PIL import Image, ImageDraw
    def cmap(v):  # wall height 0..15 m -> blue..red
        t = max(0, min(1, v / 15)); return (int(255 * min(1, 2 * t)), int(255 * (1 - abs(2 * t - 1))), int(255 * min(1, 2 - 2 * t)))
    for name, x0, z0, x1, z1 in [('sw', -1000, 1300, -600, 1700), ('se', 600, 1100, 1000, 1500)]:
        S = 3
        i0, j0 = int(x0 + HALF), int(z0 + HALF)
        bg = np.clip(nd[j0:int(z1 + HALF), i0:int(x1 + HALF)] / 15, 0, 1)
        gz, gx = np.gradient(dom[j0:int(z1 + HALF), i0:int(x1 + HALF)]); hs = np.clip(0.5 - (gx + gz) * 0.25, 0, 1)   # roof planes lit from the north-west
        im = Image.fromarray(((bg * 0.6 + hs * 0.4) * 230).astype(np.uint8)).convert('RGB').resize(((x1 - x0) * S, (z1 - z0) * S), Image.NEAREST)
        dr = ImageDraw.Draw(im)
        for r in rec:
            if not (x0 - 20 < r['x'] < x1 + 20 and z0 - 20 < r['z'] < z1 + 20): continue
            ux, uz = math.cos(r['yaw']), math.sin(r['yaw']); hw, hd = r['w'] / 2, r['d'] / 2
            P = [((r['x'] + su * hw * ux - sv * hd * uz - x0) * S, (r['z'] + su * hw * uz + sv * hd * ux - z0) * S) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            if r['ok']:
                dr.polygon(P, outline=cmap(r['eave']), width=2)
                c = ((r['x'] - x0) * S, (r['z'] - z0) * S)
                if not r['flat']:   # ridge line
                    L = (-uz * hd, ux * hd) if r['alt'] else (hw * ux, hw * uz)
                    dr.line([(c[0] - L[0] * S * 0.8, c[1] - L[1] * S * 0.8), (c[0] + L[0] * S * 0.8, c[1] + L[1] * S * 0.8)], fill=cmap(r['eave'] + r['rise']), width=1)
                else: dr.ellipse([c[0] - 2, c[1] - 2, c[0] + 2, c[1] + 2], fill=cmap(r['eave']))
            else: dr.polygon(P, outline=(255, 0, 255), width=1)
        for v in range(16):  # legend
            dr.rectangle([10 + v * 14, 10, 24 + v * 14, 24], fill=cmap(v))
        dr.text((10, 28), '0 .. 15 m eave; line = ridge (colour = ridge height), dot = flat, magenta = invalid', fill=(255, 255, 255))
        im.save(f'../../shots/geo/bld/overlay_{name}.png'); print('overlay', name)

if '--dry' not in sys.argv:
    blobs['bldh'] = out.tobytes()
    pack.save(meta, blobs)
