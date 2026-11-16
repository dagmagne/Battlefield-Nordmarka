#!/bin/sh
# Container check of the combat visuals: tank models, a hit and the wreck on the open lake. usage: tools/battle.sh outdir [tier]
# (software WebGPU through tools/cshot.mjs; each frame takes several seconds)
out=${1:-shots/battle}; q=${2:-medium}; mkdir -p "$out"
SETUP='const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L; __tp(L.x-40,L.z,-1.57); const g=__game; g.spawn(0); g.spawn(1); const e=g.enemies[0], b=g.enemies[1]; Object.assign(e,{x:L.x+50,z:L.z-6,yaw:0.5,path:-1,immob:true}); Object.assign(b,{x:L.x+42,z:L.z+26,yaw:2.2,path:-1,immob:true}); __sim(1/60,30);'
node tools/cshot.mjs "$out/b.png" "w=frogner&nohint&q=$q&drs=0&np&peace" --frames 2 --eval "
$SETUP __look(L.x+32,2.2,L.z+10,L.x+50,1.2,L.z-6); 1 ||
__look(L.x+30,2.5,L.z+34,L.x+42,1.2,L.z+26); 1 ||
__R.pose=null; __ui.poll=()=>{}; const e=__game.enemies[0]; __aim(Math.atan2(-(e.x-__veh.x),-(e.z-__veh.z)),-0.028); __sim(1/60,200); __inp.fire=true; __sim(1/60,2); __inp.fire=false; [__aimS.range,__aimS.ready,__game.n[0]] ||
__sim(1/60,3); __look(L.x+20,4,L.z+22,L.x+50,1.5,L.z-6); [__game.enemies[0].hp,__game.fxN] ||
__game.ammo(2); __sim(1/60,400); __R.pose=null; __inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60,5); __look(L.x+20,4,L.z+22,L.x+50,1.5,L.z-6); [__game.enemies[0].hp,__game.enemies[0].dead,__game.kills] ||
__sim(1/60,150); 1 ||
__R.pose=null; __aim(-1.2,0.05,0); __game.smoke(); __sim(1/60,240); 1
" 2>&1 | tail -12
