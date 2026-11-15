#!/usr/bin/env python3
"""Turn raw/dem.npy + raw/osm.json into the compact world data the build embeds: ../../src/data/world.bin
Layout (whole file raw-deflated): u32 jsonLen, json, then binary blobs at the offsets listed in json.blobs.
World frame: x = east, z = south (metres), origin at geo.LAT0/LON0. Rasters: row 0 = north."""
import json, math, zlib, struct, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from geo import SIZE, to_local

HALF = SIZE / 2
osm = json.load(open('raw/osm.json'))
if os.path.exists('raw/osm_parking.json'):   # parking areas fetched separately (older osm.json files lack them)
    have = {(e['type'], e['id']) for e in osm['elements']}
    osm['elements'] += [e for e in json.load(open('raw/osm_parking.json'))['elements'] if (e['type'], e['id']) not in have]
nodes, ways, rels = {}, {}, []
for e in osm['elements']:
    if e['type'] == 'node':
        ea, no = to_local(e['lat'], e['lon']); nodes[e['id']] = (ea, -no); 
    elif e['type'] == 'way': ways[e['id']] = e
    else: rels.append(e)
tagged_nodes = [e for e in osm['elements'] if e['type'] == 'node' and e.get('tags')]
def pts(w): return [nodes[n] for n in w['nodes'] if n in nodes]
def tags(e): return e.get('tags', {})

def rings_of(rel, role):
    segs = [list(ways[m['ref']]['nodes']) for m in rel['members'] if m['type'] == 'way' and m.get('role', 'outer') == role and m['ref'] in ways]
    out = []
    while segs:
        r = segs.pop()
        grown = True
        while r[0] != r[-1] and grown:
            grown = False
            for i, s in enumerate(segs):
                if s[0] == r[-1]: r += s[1:]; segs.pop(i); grown = True; break
                if s[-1] == r[-1]: r += s[-2::-1]; segs.pop(i); grown = True; break
        out.append([nodes[n] for n in r if n in nodes])
    return out

def polys(pred):
    """-> list of (outer, [inners]) for closed ways and multipolygons matching pred(tags)"""
    res = []
    for w in ways.values():
        if pred(tags(w)) and len(w['nodes']) > 3 and w['nodes'][0] == w['nodes'][-1]: res.append((pts(w), []))
    for r in rels:
        if pred(tags(r)):
            inn = rings_of(r, 'inner')
            for o in rings_of(r, 'outer'):
                if len(o) > 2: res.append((o, inn))
    return res

class Raster:
    def __init__(self, n, ss=2, bg=0):
        self.n, self.ss = n, ss; self.im = Image.new('L', (n * ss, n * ss), bg); self.d = ImageDraw.Draw(self.im); self.k = n * ss / SIZE
    def P(self, p): return [((x + HALF) * self.k, (z + HALF) * self.k) for x, z in p]
    def poly(self, plist, v):
        for o, inn in plist:
            if len(o) < 3: continue
            if inn:
                tmp = Image.new('L', self.im.size, 0); td = ImageDraw.Draw(tmp); td.polygon(self.P(o), fill=255)
                for h in inn:
                    if len(h) > 2: td.polygon(self.P(h), fill=0)
                self.im.paste(v, mask=tmp)
            else: self.d.polygon(self.P(o), fill=v)
    def line(self, p, width, v):
        if len(p) > 1:
            w = max(1, round(width * self.k)); q = self.P(p); self.d.line(q, fill=v, width=w, joint='curve')
            for c in (q[0], q[-1]): self.d.ellipse([c[0] - w / 2, c[1] - w / 2, c[0] + w / 2, c[1] + w / 2], fill=v)
    def out(self, blur=0):
        im = self.im.resize((self.n, self.n), Image.LANCZOS if self.ss > 1 else Image.NEAREST)
        if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
        return np.asarray(im, dtype=np.uint8)

# ---------- height: 8 m grid, decimetres above min, 2-D predicted ----------
dem = np.load('raw/dem.npy').astype(np.float64)          # 4 m
d8 = dem[::2, ::2]; HG = d8.shape[0]; hmin = math.floor(d8.min())
q = np.round((d8 - hmin) * 10).astype(np.int64)             # decimetres; predictor: left + up - upleft
pr = np.zeros_like(q); pr[1:, 1:] = q[1:, :-1] + q[:-1, 1:] - q[:-1, :-1]; pr[0, 1:] = q[0, :-1]; pr[1:, 0] = q[:-1, 0]
dq = (q - pr) & 0xFFFF
hgt = (dq & 255).astype(np.uint8).tobytes() + (dq >> 8).astype(np.uint8).tobytes()   # low plane, high plane

# ---------- water / wetland (2 m, antialiased coverage) ----------
N = 2048
isw = lambda t: t.get('natural') == 'water' and t.get('water') not in ('river', 'stream')
water = Raster(N); water.poly(polys(isw), 255); waterA = water.out()
wet = Raster(N); wet.poly(polys(lambda t: t.get('natural') == 'wetland'), 255); wetA = wet.out(1.5)
wetA = np.where(waterA > 0, 0, wetA).astype(np.uint8)

# ---------- tree density (4 m): forest by default, thinned / cleared by land use ----------
TN = 1024
tr = Raster(TN, 4, 255)
tr.poly(polys(lambda t: t.get('landuse') == 'residential'), 70)
tr.poly(polys(lambda t: t.get('natural') == 'wood' or t.get('landuse') == 'forest'), 255)
tr.poly(polys(lambda t: t.get('natural') in ('scrub', 'heath')), 60)
tr.poly(polys(lambda t: t.get('natural') == 'wetland'), 28)
tr.poly(polys(lambda t: t.get('landuse') in ('meadow', 'grass', 'recreation_ground', 'winter_sports') or t.get('natural') in ('grassland', 'bare_rock') or t.get('leisure') in ('pitch', 'stadium', 'park')), 0)
tr.poly(polys(isw), 0)
RW = {'secondary': 11, 'tertiary': 10, 'unclassified': 8, 'residential': 8, 'living_street': 7, 'service': 5, 'track': 4.5, 'pedestrian': 5, 'cycleway': 4, 'footway': 2.5}
roads = []
for w in ways.values():
    t = tags(w); p = pts(w)
    if t.get('highway') in RW and t.get('tunnel') != 'yes': tr.line(p, RW[t['highway']], 0); roads.append((p, RW[t['highway']]))
    if t.get('railway') in ('subway', 'light_rail', 'tram', 'rail') and t.get('tunnel') != 'yes': tr.line(p, 9, 0)
    if t.get('piste:type') == 'downhill': (tr.poly([(p, [])], 0) if t.get('area') == 'yes' or (len(p) > 3 and w['nodes'][0] == w['nodes'][-1]) else tr.line(p, 34, 0))
    if t.get('piste:type') in ('ski_jump', 'sled'): tr.line(p, 26 if t['piste:type'] == 'ski_jump' else 6, 0)
    if t.get('piste:type') == 'nordic': tr.line(p, 9, 0)
    if t.get('aerialway'): tr.line(p, 12, 0)
    if t.get('power') == 'line' or t.get('man_made') == 'cutline': tr.line(p, 22 if t.get('power') else 5, 0)
    if t.get('building') and len(p) > 2: tr.poly([(p, [])], 0); tr.line(p + p[:1], 7, 0)
treeA = (np.round(tr.out() / 36.4) * 36).astype(np.uint8)

# ---------- nordic trails: merge ways into chains ----------
segs = []
for w in ways.values():
    t = tags(w)
    if t.get('piste:type') == 'nordic' and t.get('area') != 'yes' and len(w['nodes']) > 1:
        segs.append({'n': list(w['nodes']), 'lit': t.get('lit') == 'yes' or t.get('piste:lit') == 'yes', 'name': t.get('name') or t.get('piste:name') or '', 'groom': t.get('piste:grooming', '')})
deg = {}
for s in segs:
    for e in (s['n'][0], s['n'][-1]): deg[e] = deg.get(e, 0) + 1
    for m in s['n'][1:-1]: deg[m] = deg.get(m, 0) + 2
def P(n): return nodes[n]
def merge_pass(segs, max_turn, key='lit'):
    """join chain ends meeting at a node; at junctions pick the straightest pair below max_turn (radians)"""
    while True:
        ends = {}
        for i, s in enumerate(segs):
            if s['n'][0] == s['n'][-1]: continue
            for e in (0, -1): ends.setdefault(s['n'][e], []).append((i, e))
        best = None
        for nd, lst in ends.items():
            for a in range(len(lst)):
                for b in range(a + 1, len(lst)):
                    (i, ea), (j, eb) = lst[a], lst[b]
                    if i == j or segs[i][key] != segs[j][key]: continue
                    pa = P(segs[i]['n'][1 if ea == 0 else -2]); pb = P(segs[j]['n'][1 if eb == 0 else -2]); c = P(nd)
                    v1 = (c[0] - pa[0], c[1] - pa[1]); v2 = (pb[0] - c[0], pb[1] - c[1])
                    l = math.hypot(*v1) * math.hypot(*v2)
                    if l < 1e-6: continue
                    turn = math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l)))
                    if len(lst) == 2: turn *= 0.3                      # plain continuation: almost always join
                    if turn < max_turn and (best is None or turn < best[0]): best = (turn, i, ea, j, eb)
        if not best: return
        _, i, ea, j, eb = best
        an = segs[i]['n'] if ea == -1 else segs[i]['n'][::-1]; bn = segs[j]['n'] if eb == 0 else segs[j]['n'][::-1]
        segs[i]['n'] = an + bn[1:]; segs[i]['name'] = segs[i].get('name') or segs[j].get('name'); segs.pop(j)
merge_pass(segs, 0.7)
def plen(p): return sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))
trails = []
for s in segs:
    p = [nodes[n] for n in s['n'] if n in nodes]
    # clip to the world window (keep runs of points inside)
    run = []
    for x, z in p + [None] if False else p:
        if abs(x) < HALF - 40 and abs(z) < HALF - 40: run.append((x, z))
        else:
            if len(run) > 1 and plen(run) > 25: trails.append((run, s))
            run = []
    if len(run) > 1 and plen(run) > 25: trails.append((run, s))
trails.sort(key=lambda t: (-t[1]['lit'], -plen(t[0])))
tb = bytearray(); tmeta = []
for p, s in trails:
    tmeta.append([len(p), 1 if s['lit'] else 0, s['name']])
    for x, z in p: tb += struct.pack('<hh', round(x * 8), round(z * 8))

# ---------- plowed roads (the ones you navigate by) + surface parking ----------
ROADS = ('Holmenkollveien', 'Voksenkollveien', 'Øvreseterveien', 'Tryvannsveien')
RWID = {'secondary': 7.0, 'tertiary': 6.0, 'unclassified': 5.5, 'service': 4.5}
ROAD_ZMAX = 1565          # Holmenkollveien stops a few hundred metres below the arena
rsegs = []; tunnels = []
for w in ways.values():
    t = tags(w)
    if t.get('name') in ROADS and t.get('highway') in RWID and len(w['nodes']) > 1:
        rsegs.append({'n': list(w['nodes']), 'w': RWID[t['highway']]})
        if t.get('tunnel') == 'yes': tunnels.append([round(v, 1) for q in pts(w) for v in q])
merge_pass(rsegs, 0.9, 'w')
rb = bytearray(); rmeta = []; rkm = 0
for s in rsegs:
    run = []
    for x, z in [nodes[n] for n in s['n'] if n in nodes] + [(9e9, 0)]:
        if abs(x) < 1700 and abs(z) < 1700 and z < ROAD_ZMAX: run.append((x, z)); continue
        if len(run) > 1 and plen(run) > 25:
            rmeta.append([len(run), round(s['w'] * 10)]); rkm += plen(run) / 1000
            for a, b in run: rb += struct.pack('<hh', round(a * 8), round(b * 8))
        run = []
def simplify(p, tol):     # Douglas-Peucker on an open polyline
    if len(p) < 3: return p
    (ax, az), (bx, bz) = p[0], p[-1]; l = math.hypot(bx - ax, bz - az) or 1e-9
    d = [abs((x - ax) * (bz - az) - (z - az) * (bx - ax)) / l for x, z in p[1:-1]]; k = max(range(len(d)), key=d.__getitem__)
    return p if False else (simplify(p[:k + 2], tol)[:-1] + simplify(p[k + 1:], tol) if d[k] > tol else [p[0], p[-1]])
def parea(p): return abs(sum(p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1] for i in range(len(p) - 1))) / 2
pk = bytearray(); pmeta = []; parks = []
for o, inn in polys(lambda t: t.get('amenity') == 'parking' and not t.get('building') and t.get('parking', 'surface') in ('surface', 'lane', 'street_side')):
    if o[0] != o[-1]: o = o + o[:1]
    cx = sum(q[0] for q in o) / len(o); cz = sum(q[1] for q in o) / len(o)
    if parea(o) < 150 or abs(cx) > 1650 or abs(cz) > 1650 or cz > ROAD_ZMAX + 60 or any(parea(o) == parea(q) and (cx, cz) == c for q, c in parks): continue
    parks.append((o, (cx, cz)))
    h = len(o) // 2; q = simplify(o[:h + 1], 0.6)[:-1] + simplify(o[h:], 0.6)[:-1]      # closed ring, without the repeated point
    pmeta.append(len(q))
    for a, b in q: pk += struct.pack('<hh', round(a * 8), round(b * 8))
tr2 = Raster(TN, 4, 0); tr2.poly([(o, []) for o, _ in parks], 255)
treeA = np.where(tr2.out() > 60, 0, treeA).astype(np.uint8)

# ---------- buildings: minimum-area bounding rectangle ----------
def mbr(p):
    best = None
    for i in range(len(p) - 1):
        dx, dz = p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]; l = math.hypot(dx, dz)
        if l < 0.5: continue
        ux, uz = dx / l, dz / l
        us = [x * ux + z * uz for x, z in p]; vs = [-x * uz + z * ux for x, z in p]
        w, d = max(us) - min(us), max(vs) - min(vs)
        if best is None or w * d < best[0]:
            cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (w * d, cu * ux - cv * uz, cu * uz + cv * ux, w, d, math.atan2(uz, ux))
    return best
def area(p): return abs(sum(p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1] for i in range(len(p) - 1))) / 2
KIND = {'house': 0, 'detached': 0, 'residential': 0, 'semidetached_house': 0, 'terrace': 0, 'yes': 0, 'cabin': 1, 'hut': 1, 'garage': 2, 'garages': 2, 'shed': 2, 'apartments': 3, 'hotel': 3, 'school': 3, 'office': 3, 'retail': 3, 'civic': 3, 'kindergarten': 3, 'warehouse': 3, 'church': 4, 'chapel': 4}
bb = bytearray(); nb = 0; named = {}
for w in ways.values():
    t = tags(w)
    if not t.get('building') or len(w['nodes']) < 4: continue
    p = pts(w); a = area(p); r = mbr(p)
    if t.get('name'): named[t['name']] = {'x': round(r[1], 1), 'z': round(r[2], 1), 'w': round(r[3], 1), 'd': round(r[4], 1), 'yaw': round(r[5], 3)} if r else None
    if not r or a < 18 or abs(r[1]) > 1900 or abs(r[2]) > 1900 or t.get('location') == 'underground': continue
    _, cx, cz, bw, bd, yaw = r
    if bd > bw: bw, bd, yaw = bd, bw, yaw + math.pi / 2          # long side first
    fill = a / (bw * bd)                                          # L-shapes etc: shrink to footprint area
    k = math.sqrt(max(0.6, min(1, fill))); bw *= k; bd *= k
    lv = t.get('building:levels'); lv = float(lv) if lv and lv.replace('.', '').isdigit() else 0
    yaw = (yaw + math.pi / 2) % math.pi - math.pi / 2
    bb += struct.pack('<hhHHhBB', round(cx * 8), round(cz * 8), round(bw * 8), round(bd * 8), round(yaw * 10000), KIND.get(t['building'], 0), min(255, round(lv * 10))); nb += 1

# ---------- landmarks ----------
lm = {'named': {k: v for k, v in named.items() if v and k in ('Frognerseteren', 'Holmenkollen kapell', 'Skiforeningen', 'Scandic Holmenkollen Park', 'Kongsseteren', 'Heftye-villaen', 'Lysebu', 'Toppsenteret')}}
lm['jumps'] = [{'name': tags(w).get('name', ''), 'pts': [[round(x, 1), round(z, 1)] for x, z in pts(w)], 'tags': {k: v for k, v in tags(w).items() if k in ('ele', 'height', 'piste:difficulty', 'man_made', 'area')}} for w in ways.values() if tags(w).get('piste:type') == 'ski_jump']
lm['towers'] = [{'name': tags(e).get('name', ''), 'x': round(nodes[e['id']][0], 1), 'z': round(nodes[e['id']][1], 1), 'h': tags(e).get('height', ''), 'kind': tags(e).get('man_made')} for e in tagged_nodes if tags(e).get('man_made') in ('tower', 'mast')]
lm['peaks'] = [{'name': tags(e).get('name', ''), 'x': round(nodes[e['id']][0], 1), 'z': round(nodes[e['id']][1], 1), 'ele': tags(e).get('ele', '')} for e in tagged_nodes if tags(e).get('natural') == 'peak']
lm['power'] = [[[round(x, 1), round(z, 1)] for x, z in pts(w)] for w in ways.values() if tags(w).get('power') == 'line']
lm['rail'] = [[[round(x, 1), round(z, 1)] for x, z in pts(w)] for w in ways.values() if tags(w).get('railway') == 'subway' and tags(w).get('tunnel') != 'yes']
lm['lakes'] = [{'name': tags(w).get('name'), 'x': round(sum(p[0] for p in pts(w)) / len(pts(w)), 1), 'z': round(sum(p[1] for p in pts(w)) / len(pts(w)), 1)} for w in ways.values() if isw(tags(w)) and tags(w).get('name')]
json.dump(lm, open('raw/landmarks.json', 'w'), indent=1, ensure_ascii=False)

# ---------- pack ----------
blobs = {}; body = bytearray()
def add(name, b): blobs[name] = [len(body), len(b)]; body.extend(b)
add('hgt', hgt); add('water', waterA.tobytes()); add('wet', wetA.tobytes()); add('tree', treeA.tobytes()); add('trails', bytes(tb)); add('bld', bytes(bb)); add('roads', bytes(rb)); add('park', bytes(pk))
meta = {'hn': HG, 'hstep': 8, 'hmin': hmin, 'n': N, 'tn': TN, 'trails': tmeta, 'nb': nb, 'roads': rmeta, 'tunnels': tunnels, 'park': pmeta, 'blobs': blobs}
js = json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode()
raw = struct.pack('<I', len(js)) + js + bytes(body)
co = zlib.compressobj(9, zlib.DEFLATED, -15); z = co.compress(raw) + co.flush()
os.makedirs('../../src/data', exist_ok=True); open('../../src/data/world.bin', 'wb').write(z)
print('trails', len(trails), 'km', round(sum(plen(p) for p, _ in trails) / 1000, 1), 'lit km', round(sum(plen(p) for p, s in trails if s['lit']) / 1000, 1), 'buildings', nb, 'roads', len(rmeta), 'km', round(rkm, 2), 'tunnels', len(tunnels), 'parking', len(pmeta))
for k, (o, l) in blobs.items(): print(f'  {k:7s} raw {l / 1024:8.1f} kB  deflated {len(zlib.compress(bytes(body[o:o + l]), 9)) / 1024:7.1f} kB')
print('world.bin', round(len(z) / 1024, 1), 'kB; json', len(js))
# preview
pv = np.zeros((N, N, 3), np.uint8); g = np.asarray(Image.fromarray(treeA).resize((N, N)))
sh = np.asarray(Image.open('raw/dem.png').resize((N, N)))
pv[..., 0] = sh // 2 + wetA // 3; pv[..., 1] = sh // 3 + g // 3; pv[..., 2] = sh // 2 + waterA // 2
im = Image.fromarray(pv); d = ImageDraw.Draw(im)
for p, s in trails: d.line([((x + HALF) / 2, (z + HALF) / 2) for x, z in p], fill=(255, 220, 60) if s['lit'] else (255, 90, 60), width=2)
o = 0
for n, w in rmeta:
    d.line([((x / 8 + HALF) / 2, (z / 8 + HALF) / 2) for x, z in struct.iter_unpack('<hh', bytes(rb[o:o + n * 4]))], fill=(40, 40, 40), width=3); o += n * 4
for p, _ in parks: d.polygon([((x + HALF) / 2, (z + HALF) / 2) for x, z in p], fill=(90, 90, 110))
im.save('raw/preview.png')
