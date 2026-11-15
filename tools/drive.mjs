// Scripted drive capture: consecutive frames (shimmer check) + sparse frames; optional mp4.
// usage: node tools/drive.mjs outdir [--video]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const a = process.argv.slice(2), out = a[0], video = a.includes('--video');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1728,1117', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: video ? 1 : 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[error]', m.text().slice(0, 500)); });
await page.goto('http://localhost:8080/index.html?nohint&drs=0&tod=1');
await page.waitForFunction('window.__ready===true', null, { timeout: 90000 });
await page.evaluate(`(()=>{const s=__W.start; __tp(s.x,s.z,s.yaw); __R.auto={i:20}; __chase(0.35,0.17,14);})()`);
const step = (n, dt = 1 / 60) => page.evaluate(([n, dt]) => window.__step(dt, n), [n, dt]);
const shot = async (name) => { await page.waitForTimeout(60); await page.screenshot({ path: `${out}/${name}.png` }); };
if (video) {
  await step(60);
  for (let i = 0; i < 300; i++) { if (i === 150) await page.evaluate('__tod(2)'); await step(2); await shot('v' + String(i).padStart(4, '0')); }
  execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${out}/v%04d.png -vf scale=1728:1116 -c:v libx264 -pix_fmt yuv420p -crf 18 ${out}/drive.mp4 && rm ${out}/v*.png`);
} else {
  await step(240);
  for (let i = 0; i < 6; i++) { await step(1); await shot('consecutive-a' + i); }
  for (let i = 0; i < 8; i++) { await step(40); await shot('sparse-' + String(i).padStart(2, '0')); }
  await page.evaluate('__tod(2); __chase(-0.9,0.3,18)'); await step(120);
  for (let i = 0; i < 6; i++) { await step(1); await shot('consecutive-b' + i); }
}
await browser.close(); console.log('done');
