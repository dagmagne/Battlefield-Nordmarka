// Camouflage net (K): behaviour test in a headed GPU Chrome with __sim, on the lake. Rigging takes 8 s and needs a still tank; a T-72
// with a clear line takes far longer to detect a netted tank (or never does at range); an enemy that has already detected the tank keeps
// seeing it when the net goes up; driving, the main gun and the MG throw the net off; a restart clears it. Renders in shots/net/.
// usage: node tools/nettest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/net';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1300,860']) });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
let errs = 0, fails = 0;
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace&q=high&drs=0&tod=1&mute`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);
await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l;
  window.HOME=[L.x-L.ax*110, L.z-L.az*110, Math.atan2(-FX,-FZ)]; __ui.poll=()=>{}; window.G=__game; __R.god=true; G.peace=false; G.state=0; G.timer=1e9;
  window.TO=[]; const t0=__ui.toast; __ui.toast=(m)=>{ TO.push(m); t0(m); };
  window.run=(s)=>{ const n=Math.round(s*60); for (let k=0;k<n;k+=30) __sim(1/60, Math.min(30,n-k)); };
  window.home=()=>{ __api.restart(); G.peace=false; G.state=0; G.timer=1e9; __tp(HOME[0],HOME[1],HOME[2]); __R.force=null; __inp.fire=false; __inp.mg=false; run(1); };
  window.foe=(d)=>{ G.spawn(0); const e=G.lastSpawn||G.enemies.find((q)=>q.on); e.x=__veh.x+FX*d; e.z=__veh.z+FZ*d; e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(-(__veh.x-e.x),-(__veh.z-e.z)); e.path=-1; e.immob=true; e.see=0; e.known=0; e.rl=1e9; return e; };
  window.detect=(d,net,max)=>{ home(); if (net) { G.netKey(); run(9); } const up=G.net; const e=foe(d); let t=0; while (t<max && e.see<1) { run(0.5); t+=0.5; e.rl=1e9; } return {t:e.see>=1?t:-1, up, los:+e.los.toFixed(2)}; };
  window.pill=()=>document.getElementById('sN').textContent+'|'+document.getElementById('sN').className; })()`);

// rigging: needs a still tank, takes 8 s, the pill counts down
let r = await ev(`(()=>{ home(); __R.force=[1,0]; run(3); TO.length=0; G.netKey(); const moving={on:G.netOn, toast:TO[0], v:+__veh.v.toFixed(1)}; __R.force=null; run(6); G.netKey(); run(0.1); const p0=pill(); run(3.9); const mid={net:+G.net.toFixed(2), pill:pill()}; run(4.5); return {moving, p0, mid, up:G.net, pill:pill(), toast:TO[TO.length-1]}; })()`);
check('cannot be rigged while driving', !r.moving.on && /Stop the tank/.test(r.moving.toast), r.moving);
check('rigging takes 8 s with a countdown pill, then the pill is green', /NET 8 s\|st warn/.test(r.p0) && r.mid.net > 0.4 && r.mid.net < 0.6 && /NET [45] s/.test(r.mid.pill) && r.up === 1 && r.pill === 'NET|st on', r);
await ev('__chase(0.9, 0.28, 11)'); await ev('__step(1/60, 12)'); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/up-front.png` });
await ev('__chase(2.6, 0.2, 9)'); await ev('__step(1/60, 12)'); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/up-rear.png` });
await ev('__chase(0.9, 0.12, 60)'); await ev('__step(1/60, 12)'); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/far.png` });

// detection: a T-72 with a clear line, tank standing still in the open
const D = [150, 250, 350];
for (const d of D) {
  const a = await ev(`detect(${d}, false, 90)`), b = await ev(`detect(${d}, true, 90)`);
  console.log(`     T-72 at ${d} m: detects in ${a.t} s without the net, ${b.t < 0 ? 'not within 90 s' : b.t + ' s'} with it  (line of sight ${a.los})`);
  check(`T-72 at ${d} m: the net at least triples the time to detect the tank (or prevents it)`, a.t > 0 && b.up === 1 && (b.t < 0 || b.t >= a.t * 3), { a, b });
}
// already detected: rigging the net does not shake the enemy off
r = await ev(`(()=>{ home(); const e=foe(300); let t=0; while (t<60 && e.see<1) { run(0.5); t+=0.5; } const s0=e.see; G.netKey(); run(9); const up=G.net; run(15); return {s0:+s0.toFixed(2), up, see:+e.see.toFixed(2), state:e.state}; })()`);
check('an enemy that has detected the tank keeps seeing it after the net goes up', r.s0 >= 1 && r.up === 1 && r.see >= 1 && r.state === 1, r);
// what throws it off
r = await ev(`(()=>{ const o={}; __aim(HOME[2], 0, 0); home(); G.netKey(); run(9); __R.force=[1,0]; run(2.5); o.drive={net:G.net, on:G.netOn, toast:TO[TO.length-1]};
  home(); G.netKey(); run(9); __inp.fire=true; run(0.3); __inp.fire=false; o.gun={net:G.net, toast:TO[TO.length-1], rl:+G.rl.toFixed(1), n:G.n[0], pose:!!__R.pose, mode:__cam.mode};
  home(); G.netKey(); run(9); __inp.mg=true; run(0.3); __inp.mg=false; o.mg={net:G.net, toast:TO[TO.length-1]};
  home(); G.netKey(); run(9); G.netKey(); o.key={net:G.net, toast:TO[TO.length-1]};
  home(); G.netKey(); run(9); G.droneType(2); G.droneKey(); run(5); o.drone={net:G.net, flying:G.drone.on}; G.droneKey(); run(1);
  __api.restart(); o.restart={net:G.net, on:G.netOn}; return o; })()`);
check('driving, the main gun, the MG and K take the net off', r.drive.net === 0 && /moved/.test(r.drive.toast) && r.gun.net === 0 && /gun/.test(r.gun.toast) && r.mg.net === 0 && r.key.net === 0, r);
check('the net stays up while a drone is flown, and a restart clears it', r.drone.net === 1 && r.drone.flying && r.restart.net === 0 && !r.restart.on, { drone: r.drone, restart: r.restart });
await page.close();

// an Orlan circling a still tank in the open: watches it without the net, does not find it under the net
{ const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
  await p2.goto(`${base}?w=frogner&nohint&peace&q=low&drs=0&mute`); await p2.waitForFunction('window.__ready===true', null, { timeout: 120000 });
  const o = await p2.evaluate(`(()=>{ const G=__game, P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; __ui.poll=()=>{}; __R.god=true;
    const run=(s)=>{ const n=Math.round(s*60); for (let k=0;k<n;k+=30) __sim(1/60, Math.min(30,n-k)); }, go=(net)=>{ __api.restart(); G.peace=false; G.state=1; G.timer=1e9; G.wave=1; __tp(L.x, L.z, 0); run(1); if (net) { G.netKey(); run(9); }
      const a=G.airSpawn(2, 0); a.x=__veh.x+250; a.z=__veh.z; a.y=__W.heightAt(a.x,a.z)+180; a.tx=__veh.x; a.tz=__veh.z; let mx=0; for (let t=0;t<40;t++) { run(1); mx=Math.max(mx,G.orlan); } return +mx.toFixed(1); };
    return {open:go(false), net:go(true), calls:G.arty.calls}; })()`);
  check('Orlan over a still tank on the open ice: watches it without the net (seconds), never under the net', o.open >= 15 && o.net === 0, o);
  await p2.close(); }

// touch: the NET button is on screen, clear of the other buttons, and rigs the net
{ const c2 = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, hasTouch: true }), p = await c2.newPage();
  p.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 400)); errs++; });
  await p.goto(`${base}?w=frogner&nohint&peace&q=low&drs=0&mute&touch`); await p.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await p.waitForTimeout(800);
  await p.click('#bN'); await p.waitForTimeout(600);
  const t = await p.evaluate(`(()=>{ const B=[...document.querySelectorAll('#acts .btn')].map((b)=>b.getBoundingClientRect()), n=document.getElementById('bN').getBoundingClientRect(), j=document.getElementById('joyhint').getBoundingClientRect();
    const hit=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1; let over=0; for (let i=0;i<B.length;i++) for (let k=i+1;k<B.length;k++) if (hit(B[i],B[k])) over++;
    return {on:__game.netOn, left:Math.round(n.left), w:innerWidth, overlaps:over, joy:hit(n,j), minLeft:Math.round(Math.min(...B.map((b)=>b.left)))}; })()`);
  await p.screenshot({ path: `${out}/touch-phone.png` });
  check('phone 852x393: NET button rigs the net; the button row has no overlaps and stays right of the joystick area', t.on && t.overlaps === 0 && !t.joy && t.minLeft > t.w * 0.45, t);
  await c2.close(); }
await browser.close();
console.log(`\n${fails ? fails + ' FAILED' : 'all passed'} · ${errs} page errors`);
process.exit(fails || errs ? 1 : 0);
