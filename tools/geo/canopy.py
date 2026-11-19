#!/usr/bin/env python3
"""Post-pass on world.bin: tree cover and tree height from Kartverket's lidar (dom1 - dtm1, 1 m, summer scan).
  cov    1024 x 1024 u8, 4 m cells: share of 1 m samples that are tree canopy (> 2.5 m above ground), 0..255
  canh   256 x 256 u8, 16 m cells: 90th percentile of the canopy height (0.5 m units, 0 = no canopy)
Buildings (bld rectangles + 2 m), the TV tower, the ski-jump inruns / stands and other smooth man-made surfaces
are masked, and the mask is opened with a 3 x 3 m kernel so power lines and thin poles drop out.
Replaces the OSM land-use 'tree' blob (removed). meta: cn (cov size), chn (canh size).
Run after prep.py / terrain.py and after any change to the bld blob (it masks the buildings):
  .venv/bin/python canopy.py [--png] [--dry]   (--png writes ../../shots/geo/canopy/lidar_*.png, --dry does not save)"""
import sys, struct, math, os
import numpy as np
from scipy.ndimage import binary_opening, uniform_filter, laplace, binary_dilation
from PIL import Image, ImageDraw
from geo import SIZE
import pack

HALF = SIZE / 2; N = 4096; THR = 2.5
dtm = np.load('raw/dtm1.npy')[:N, :N].astype(np.float32); dom = np.load('raw/dom1.npy')[:N, :N].astype(np.float32)
nd = dom - dtm
meta, blobs = pack.load()

# ---- structures: building rectangles (+2 m), landmarks that are not in them ----
st = Image.new('L', (N, N), 0); dr = ImageDraw.Draw(st); b = blobs['bld']
for k in range(meta['nb']):
    x, z, w, d, yaw = struct.unpack_from('<hhHHh', b, k * 12); x /= 8; z /= 8; w = w / 8 + 4; d = d / 8 + 4; yaw /= 1e4
    cs, sn = math.cos(yaw), math.sin(yaw)
    dr.polygon([(x + u * cs + v * sn + HALF, z - u * sn + v * cs + HALF) for u, v in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))], fill=255)
def corridor(p0, p1, hw):
    (x0, z0), (x1, z1) = p0, p1; l = math.hypot(x1 - x0, z1 - z0); nx, nz = -(z1 - z0) / l * hw, (x1 - x0) / l * hw
    dr.polygon([(x0 + nx + HALF, z0 + nz + HALF), (x1 + nx + HALF, z1 + nz + HALF), (x1 - nx + HALF, z1 - nz + HALF), (x0 - nx + HALF, z0 - nz + HALF)], fill=255)
corridor((-865.1, 1152.8), (-774.2, 1207.0), 14)      # Holmenkollbakken inrun (LM.jump top -> lip)
corridor((-338.1, 932.8), (-247.9, 957.4), 10)        # Midtstubakken inrun
dr.ellipse((-663 - 16 + HALF, -1486 - 16 + HALF, -663 + 16 + HALF, -1486 + 16 + HALF), fill=255)   # Tryvannstårnet
struct_m = np.asarray(st) > 0
# smooth surfaces high above ground (roofs missing from OSM, stands, walls, the inrun deck): crowns are rough
lap = uniform_filter(np.abs(laplace(dom)), 5)
smooth = (lap < 0.35) & (uniform_filter((nd > THR).astype(np.float32), 5) > 0.95)
smooth = binary_dilation(smooth, iterations=2)
tree = (nd > THR) & ~struct_m & ~smooth
tree = binary_opening(tree, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool), iterations=1)
tree = binary_opening(tree, structure=np.ones((3, 3), bool))
print('canopy share: raw', round(float((nd > THR).mean()), 3), 'after masks', round(float(tree.mean()), 3),
      'struct', round(float(((nd > THR) & struct_m).mean()), 4), 'smooth', round(float(((nd > THR) & smooth & ~struct_m).mean()), 4))

C = 4; cn = N // C
cov = tree.reshape(cn, C, cn, C).mean((1, 3))
H = 16; hn = N // H
th = np.where(tree, nd, np.nan).reshape(hn, H, hn, H).transpose(0, 2, 1, 3).reshape(hn, hn, H * H)
cnt = np.sum(~np.isnan(th), 2)
import warnings; warnings.simplefilter('ignore')
p90 = np.nanpercentile(th, 90, axis=2)
p90 = np.where(cnt >= 6, p90, 0)
blobs.pop('tree', None); meta.pop('tn', None)
blobs['cov'] = np.round(cov * 255).astype(np.uint8).tobytes(); meta['cn'] = cn
blobs['canh'] = np.clip(np.round(p90 * 2), 0, 255).astype(np.uint8).tobytes(); meta['chn'] = hn
print('cover mean', round(float(cov.mean()), 3), ' canopy height p50/p90 (canopy cells)', np.percentile(p90[p90 > 0], [50, 90]).round(1))
if '--dry' not in sys.argv: pack.save(meta, blobs)

if '--png' in sys.argv:
    os.makedirs('../../shots/geo/canopy', exist_ok=True)
    for name, (x0, z0, x1, z1) in {'arena': (-1064, 792, 160, 1512), 'all': (-1600, -1600, 1600, 1600)}.items():
        i0, j0, i1, j1 = [int(v + HALF) for v in (x0, z0, x1, z1)]
        c = np.clip(nd[j0:j1, i0:i1], 0, 30) / 30
        rgb = np.stack([c * 200, 60 + c * 150, c * 90], -1)
        rgb[struct_m[j0:j1, i0:i1]] = (255, 0, 255); rgb[smooth[j0:j1, i0:i1] & ~struct_m[j0:j1, i0:i1] & (nd[j0:j1, i0:i1] > THR)] = (255, 160, 0)
        rgb[tree[j0:j1, i0:i1]] = rgb[tree[j0:j1, i0:i1]] * 0.4 + np.array([0, 150, 0]) * 0.6
        im = Image.fromarray(rgb.astype(np.uint8))
        if name == 'all': im = im.resize((1600, 1600), Image.BILINEAR)
        im.save(f'../../shots/geo/canopy/lidar_{name}.png')
