#!/usr/bin/env python3
"""Fetch the rail features (Holmenkollbanen: track, stations, platforms, crossings) for the world window via Overpass, plus the
roads, paths and ski pistes so rail.py can find where they cross the line (bridge / tunnel tags). Output: raw/osm_rail.json"""
import json, requests
from geo import SIZE, to_latlon
m = SIZE / 2 + 300
s, w = to_latlon(-m, -m); n, e = to_latlon(m, m)
bb = f'{s:.5f},{w:.5f},{n:.5f},{e:.5f}'
q = f'''[out:json][timeout:120];
(
  way["railway"]({bb});
  node["railway"]({bb});
  way["public_transport"]({bb});
  node["public_transport"]({bb});
  relation["public_transport"="stop_area"]({bb});
  way["building"="train_station"]({bb});
  way["building"="transportation"]({bb});
  way["highway"]({bb});
  way["piste:type"]({bb});
);
out body; >; out skel qt;'''
d = None
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
    try:
        r = requests.post(url, data={'data': q}, timeout=180, headers={'User-Agent': 'terrain-prep-script'})
        r.raise_for_status(); d = r.json(); break
    except Exception as ex: print('fail', url, ex)
json.dump(d, open('raw/osm_rail.json', 'w'))
from collections import Counter
c = Counter(x['type'] for x in d['elements']); print(bb, dict(c))
