#!/usr/bin/env python3
"""Fetch elevation for the world window from the public Terrarium terrain tiles (Norway: Kartverket 10 m DTM)
and resample to a local metric grid. Output: raw/dem.npy (float32 metres, row 0 = north), raw/dem.png preview."""
import math, io, os, sys, json
import numpy as np, requests
from PIL import Image
from geo import LAT0, LON0, SIZE, to_latlon

Z = 14
STEP = 4.0                      # metres per output sample
N = int(SIZE / STEP) + 1
os.makedirs('raw/tiles', exist_ok=True)

def tile_xy(lat, lon):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

cache = {}
def tile(tx, ty):
    if (tx, ty) in cache: return cache[(tx, ty)]
    p = f'raw/tiles/{Z}_{tx}_{ty}.png'
    if not os.path.exists(p):
        r = requests.get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png', timeout=60)
        r.raise_for_status(); open(p, 'wb').write(r.content)
    a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float64)
    h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    cache[(tx, ty)] = h; return h

def sample(lat, lon):
    x, y = tile_xy(lat, lon); x = x * 256 - 0.5; y = y * 256 - 0.5
    ix, iy = math.floor(x), math.floor(y); fx, fy = x - ix, y - iy
    def px(i, j): return tile(i // 256, j // 256)[j % 256, i % 256]
    return (px(ix, iy) * (1 - fx) + px(ix + 1, iy) * fx) * (1 - fy) + (px(ix, iy + 1) * (1 - fx) + px(ix + 1, iy + 1) * fx) * fy

dem = np.zeros((N, N), np.float32)
for j in range(N):
    for i in range(N):
        e = -SIZE / 2 + i * STEP; n = SIZE / 2 - j * STEP
        lat, lon = to_latlon(e, n); dem[j, i] = sample(lat, lon)
np.save('raw/dem.npy', dem)
lo, hi = float(dem.min()), float(dem.max())
Image.fromarray(((dem - lo) / (hi - lo) * 255).astype(np.uint8)).save('raw/dem.png')
print('dem', dem.shape, 'min', lo, 'max', hi, 'tiles', len(cache))
