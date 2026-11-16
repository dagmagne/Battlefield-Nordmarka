// Software-WebGPU screenshot helper for containers without a GPU (headless Chromium + SwiftShader). Slow; use small sizes.
// usage: node tools/cshot.mjs out.png "query" [--w 960 --h 620 --frames 4 --port 8080 --touch --eval "js"] ; several "out query" pairs may be given with --multi
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const w = +opt('w', 960), h = +opt('h', 620), frames = +opt('frames', 4), ev = opt('eval', ''), port = +opt('port', 8080); // --port: serve a second checkout on another port
const jobs = []; for (let i = 0; i < a.length && !a[i].startsWith('--'); i += 2) jobs.push([a[i], a[i + 1] || '']);
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan,SkiaGraphite', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let errs = 0;
for (const [out, query] of jobs) {
  const touch = a.includes('--touch'); // phone layout: add --touch (and usually --w 852 --h 393)
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') { console.log(`[${t}]`, m.text().slice(0, 1200)); if (t === 'error') errs++; } });
  page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 1200)); errs++; });
  await page.goto(`http://localhost:${port}/index.html?${query}`);
  try {
    await page.waitForFunction('window.__ready===true', null, { timeout: 180000 });
    await page.evaluate((n) => window.__step(1 / 60, n), frames);
    // --eval "js || js || ..." : one screenshot per snippet (out.png, out-1.png, ...)
    const evs = ev ? ev.split('||') : [''];
    for (let k = 0; k < evs.length; k++) {
      if (evs[k].trim()) { const r = await page.evaluate(evs[k]); if (r !== undefined && r !== null) console.log(JSON.stringify(r)); await page.evaluate(() => window.__step(1 / 60, 2)); }
      await page.screenshot({ path: k ? out.replace(/\.png$/, `-${k}.png`) : out });
    }
    console.log(await page.evaluate('window.__info()'));
  } catch (e) { console.log('[timeout]', e.message.split('\n')[0]); errs++; }
  await page.close();
}
await browser.close();
console.log(errs ? `done with ${errs} error(s)` : 'ok');
