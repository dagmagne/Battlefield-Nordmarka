#!/usr/bin/env python3
"""Fetch the OpenStreetMap highway ways (with their tags and node coordinates) for the world window via Overpass.
Output: raw/osm_roads.json (cached; delete it to fetch again). Only the bounding box is sent. Data © OpenStreetMap contributors (ODbL)."""
import json, os, sys, requests
from geo import SIZE, to_latlon
OUT = 'raw/osm_roads.json'
if os.path.exists(OUT) and '--force' not in sys.argv: print('cached', OUT); sys.exit()
m = SIZE / 2 + 100
s, w = to_latlon(-m, -m); n, e = to_latlon(m, m)
bb = f'{s:.5f},{w:.5f},{n:.5f},{e:.5f}'
q = f'''[out:json][timeout:120];
way["highway"]({bb});
out body; >; out skel qt;'''
d = None
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
    try:
        r = requests.post(url, data={'data': q}, timeout=180, headers={'User-Agent': 'terrain-prep-script'})
        r.raise_for_status(); d = r.json(); break
    except Exception as ex: print('fail', url, ex)
if d is None: sys.exit('no Overpass server answered')
os.makedirs('raw', exist_ok=True); json.dump(d, open(OUT, 'w'))
from collections import Counter
print(bb, dict(Counter(x['type'] for x in d['elements'])))
print(dict(Counter(x['tags'].get('highway') for x in d['elements'] if x['type'] == 'way')))
