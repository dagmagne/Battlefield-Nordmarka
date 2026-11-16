#!/bin/sh
# Container check of the combat visuals on the open lake (software WebGPU through tools/cshot.mjs; several seconds per frame).
# usage: tools/battle.sh outdir [tier]   -> models, gunner sight, a kill, the wreck, smoke screen, driving
out=${1:-shots/battle}; q=${2:-medium}; port=${PORT:-8080}; mkdir -p "$out" # PORT=8092 tools/battle.sh ... for a second checkout
node tools/cshot.mjs "$out/b.png" "w=frogner&nohint&q=$q&drs=0&np&peace" --port "$port" --frames 2 --eval "
const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; __tp(L.x-L.ax*110,L.z-L.az*110,0); __ui.poll=()=>{}; const g=__game; g.spawn(0); g.spawn(1); const e=g.enemies[0], b=g.enemies[1]; window.E=e; window.B=b; Object.assign(e,{x:L.x+L.ax*110,z:L.z+L.az*110,yaw:1,path:-1,immob:true}); Object.assign(b,{x:e.x+22,z:e.z+14,yaw:2.4,path:-1,immob:true}); __sim(1/60,20); __look(E.x-9,2.2,E.z+15,E.x,1.2,E.z); 1 ||
__look(B.x-10,2.4,B.z+9,B.x,1.2,B.z); 1 ||
__R.pose=null; __aim(Math.atan2(-(E.x-__veh.x),-(E.z-__veh.z)),-0.0079,1); __cam.zoom=1; __sim(1/60,220); [__aimS.range,__aimS.ready] ||
__inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60,7); __cam.zoom=0; [__game.kills, E.hp] ||
__sim(1/60,360); __cam.mode=0; __look(E.x+14,3,E.z+16,E.x,1.5,E.z); 1 ||
__R.pose=null; __aim(__aimS.yaw+0.6,0.02,0); __sim(1/60,60); __game.smoke(); __sim(1/60,420); 1 ||
__R.force=[1,0]; __sim(1/60,240); __look(__veh.x+9,2.2,__veh.z-14,__veh.x,1,__veh.z); __veh.v
" 2>&1 | tail -10
