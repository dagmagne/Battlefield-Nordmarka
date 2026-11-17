// Close-up renders of the infantry poses (phase 6A) through tools/multi.mjs.
// usage: node tools/infshots.mjs outdir [--dist 5] [--views front,side,back] [--poses 0,1,2,5,3,7,4,6] [--tod 1] [--therm 0] [--extra "js"]
// Every pose is staged alone (one soldier) on the open ground 14 m in front of the tank start and shot from each view.
import { execFileSync } from 'node:child_process';
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const out = a[0], dist = +opt('dist', 5), views = opt('views', 'front,side').split(','), poses = opt('poses', '0,1,2,5,3,7,4,6').split(',').map(Number);
const tod = opt('tod', '1'), therm = +opt('therm', 0), extra = opt('extra', ''), aim = +opt('aim', 0), ph = opt('ph', '0.37'), h = +opt('h', 1.2);
const VA = { front: 0, side: Math.PI / 2, back: Math.PI, q: Math.PI / 4, q2: -Math.PI / 3 };
const jobs = [{ eval: `(()=>{const v=__veh;window.FX=-Math.sin(v.yaw);window.FZ=-Math.cos(v.yaw);window.X=v.x+FX*14;window.Z=v.z+FZ*14;window.YW=v.yaw;__R.therm=${therm};__R.thAll=${therm ? 'true' : 'false'};${extra}})()`, frames: 2 }];
for (const p of poses) for (const vw of views) {
  const ang = VA[vw] ?? +vw, lie = p === 4 || p === 6;
  jobs.push({ out: `${out}/p${p}_${vw}.png`, frames: 2, eval: `(()=>{__infDemo(X,Z,{poses:[${p}],yaw:YW,aim:${aim},dead:${p === 6 ? 5 : 0}});const d=__game.inf.d;if(${p}!==6)d[5]=${ph};
    const a=YW+${ang},cx=X-Math.sin(a)*${dist},cz=Z-Math.cos(a)*${dist};const tz=Z${lie ? '+FZ*-0.45' : ''},tx=X${lie ? '+FX*-0.45' : ''};__look(cx,${lie ? h * 0.7 : h},cz,tx,${lie ? 0.25 : 0.85},tz);__step(1/60,2);})()` });
}
execFileSync('node', ['tools/multi.mjs', `nohint&nohud&peace&tod=${tod}`, JSON.stringify(jobs), ...a.filter((x) => x === '--log')], { stdio: 'inherit' });
