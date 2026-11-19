// Look-check renders of the vehicle models: the Leopard, the Tigr, the buggy, the motorcycle (and the other enemy types) staged
// one at a time on the open lake, plus the parked MX3000 metro units at Frognerseteren.
// usage: node tools/vehshots.mjs outdir [--only leo,tigr,buggy,moto,train,t72,bmp,btr] [--tod 1] [--w 1728 --h 1117 --dpr 1] (+ the GPU tools options)
// Views per vehicle: fq (front quarter), side, rq (rear quarter), front, rear, top (high three-quarter), close (detail, front quarter), low.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const out = a[0] || 'shots/veh', only = opt('only', 'leo,tigr,buggy,moto,train').split(','), tod = opt('tod', '1');
const w = +opt('w', 1728), h = +opt('h', 1117), dpr = +opt('dpr', 1);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs([`--window-size=${Math.min(w, 1728)},${Math.min(h + 90, 1117)}`]) });
const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e).slice(0, 600)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[error]', m.text().slice(0, 600)); });
await page.goto(`${base}?w=frogner&nohint&nohud&peace&q=high&drs=0&tod=${tod}`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const ev = (js) => page.evaluate(js);
const shot = async (name) => { await ev('__step(1/60,4)'); await page.waitForTimeout(120); await page.screenshot({ path: `${out}/${name}.png` }); console.log('ok', `${out}/${name}.png`); };
// [name, bearing from the vehicle's nose (rad, + = its right side), distance in vehicle lengths, eye height in vehicle heights, target height fraction]
const VIEWS = [['fq', 0.65, 1.55, 0.95, 0.45], ['side', Math.PI / 2, 1.5, 0.6, 0.45], ['rq', Math.PI - 0.7, 1.55, 0.95, 0.45], ['front', 0, 1.5, 0.6, 0.45], ['rear', Math.PI, 1.5, 0.7, 0.45],
  ['top', -0.8, 1.35, 2.3, 0.4], ['close', -0.55, 0.85, 0.75, 0.55], ['low', -2.3, 1.2, 0.3, 0.5]];
// a camera on a ring round (x, z): size = [length, height]
const ring = async (name, x, z, yaw, L, H) => {
  for (const [vn, br, dk, hk, tk] of VIEWS) {
    await ev(`(()=>{const a=${yaw}+${br},d=${dk * L + 1.2};__look(${x}-Math.sin(a)*d,${hk * H + 0.25},${z}-Math.cos(a)*d,${x},${tk * H},${z});})()`);
    await shot(`${name}_${vn}`);
  }
};
// stage on the largest lake inside the play area; the tank looks across it
await ev(`(()=>{ const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; window.L=L; window.G=__game;
  __ui.poll=()=>{}; const l=Math.hypot(L.ax,L.az)||1; window.FX=L.ax/l; window.FZ=L.az/l; __tp(L.x-FX*30, L.z-FZ*30, Math.atan2(-FX,-FZ)+0.5); __sim(1/60,30); })()`);
if (only.includes('leo')) {
  const p = await ev('[__veh.x,__veh.z,__veh.yaw]');
  await ring('leo', p[0], p[1], p[2], 7.6, 2.9);
  await ev('__aim(__veh.yaw+0.9,0.12,0);__sim(1/60,240)'); // turret traversed and the gun up, for the turret sides
  for (const [vn, br, dk, hk, tk] of [['turret', 0.5, 0.95, 1.1, 0.75], ['deck', Math.PI - 0.5, 1.0, 1.35, 0.6]]) {
    await ev(`(()=>{const a=${p[2]}+${br},d=${dk * 7.6 + 1.2};__look(${p[0]}-Math.sin(a)*d,${hk * 2.9},${p[1]}-Math.cos(a)*d,${p[0]},${tk * 2.9},${p[1]});})()`);
    await shot(`leo_${vn}`);
  }
}
const EN = { t72: [0, 7.4, 2.4], bmp: [1, 6.8, 2.2], tigr: [2, 5.8, 2.7], btr: [3, 7.7, 2.6], buggy: [4, 3.5, 1.9], moto: [5, 2.2, 1.5] };
for (const k of Object.keys(EN)) {
  if (!only.includes(k)) continue;
  const [t, L, H] = EN[k];
  const p = await ev(`(()=>{ for (const e of G.enemies) e.on=false; G.spawn(${t},3); const e=G.enemies.find((q)=>q.on&&q.type===${t}); e.x=L.x+FX*25; e.z=L.z+FZ*25; e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(-FX,-FZ)+2.2; e.path=-1; e.immob=true; e.v=0; __sim(1/60,20); return [e.x,e.z,e.yaw]; })()`);
  await ring(k, p[0], p[1], p[2], L, H);
}
if (only.includes('train')) {
  const T = await ev(`(()=>{ const r=[]; for (const B of __W.bld) if (B.fix && B.boxes && B.boxes.length===3 && B.boxes[0].hd>8) r.push(B.boxes.map((b)=>[b.x,b.z,b.th,b.hd])); return r; })()`);
  console.log('trains', JSON.stringify(T).slice(0, 300));
  let n = 0;
  for (const tr of T.slice(0, 2)) {
    const [x, z, yaw] = tr[0], [mx, mz] = tr[1]; n++;
    const cab = [x - Math.sign((mx - x) * Math.sin(yaw) + (mz - z) * Math.cos(yaw)) * Math.sin(yaw) * 9.1, z - Math.sign((mx - x) * Math.sin(yaw) + (mz - z) * Math.cos(yaw)) * Math.cos(yaw) * 9.1]; // the cab end of car 0
    const ax = (x - mx) / Math.hypot(x - mx, z - mz), az = (z - mz) / Math.hypot(x - mx, z - mz), nx = -az, nz = ax; // along the train towards the cab, and sideways
    const V = [['fq', 9, 7, 2.6, 2.0, -3], ['fq2', 9, -7, 2.2, 2.0, -3], ['front', 11, 0.6, 2.3, 2.0, 0], ['side', -6, 13, 2.4, 1.9, -6], ['close', 4, 4.5, 2.0, 2.0, -1.5], ['long', 22, 9, 4.5, 1.8, -20], ['roof', 6, 8, 7.5, 2.5, -8], ['bogie', -1, 5.5, 0.9, 0.6, -2.6]];
    for (const [vn, da, ds, eh, th, ta] of V) {
      await ev(`__look(${cab[0] + ax * da + nx * ds},${eh},${cab[1] + az * da + nz * ds},${cab[0] + ax * ta},${th},${cab[1] + az * ta})`);
      await shot(`train${n}_${vn}`);
    }
  }
}
await browser.close();
