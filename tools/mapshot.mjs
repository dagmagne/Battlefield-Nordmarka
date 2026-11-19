// Minimap and large-map marker check: stages one of every marker kind near the tank (fresh, lost and dead vehicles of each
// map shape, spotted and dead soldiers, marked mines, an announced air unit, a drone in flight) and saves the HUD with the
// minimap, then the large map, plus a crop of each.
// usage: node tools/mapshot.mjs outdir [--w 1728 --h 1117 --dpr 2 --touch] (GPU tools options)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const out = a[0] && !a[0].startsWith('--') ? a[0] : 'shots/map';
const w = +opt('w', 1728), h = +opt('h', 1117), dpr = +opt('dpr', 2), touch = a.includes('--touch');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs([`--window-size=${Math.min(w, 1728)},${Math.min(h + 90, 1117)}`]) });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
const page = await ctx.newPage();
let errs = 0;
page.on('console', (m) => { if (m.type() === 'error') { console.log('[error]', m.text().slice(0, 800)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace${touch ? '&touch' : ''}`);
await page.waitForFunction('window.__ready===true', null, { timeout: 90000 }); await logAdapter(page);
const r = await page.evaluate(() => {
  const g = window.__game, v = window.__veh, E = g.enemies, res = [];
  window.__R.god = true;
  // vehicles: two of each map shape (circle T-72, square BMP/BTR, diamond Tigr, dot buggy/bike); then fresh / lost / dead
  const types = [0, 1, 2, 4, 0, 3, 5, 1];
  for (let k = 0; k < types.length; k++) {
    g.spawn(types[k]); const e = E.filter((q) => q.on).pop(); if (!e) continue;
    const an = k * 0.8 + 0.3, d = 180 + 70 * k; e.x = v.x + Math.sin(an) * d; e.z = v.z + Math.cos(an) * d; e.lx = e.x; e.lz = e.z;
    e.seen = true; e.spotT = 600; e.lostT = 0;
    if (k === 4 || k === 5) { e.spotT = 0; e.lostT = 6; } // lost contacts: hollow
    if (k === 6) e.dead = true;
    res.push(k);
  }
  // soldiers
  for (let k = 0; k < 6; k++) { const an = 2.6 + k * 0.12; g.infSpawn(k % 3 === 0 ? 'rpg' : 'rifle', v.x + Math.sin(an) * 260, v.z + Math.cos(an) * 260); }
  const I = g.inf; for (let i = 0; i < I.n; i++) { I.seen[i] = 1; I.spot[i] = 600; }
  if (I.n > 1) I.d[1 * 8 + 7] = 2; // one dead
  // marked mines in a short row
  for (let k = 0; k < 6; k++) { const i = g.mines.at(v.x - 120 + k * 9, v.z + 140, 1, 0); if (i >= 0) g.mines.r[i] = 1; }
  // an announced air unit
  g.airSpawn(2, 1.0); const air = g.air.find((q) => q.on); if (air) { air.warned = true; air.x = v.x + 300; air.z = v.z - 380; }
  return { res, inf: I.n, mines: g.mines.armed(), air: !!air };
});
console.log(JSON.stringify(r));
await page.evaluate(() => window.__sim(1 / 30, 2));
// a recon drone in the air (autopilot, so the tank camera stays)
await page.evaluate(() => { const g = window.__game; g.droneType(2); g.droneKey(); window.__sim(1 / 30, 90); g.droneKey(); const D = g.drone; D.x = window.__veh.x - 260; D.z = window.__veh.z - 200; });
await page.evaluate(() => window.__step(1 / 60, 20)); // __sim left manual stepping on: step so the minimap redraws
await page.screenshot({ path: `${out}/hud.png` });
const box = await page.evaluate(() => { const b = document.getElementById('map').getBoundingClientRect(); return { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 }; });
await page.screenshot({ path: `${out}/minimap.png`, clip: box });
await page.evaluate(() => window.__game.bigMap(true));
await page.evaluate(() => window.__step(1 / 60, 20));
await page.screenshot({ path: `${out}/bigmap.png` });
const b2 = await page.evaluate(() => { const v = window.__veh, b = document.getElementById('bmap').getBoundingClientRect(), P = window.__W.PB, ext = Math.max(P[2] - P[0], P[3] - P[1]) / 2 + 120, s = b.width / (2 * ext);
  const cx = b.x + b.width / 2 + (v.x - (P[0] + P[2]) / 2) * s, cy = b.y + b.height / 2 + (v.z - (P[1] + P[3]) / 2) * s, r = 700 * s; return { x: Math.max(0, cx - r), y: Math.max(0, cy - r), width: 2 * r, height: 2 * r }; });
await page.screenshot({ path: `${out}/bigmap-crop.png`, clip: b2 });
console.log('bigOpen', await page.evaluate(() => window.__game.bigOpen()), 'drawn soldiers', await page.evaluate(() => window.__game.inf.drawn));
// back on the recon drone (its own view with the OSD): the minimap must clear it
await page.evaluate(() => { window.__game.bigMap(false); window.__game.droneKey(); window.__step(1 / 60, 30); });
await page.screenshot({ path: `${out}/drone.png` });
await browser.close();
console.log(errs ? `done with ${errs} error(s)` : 'ok', out);
