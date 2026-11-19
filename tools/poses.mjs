// Renders the fixed verification scenes. usage: node tools/poses.mjs outdir [--only 1,3] [--dpr 2] [--mobile]
import { chromium } from 'playwright-core';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
import { SCENES, MOBILE } from './scenes.mjs';
import { mkdirSync } from 'node:fs';
const a = process.argv.slice(2), out = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const only = opt('only', ''), dpr = +opt('dpr', 2), mobile = a.includes('--mobile'), q = opt('q', '');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1728,1117']) });
// step in chunks: hundreds of queued full-resolution frames in one submit can lose the GPU device
async function stepN(page, n) { for (let k = 0; k < n; k += 10) await page.evaluate(([m]) => window.__step(1 / 60, m), [Math.min(10, n - k)]); }
async function run(list, vw, vh, dp, mob, query) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dp, hasTouch: mob, isMobile: mob });
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.type(); if ((t === 'error' && !/404/.test(m.text())) || t === 'warning') console.log(`[${t}]`, m.text().slice(0, 800)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e).slice(0, 800)));
  await page.goto(`${base}?nohint&drs=0&${query}`);
  await page.waitForFunction('window.__ready===true', null, { timeout: 90000 }); await logAdapter(page);
  for (const s of list) {
    if (only && !only.split(',').includes(s.name.split('-')[0])) continue;
    if (s.w && (s.w !== page.viewportSize().width)) { await page.setViewportSize({ width: s.w, height: s.h }); await page.waitForTimeout(400); }
    await page.evaluate(s.setup);
    await stepN(page, s.steps);
    if (s.post) { await page.evaluate(s.post); await stepN(page, s.steps2 || 2); }
    await page.evaluate(() => window.__step(1 / 60, 2));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${s.name}.png` });
    console.log('ok', s.name, await page.evaluate('__info()'));
  }
  await ctx.close();
}
if (mobile) await run(MOBILE, 852, 393, 3, true, 'touch&safe' + (q ? '&q=' + q : ''));
else await run(SCENES, 1728, 1117, dpr, false, q ? 'q=' + q : '');
await browser.close();
