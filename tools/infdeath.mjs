// Death sequence renders (phase 6A): four soldiers (stand, stand-aim, RPG, run) side by side, killed at once, shot at several times.
// usage: node tools/infdeath.mjs outdir   (one PNG per time: fall_<ms>.png)
import { execFileSync } from 'node:child_process';
const out = process.argv[2] || 'shots/phase6a/v2';
const T = [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.5];
const jobs = [{ frames: 1, out: `${out}/fall_0000.png`, eval: `(()=>{const v=__veh;const FX=-Math.sin(v.yaw),FZ=-Math.cos(v.yaw);window.X=v.x+FX*14;window.Z=v.z+FZ*14;
  __infDemo(X,Z,{poses:[0,5,7,2],yaw:v.yaw+0.5,sp:2.0});__step(1/60,20);const d=__game.inf.d;for(let i=0;i<4;i++){d[i*8+4]=6;d[i*8+7]=2;d[i*8+5]=0;}
  const a=v.yaw+Math.PI/2+0.35;__look(X-Math.sin(a)*7.5,1.5,Z-Math.cos(a)*7.5,X,0.55,Z);__step(1/60,1);})()` }];
let t = 1 / 60;
for (const k of T.slice(1)) { const n = Math.round((k - t) * 60); t += n / 60; jobs.push({ frames: 1, out: `${out}/fall_${String(Math.round(k * 1000)).padStart(4, '0')}.png`, eval: `__step(1/60,${n})` }); }
execFileSync('node', ['tools/multi.mjs', 'nohint&nohud&peace&tod=1', JSON.stringify(jobs)], { stdio: 'inherit' });
