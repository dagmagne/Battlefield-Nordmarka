// Headed, GPU-accelerated Chrome screenshot helper.
// usage: node tools/shot.mjs out.png "pose=start&tod=1" [--w 1728 --h 1117 --dpr 2 --mobile --frames 30]
import { chromium } from 'playwright-core';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const flag = (k) => a.includes('--' + k);
const out = a[0], query = a[1] || '';
const w = +opt('w', 1728), h = +opt('h', 1117), dpr = +opt('dpr', 2), frames = +opt('frames', 20);
const mobile = flag('mobile');

const browser = await chromium.launch({
  channel: 'chrome', headless: false,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', `--window-size=${Math.min(w, 1728)},${Math.min(h + 90, 1117)}`, '--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
let errs = 0;
page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning' || flag('log')) { console.log(`[${t}]`, m.text().slice(0, 1500)); if (t === 'error') errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 1500)); errs++; });
await page.goto(`http://localhost:8080/index.html?${query}`);
try {
  await page.waitForFunction('window.__ready===true', null, { timeout: 60000 });
  await page.evaluate((n) => window.__waitFrames(n), frames);
  const info = await page.evaluate('window.__info?window.__info():""');
  if (info) console.log(info);
} catch (e) { console.log('[timeout]', e.message.split('\n')[0]); errs++; }
await page.screenshot({ path: out });
await browser.close();
console.log(errs ? `done with ${errs} error(s)` : 'ok', out);
