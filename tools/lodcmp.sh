#!/bin/sh
# Renders one forest view with each tree LOD forced; prints mean colour (RGB 0-255) per LOD. usage: tools/lodcmp.sh "<sx>" outprefix
# (pass --port/--path through GPORT/GPATH)
SX="$1"; P="$2"
for l in 1 0.2 0.04 0.004; do
  node tools/multi.mjs "nohint&nohud&drs=0&tod=1&lod=$l&sx=$SX" "[{\"eval\":\"(()=>{__api.snow(0);__R.snowAmt=0;const t=__W.trails[0];const i=Math.min(110,t.n-30);const x=t.pts[i*2],z=t.pts[i*2+1];__tp(x+300,z,0);__look(x+3,6,z+16,x-14,6,z-30)})()\",\"steps\":20,\"out\":\"shots/lod/$P$l.png\"}]" 2>&1 | grep -v "^ok"
  echo "lod=$l mean:" $(python3 tools/imgmean.py mean shots/lod/$P$l.png)
done
python3 tools/imgmean.py sheet shots/lod/$P.jpg shots/lod/${P}1.png shots/lod/${P}0.2.png shots/lod/${P}0.04.png shots/lod/${P}0.004.png
