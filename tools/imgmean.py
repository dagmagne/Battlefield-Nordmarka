# Mean colour of a crop, and a 2x2 contact sheet (lodcmp.sh fallback when ffmpeg is missing).
# usage: imgmean.py mean in.png  |  imgmean.py sheet out.jpg a.png b.png c.png d.png
import sys
from PIL import Image, ImageStat
if sys.argv[1] == 'mean':
    im = Image.open(sys.argv[2]).convert('RGB').crop((1000, 500, 2400, 1500))
    print(' '.join('%.1f' % v for v in ImageStat.Stat(im).mean))
else:
    ims = [Image.open(p).convert('RGB').crop((1000, 500, 2400, 1500)) for p in sys.argv[3:7]]
    s = Image.new('RGB', (2800, 2000))
    for k, im in enumerate(ims): s.paste(im, ((k % 2) * 1400, (k // 2) * 1000))
    s.resize((1800, 1286)).save(sys.argv[2], quality=88)
