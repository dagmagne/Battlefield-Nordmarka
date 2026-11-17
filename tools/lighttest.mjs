// Phase 4 behaviour test (headed GPU Chrome, logic through __sim): the wheeled vehicles drive with rolling wheels, a Kornet from a
// Tigr hits the tank, smoke breaks its guidance, the coax MG kills a buggy and a motorcycle team but not a BTR, and the two new
// scenarios (Motorised raid, ATGM ambush) run.  usage: node tools/lighttest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/phase4';
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
const shot = async (name) => { await ev('__step(1/60,3)'); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/${name}.png` }); };

await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L;
  const yaw=Math.atan2(L.ax, L.az); __tp(L.x-L.ax*110, L.z-L.az*110, yaw); __ui.poll=()=>{}; window.G=__game; window.FW=yaw; { const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l; } // towards (and across) the lake
  window.TO=[]; const t0=__ui.toast; __ui.toast=(m)=>{ TO.push(m); t0(m); };
  window.place=(e,d,side)=>{ e.x=__veh.x+FX*d-FZ*(side||0); e.z=__veh.z+FZ*d+FX*(side||0); e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(-(__veh.x-e.x),-(__veh.z-e.z)); e.path=-1; };
  __sim(1/60, 30); })()`);

// 1: all four drive, wheels roll, nothing goes NaN
let r = await ev(`(()=>{ for (let t=2;t<=5;t++) G.spawn(t, 3); const V=G.enemies.filter((e)=>e.on&&e.type>=2); const w0=V.map((e)=>Array.from(e.d.subarray(48,64))); const p0=V.map((e)=>[e.x,e.z]);
  __sim(1/60, 60*12); const w1=V.map((e)=>Array.from(e.d.subarray(48,64)));
  return V.map((e,i)=>({ type:e.type, moved:Math.hypot(e.x-p0[i][0],e.z-p0[i][1])|0, stN:e.stN, v:+e.v.toFixed(1), tgt:+e.tgt.toFixed(1), path:e.path, wheelTurned:w0[i].some((v,k)=>Math.abs(v-w1[i][k])>1e-3), nan:[e.x,e.y,e.z,e.yaw].some((v)=>!Number.isFinite(v)) })); })()`);
check('Tigr, BTR, buggy and motorcycle drive with rolling wheels, no NaN', r.length === 4 && r.every((v) => v.moved > 20 && v.wheelTurned && !v.nan), r);
await ev('for (const e of G.enemies) e.on=false');

// 2: a Kornet from a Tigr 900 m away
await ev(`G.peace=false; G.timer=1e9; G.spawn(2, 3); window.T=G.enemies.find((e)=>e.on&&e.type===2); place(T, 280, 15); T.immob=true; T.see=4; T.known=20; T.rl=0.2; window.HP0=__veh.hp; window.N0=TO.length;
  window.FL=-1; for (let k=0;k<60*12;k++){ __sim(1/60,1); if (FL<0 && G.S.some((v,i)=>i%10===6&&v===8&&G.S[i+2]>0)) FL=k; if (FL>=0 && k===FL+50) break; }`);
await ev(`{ let o=-1; for (let i=0;i<96;i++) if (G.S[i*10+6]===8&&G.S[i*10+8]>0) o=i*10; window.MO=o; if (o>=0) __look(G.S[o]+FX*-8-FZ*5, G.S[o+1]-__W.heightAt(G.S[o],G.S[o+2])+1.5, G.S[o+2]+FZ*-8+FX*5, G.S[o], G.S[o+1]-__W.heightAt(G.S[o],G.S[o+2]), G.S[o+2]); }`);
await shot('kornet-flight'); await ev('__R.pose=null');
await ev('for (let k=0;k<60*8;k++) __sim(1/60,1)');
r = await ev('({fired:FL>=0, hp0:HP0, hp:+__veh.hp.toFixed(1), toasts:TO.slice(N0).filter((m)=>/ATGM/.test(m))})');
check('the Tigr launches a Kornet that steers onto the tank (38–62 damage)', r.fired && r.hp0 - r.hp >= 37 && r.hp0 - r.hp <= 63, r);
await ev('__veh.hp=100');

// 3: smoke breaks the guidance
await ev(`__aim(Math.atan2(-(T.x-__veh.x),-(T.z-__veh.z)),0,0); T.rl=5; __sim(1/60, 60*4); T.rl=0.1; T.see=4; window.HP0=__veh.hp; window.N0=TO.length; window.SM=false; for (let k=0;k<60*14;k++){ __sim(1/60,1); if (!SM && G.S.some((v,i)=>i%10===6&&v===8&&G.S[i+2]>0)) { for (let o=0;o<960;o+=10) if (G.S[o+6]===8&&G.S[o+8]>0) { G.S[o+3]*=0.25; G.S[o+4]*=0.25; G.S[o+5]*=0.25; G.S[o+8]=12; } G.smoke(); SM=true; } } // (the missile is slowed to 62 m/s: at 280 m a real one arrives before smoke can form; in play the Tigrs fire from 650-1000 m)`);
r = await ev('({smoked:SM, hp0:HP0, hp:+__veh.hp.toFixed(1), toasts:TO.slice(N0).filter((m)=>/ATGM|guidance/.test(m))})');
check('smoke toward the launcher makes the Kornet lose its guidance and miss', r.smoked && r.hp === r.hp0 && r.toasts.some((m) => /lost its guidance/.test(m)), r);
await ev('G.peace=true; for (const e of G.enemies) e.on=false; __sim(1/60, 60*25)');

// 4: the coax MG against the light vehicles
r = await ev(`(()=>{ const res={}; for (const t of [4,5,3]) { for (const e of G.enemies) e.on=false; G.spawn(t, 3); const e=G.enemies.find((q)=>q.on&&q.type===t); place(e, 160, 0); e.immob=true; __sim(1/60,10);
  __aimAt(e.x, e.y+0.9, e.z); __cam.mode=1; __sim(1/60, 120); __inp.mg=true; let k=0; for (; k<60*4 && !e.dead; k++) __sim(1/60,1); __inp.mg=false; __sim(1/60, 150); res[t]={dead:e.dead, secs:+(k/60).toFixed(1), hp:+e.hp.toFixed(1)}; __aimAt(); } __cam.mode=0; return res; })()`);
check('the coax MG kills a buggy and a motorcycle team in a short burst, but not a BTR', r[4].dead && r[5].dead && r[4].secs < 2.5 && r[5].secs < 2.5 && !r[3].dead, r);

// 5: the new scenarios run: Motorised raid and ATGM ambush
for (const sc of ['motor', 'atgm']) {
  r = await ev(`(()=>{ for (const e of G.enemies) e.on=false; G.peace=false; __R.god=true; G.bag=['${sc}']; G.wave=3; G.state=0; G.timer=0.01; __sim(1/60, 5);
    const plan=G.plan, d0=G.enemies.filter((e)=>e.on).map((e)=>Math.hypot(e.x-__veh.x,e.z-__veh.z)); __sim(1/60, 60*90);
    const on=G.enemies.filter((e)=>e.on); const types={}; on.forEach((e)=>{ types[e.type]=(types[e.type]||0)+1; });
    const dmin=Math.min(...on.map((e)=>Math.hypot(e.x-__veh.x,e.z-__veh.z))); const nan=on.some((e)=>![e.x,e.z].every(Number.isFinite)); const inB=on.filter((e)=>__bld.at(e.x,e.y+1.2,e.z,0)>=0).length;
    const atgm=TO.filter((m)=>/ATGM launch/.test(m)).length; G.peace=true; G.state=0; G.timer=1e9; return {plan, types, n:on.length, d0:Math.round(Math.min(...d0)), dmin:Math.round(dmin), nan, inB, atgm}; })()`);
  if (sc === 'motor') check('Motorised raid: buggies/bikes, a BTR and a Tigr, and the swarm closes in fast', r.plan === 'Motorised raid' && (r.types[4] || 0) + (r.types[5] || 0) >= 3 && r.types[3] && r.types[2] && r.dmin < 320 && !r.nan && !r.inB, r);
  else check('ATGM ambush: two Tigrs on overwatch fire Kornets', r.plan === 'ATGM ambush' && r.types[2] === 2 && r.atgm >= 1 && !r.nan && !r.inB, r);
}
await ev(`{ const e=G.enemies.find((q)=>q.on&&q.type>=4) || G.enemies.find((q)=>q.on); if (e) __look(e.x+6, 2.5, e.z+6, e.x, 1, e.z); }`); await shot('scenario-view');
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
