// Phase 1 behaviour test (headed GPU Chrome, logic through __sim): the map shows only enemies that have been seen,
// the bomber drone hits a stationary T-72 from 40 m, lands back on the tank, and the recon drone climbs and spots.
// usage: node tools/dronetest.mjs [outdir] [--port N --path P]   (screenshots of the map and the drone views go to outdir)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase1';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1200,800']) });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errs = 0;
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace&q=medium&drs=0&tod=1`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);
const shot = async (name) => { await ev('__step(1/60,3)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/${name}.png` }); };
const mapShot = async (name) => { await ev('__step(1/60,14)'); await page.waitForTimeout(80); const m = await page.$('#map'); await m.screenshot({ path: `${out}/${name}.png` }); };

// stage: the tank on the near shore of the biggest lake, a T-72 (E) 220 m across the ice, a BMP (B) behind the tank
await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0];
  __tp(L.x-L.ax*110, L.z-L.az*110, 0); __ui.poll=()=>{}; __R.god=true; const g=__game; g.spawn(0); g.spawn(1);
  const e=g.enemies[0], b=g.enemies[1]; window.E=e; window.B=b;
  Object.assign(e,{x:L.x+L.ax*110, z:L.z+L.az*110, yaw:1, path:-1, immob:true}); Object.assign(b,{x:__veh.x-L.ax*260, z:__veh.z-L.az*260, yaw:2.4, path:-1, immob:true});
  const away=Math.atan2(-(E.x-__veh.x),-(E.z-__veh.z))+Math.PI/2; __aim(away,0,0); window.AWAY=away; __sim(1/60,120); })()`);
let r = await ev('({seenE:E.seen, seenB:B.seen, spotE:E.spotT, dE:Math.hypot(E.x-__veh.x,E.z-__veh.z)|0, dB:Math.hypot(B.x-__veh.x,B.z-__veh.z)|0, losE:E.los})');
check('nothing on the map before anyone has looked', !r.seenE && !r.seenB, r);
await mapShot('map-0-unseen');

await ev('__aimAt(E.x, E.y+1.5, E.z); __sim(1/60, 60)');
r = await ev('({seen:E.seen, spot:+E.spotT.toFixed(1), los:+E.los.toFixed(2), B:B.seen})');
check('the sight on the T-72 puts it on the map', r.seen && r.spot > 0 && !r.B, r);
await mapShot('map-1-spotted');

await ev('__aimAt(); __aim(AWAY,0,0); __sim(1/60, 60*12)');
r = await ev('({seen:E.seen, spot:E.spotT, lost:+E.lostT.toFixed(1)})');
check('looking away: contact goes stale (hollow marker at the last known position)', r.seen && r.spot <= 0 && r.lost > 3, r);
await mapShot('map-2-lost');

await ev('B.fire=true; __sim(1/60, 2)');
r = await ev('({seen:B.seen, spot:+B.spotT.toFixed(1)})');
check('a muzzle flash gives the BMP away', r.seen && r.spot > 5, r);

// bomber: hover 40 m above the engine deck of the stationary T-72 and drop
await ev(`__game.droneType(1); __game.droneKey(); { const D=__game.drone, L=2.2; Object.assign(D,{x:E.x+Math.sin(E.yaw)*L, z:E.z+Math.cos(E.yaw)*L, y:E.y+40, vx:0, vy:0, vz:0, climb:0, away:true, pitch:-1.5707}); } __sim(1/60, 30)`);
r = await ev('({on:__game.drone.on, type:__game.drone.type, bombs:__game.drone.bombs, iok:__game.drone.iok, off:+Math.hypot(__game.drone.ix-E.x,__game.drone.iz-E.z).toFixed(2), iy:+(__game.drone.iy-E.y).toFixed(2), agl:+(__game.drone.y-E.y).toFixed(1), hud:document.getElementById("sD").textContent})');
check('bomber hovers 40 m up with 3 grenades and a predicted impact on the target', r.on && r.type === 1 && r.bombs === 3 && r.iok && r.off < 3 && r.iy > 1.2, r); // the marker sits on the hull top, not the snow under it
await shot('bomber-view');
const hp0 = await ev('E.hp');
await ev('__inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60, 60*4)');
r = await ev('({hp:+E.hp.toFixed(1), immob:E.immob, dead:E.dead, bombs:__game.drone.bombs})');
check('first grenade from 40 m hits the engine deck', r.hp < hp0 - 40 && r.bombs === 2, { hp0, ...r });
await ev('__inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60, 60*4)');
r = await ev('({hp:+E.hp.toFixed(1), dead:E.dead, kills:__game.kills, bombs:__game.drone.bombs})');
check('second grenade knocks it out', r.dead && r.kills >= 1 && r.bombs === 1, r);
await shot('bomber-after');
await ev('__game.drone.x=__veh.x+1.5; __game.drone.z=__veh.z; __game.drone.y=__veh.y+3.2; __sim(1/60, 20)');
r = await ev('({on:__game.drone.on, n:Array.from(__game.dn), mode:__cam.mode})');
check('bomber lands on the tank and is back in stock', !r.on && r.n[1] === 2 && r.mode === 0, r);

// recon: climbs on its own, then spots the (unseen) BMP from 120 m up and 300 m away
await ev('B.seen=false; B.spotT=0; B.lostT=0; __game.droneType(2); __game.droneKey(); __sim(1/60, 60*12)');
r = await ev('({on:__game.drone.on, agl:+(__game.drone.y-__W.heightAt(__game.drone.x,__game.drone.z)).toFixed(1), Bseen:B.seen})');
check('recon drone climbs to about 110 m', r.on && r.agl > 100 && r.agl < 130, r);
await ev(`{ const D=__game.drone, a=Math.atan2(B.x-__veh.x, B.z-__veh.z); B.seen=false; B.spotT=0; D.x=B.x-Math.sin(a)*300; D.z=B.z-Math.cos(a)*300; D.y=__W.heightAt(D.x,D.z)+120; D.vx=D.vy=D.vz=0;
  const dx=B.x-D.x, dy=B.y+1.5-D.y, dz=B.z-D.z; D.yaw=Math.atan2(-dx,-dz); D.pitch=Math.atan2(dy,Math.hypot(dx,dz)); window.RV=Math.hypot(dx,dy,dz)|0; } __sim(1/60, 40)`);
r = await ev('({seen:B.seen, spot:+B.spotT.toFixed(1), range:RV, los:+__game.vis(__game.drone.x,__game.drone.y,__game.drone.z,B.x,B.y+1.5,B.z).toFixed(2)})');
check('recon drone puts the BMP on the map', r.seen && r.spot > 30, r);
await shot('recon-view'); await mapShot('map-3-recon');
await ev('__game.droneKey(); __sim(1/60, 5)');
r = await ev('({on:__game.drone.on, auto:__game.drone.auto, mode:__cam.mode, n:Array.from(__game.dn), hud:document.getElementById("sD").textContent})');
check('X with the recon up hands it to its autopilot (still flying, you are back in the tank)', r.on && r.auto && r.mode === 0 && r.n[2] === 1, r);
await ev('__game.drone.t=0.5; __sim(1/60, 60)');
r = await ev('({on:__game.drone.on, n:Array.from(__game.dn)})');
check('the recon on autopilot is lost when its battery is flat', !r.on && r.n[2] === 1, r);

// FPV still works: launch, detonate
await ev('__game.droneType(0); __game.droneKey(); __sim(1/60, 30); __inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60,10)');
r = await ev('({on:__game.drone.on, hold:+__game.drone.hold.toFixed(1), n:Array.from(__game.dn)})');
check('FPV detonates on the button as before', !r.on && r.hold > 3 && r.n[0] === 4, r);
// recon on autopilot: X with the recon up puts you back in the tank while it keeps circling and spotting until the battery is flat
r = await ev(`(()=>{ const D=__game.drone; __sim(1/60, 60*6); __game.dn[2]=2; __game.droneType(2); __game.droneKey(); __sim(1/60, 60*10); __game.droneKey(); __sim(1/60, 30);
  const out={on:D.on, auto:D.auto, mode:__cam.mode}; const rl0=__game.rl; __inp.fire=true; __sim(1/60,2); __inp.fire=false; out.fired=__game.rl>rl0;
  B.seen=false; B.spotT=0; D.ax=B.x; D.az=B.z; D.x=B.x+80; D.z=B.z; D.y=__W.heightAt(D.x,D.z)+100; __sim(1/60, 60*20); out.spotted=B.seen; out.circleR=Math.round(Math.hypot(D.x-D.ax,D.z-D.az));
  __cam.mode=1; D.t=1; __sim(1/60, 90); out.endOn=D.on; out.endMode=__cam.mode; __cam.mode=0; return out; })()`); // (review fix: the end of an autonomous flight leaves the gunner sight alone)
check('recon on autopilot: back in the tank (gun fires), the drone circles, spots and flies until its battery is flat', r.on && r.auto && r.mode === 0 && r.fired && r.spotted && r.circleR > 50 && r.circleR < 110 && !r.endOn && r.endMode === 1, r);
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
