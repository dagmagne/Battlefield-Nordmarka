// Phase 2 behaviour test (headed GPU Chrome, logic through __sim): a buried field across the tank's path blows a track
// (immobilised for some seconds, hull damage), HE and the MG clear mines, a rocket strike scatters surface mines, a drone
// reveals a buried field, and an enemy drives round its own field.
// usage: node tools/minetest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase2';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1200,800']) });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errs = 0, fails = 0;
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace&q=medium&drs=0&tod=1`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);
const shot = async (name) => { await ev('__step(1/60,4)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/${name}.png` }); };

// stage: the tank on the shore of the biggest lake, facing across it
await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L;
  const yaw=Math.atan2(L.ax, L.az); __tp(L.x-L.ax*110, L.z-L.az*110, yaw); __ui.poll=()=>{}; window.M=__game.mines; window.FX=-Math.sin(yaw); window.FZ=-Math.cos(yaw);
  __sim(1/60, 30); })()`);
// 1: buried field 45 m ahead across the path
await ev(`M.lay(__veh.x+FX*45, __veh.z+FZ*45, -FZ, FX); __sim(1/60, 120)`);
let r = await ev('({armed:M.armed(), revealed:Array.from(M.r).filter((v,i)=>v&&M.s[i]).length})');
check('a buried field is laid and hidden', r.armed >= 5 && r.revealed === 0, r);
await ev(`__look(__veh.x+FX*30-FZ*6, 2.4, __veh.z+FZ*30+FX*6, __veh.x+FX*45, 0, __veh.z+FZ*45)`); await shot('field-day');
await ev('__R.therm=1; __R.thAll=true'); await shot('field-thermal'); await ev('__R.therm=0; __R.thAll=false; __R.pose=null');
await ev('window.HP0=__veh.hp; window.N0=M.armed(); __R.force=[1,0]; window.HIT=-1; for(let i=0;i<60*15&&HIT<0;i++){ __sim(1/60,1); if(__veh.immob>0) HIT=i; }');
r = await ev('({hit:HIT, crew:Array.from(M.r).filter((v,i)=>v&&M.s[i]).length, hp0:HP0, hp:+__veh.hp.toFixed(1), immob:+__veh.immob.toFixed(1), armed:M.armed(), pill:document.getElementById("sT").textContent, shown:document.getElementById("sT").style.display!=="none"})');
check('driving into it: a mine goes off under the tank, hull damage 15–25, track blown', r.hit >= 0 && r.hp0 - r.hp >= 15 && r.hp0 - r.hp <= 26 && r.immob >= 3.5 && r.armed === (await ev('N0')) - 1, r);
check('the crew notices disturbed snow close ahead and marks mines', r.crew >= 1, r.crew);
check('TRACK pill shows the repair countdown', r.shown && /TRACK \d s/.test(r.pill), r.pill);
await shot('mine-hit');
r = await ev('(()=>{ const x=__veh.x, z=__veh.z, t=__veh.immob; __sim(1/60, Math.floor(60*(t-0.3))); return {moved:+Math.hypot(__veh.x-x,__veh.z-z).toFixed(2), left:+__veh.immob.toFixed(2), secs:+t.toFixed(1)}; })()');
check('immobilised: the tank stays put under full throttle while the track is repaired', r.moved < 0.6, r);
r = await ev('(()=>{ const x=__veh.x, z=__veh.z; __R.force=[-1,0]; __sim(1/60, 60*2); return {moved:+Math.hypot(__veh.x-x,__veh.z-z).toFixed(1), immob:__veh.immob, shown:document.getElementById("sT").style.display!=="none"}; })()');
check('repaired: it backs out again and the pill is gone', r.moved > 2 && r.immob <= 0 && !r.shown, r);
await ev('__R.force=null; __veh.v=0; __sim(1/60,60)');

// 2: HE into the field clears mines around the impact
// (on the ice, towards the lake centre: since the lidar terrain (e3b380f) the lake is smaller and 50 m ahead of the tank is the rising bank, where the
// sight ray from 0.5 m over the mines' level met the slope 6 m short and the round burst out of reach of the field)
await ev(`M.s.fill(0); M.fld.fill(0); window.HX=__veh.x+L.ax*50; window.HZ=__veh.z+L.az*50; M.lay(HX, HZ, -L.az, L.ax); __sim(1/60, 120); window.N1=M.armed();
  { let bi=-1, bd=1e9; for (let i=0;i<M.s.length;i++) if (M.s[i]===1) { const d=Math.hypot(M.x[i]-HX, M.z[i]-HZ); if (d<bd) { bd=d; bi=i; } } window.MI=bi; }
  __game.ammo(2); __sim(1/60, 60*7); __aimAt(M.x[MI], M.y[MI]+0.05, M.z[MI]); __cam.mode=1; __sim(1/60, 360); __inp.fire=true; __sim(1/60,3); __inp.fire=false; __sim(1/60, 60*2); __aimAt();`);
r = await ev('({before:N1, after:M.armed()})');
check('an HE round into the field sets off the mines around the impact', r.after < r.before, r);

// 3: rocket-laid mines: warning, scatter, visible on the snow, marked
await ev('M.s.fill(0); M.fld.fill(0); __cam.mode=0; window.N2=M.armed(); M.strike(); __sim(1/60, 60*7)');
r = await ev('({armed:M.armed(), surface:Array.from(M.s).filter((s)=>s===2).length, marked:Array.from(M.s).filter((s,i)=>s===2&&M.r[i]).length, near:Array.from(M.s).map((s,i)=>s===2?Math.hypot(M.x[i]-__veh.x,M.z[i]-__veh.z)|0:-1).filter((d)=>d>=0)})');
check('a rocket strike scatters ~10 marked mines on the snow 18–80 m around', r.surface >= 9 && r.marked === r.surface && Math.max(...r.near) < 85, r);
await ev(`{ let bi=-1, bd=1e9; for (let i=0;i<M.s.length;i++) if (M.s[i]===2) { const d=Math.hypot(M.x[i]-__veh.x, M.z[i]-__veh.z); if (d<bd) { bd=d; bi=i; } } window.SI=bi; }
  __look(M.x[SI]+2.2, 1.1, M.z[SI]+1.6, M.x[SI], 0.05, M.z[SI])`); await shot('surface-mine-close');
await ev('__R.pose=null'); await ev(`__look(__veh.x-FX*6, 9, __veh.z-FZ*6, __veh.x+FX*40, 0, __veh.z+FZ*40)`); await shot('surface-mines-overview'); await ev('__R.pose=null');

// 4: the MG picks off a surface mine
await ev(`window.N3=M.armed(); __aimAt(M.x[SI], M.y[SI]+0.05, M.z[SI]); __cam.mode=1; __cam.zoom=1; __sim(1/60, 330); /* the nearest mine may be behind the turret: 5.5 s to traverse (2 s was enough only while the old lake layout put it ahead) */ __inp.mg=true; __sim(1/60, 90); __inp.mg=false; __sim(1/60, 30); __aimAt(); __cam.zoom=0; __cam.mode=0;`);
r = await ev('({before:N3, after:M.armed(), gone:M.s[SI]!==2, d:Math.hypot(M.x[SI]-__veh.x,M.z[SI]-__veh.z)|0})');
check('a burst of MG fire sets off the surface mine it hits', r.gone && r.after < r.before, r);

// 5: a recon drone reveals a buried field 250 m out
await ev(`M.s.fill(0); M.r.fill(0); M.fld.fill(0); window.FCX=__veh.x+FX*250; window.FCZ=__veh.z+FZ*250; M.lay(FCX, FCZ, -FZ, FX); __sim(1/60, 30);
  __game.droneType(2); __game.droneKey(); { const D=__game.drone; D.x=__veh.x+FX*150; D.z=__veh.z+FZ*150; D.y=__W.heightAt(D.x,D.z)+90; D.climb=0; D.vx=D.vy=D.vz=0;
  const dx=FCX-D.x, dy=__W.heightAt(FCX,FCZ)-D.y, dz=FCZ-D.z; D.yaw=Math.atan2(-dx,-dz); D.pitch=Math.atan2(dy,Math.hypot(dx,dz)); } __sim(1/60, 40)`);
r = await ev('({armed:M.armed(), marked:Array.from(M.s).filter((s,i)=>s===1&&M.r[i]).length})');
check('a recon drone looking at the field marks its buried mines', r.marked >= Math.min(4, r.armed) && r.armed >= 5, r);
await ev('__step(1/60, 14)'); await page.locator('#map').screenshot({ path: `${out}/map-mines.png` });
await shot('drone-sees-field');
await ev('__game.drone.t=0.5; __sim(1/60, 60)'); // end the recon (X now hands it to its autopilot)

// 6: an enemy drives round its own field on a road towards the player
r = await ev(`(()=>{ const RD=__W.roads.filter((t)=>t.n>120&&Math.abs(t.pts[t.n]) < __W.PLAY-200 && Math.abs(t.pts[t.n+1]) < __W.PLAY-200).sort((a,b)=>b.n-a.n)[0]; if(!RD) return {err:'no road'};
  const P=RD.pts, i1=Math.floor(RD.n/2), walk=(i,dir,m)=>{ let d=0; while(i+dir>0&&i+dir<RD.n-1&&d<m){ d+=Math.hypot(P[i*2+dir*2]-P[i*2],P[i*2+dir*2+1]-P[i*2+1]); i+=dir; } return i; }, i0=walk(i1,-1,180), i2=walk(i1,1,260); M.s.fill(0); M.fld.fill(0);
  const ex=P[i1*2+2]-P[i1*2-2], ez=P[i1*2+3]-P[i1*2-1], el=Math.hypot(ex,ez); M.lay(P[i1*2], P[i1*2+1], ex/el, ez/el);
  __tp(P[i2*2], P[i2*2+1], 0); __R.god=true; const g=__game; for (const e of g.enemies) e.on=false; g.spawn(0); const e=g.enemies[0];
  Object.assign(e,{x:P[i0*2], z:P[i0*2+1], y:__W.heightAt(P[i0*2],P[i0*2+1]), net:1, path:__W.roads.indexOf(RD), pi:i0, dir:1, hold:20, role:0, immob:false, gx:__veh.x, gz:__veh.z, evalT:0});
  let minD=1e9; const fr=M.fld[2], hits0=M.armed();
  for (let k=0;k<60*90;k++){ __sim(1/60,1); minD=Math.min(minD, Math.hypot(e.x-P[i1*2], e.z-P[i1*2+1])); if (Math.hypot(e.x-__veh.x,e.z-__veh.z)<60) break; }
  return {fieldR:+fr.toFixed(1), minD:+minD.toFixed(1), armed:M.armed(), armed0:hits0, distToPlayer:Math.hypot(e.x-__veh.x,e.z-__veh.z)|0, roadLen:RD.n, stuck:__game.stuck}; })()`);
check('the enemy skirts its own field (stays outside it) and still closes on the player', !r.err && r.minD > r.fieldR * 0.8 && r.armed === r.armed0 && r.distToPlayer < 400, r);
// review fixes: a tank in the air over a mine does not set it off; the bomber's marker stops on round colliders like the grenade
r = await ev(`(()=>{ for (const e of __game.enemies) e.on=false; M.s.fill(0); M.fld.fill(0); __R.force=null; __veh.v=0; __sim(1/60,30);
  const i=M.at(__veh.x, __veh.z, 2, 0); __sim(1/60, 150); const hp=__veh.hp; __veh.y+=10; __veh.vy=0; __veh.air=true; __veh.v=6; __sim(1/60,1);
  return {mine:M.s[i], hp0:hp, hp:__veh.hp, immob:+__veh.immob.toFixed(1)}; })()`);
check('a tank in the air over a mine does not set it off', r.mine === 2 && r.hp === r.hp0, r);
await ev('M.s.fill(0); __sim(1/60, 120)');
r = await ev(`(()=>{ const C=__W.colliders; let c=null, bd=1e9; for (let k=0;k<C.length;k+=3) { const d=Math.hypot(C[k]-__veh.x,C[k+1]-__veh.z); if (d<bd && C[k+2]>0.6) { bd=d; c={x:C[k],z:C[k+1]}; } } if (!c) return {err:'no collider'};
  __game.droneType(1); __game.droneKey(); const D=__game.drone; Object.assign(D,{x:c.x, z:c.z, y:__W.heightAt(c.x,c.z)+40, vx:0,vy:0,vz:0, climb:0, away:true, pitch:-1.5707}); __sim(1/60,10);
  const out={iy:+(D.iy-__W.heightAt(c.x,c.z)).toFixed(1), iok:D.iok}; __game.droneKey(); __sim(1/60,5); return out; })()`);
check('the drop marker over a round collider sits where the grenade stops (≈ 9 m up), not on the ground', !r.err && r.iok && r.iy > 5, r);
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
