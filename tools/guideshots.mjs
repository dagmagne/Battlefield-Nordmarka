// Renders for the player guide (docs/guide): the Leopard, every enemy vehicle, soldiers, enemy and own drones, mines, smoke,
// artillery and the sight / drone views, staged on the open lake.  usage: node tools/guideshots.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/guide';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1300,820']) });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e).slice(0, 600)));
await page.goto(`${base}?w=frogner&nohint&peace&q=high&drs=0&tod=1&mute`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const ev = (js) => page.evaluate(js);
const shot = async (name, n = 4) => { await ev(`__step(1/60,${n})`); await page.waitForTimeout(100); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const hud = (on) => ev(`__R.nohud=${!on}; document.getElementById('ui').style.display='${on ? '' : 'none'}'`);

await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L;
  const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l; window.CX=L.x; window.CZ=L.z;
  __tp(L.x-FX*110, L.z-FZ*110, Math.atan2(FX, FZ)); __ui.poll=()=>{}; window.G=__game; __R.god=true; __sim(1/60, 30);
  // a 3/4 view of point (x,z) seen from angle a (rad, relative to the yaw's forward) at distance d and height h
  window.v34=(x,z,yaw,a,d,h,th)=>{ const fx=-Math.sin(yaw), fz=-Math.cos(yaw), c=Math.cos(a), s=Math.sin(a), dx=fx*c-fz*s, dz=fz*c+fx*s; __look(x+dx*d, h, z+dz*d, x, th, z); };
  window.only=(t,cage)=>{ for (const e of G.enemies) e.on=false; G.spawn(t,3); const e=G.enemies.find((q)=>q.on); e.x=CX; e.z=CZ; e.y=__W.heightAt(CX,CZ); e.yaw=Math.atan2(-(__veh.x-CX),-(__veh.z-CZ))+0.9; e.immob=true; e.path=-1; e.cage=!!cage; e.turYaw=0; window.E=e; return e; };
  return 1; })()`);
await hud(false);

// player tank
await ev(`__tp(CX, CZ, Math.atan2(FX,FZ)+2.4); __sim(1/60,10); v34(__veh.x, __veh.z, __veh.yaw, 0.75, 11, 2.6, 1.6)`); await shot('leopard');
await ev(`G.ammo(0); __aimAt(__veh.x-Math.sin(__veh.yaw)*400, __veh.y+2, __veh.z-Math.cos(__veh.yaw)*400); __sim(1/60,60*10); __R.pose=null; __inp.fire=true; __sim(1/60,1); __inp.fire=false; v34(__veh.x, __veh.z, __veh.yaw, 1.2, 16, 2.2, 2.2);`);
for (let k = 0; k < 3; k++) await shot('leopard-fire-' + k, 1);
await ev(`__aimAt(); __R.pose=null; __sim(1/60, 60*9)`);
// smoke screen
await ev(`G.smoke(); __sim(1/60, 60*3.5); v34(__veh.x, __veh.z, __veh.yaw, 2.6, 26, 4, 3)`); await shot('smoke');
await ev(`__R.pose=null; __sim(1/60, 60*40); __tp(CX-FX*110, CZ-FZ*110, Math.atan2(FX,FZ)); __sim(1/60, 30)`);

// enemy vehicles
const VEH = [[0, 't72'], [0, 't72-cage', true], [1, 'bmp'], [3, 'btr'], [2, 'tigr'], [4, 'buggy'], [5, 'moto']];
for (const [t, name, cage] of VEH) {
  const dd = t >= 4 ? 5.2 : t === 2 ? 7 : 9.5;
  await ev(`(()=>{ const e=only(${t}, ${!!cage}); __sim(1/60, 20); e.x=CX; e.z=CZ; e.v=0; v34(e.x, e.z, e.yaw, 0.7, ${dd}, ${t >= 4 ? 1.7 : 2.6}, ${t >= 4 ? 0.8 : 1.3}); })()`); await shot(name);
}
await ev('for (const e of G.enemies) e.on=false; __R.pose=null');

// soldiers
await ev(`__infDemo(CX, CZ, { poses:[5,1,3,7,4,0], n:6, cols:6, sp:2.4, yaw:Math.atan2(FX,FZ)+3.1416-0.5 }); __look(CX-9*Math.sin(Math.atan2(FX,FZ)+3.1416-0.5)+FZ*2, 1.6, CZ-9*Math.cos(Math.atan2(FX,FZ)+3.1416-0.5)-FX*2, CX, 0.9, CZ)`); await shot('soldiers', 40);
await ev(`__infDemo(CX, CZ, { poses:[7,3], n:2, cols:2, sp:2.0, yaw:Math.atan2(FX,FZ)+3.1416-0.9 }); { const y=Math.atan2(FX,FZ)+3.1416-0.9, fx=-Math.sin(y), fz=-Math.cos(y); __look(CX+fx*4.2-fz*1.6, 1.2, CZ+fz*4.2+fx*1.6, CX, 0.75, CZ); }`); await shot('rpg-team', 40);
await ev('G.inf.n=0; G.inf.d.fill(0); __sol.reset(); __R.pose=null');

// enemy air, close up
for (const [t, name, d, h] of [[0, 'enemy-fpv', 1.3, 0.25], [1, 'lancet', 2.8, 0.6], [2, 'orlan', 4.2, 1.2]]) {
  await ev(`(()=>{ for (const a of G.air) a.on=false; const A=G.airSpawn(${t}, 0); A.x=CX+FZ*5; A.z=CZ-FX*5; A.y=__W.heightAt(A.x,A.z)+6; A.vx=-FX*2; A.vz=-FZ*2; A.vy=0; A.t=1e9; A.st=0; window.A=A;
    __step(1/60,2); A.x=CX+FZ*5; A.z=CZ-FX*5; A.y=__W.heightAt(A.x,A.z)+6; const g=A.y-__W.heightAt(A.x,A.z); __look(A.x+FZ*${d}+FX*${d * 0.6}, g+${h}, A.z-FX*${d}+FZ*${d * 0.6}, A.x, g, A.z); })()`); await shot(name, 1);
}
await ev('for (const a of G.air) a.on=false; __R.pose=null');

// own drones: FPV in flight seen from outside, then the bomber and recon camera views (HUD on)
await ev(`G.droneType(0); G.droneKey(); { const D=G.drone; D.x=CX; D.z=CZ; D.y=__W.heightAt(CX,CZ)+5; D.vx=D.vy=D.vz=0; } __sim(1/60, 2); { const D=G.drone, g=D.y-__W.heightAt(D.x,D.z); __look(D.x+1.4, g+0.35, D.z+1.1, D.x, g, D.z); }`); await shot('drone', 1);
await ev(`G.droneKey(); __R.pose=null; __sim(1/60, 60*6); G.dn[0]=5;`);
await hud(true);
await ev(`(()=>{ const e=only(0); e.x=CX; e.z=CZ; e.y=__W.heightAt(CX,CZ); __tp(CX-FX*90, CZ-FZ*90, Math.atan2(FX,FZ)); __sim(1/60,30);
  G.droneType(1); G.droneKey(); const D=G.drone, Lx=2.2; Object.assign(D,{x:e.x+Math.sin(e.yaw)*Lx, z:e.z+Math.cos(e.yaw)*Lx, y:e.y+40, vx:0, vy:0, vz:0, climb:0, away:true, pitch:-1.5707}); __sim(1/60,30); })()`); await shot('bomber-view');
await ev(`G.droneKey(); __sim(1/60, 60*3); G.dn[1]=2;`);
await ev(`(()=>{ const e=only(1); e.immob=true; G.droneType(2); G.droneKey(); __sim(1/60, 60*3); const D=G.drone, a=Math.atan2(e.x-__veh.x, e.z-__veh.z); D.x=e.x-Math.sin(a)*260; D.z=e.z-Math.cos(a)*260; D.y=__W.heightAt(D.x,D.z)+110; D.vx=D.vy=D.vz=0;
  const dx=e.x-D.x, dy=e.y+1.5-D.y, dz=e.z-D.z; D.yaw=Math.atan2(-dx,-dz); D.pitch=Math.atan2(dy,Math.hypot(dx,dz)); __sim(1/60, 60); })()`); await shot('recon-view');
await page.locator('#map').screenshot({ path: `${out}/minimap.png` });
await ev(`G.drone.on=false; G.drone.auto=false; __cam.mode=0; for (const e of G.enemies) e.on=false; G.inf.reset && G.inf.reset(); G.inf.n=0; G.inf.d.fill(0); __sim(1/60, 60*2); G.dn[2]=2;`);

// gunner sight, day and thermal, on a T-72 900 m off
await ev(`(()=>{ const e=only(0); e.x=CX+FZ*15; e.z=CZ-FX*15; e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(FX,FZ)+1.2; __aimAt(e.x, e.y+1.2, e.z); __cam.mode=1; __sim(1/60, 200); })()`);
await shot('sight');
await ev('__R.therm=1'); await shot('sight-thermal'); await ev('__R.therm=0');
await ev(`__cam.mode=0; __aimAt(); __sim(1/60,30)`); await shot('commander-view');
await ev('G.bigMap && G.bigMap()'); await shot('bigmap'); await ev('G.bigMap && G.bigMap()');
await hud(false);

// mines: a buried field with a marked mine, and a scattered surface mine close up
await ev(`(()=>{ const M=G.mines; M.s.fill(0); M.fld.fill(0); M.strike(); __sim(1/60, 60*7); let bi=-1, bd=1e9; for (let i=0;i<M.s.length;i++) if (M.s[i]===2) { const d=Math.hypot(M.x[i]-__veh.x, M.z[i]-__veh.z); if (d<bd) { bd=d; bi=i; } } window.SI=bi;
  __look(M.x[bi]+2.0, 1.0, M.z[bi]+1.5, M.x[bi], 0.15, M.z[bi]); })()`); await shot('mine');
await ev('G.mines.s.fill(0); __R.pose=null');

// own artillery: impact 230 m ahead, seen from 110 m off to the side; frames from the first landing
await ev(`(()=>{ for (const e of G.enemies) e.on=false; const x=CX+FX*60, z=CZ+FZ*60; G.support.n=1; G.support.st=0; window.OK=G.support.call(x, z); window.AX=x; window.AZ=z; __sim(1/60, 60*21);
  __look(x-FX*60+FZ*22, 4, z-FZ*60-FX*22, x, 7, z); })()`);
console.log('arty call', await ev('JSON.stringify({ok:OK, st:G.support.st, t:G.support.t, t0:G.support.t0, n:G.support.n})'));
let got = 0;
for (let k = 0; k < 160 && got < 16; k++) { await ev('__sim(1/60, 4); __step(1/60, 1)'); if (got || await ev('G.support.st>0 && G.support.t>G.support.t0+0.05')) { await page.screenshot({ path: `${out}/arty-${got}.png` }); got++; } }
await browser.close();
console.log('done');
