// Phase 5A behaviour test (headed GPU Chrome, logic through __sim): enemy artillery. An Orlan watching the tank for 15 s calls a
// barrage on the observed point; the ranging round lands 60–120 m off first, then 4–8 rounds within ~40 m; a tank that stays put
// is hurt, one that drives off after the ranging round much less; no barrage in peace mode or between waves; renders of a round
// falling, the impact and the crater.  usage: node tools/artytest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase5a';
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
  const yaw=Math.atan2(L.ax, L.az); __tp(L.x-L.ax*110, L.z-L.az*110, yaw); __ui.poll=()=>{}; window.G=__game; window.A=G.arty; { const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l; } // towards (and across) the lake
  window.TO=[]; const t0=__ui.toast; __ui.toast=(m)=>{ TO.push(m); t0(m); };
  window.home=[__veh.x, __veh.z, yaw]; window.goHome=()=>{ __R.force=null; __tp(home[0], home[1], home[2]); __veh.v=0; __veh.hp=100; __veh.dead=false; __veh.immob=0; G.burnP=0; };
  // a far, harmless enemy keeps the wave running (no line of sight, no shots)
  window.keep=()=>{ for (const e of G.enemies) e.on=false; G.spawn(0, 0); const e=G.enemies.find((q)=>q.on); e.x=__veh.x-FX*1500; e.z=__veh.z-FZ*1500; e.y=__W.heightAt(e.x,e.z); e.immob=true; e.path=-1; window.KE=e; };
  window.hush=()=>{ const e=window.KE; if (e) { e.see=0; e.rl=99; e.known=0; e.x=__veh.x-FX*1500; e.z=__veh.z-FZ*1500; } };
  __sim(1/60, 30); })()`);

// 1: an Orlan watching ~15 s calls a barrage on the point it saw, not on where the tank is later
let r = await ev(`(()=>{ __R.god=true; keep(); G.peace=false; G.state=1; G.wave=3; G.timer=1e9; A.reset(); G.orlan=0; const c0=A.calls; const a=G.airSpawn(2, Math.atan2(FX,-FZ)); a.x=__veh.x+FX*350; a.z=__veh.z+FZ*350;
  let at=null, k=0; for (; k<60*120; k++) { hush(); __sim(1/60,1); if (A.calls>c0) { at={x:__veh.x, z:__veh.z, orlan:G.orlan, t:+(k/60).toFixed(1)}; break; } }
  if (!at) return {called:false, orlan:G.orlan, orlanOn:a.on};
  __R.force=[1,0]; for (let i=0;i<60*6;i++){ hush(); __sim(1/60,1); } __R.force=null; for (const q of G.air) q.on=false;
  return {called:true, src:A.src, at, obs:[+A.x.toFixed(1), +A.z.toFixed(1)], moved:+Math.hypot(__veh.x-A.x, __veh.z-A.z).toFixed(1), due:+A.t.toFixed(1), rounds:A.n}; })()`);
check('an Orlan holding the tank in view for ~15 s calls a barrage on the observed point (it stays there when the tank moves)',
  r.called && r.src === 'orlan' && r.at.orlan >= 15 && r.at.orlan < 17 && Math.hypot(r.obs[0] - r.at.x, r.obs[1] - r.at.z) < 0.5 && r.moved > 20 && r.due >= 20 && r.due <= 40 && r.rounds >= 5 && r.rounds <= 9, r);

// 2: the ranging round lands 60–120 m off first, then 4–8 rounds within ~40 m of the observed point
r = await ev(`(()=>{ const i0=A.imp, N0=TO.length; let k=0; for (; k<60*60 && (A.n>0 || A.imp===i0); k++) { hush(); __sim(1/60,1); }
  const L=[]; for (let i=i0;i<A.imp;i++) { const o=i&31; L.push(+Math.hypot(A.ix[o]-A.x, A.iz[o]-A.z).toFixed(1)); }
  return {impacts:L, toast:TO.slice(N0).filter((m)=>/Artillery/.test(m))}; })()`);
check('the ranging round lands 60–120 m off first, then 4–8 rounds within ~40 m of the observed point',
  r.impacts.length >= 5 && r.impacts.length <= 9 && r.impacts[0] >= 59 && r.impacts[0] <= 121 && r.impacts.slice(1).every((d) => d <= 42) && r.toast.length === 1, r);

// 3: staying put costs armour; driving off after the ranging round costs much less (four barrages each)
r = await ev(`(()=>{ __R.god=false; G.peace=true; G.state=0; for (const e of G.enemies) e.on=false; const res={stay:[], move:[]};
  for (const mode of ['stay','move']) for (let n=0;n<4;n++) { goHome(); __sim(1/60,30); A.reset(); A.call(__veh.x, __veh.z); const i0=A.imp, hp0=__veh.hp; let gone=0;
    for (let k=0; k<60*60 && (A.n>0 || A.imp===i0); k++) { __sim(1/60,1); if (mode==='move' && A.imp>i0 && !__R.force) __R.force=[1,0]; }
    __R.force=null; res[mode].push(+(hp0-__veh.hp).toFixed(1)); if (mode==='move') res.away=(res.away||[]).concat(+Math.hypot(__veh.x-A.x,__veh.z-A.z).toFixed(0)); }
  goHome(); return res; })()`);
{ const s = r.stay.reduce((a, b) => a + b, 0), m = r.move.reduce((a, b) => a + b, 0);
  check('a tank that stays put takes damage; one that drives away after the ranging round takes much less', r.stay.filter((d) => d > 0).length >= 3 && s > 30 && m < s * 0.35, { ...r, sumStay: +s.toFixed(1), sumMove: +m.toFixed(1) }); }

// 4: no barrage in peace mode or between waves, and one when a wave is on (the same watch time)
r = await ev(`(()=>{ __R.god=true; A.reset(); const c0=A.calls; const res={}; for (const a of G.air) a.on=false; const O=G.airSpawn(2, 0); O.chk=1e9; // a live Orlan whose own visibility check is held off
  G.peace=true; keep(); G.state=1; for (let k=0;k<300;k++){ hush(); O.chk=1e9; G.orlan=20; __sim(1/60,1); } res.peace=A.calls-c0;
  G.peace=false; G.state=0; G.timer=1e9; for (let k=0;k<300;k++){ hush(); O.chk=1e9; G.orlan=20; __sim(1/60,1); } res.between=A.calls-c0;
  keep(); G.state=1; for (let k=0;k<300;k++){ hush(); O.chk=1e9; G.orlan=20; __sim(1/60,1); } res.wave=A.calls-c0; O.on=false;
  G.orlan=0; G.state=0; for (const e of G.enemies) e.on=false; for (let k=0;k<60;k++) __sim(1/60,1); res.cancelled=A.n===0;
  G.peace=true; A.reset(); return res; })()`);
check('no barrage in peace mode or between waves (one when a wave is on; the wave ending stops it)', r.peace === 0 && r.between === 0 && r.wave === 1 && r.cancelled, r);

// renders: a round falling (streak), the impact close up, the craters afterwards
await ev(`goHome(); __sim(1/60,30); A.reset(); A.call(__veh.x+FX*90, __veh.z+FZ*90);
  for (let k=0;k<60*60;k++) { __sim(1/60,1); let fl=-1; for (let i=0;i<10;i++) if (A.rs[i]===3 && !A.rk[i] && A.rt[i]<0.12) fl=i; if (fl>=0) { window.RI=fl; break; } }
  const x=A.rx[RI], z=A.rz[RI]; __look(x-FX*60-FZ*20, 3, z-FZ*60+FX*20, x, 20, z);`);
await ev('__step(1/60,1)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/incoming.png` });
await ev('{ const i0=A.imp; for (let k=0;k<60 && A.imp===i0;k++) __step(1/60,1); const o=(A.imp-1)&31, x=A.ix[o], z=A.iz[o]; __look(x-FX*45-FZ*15, 3, z-FZ*45+FX*15, x, 5, z); } __step(1/60,6)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/impact.png` });
await ev('__step(1/60,40)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/impact-1s.png` });
await ev('for (let k=0;k<60*12;k++) __sim(1/60,1); __look(A.x+FX*-14-FZ*16, 9, A.z+FZ*-14+FX*16, A.x, 0, A.z); __step(1/60,3)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/craters.png` });
await ev('__R.pose=null');
// review fix: shooting the watching Orlan down clears its watch, so no new barrage is called on the player afterwards
r = await ev(`(()=>{ goHome(); for (const a of G.air) a.on=false; A.reset(); G.peace=false; G.state=1; G.timer=1e9; G.orlan=20; const O=G.airSpawn(2, 0); O.x=__veh.x+150; O.z=__veh.z; O.y=__veh.y+150;
  O.hp=0; O.st=3; O.vx=O.vy=O.vz=0; const calls=A.calls; __sim(1/60, 60*3); A.cool=0; __sim(1/60, 60*2); const out={orlan:G.orlan, calls:A.calls-calls, rep:+G.rep.toFixed(1)}; for (const a of G.air) a.on=false; G.peace=true; G.state=0; return out; })()`);
check('a shot-down Orlan stops feeding the artillery (watch cleared, no new barrage)', r.orlan === 0 && r.calls === 0, r);
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
