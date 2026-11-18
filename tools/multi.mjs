// Batch screenshots in one headed Chrome session.
// usage: node tools/multi.mjs "<query>" '<json [{out, eval, frames | steps}]>' [--w --h --dpr --mobile]
import { chromium } from 'playwright-core';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const w = +opt('w', 1728), h = +opt('h', 1117), dpr = +opt('dpr', 2), mobile = a.includes('--mobile');
const jobs = JSON.parse(a[1]);
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs([`--window-size=${Math.min(w, 1728)},${Math.min(h + 90, 1117)}`]) });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.type(); if ((t === 'error' && !/404/.test(m.text())) || t === 'warning' || a.includes('--log')) console.log(`[${t}]`, m.text().slice(0, 1200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e).slice(0, 1200)));
await page.goto(`${base}?${a[0]}`);
await page.waitForFunction('window.__ready===true', null, { timeout: 90000 }); await logAdapter(page);
for (const j of jobs) {
  if (j.eval) { const r = await page.evaluate(j.eval); if (r !== undefined && r !== null) console.log(j.out || '', JSON.stringify(r)); }
  // steps: manual stepping in chunks of 10 (deterministic; the real-time loop at full resolution can come out black in screenshots)
  if (j.steps) { for (let k = 0; k < j.steps; k += 10) await page.evaluate((m) => window.__step(1 / 60, m), Math.min(10, j.steps - k)); await page.waitForTimeout(150); }
  else await page.evaluate((n) => window.__waitFrames(n), j.frames || 12);
  if (j.out) { await page.screenshot({ path: j.out }); console.log('ok', j.out); }
}
await browser.close();
