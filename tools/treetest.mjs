// Trees and vehicles (headed GPU Chrome, logic through __sim): the tank knocks over a small tree it drives into and is stopped by
// a big one; an enemy T-72 does the same; a restart stands the felled trees up again. Saves a render of a felled tree.
// usage: node tools/treetest.mjs [outdir] [--port N --path P]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/trees';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1200,800']) });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errs = 0, fails = 0;
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
await page.goto(`${base}?w=frogner&nohint&peace&q=high&drs=0&tod=1`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);

// helpers: find a lone tree of a given height range on gentle open ground with a clear 25 m run-up, and whether a tree is down
await ev(`(()=>{ __ui.poll=()=>{}; window.T=__W.trees.data; window.down=(k)=>T[k*8+5]-Math.floor(T[k*8+5])>0.001;
  const TT=__W.trees, NC=128, NEAR=32, HALF=2048; // tree cells: 32 m, 128 x 128
  window.near=(x,z,fn)=>{ const cx=Math.floor((x+HALF)/NEAR), cz=Math.floor((z+HALF)/NEAR); for (let j=cz-1;j<=cz+1;j++) for (let i=cx-1;i<=cx+1;i++) { if (i<0||j<0||i>=NC||j>=NC) continue; const nc=j*NC+i, st=TT.nearStart[nc], n=TT.nearCnt[nc*3]+TT.nearCnt[nc*3+1]+TT.nearCnt[nc*3+2]; for (let k=st;k<st+n;k++) fn(k); } };
  window.find=(h0,h1)=>{ const s0=__W.start; for (let rr=40; rr<900; rr+=40) for (let a0=0;a0<6.28;a0+=0.3) { const cx=s0.x+Math.sin(a0)*rr, cz=s0.z+Math.cos(a0)*rr; let res=null;
      near(cx, cz, (k)=>{ if (res) return; const x=T[k*8], z=T[k*8+2], h=T[k*8+3]; if (h<h0||h>h1||down(k)||Math.abs(x)>__W.PLAY-100||Math.abs(z)>__W.PLAY-100) return;
        for (let a=0;a<6.28 && !res;a+=0.785) { const sx=x+Math.sin(a)*25, sz=z+Math.cos(a)*25; let ok=Math.abs(__W.heightAt(sx,sz)-__W.heightAt(x,z))<3;
          for (const f of [0.15,0.35,0.55,0.75,0.95,-0.2,-0.4,-0.6]) { if (!ok) break; const qx=x+(sx-x)*f, qz=z+(sz-z)*f; if (__bld.at(qx,__W.heightAt(qx,qz)+1,qz,3)>=0) ok=false; near(qx,qz,(j)=>{ if (j===k||!ok) return; const dx=T[j*8]-qx, dz=T[j*8+2]-qz; if (dx*dx+dz*dz<16) ok=false; }); }
          if (ok) res={k, x, z, h:+h.toFixed(1), sx, sz}; } });
      if (res) return res; } return null; };
  return 1; })()`);

// 1: the tank knocks over a small tree
let r = await ev(`(()=>{ const t=find(3.6, 6.5); if (!t) return {err:'no small tree'}; window.ST=t; __tp(t.sx, t.sz, Math.atan2(-(t.x-t.sx), -(t.z-t.sz))); __sim(1/60,10); __R.force=[1,0];
  let k=0; for (; k<60*8 && Math.hypot(__veh.x-t.sx,__veh.z-t.sz)<38; k++) __sim(1/60,1); __R.force=null; __sim(1/60,60);
  return {h:t.h, down:down(t.k), passed:Math.round(Math.hypot(__veh.x-t.sx,__veh.z-t.sz)), secs:+(k/60).toFixed(1)}; })()`);
check('the tank drives over a small tree and knocks it down', !r.err && r.down && r.passed > 30, r);
if (!r.err) { await ev(`(()=>{ const t=ST; __look(t.x+6, 2.2, t.z-7, t.x, 0.8, t.z); __step(1/60,4); return 1; })()`); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/felled.png` }); await ev('__R.pose=null'); }

// 2: a big tree stops the tank and stays up
r = await ev(`(()=>{ const t=find(13, 30); if (!t) return {err:'no big tree'}; __tp(t.sx, t.sz, Math.atan2(-(t.x-t.sx), -(t.z-t.sz))); __sim(1/60,10); __R.force=[1,0]; let md=1e9;
  for (let k=0;k<60*8;k++){ __sim(1/60,1); md=Math.min(md, Math.hypot(__veh.x-t.x,__veh.z-t.z)); } __R.force=null; __sim(1/60,30);
  return {h:t.h, down:down(t.k), minDist:+md.toFixed(2), beyond:(__veh.x-t.sx)*(t.x-t.sx)+(__veh.z-t.sz)*(t.z-t.sz) > 25*25+30}; })()`);
check('a big tree stops the tank (it slides round, never through) and stays up', !r.err && !r.down && r.minDist > 1.8, r);

// 3: an enemy T-72 knocks small trees over and is held off by big ones on a run through the forest
r = await ev(`(()=>{ const t=find(3.6, 6.5); if (!t) return {err:'no small tree'}; const G=__game; for (const e of G.enemies) e.on=false; G.spawn(0,0); const e=G.enemies.find((q)=>q.on);
  e.x=t.sx; e.z=t.sz; e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(-(t.x-t.sx), -(t.z-t.sz)); e.path=-1; e.gx=t.x+(t.x-t.sx)*4; e.gz=t.z+(t.z-t.sz)*4; e.hold=0; e.evalT=99; e.noRt=99;
  __tp(e.gx+300, e.gz+300, 0); let inBig=0;
  for (let k=0;k<60*20;k++){ e.gx=t.x+(t.x-t.sx)*4; e.gz=t.z+(t.z-t.sz)*4; __sim(1/60,1); if ((k&15)===0) near(e.x, e.z, (j)=>{ const h=T[j*8+3]; if (h<7||down(j)) return; const dx=T[j*8]-e.x, dz=T[j*8+2]-e.z; if (dx*dx+dz*dz<0.8) inBig++; }); }
  return {downSmall:down(t.k), moved:Math.round(Math.hypot(e.x-t.sx,e.z-t.sz)), inBig, stuck:G.stuck}; })()`);
check('an enemy T-72 knocks a small tree over and never sits inside a big trunk', !r.err && r.downSmall && r.moved > 20 && r.inBig === 0, r);

// 3b (review fix): with the felled-tree restore list full, a small tree stays solid instead of letting the tank through
r = await ev(`(()=>{ const t=find(3.6, 6.5); if (!t) return {err:'no small tree'}; __treesFull(true); __tp(t.sx, t.sz, Math.atan2(-(t.x-t.sx), -(t.z-t.sz))); __sim(1/60,10); __R.force=[1,0]; let md=1e9;
  for (let k=0;k<60*6;k++){ __sim(1/60,1); md=Math.min(md, Math.hypot(__veh.x-t.x,__veh.z-t.z)); } __R.force=null; __treesFull(false);
  return {h:t.h, down:down(t.k), minDist:+md.toFixed(2)}; })()`);
check('with the restore list full, a small tree stays up and solid (no driving through it)', !r.err && !r.down && r.minDist > 1.8, r);

// 4: a restart stands them up again
r = await ev(`(()=>{ __api.restart(); __sim(1/60,5); return {small:down(ST.k)}; })()`);
check('a restart stands the felled trees up again', r.small === false, r);
check('no page errors', errs === 0, errs);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
