// Behaviour test of the controller vibration (haptics.js) with a fake gamepad whose actuator records every playEffect.
// Software WebGPU like cshot (no GPU needed). usage: node tools/haptest.mjs [--port 8080]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const a = process.argv.slice(2), port = +(a[a.indexOf('--port') + 1] || 0) || 8080;
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan,SkiaGraphite', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'].concat(process.env.HFLAGS ? process.env.HFLAGS.split(' ') : []) });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
let errs = 0; page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
page.on('console', (m) => { if (m.type() === 'error') { console.log('[error]', m.text().slice(0, 400)); errs++; } });
await page.addInitScript(() => {
  const log = window.__vlog = [];
  const btn = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, btn),
    vibrationActuator: { type: 'dual-rumble', effects: ['dual-rumble'], playEffect(t, p) { log.push([t, +p.strongMagnitude.toFixed(3), +p.weakMagnitude.toFixed(3), p.duration]); return Promise.resolve('complete'); }, reset() { return Promise.resolve('complete'); } } };
  window.__fakePad = pad; window.__padOn = false;
  navigator.getGamepads = () => [window.__padOn ? pad : null, null, null, null];
});
await page.goto(`http://localhost:${port}/index.html?w=frogner&nohint&peace&mute&q=low&trees=low`);
await page.waitForFunction('window.__ready===true', null, { timeout: 240000 });
const ev = (js) => page.evaluate(js);
const step = (n) => ev(`window.__sim(1/60, ${n})`); // logic only: haptics update before the render, so no GPU is needed
const res = []; const check = (name, ok, info) => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, info === undefined ? '' : JSON.stringify(info)); };
const snap = () => ev('({ n: __vlog.length, last: __vlog[__vlog.length - 1] || null, s: __hap.strong, w: __hap.weak, lvl: __hap.level })');

await step(30);
let r = await snap(); check('no pad: nothing sent', r.n === 0, r);
await ev("window.__padOn = true; dispatchEvent(new Event('gamepadconnected'))"); await step(30);
// engine pulses: count the peaks of the strong motor over the last ~2 s of effects sent
const pulses = (js) => ev(`(() => { const L = __vlog.slice(-${js}), v = L.map((e) => e[1]), m = v.reduce((a, b) => a + b, 0) / v.length; let c = 0; for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1] && v[i] > m * 0.9) c++; return { c, max: Math.max(...v), min: Math.min(...v), n: v.length }; })()`);
await step(120); let pi = await pulses(40); r = await snap();
check('idle engine: gentle chug on the strong motor (~3 pulses/s)', pi.max > 0.02 && pi.max < 0.06 && pi.min < 0.5 * pi.max && r.w < 0.02, pi);
const n0 = r.n; await step(60); r = await snap(); check('re-issued about every 50 ms (~20 per s)', r.n - n0 >= 15 && r.n - n0 <= 25, { per_s: r.n - n0 });
await ev('__R.force = [1, 0]'); await step(150); r = await snap(); check('driving: track rumble on the weak motor', r.w > 0.08, { ...r, v: await ev('__veh.v') });
{ const t0 = await ev('__vlog.length'); await step(60); const nn = (await ev('__vlog.length')) - t0; const pd = await pulses(nn);
  check('full revs: faster pulses (per s) than at idle, still mild', pd.c >= pi.c / 2 * 1.6 && pd.max < 0.2, { idle_per_s: pi.c / 2, drive: pd.c, sent: nn, s: await ev('__vlog.slice(-' + nn + ').map((e) => e[1])'), v: await ev('[__veh.v, __veh.shake]') }); }
await ev('__R.force = [0, 0]; __veh.v = 0'); await step(120);
await ev('__ui._p = __ui.poll; __ui.poll = () => {}; __inp.fire = true'); await step(3); await ev('__inp.fire = false'); await step(1);
r = await snap(); check('own main gun: strong kick', r.s > 0.8, r);
await step(40); r = await snap(); check('kick fades within ~0.6 s', r.s < 0.3, r);
await ev('__hap.ev("hit", __veh.x, __veh.y + 1.5, __veh.z, 30)'); await step(1); r = await snap(); check('heavy hit on the tank', r.s > 0.8, r); await step(60);
await ev('__hap.ev("hit", __veh.x, __veh.y + 1.5, __veh.z, 0.3)'); await step(1); r = await snap(); check('MG bullet: light tap', r.s > 0.25 && r.s < 0.6, r); await step(60);
await ev('__hap.ev("crash", __veh.x + 3, __veh.y + 1, __veh.z, 0.12)'); await step(1); r = await snap(); check('tree felled: short weak-motor bump', r.w > 0.5, r); await step(60);
await ev('__hap.ev("boom", __veh.x + 15, __veh.y, __veh.z, 4)'); await step(1); r = await snap(); check('artillery 15 m away: strong', r.s > 0.9, r); await step(80);
await ev('__hap.ev("boom", __veh.x + 400, __veh.y, __veh.z, 1)'); await step(1); r = await snap(); check('small explosion 400 m away: nothing', r.s < 0.25, r); await step(60);
await ev('__inp.mg = true'); await step(20); r = await snap(); const mgRun = await ev('__vlog.slice(-6).map((e) => e[2])'); await ev('__inp.mg = false'); await step(30);
check('MG fire: rattling weak motor', Math.max(...mgRun) > 0.3, mgRun);
await ev('__game.droneType(0); __game.droneKey()'); await step(60); r = await snap();
check('FPV drone: no tank engine, a faint hum', r.s === 0 && r.w > 0.01 && r.w < 0.08, { ...r, on: await ev('__game.drone.on') });
await ev('__game.droneKey()'); await step(30);
await ev('__game.droneType(1); __game.droneKey()'); await step(60); r = await snap();
check('bomber drone: still', r.s === 0 && r.w === 0, { ...r, on: await ev('__game.drone.on') });
await ev('__game.droneKey()'); await step(300);
await ev('__api.vib(1)'); await step(40); const sFull = 0.08; r = await snap(); check('light level scales down', r.lvl === 1 && r.s < 0.035, r);
await ev('__api.vib(0)'); await step(2); r = await snap(); const n1 = r.n; await step(30); r = await snap();
check('off: a final zero effect, then silence', r.last && r.last[1] === 0 && r.last[2] === 0 && r.n === n1, r);
await ev('__api.vib(2)');
await ev('__ui.poll = __ui._p; window.__padOn = false; dispatchEvent(new Event("gamepaddisconnected"))'); await step(30); const n2 = (await snap()).n; await step(30);
check('pad disconnected: nothing sent', (await snap()).n === n2);
const alloc = await ev('localStorage.gvib'); check('level remembered', alloc === '2', alloc);
console.log(errs ? `page errors: ${errs}` : 'no page errors');
await browser.close();
const ok = res.every(Boolean) && !errs; console.log(ok ? 'ALL PASS' : 'FAILURES'); process.exit(ok ? 0 : 1);
