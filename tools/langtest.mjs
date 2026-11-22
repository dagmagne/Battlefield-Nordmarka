// Language (src/lang.js) in the browser: Norwegian start screen, briefing, HUD pills, messages, menu and help on desktop and on a
// phone (852x393, touch); nothing overflows its button; English is unchanged with ?lang=en; the menu row switches and reloads;
// a long message stays longer than a short one and a second message waits for the first. Renders in shots/lang/.
// usage: node tools/langtest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/lang';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1300,860']) });
let errs = 0, fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const hook = (p) => { p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 300)); errs++; } }); p.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 600)); errs++; }); };
// buttons and pills whose text is wider than the element
const OVER = `[...document.querySelectorAll('.btn, .st, .seg button, #pick button b, .card .go')].filter((e)=>e.offsetParent&&e.scrollWidth>e.clientWidth+1).map((e)=>(e.id||e.textContent.trim().slice(0,18))+':'+e.scrollWidth+'>'+e.clientWidth)`;
for (const [name, vw, vh, q] of [['desk', 1280, 800, ''], ['phone', 852, 393, '&touch']]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: !!q }), p = await ctx.newPage(); hook(p);
  await p.goto(`${base}?lang=no&q=low&drs=0&mute${q}`);
  await p.waitForSelector('#pg0 button', { state: 'visible', timeout: 60000 }); await p.waitForTimeout(400);
  let r = await p.evaluate(`({t:[...document.querySelectorAll('#pg0 b')].map((b)=>b.textContent), lang:document.documentElement.lang, over:${OVER}})`);
  await p.screenshot({ path: `${out}/pick-${name}.png` });
  check(`${name}: the start screen is Norwegian`, r.t.join('|') === 'Oppdrag|Forsvar|Fri kjøring' && r.lang === 'no' && !r.over.length, r);
  { // the language choice on the start screen: both buttons on screen, the current one marked, a click switches with a reload
    const a = await p.evaluate(`(()=>{ const L=document.getElementById('lLang').getBoundingClientRect(), M=document.getElementById('lMu').getBoundingClientRect(), H=document.querySelector('#load h1').getBoundingClientRect(), hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
      return {on:document.querySelector('#lLang .on').dataset.v, vis:L.width>80&&L.left>=0&&L.top>=0, clear:!hit(L,M)&&!hit(L,H)}; })()`);
    await p.evaluate(`history.replaceState(null,'',location.pathname+'?q=low&drs=0&mute${q}')`);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#lLang button[data-v="en"]')]); await p.waitForSelector('#pg0 button', { state: 'visible', timeout: 60000 });
    const en = await p.evaluate(`({t:document.querySelector('#pg0 b').textContent, on:document.querySelector('#lLang .on').dataset.v})`);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#lLang button[data-v="no"]')]); await p.waitForSelector('#pg0 button', { state: 'visible', timeout: 60000 });
    const no = await p.evaluate(`({t:document.querySelector('#pg0 b').textContent, on:document.querySelector('#lLang .on').dataset.v})`);
    check(`${name}: language buttons on the start screen: visible, clear of the title and MUSIC, switch both ways`, a.on === 'no' && a.vis && a.clear && en.t === 'Missions' && en.on === 'en' && no.t === 'Oppdrag' && no.on === 'no', { a, en, no }); }
  await p.click('#pick button[data-go="pg1"]'); await p.waitForTimeout(300);
  r = await p.evaluate(`({t:[...document.querySelectorAll('#pg1 button[data-m] b')].map((b)=>b.textContent), fit:[...document.querySelectorAll('#pg1 button[data-m]')].every((b)=>{ const q=b.getBoundingClientRect(); return q.top>=0&&q.bottom<=innerHeight+1; })})`);
  await p.screenshot({ path: `${out}/missions-${name}.png` });
  check(`${name}: six mission cards in Norwegian, all on screen`, r.t.length === 6 && /Første kontakt/.test(r.t[0]) && /Nattlig gjennombrudd/.test(r.t[5]) && r.fit, r);
  await p.click('#pg1 button[data-m="tower"]'); await p.waitForFunction('window.__ready===true', null, { timeout: 120000 });
  if (name === 'desk') await logAdapter(p);
  r = await p.evaluate(`(()=>{ const h=document.getElementById('help'), was=h.classList.contains('show'); const o={help:was, h1:document.querySelector('#hD b')&&document.querySelector('#hD span').textContent.slice(0,30), t1:document.querySelector('#hT span').textContent.slice(0,30), go:document.getElementById('hGo').textContent}; return o; })()`);
  await p.waitForTimeout(300); await p.screenshot({ path: `${out}/help-${name}.png` });
  check(`${name}: the help is Norwegian`, r.help && r.go === 'Rykk ut' && (/Kjør: gass/.test(r.h1) || /Styrespak/.test(r.t1)), r);
  await p.click('#hGo'); await p.waitForTimeout(400);
  r = await p.evaluate(`({title:document.getElementById('ovT').textContent, go:document.getElementById('ovGo').textContent, text:document.getElementById('ovP').textContent.slice(0,40), over:${OVER}})`);
  await p.screenshot({ path: `${out}/brief-${name}.png` });
  check(`${name}: the briefing card is Norwegian`, r.title === 'Ta tilbake tårnet' && r.go === 'Rykk ut' && /Fienden holder/.test(r.text) && !r.over.length, r);
  await p.click('#ovGo'); await p.waitForTimeout(1500);
  r = await p.evaluate(`({obj:document.getElementById('obj').textContent, wave:document.getElementById('wave').textContent, hull:document.getElementById('sH').textContent, net:document.getElementById('sN').textContent, toast:document.getElementById('toast').textContent, btn:[...document.querySelectorAll('#top .btn')].map((b)=>b.textContent.trim()), keys:document.getElementById('keys').textContent.slice(0,24), over:${OVER}})`);
  await p.screenshot({ path: `${out}/game-${name}.png` });
  check(`${name}: HUD, objective pill, message and buttons are Norwegian and fit`, /Ødelegg garnisonen ved Tryvann · 5 igjen · [\d.]+ k?m (N|NV|NØ)/.test(r.obj) && /^TA TILBAKE TÅRNET 1\/3 · 0 UTSLÅTT/.test(r.wave) && /^SKROG 100$/.test(r.hull) && r.net === 'NETT' && /Ødelegg garnisonen/.test(r.toast) && r.btn.includes('MENY') && !r.over.length, r);
  // menu
  await p.evaluate(`__ui.showMenu(true)`); await p.waitForTimeout(300);
  r = await p.evaluate(`({h:document.querySelector('#menu h2').textContent, rows:[...document.querySelectorAll('#menu .row > span')].map((s)=>s.firstChild.nodeValue.trim()), on:document.querySelector('#mL .on')&&document.querySelector('#mL .on').dataset.v, over:${OVER}})`);
  await p.screenshot({ path: `${out}/menu-${name}.png` });
  check(`${name}: the menu is Norwegian with Norsk marked`, r.h === 'Innstillinger' && r.rows[0] === 'Språk' && r.rows.includes('Trær') && r.on === 'no' && !r.over.length, r);
  await p.evaluate(`__ui.showMenu(false)`);
  if (name === 'desk') {
    // messages: translated, a long one stays longer, the second waits for the first, a warning jumps the queue
    r = await p.evaluate(`(async()=>{ const el=document.getElementById('toast'), up=()=>+getComputedStyle(el).opacity>0.5, nap=(ms)=>new Promise((r)=>setTimeout(r,ms)); const o={};
      await nap(9500); __ui.toast('Smoke!'); o.t1=el.textContent; await nap(2000); o.short2=up(); await nap(1600); o.short36=up();
      __ui.toast('Wave 3 — Pincer: 4 from the north-west, ~600 m · 2 from the east, ~850 m · Mines reported on the roads to the south'); o.long=el.textContent; await nap(5000); o.long5=up(); await nap(5500); o.long105=up();
      __ui.toast('Track repaired'); __ui.toast('Loading HE'); o.q0=el.textContent; await nap(1800); o.q1=el.textContent; await nap(3500);
      __ui.toast('Track repaired'); __ui.toast('ATGM hit!'); o.urgent=el.textContent; return o; })()`);
    check('messages: Norwegian; a short one is gone after 3.6 s, a long one stays over 5 s; the second waits 1.5 s; a warning is shown at once', r.t1 === 'Røyk!' && r.short2 && !r.short36 && /^Bølge 3 — Knipetang: 4 fra nordvest/.test(r.long) && r.long5 && !r.long105 && r.q0 === 'Beltet er reparert' && r.q1 === 'Lader HE' && r.urgent === 'Truffet av panservernrakett!', r);
    // the menu row switches to English with a reload
    await p.evaluate(`__ui.showMenu(true)`); await p.evaluate(`history.replaceState(null,'',location.pathname+'?w=frogner&nohint&peace&q=low&drs=0&mute')`);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#mL button[data-v="en"]')]); await p.waitForFunction('window.__ready===true', null, { timeout: 120000 });
    r = await p.evaluate(`({lang:__api.state().lang, hull:document.getElementById('sH').textContent, stored:localStorage.glang, menu:document.querySelector('#menu h2').textContent, keys:document.getElementById('keys').textContent.slice(0,12)})`);
    check('the menu row switches to English: stored, reloaded, English texts', r.lang === 'en' && r.stored === 'en' && r.hull === 'HULL 100' && r.menu === 'Settings', r);
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${fails ? fails + ' FAILED' : 'all passed'} · ${errs} page errors`);
process.exit(fails || errs ? 1 : 0);
