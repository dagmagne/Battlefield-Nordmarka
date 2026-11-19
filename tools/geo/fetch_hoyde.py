#!/usr/bin/env python3
"""Fetch Kartverket's national lidar elevation models for the world window from the open WCS (hoydedata.no data,
CC BY 4.0): DTM (bare ground) and DOM (surface with roofs and tree crowns), 1 m, EPSG:25833. The tiles are cached
in raw/hoyde/ and resampled to the local metric grid of geo.py.
Output: raw/dtm1.npy and raw/dom1.npy (float32 metres, STEP m per sample, row 0 = north, like raw/dem.npy).
Run with the tools/geo virtualenv: .venv/bin/python fetch_hoyde.py [step]"""
import os, sys, math, time
import numpy as np, requests, rasterio
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from geo import SIZE, to_latlon

STEP = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
N = int(SIZE / STEP) + 1
T = 1024                        # tile edge in metres (and pixels)
URL = 'https://wcs.geonorge.no/skwms1/wcs.hoyde-{k}-nhm-25833?service=WCS&version=1.0.0&request=GetCoverage&coverage=nhm_{k}_topo_25833&CRS=EPSG:25833&BBOX={x0},{y0},{x1},{y1}&WIDTH={T}&HEIGHT={T}&FORMAT=GeoTIFF'
os.makedirs('raw/hoyde', exist_ok=True)
tf = Transformer.from_crs('EPSG:4326', 'EPSG:25833', always_xy=True)

# local grid -> UTM 33
e = -SIZE / 2 + np.arange(N) * STEP; n = SIZE / 2 - np.arange(N) * STEP
E, Nn = np.meshgrid(e, n)
lat, lon = to_latlon(E, Nn)
UX, UY = tf.transform(lon, lat)
x0 = math.floor((UX.min() - 8) / T) * T; y0 = math.floor((UY.min() - 8) / T) * T
nx = math.ceil((UX.max() + 8 - x0) / T); ny = math.ceil((UY.max() + 8 - y0) / T)
print(f'UTM33 window {x0},{y0} + {nx}x{ny} tiles of {T} m')

def tile(k, i, j):
    p = f'raw/hoyde/{k}_{x0 + i * T}_{y0 + j * T}.tif'
    if not os.path.exists(p):
        u = URL.format(k=k, T=T, x0=x0 + i * T, y0=y0 + j * T, x1=x0 + (i + 1) * T, y1=y0 + (j + 1) * T)
        for a in range(4):
            try:
                r = requests.get(u, timeout=120); r.raise_for_status()
                if not r.headers.get('content-type', '').startswith('image/tiff'): raise RuntimeError(r.text[:200])
                open(p, 'wb').write(r.content); break
            except Exception as ex:
                print('retry', k, i, j, ex); time.sleep(3 + 5 * a)
        else: raise SystemExit(f'failed {u}')
    return rasterio.open(p).read(1)

for k in ('dtm', 'dom'):
    mos = np.zeros((ny * T, nx * T), np.float32)           # row 0 = north
    for j in range(ny):
        for i in range(nx):
            mos[(ny - 1 - j) * T:(ny - j) * T, i * T:(i + 1) * T] = tile(k, i, j)
        print(k, 'row', j + 1, '/', ny, flush=True)
    bad = ~np.isfinite(mos) | (mos < -100) | (mos > 3000)
    print(k, 'no-data samples', int(bad.sum()))
    # pixel centres: col = ux - x0 - 0.5, row = (y0 + ny*T) - uy - 0.5
    out = map_coordinates(mos, [(y0 + ny * T) - UY - 0.5, UX - x0 - 0.5], order=1, mode='nearest').astype(np.float32)
    np.save(f'raw/{k}{int(STEP)}.npy', out)
    print(k, out.shape, 'min', float(out.min()), 'max', float(out.max()))
