// Walk/run frame sequence on the open lake (phase 6A): a walker and a runner crossing the view, 12 frames at 1/15 s,
// for checking the cycles and frame-to-frame brightness.  usage: node tools/infwalk.mjs outdir
import { execFileSync } from 'node:child_process';
const out = process.argv[2] || 'shots/phase6a/v2';
const jobs = [{ frames: 1, out: `${out}/walk_00.png`, eval: `(()=>{const P=__W.PLAY-150,Lk=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0];
  __tp(Lk.x+Lk.az*200,Lk.z-Lk.ax*200,0);const yw=Math.atan2(-Lk.az,Lk.ax);const fx=-Math.sin(yw),fz=-Math.cos(yw),X=Lk.x-fx*4,Z=Lk.z-fz*4;
  __infDemo(X,Z,{poses:[1,2],yaw:yw,sp:1.5,move:20});const d=__game.inf.d;d[13]=0.2;
  __look(Lk.x-Lk.ax*7-fx*2.5,1.1,Lk.z-Lk.az*7-fz*2.5,Lk.x-fx*2.5,0.8,Lk.z-fz*2.5);__step(1/60,1);})()` }];
for (let i = 1; i < 12; i++) jobs.push({ frames: 1, out: `${out}/walk_${String(i).padStart(2, '0')}.png`, eval: '__step(1/60,4)' });
execFileSync('node', ['tools/multi.mjs', 'nohint&nohud&peace&tod=1', JSON.stringify(jobs)], { stdio: 'inherit' });
