// Phase 3 behaviour test (headed GPU Chrome, logic through __sim): the hatch MG shoots down a diving FPV drone, an FPV hit
// does the expected damage, smoke breaks a Lancet's lock, an FPV finds a still tank in the open, the Orlan circles and feeds the
// enemy, and is shot down, and a cope cage blunts a bomber grenade.  usage: node tools/airtest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase3';
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

await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L;
  const yaw=Math.atan2(L.ax, L.az); __tp(L.x-L.ax*110, L.z-L.az*110, yaw); __ui.poll=()=>{}; window.G=__game; window.FW=yaw;
  // aim the hatch MG at an air unit with lead (the commander's view), like a player tracking it
  window.track = (a) => { const dx=a.x-__cam.x, dy=a.y-__cam.y, dz=a.z-__cam.z, d=Math.hypot(dx,dy,dz), t=d/820; __aimAt(a.x+a.vx*t, a.y+a.vy*t, a.z+a.vz*t); };
  window.fly = (a, n, shoot) => { for (let k=0;k<n&&a.on&&a.st!==3;k++){ if (shoot) { track(a); __inp.aa=true; } __sim(1/60,1); } __inp.aa=false; };
  __cam.mode=0; __sim(1/60, 30); })()`);

// 1: the hatch MG against a diving FPV
await ev(`window.A=G.airSpawn(0, FW+0.8); { const b=FW+0.8; A.x=__veh.x+Math.sin(b)*260; A.z=__veh.z-Math.cos(b)*260; A.y=__W.heightAt(A.x,A.z)+30; A.st=2; } window.HP0=__veh.hp; window.MG0=G.mg; window.SC0=G.score;`);
await ev('for (let k=0;k<50;k++){ track(A); __sim(1/60,1); }'); await shot('fpv-incoming');
await ev('fly(A, 60*12, true)');
r = null; var r = await ev('({on:A.on, hp0:HP0, hp:__veh.hp, rounds:MG0-G.mg, score:G.score-SC0, dist:Math.hypot(A.x-__veh.x,A.z-__veh.z)|0})');
check('the hatch MG shoots down an FPV diving on the tank', !r.on && r.hp === r.hp0 && r.score === 25, r);

// 1b: the one MG control (Space) switches to the hatch MG on its own when the crosshair is on a drone
await ev(`window.A=G.airSpawn(0, FW+0.8); { const b=FW+0.8; A.x=__veh.x+Math.sin(b)*260; A.z=__veh.z-Math.cos(b)*260; A.y=__W.heightAt(A.x,A.z)+30; A.st=2; } window.HP0=__veh.hp; window.AUTO=false;
  for (let k=0;k<60*12&&A.on&&A.st!==3;k++){ track(A); __inp.mg=true; __sim(1/60,1); if (G.hmgOn) AUTO=true; } __inp.mg=false;`);
r = await ev('({on:A.on, auto:AUTO, hp0:HP0, hp:__veh.hp})');
check('Space alone fires the hatch MG at a drone near the crosshair and shoots it down', !r.on && r.auto && r.hp === r.hp0, r);

// 1c: the same from the gunner sight (touch has no separate hatch-MG button)
await ev(`window.A=G.airSpawn(0, FW+0.8); { const b=FW+0.8; A.x=__veh.x+Math.sin(b)*260; A.z=__veh.z-Math.cos(b)*260; A.y=__W.heightAt(A.x,A.z)+30; A.st=2; } window.AUTO=false;
  for (let k=0;k<60*12&&A.on&&A.st!==3;k++){ __cam.mode=1; track(A); __inp.mg=true; __sim(1/60,1); if (G.hmgOn) AUTO=true; } __inp.mg=false; __cam.mode=0;`);
r = await ev('({on:A.on, auto:AUTO})');
check('in the gunner sight too, the MG switches to the hatch MG on a drone and shoots it down', !r.on && r.auto, r);

// 2: no defence: the hit
await ev(`__aimAt(); window.A=G.airSpawn(0, FW-1); { const b=FW-1; A.x=__veh.x+Math.sin(b)*200; A.z=__veh.z-Math.cos(b)*200; A.y=__W.heightAt(A.x,A.z)+25; A.st=2; } window.HP0=__veh.hp; fly(A, 60*15, false);`);
r = await ev('({on:A.on, hp0:HP0, hp:+__veh.hp.toFixed(1), lost:+(HP0-__veh.hp).toFixed(1)})');
check('an FPV that gets through does 25–40 hull damage', !r.on && r.lost >= 24 && r.lost <= 41, r);
await ev('__veh.hp=100');

// 3: an FPV searching over a still tank in the open finds it
await ev(`window.A=G.airSpawn(0, FW+2); A.x=__veh.x+90; A.z=__veh.z+40; A.y=__W.heightAt(A.x,A.z)+28; A.st=1; A.tx=__veh.x+60; A.tz=__veh.z; window.LT=-1; for (let k=0;k<60*40&&LT<0;k++){ __sim(1/60,1); if (A.st===2) LT=k/60; }`);
r = await ev('({lockAfter:+LT.toFixed(1)})');
check('an FPV searching nearby finds a still tank in the open within 40 s', r.lockAfter >= 0, r);
await ev('fly(A, 60*10, true); A.on=false; __veh.hp=100');

// 4: smoke breaks a Lancet's lock
await ev(`window.A=G.airSpawn(1, FW); { const b=FW; A.x=__veh.x+Math.sin(b)*500; A.z=__veh.z-Math.cos(b)*500; A.y=__W.heightAt(A.x,A.z)+110; A.st=2; } window.HP0=__veh.hp; __sim(1/60, 20); G.smoke(); window.BROKE=false; for (let k=0;k<60*14&&A.on;k++){ __sim(1/60,1); if (A.st<2) BROKE=true; }`);
r = await ev('({broke:BROKE, hp0:HP0, hp:__veh.hp, on:A.on})');
check('smoke makes a diving Lancet lose the tank', r.broke && r.hp === r.hp0, r);
await ev('for (const a of G.air) a.on=false; __sim(1/60, 60*25)'); // let the smoke clear

// 5: Orlan: circles, feeds the enemy, can be shot down
await ev(`G.spawn(0); window.E=G.enemies[0]; E.immob=true; E.known=0; window.O=G.airSpawn(2, FW+1.5); __sim(1/60, 60*90);`);
r = await ev('({on:O.on, r:Math.hypot(O.x-__veh.x,O.z-__veh.z)|0, agl:(O.y-__W.heightAt(O.x,O.z))|0, orlan:+G.orlan.toFixed(1), known:+E.known.toFixed(1)})');
check('the Orlan circles about 280 m out and ~180 m up, watching, and enemies know where the tank is', r.on && r.r > 180 && r.r < 400 && r.agl > 140 && r.orlan > 0 && r.known > 0, r);
await ev('track(O); __sim(1/60,2)'); await shot('orlan-in-view');
await ev(`window.SC0=G.score; fly(O, 60*20, true); __sim(1/60, 60*3)`);
r = await ev('({on:O.on, st:O.st, score:G.score-SC0, y:(O.y-__W.heightAt(O.x,O.z))|0})');
check('the hatch MG brings the Orlan down', (!r.on || r.st === 3) && r.score === 60, r);
await ev('__sim(1/60, 60*20); __aimAt()');

// 6: cope cage: a bomber grenade on the engine deck of a caged T-72
r = await ev(`(()=>{ const res=[]; for (const cage of [false, true]) { for (const e of G.enemies) e.on=false; G.spawn(0); const e=G.enemies[0]; e.cage=cage; e.hp=100; e.immob=true; e.x=__veh.x-Math.sin(FW)*60; e.z=__veh.z-Math.cos(FW)*60; e.yaw=0.4; __sim(1/60,10);
  G.droneType(1); G.droneKey(); const D=G.drone, Lz=2.2; Object.assign(D,{x:e.x+Math.sin(e.yaw)*Lz, z:e.z+Math.cos(e.yaw)*Lz, y:e.y+40, vx:0,vy:0,vz:0, climb:0, away:true, pitch:-1.5707}); __sim(1/60,20);
  __inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60,60*4); res.push(+(100-e.hp).toFixed(1)); G.droneKey(); __sim(1/60,5); G.dn[1]=2; } return res; })()`);
check('a cope cage cuts a top-attack grenade on the engine deck to about a third', r[1] < r[0] * 0.45 && r[1] > 0, { open: r[0], caged: r[1] });
await ev(`{ const e=G.enemies[0]; __look(e.x+6, 3.6, e.z+5, e.x, 1.8, e.z); }`); await shot('cope-cage');
await ev(`__R.pose=null; window.A=G.airSpawn(1, FW); A.x=__veh.x+20; A.z=__veh.z-40; A.y=__veh.y+14; A.vx=-2; A.vz=0.6; A.t=1e9; __look(A.x+2.6, A.y-__W.heightAt(A.x,A.z)+0.6, A.z+1.8, A.x, A.y-__W.heightAt(A.x,A.z), A.z)`); await shot('lancet-close');
await ev(`A.on=false; __R.pose=null; window.O=G.airSpawn(2, FW); O.x=__veh.x+20; O.z=__veh.z-40; O.y=__veh.y+14; O.vx=-2; O.vz=0; G.drone.on=false; __look(O.x+3.5, O.y-__W.heightAt(O.x,O.z)+1.2, O.z+3.5, O.x, O.y-__W.heightAt(O.x,O.z), O.z)`); await shot('orlan-close');
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
