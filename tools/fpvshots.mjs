// Renders of the player's FPV drone (imported model): close-ups from four sides, the flying view behind it, thermal.
// usage: node tools/fpvshots.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/fpv';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1300,820']) });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
let errs = 0; page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 600)); errs++; });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 300)); });
await page.goto(`${base}?w=frogner&nohint&peace&q=high&drs=0&tod=1&mute`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const ev = (js) => page.evaluate(js);
const shot = async (name, n = 2) => { await ev(`__step(1/60,${n})`); await page.waitForTimeout(100); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.CX=L.x; window.CZ=L.z; const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l;
  __tp(L.x-FX*110, L.z-FZ*110, Math.atan2(FX,FZ)); __ui.poll=()=>{}; __R.god=true; __sim(1/60,30); window.G=__game;
  G.droneType(0); G.droneKey(); __sim(1/60, 30); window.D=G.drone; return 1; })()`);
const place = `D.x=CX; D.z=CZ; D.y=__W.heightAt(CX,CZ)+2.2; D.vx=D.vy=D.vz=0; D.yaw=0.6; D.t=60;`;
for (const [name, a, d, h] of [['q-front', 0.7, 1.5, 0.45], ['side', 1.57, 1.4, 0.1], ['q-back', 2.6, 1.5, 0.5], ['top', 0.3, 0.6, 1.4], ['under', 0.9, 1.3, -0.5]]) {
  await ev(`(()=>{ ${place} __sim(1/60,1); ${place} const fx=-Math.sin(D.yaw), fz=-Math.cos(D.yaw), c=Math.cos(${a}), s=Math.sin(${a}), dx=fx*c-fz*s, dz=fz*c+fx*s, g=D.y-__W.heightAt(D.x,D.z); __look(D.x+dx*${d}, g+${h}, D.z+dz*${d}, D.x, g, D.z); })()`);
  await shot(name, 1);
}
await ev(`__R.pose=null; ${place} __sim(1/60, 30)`); await shot('fly-view', 3);
await ev(`__R.therm=1`); await shot('fly-thermal', 3); await ev('__R.therm=0');
await ev(`(()=>{ ${place} D.y=__W.heightAt(CX,CZ)+3; __sim(1/60,1); const g=D.y-__W.heightAt(D.x,D.z); __look(D.x+5, g+1.2, D.z+5, D.x, g, D.z); })()`); await shot('mid', 1);
console.log(errs ? errs + ' page errors' : 'no page errors');
await browser.close();
