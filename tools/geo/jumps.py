#!/usr/bin/env python3
"""Measure a ski jump from the lidar rasters (fetch_hoyde.py) for the LM tables in src/world.js.
Positions are (d, t): d metres from `top` along the axis top -> end, t to the side. Prints, every STEP m: the inrun
deck (median surface height within 1.5 m of the axis), the ground under it, the structure's half width, and on each
side the tallest thing beyond the inrun (the wind screens: t, top, ground). A cable strung along the axis of
Holmenkollbakken shows up as noise on the centre line below the take-off: read the landing hill off the ground column.
.venv/bin/python jumps.py topx topz endx endz [step]      e.g. -865.1 1152.8 -542.2 1340.4"""
import sys
import numpy as np
from scipy.ndimage import map_coordinates
a = [float(v) for v in sys.argv[1:]]
top, end, STEP = np.array(a[0:2]), np.array(a[2:4]), a[4] if len(a) > 4 else 6
dtm = np.load('raw/dtm1.npy'); dom = np.load('raw/dom1.npy')
L = np.hypot(*(end - top)); u = (end - top) / L; r = np.array([-u[1], u[0]])
t = np.arange(-60, 60.5, 0.5)
print('    d   deck    gnd  halfw | left: t   top    gnd | right: t  top    gnd')
for d in np.arange(-12, L + 1, STEP):
    x = top[0] + u[0] * d + r[0] * t; z = top[1] + u[1] * d + r[1] * t
    s = map_coordinates(dom, [z + 2048, x + 2048], order=1); g = map_coordinates(dtm, [z + 2048, x + 2048], order=1); nd = s - g
    c = np.abs(t) <= 1.5; hc = np.median(nd[c]); w = t[(nd > 0.5 * hc) & (np.abs(t) < 12)]; hw = (w.max() - w.min()) / 2 if len(w) and hc > 2 else 0
    o = ''
    for sg in (-1, 1):
        k = np.argmax(np.where((t * sg > max(hw + 2, 5)) & (t * sg < 50), nd, -1)); o += f' | {t[k]:6.1f} {s[k]:6.1f} {g[k]:6.1f}'
    print(f'{d:5.0f} {np.median(s[c]):6.1f} {np.median(g[c]):6.1f} {hw:5.1f}{o}')
