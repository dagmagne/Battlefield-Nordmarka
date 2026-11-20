// Static GPU-time A/B on vehicle-heavy views (median of R.gpuMs while stepping manually, so it also works when the screen is idle and rAF is throttled).
// usage: [TFILE=other.html] node tools/vehgpu.mjs "<query>" (GPU tools options)
import { chromium } from 'playwright-core';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const q = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1728,1117']) });
const page = await (await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`${process.env.TFILE ? base.replace(/index\.html$/, process.env.TFILE) : base}?w=frogner&nohint&nohud&drs=0&tod=1&peace&${q}`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const views = {
  leo: `const v=__veh;__look(v.x+9,2.6,v.z+7,v.x,1.4,v.z)`,
  train: `const B=__W.bld.find((b)=>b.fix&&b.boxes&&b.boxes.length===3&&b.boxes[0].hd>8).boxes[1];__look(B.x+14,3,B.z+22,B.x,2,B.z)`,
  enemies: `const L=__W.lakes.filter((l)=>Math.abs(l.x)<1400&&Math.abs(l.z)<1400).sort((a,b)=>b.area-a.area)[0];__ui.poll=()=>{};__tp(L.x-30,L.z,0);const G=__game;for(const e of G.enemies)e.on=false;let k=0;for(const t of [0,1,2,3,4,5,4,5]){G.spawn(t,3);const e=G.enemies.filter((q)=>q.on)[k];e.x=L.x+(k%4)*9-12;e.z=L.z+12+(k>>2)*10;e.y=__W.heightAt(e.x,e.z);e.yaw=0.6;e.path=-1;e.immob=true;e.v=0;k++;}__sim(1/60,10);__look(L.x+4,5,L.z-14,L.x,1,L.z+16)`,
};
const res = {};
for (const [k, js] of Object.entries(views)) {
  await page.evaluate(`(()=>{${js}})()`);
  const s = []; for (let n = 0; n < 16; n++) { await page.evaluate('__step(1/60,6)'); await page.waitForTimeout(60); if (n > 3) s.push(await page.evaluate('__R.gpuMs')); }
  s.sort((a, b) => a - b); res[k] = +s[s.length >> 1].toFixed(2);
}
console.log(process.env.TFILE || 'index.html', q || '(default)', JSON.stringify(res));
await browser.close();
