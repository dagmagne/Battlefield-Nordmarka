#!/bin/sh
# Renders one forest view with each tree LOD forced; prints mean colour per LOD. usage: tools/lodcmp.sh "<sx>" outprefix
SX="$1"; P="$2"
for l in 1 0.2 0.04 0.004; do
  node tools/multi.mjs "nohint&nohud&drs=0&tod=1&lod=$l&sx=$SX" "[{\"eval\":\"(()=>{const t=__W.trails[0];const i=110;const x=t.pts[i*2],z=t.pts[i*2+1];__tp(x+300,z,0);__look(x+3,6,z+16,x-14,6,z-30)})()\",\"frames\":20,\"out\":\"shots/lod/$P$l.png\"}]" 2>&1 | grep -v "^ok"
  ffmpeg -y -loglevel error -i shots/lod/$P$l.png -vf "crop=1400:1000:1000:500" shots/lod/c$P$l.png
  echo "lod=$l mean:" $(ffmpeg -loglevel error -i shots/lod/c$P$l.png -vf "scale=1:1:flags=area,format=rgb24" -f rawvideo - | xxd -p)
done
cd shots/lod && ffmpeg -y -loglevel error -i c${P}1.png -i c${P}0.2.png -i c${P}0.04.png -i c${P}0.004.png -filter_complex "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1800:-1" $P.jpg
