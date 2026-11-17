// Behaviour test of the sound module in headless Chromium (software WebGPU, logic-only __sim steps, no screenshots).
// Nobody hears anything here: it checks that events fire, voices gate, mute persists and nodes stay bounded.
// usage: node tools/audio-test.mjs [--port 8080]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const a = process.argv.slice(2), pi = a.indexOf('--port'), port = pi < 0 ? 8080 : +a[pi + 1];
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan,SkiaGraphite', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let errs = 0, fails = 0;
const check = (name, ok, v) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(v)}`); if (!ok) fails++; };
async function open(query, init) {
  const page = await browser.newPage({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') { console.log('[error]', m.text().slice(0, 400)); errs++; } });
  page.on('pageerror', (e) => { console.log('[pageerror]', String(e).slice(0, 400)); errs++; });
  if (init) await page.addInitScript(init);
  // sound is on by default (a stored choice and ?mute still win)
  await page.goto(`http://localhost:${port}/index.html?w=frogner&nohint&q=low&drs=0&np&${query}`);
  await page.waitForFunction('window.__ready===true', null, { timeout: 240000 });
  await page.evaluate(() => window.__sim(1 / 60, 1)); // manual stepping: stop the render loop
  return page;
}
const ev = (page, js) => page.evaluate(js);
const nap = (page, ms) => page.waitForTimeout(ms);

// 1. normal run: gesture, engine, gun, reload, MG, fight, node bound
{
  const p = await open('');
  check('waits for a gesture', (await ev(p, '__audio.state')) === 'waiting', await ev(p, '__audio.state'));
  await p.keyboard.press('KeyB'); await nap(p, 600);
  check('starts after a key press', (await ev(p, '__audio.state')) === 'running', await ev(p, '[__audio.state, __audio.nodes]'));
  await nap(p, 1500);
  const rc = await ev(p, 'JSON.stringify(__audio.rec)');
  check('all six recorded loops decoded (engine x3, tracks, enemy, drone)', Object.keys(JSON.parse(rc)).length === 6, rc);
  const idle = await ev(p, '__ui.poll=()=>{}; __sim(1/60,60); [__audio.engine.rate, __audio.engine.gain]');
  const drv = await ev(p, '__R.force=[1,0]; __sim(1/60,240); [__audio.engine.rate, __audio.engine.gain, __veh.v]');
  check('driving raises engine rate and gain', drv[0] > idle[0] + 0.3 && drv[1] > idle[1], { idle, drive: drv });
  await ev(p, '__R.force=[0,0]; __sim(1/60,180)');
  const g = await ev(p, '__inp.fire=true; __sim(1/60,2); __inp.fire=false; [__audio.count.gun|0, __audio.played.gun|0, __audio.count.reload|0]');
  check('main gun fires a gun event', g[0] === 1 && g[1] === 1 && g[2] === 0, g);
  const rl = await ev(p, '__sim(1/60,370); __audio.count.reload|0');
  check('reload event about 6 s later', rl === 1, rl);
  const mg = await ev(p, '__inp.mg=true; __sim(1/60,20); const on=__audio.mg; __inp.mg=false; __sim(1/60,5); [on, __audio.mg]');
  check('MG loop gates on and off', mg[0] > 0 && mg[1] === 0, mg);
  // staged fight on the open lake (as tools/battle.sh): a T-72 that sees us fires, then we kill it
  const f = await ev(p, `__R.god=true; const P=__W.PLAY-150, L=__W.lakes.filter((l)=>Math.abs(l.x)<P&&Math.abs(l.z)<P).sort((a,b)=>b.area-a.area)[0]; __tp(L.x-L.ax*110,L.z-L.az*110,0); const g=__game; g.spawn(0); const e=g.enemies.find((q)=>q.on); window.E=e; Object.assign(e,{x:L.x+L.ax*110,z:L.z+L.az*110,yaw:1,path:-1,immob:true}); __sim(1/60,900); [__audio.count.egun|0, __audio.count.hit|0, __audio.count.boom|0]`);
  check('enemy T-72 firing produces egun', f[0] > 0, { egun: f[0], hit: f[1], boom: f[2] });
  const k = await ev(p, `const b0=__audio.count.boom|0; __aimAt(E.x,E.y+1.2,E.z); let n=0; while(!E.dead && n<6){ __sim(1/60,400); __inp.fire=true; __sim(1/60,2); __inp.fire=false; __sim(1/60,30); n++; } __aimAt(); [E.dead, n, (__audio.count.boom|0)-b0, __audio.live, __audio.srcs]`);
  check('scripted kill produces boom events', k[0] && k[2] >= 2, { dead: k[0], shots: k[1], booms: k[2], live: k[3], srcs: k[4] });
  // 20 s of fighting (waves keep coming, god mode) in 2 s chunks, letting the event loop run in between
  const s = [];
  await ev(p, '__game.spawn(0); __game.spawn(1); __game.spawn(1); __inp.mg=true');
  for (let i = 0; i < 10; i++) { s.push(await ev(p, '__inp.fire=true; __sim(1/60,120); __inp.fire=!__inp.fire; [__audio.live, __audio.srcs, __audio.nodes]')); await nap(p, 400); }
  await ev(p, '__inp.mg=false; __inp.fire=false'); await nap(p, 5000);
  const end = await ev(p, '__sim(1/60,1); [__audio.live, __audio.srcs, __audio.nodes, JSON.stringify(__audio.count), JSON.stringify(__audio.played)]');
  const maxLive = Math.max(...s.map((x) => x[0])), maxSrc = Math.max(...s.map((x) => x[1])), nodes = new Set(s.map((x) => x[2]));
  // srcs can briefly exceed 12: a stolen voice's onended arrives after the synchronous __sim burst
  check('voices and nodes stay bounded over 20 s of fighting', maxLive <= 12 && maxSrc <= 24 && nodes.size === 1 && end[0] === 0 && end[1] === 0, { samples: s, after5sQuiet: end.slice(0, 3) });
  console.log('counts', end[3]); console.log('played', end[4]);
  // mute with M persists through a reload
  await p.keyboard.press('KeyM'); await nap(p, 400);
  const m = await ev(p, '[__audio.on, __audio.master, localStorage.gsnd, __audio.state]');
  check('M mutes (master 0, saved, context suspended)', m[0] === false && m[1] === 0 && m[2] === '0' && m[3] === 'suspended', m);
  await p.reload(); await p.waitForFunction('window.__ready===true', null, { timeout: 240000 }); await ev(p, '__sim(1/60,1)');
  await p.keyboard.press('KeyB'); await nap(p, 600);
  const m2 = await ev(p, 'const c0=__audio.count.gun|0, p0=__audio.played.gun|0; __ui.poll=()=>{}; __inp.fire=true; __sim(1/60,2); __inp.fire=false; [__audio.on, __audio.master, __audio.state, (__audio.count.gun|0)-c0, (__audio.played.gun|0)-p0]');
  check('mute survives a reload (event counted, not played)', m2[0] === false && m2[1] === 0 && m2[2] !== 'running' && m2[3] === 1 && m2[4] === 0, m2);
  await p.keyboard.press('KeyM'); await nap(p, 600);
  const m3 = await ev(p, '[__audio.on, __audio.master, __audio.state, localStorage.gsnd]');
  check('M again unmutes', m3[0] && m3[1] === 0.6 && m3[2] === 'running' && m3[3] === '1', m3);
  // the menu row
  const mr = await ev(p, `document.querySelector('#mS [data-v="0"]').click(); const a=[__audio.on, localStorage.gsnd, document.querySelector('#mS .on').dataset.v]; document.querySelector('#mS [data-v="1"]').click(); a.concat([__audio.on, localStorage.gsnd])`);
  check('menu row Sound Off/On', mr[0] === false && mr[1] === '0' && mr[2] === '0' && mr[3] === true && mr[4] === '1', mr);
  await p.close();
}
// 2. ?mute starts silent
{
  const p = await open('mute');
  await p.keyboard.press('KeyB'); await nap(p, 600);
  const r = await ev(p, '__ui.poll=()=>{}; __inp.fire=true; __sim(1/60,2); __inp.fire=false; __R.force=[1,0]; __sim(1/60,60); [__audio.on, __audio.master, __audio.state, __audio.count.gun|0, __audio.played.gun|0, __game.kills >= 0]');
  check('?mute starts silent and the game runs', r[0] === false && r[1] === 0 && r[2] !== 'running' && r[3] === 1 && r[4] === 0, r);
  await p.close();
}
// 3. no AudioContext at all
{
  const p = await open('', () => { delete window.AudioContext; delete window.webkitAudioContext; });
  await p.keyboard.press('KeyB'); await nap(p, 300);
  const r = await ev(p, '__ui.poll=()=>{}; __inp.fire=true; __sim(1/60,2); __inp.fire=false; __R.force=[1,0]; __inp.mg=true; __sim(1/60,240); [__audio.state, __audio.count.gun|0, __veh.v, typeof AudioContext]');
  await p.keyboard.press('KeyM'); await p.keyboard.press('KeyM');
  await ev(p, '__step(1/60,1)'); // one rendered frame
  check('runs without AudioContext', r[0] === 'unsupported' && r[1] === 1 && r[2] > 1, r);
  await p.close();
}
// 4. music: blocked until a gesture (as in a normal browser), starts on picking a world, keeps playing (lower) in the game;
//    the U key, the MUSIC buttons, the menu row and the sound switch control it, and the choice survives a reload
{
  const b2 = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan,SkiaGraphite', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const p = await b2.newPage({ viewport: { width: 960, height: 620 } });
  p.on('pageerror', (e) => { console.log('[pageerror]', String(e).slice(0, 400)); errs++; });
  p.on('console', (m) => { if (m.type() === 'error') { console.log('[error]', m.text().slice(0, 300)); errs++; } });
  await p.addInitScript(() => { const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__mus = this; return P.call(this); }; });
  await p.goto(`http://localhost:${port}/index.html?q=low&drs=0&np`);
  await p.waitForSelector('#pick button', { state: 'visible', timeout: 60000 }); await nap(p, 800);
  const before = await ev(p, '[!!window.__mus, window.__mus ? window.__mus.paused : null, document.getElementById("lMu").classList.contains("on")]');
  check('music waits for a gesture on the start screen', before[0] && before[1] === true && before[2], before);
  await p.click('#pick button[data-w="frogner"]'); await nap(p, 1500);
  const during = await ev(p, '[__mus.paused, +__mus.currentTime.toFixed(2), Math.round(__mus.duration), __mus.loop]');
  check('music plays after picking a world (whole track, looped)', during[0] === false && during[1] > 0.2 && during[2] > 190 && during[3], during);
  await p.waitForFunction('window.__ready===true', null, { timeout: 240000 });
  await nap(p, 5000);
  const after = await ev(p, '[__mus.paused, +__mus.volume.toFixed(2)]');
  await p.keyboard.press('Escape'); await nap(p, 300); // the first-run help card
  check('music keeps playing in the game, lower', after[0] === false && after[1] > 0.2 && after[1] < 0.45, after);
  await p.keyboard.press('KeyU'); await nap(p, 300);
  const u = await ev(p, '[__mus.paused, localStorage.gmus, document.getElementById("bMu").classList.contains("on")]');
  check('U turns the music off (saved, button off)', u[0] === true && u[1] === '0' && !u[2], u);
  await p.click('#bMu'); await nap(p, 500);
  const bm = await ev(p, '[__mus.paused, localStorage.gmus, document.getElementById("bMu").classList.contains("on")]');
  check('the MUSIC button turns it back on', bm[0] === false && bm[1] === '1' && bm[2], bm);
  await p.keyboard.press('KeyM'); await nap(p, 300);
  const mm = await ev(p, '[__mus.paused, __audio.on]');
  check('M (sound off) also silences the music', mm[0] === true && mm[1] === false, mm);
  await p.keyboard.press('KeyM'); await nap(p, 500);
  check('M again brings the music back', (await ev(p, '__mus.paused')) === false, await ev(p, '__mus.paused'));
  await ev(p, 'document.querySelector(\'#mU [data-v="0"]\').click()'); await nap(p, 300);
  check('menu row Music Off', (await ev(p, '[__mus.paused, localStorage.gmus]')).join() === 'true,0', await ev(p, '[__mus.paused, localStorage.gmus]'));
  await p.reload(); await p.waitForSelector('#pick button', { state: 'visible', timeout: 60000 }); await nap(p, 500);
  await p.click('#pick button[data-w="frogner"]'); await nap(p, 1000);
  const rl = await ev(p, '[window.__mus ? __mus.paused : "none", document.getElementById("lMu").classList.contains("on")]');
  check('music off survives a reload (picking a world does not start it)', (rl[0] === 'none' || rl[0] === true) && !rl[1], rl);
  await b2.close();
}
await browser.close();
console.log(`${fails} failed check(s), ${errs} page error(s)`);
process.exit(fails || errs ? 1 : 0);
