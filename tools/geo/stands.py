#!/usr/bin/env python3
"""Measure grandstands, terraces and stadium structures from the lidar rasters (fetch_hoyde.py) for the arena tables
in LM (src/world.js). A structure is measured in a frame (d, t): d metres along the segment a -> b, t to its right
(t > 0 is the side you see on your right walking from a to b, in the x-east / z-south world frame, i.e. r = (-uz, ux)).
  profile  ax az bx bz t0 t1 [stations] [tstep]  print ground (DTM) and height above ground (DOM - DTM) across the segment
  image    ax az bx bz d0 d1 t0 t1 out.png [px/m] axis-aligned hillshade of the surface, 2 m DTM contours in red,
                                                  height above ground in blue (find rows, aisles, roofs, walls)
  rake     ax az bx bz t0 t1 [stations]          least-squares rake of the ground across t0..t1 per station: base height,
                                                  rise per metre, rms residual, mean / p90 height above ground (roofs)
.venv/bin/python stands.py rake -588 1072 -502 1196 -14 2"""
import sys
import numpy as np
from scipy.ndimage import map_coordinates

dtm = np.load('raw/dtm1.npy', mmap_mode='r'); dom = np.load('raw/dom1.npy', mmap_mode='r')
def frame(ax, az, bx, bz):
    a = np.array([ax, az]); L = np.hypot(bx - ax, bz - az); u = np.array([bx - ax, bz - az]) / L; return a, u, np.array([-u[1], u[0]]), L
def samp(a, u, r, d, t):
    x = a[0] + u[0] * d + r[0] * t; z = a[1] + u[1] * d + r[1] * t
    g = map_coordinates(dtm, [z + 2048, x + 2048], order=1); s = map_coordinates(dom, [z + 2048, x + 2048], order=1); return g, s - g

if __name__ == '__main__':
    cmd, v = sys.argv[1], [float(q) for q in sys.argv[2:6]]; a, u, r, L = frame(*v); rest = sys.argv[6:]
    if cmd == 'profile':
        t0, t1 = float(rest[0]), float(rest[1]); n = int(rest[2]) if len(rest) > 2 else 6; ts = np.arange(t0, t1 + 0.01, float(rest[3]) if len(rest) > 3 else 2)
        print(f'length {L:.1f} m   t: ' + ' '.join(f'{t:5.0f}' for t in ts))
        for d in np.linspace(0, L, n):
            g, h = samp(a, u, r, np.full_like(ts, d), ts)
            print(f'd{d:6.1f} gnd ' + ' '.join(f'{q:5.1f}' for q in g)); print(f'        agl ' + ' '.join(f'{q:5.1f}' for q in h))
    elif cmd == 'rake':
        t0, t1 = float(rest[0]), float(rest[1]); n = int(rest[2]) if len(rest) > 2 else 8; ts = np.arange(t0, t1 + 0.01, 0.5)
        print(f'length {L:.1f} m;  d   base(t0)  rise/m  rms   agl mean  agl p90')
        for d in np.linspace(0, L, n):
            g, h = samp(a, u, r, np.full_like(ts, d), ts); k, c = np.polyfit(ts - t0, g, 1)
            print(f'{d:6.1f} {c:8.2f} {k:7.3f} {np.sqrt(((g - (c + k * (ts - t0))) ** 2).mean()):5.2f} {h.mean():8.2f} {np.percentile(h, 90):8.2f}')
    elif cmd == 'image':
        from PIL import Image, ImageDraw
        sys.path.insert(0, '.'); from compare import shade
        d0, d1, t0, t1 = [float(q) for q in rest[:4]]; out = rest[4]; sc = float(rest[5]) if len(rest) > 5 else 4
        D, T = np.meshgrid(np.arange(d0, d1, 1 / sc), np.arange(t0, t1, 1 / sc)); g, h = samp(a, u, r, D, T)
        sh = shade(g + h, 1 / sc, 315, 40) / 255.0; rgb = np.stack([sh, sh, sh], -1); rgb[(g % 2.0) < 0.1] = [1, 0.2, 0.2]
        rgb[..., 2] = np.maximum(rgb[..., 2], np.clip(h, 0, 20) / 20)
        im = Image.fromarray((rgb * 255).astype(np.uint8)); dr = ImageDraw.Draw(im)
        for q in range(int(np.ceil(d0 / 10) * 10), int(d1), 10): X = (q - d0) * sc; dr.line([(X, 0), (X, im.height)], fill=(255, 255, 0) if q % 50 == 0 else (110, 110, 0)); dr.text((X + 2, 2), str(q), fill=(255, 255, 0))
        for q in range(int(np.ceil(t0 / 10) * 10), int(t1), 10): Y = (q - t0) * sc; dr.line([(0, Y), (im.width, Y)], fill=(0, 255, 255) if q % 50 == 0 else (0, 110, 110)); dr.text((2, Y + 2), str(q), fill=(0, 255, 255))
        im.save(out); print('wrote', out, im.size)
