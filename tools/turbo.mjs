// Turbo-mode jump test: boost east over the lake kickers, log flight, capture frames / video.
// usage: node tools/turbo.mjs outdir [--video]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const a = process.argv.slice(2), out = a[0], video = a.includes('--video');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1728,1117', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: video ? 1 : 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[error]', m.text().slice(0, 500)); });
await page.goto('http://localhost:8080/index.html?nohint&drs=0&tod=2&turbo');
await page.waitForFunction('window.__ready===true', null, { timeout: 90000 });
const ks = await page.evaluate('JSON.stringify(__W.kickers)'); console.log('kickers', ks);
await page.evaluate(`(()=>{const k=__W.kickers[0]; __tp(k.x+Math.sin(k.yaw)*90,k.z+Math.cos(k.yaw)*90,k.yaw); __chase(0.5,0.15,14); __R.force=[1,0]; __inp.fast=true; const p=__ui.poll; __ui.poll=(f)=>{p(f); __inp.fast=true;};})()`);
const step = (n, dt = 1 / 60) => page.evaluate(([n, dt]) => window.__step(dt, n), [n, dt]);
const st = () => page.evaluate('[__veh.x.toFixed(1), __veh.y.toFixed(2), (__veh.v*3.6).toFixed(0), __veh.air, __veh.airT.toFixed(2), __veh.pitch.toFixed(2)].join(" ")');
const shot = async (name) => { await page.waitForTimeout(40); await page.screenshot({ path: `${out}/${name}.png` }); };
const N = video ? 360 : 300;
for (let i = 0; i < N; i++) {
  await step(video ? 2 : 2);
  if (i % 10 === 0) console.log(i, await st());
  if (video) await shot('v' + String(i).padStart(4, '0'));
  else if (i % 25 === 0) await shot('t' + String(i).padStart(3, '0'));
}
if (video) execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${out}/v%04d.png -vf scale=1728:1116 -c:v libx264 -pix_fmt yuv420p -crf 20 ${out}/turbo.mp4 && rm ${out}/v*.png`);
await browser.close(); console.log('done');
