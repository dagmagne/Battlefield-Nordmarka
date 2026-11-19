// Quick static GPU-time A/B over tree-heavy views (median of R.gpuMs over ~3 s per view). usage: node tools/treegpu.mjs "<query>" (GPU tools options)
import { chromium } from 'playwright-core';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const q = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1728,1117', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']) });
const page = await (await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`${process.env.TFILE ? base.replace(/index\.html$/, process.env.TFILE) : base}?nohint&nohud&drs=0&tod=1&peace&${q}`); await page.bringToFront();
await page.waitForFunction('window.__ready===true', null, { timeout: 90000 }); await logAdapter(page);
const views = {
  forest: `const t=__W.trails[0];const i=Math.min(110,t.n-30);const x=t.pts[i*2],z=t.pts[i*2+1];__tp(x+300,z,0);__look(x+3,6,z+16,x-14,6,z-30)`,
  tower: `const T=__W.lm.tower;__tp(T.x+150,T.z+230,0);__look(T.x+170,25,T.z+260,T.x,40,T.z)`,
  start: `const s=__W.start;__tp(s.x,s.z,s.yaw);__look(s.x+10,3,s.z+10,s.x-40,8,s.z-60)`,
};
const res = {};
for (const [k, js] of Object.entries(views)) {
  await page.evaluate(`(()=>{${js}})()`); await page.waitForTimeout(1500);
  const s = []; for (let n = 0; n < 40; n++) { await page.waitForTimeout(75); s.push(await page.evaluate('__R.gpuMs')); }
  s.sort((a, b) => a - b); res[k] = +s[20].toFixed(2);
}
console.log(q || '(default)', JSON.stringify(res));
await browser.close();
