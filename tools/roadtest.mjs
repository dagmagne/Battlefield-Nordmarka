// Wheeled vehicles and roads (headed GPU Chrome, logic through __sim): runs the Motorised raid, BMP raid and ATGM ambush several times
// and samples every wheeled vehicle and BMP twice a second: on a road route, on a trail route, off route, and the canopy it stands in.
// Fails if a wheeled vehicle spawns in dense forest, spends much time in it or drives through forest much.  usage: node tools/roadtest.mjs [--runs N] [--port N --path P]
import { chromium } from 'playwright-core';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const ai = process.argv.indexOf('--runs'), RUNS = ai > 0 ? +process.argv[ai + 1] : 3;
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=900,600']) });
const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
let errs = 0, fails = 0;
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace&q=low&drs=0&tod=1`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const r = await page.evaluate(`(()=>{ __ui.poll=()=>{}; __R.god=true; const G=__game, W=__W, HN=Math.sqrt(W.nrm.length/4)|0, HALF=2048, WS=4096;
  const can=(x,z)=>W.nrm[(Math.min(HN-1,Math.max(0,((z+HALF)/WS*HN)|0))*HN+Math.min(HN-1,Math.max(0,((x+HALF)/WS*HN)|0)))*4+2];
  const st={}; const add=(t,k)=>{ const s=st[t]||(st[t]={road:0,trail:0,off:0,dense:0,n:0,spawnDense:0,spawned:0,spawnRoad:0,mv:0,fmv:0,fmo:0}); s[k]++; };
  let seed=0; for (let run=0; run<${RUNS}; run++) for (const sc of ['motor','raid','atgm']) {
    for (const e of G.enemies) e.on=false; __tp(W.start.x + (run-1)*120, W.start.z, run); __sim(1/60,5);
    G.peace=false; G.bag=[sc]; G.wave=3+run%3; G.state=0; G.timer=0.01; __sim(1/60,3); const seen=new Set();
    for (let k=0;k<120*2;k++){ __sim(1/60,30); for (const e of G.enemies){ if(!e.on||e.dead||(e.type<1||e.type===0)) continue; const T=e.type;
      if(!seen.has(e)){ seen.add(e); add(T,'spawned'); if(can(e.x,e.z)>90) add(T,'spawnDense'); if(e.net===1) add(T,'spawnRoad'); }
      add(T,'n'); add(T, e.path>=0 ? (e.net? 'road':'trail') : 'off'); if (can(e.x,e.z)>130) add(T,'dense'); if (Math.abs(e.v)>1){ add(T,'mv'); if (can(e.x,e.z)>70) { add(T,'fmv'); if (e.path<0) add(T,'fmo'); } } } }
    G.peace=true; G.state=0; G.timer=1e9; }
  return st; })()`);
const NM = { 1: 'BMP', 2: 'Tigr', 3: 'BTR', 4: 'buggy', 5: 'moto' };
for (const t in r) { const s = r[t], p = (k) => Math.round(100 * s[k] / s.n);
  console.log(`${NM[t].padEnd(6)} spawned ${s.spawned} (on road ${s.spawnRoad}, in dense forest ${s.spawnDense})  time: road ${p('road')} %, trail ${p('trail')} %, off route ${p('off')} %, in dense forest ${p('dense')} %, driving through forest ${Math.round(100 * s.fmv / Math.max(1, s.mv))} % of the moving time (off route ${Math.round(100 * s.fmo / Math.max(1, s.mv))} %)`); }
const wh = Object.keys(r).filter((t) => t >= 2), dense = wh.reduce((a, t) => a + r[t].dense, 0) / Math.max(1, wh.reduce((a, t) => a + r[t].n, 0)), sd = wh.reduce((a, t) => a + r[t].spawnDense, 0);
check('no wheeled vehicle spawns in dense forest', sd === 0, sd);
check('wheeled vehicles spend under 5 % of their time in dense forest', dense < 0.05, +(dense * 100).toFixed(1));
const fm = wh.reduce((a, t) => a + r[t].fmv, 0) / Math.max(1, wh.reduce((a, t) => a + r[t].mv, 0));
check('wheeled vehicles drive through forest (canopy > 70) under 12 % of their moving time', fm < 0.12, +(fm * 100).toFixed(1));
check('no page errors', errs === 0, errs);
await browser.close(); console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
