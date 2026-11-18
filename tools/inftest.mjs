// Phase 6B behaviour test of the infantry logic (headed GPU Chrome, logic through __sim): an RPG team in a house engages the tank
// at short range, an HE round into the house neutralises it, the coax kills a standing soldier and finds a prone one harder,
// the tracks kill, a BMP dismounts a squad that advances and fires, an ATGM team on a height fires a guided missile, soldiers
// reach the minimap only once spotted, G.inf.d stays consistent, and the logic cost with 40 soldiers is small.
// usage: node tools/inftest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase6b';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1200,800']) });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errs = 0, fails = 0;
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace&mute&q=medium&drs=0&tod=1`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);
const shot = async (name) => { await ev('__step(1/60,3)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/${name}.png` }); };

// helpers in the page: the lake set-up of lighttest, a consistency check of G.inf.d, toasts
await ev(`(()=>{ window.G=__game; window.I=G.inf; __ui.poll=()=>{}; G.timer=1e9;
  window.TO=[]; const t0=__ui.toast; __ui.toast=(m)=>{ TO.push(m); t0(m); };
  window.BAD=[]; window.chk=(tag)=>{ const d=I.d; for (let i=0;i<40;i++){ const o=i*8, st=d[o+7]; if (i>=I.n && st) BAD.push(tag+': used slot past n '+i);
    if (!st) continue; for (let k=0;k<7;k++) if (!Number.isFinite(d[o+k])) BAD.push(tag+': NaN #'+i+'.'+k);
    if (st===2 && d[o+4]!==6) BAD.push(tag+': dead #'+i+' pose '+d[o+4]); if (st===1 && (d[o+4]===6 || d[o+4]<0 || d[o+4]>7 || d[o+4]%1)) BAD.push(tag+': alive #'+i+' pose '+d[o+4]); if (st!==1 && st!==2) BAD.push(tag+': state '+st); } };
  window.lake=(flip)=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L; const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l;
    __tp(L.x-L.ax*110, L.z-L.az*110, Math.atan2(L.ax, L.az)+(flip?Math.PI:0)); __aimAt(); __sim(1/60, 20); };
  window.alive=(q)=>{ let n=0; for (let i=0;i<I.n;i++) if (I.sq[i]===q && I.d[i*8+7]===1) n++; return n; };
  })()`);

// ---- 1: an RPG team in a house at ~150 m engages the tank; the rocket hits for 20–35 ----
let r = await ev(`(()=>{ const B=__bld, Wd=__W; let found=null;
  const cand=[]; for (let b=0;b<B.n;b++) if (B.st[b]===0 && B.size[b]>=7 && B.size[b]<=11.5 && Math.abs(B.x[b])<Wd.PLAY-250 && Math.abs(B.z[b])<Wd.PLAY-250) cand.push(b);
  for (let c=0;c<cand.length && !found;c+=7) { const b=cand[c];
    for (let k=0;k<12 && !found;k++) { const a=k*0.5236, x=B.x[b]+Math.sin(a)*150, z=B.z[b]-Math.cos(a)*150, y=Wd.heightAt(x,z);
      if (Math.abs(x)>Wd.PLAY-80||Math.abs(z)>Wd.PLAY-80||B.at(x,y+1.5,z,4)>=0||Math.abs(Wd.heightAt(x+4,z)-Wd.heightAt(x-4,z))+Math.abs(Wd.heightAt(x,z+4)-Wd.heightAt(x,z-4))>2.5) continue;
      __tp(x, z, Math.atan2(-(B.x[b]-x), -(B.z[b]-z))); __sim(1/60,2); const q=G.infSquad('rpg',0,0,1,b); if (q<0) continue;
      const i=I.sq.indexOf(q); const v=G.vis(I.ex[i],I.ey[i],I.ez[i],__veh.x,__veh.y+1.9,__veh.z);
      if (v>0.5) found={found:true,b,x,z,i,v:+v.toFixed(2),q}; else I.reset(); } }
  if (!found) return {found:false}; window.H=found; return found; })()`);
if (!r.found) { check('found a house with a view for the RPG test', false, r); }
else {
  r = await ev(`(()=>{ G.peace=false; G.timer=1e9; const hits=[]; let fired=-1, dfire=0, hp=__veh.hp; window.RO=-1;
    for (let k=0;k<60*40;k++){ const n0=I.rockets; __sim(1/60,1); if (I.rockets>n0 && fired<0) { fired=k; dfire=Math.hypot(I.d[H.i*8]-__veh.x, I.d[H.i*8+2]-__veh.z); }
      if (__veh.hp<hp-5) hits.push(+(hp-__veh.hp).toFixed(1)); hp=__veh.hp; if (__veh.hp<60) __veh.hp=100, hp=100; if (hits.length>=2) break; }
    chk('rpg'); return {house:H.b, size:+__bld.size[H.b].toFixed(1), fired:+(fired/60).toFixed(1), dist:Math.round(dfire), rockets:I.rockets, hits, pose:I.d[H.i*8+4], spotted:I.spot[H.i]>0, toasts:TO.filter((m)=>/RPG/.test(m))}; })()`);
  check('an RPG team in a house engages at short range and the rocket hits for 20–35', r.fired >= 0 && r.dist < 250 && r.hits.length >= 1 && r.hits.every((v) => v >= 19.5 && v <= 35.5), r);
  // a picture of a rocket in flight (the soldier himself is drawn by part A)
  await ev(`(()=>{ I.d[H.i*8+7]===1 && (I.rel[H.i]=0); let o=-1; for (let k=0;k<60*12 && o<0;k++){ __sim(1/60,1); for (let s=0;s<96;s++) if (G.S[s*10+6]===12&&G.S[s*10+8]>0&&G.S[s*10+8]<3.7) o=s*10; }
    if (o>=0) { const x=G.S[o], z=G.S[o+2], y=G.S[o+1]-__W.heightAt(x,z); const ux=x-__veh.x, uz=z-__veh.z, l=Math.hypot(ux,uz)||1; __look(__veh.x-ux/l*9+uz/l*5, 3.5, __veh.z-uz/l*9-ux/l*5, x, y, z); } })()`); // camera from behind the tank, looking at the rocket
  await shot('rpg-rocket'); await ev('__R.pose=null; __veh.hp=100');

  // ---- 1b (review fix): the house wall stops MG rounds aimed at a soldier standing just inside it ----
  r = await ev(`(()=>{ I.reset(); G.peace=true; for (let o=0;o<960;o+=10) G.S[o+8]=0; const q=G.infSquad('rpg',0,0,2,H.b); const ids=[]; for (let i=0;i<I.n;i++) if (I.sq[i]===q) ids.push(i);
    const i=ids[0], o=i*8; __aimAt(I.d[o], I.d[o+1]+0.9, I.d[o+2]); __cam.mode=1; __sim(1/60, 150); const mg0=G.mg; __inp.mg=true; __sim(1/60, 60*3); __inp.mg=false; __sim(1/60, 30); __aimAt(); __cam.mode=0;
    return {rounds:mg0-G.mg, alive:ids.filter((k)=>I.d[k*8+7]===1).length, n:ids.length, inHouse:I.hb[i]===H.b}; })()`);
  check('the house wall stops MG rounds aimed at a soldier just inside it', r.rounds > 20 && r.alive === r.n && r.inHouse, r);

  // ---- 2: an HE round into the house neutralises the team (a fresh team of three) ----
  r = await ev(`(()=>{ I.reset(); G.peace=true; for (let o=0;o<960;o+=10) G.S[o+8]=0; const q=G.infSquad('rpg',0,0,3,H.b); window.Q2=q; const ids=[]; for (let i=0;i<I.n;i++) if (I.sq[i]===q) ids.push(i); window.IDS=ids;
    const ex=ids.reduce((s,i)=>s+I.ex[i],0)/ids.length, ez=ids.reduce((s,i)=>s+I.ez[i],0)/ids.length, cx=__bld.x[H.b], cz=__bld.z[H.b]; // aim at the wall they stand behind
    __aimAt(ex+(cx-ex)*0.12, I.ey[ids[0]]-0.2, ez+(cz-ez)*0.12); __cam.mode=1; G.ammo(2); __sim(1/60, 60*7); const n0=G.n[2]; __inp.fire=true; for (let k=0;k<30 && G.n[2]===n0;k++) __sim(1/60,1); __inp.fire=false; __sim(1/60, 60*2);
    const st=__bld.st[H.b], dead=ids.filter((i)=>I.d[i*8+7]===2).length, inHouse=ids.filter((i)=>I.d[i*8+7]===1 && I.hb[i]===H.b).length;
    G.peace=false; const r0=I.rockets; __sim(1/60, 60*15); G.peace=true; __aimAt(); __cam.mode=0; chk('he');
    return {fired:G.n[2]<n0, bldState:st, n:ids.length, dead, inHouse, rocketsAfter:I.rockets-r0, toasts:TO.filter((m)=>/team/.test(m))}; })()`);
  check('an HE round into the house kills or scatters the team (none left inside, no rocket after)', r.fired && r.inHouse === 0 && r.rocketsAfter === 0 && r.dead >= 1, r);
}

// ---- 3: the coax MG kills a standing soldier at 150 m; a prone one is harder to hit ----
// the same three lays for both (on the body centre, 0.35 m high, 0.35 m low): the prone figure's low profile turns the off ones into misses
await ev('I.reset(); G.peace=true; lake(false); __veh.hp=100');
r = await ev(`(()=>{ const res={stand:[], prone:[]};
  for (const kind of ['stand','prone']) for (let t=0;t<3;t++) { I.reset(); const i=G.infSpawn('rifle', __veh.x+FX*150-FZ*(t-1)*6, __veh.z+FZ*150+FX*(t-1)*6); __sim(1/60,2); const o=i*8, dy=[0,0.35,-0.35][t];
    const set=()=>{ if (kind==='prone') { I.sup[i]=6; } else I.sup[i]=0; }; // prone: pinned flat for the whole test; standing: never pinned
    set(); __aimAt(I.d[o], I.d[o+1]+(kind==='prone'?0.22:0.95)+dy, I.d[o+2]); __cam.mode=1; for (let f=0;f<240;f++) { set(); __sim(1/60,1); } set(); const m0=G.mg; __inp.mg=true; let k=0;
    for (; k<60*3 && I.d[o+7]===1; k++) { set(); __sim(1/60,1); } __inp.mg=false; __sim(1/60, 60);
    res[kind].push({dead:I.d[o+7]===2, rounds:m0-G.mg, by:I.lastBy, pose:I.d[o+4]}); __aimAt(); G.mg=2000; }
  __cam.mode=0; chk('mg'); return res; })()`);
{ const s = r.stand, p = r.prone, rs = s.reduce((a, v) => a + (v.dead ? v.rounds : 99), 0), rp = p.reduce((a, v) => a + (v.dead ? v.rounds : 99), 0);
  check('the coax kills a standing soldier at 150 m in a short burst', s.every((v) => v.dead && v.by === 'mg' && v.rounds <= 30), s);
  check('a prone soldier is harder to hit (more rounds or survives)', rp > rs, { prone: p, roundsStand: rs, roundsProne: rp }); }

// ---- 4: running over a soldier kills him ----
r = await ev(`(()=>{ I.reset(); lake(true); const i=G.infSpawn('rifle', __veh.x-FX*14, __veh.z-FZ*14); const fx=-Math.sin(__veh.yaw), fz=-Math.cos(__veh.yaw); const o=i*8; I.d[o]=__veh.x+fx*14; I.d[o+2]=__veh.z+fz*14;
  __R.force=[1,0]; let k=0; for (; k<60*8 && I.d[o+7]===1; k++) __sim(1/60,1); __R.force=null; __sim(1/60,30); chk('track'); return {dead:I.d[o+7]===2, by:I.lastBy, secs:+(k/60).toFixed(1), pose:I.d[o+4], v:+__veh.v.toFixed(1)}; })()`);
check('running over a soldier kills him (state 2, pose 6)', r.dead && r.by === 'tracks' && r.pose === 6, r);

// ---- 5: a BMP stopping in contact dismounts a squad that advances by bounds and fires ----
r = await ev(`(()=>{ I.reset(); lake(false); __R.god=true; G.peace=false; G.timer=1e9; for (const e of G.enemies) e.on=false; G.spawn(1, 0); const e=G.enemies.find((q)=>q.on&&q.type===1);
  e.x=__veh.x+FX*330; e.z=__veh.z+FZ*330; e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(-(__veh.x-e.x),-(__veh.z-e.z)); e.path=-1; e.immob=true; e.see=4; e.known=20; e.rl=99; window.E5=e;
  let k=0; for (; k<60*20 && !e.dsm; k++) __sim(1/60,1); const q=I.sq.findIndex((s,i)=>s>=0 && I.d[i*8+7]===1); if (q<0) return {dsm:!!e.dsm, secs:k/60};
  const ids=[]; for (let i=0;i<I.n;i++) if (I.d[i*8+7]===1) ids.push(i); const dm=()=>ids.reduce((s,i)=>s+Math.hypot(I.d[i*8]-__veh.x, I.d[i*8+2]-__veh.z),0)/ids.length;
  const d0=dm(), b0=I.bursts, poses={}; const hp0=__veh.hp; let rifle=0; const S=G.S;
  for (let t=0;t<60*45;t++) { __sim(1/60,1); if (t%30===0) for (const i of ids) poses[I.d[i*8+4]]=(poses[I.d[i*8+4]]||0)+1; if (t%6===0) for (let o=0;o<960;o+=10) if (S[o+6]===9&&S[o+8]>1.5) rifle++; }
  const d1=dm(); __R.god=false; G.peace=true; chk('dis'); const inB=ids.filter((i)=>I.hb[i]<0 && __bld.at(I.d[i*8], I.d[i*8+1]+1, I.d[i*8+2], 0)>=0).length;
  return {dsm:!!e.dsm, secs:+(k/60).toFixed(1), n:ids.length, d0:Math.round(d0), d1:Math.round(d1), bursts:I.bursts-b0, rifleRounds:rifle, poses, inB, toasts:TO.filter((m)=>/dismount/.test(m))}; })()`);
check('a BMP stopping in contact dismounts 4–6 men who advance by bounds and fire', r.dsm && r.n >= 4 && r.n <= 6 && r.d0 - r.d1 > 25 && r.bursts >= 3 && r.inB === 0 && (r.poses[2] || 0) > 0 && ((r.poses[3] || 0) + (r.poses[4] || 0)) > 0, r);
await ev('for (const e of G.enemies) e.on=false; for (let o=0;o<960;o+=10) G.S[o+8]=0');

// ---- 6: an ATGM team on a height fires a guided missile ----
r = await ev(`(()=>{ I.reset(); lake(false); __veh.hp=100; G.peace=false; G.timer=1e9; const ax=Math.atan2(FX, -FZ); const q=G.infSquad('auto-atgm', ax); if (q<0) return {q};
  const g=I.sq.indexOf(q); const dist=Math.hypot(I.d[g*8]-__veh.x, I.d[g*8+2]-__veh.z); let guided=false, k=0; const hp0=__veh.hp;
  for (; k<60*70; k++) { __sim(1/60,1); for (let o=0;o<960;o+=10) if (G.S[o+6]===8&&G.S[o+8]>0&&G.S[o+9]<0) guided=true; if (I.atgms && k%60===0 && !G.S.some((v,j)=>j%10===6&&v===8&&G.S[j+2]>0)) break; }
  G.peace=true; chk('atgm'); return {q, dist:Math.round(dist), height:Math.round(I.d[g*8+1]-__veh.y), atgms:I.atgms, guided, secs:+(k/60).toFixed(1), dmg:+(hp0-__veh.hp).toFixed(1), toasts:TO.filter((m)=>/ATGM/.test(m)).slice(-3)}; })()`);
check('an ATGM team on a height fires a missile guided from the gunner', r.q >= 0 && r.atgms >= 1 && r.guided, r);
await ev('__veh.hp=100; for (let o=0;o<960;o+=10) G.S[o+8]=0');

// ---- 7: soldiers reach the minimap only once spotted ----
r = await ev(`(()=>{ I.reset(); lake(false); G.peace=true; const i=G.infSpawn('rifle', __veh.x+FX*300, __veh.z+FZ*300); __aimAt(__veh.x-FX*300, __veh.y+2, __veh.z-FZ*300); __sim(1/60, 60*3); __step(1/60, 20);
  const before={seen:I.seen[i], drawn:I.drawn}; __aimAt(I.d[i*8], I.d[i*8+1]+0.9, I.d[i*8+2]); __sim(1/60, 60*2); __step(1/60, 20); const after={seen:I.seen[i], spot:+I.spot[i].toFixed(1), drawn:I.drawn}; __aimAt(); chk('map'); return {before, after}; })()`);
check('a soldier appears on the minimap only after being spotted', r.before.seen === 0 && r.before.drawn === 0 && r.after.seen === 1 && r.after.drawn >= 1, r);

// ---- perf: the logic cost of 40 soldiers per tick ----
r = await ev(`(()=>{ I.reset(); lake(false); __R.god=true; G.peace=false; G.timer=1e9; for (const e of G.enemies) e.on=false;
  const t0=performance.now(); __sim(1/60, 600); const base=(performance.now()-t0)/600;
  for (let s=0;s<8;s++) for (let k=0;k<5;k++) { const a=s*0.785, r=150+s*45+k*4; G.infSpawn(k===0?'rpg':'rifle', __veh.x+Math.sin(a)*r, __veh.z-Math.cos(a)*r); }
  let n=0; for (let i=0;i<40;i++) if (I.d[i*8+7]===1) n++; for (let i=0;i<I.n;i++) I.rel[i]=0;
  const t1=performance.now(); __sim(1/60, 600); const withI=(performance.now()-t1)/600; __R.god=false; G.peace=true; chk('perf');
  return {soldiers:n, base:+base.toFixed(3), withInf:+withI.toFixed(3), perTick:+(withI-base).toFixed(3), bursts:I.bursts, rockets:I.rockets}; })()`);
check('40 soldiers cost little logic time per tick (< 0.5 ms)', r.soldiers >= 38 && r.perTick < 0.5, r);
await ev(`{ const i=[...Array(40).keys()].find((j)=>I.d[j*8+7]===1); if (i!==undefined) __look(I.d[i*8]+6, 2.5, I.d[i*8+2]+6, I.d[i*8], 1, I.d[i*8+2]); }`); await shot('perf-field'); await ev('__R.pose=null');

r = await ev('BAD.slice(0,10)');
check('G.inf.d is consistent throughout (no NaN; dead = state 2 with pose 6)', r.length === 0, r);
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
