#!/usr/bin/env python3
"""Post-pass on world.bin: Holmenkollbanen (T-bane line 1) from raw/osm_rail.json (fetch_rail.py), checked against the 1 m lidar.
Adds meta key 'rail' and blob 'rail' (nothing else is touched):
  blob 'rail': for every track, n points of 8 bytes: int16 x*8, int16 z*8, uint16 (y - hmin)*50 (ballast top, 2 cm), uint8 flags
               (1 = on a bridge span: no bed or rails drawn, the next agent builds the deck), uint8 0.  Points are about 2 m apart.
  meta.rail  = { tr: [n per track], st: [[name, cx, cz, [[x, z, yaw, hl, hw, y, edge], ...platforms]], ...],
                 bs: [[x, z, yaw], ...] buffer stops, x: [[x, z, kind, clearance, 'what', 'name'], ...] crossings,
                 train: [[track, s], ...] parked trains (track index, distance of the train centre along it) }
  platform: centre, yaw (long axis = (sin yaw, cos yaw)), half length, half width, top height, edge = +1/-1 the side of the
  local x axis (cos yaw, -sin yaw) that faces the track.  crossing kind: 0 level, 1 rail over (rail bridge, road under),
  2 rail under (road / trail bridge over the line); clearance in metres from the lidar (0 for level).
Run after the other passes: .venv/bin/python rail.py [--overlay] [--dry]   (overlay -> ../../shots/geo/rail/overlay.png)"""
import sys, json, math
import numpy as np
from scipy.ndimage import map_coordinates, median_filter, gaussian_filter1d
from geo import to_local, SIZE
import pack

HALF = SIZE / 2; LIM = HALF - 8
dtm = np.load('raw/dtm1.npy').astype(np.float64); dom = np.load('raw/dom1.npy').astype(np.float64)
def samp(a, x, z): return map_coordinates(a, [np.asarray(z) + HALF, np.asarray(x) + HALF], order=1, mode='nearest')

d = json.load(open('raw/osm_rail.json'))
N = {x['id']: x for x in d['elements'] if x['type'] == 'node'}
def loc(i): n = N[i]; e, nn = to_local(n['lat'], n['lon']); return (e, -nn)
WAYS = [x for x in d['elements'] if x['type'] == 'way']
rail = [w for w in WAYS if w.get('tags', {}).get('railway') == 'subway' and w['tags'].get('service') != 'crossover' and all(i in N for i in w['nodes'])]

# ---- chain the ways into tracks (switches between the two tracks are crossovers, which are left out) ----
ends = {}
for w in rail:
    for e in (w['nodes'][0], w['nodes'][-1]): ends.setdefault(e, []).append(w)
used, chains = set(), []
def walk(w, start):
    seq = []; cur, node = w, start
    while cur and cur['id'] not in used:
        used.add(cur['id']); ns = cur['nodes'] if cur['nodes'][0] == node else cur['nodes'][::-1]
        br = cur['tags'].get('bridge') == 'yes'
        seq += [(nid, br) for nid in (ns if not seq else ns[1:])]
        node = ns[-1]; nxt = [v for v in ends.get(node, []) if v['id'] not in used]
        cur = nxt[0] if len(nxt) == 1 else (nxt[0] if nxt and len(ends[node]) == 2 else None)
        if len(ends.get(node, [])) > 2: cur = None  # a junction (the tail track at Frognerseteren): start a new chain there
    return seq
for w in rail:  # start from chain ends (degree 1 or junctions) first
    for e in (w['nodes'][0], w['nodes'][-1]):
        if w['id'] not in used and len(ends[e]) != 2: chains.append(walk(w, e))
for w in rail:
    if w['id'] not in used: chains.append(walk(w, w['nodes'][0]))

def resample(P, F, step=2.0):
    out, fl = [P[0]], [F[0]]
    for k in range(1, len(P)):
        a, b = np.array(P[k - 1]), np.array(P[k]); L = np.linalg.norm(b - a); n = max(1, int(round(L / step)))
        for s in range(1, n + 1): out.append(tuple(a + (b - a) * s / n)); fl.append(F[k])
    out = np.array(out)
    for _ in range(2):  # take the corners off the OSM nodes, keep the ends
        o = out.copy(); n = len(o)
        for i in range(2, n - 2): out[i] = o[i - 2:i + 3].mean(0)
    return out, np.array(fl, np.uint8)

tracks = []
for ch in chains:
    P = [loc(n) for n, _ in ch]; F = [b for _, b in ch]
    pts, fl = resample(P, F)
    inside = (np.abs(pts[:, 0]) < LIM) & (np.abs(pts[:, 1]) < LIM)
    k = 0
    while k < len(pts):  # runs inside the window
        if not inside[k]: k += 1; continue
        e = k
        while e < len(pts) and inside[e]: e += 1
        if e - k >= 5: tracks.append([pts[k:e], fl[k:e]])
        k = e
print('tracks', len(tracks), 'length in window', round(sum(np.linalg.norm(np.diff(t[0], axis=0), axis=1).sum() for t in tracks)), 'm')

def normals(p):
    t = np.gradient(p, axis=0); t /= np.linalg.norm(t, axis=1)[:, None] + 1e-9; return t, np.stack([-t[:, 1], t[:, 0]], 1)

# ---- alignment: the double-track bed is a flat strip in the DTM; find its centre across the line and compare with the
# midpoint of the two OSM tracks ----
allp = np.concatenate([t[0] for t in tracks]); owner = np.concatenate([[i] * len(t[0]) for i, t in enumerate(tracks)])
from scipy.spatial import cKDTree
kd = cKDTree(allp)
rows, nrm_ = [], []
offs = np.arange(-9, 9.01, 0.5)
for ti, (p, fl) in enumerate(tracks):
    _, nv = normals(p)
    for i in range(0, len(p), 3):
        if fl[i]: continue
        dd, jj = kd.query(p[i], k=12); oth = [j for dj, j in zip(dd, jj) if owner[j] != ti and 2.5 < dj < 6.0]
        if not oth: continue
        m = (p[i] + allp[oth[0]]) / 2; n = nv[i]
        prof = samp(dtm, m[0] + n[0] * offs, m[1] + n[1] * offs); sl = np.abs(np.gradient(prof, 0.5))
        win = 15  # 7.5 m wide flat window
        cost = np.convolve(sl, np.ones(win) / win, 'valid'); c = int(np.argmin(cost)); cen = offs[c + win // 2]
        if cost[c] < 0.08 and (sl[:c].max(initial=0) > 0.15 or sl[c + win:].max(initial=0) > 0.15): rows.append(cen); nrm_.append(n)
rows = np.array(rows); nrm_ = np.array(nrm_)
A = nrm_; sh, *_ = np.linalg.lstsq(A, rows, rcond=None); res = rows - A @ sh
print(f'alignment: {len(rows)} cross-profiles, median |offset| {np.median(np.abs(rows)):.2f} m, LS shift dx {sh[0]:+.2f} dz {sh[1]:+.2f} m, residual rms {np.sqrt((res ** 2).mean()):.2f} m')
SHIFT = sh if np.hypot(*sh) > 0.6 else np.zeros(2)
for t in tracks: t[0] = t[0] + SHIFT

# ---- heights: ballast top from the DTM along each track, robustly smoothed; bridge spans bridged by a straight line ----
for t in tracks:
    p, fl = t; h = samp(dtm, p[:, 0], p[:, 1]); y = median_filter(h, 7, mode='nearest')
    br = fl.astype(bool).copy()
    for i in np.nonzero(fl)[0]: br[max(0, i - 4):i + 5] = True  # the abutments: DTM drops towards the road under the span
    k = 0
    while k < len(y):
        if not br[k]: k += 1; continue
        e = k
        while e < len(y) and br[e]: e += 1
        a, b = max(0, k - 1), min(len(y) - 1, e)
        y[k:e] = np.interp(np.arange(k, e), [a, b], [y[a], y[b]]); k = e
    t.append(gaussian_filter1d(y, 3, mode='nearest'))
    t.append(br)

# ---- crossings: roads, paths and ski pistes over / under / across the line ----
def seg_x(a, b, c, e):
    r, s = b - a, e - c; den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9: return None
    q = c - a; u = (q[0] * s[1] - q[1] * s[0]) / den; v = (q[0] * r[1] - q[1] * r[0]) / den
    return (u, v) if 0 <= u <= 1 and 0 <= v <= 1 else None
cross = []
TK = [cKDTree(t[0]) for t in tracks]
xw = [w for w in WAYS if ('highway' in w.get('tags', {}) or 'piste:type' in w.get('tags', {})) and all(i in N for i in w['nodes'])]
for w in xw:
    t_ = w['tags']; P = np.array([loc(i) for i in w['nodes']]) + 0
    if len(P) < 2 or np.all(np.abs(P) > LIM): continue
    for ti, tr in enumerate(tracks):
        p, fl, y, br = tr
        tk = TK[ti]
        for j in range(len(P) - 1):
            L = np.linalg.norm(P[j + 1] - P[j]); near = tk.query_ball_point((P[j] + P[j + 1]) / 2, L / 2 + 3)
            for i in sorted(set(min(q, len(p) - 2) for q in near) | set(max(q - 1, 0) for q in near)):
                r = seg_x(p[i], p[i + 1], P[j], P[j + 1])
                if not r: continue
                X = p[i] + (p[i + 1] - p[i]) * r[0]; yr = y[i] + (y[i + 1] - y[i]) * r[0]; g = float(samp(dtm, [X[0]], [X[1]])[0])
                # the crossing way's approach level: DTM 20-35 m out along it on both sides
                dvec = P[j + 1] - P[j]; dvec = dvec / (np.linalg.norm(dvec) + 1e-9)
                ap = [float(np.median(samp(dtm, X[0] + dvec[0] * s * np.arange(20, 36, 3), X[1] + dvec[1] * s * np.arange(20, 36, 3)))) for s in (-1, 1)]
                yw = sum(ap) / 2
                wbr, wtu = t_.get('bridge') in ('yes', 'viaduct'), t_.get('tunnel') in ('yes', 'building_passage', 'culvert')
                if br[i] or wtu or (yr - g > 3 and not wbr): kind, clr = 1, yr - g - 1.0
                elif wbr or min(ap) - yr > 3: kind, clr = 2, float(np.median(samp(dom, X[0] + np.array([-1, 0, 1, 0, 0]), X[1] + np.array([0, 0, 0, -1, 1])))) - yr - 0.17 - 0.9  # DOM = deck surface; minus rail height and deck
                else: kind, clr = 0, 0.0
                what = 'piste' if 'piste:type' in t_ and 'highway' not in t_ else t_['highway']
                cross.append([round(X[0], 1), round(X[1], 1), kind, round(max(clr, 0), 1), what, t_.get('name', ''), w['id'], ti, 'B' if wbr else 'T' if wtu else ''])
# one entry per way and place (both tracks cross it)
uniq = []
for c in cross:
    if any(u[6] == c[6] and math.hypot(u[0] - c[0], u[1] - c[1]) < 15 for u in uniq): continue
    uniq.append(c)
uniq = [c for c in uniq if c[4] not in ('footway', 'steps') or c[2]]  # level footpaths at the stations: not interesting
KN = ['level', 'rail over (road under)', 'rail under (bridge over the line)']
for c in sorted(uniq, key=lambda c: (c[2] == 0, c[0])): print(f'  crossing {c[0]:7.1f} {c[1]:7.1f}  {KN[c[2]]:34s} clearance {c[3]:4.1f} m  {c[4]} {c[5]} {c[8]}')

# ---- stations: platform polygons -> oriented rectangles at the measured height; names from the stop positions ----
stops = [(loc(x['id']), x['tags']['name']) for x in d['elements'] if x['type'] == 'node' and x.get('tags', {}).get('name') and
         (x['tags'].get('railway') in ('halt', 'station', 'stop') or x['tags'].get('public_transport') in ('stop_position', 'station'))]
plats = [w for w in WAYS if w.get('tags', {}).get('railway') == 'platform']
st = {}
for w in plats:
    P = np.array([loc(i) for i in w['nodes']]) + SHIFT; c = P[:-1].mean(0) if (w['nodes'][0] == w['nodes'][-1]) else P.mean(0)
    if np.any(np.abs(c) > LIM - 20): continue
    q = P - c; ev, evec = np.linalg.eigh(q.T @ q); ax = evec[:, 1]; yaw = math.atan2(ax[0], ax[1]); bx = np.array([math.cos(yaw), -math.sin(yaw)])
    u = q @ ax; v = q @ bx; hl = (u.max() - u.min()) / 2; hw = max(1.2, (v.max() - v.min()) / 2); c = c + ax * (u.max() + u.min()) / 2 + bx * (v.max() + v.min()) / 2
    dd, jj = kd.query(c - SHIFT); tp = allp[jj] + SHIFT; ti = owner[jj]; tr = tracks[ti]; k = int(np.argmin(np.linalg.norm(tr[0] - tp, axis=1)))
    yb = float(tr[2][k]); edge = 1 if (tp - c) @ bx > 0 else -1
    # top: the DTM inside the platform (high platforms usually come through as ground); keep it 0.75-1.15 m above the ballast top
    gu, gv = np.meshgrid(np.linspace(-hl * 0.8, hl * 0.8, 9), np.linspace(-hw * 0.6, hw * 0.6, 3))
    gx = c[0] + ax[0] * gu + bx[0] * gv; gz = c[1] + ax[1] * gu + bx[1] * gv
    hm = float(np.median(samp(dtm, gx.ravel(), gz.ravel()))); top = yb + float(np.clip(hm - yb, 0.75, 1.15))
    nm = min(stops, key=lambda s: math.hypot(s[0][0] - c[0], s[0][1] - c[1]))
    if math.hypot(nm[0][0] - c[0], nm[0][1] - c[1]) > 120 or dd > 9: continue
    print(f'  platform {nm[1]:15s} at {c[0]:7.1f} {c[1]:7.1f}  length {2 * hl:5.1f} width {2 * hw:4.1f}  top {top - yb:+.2f} over the ballast (lidar {hm - yb:+.2f})')
    st.setdefault(nm[1], []).append([round(c[0], 2), round(c[1], 2), round(yaw, 4), round(hl, 2), round(hw, 2), round(top, 2), edge, ti, k])

# buffer stops
bs = []
for x in d['elements']:
    if x['type'] == 'node' and x.get('tags', {}).get('railway') == 'buffer_stop':
        p = np.array(loc(x['id'])) + SHIFT
        if np.any(np.abs(p) > LIM): continue
        dd, jj = kd.query(p - SHIFT); tr = tracks[owner[jj]]; k = int(np.argmin(np.linalg.norm(tr[0] - p, axis=1))); kk = k - 1 if k == len(tr[0]) - 1 else k + 1
        dv = tr[0][k] - tr[0][kk]; bs.append([round(float(tr[0][k][0]), 2), round(float(tr[0][k][1]), 2), round(math.atan2(dv[0], dv[1]), 4)])  # yaw points out of the track end

# parked trains: Frognerseteren beside platform 1 (the eastern, terminus end), Holmenkollen on the outbound track
def park(name, which, east=False):  # centred on the platform, or with its front at the platform's east end (the terminus side at Frognerseteren)
    P = sorted(st.get(name, []), key=lambda q: q[0])[which]; tr = tracks[P[7]]; s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(tr[0], axis=0), axis=1))])
    sc = float(s[P[8]])
    if east:
        ax = np.array([math.sin(P[2]), math.cos(P[2])]); e = np.array(P[:2]) + ax * P[3] * (1 if ax[0] > 0 else -1); ke = int(np.argmin(np.linalg.norm(tr[0] - e, axis=1)))
        sc = float(s[ke]) - np.sign(s[ke] - sc) * (55.3 / 2 + 1.0)
    return [int(P[7]), round(sc, 1)]
trains = [park('Frognerseteren', -1, True)] + ([park('Holmenkollen', 0)] if 'Holmenkollen' in st else [])

meta, blobs = pack.load(); hmin = meta['hmin']
out = bytearray()
for p, fl, y, br in tracks:
    a = np.zeros(len(p), np.dtype([('x', '<i2'), ('z', '<i2'), ('y', '<u2'), ('f', 'u1'), ('p', 'u1')]))
    a['x'] = np.round(p[:, 0] * 8); a['z'] = np.round(p[:, 1] * 8); a['y'] = np.round((y - hmin) * 50); a['f'] = fl
    out += a.tobytes()
blobs['rail'] = bytes(out)
meta['rail'] = {'tr': [len(t[0]) for t in tracks], 'st': [[n, round(float(np.mean([q[0] for q in P])), 1), round(float(np.mean([q[1] for q in P])), 1), [q[:7] for q in P]] for n, P in st.items()],
                'bs': bs, 'x': [c[:6] for c in uniq], 'train': trains, 'shift': [round(float(SHIFT[0]), 2), round(float(SHIFT[1]), 2)]}
if '--dry' not in sys.argv: pack.save(meta, blobs)

if '--overlay' in sys.argv:
    from PIL import Image, ImageDraw
    from compare import shade
    S = 4  # 1 px = 4 m
    h = dtm[::S, ::S]; im = Image.fromarray(shade(h, S)).convert('RGB'); dr = ImageDraw.Draw(im); P = lambda x, z: ((x + HALF) / S, (z + HALF) / S)
    for p, fl, y, br in tracks:
        for i in range(len(p) - 1): dr.line([P(*p[i]), P(*p[i + 1])], fill=(255, 0, 255) if fl[i] else (220, 20, 20), width=2)
    for n, Ps in st.items():
        for q in Ps:
            ax = np.array([math.sin(q[2]), math.cos(q[2])]); bx = np.array([math.cos(q[2]), -math.sin(q[2])]); c = np.array(q[:2])
            dr.polygon([P(*(c + ax * a * q[3] + bx * b * q[4])) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))], fill=(40, 220, 40))
        dr.text(P(np.mean([q[0] for q in Ps]) + 30, np.mean([q[1] for q in Ps])), n, fill=(0, 0, 120))
    for c in uniq:
        col = [(255, 200, 0), (0, 160, 255), (255, 120, 0)][c[2]]; x, z = P(c[0], c[1]); dr.ellipse([x - 4, z - 4, x + 4, z + 4], outline=col, width=2)
    pl = meta.get('play', 1560); dr.rectangle([P(-1560, -1560), P(1560, 1560)], outline=(200, 160, 0))
    im.save('../../shots/geo/rail/overlay.png'); print('overlay ../../shots/geo/rail/overlay.png')
