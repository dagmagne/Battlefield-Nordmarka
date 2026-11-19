#!/usr/bin/env python3
"""Compare the height grid the game ships (world.bin, 8 m) with the lidar DTM / DOM from fetch_hoyde.py.
Prints error statistics and writes hillshades of a crop to ../../shots/geo/.
.venv/bin/python compare.py [x0 z0 x1 z1]   (world metres, default: the Holmenkollen arena)"""
import sys, json, zlib, struct, os
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import zoom
from geo import SIZE

HALF = SIZE / 2
def load_world(p='../../src/data/world.bin'):
    raw = zlib.decompress(open(p, 'rb').read(), -15); jl = struct.unpack('<I', raw[:4])[0]
    meta = json.loads(raw[4:4 + jl]); body = raw[4 + jl:]
    return meta, {k: body[o:o + l] for k, (o, l) in meta['blobs'].items()}
def height8(meta, blobs):
    n = meta['hn']; b = np.frombuffer(blobs['hgt'], np.uint8).astype(np.int64); dq = (b[:n * n] + (b[n * n:] << 8)).reshape(n, n)
    q = np.zeros((n, n), np.int64)
    for j in range(n):
        for i in range(n):
            p = q[j, i - 1] + q[j - 1, i] - q[j - 1, i - 1] if i and j else q[j, i - 1] if i else q[j - 1, i] if j else 0
            q[j, i] = (p + dq[j, i]) & 0xFFFF
    return meta['hmin'] + q * 0.1
def shade(h, step=1.0, az=315, alt=40):
    gy, gx = np.gradient(h, step); a = np.radians(az); l = np.array([np.sin(a) * np.cos(np.radians(alt)), np.cos(a) * np.cos(np.radians(alt)), np.sin(np.radians(alt))])
    n = np.stack([-gx, gy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=0)
    return np.clip((n[0] * l[0] + n[1] * l[1] + n[2] * l[2]) * 255, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    box = [float(v) for v in sys.argv[1:5]] if len(sys.argv) > 4 else [-1050, 800, 150, 1500]
    meta, blobs = load_world(); g8 = height8(meta, blobs)
    cur = zoom(g8, 8, order=3, grid_mode=False)[:4097, :4097] if False else None
    # exact resample of the 8 m grid (samples at -HALF + i*8) onto the 1 m grid
    from scipy.ndimage import map_coordinates
    c = np.arange(4097) / 8.0; J, I = np.meshgrid(c, c, indexing='ij')
    cur = map_coordinates(g8, [J, I], order=3, mode='nearest')
    dtm = np.load('raw/dtm1.npy').astype(np.float64); dom = np.load('raw/dom1.npy').astype(np.float64)
    d = cur - dtm
    def stats(name, a): print(f'{name:28s} mean {a.mean():+6.2f}  rms {np.sqrt((a * a).mean()):5.2f}  p95 |e| {np.percentile(np.abs(a), 95):5.2f}  max |e| {np.abs(a).max():6.2f}')
    stats('whole window (8 m vs DTM)', d)
    i0, j0, i1, j1 = [int(v + HALF) for v in box]
    stats('crop', d[j0:j1, i0:i1])
    # horizontal offset check: shift that minimises the rms in the crop
    best = min(((np.sqrt(((cur[j0:j1, i0:i1] - dtm[j0 + dz:j1 + dz, i0 + dx:i1 + dx]) ** 2).mean()), dx, dz) for dx in range(-12, 13, 2) for dz in range(-12, 13, 2)))
    print('best shift of DTM against the shipped grid (rms, dx, dz m):', best)
    os.makedirs('../../shots/geo', exist_ok=True)
    cr = lambda a: a[j0:j1, i0:i1]
    Image.fromarray(shade(cr(cur))).save('../../shots/geo/arena_current.png')
    Image.fromarray(shade(cr(dtm))).save('../../shots/geo/arena_dtm.png')
    Image.fromarray(shade(cr(dom))).save('../../shots/geo/arena_dom.png')
    nd = np.clip(cr(dom - dtm), 0, 40); rgb = np.stack([np.clip(nd * 12, 0, 255), np.clip(nd * 6, 0, 255), 255 - np.clip(nd * 8, 0, 255)], -1).astype(np.uint8)
    sh = shade(cr(dom))[..., None] / 255.0; im = Image.fromarray((rgb * (0.35 + 0.65 * sh)).astype(np.uint8)); dr = ImageDraw.Draw(im)
    b = blobs['bld']
    for k in range(meta['nb']):
        x, z, w, dd, yaw = struct.unpack_from('<hhHHh', b, k * 12); x /= 8; z /= 8; w /= 8; dd /= 8; yaw /= 1e4
        if not (box[0] < x < box[2] and box[1] < z < box[3]): continue
        cs, sn = np.cos(yaw), np.sin(yaw)
        P = [(x + (u * cs + v * sn) - box[0], z + (-u * sn + v * cs) - box[1]) for u, v in ((-w / 2, -dd / 2), (w / 2, -dd / 2), (w / 2, dd / 2), (-w / 2, dd / 2))]
        dr.polygon(P, outline=(0, 255, 0))
    im.save('../../shots/geo/arena_ndsm_bld.png')
    e = np.clip(cr(d) * 12 + 128, 0, 255).astype(np.uint8); Image.fromarray(e).save('../../shots/geo/arena_err.png')
    print('wrote shots/geo/arena_*.png', cr(dtm).shape)
