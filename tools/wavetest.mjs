// Headless behaviour test of the enemy waves (logic-only stepping through __sim, no rendering needed):
// plays through all waves with an invulnerable player, logs per wave the scenario, composition, spawn bearings, roles and
// how the enemies moved, and fails on NaN positions, vehicles inside buildings or vehicles that stay stuck.
// Infantry (phase 6): per wave the squads placed and dismounted, soldiers alive/dead and their shots; fails on NaN or a soldier inside a wall.
// usage: node tools/wavetest.mjs [--port 8080] [--query "w=frogner"] [--waves 7] [--seed N] [--move]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const port = +opt('port', 8080), query = opt('query', 'w=frogner'), waves = +opt('waves', 7), seed = +opt('seed', 0), move = a.includes('--move');
// --gpu: the installed Chrome on the real GPU (headed) instead of Playwright's headless shell with SwiftShader
const browser = a.includes('--gpu') ? await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--window-size=900,600', ...(process.env.GX11 ? ['--ozone-platform=x11', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'] : [])] })
  : await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan,SkiaGraphite', '--use-vulkan=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
let errs = 0;
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
page.on('console', (m) => { if (m.type() === 'error') { console.log('[error]', m.text().slice(0, 400)); errs++; } });
await page.goto(`http://localhost:${port}/${opt("path", "") ? opt("path", "").replace(/^\/+|\/+$/g, "") + "/" : ""}index.html?${query}&nohint&mute&q=low`); // --path: a checkout below the server root
await page.waitForFunction('window.__ready===true', null, { timeout: 240000 });
const res = await page.evaluate(async ({ waves, seed, move }) => {
  const G = __game, R = __R, veh = __veh, B = __bld, I = G.inf; R.god = true; __ui.poll = () => {};
  for (let i = 0; i < seed; i++) { G.spawn(0); for (const e of G.enemies) e.on = false; } // spawn() draws from the game's rnd: shifts the stream for a different replay
  const sl = []; G.onStuck = (e) => { let nq = 1e9; for (const q of G.enemies) if (q !== e && q.on) nq = Math.min(nq, Math.hypot(q.x - e.x, q.z - e.z));
    let nt = 99, ntH = 0; { const TT = __W.trees, T = TT.data, cx = Math.floor((e.x + 2048) / 32), cz = Math.floor((e.z + 2048) / 32); for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) { if (i < 0 || j < 0 || i > 127 || j > 127) continue; const nc = j * 128 + i, st = TT.nearStart[nc], n = TT.nearCnt[nc * 3] + TT.nearCnt[nc * 3 + 1] + TT.nearCnt[nc * 3 + 2]; for (let k = st; k < st + n; k++) { if (T[k * 8 + 5] % 1 > 0.001) continue; const d = Math.hypot(T[k * 8] - e.x, T[k * 8 + 2] - e.z); if (d < nt) { nt = d; ntH = T[k * 8 + 3]; } } } }
    e._nt = +nt.toFixed(1); e._ntH = +ntH.toFixed(1); e._tc = +(e.tcT || 0).toFixed(1); e._v = +e.v.toFixed(1); e._tgt = +e.tgt.toFixed(1);
    let nb = 99; for (let r = 2; r < 12 && nb === 99; r += 2) for (let k = 0; k < 8; k++) if (B.at(e.x + Math.cos(k * 0.785) * r, e.y + 1.5, e.z + Math.sin(k * 0.785) * r, 0) >= 0) { nb = r; break; }
    sl.push({ role: G.ROLES[e.role], rev: e.rvD > 0 ? 'was reversing' : 'was forward', nq: Math.round(nq), nb, d: Math.round(Math.hypot(e.x - veh.x, e.z - veh.z)), stN: e.stN, x: Math.round(e.x), z: Math.round(e.z), tree: e._nt, treeH: e._ntH, tc: e._tc, v: e._v, tgt: e._tgt, type: e.type }); };
  const toasts = []; const t0 = __ui.toast; __ui.toast = (m) => { toasts.push(m); t0(m); if (/dismounting/.test(m) && info) info.inf.dis++; };
  const brg = (e) => Math.round(((Math.atan2(e.x - veh.x, -(e.z - veh.z)) * 57.3) + 360) % 360);
  const out = []; let bad = [], t = 0, w = 0, info = null; const cur = [];
  const kill = (e) => { const i = G.enemies.indexOf(e); if (cur[i]) cur[i].dead = true; e.dead = true; e.hp = 0; e.state = 3; e.burn = 0.01; e.v = 0; G.kills++; };
  while (G.wave <= waves && t < 4000) {
    __sim(1 / 30, 30); t += 1;
    if (G.wave !== w && G.state === 1) { // a new wave started
      w = G.wave; info = { wave: w, plan: G.plan, t0: t - 1, units: [], inf: { rpg: 0, atgm: 0, dis: 0, peak: 0, dead: 0, wall: 0 }, i0: [I.rockets, I.atgms, I.bursts, I.kills] }; out.push(info);
      for (let q = 0; q < I.qk.length; q++) if (I.qk[q] >= 0) { let live = 0; for (let i = 0; i < I.n; i++) if (I.sq[i] === q && I.d[i * 8 + 7] === 1) live++; if (live && I.qk[q] < 2) info.inf[I.qk[q] ? 'atgm' : 'rpg']++; }
    }
    if (move && G.state === 1) { R.force = [Math.sin(t / 23) > 0 ? 0.6 : -0.4, Math.sin(t / 7) * 0.5]; }
    if (!info) continue;
    const wt = t - info.t0;
    { let live = 0, dead = 0; for (let i = 0; i < I.n; i++) { const o = i * 8, st = I.d[o + 7]; if (!st) continue; if (st === 2) { dead++; continue; } live++;
        for (let k = 0; k < 8; k++) if (!isFinite(I.d[o + k])) { bad.push(`soldier NaN w${w} #${i}`); break; }
        if (I.hb[i] < 0 && B.at(I.d[o], I.d[o + 1] + 1, I.d[o + 2], 0) >= 0) { info.inf.wall++; bad.push(`soldier inside a wall w${w} #${i} at ${Math.round(I.d[o])},${Math.round(I.d[o + 2])}`); } }
      info.inf.peak = Math.max(info.inf.peak, live); info.inf.dead = dead; }
    for (let i = 0; i < G.enemies.length; i++) { const e = G.enemies[i]; if (!e.on || e.dead) { if (cur[i]) cur[i].dead = true; continue; }
      let u = cur[i]; if (!u || u.dead || u.wave !== w) { u = cur[i] = { wave: w, type: ['T72', 'BMP', 'Tigr', 'BTR', 'Buggy', 'Moto'][e.type], role: G.ROLES[e.role], grp: e.grp, spawnT: wt, b0: brg(e), d0: Math.round(Math.hypot(e.x - veh.x, e.z - veh.z)), track: [], dmin: 1e9, net: [0, 0], scoots: 0, smoked: false }; info.units.push(u); }
      const d = Math.hypot(e.x - veh.x, e.z - veh.z); u.dmin = Math.min(u.dmin, d);
      if (e.path >= 0) u.net[e.net]++;
      if (e.scT > 0) u.scoots++;
      if (wt % 10 === 0) u.track.push(`${Math.round(d)}m@${brg(e)}${e.state ? '*' : ''}${e.retT > 0 ? 'R' : ''}${e.scT > 0 ? 'S' : ''}${e.role === 2 ? 'p' + e.ph : ''}`);
      if (!isFinite(e.x + e.z + e.y + e.yaw + e.v)) bad.push(`NaN w${w} #${i}`);
      if (B.at(e.x, e.y + 1.2, e.z, 0) >= 0) bad.push(`inside building w${w} #${i} t${wt}`);
      if (e.stN >= 4 && !u.stk) { u.stk = 1; bad.push(`stuck repeatedly w${w} #${i} ${G.ROLES[e.role]} at ${Math.round(e.x)},${Math.round(e.z)}`); }
      if (!__W.inP(e.x, e.z, -5)) bad.push(`outside play w${w} #${i}`);
      // test the hit reaction once per unit after a while: a 20 hp graze
      if (wt === u.spawnT + 35 && e.type === 0) { e.hp -= 20; u.grazed = true; }
      if (u.grazed && e.retT > 0) u.smoked = true;
    }
    // drive the wave on: kill the front units after a while so reinforcements and the next wave come
    if (G.state === 1 && wt > 0 && wt % 75 === 0) { let k = 0; for (const e of G.enemies) if (e.on && !e.dead && k < 3) { kill(e); k++; } }
    if (G.state === 1 && wt > 240) for (const e of G.enemies) if (e.on && !e.dead) kill(e);
    if (G.state === 0 && G.wave >= waves) break;
  }
  return { sl, stuck: G.stuck, bad: bad.slice(0, 20), nbad: bad.length, toasts, waves: out.map((o, j) => ({ wave: o.wave, plan: o.plan, inf: o.inf, shots: (out[j + 1] ? out[j + 1].i0 : [I.rockets, I.atgms, I.bursts, I.kills]).map((v, k) => v - o.i0[k]), units: o.units.map((u) => ({ ...u, net: u.net.join('/'), track: u.track.slice(0, 14).join(' ') })) })) };
}, { waves, seed, move });
for (const w of res.waves) {
  console.log(`\n=== wave ${w.wave}: ${w.plan} (${w.units.length} vehicles)`);
  console.log(`  infantry: ${w.inf.rpg} RPG team(s), ${w.inf.atgm} ATGM team(s), ${w.inf.dis} dismount(s); peak ${w.inf.peak} alive, ${w.inf.dead} dead; rockets/ATGMs/rifle bursts/kills (to the next wave) ${w.shots.join('/')}${w.inf.wall ? '; ' + w.inf.wall + ' inside a wall' : ''}`);
  for (const u of w.units) console.log(`  ${u.type} ${u.role.padEnd(9)} g${u.grp} spawn t+${u.spawnT}s brg ${u.b0}° ${u.d0} m  min ${Math.round(u.dmin)} m  route trail/road ${u.net}  scoot-s ${u.scoots}${u.grazed ? (u.smoked ? '  graze->smoke+reverse' : '  graze->no smoke') : ''}\n      ${u.track}`);
}
console.log('\ntoasts:', res.toasts.filter((m) => /Wave|Contact|More|inbound|diving|Orlan|rocket|Artillery|shot down|Hit by|MINE|RPG|dismount|ATGM launch|team/.test(m)).join('\n        '));
for (const x of res.sl) console.log('  stuck', JSON.stringify(x));
console.log(`\nstuck events: ${res.stuck}; problems: ${res.nbad}`, res.bad);
await browser.close();
console.log(errs || res.nbad ? `FAIL (${errs} errors, ${res.nbad} problems)` : 'ok');
