// 60 s scripted drive; prints frame-time + GPU timestamp stats. usage: node tools/perf.mjs [extra query]
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1728,1117', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[error]', m.text().slice(0, 400)); });
await page.goto('http://localhost:8080/index.html?auto&nohint&tod=1&' + (process.argv[2] || ''));
await page.bringToFront();
await page.waitForFunction('window.__perf', null, { timeout: 120000, polling: 1000 });
const p = await page.evaluate('window.__perf');
console.log(JSON.stringify({ ...p, hitches: p.hitches.length, hitchList: p.hitches.slice(0, 30) }, null, 1));
await browser.close();
