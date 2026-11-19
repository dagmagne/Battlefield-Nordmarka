#!/usr/bin/env python3
"""Post-pass on world.bin: the whole plowed road network from OpenStreetMap (raw/osm_roads.json from fetch_roads.py),
checked against the 1 m lidar ground (raw/dtm1.npy). Rewrites only the road keys:
  blob 'roads'   int16 x*8, z*8 per point (unchanged format); the seven original roads come first, byte for byte
  meta 'roads'   [n, width*10, class] per polyline (class: 0 one of the original seven, 1 secondary 2 tertiary 3 unclassified 4 residential 5 living street
                 6 service 7 driveway / parking aisle 8 track; the game reads n and width as before)
  meta 'rbr'     tagged bridges [[x0, z0, x1, z1, ...], class, layer, name] (passable at grade for now: the game lays the
                 profile straight across them)
  meta 'rtun'    tagged road tunnels other than the two under the ski bridges (meta 'tunnels', unchanged), same shape
Selection: everything a car drives on (secondary .. living_street; service roads except driveways under 30 m and private
stubs; parking aisles; grade-1 tracks that are not ski trails and join the network). Ways are split at junctions and
joined into chains through the straightest continuation, so the game smooths the profile over junctions.
Alignment: the cross-section under the line must be flat. Per chain the best lateral offset in -8..8 m is found every 4 m;
a chain whose bed is consistently 1.5-8 m off is shifted onto it, one with no bed nearby is dropped (listed).
  .venv/bin/python roads.py [--dry] [--png]   (--png: ../../shots/geo/roads/network.png, the network over the lidar hillshade)"""
import sys, json, math, struct, os
from collections import defaultdict, Counter
import numpy as np
from scipy.ndimage import map_coordinates, median_filter
from geo import to_local
import pack

LIM = 2040.0                       # clip to the heightmap window (+-2048 m)
CLS = {'secondary': 1, 'tertiary': 2, 'unclassified': 3, 'residential': 4, 'living_street': 5, 'service': 6, 'track': 8}
WID = {1: 7.0, 2: 6.0, 3: 5.5, 4: 4.6, 5: 4.0, 6: 4.0, 7: 3.2, 8: 3.5}
NAMES = ['', 'secondary', 'tertiary', 'unclassified', 'residential', 'living street', 'service', 'driveway/aisle', 'track']

d = json.load(open('raw/osm_roads.json'))
P = {}
for e in d['elements']:
    if e['type'] == 'node': x, n = to_local(e['lat'], e['lon']); P[e['id']] = (x, -n)
ways = [e for e in d['elements'] if e['type'] == 'way' and len(e['nodes']) > 1]
def plen(p): return sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))
def wpts(w): return [P[n] for n in w['nodes'] if n in P]
meta, blobs = pack.load()

# ---------- ski trails (groomed already: a track on a trail is not a plowed road) ----------
tr = np.frombuffer(blobs['trails'], '<i2').reshape(-1, 2) / 8.0
TG = defaultdict(list); _o = 0
for _n, *_ in meta['trails']:          # the trail polylines, resampled to 2 m (the blob holds only the OSM shape points)
    _p = tr[_o:_o + _n]; _o += _n
    for i in range(len(_p) - 1):
        (ax, az), (bx, bz) = _p[i], _p[i + 1]; k = max(1, int(math.hypot(bx - ax, bz - az) / 2))
        for j in range(k): x, z = ax + (bx - ax) * j / k, az + (bz - az) * j / k; TG[(int(x // 16), int(z // 16))].append((x, z))
def near_trail(x, z, r=7):
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for a, b in TG.get((int(x // 16) + i, int(z // 16) + j), ()):
                if (a - x) ** 2 + (b - z) ** 2 < r * r: return True
    return False
def densify(p, step=4.0):
    out = [p[0]]
    for i in range(len(p) - 1):
        (ax, az), (bx, bz) = p[i], p[i + 1]; n = max(1, int(math.dist(p[i], p[i + 1]) / step))
        out += [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(1, n + 1)]
    return out

# ---------- selection ----------
sel, why = [], Counter()
for w in ways:
    t = w['tags']; hw = t.get('highway'); c = CLS.get(hw); p = wpts(w)
    if not c or len(p) < 2: why[hw or '-'] += 1; continue
    if t.get('area') == 'yes': why['area'] += 1; continue
    L = plen(p); sv = t.get('service'); acc = t.get('access', ''); sp = t.get('snowplowing')
    if sp == 'no': why['snowplowing=no'] += 1; continue
    # gravel forest roads closed to cars (Nordmarka's skogsbilveier) are groomed ski trails in winter, unless tagged as plowed
    if sp != 'yes' and c >= 3 and (t.get('tracktype') or (t.get('motor_vehicle') in ('private', 'no') and not t.get('name'))):
        why['forest road (gravel / closed, not snowplowing=yes)'] += 1; continue
    if hw == 'track' and sp != 'yes': why['track'] += 1; continue
    if hw == 'service' and sp != 'yes' and t.get('service') != 'driveway' and t.get('surface') in ('compacted', 'gravel', 'fine_gravel', 'unpaved', 'dirt', 'ground', 'grass'):
        why['unpaved service road (forest / arena maintenance)'] += 1; continue
    if hw == 'service':
        if sv in ('driveway', 'parking_aisle', 'drive-through'): c = 7
        if sv == 'driveway' and L < 30: why['driveway<30'] += 1; continue
        if acc in ('private', 'no') and L < 40: why['private stub'] += 1; continue
        if sv in ('emergency_access',): why['emergency'] += 1; continue
    if hw == 'track':
        if t.get('tracktype', 'grade1') != 'grade1' or t.get('motor_vehicle') in ('no', 'private') or acc in ('no', 'private'): why['track'] += 1; continue
        q = densify(p, 6.0)
        if sum(near_trail(x, z) for x, z in q) > 0.3 * len(q): why['track on ski trail'] += 1; continue
    if c in (3, 6, 7) and sp != 'yes':     # service roads that run along a groomed ski trail (the stadium loops) are the trail in winter
        q = densify(p, 4.0)
        if sum(near_trail(x, z, 5) for x, z in q) > 0.5 * len(q): why['service road on a ski trail'] += 1; continue
    try: wd = float(str(t.get('width', '')).replace(',', '.').split()[0])
    except Exception: wd = 0
    wd = min(9.0, max(3.0, wd - 1.0)) if wd else WID[c]      # a tagged width is usually the whole carriageway incl. shoulders
    sel.append({'id': w['id'], 'n': [n for n in w['nodes'] if n in P], 'c': c, 'w': wd, 'name': t.get('name', ''), 'L': L,
                'br': t.get('bridge', 'no') not in ('no',), 'tu': t.get('tunnel', 'no') not in ('no',) and t.get('tunnel') != 'building_passage',
                'layer': t.get('layer', '0')})

# connectivity: service roads and tracks have to join the street network (or be long)
deg = Counter(n for s in sel for n in s['n'])
par = {}
def find(a):
    while par.get(a, a) != a: par[a] = par.get(par[a], par[a]); a = par[a]
    return a
for s in sel:
    for a, b in zip(s['n'], s['n'][1:]): ra, rb = find(a), find(b); par[ra] = rb
size = Counter()
for s in sel:
    if s['c'] <= 5: size[find(s['n'][0])] += s['L']
keep = []
for s in sel:
    if s['c'] >= 6 and size[find(s['n'][0])] < 100 and s['L'] < 150: why['isolated service/track'] += 1; continue
    keep.append(s)
sel = keep
# long tunnels (Kongeveien under Holmenkollbakken's landing hill) are cut out: the street ends at the portals, no asphalt strip over the hill
cut = [s for s in sel if s['tu'] and s['L'] > 30]; sel = [s for s in sel if s not in cut]
def wpts_n(s): return [P[n] for n in s['n']]

# ---------- split at junctions into edges, pair edges through the straightest continuation, build chains ----------
deg = Counter()
for s in sel:
    for i, n in enumerate(s['n']): deg[n] += 1 if i in (0, len(s['n']) - 1) else 2
edges = []
for s in sel:
    cur = [s['n'][0]]
    for n in s['n'][1:]:
        cur.append(n)
        if deg[n] > 2 and n != s['n'][-1]: edges.append({**s, 'n': cur}); cur = [n]
    if len(cur) > 1: edges.append({**s, 'n': cur})
ends = defaultdict(list)          # node -> [(edge index, at start?)]
for k, e in enumerate(edges): ends[e['n'][0]].append((k, True)); ends[e['n'][-1]].append((k, False))
def outdir(k, st):
    n = edges[k]['n']; a = P[n[0] if st else n[-1]]
    for m in (n[1:] if st else n[-2::-1]):
        b = P[m]
        if math.dist(a, b) > 6 or m == (n[-1] if st else n[0]): break
    l = math.dist(a, b) or 1; return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
pair = {}
for v, E in ends.items():
    if len(E) < 2: continue
    cand = []
    for i in range(len(E)):
        for j in range(i + 1, len(E)):
            (ka, sa), (kb, sb) = E[i], E[j]
            if ka == kb: continue
            da, db = outdir(ka, sa), outdir(kb, sb); st = -(da[0] * db[0] + da[1] * db[1])
            ea, eb = edges[ka], edges[kb]
            sc = st + (0.35 if ea['id'] == eb['id'] else 0) + (0.25 if ea['name'] and ea['name'] == eb['name'] else 0) - 0.08 * abs(ea['c'] - eb['c'])
            if st > 0.6: cand.append((sc, E[i], E[j]))
    for sc, a, b in sorted(cand, reverse=True):
        if a in pair or b in pair: continue
        pair[a] = b; pair[b] = a
used = set(); chains = []
for k0 in range(len(edges)):
    if k0 in used: continue
    seq = [(k0, True)]; used.add(k0)        # (edge, forward)
    for side in (0, 1):                      # extend after the end, then before the start
        while True:
            k, fw = seq[-1] if side == 0 else seq[0]
            endpt = (k, not fw) if side == 0 else (k, fw)      # the free end: forward edge ends at its last node
            nx = pair.get(endpt)
            if not nx or nx[0] in used: break
            k2, st2 = nx; used.add(k2)
            if side == 0: seq.append((k2, st2))
            else: seq.insert(0, (k2, not st2))
    nodes = []; cs = Counter(); br = []; tu = []
    for k, fw in seq:
        n = edges[k]['n'] if fw else edges[k]['n'][::-1]
        nodes += n if not nodes else n[1:]
        L = plen([P[m] for m in n]); cs[(edges[k]['c'], edges[k]['w'])] += L
        if edges[k]['br']: br.append(([P[m] for m in n], edges[k]))
        if edges[k]['tu']: tu.append(([P[m] for m in n], edges[k]))
    (c, wd), _ = cs.most_common(1)[0]
    names = Counter(edges[k]['name'] for k, _ in seq)
    chains.append({'p': [P[m] for m in nodes], 'c': min(cc for cc, _ in cs), 'cm': c, 'w': wd, 'name': names.most_common(1)[0][0], 'br': br, 'tu': tu})
# a chain takes the width of its dominant class; the class code is the most important one on it (for the map)

# ---------- the seven original roads, kept byte for byte; drop the parts of new chains that lie along them ----------
old = np.frombuffer(blobs['roads'], '<i2').reshape(-1, 2)
OLD_N = 7
oldmeta = meta['roads'][:OLD_N]
if len(meta['roads']) > OLD_N or any(len(r) > 2 for r in oldmeta):   # re-run: recover the original blob from the first seven
    pass
no = sum(n for n, _w, *_ in oldmeta); oldb = old[:no].tobytes()
op = []; o = 0
for n, w10, *_ in oldmeta: op.append((old[o:o + n] / 8.0, w10 / 20)); o += n
OG = defaultdict(list)
for pi, (p, hw) in enumerate(op):
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        for q in densify([tuple(a), tuple(b)], 8):
            OG[(int(q[0] // 16), int(q[1] // 16))].append((pi, i))
def along_old(x, z, dx, dz):
    best = 99
    for gi in (-1, 0, 1):
        for gj in (-1, 0, 1):
            for pi, i in OG.get((int(x // 16) + gi, int(z // 16) + gj), ()):
                a, b = op[pi][0][i], op[pi][0][i + 1]; v = b - a; l2 = float(v @ v) or 1e-9
                u = min(1, max(0, ((x - a[0]) * v[0] + (z - a[1]) * v[1]) / l2)); dd = math.hypot(x - a[0] - v[0] * u, z - a[1] - v[1] * u)
                if dd < best and abs(dx * v[0] + dz * v[1]) / math.sqrt(l2) > 0.9: best = dd
    return best
def clip_runs(p):          # split at the window edge
    runs, cur = [], []
    for x, z in p:
        if abs(x) <= LIM and abs(z) <= LIM: cur.append((x, z))
        else:
            if len(cur) > 1: runs.append(cur)
            cur = []
    if len(cur) > 1: runs.append(cur)
    return runs
newc = []
for ch in chains:
    q = densify(ch['p'], 2.0); m = len(q); cov = np.zeros(m, bool)
    for i in range(m):
        a, b = q[max(0, i - 1)], q[min(m - 1, i + 1)]; dx, dz = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dz) or 1
        cov[i] = along_old(q[i][0], q[i][1], dx / l, dz / l) < 3.5
    if cov.all(): continue
    i = 0
    while i < m:                             # runs not along an original road; they reach 4 points into it so the beds join
        if cov[i]: i += 1; continue
        j = i
        while j < m and not cov[j]: j += 1
        run = q[max(0, i - 4):min(m, j + 4)]
        if plen(run) >= 12:
            for r in clip_runs(run):
                if plen(r) >= 12: newc.append({**ch, 'p': r})
        i = j

# ---------- lidar: flat bed under the line? ----------
dtm = np.load('raw/dtm1.npy').astype(np.float32)
def H(x, z): return map_coordinates(dtm, [np.asarray(z) + 2048, np.asarray(x) + 2048], order=1, mode='nearest')
T = np.arange(-12, 12.01, 0.5); S = np.arange(-8, 8.01, 0.5)
def flat(ch):
    """per 4 m sample: residual std of a linear fit across the asphalt at offset s, for every s in S"""
    q = densify(ch['p'], 4.0)
    if len(q) < 2: return None, None, None
    q = np.array(q); tg = np.gradient(q, axis=0); tg /= np.linalg.norm(tg, axis=1)[:, None] + 1e-9; nn = np.stack([-tg[:, 1], tg[:, 0]], 1)
    X = q[:, 0, None] + nn[:, 0, None] * T[None]; Z = q[:, 1, None] + nn[:, 1, None] * T[None]
    h = H(X.ravel(), Z.ravel()).reshape(X.shape)
    hw = max(1.6, ch['w'] / 2 - 0.4); F = np.zeros((len(q), len(S)))
    for k, s in enumerate(S):
        m = np.abs(T - s) <= hw; t = T[m] - s; y = h[:, m]
        A = np.stack([np.ones_like(t), t], 1); coef, *_ = np.linalg.lstsq(A, y.T, rcond=None)
        F[:, k] = (y - (A @ coef).T).std(1)
    return q, nn, F
stats, snapped, dropped, out = [], [], [], []
for ch in newc:
    q, nn, F = flat(ch)
    if q is None: continue
    f0 = F[:, len(S) // 2]; bi = F.argmin(1); bs = S[bi]; fb = F[np.arange(len(q)), bi]
    # a lateral shift only counts where the bed there is clearly flatter than under the line
    good = (fb < 0.12) & (f0 > 2 * fb + 0.03)
    off = np.where(good, bs, 0.0)
    offs = median_filter(off, size=min(len(off) | 1, 11), mode='nearest')
    L = plen(ch['p']); med0 = float(np.median(f0))
    stats.append((ch['c'], L, med0, float(np.median(np.abs(offs))), float(np.median(fb))))
    if np.mean(np.abs(offs) >= 1.5) > 0.5 and abs(np.median(offs)) >= 1.5 and np.mean(np.sign(offs[offs != 0]) == np.sign(np.median(offs))) > 0.8:
        # shift the whole chain along its normals (smoothed offset), keeping the junction ends in place over 8 m
        p = np.array(densify(ch['p'], 4.0)); sm = np.convolve(np.pad(offs, 5, mode='edge'), np.ones(11) / 11, 'valid')
        ramp = np.minimum(1, np.minimum(np.arange(len(p)), np.arange(len(p))[::-1]) / 2.0)
        p = p + nn * (sm * ramp)[:, None]
        snapped.append((ch['name'] or NAMES[ch['c']], round(L), round(float(np.median(offs)), 1), round(med0, 2), [round(float(v)) for v in p[len(p) // 2]]))
        ch = {**ch, 'p': [tuple(v) for v in p]}
    elif med0 > 0.35 and float(np.median(fb)) > 0.25 and ch['c'] >= 6:
        dropped.append((ch['name'] or NAMES[ch['c']], round(L), round(med0, 2), [round(float(v)) for v in q[len(q) // 2]])); continue
    out.append(ch)

# ---------- report ----------
def rep(title, items):
    print(title); km = defaultdict(float); n = Counter()
    for c, L in items: km[c] += L / 1000; n[c] += 1
    for c in sorted(km): print(f'   {NAMES[c]:16s} {n[c]:5d} polylines {km[c]:7.2f} km')
    print(f'   {"total":16s} {sum(n.values()):5d} polylines {sum(km.values()):7.2f} km')
rep('selected OSM ways (before joining):', [(s['c'], s['L']) for s in sel])
print('not plowed:', dict(why))
rep(f'original roads kept: {OLD_N}', [({70: 1, 60: 2, 55: 3, 45: 6}.get(w10, 6), plen([tuple(v) for v in p])) for (p, _), (_n, w10, *_) in zip(op, oldmeta)])
rep('new chains (after joining, clipping, minus the original roads):', [(ch['c'], plen(ch['p'])) for ch in out])
st = np.array([s[2] for s in stats]); Ls = np.array([s[1] for s in stats])
print('cross-section std under the line (median per chain): p10/p50/p90 %.3f / %.3f / %.3f m, length-weighted median %.3f m' %
      (*np.percentile(st, [10, 50, 90]), st[np.argsort(st)][np.searchsorted(np.cumsum(Ls[np.argsort(st)]), Ls.sum() / 2)]))
for c in sorted(set(s[0] for s in stats)):
    v = np.array([s[2] for s in stats if s[0] == c]); print(f'   {NAMES[c]:16s} median {np.median(v):.3f}  p90 {np.percentile(v, 90):.3f}  ({len(v)})')
print('snapped', len(snapped)); [print('   ', s) for s in snapped]
print('dropped (no road bed within 8 m)', len(dropped)); [print('   ', s) for s in dropped]
# the originals, measured the same way
o_f = [float(np.median(flat({'p': [tuple(v) for v in p], 'w': hw * 2})[2][:, len(S) // 2])) for p, hw in op]
print('original roads, same measure:', [round(v, 3) for v in o_f])

# ---------- bridges and tunnels (from the selected ways; inside the window) ----------
def inwin(p): return any(abs(x) <= LIM and abs(z) <= LIM for x, z in p)
rbr = [[[round(v, 1) for q in wpts_n(s) for v in q], s['c'], s['layer'], s['name']] for s in sel + cut if s['br'] and inwin(wpts_n(s))]
rtun = [[[round(v, 1) for q in wpts_n(s) for v in q], s['c'], s['layer'], s['name'], 'cut' if s in cut else 'at grade'] for s in sel + cut if s['tu'] and inwin(wpts_n(s))]
skib = lambda r: any(min(math.dist(r[0][:2], t[:2]), math.dist(r[0][:2], t[-2:])) < 30 for t in meta['tunnels'])   # the two under the ski bridges (handled as before)
rtun = [r for r in rtun if not skib(r)]
print('bridges (plowed at grade, profile laid straight across):'); [print('   ', NAMES[r[1]], r[3] or '-', 'layer', r[2], 'at', [round(v) for v in r[0][:2]], '..', [round(v) for v in r[0][-2:]], round(plen(list(zip(r[0][::2], r[0][1::2])))), 'm') for r in rbr]
print('tunnels (other than the ski-bridge pair):'); [print('   ', NAMES[r[1]], r[3] or '-', 'layer', r[2], 'at', [round(v) for v in r[0][:2]], '..', [round(v) for v in r[0][-2:]], round(plen(list(zip(r[0][::2], r[0][1::2])))), 'm', r[4]) for r in rtun]
rtun = [r[:4] for r in rtun]

# ---------- write ----------
def simplify(p, tol):     # Douglas-Peucker, iterative
    keep = [False] * len(p); keep[0] = keep[-1] = True; st = [(0, len(p) - 1)]
    while st:
        a, b = st.pop(); (ax, az), (bx, bz) = p[a], p[b]; l = math.hypot(bx - ax, bz - az) or 1e-9; dm, k = -1, -1
        for i in range(a + 1, b):
            dd = abs((p[i][0] - ax) * (bz - az) - (p[i][1] - az) * (bx - ax)) / l
            if dd > dm: dm, k = dd, i
        if dm > tol: keep[k] = True; st += [(a, k), (k, b)]
    return [v for v, kk in zip(p, keep) if kk]
rb = bytearray(oldb); rmeta = [[n, w10, 0] for n, w10, *_ in oldmeta]   # class 0: one of the seven original roads (the game keeps their old bed)
for ch in sorted(out, key=lambda c: c['c']):
    q = simplify(list(ch['p']), 0.2)          # the coverage test worked on a 2 m resampling: back to the shape points
    rmeta.append([len(q), round(ch['w'] * 10), ch['c']])
    for x, z in q: rb += struct.pack('<hh', round(x * 8), round(z * 8))
blobs['roads'] = bytes(rb); meta['roads'] = rmeta; meta['rbr'] = rbr; meta['rtun'] = rtun
print('roads blob', len(rb), 'bytes,', len(rmeta), 'polylines,', len(rb) // 4, 'points')
if '--dry' not in sys.argv: pack.save(meta, blobs)

if '--png' in sys.argv:
    from PIL import Image, ImageDraw
    h = dtm[::2, ::2][:2048, :2048]; gy, gx = np.gradient(h, 2.0)
    az, alt = math.radians(315), math.radians(40); sl = np.arctan(np.hypot(gx, gy)); asp = np.arctan2(-gx, gy)
    sh = np.clip(np.sin(alt) * np.cos(sl) + np.cos(alt) * np.sin(sl) * np.cos(az - asp), 0, 1)
    im = Image.fromarray((sh * 170 + 50).astype(np.uint8)).convert('RGB'); dr = ImageDraw.Draw(im)
    COL = {1: (255, 60, 40), 2: (255, 150, 30), 3: (250, 220, 40), 4: (60, 200, 255), 5: (140, 255, 140), 6: (200, 120, 255), 7: (255, 120, 200), 8: (150, 110, 60)}
    for (p, hw) in op: dr.line([((x + 2048) / 2, (z + 2048) / 2) for x, z in p], fill=(255, 255, 255), width=5)
    for ch in out: dr.line([((x + 2048) / 2, (z + 2048) / 2) for x, z in ch['p']], fill=COL[ch['c']], width=3 if ch['c'] <= 3 else 2)
    for r in rbr: dr.line([((r[0][i] + 2048) / 2, (r[0][i + 1] + 2048) / 2) for i in range(0, len(r[0]), 2)], fill=(0, 0, 0), width=7)
    for r in rtun + [[t] for t in meta['tunnels']]: dr.line([((r[0][i] + 2048) / 2, (r[0][i + 1] + 2048) / 2) for i in range(0, len(r[0]), 2)], fill=(0, 255, 0), width=7)
    pl = 1560; dr.rectangle([(-pl + 2048) / 2, (-pl + 2048) / 2, (pl + 2048) / 2, (pl + 2048) / 2], outline=(255, 207, 90))
    y = 10
    for c in range(1, 9): dr.rectangle([10, y, 30, y + 12], fill=COL[c]); dr.text((36, y), NAMES[c], fill=(255, 255, 255)); y += 18
    dr.text((36, y), 'white: original 7, black: bridge, green: tunnel', fill=(255, 255, 255))
    os.makedirs('../../shots/geo/roads', exist_ok=True); im.save('../../shots/geo/roads/network.png'); print('wrote shots/geo/roads/network.png')
