// Phase 5 part B behaviour test (headed GPU Chrome, logic through __sim): the player's own artillery. A fire mission called from the
// sight lands round the aim point after 20-30 s, one called from a recon drone lands where its camera looks, the rounds kill a BMP and
// a buggy and hurt a T-72, there is one mission per wave (restocked on a cleared wave), danger close hurts the own tank, and the B key
// and the ARTY buttons work.  usage: node tools/supporttest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase5b';
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

await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L;
  const yaw=Math.atan2(L.ax, L.az); __tp(L.x-L.ax*110, L.z-L.az*110, yaw); __ui.poll=()=>{}; window.G=__game; window.SP=G.support;
  { const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l; } // towards (and across) the lake
  window.TO=[]; const t0=__ui.toast; __ui.toast=(m)=>{ TO.push(m); t0(m); };
  window.IMP=[]; const i0=SP.impact; SP.impact=(x,y,z,b)=>{ IMP.push([x,z,SP.t]); i0(x,y,z,b); };
  window.pt=(d,side)=>[__veh.x+FX*d-FZ*(side||0), __veh.z+FZ*d+FX*(side||0)];
  window.place=(e,x,z)=>{ e.x=x; e.z=z; e.y=__W.heightAt(x,z); e.yaw=Math.atan2(-(__veh.x-e.x),-(__veh.z-e.z)); e.path=-1; e.immob=true; };
  window.run=(s)=>{ for (let k=0;k<60*s;k++) __sim(1/60,1); };
  window.pill=()=>document.getElementById('sR').textContent;
  __R.god=true; __sim(1/60, 30); })()`);

// 1: from the sight, rounds land round the aim point after 20-30 s
let r = await ev(`(()=>{ const [x,z]=pt(230); __aimAt(x, __W.heightAt(x,z), z); __cam.mode=1; __sim(1/60, 20); const ax=__aimS.x, az=__aimS.z; IMP.length=0; TO.length=0;
  const ok=SP.key===undefined?false:(__api.arty(), SP.st===1); const p1=pill(); run(8); const p2=pill();
  window.AX=ax; window.AZ=az; return {ok, aimErr:+Math.hypot(ax-x,az-z).toFixed(1), toast:TO[0], p1, p2, t0:+SP.t0.toFixed(1)}; })()`);
const t0 = r.t0;
check('B from the sight starts a mission with a toast and an inbound pill', r.ok && /Fire mission: 6 rounds/.test(r.toast) && /^ARTY \d+ s$/.test(r.p1), r);
// render the incoming streaks and the impacts on the lake
await ev(`run(Math.max(0, SP.rounds[0]-SP.t-0.5)); __look(AX-FX*80+FZ*30, 10, AZ-FZ*80-FX*30, AX, 9, AZ)`);
await ev('__step(1/60, 20)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/incoming.png` });
await ev('__step(1/60, 26)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/impacts.png` });
await ev('__step(1/60, 90)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/impacts-late.png` });
await ev(`__R.pose=null; run(8)`);
r = await ev(`({n:IMP.length, maxD:+Math.max(...IMP.map((p)=>Math.hypot(p[0]-AX,p[1]-AZ))).toFixed(1), first:+Math.min(...IMP.map((p)=>p[2])).toFixed(1), last:+Math.max(...IMP.map((p)=>p[2])).toFixed(1), st:SP.st, pill:pill(), splash:TO.some((m)=>/Splash/.test(m))})`);
check('six 155 mm rounds land within 30 m of the aim point, 20-30 s after the call, over ~4 s', r.n === 6 && r.maxD <= 30 && r.first >= 19.5 && r.first <= 30.5 && r.last - r.first < 5.5 && r.st === 0 && r.pill === 'ARTY 0', { ...r, t0 });
await ev('__aimAt(); __cam.mode=0; SP.reset()');

// 2: from a recon drone: where its camera looks
r = await ev(`(()=>{ G.droneType(2); G.droneKey(); const D=G.drone; const [x,z]=pt(40, 20); D.x=x; D.z=z; D.y=__W.heightAt(x,z)+120; D.climb=0; D.vx=D.vy=D.vz=0; D.yaw=Math.atan2(-FX,-FZ); D.pitch=-0.75;
  __sim(1/60, 3); D.vx=D.vy=D.vz=0; __sim(1/60, 1);
  // the expected point, independently: march the camera's centre ray (gimbal camera at the airframe) to the ground
  const cp=Math.cos(D.pitch), dx=-Math.sin(D.yaw)*cp, dy=Math.sin(D.pitch), dz=-Math.cos(D.yaw)*cp, ox=__cam.x, oy=__cam.y, oz=__cam.z; let t=1; while (oy+dy*t>__W.heightAt(ox+dx*t,oz+dz*t) && t<4000) t+=0.25;
  const ex=ox+dx*t, ez=oz+dz*t; IMP.length=0; TO.length=0; __api.arty(); const tx=SP.tx, tz=SP.tz; window.EX=ex; window.EZ=ez;
  return {mode:__cam.mode, on:D.on, type:D.type, called:SP.st===1, dPoint:+Math.hypot(tx-ex,tz-ez).toFixed(1), range:Math.round(t), toast:TO[0]}; })()`);
check('B from a recon drone calls the mission on the point the camera looks at', r.mode === 4 && r.on && r.type === 2 && r.called && r.dPoint < 3, r);
await ev(`{ const D=G.drone; __look(EX-FX*120+FZ*40, 24, EZ-FZ*120-FX*40, EX, 3, EZ); }`);
await ev('run(SP.t0-SP.t+0.3); __step(1/60, 10)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/drone-call-impacts.png` });
await ev('__R.pose=null; run(6)');
r = await ev(`({n:IMP.length, maxD:+Math.max(...IMP.map((p)=>Math.hypot(p[0]-EX,p[1]-EZ))).toFixed(1)})`);
check('the drone-called rounds land within 30 m of that point', r.n === 6 && r.maxD <= 30, r);
await ev(`if (G.drone.on) G.droneKey(); __sim(1/60, 10); __cam.mode=0; SP.reset()`);

// 3: a stationary BMP, a buggy and a T-72 at the point
r = await ev(`(()=>{ for (const e of G.enemies) e.on=false; const [cx,cz]=pt(200); const out={};
  for (const [t,s] of [[1,0],[4,5],[0,-7]]) { G.spawn(t, 0); const e=G.enemies.filter((q)=>q.on&&q.type===t).pop(); const [x,z]=pt(200, s); place(e,x,z); out[t]=e; }
  window.TG=out; __sim(1/60, 5); IMP.length=0; SP.call(cx, cz); window.CX=cx; window.CZ=cz; run(SP.t0-0.6); return true; })()`);
await ev(`__look(CX-FX*60+FZ*25, 7, CZ-FZ*60-FX*25, CX, 3, CZ)`);
await ev('__step(1/60, 52)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/targets-impacts.png` });
await ev('__step(1/60, 240)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/targets-after.png` });
await ev('__R.pose=null; run(4)');
r = await ev(`({bmp:{dead:TG[1].dead, hp:+TG[1].hp.toFixed(0)}, buggy:{dead:TG[4].dead, hp:+TG[4].hp.toFixed(0)}, t72:{dead:TG[0].dead, hp:+TG[0].hp.toFixed(0)}, n:IMP.length,
  nearT72:+Math.min(...IMP.map((p)=>Math.hypot(p[0]-TG[0].x,p[1]-TG[0].z))).toFixed(1)})`);
check('the rounds destroy a stationary BMP and a buggy at the point and damage a T-72', r.bmp.dead && r.buggy.dead && (r.t72.dead || r.t72.hp < 100), r);
// a round straight onto a T-72's roof
r = await ev(`(()=>{ for (const e of G.enemies) e.on=false; let k=0, n=0; for (let i=0;i<5;i++) { G.spawn(0,0); const e=G.enemies.filter((q)=>q.on&&q.type===0).pop(); const [x,z]=pt(260, -20+i*10); place(e,x,z); e.hp=100;
  __sim(1/60,2); const dx=1.2*(Math.random()-0.5), dz=1.2*(Math.random()-0.5); SP.impact(e.x+dx, e.y+2.6, e.z+dz, -1); n++; if (e.dead) k++; } return {killed:k, of:n}; })()`);
check('a near-direct 155 mm hit knocks out a T-72 (usually)', r.killed >= 4, r);
await ev('for (const e of G.enemies) e.on=false; SP.reset()');

// 4: one mission per wave; restocked when the wave is cleared
r = await ev(`(()=>{ G.peace=false; G.spawn(1,0); const e=G.enemies.filter((q)=>q.on).pop(); const [x,z]=pt(1300, 0); place(e,x,z); G.wave=1; G.state=1; G.timer=1e9; __sim(1/60,2); TO.length=0;
  const [ax,az]=pt(300, 30); const a=SP.call(ax,az), b=SP.call(ax,az); run(36); const c=SP.call(ax,az); const p0=pill(); const n0=SP.n;
  e.on=false; __sim(1/60, 3); const st=G.state, n1=SP.n, p1=pill(); G.peace=true; G.state=0; G.timer=1e9;
  return {first:a, second:b, third:c, n0, p0, waveState:st, n1, p1, refusals:TO.filter((m)=>/already on the way|No fire mission left/.test(m))}; })()`);
check('one mission per wave: a second call is refused, restocked after the wave is cleared', r.first && !r.second && !r.third && r.n0 === 0 && r.p0 === 'ARTY 0' && r.waveState === 0 && r.n1 === 1 && r.p1 === 'ARTY 1' && r.refusals.length === 2, r);
await ev('SP.reset()');

// 5: danger close
r = await ev(`(()=>{ __R.god=false; __veh.hp=100; TO.length=0; const [x,z]=pt(12, 0); SP.call(x,z); const warn=TO[0]; run(SP.t0+5); const hp=__veh.hp; __veh.hp=100; __R.god=true; __veh.dead=false; G.burnP=0; return {warn, hp:+hp.toFixed(1)}; })()`);
check('danger close: a toast warns, and rounds next to the tank hurt it', /DANGER CLOSE/.test(r.warn) && r.hp < 95, r);
await ev('SP.reset(); __ui.over(null)');

// 6: the B key and the ARTY buttons (tank row and drone row)
r = await ev(`(()=>{ const [x,z]=pt(300); __aimAt(x, __W.heightAt(x,z), z); __cam.mode=0; __sim(1/60, 20); return true; })()`);
await page.keyboard.press('KeyB');
r = await ev(`(()=>{ const k=SP.st===1 && Math.hypot(SP.tx-__aimS.x, SP.tz-__aimS.z)<2; SP.reset(); document.getElementById('bA').click(); const b=SP.st===1; SP.reset(); __aimAt();
  G.droneType(2); G.droneKey(); __sim(1/60, 30); document.getElementById('bA2').click(); const d=SP.st===1; const vis=getComputedStyle(document.getElementById('sR')).display!=='none'; if (G.drone.on) G.droneKey(); __sim(1/60, 5); SP.reset(); return {key:k, tankBtn:b, droneBtn:d, pillShown:vis, calls:SP.calls}; })()`);
check('the B key, the tank-row ARTY button and the drone-row ARTY button call a mission', r.key && r.tankBtn && r.droneBtn && r.pillShown, r);
await ev('__cam.mode=0; __step(1/60, 4)'); await page.screenshot({ path: `${out}/hud.png` });
// review fix: a sight on the sky has no ground point; the mission is not spent
r = await ev(`(()=>{ for (const e of G.enemies) e.on=false; SP.n=1; SP.st=0; const calls=SP.calls, n0=TO.length; __cam.mode=0; __aim(__aimS.yaw, 1.2, 0); __sim(1/60, 30); G.artyKey ? G.artyKey() : __api.arty(); __sim(1/60, 5);
  return { hit:__aimS.hit, called:SP.calls-calls, n:SP.n, toast:TO.slice(n0).join(' | ') }; })()`);
check('a sight laid on the sky is refused and the mission is kept', r.hit === false && r.called === 0 && r.n === 1 && /No target/.test(r.toast), r);
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
