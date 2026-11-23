// The split build (node build.mjs --split, served from dist/) in headless Chromium with software WebGPU: it loads the
// data as separate files, reaches __ready, the service worker takes control, and a reload without a network still
// reaches __ready (page, map blob, title image and a byte range of the music from the cache). Also loads the
// single-file build once, which must not fetch anything.
// usage: node tools/splittest.mjs [--port 8080] [--shot out.png]   (serve the repository root)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const port = +opt('port', 8080), shot = opt('shot', ''), base = `http://localhost:${port}/`;
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan,SkiaGraphite', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const ctx = await browser.newContext({ viewport: { width: 960, height: 620 } });
const page = await ctx.newPage(); const reqs = [], errs = [];
page.on('request', (r) => reqs.push(r.url().replace(base, '')));
page.on('pageerror', (e) => { if (!/external Instance reference/.test(String(e))) errs.push(String(e)); }); // that one is software WebGPU losing its device on a reload (see CLAUDE.md)
const ready = () => page.waitForFunction('window.__ready===true', null, { timeout: 240000 });
const Q = '?w=frogner&nohint&mute&q=low';

await page.goto(base + 'index.html' + Q); await ready();
ok(reqs.length === 1, `single-file build: one request (${reqs.length})`);

reqs.length = 0; let t0 = Date.now();
await page.goto(base + 'dist/' + Q); await ready();
console.log(`split build ready in ${((Date.now() - t0) / 1000).toFixed(1)} s; requests: ${reqs.join(' ')}`);
ok(reqs.some((u) => /dist\/world\.[0-9a-f]+\.bin$/.test(u)), 'map blob fetched as a file');
ok(reqs.some((u) => /dist\/title\.[0-9a-f]+\.webp$/.test(u)), 'title image fetched as a file');
ok(await page.evaluate(() => window.__W.name !== 'fantasi' && window.__W.bld.length > 3000), 'real world built from it');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).map((r) => r.url.split('/').pop()); });
ok(cached.length === 4, `cache holds the page and three data files (${cached.join(' ') || 'empty'})`);

await ctx.setOffline(true); reqs.length = 0; t0 = Date.now();
let off = true; try { await page.reload(); await ready(); } catch (e) { off = false; console.log(String(e).split('\n')[0]); }
ok(off, `offline reload reaches __ready (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
const mus = cached.find((n) => n.startsWith('music.'));
const rng = await page.evaluate(async (n) => { const r = await fetch(n, { headers: { Range: 'bytes=100-299' } }); return [r.status, (await r.arrayBuffer()).byteLength, r.headers.get('Content-Range')]; }, mus).catch((e) => [String(e)]);
ok(rng[0] === 206 && rng[1] === 200, `offline byte range of the music: ${rng.join(' ')}`);
const play = await page.evaluate(async (n) => { const el = new Audio(n); el.muted = true; await new Promise((res, rej) => { el.oncanplay = res; el.onerror = () => rej(new Error('media error')); setTimeout(() => rej(new Error('timeout')), 15000); }); return el.duration; }, mus).catch((e) => String(e));
ok(play > 190, `offline: the music element can play (duration ${play})`);
if (shot) { await page.evaluate(() => window.__step(1 / 60, 3)).catch(() => {}); await page.screenshot({ path: shot }); }
await ctx.setOffline(false);
ok(errs.length === 0, `no page errors (${errs.length}${errs[0] ? ': ' + errs[0].slice(0, 200) : ''})`);
await browser.close();
console.log(bad ? `${bad} FAILED` : 'all passed'); process.exit(bad ? 1 : 0);
