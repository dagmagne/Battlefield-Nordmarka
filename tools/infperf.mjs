// GPU time with 40 soldiers in view (8–35 m, walking/running/aiming, shadows) against none, alternating A/B in real-time frames.
// usage: node tools/infperf.mjs [rounds=4] [seconds=4]   (GPORT/GPATH as for the other GPU tools; DRS is off)
import { chromium } from 'playwright-core';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const rounds = +(process.argv[2] || 4), secs = +(process.argv[3] || 4);
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1728,1117']) });
const page = await (await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.goto(`${base}?nohint&nohud&peace&tod=1&drs=0`);
await page.waitForFunction('window.__ready===true', null, { timeout: 90000 }); await logAdapter(page);
await page.evaluate(() => { const v = __veh, FX = -Math.sin(v.yaw), FZ = -Math.cos(v.yaw); window.X = v.x + FX * 22; window.Z = v.z + FZ * 22;
  __look(v.x - FX * 2, 2, v.z - FZ * 2, X, 0.8, Z); });
const sample = (on) => page.evaluate(async ({ on, secs }) => {
  if (on) __infDemo(X, Z, { poses: [1, 2, 5, 3, 4, 0, 7, 6], n: 40, cols: 8, sp: 2.4, yaw: __veh.yaw + Math.PI, move: 6 }); else __game.inf.n = 0;
  await new Promise((r) => setTimeout(r, 800)); const s = []; const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000) { await new Promise((r) => setTimeout(r, 70)); s.push(__R.gpuMs); }
  s.sort((a, b) => a - b); return { avg: s.reduce((a, b) => a + b, 0) / s.length, p50: s[s.length >> 1], ft: __R.ft, vis: __sol.nNear + __sol.nFar };
}, { on, secs });
const A = [], B = [];
for (let r = 0; r < rounds; r++) { A.push(await sample(false)); B.push(await sample(true)); }
const m = (L, k) => L.reduce((a, b) => a + b[k], 0) / L.length;
console.log('without soldiers: gpu avg %s ms (p50 %s), frame %s ms', m(A, 'avg').toFixed(2), m(A, 'p50').toFixed(2), m(A, 'ft').toFixed(2));
console.log('with %d soldiers: gpu avg %s ms (p50 %s), frame %s ms', B[0].vis, m(B, 'avg').toFixed(2), m(B, 'p50').toFixed(2), m(B, 'ft').toFixed(2));
console.log('rounds', JSON.stringify(A.map((a, i) => [+a.avg.toFixed(2), +B[i].avg.toFixed(2)])));
await browser.close();
