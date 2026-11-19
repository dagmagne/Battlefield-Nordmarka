#!/usr/bin/env python3
"""Post-pass on world.bin: replace the height grid with Kartverket's lidar DTM (fetch_hoyde.py) and add
2 m detail insets for the places that need every texel (the ski arena).
  hgt     the whole window at STEP m (decimetres above hmin, 2-D predicted)
  ins<i>  one grid per inset at the game's 2 m heightmap texels, same coding; meta.insets = [[i0, j0, w, h], ...]
Run after prep.py: .venv/bin/python terrain.py"""
import math
import numpy as np
from scipy.ndimage import gaussian_filter
from geo import SIZE
import pack

STEP = 4                                    # base grid
INSETS = [('arena', -1064, 792, 160, 1512)]  # name, x0, z0, x1, z1 (world metres; x east, z south)
HALF = SIZE / 2
dtm = np.load('raw/dtm1.npy').astype(np.float64)           # 1 m, sample i at -HALF + i
meta, blobs = pack.load()
hmin = math.floor(dtm.min())
base = gaussian_filter(dtm, STEP * 0.4)[::STEP, ::STEP]    # low-pass before decimating
meta['hn'] = base.shape[0]; meta['hstep'] = STEP; meta['hmin'] = hmin
blobs['hgt'] = pack.enc16(np.round((base - hmin) * 10))
for k in [k for k in blobs if k.startswith('ins')]: del blobs[k]
fine = gaussian_filter(dtm, 0.7)[1::2, 1::2]               # texel centres -HALF + (i + 0.5) * 2
meta['insets'] = []
for n, (name, x0, z0, x1, z1) in enumerate(INSETS):
    i0, j0, i1, j1 = [int((v + HALF) // 2) for v in (x0, z0, x1, z1)]
    meta['insets'].append([i0, j0, i1 - i0, j1 - j0])
    blobs[f'ins{n}'] = pack.enc16(np.round((fine[j0:j1, i0:i1] - hmin) * 10))
    print('inset', name, i1 - i0, 'x', j1 - j0)
pack.save(meta, blobs)
