// Game modes and missions (src/missions.js): behaviour test in a headed GPU Chrome, logic through __sim.
// Every mission is started and its placements are printed (type, tag, canopy, garrison); then each is played by script: zones are
// reached by teleport, tagged vehicles are destroyed through __game.kill, and the ways to lose (enemy control of a zone, the column
// getting through, the clock) are provoked by leaving the enemy alone. Also: peace mode, back to the defence waves, the start screen
// (mode -> mission -> briefing card) and renders of the HUD, the maps and the phone layout.
// usage: node tools/missiontest.mjs [outdir] [--noshots] [--only id] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const argv = process.argv.slice(2), out = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'shots/missions', noshots = argv.includes('--noshots');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1300,860']) });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errs = 0, fails = 0;
const hook = (p) => { p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } }); p.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; }); };
hook(page);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);
const want = (id) => !only || only === id;

await page.goto(`${base}?m=contact&nohint&q=medium&drs=0&mute`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
await ev(`(()=>{ window.G=__game; window.MS=__msn; window.M=MS.M; __ui.poll=()=>{}; __R.god=true;
  window.TO=[]; const t0=__ui.toast; __ui.toast=(m)=>{ TO.push(m); t0(m); };
  window.CARD=null; const c0=__ui.card; __ui.card=(o)=>{ CARD=o&&{title:o.title,text:o.text,go:o.go,alt:o.alt}; c0(o); };
  window.run=(s,dt)=>{ dt=dt||1/30; const n=Math.round(s/dt); for (let k=0;k<n;k+=30) __sim(dt, Math.min(30,n-k)); };
  window.start=(id)=>{ TO.length=0; CARD=null; __api.mission(id); run(0.6); };
  window.tag=(t)=>G.enemies.filter((e)=>e.on&&!e.dead&&e.tag===t);
  window.killTag=(t)=>{ for (const e of tag(t)) G.kill(e); run(0.6); };
  window.zone=()=>{ __tp(M.zx, M.zz, 0); run(0.6); };
  window.st=()=>({s:M.s, done:M.done, t:+M.t.toFixed(1), obj:document.getElementById('obj').textContent, wave:document.getElementById('wave').textContent});
  window.place=()=>({veh:[__veh.x|0,__veh.z|0], en:G.enemies.filter((e)=>e.on).map((e)=>[G.ETYPE[e.type].name, 'tag'+e.tag, e.gar?'gar':'', e.gl?'goal':'', e.x|0, e.z|0, 'can'+G.canAt(e.x,e.z), 'd'+(Math.hypot(e.x-__veh.x,e.z-__veh.z)|0)].filter(Boolean).join(' ')), inf:(()=>{ let n=0; for(let i=0;i<G.inf.n;i++) if(G.inf.d[i*8+7]===1) n++; return n; })(), mines:G.mines.armed()});
  })()`);

// ---- every mission starts, places its first stage sensibly and shows its objective ----
const ids = await ev('MS.list.map((m)=>m.id)');
check('six missions are defined', ids.length === 6, ids);
for (const id of ids) {
  const r = await ev(`(()=>{ start(${JSON.stringify(id)}); const p=place(); p.st=st(); p.msn=G.msn&&G.msn.id; p.state=G.state; p.inPlay=__W.inP(__veh.x,__veh.z,30); return p; })()`);
  console.log(`--- ${id}: tank at ${r.veh}  infantry ${r.inf}  mines ${r.mines}  pill "${r.st.obj}"  top "${r.st.wave}"`); for (const e of r.en) console.log('     ' + e);
  const wheeledInForest = r.en.filter((e) => /Tigr|BTR|buggy|motorcycle/.test(e) && +/can(\d+)/.exec(e)[1] > 110).length, close = r.en.filter((e) => +/ d(\d+)/.exec(e)[1] < 300).length;
  check(`${id}: starts (mission set, state 1, tank in the playable area, objective shown)`, r.msn === id && r.state === 1 && r.inPlay && r.st.obj.length > 8 && r.st.s === 0, r.st);
  check(`${id}: no wheeled vehicle placed in dense forest, nothing within 300 m of the tank`, wheeledInForest === 0 && close === 0, { wheeledInForest, close });
}

// ---- First contact: reach, destroy, destroy, won; best time stored; the next mission from the card ----
if (want('contact')) {
  let r = await ev(`(()=>{ start('contact'); const a=st(); run(5); const b=tag(1).length; zone(); const c=st(); const n=tag(1).length, d0=tag(1).map((e)=>Math.hypot(e.x-__veh.x,e.z-__veh.z)|0);
    run(40); const d1=tag(1).map((e)=>Math.hypot(e.x-__veh.x,e.z-__veh.z)|0); return {a,b,c,n,d0,d1}; })()`);
  check('contact: nothing is spawned before the zone is reached, then a patrol of 4', r.b === 0 && r.c.s === 1 && r.n === 4, r);
  check('contact: the patrol closes on the tank', r.d1.length > 0 && Math.min(...r.d1) < Math.min(...r.d0) - 100, { d0: r.d0, d1: r.d1 });
  r = await ev(`(()=>{ const hp0=(__veh.hp=40, G.n[0]=3, 40); killTag(1); const a=st(), n2=tag(2).length, hp=__veh.hp, ap=G.n[0]; killTag(2); const b=st(); return {a,n2,hp,ap,b,card:CARD,best:MS.best().contact,gstate:G.state}; })()`);
  check('contact: second group after a resupply, then the mission is won with a card and a stored time', r.a.s === 2 && r.n2 === 2 && r.hp === 65 && r.ap === 10 && r.b.done === 1 && /Mission complete/.test(r.card.title) && /Next mission/.test(r.card.go) && r.best > 0 && r.gstate === 0, r);
  r = await ev(`(()=>{ document.getElementById('ovGo').click(); run(0.6); return {id:MS.id(), s:st(), open:__ui.cardOpen()}; })()`);
  check('contact: the card button starts the next mission', r.id === 'convoy' && r.s.s === 0 && !r.open, r);
}

// ---- Column: left alone it drives the whole road and the mission is lost; with six destroyed, two through is a win ----
if (want('convoy')) {
  let r = await ev(`(()=>{ start('convoy'); const n=tag(1).length, tr=[]; let t=0; while (t<420 && !M.done) { run(15); t+=15; const L=tag(1); tr.push([t, L.length, M.esc, L.length?Math.min(...L.map((e)=>Math.hypot(e.x+840,e.z+515)))|0:0]); }
    return {n, tr, s:st(), card:CARD, stuck:G.stuck}; })()`);
  console.log('     column [t, alive, through, nearest to goal m]:', JSON.stringify(r.tr));
  check('convoy: 8 vehicles; unopposed they reach Voksenkollen and the mission fails', r.n === 8 && r.s.done === 2 && /Mission failed/.test(r.card.title), { n: r.n, s: r.s, stuck: r.stuck });
  r = await ev(`(()=>{ start('convoy'); run(20); const L=tag(1); for (let k=2;k<8;k++) G.kill(L[k]); let t=0; while (t<420 && !M.done) { run(15); t+=15; } return {s:st(), esc:M.esc, card:CARD&&CARD.title}; })()`);
  check('convoy: the rear six destroyed and the two leaders through is a win', r.s.done === 1 && r.esc === 2, r);
}

// ---- Tower: the garrison stands still until provoked; clear, reach, hold; unattended, the counter-attack takes the tower ----
if (want('tower')) {
  let r = await ev(`(()=>{ start('tower'); const p0=tag(1).map((e)=>[e.x,e.z]); run(60); const mv=tag(1).map((e,i)=>Math.hypot(e.x-p0[i][0],e.z-p0[i][1])|0), gar=tag(1).map((e)=>e.gar);
    const e=tag(1)[0]; __tp(e.x+90, e.z+60, 0); run(8); const woke=e.gar===0; return {n:p0.length, mv, gar, woke, inf:place().inf, mines:G.mines.armed()}; })()`);
  check('tower: garrison of 5 with infantry and mines stays put for a minute, and wakes when the tank is 110 m away', r.n === 5 && Math.max(...r.mv) < 6 && r.gar.every((g) => g === 1) && r.woke && r.inf >= 4 && r.mines >= 4, r);
  r = await ev(`(()=>{ killTag(1); const a=st(); zone(); const b=st(), n=tag(2).length, d0=tag(2).map((e)=>Math.hypot(e.x-e.glx,e.z-e.glz)|0); __tp(-145,-451,0); const tr=[]; let t=0;
    while (t<600 && !M.done) { run(20); t+=20; tr.push([t, +M.cap.toFixed(0), tag(2).length?Math.min(...tag(2).map((e)=>Math.hypot(e.x-e.glx,e.z-e.glz)))|0:0]); } return {a,b,n,d0,tr,s:st(),card:CARD&&CARD.text, stuck:G.stuck}; })()`);
  console.log('     counter-attack [t, control s, nearest to the tower m]:', JSON.stringify(r.tr));
  check('tower: clear -> drive up -> counter-attack of 5; with the tank gone the enemy takes the tower', r.a.s === 1 && r.b.s === 2 && r.n === 5 && r.s.done === 2 && /took the objective/.test(r.card), { a: r.a, n: r.n, s: r.s, stuck: r.stuck });
  r = await ev(`(()=>{ start('tower'); killTag(1); zone(); killTag(2); return {s:st(), card:CARD&&CARD.title}; })()`);
  check('tower: counter-attack destroyed is a win', r.s.done === 1, r);
}

// ---- Arena: three stages with resupply; left alone, the first attack takes it ----
if (want('arena')) {
  let r = await ev(`(()=>{ start('arena'); const n=tag(1).length; __tp(-145,-451,0); const tr=[]; let t=0; while (t<420 && !M.done) { run(20); t+=20; tr.push([t, +M.cap.toFixed(0), Math.min(...tag(1).map((e)=>Math.hypot(e.x-e.glx,e.z-e.glz)))|0]); } return {n,tr,s:st(), stuck:G.stuck}; })()`);
  console.log('     attack [t, control s, nearest to the arena m]:', JSON.stringify(r.tr));
  check('arena: 4 attackers; unopposed they take the arena', r.n === 4 && r.s.done === 2, { n: r.n, s: r.s, stuck: r.stuck });
  r = await ev(`(()=>{ start('arena'); killTag(1); const a=st(), n2=tag(2).length; killTag(2); const b=st(), n3=tag(3).length; run(50); const air=G.air.filter((a)=>a.on).length; killTag(3); return {a,n2,b,n3,air,s:st()}; })()`);
  check('arena: three attacks (4, 5, 6 vehicles, drones in the last), all beaten is a win', r.a.s === 1 && r.n2 === 5 && r.b.s === 2 && r.n3 === 6 && r.air >= 1 && r.s.done === 1, r);
}

// ---- Command post: each of the four sites places sensibly; a recon drone high over the start does not see it, one overhead does ----
if (want('cp')) {
  for (let i = 0; i < 4; i++) {
    const r = await ev(`(()=>{ MS.force=${i}; start('cp'); const p=place(), D=G.drone, c=tag(2)[0]; G.droneType(2); G.droneKey(); run(8); D.pitch=-0.5; D.yaw=Math.atan2(-(c.x-D.x),-(c.z-D.z)); run(3); const far=G.enemies.some((e)=>e.on&&e.seen), dist=Math.hypot(c.x-D.x,c.z-D.z)|0;
      D.x=c.x+60; D.z=c.z+60; D.y=__W.heightAt(D.x,D.z)+110; D.pitch=-1.1; D.yaw=Math.atan2(60,60); __veh.x=D.x; __veh.z=D.z+300; run(2); const s=st(); MS.force=-1; return {site:[M.px,M.pz], en:p.en, far, dist, near:s.s, cl:c.x|0}; })()`);
    console.log(`     site ${i} at ${r.site}:`); for (const e of r.en) console.log('       ' + e);
    const bad = r.en.filter((e) => /Tigr|BTR/.test(e) && +/can(\d+)/.exec(e)[1] > 110).length, close = r.en.filter((e) => +/ d(\d+)/.exec(e)[1] < 300).length;
    check(`cp site ${i}: 5 vehicles placed sensibly, not seen by a recon drone ${r.dist} m away, found from overhead`, r.en.length === 5 && !bad && !close && !r.far && r.near === 1, { far: r.far, stage: r.near });
  }
}

// ---- Command post: found when a command vehicle is seen; barrages are called on the tank; destroyed is a win ----
if (want('cp')) {
  const r = await ev(`(()=>{ start('cp'); const tod=__api.state().tod, arty=G.support.n, c0=G.arty.calls; run(70); const c1=G.arty.calls, a=st(); tag(2)[0].spotT=5; run(1); const b=st(); G.kill(tag(1)[0]); run(1); const c=st(); killTag(2); return {tod,arty,c0,c1,a,b,c,s:st(),n1:tag(1).length}; })()`);
  check('cp: blue hour, two fire missions, a barrage called on the tank, found on sight, won when the three vehicles are destroyed (guards may live)', r.tod === 2 && r.arty === 2 && r.c1 > r.c0 && r.a.s === 0 && r.b.s === 1 && r.c.done === 0 && r.s.done === 1 && r.n1 >= 1, r);
}

// ---- Night breakthrough: night, the clock fails it, the arena wins it ----
if (want('night')) {
  let r = await ev(`(()=>{ start('night'); const tod=__api.state().tod, n=G.enemies.filter((e)=>e.on).length; M.t=838; run(3); return {tod,n,s:st(),card:CARD&&CARD.text}; })()`);
  check('night: night, 7 vehicles in ambush, out of time fails', r.tod === 3 && r.n === 7 && r.s.done === 2 && /corridor closed/.test(r.card), r);
  r = await ev(`(()=>{ start('night'); run(305); const chasers=tag(9).length, air=G.air.filter((a)=>a.on).length; zone(); return {chasers, air, s:st()}; })()`);
  check('night: pursuers after five minutes, reaching the arena wins', r.chasers >= 1 && r.s.done === 1, r);
}

// ---- modes: peace mode switches the mission off, defence mode runs the waves, R restarts a mission ----
{
  const r = await ev(`(()=>{ start('tower'); zone(); __api.restart(); run(0.6); const a={s:st(), n:tag(1).length, en:G.enemies.filter((e)=>e.on).length};
    __api.peace(1); run(1); const b={msn:!!G.msn, en:G.enemies.filter((e)=>e.on).length, obj:getComputedStyle(document.getElementById('obj')).display, wave:st().wave};
    __api.peace(0); run(1); const c={msn:G.msn&&G.msn.id, n:tag(1).length};
    __api.mission(''); run(9); const d={msn:!!G.msn, wave:G.wave, en:G.enemies.filter((e)=>e.on).length, top:st().wave, obj:getComputedStyle(document.getElementById('obj')).display};
    try { localStorage.removeItem('gpeace'); localStorage.removeItem('gmsn'); } catch (e) {} return {a,b,c,d}; })()`);
  check('restart puts the mission back at its first stage', r.a.s.s === 0 && r.a.n === 5 && r.a.en === 5, r.a);
  check('peace mode: no mission, no enemies, no objective pill; off again: the mission restarts', !r.b.msn && r.b.en === 0 && r.b.obj === 'none' && /FREE ROAM/.test(r.b.wave) && r.c.msn === 'tower' && r.c.n === 5, { b: r.b, c: r.c });
  check('defence mode: the waves run as before', !r.d.msn && r.d.wave === 1 && r.d.en >= 3 && /^WAVE 1/.test(r.d.top) && r.d.obj === 'none', r.d);
}

// ---- renders: HUD and maps in a mission ----
if (!noshots) {
  await ev(`(()=>{ __R.god=false; start('tower'); for (const e of tag(1)) e.spotT=60; __game.bigMap(false); })()`);
  await ev('__step(1/60, 20)'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/hud-tower.png` });
  await ev('__game.bigMap(true)'); await ev('__step(1/60, 6)'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/bigmap-tower.png` });
  await ev(`(()=>{ __game.bigMap(false); start('contact'); __tp(M.zx+60, M.zz+110, Math.atan2(60, 110)); __aim(Math.atan2(60, 110), 0.02, 0); run(14); })()`);
  await ev('__step(1/60, 30)'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/smoke-go.png` });
  await ev(`(()=>{ start('arena'); killTag(1); run(4); __tp(M.zx-120, M.zz+90, Math.atan2(-120, 90)); __aim(Math.atan2(-120, 90), 0, 0); run(10); })()`);
  await ev('__step(1/60, 30)'); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/smoke-hold.png` });
}
await page.close();

// ---- the start screen: mode -> mission -> briefing card -> stage 1; and the phone layout ----
for (const [name, vw, vh, q] of [['desk', 1280, 800, ''], ['phone', 852, 393, '&touch']]) {
  const c2 = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: !!q }), p = await c2.newPage(); hook(p);
  await p.goto(`${base}?q=low&drs=0&mute${q}`);
  await p.waitForSelector('#pg0 button', { state: 'visible', timeout: 60000 }); await p.waitForTimeout(500);
  if (!noshots) await p.screenshot({ path: `${out}/pick-${name}.png` });
  await p.click('#pick button[data-go="pg1"]'); await p.waitForTimeout(300);
  const cards = await p.evaluate(`[...document.querySelectorAll('#pg1 button[data-m]')].map((b)=>{ const r=b.getBoundingClientRect(); return [b.dataset.m, r.top>=0 && r.bottom<=innerHeight+1]; })`);
  if (!noshots) await p.screenshot({ path: `${out}/pick-missions-${name}.png` });
  check(`${name}: the mission list shows six cards`, cards.length === 6, cards);
  await p.click('#pg1 button[data-m="tower"]');
  await p.waitForFunction('window.__ready===true', null, { timeout: 120000 });
  await p.evaluate(`(()=>{ const h=document.getElementById('help'); if (h.classList.contains('show')) document.getElementById('hGo').click(); })()`); await p.waitForTimeout(600);
  let r = await p.evaluate(`({open:__ui.cardOpen(), title:document.getElementById('ovT').textContent, go:document.getElementById('ovGo').textContent, en:__game.enemies.filter((e)=>e.on).length, msn:__game.msn&&__game.msn.id, peace:__game.peace})`);
  if (!noshots) await p.screenshot({ path: `${out}/brief-${name}.png` });
  check(`${name}: picking a mission loads it with a briefing card and nothing placed yet`, r.open && r.title === 'Retake the tower' && r.go === 'Roll out' && r.en === 0 && r.msn === 'tower' && !r.peace, r);
  await p.click('#ovGo'); await p.waitForTimeout(1200);
  r = await p.evaluate(`(()=>{ const o=document.getElementById('obj').getBoundingClientRect(), w=document.getElementById('wave').getBoundingClientRect(), m=document.getElementById('map').getBoundingClientRect();
    const hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom; return {open:__ui.cardOpen(), en:__game.enemies.filter((e)=>e.on).length, obj:document.getElementById('obj').textContent, onScreen:o.width>40&&o.left>=0&&o.right<=innerWidth&&o.top>=0, clear:!hit(o,w)&&!hit(o,m)}; })()`);
  if (!noshots) await p.screenshot({ path: `${out}/game-${name}.png` });
  check(`${name}: Roll out closes the card, places the garrison and shows the objective pill clear of the wave pill and the map`, !r.open && r.en === 5 && /Destroy the garrison/.test(r.obj) && r.onScreen && r.clear, r);
  await c2.close();
}
await browser.close();
console.log(`\n${fails ? fails + ' FAILED' : 'all passed'} · ${errs} page errors`);
process.exit(fails || errs ? 1 : 0);
