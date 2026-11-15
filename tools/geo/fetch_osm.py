#!/usr/bin/env python3
"""Fetch OpenStreetMap features for the world window via Overpass. Output: raw/osm.json"""
import json, requests
from geo import SIZE, to_latlon
m = SIZE / 2 + 300
s, w = to_latlon(-m, -m); n, e = to_latlon(m, m)
bb = f'{s:.5f},{w:.5f},{n:.5f},{e:.5f}'
q = f'''[out:json][timeout:120];
(
  way["natural"~"water|wetland|wood|bare_rock|scrub|heath|grassland"]({bb});
  relation["natural"~"water|wetland|wood"]({bb});
  way["landuse"~"forest|meadow|grass|residential|winter_sports|recreation_ground"]({bb});
  relation["landuse"~"forest|residential"]({bb});
  way["waterway"]({bb});
  way["piste:type"]({bb});
  relation["piste:type"]({bb});
  way["highway"]({bb});
  way["railway"]({bb});
  way["building"]({bb});
  way["amenity"="parking"]({bb});
  relation["amenity"="parking"]({bb});
  way["power"="line"]({bb});
  way["aerialway"]({bb});
  way["leisure"~"pitch|stadium|sports_centre|park"]({bb});
  node["man_made"~"tower|mast"]({bb});
  way["man_made"]({bb});
  node["tourism"]({bb});
  node["amenity"~"restaurant|cafe|place_of_worship"]({bb});
  node["natural"="peak"]({bb});
  node["place"]({bb});
);
out body; >; out skel qt;'''
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
    try:
        r = requests.post(url, data={'data': q}, timeout=180, headers={'User-Agent': 'terrain-prep-script'})
        r.raise_for_status(); d = r.json(); break
    except Exception as ex: print('fail', url, ex)
json.dump(d, open('raw/osm.json', 'w'))
from collections import Counter
c = Counter(x['type'] for x in d['elements']); print(bb, dict(c))
