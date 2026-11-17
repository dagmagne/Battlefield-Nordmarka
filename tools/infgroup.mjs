// Infantry group renders (phase 6A): 40 soldiers in every pose 30 m in front of the tank start, seen from several ranges,
// in daylight, thermal (white-hot, black-hot), golden hour and night.  usage: node tools/infgroup.mjs outdir
import { execFileSync } from 'node:child_process';
const out = process.argv[2] || 'shots/phase6a';
const SET = `if(!window.B0){const v=__veh;window.B0=[v.x,v.z,v.yaw];__tp(v.x+Math.cos(v.yaw)*45,v.z-Math.sin(v.yaw)*45,v.yaw);}const v={x:B0[0],z:B0[1],yaw:B0[2]};const FX=-Math.sin(v.yaw),FZ=-Math.cos(v.yaw);const X=v.x+FX*30,Z=v.z+FZ*30;
  __infDemo(X,Z,{poses:[0,1,2,5,3,7,4,6],n:40,cols:8,sp:2.6,yaw:v.yaw+Math.PI,jit:0.8,dead:5});__step(1/60,20);`;
const L = (d, h = 2.2) => `__look(X-FX*${d},${h},Z-FZ*${d},X,0.8,Z);__step(1/60,2);`;
const J = (name, pre, d, h) => ({ eval: `(()=>{${pre}${SET}${L(d, h)}})()`, out: `${out}/${name}.png`, frames: 1 });
const ONLY = process.argv[3];
const jobs = [
  J('group15_day', '', 15, 1.8), J('group40_day', '', 40), J('group80_day', '', 80), J('group160_day', '', 160, 4),
  J('group40_therm', '__R.therm=1;__R.thAll=true;', 40), J('group80_therm', '', 80), J('group160_therm', '', 160, 4), J('group40_therm_bh', '__R.therm=2;', 40),
  J('group40_golden', '__R.therm=0;__R.thAll=false;__tod(2);', 40), J('group40_night', '__tod(4);', 40), J('group15_night', '', 15, 1.8),
];
// the same group on the open lake for the long ranges (camera on the lake axis)
const LS = `const P=__W.PLAY-150,Lk=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0];const X=Lk.x+Lk.ax*40,Z=Lk.z+Lk.az*40;
  __tp(Lk.x+Lk.az*200,Lk.z-Lk.ax*200,0);__infDemo(X,Z,{poses:[0,1,2,5,3,7,4,6],n:40,cols:8,sp:2.6,yaw:Math.atan2(Lk.ax,Lk.az),jit:0.8,dead:5});__step(1/60,20);`;
const LL = (d, h) => `__look(X-Lk.ax*${d},${h},Z-Lk.az*${d},X,0.8,Z);__step(1/60,2);`;
const K = (name, pre, d, h) => ({ eval: `(()=>{${pre}${LS}${LL(d, h)}})()`, out: `${out}/${name}.png`, frames: 1 });
jobs.push(K('lake40_day', '__R.therm=0;__R.thAll=false;__tod(1);', 40, 2), K('lake80_day', '', 80, 2.5), K('lake160_day', '', 160, 3), K('lake80_therm', '__R.therm=1;__R.thAll=true;', 80, 2.5), K('lake160_therm', '', 160, 3),
  K('lake80_night', '__R.therm=0;__R.thAll=false;__tod(4);', 80, 2.5));
if (ONLY === 'lod') { jobs.length = 0; jobs.push(K('lod_118', '', 118, 1.5), K('lod_122', '', 122, 1.5)); }
execFileSync('node', ['tools/multi.mjs', 'nohint&nohud&peace&tod=1', JSON.stringify(jobs)], { stdio: 'inherit' });
