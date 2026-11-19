// Functional bridges behaviour test (headed GPU Chrome, logic through __sim) on the two arena ski bridges over Holmenkollveien:
// driving under a deck and over it (8 and 15 m/s), into a parapet, a shell fired up into the slab, the sight ranging the deck from 300 m,
// a shot along the road through the underpass hitting a target beyond, line of sight blocked by the deck but open along the road,
// an FPV flying under the deck and crashing into the slab side, the bomber's predicted drop point on the deck; then renders.
// usage: node tools/bridgetest.mjs [outdir] [--port N --path P] [--noshots]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { base, chromeArgs, logAdapter } from './gpu.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots/bridges';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: chromeArgs(['--window-size=1280,860']) });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errs = 0, fails = 0;
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { console.log('[error]', m.text().slice(0, 400)); errs++; } });
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.stack || e).slice(0, 800)); errs++; });
const t0 = Date.now();
await page.goto(`${base}?w=holmenkollen&nohint&nohud&peace&q=high&drs=0&tod=1`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
console.log(`__ready after ${((Date.now() - t0) / 1000).toFixed(2)} s`);
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const ev = (js) => page.evaluate(js);

// page-side helpers: a bridge's frame, a road-following drive, shells put straight into the pool, impacts logged from the sound hook
await ev(`(()=>{ __ui.poll=()=>{}; __R.god=true; const W=__W;
  window.BF=(i)=>{ const B=W.br.list[i], ux=B.u[0], uz=B.u[1];
    return { B, tc:(B.tr[0]+B.tr[1])/2, top:(lu,lv)=>B.y0+B.gu*lu+B.gv*lv, road:(lv)=>B.r0+B.rg*lv, P:(lu,lv)=>[B.c[0]+ux*lu-uz*lv, B.c[1]+uz*lu+ux*lv],
      L:(x,z)=>{ const dx=x-B.c[0], dz=z-B.c[1]; return [dx*ux+dz*uz, dz*ux-dx*uz]; }, yawV:Math.atan2(uz,-ux), yawU:Math.atan2(-ux,-uz) }; }; // forward (-sin yaw, -cos yaw): along +v, along +u
  const wrap=(a)=>Math.atan2(Math.sin(a),Math.cos(a)); window.wrap=wrap;
  window.steerTo=(x,z)=>Math.max(-1,Math.min(1,wrap(Math.atan2(-(x-__veh.x),-(z-__veh.z))-__veh.yaw)*2.5));
  window.BOOMS=[]; const o=__R.sfx; __R.sfx=(n,x,y,z,k)=>{ if(n==='boom') BOOMS.push([x,y,z]); if(o) o(n,x,y,z,k); };
  window.shell=(type,x,y,z,dx,dy,dz,v)=>{ const S=__game.S; let i=0; while(S[i*10+8]>0) i++; const o=i*10, l=v/Math.hypot(dx,dy,dz); S[o]=x; S[o+1]=y; S[o+2]=z; S[o+3]=dx*l; S[o+4]=dy*l; S[o+5]=dz*l; S[o+6]=type; S[o+7]=0; S[o+8]=4; S[o+9]=0; };
  window.calm=()=>{ __R.force=[0,0]; __veh.v=0; __veh.vy=0; __inp.fire=false; __inp.mvX=__inp.mvY=__inp.mvZ=0; __aimAt(); __R.pose=null; __cam.mode=0; };
})()`);

const ONLY = process.argv.includes('--shotsonly');
const NB = await ev('__W.br.n');
if (!ONLY) for (let site = 0; site < NB; site++) {
  const S = `S${site + 1}`;
  const info = await ev(`(()=>{ const F=BF(${site}); return { name:F.B.name, hl:F.B.hl, hw:F.B.hw, tr:F.B.tr, clr:F.B.clr, k:F.B.k||0, blk:!!F.B.blk, lv0:${site} === 0 ? 11.5 : F.B.k === 2 ? F.B.rv || 0 : 0 }; })()`);
  if (await ev(`(()=>{ const B=BF(${site}).B; return Math.max(Math.abs(B.c[0]), Math.abs(B.c[1])) > __W.PLAY - 30; })()`)) { console.log(`--- ${S}: ${info.name}: outside the playable area (the tank cannot get there), not driven`); continue; }
  const K = info.k, UND = ['the road', 'the road', 'the rail bed'][K], OVR = ['the over-route', 'the track', 'the road'][K];
  if (info.blk) { // a blocked crossing: the height barrier stops a tank at the face; the deck carries the metro on through
    const rb = await ev(`(()=>{ calm(); const F=BF(${site}), B=F.B, [x,z]=F.P(F.tc,-B.hw-16); __tp(x,z,F.yawV); __sim(1/60,20); for (let i=0;i<60*8;i++){ const [lu,lv]=F.L(__veh.x,__veh.z), [ax,az]=F.P(F.tc, lv+14); __R.force=[1, steerTo(ax,az)]; __sim(1/60,1); }
      const q=F.L(__veh.x,__veh.z); __R.force=[0,0]; return { lv:+q[1].toFixed(2), face:-B.hw, v:+__veh.v.toFixed(2), clr:B.clr }; })()`);
    console.log(`--- ${S}: ${info.name} (blocked, clearance ${info.clr} m)`);
    check(`${S} blocked crossing: the height barrier stops the tank in front of the face`, rb.lv < rb.face - 0.5 && Math.abs(rb.v) < 1, rb);
  }
  else console.log(`--- ${S}: ${info.name} (k ${K}, slab ${(2 * info.hl).toFixed(1)} x ${(2 * info.hw).toFixed(1)} m, trench ${info.tr.join('..')}, clearance ${info.clr} m)`);
  // 1. drive the under-route through under the deck
  let r = info.blk ? null : await ev(`(()=>{ calm(); const F=BF(${site}), B=F.B, [x,z]=F.P(F.tc,-B.hw-(${site} < 2 ? 28 : 14)); __tp(x,z,F.yawV); __sim(1/60,20);
    let dist=0, px=__veh.x, pz=__veh.z, minV=99, worst=0, n=0, deck=0, lvMax=-1e9;
    for (let i=0;i<60*16;i++){ const [lu,lv]=F.L(__veh.x,__veh.z), [ax,az]=F.P(F.tc, lv+14); __R.force=[1, steerTo(ax,az)]; __sim(1/60,1);
      dist+=Math.hypot(__veh.x-px,__veh.z-pz); px=__veh.x; pz=__veh.z; const q=F.L(__veh.x,__veh.z); lvMax=Math.max(lvMax,q[1]);
      if (i>150) minV=Math.min(minV,__veh.v); if (Math.abs(q[1])<=B.hw) { worst=Math.max(worst,Math.abs(__veh.y-F.road(q[1]))); n++; if(__veh.deck) deck++; }
      if (q[1]>B.hw+${site === 0 ? 45 : site === 1 ? 22 : 12}) break; }
    return { dist:+dist.toFixed(1), minV:+minV.toFixed(1), worstDev:+worst.toFixed(3), under:n, deckFrames:deck, lvEnd:+lvMax.toFixed(1) }; })()`);
  if (r) check(`${S} drive ${UND} through under the deck (hull within 0.3 m of it, no stop)`, r.worstDev < 0.3 && r.minV > 3 && r.under > 20 && r.deckFrames === 0 && (site === 0 ? r.dist > 80 : site === 1 ? r.dist > 55 : r.dist > 2 * info.hw + 20), r);
  // 2. drive across the deck along the over-route at 8 and 15 m/s (site 1 on trail 14's line; site 2 has no mapped route, the ramps at both ends)
  for (const sp of [8, 15]) {
    r = await ev(`(()=>{ calm(); const F=BF(${site}), B=F.B, lv0=${info.lv0}, [x,z]=F.P(B.hl+24, lv0); __tp(x,z,F.yawU+Math.PI); __sim(1/60,20);
      let worst=0, low=0, n=0, air=0, deck=0;
      for (let i=0;i<60*12;i++){ const [lu,lv]=F.L(__veh.x,__veh.z), [ax,az]=F.P(lu-14, lv0); __veh.v=${sp}; __R.force=[1, steerTo(ax,az)]; __sim(1/60,1);
        const q=F.L(__veh.x,__veh.z); if (Math.abs(q[0])<=B.hl-1.5 && Math.abs(q[1])<=B.hw-2) { const d=__veh.y-F.top(q[0],q[1]); if (!__veh.air) worst=Math.max(worst,Math.abs(d)); low=Math.min(low,d); n++; if(__veh.air) air++; if(__veh.deck || Math.abs(q[0])>B.hl-3.5) deck++; }
        if (q[0]<-B.hl-12) break; }
      const q=F.L(__veh.x,__veh.z); return { speed:${sp}, onSlab:n, worstDev:+worst.toFixed(3), lowest:+low.toFixed(3), airFrames:air, deckFrames:deck, luEnd:+q[0].toFixed(1) }; })()`);
    check(`${S} drive ${OVR} across the deck at ${sp} m/s (within 0.3 m of the deck top, never 1 m below)`, r.onSlab > 20 && r.worstDev < 0.3 && r.lowest > -1 && (sp > 8 || r.airFrames < r.onSlab * 0.3) && r.luEnd < -info.hl - 5 && r.deckFrames >= r.onSlab - 2, r); // (worst over the frames on the ground: at 15 m/s the lidar's approach ramps throw the tank briefly, as any crest does)
  }
  // 3. along the deck into a parapet (decks at least 11 m wide: a tank cannot turn across a narrower one)
  if (info.hw >= 5.5) r = await ev(`(()=>{ calm(); const F=BF(${site}), B=F.B, [x,z]=F.P(F.tc, Math.max(-B.hw+3.5, B.hw-12)); __tp(x,z,F.yawV,true); __sim(1/60,10); __R.force=[1,0]; __sim(1/60,60*7);
    const [lu,lv]=F.L(__veh.x,__veh.z), v=__veh.v; __R.force=[0,0]; return { v:+v.toFixed(2), lv:+lv.toFixed(2), hw:B.hw, dev:+(__veh.y-F.top(lu,lv)).toFixed(3), deck:__veh.deck }; })()`);
  if (info.hw >= 5.5) check(`${S} drive along the deck into a parapet (stopped, still on top)`, Math.abs(r.v) < 1 && r.lv < r.hw - 3.4 && r.lv > r.hw - 5 && Math.abs(r.dev) < 0.3 && r.deck, r);
  // 4. a shell fired upward from under the deck hits the slab
  r = await ev(`(()=>{ calm(); const F=BF(${site}), B=F.B, [x,z]=F.P(F.tc,-B.hw*0.5); __tp(x,z,F.yawV); __sim(1/60,10); BOOMS.length=0;
    const y=F.road(-B.hw*0.5)+2.6, v=[B.u[1]*-1, 0, B.u[0]]; shell(0, x, y, z, -B.u[1], 0.55, B.u[0], 1650); __sim(1/60,30);
    const b=BOOMS[0]; if(!b) return { booms:0 }; const [lu,lv]=F.L(b[0],b[2]); return { booms:BOOMS.length, y:+b[1].toFixed(2), slabBottom:+(F.top(lu,lv)-B.th).toFixed(2), lu:+lu.toFixed(1), lv:+lv.toFixed(1) }; })()`);
  check(`${S} a shell fired upward from under the deck bursts on the slab`, r.booms >= 1 && Math.abs(r.y - r.slabBottom) < 0.35, r);
  // 5. line of sight: from above the deck to a tank under it blocked; along the road open
  r = await ev(`(()=>{ const F=BF(${site}), B=F.B, [x,z]=F.P(F.tc,0), y=F.road(0)+1.6, [ox,oz]=F.P(F.tc+3,1), [rx,rz]=F.P(F.tc,-B.hw-60);
    return { fromAbove:+__game.vis(ox,F.top(F.tc+3,1)+15,oz,x,y,z).toFixed(3), alongRoad:+__game.vis(rx,F.road(-B.hw-60)+2.4,rz,x,y,z).toFixed(3) }; })()`);
  check(`${S} line of sight: from above the deck to a tank under it 0` + (site < 2 ? ', along the road > 0' : ''), r.fromAbove === 0 && (site >= 2 || r.alongRoad > 0), r);
  // 6. the bomber's predicted drop point over the deck is on the deck
  r = await ev(`(()=>{ calm(); const F=BF(${site}), B=F.B, [x,z]=F.P(F.tc,-B.hw-25); __tp(x,z,F.yawV); __sim(1/60,5); const g=__game; g.dn[1]=2; g.droneType(1); g.droneKey(); const D=g.drone;
    const [dx,dz]=F.P(F.tc,2); Object.assign(D,{x:dx,z:dz,y:F.top(F.tc,2)+28,vx:0,vy:0,vz:0,climb:0}); __sim(1/60,6); const res={ on:D.on, iok:D.iok, iy:+D.iy.toFixed(2), top:+F.top(...F.L(D.ix,D.iz)).toFixed(2), road:+F.road(F.L(D.ix,D.iz)[1]).toFixed(2) }; g.droneKey(); __sim(1/60,2); return res; })()`);
  check(`${S} the bomber's predicted drop point over the deck is at deck height`, r.on && r.iok && Math.abs(r.iy - r.top) < 0.3, r);
}

const F1 = 'BF(0)';
let r;
if (!ONLY) {
// 7. the sight ranges the deck, not the road below, aimed at it from 300 m (the best open bearing)
r = await ev(`(()=>{ calm(); const F=${F1}, B=F.B, [tx,tz]=F.P(F.tc,0), ty=F.top(F.tc,0)+0.05; let best=null;
  for (let a=0;a<360;a+=5){ const x=tx+Math.sin(a*Math.PI/180)*300, z=tz-Math.cos(a*Math.PI/180)*300, y=__W.heightAt(x,z)+2.0; const v=Math.min(__game.vis(x,y,z,tx,ty+0.3,tz), __game.vis(x,y+0.6,z,tx,ty+0.3,tz)); const el=Math.atan2(y-ty,300);
    let clear=true; for (let t=4;t<40;t+=2){ const f=t/300; if (y+(ty-y)*f < __W.heightAt(x+(tx-x)*f, z+(tz-z)*f)+1.2) clear=false; } // no crest right in front of the tank
    if (v>0.5 && clear && __W.br.id(x,z,30)<0 && (!best || el>best.el)) best={x,z,a,el,v}; }
  if (!best) return { found:false }; __tp(best.x,best.z,Math.atan2(-(tx-best.x),-(tz-best.z))); __cam.mode=1; __sim(1/60,30); __aimAt(tx,ty,tz); __sim(1/60,60);
  const A=__aimS, [lu,lv]=F.L(A.x,A.z); return { found:true, bearing:best.a, range:+A.range.toFixed(1), y:+A.y.toFixed(2), top:+F.top(lu,lv).toFixed(2), road:+F.road(lv).toFixed(2), lu:+lu.toFixed(1), lv:+lv.toFixed(1), elev:+(best.el*57.3).toFixed(1) }; })()`);
check('S1 the sight ranges the deck (not the road below) from 300 m', r.found && Math.abs(r.y - r.top) < 0.5 && r.range > 280 && r.range < 320, r);
// 8. a horizontal shot along the road through the underpass hits a target beyond it
r = await ev(`(()=>{ calm(); const F=${F1}, B=F.B, g=__game; for (const e of g.enemies) e.on=false; const [x,z]=F.P(F.tc,-B.hw-30); __tp(x,z,F.yawV); __sim(1/60,10);
  g.spawn(0,0); const e=g.enemies.filter((q)=>q.on).pop(); const [ex,ez]=F.P(F.tc,B.hw+22); Object.assign(e,{x:ex,z:ez,y:__W.heightAt(ex,ez),yaw:F.yawV,path:-1,immob:true,hp:400}); __sim(1/60,5);
  __cam.mode=1; g.ammo(0); __sim(1/60,60*7); __aimAt(e.x,e.y+1.2,e.z); __sim(1/60,200); BOOMS.length=0; const hp0=e.hp; __inp.fire=true; __sim(1/60,3); __inp.fire=false; __sim(1/60,40);
  const b=BOOMS[0], q=b?F.L(b[0],b[2]):[0,0]; const res={ hp0, hp:+e.hp.toFixed(0), range:+__aimS.range.toFixed(1), booms:BOOMS.length, boomLv:+q[1].toFixed(1), farFace:B.hw }; e.on=false; __cam.mode=0; return res; })()`);
check('S1 a shot along the road through the underpass hits a target beyond it', r.hp < r.hp0 && r.boomLv > r.farFace, r);
// 9. an FPV flies under the deck, then into the slab side
r = await ev(`(()=>{ calm(); const F=${F1}, B=F.B, g=__game, [x,z]=F.P(F.tc,-B.hw-40); __tp(x,z,F.yawV); __sim(1/60,5); g.dn[0]=5; g.droneType(0); g.droneKey(); const D=g.drone;
  const [dx,dz]=F.P(F.tc,-B.hw-12); Object.assign(D,{x:dx,z:dz,y:F.road(-B.hw-12)+2.2,vx:0,vy:0,vz:0,yaw:F.yawV,pitch:Math.atan(B.rg)+0.012}); __inp.mvZ=1; let lvMax=-1e9, ok=true;
  for (let i=0;i<60*4 && D.on;i++){ __sim(1/60,1); const q=F.L(D.x,D.z); lvMax=Math.max(lvMax,q[1]); if (q[1]>B.hw+6) break; }
  const under={ on:D.on, lvMax:+lvMax.toFixed(1), y:+D.y.toFixed(1), road:+F.road(0).toFixed(1), slabBottom:+(F.top(F.tc,0)-B.th).toFixed(1) };
  const [sx,sz]=F.P(F.tc+4,-B.hw-12); Object.assign(D,{x:sx,z:sz,y:F.top(F.tc+4,-B.hw)-B.th*0.5,vx:0,vy:0,vz:0,yaw:F.yawV,pitch:0}); BOOMS.length=0;
  for (let i=0;i<60*4 && D.on;i++) __sim(1/60,1); const q=F.L(D.bx,D.bz); __inp.mvZ=0; __sim(1/60,300);
  return { under, crash:{ on:D.on, booms:BOOMS.length, lv:+q[1].toFixed(2), face:-B.hw, y:+D.by.toFixed(2) } }; })()`);
check('S1 an FPV flies under the deck and out the far side', r.under.on && r.under.lvMax > 18, r.under);
// 9b. a bomber rising slowly under the deck crashes into the slab and is never lifted onto the deck (groundAt accepts a querier up to STEP below the top)
{ const q = await ev(`(()=>{ calm(); const F=${F1}, B=F.B, g=__game, [x,z]=F.P(F.tc,-B.hw-40); __tp(x,z,F.yawV); __sim(1/60,5); g.dn[1]=2; g.droneType(1); g.droneKey(); const D=g.drone;
  const [dx,dz]=F.P(F.tc,0), top=F.top(F.tc,0); Object.assign(D,{x:dx,z:dz,y:F.road(0)+2.2,vx:0,vy:0,vz:0,climb:0}); __inp.mvY=1; let maxY=-1e9, n=0;
  for (let i=0;i<60*4 && D.on;i++){ __sim(1/60,1); if (D.on) { maxY=Math.max(maxY,D.y); n++; } } __inp.mvY=0; __sim(1/60,300);
  return { on:D.on, frames:n, maxY:+maxY.toFixed(2), slabBottom:+(top-B.th).toFixed(2), top:+top.toFixed(2) }; })()`);
  check('S1 a drone rising under the deck crashes into the slab, not onto the deck', !q.on && q.frames > 10 && q.maxY < q.slabBottom + 0.05, q); }
check('S1 an FPV flown at the slab side crashes into it', !r.crash.on && r.crash.booms >= 1 && r.crash.lv < r.crash.face + 0.5 && r.crash.lv > r.crash.face - 3, r.crash);
// 10. no drone launch under a deck
r = await ev(`(()=>{ calm(); const F=${F1}, B=F.B, g=__game, [x,z]=F.P(F.tc,0); __tp(x,z,F.yawV); __sim(1/60,5); g.dn[0]=5; g.droneType(0); const n=g.dn[0]; g.droneKey(); const on=g.drone.on; if(on) g.droneKey(); return { launched:on, stock:g.dn[0], before:n }; })()`);
check('S1 no drone launch under the deck', !r.launched && r.stock === r.before, r);
// 11. the commander camera under the deck stays under the slab
r = await ev(`(()=>{ calm(); const F=${F1}, B=F.B, [x,z]=F.P(F.tc,-4); __tp(x,z,F.yawV+0.6); __aimS.pitch=-0.2; __step(1/60,20); const ov=__W.br.over(__veh.x,__veh.z,__veh.y+1); return { camY:+__cam.y.toFixed(2), ceiling:+ov.toFixed(2), inSolid:__W.br.inSolid(__cam.x,__cam.y,__cam.z), ground:+__W.groundAt(__cam.x,__cam.z,__veh.y+1).toFixed(2) }; })()`);
check('S1 the commander camera under the deck stays between the road and the slab', r.camY < r.ceiling && r.camY > r.ground + 0.3 && r.inSolid < 0, r);

}

// ---- milestone 2: enemies, infantry, mines and particles on two levels ----
if (!ONLY) {
  // 12. a BTR routed along Holmenkollveien drives through under both decks
  r = await ev(`(()=>{ calm(); const g=__game, F1=BF(0), F2=BF(1); for (const e of g.enemies) e.on=false; const st0=g.stuck;
    const [rx,rz]=F1.P(F1.tc,0); let best=1e9, ri=-1, pi=0; __W.roads.forEach((t,k)=>{ for(let i=0;i<t.n;i++){ const d=Math.hypot(t.pts[i*2]-rx,t.pts[i*2+1]-rz); if(d<best){best=d;ri=k;pi=i;} } });
    const t=__W.roads[ri], q2=F1.L(t.pts[Math.min(t.n-1,pi+20)*2], t.pts[Math.min(t.n-1,pi+20)*2+1]), dir=q2[1]>0?1:-1, ia=Math.max(0,Math.min(t.n-1,pi-dir*45)), ib=Math.max(0,Math.min(t.n-1,pi+dir*170));
    __tp(t.pts[ib*2], t.pts[ib*2+1], 0); __sim(1/60,5); g.spawn(3,0); const e=g.enemies.filter((q)=>q.on).pop(); Object.assign(e,{x:t.pts[ia*2], z:t.pts[ia*2+1], y:__W.heightAt(t.pts[ia*2], t.pts[ia*2+1]), path:ri, net:1, pi:ia, dir, jn:0, evalT:1e9, hold:5, role:0, yaw:Math.atan2(-(t.pts[(ia+dir)*2]-t.pts[ia*2]),-(t.pts[(ia+dir)*2+1]-t.pts[ia*2+1]))});
    const S=[{F:F1,lo:1e9,hi:-1e9,worst:0,n:0},{F:F2,lo:1e9,hi:-1e9,worst:0,n:0}];
    for (let i=0;i<60*70;i++){ e.evalT=1e9; e.hold=5; e.see=0; e.known=0; __sim(1/60,1); for (const s of S){ const [lu,lv]=s.F.L(e.x,e.z); if (lu>s.F.B.tr[0]-3 && lu<s.F.B.tr[1]+3 && Math.abs(lv)<s.F.B.hw+25){ s.lo=Math.min(s.lo,lv*dir); s.hi=Math.max(s.hi,lv*dir); if (Math.abs(lv)<=s.F.B.hw){ s.worst=Math.max(s.worst,Math.abs(e.y-s.F.road(lv))); s.n++; } } }
      if (S[1].hi > S[1].F.B.hw+15) break; }
    const res={ stuck:g.stuck-st0, s1:{from:+S[0].lo.toFixed(0),to:+S[0].hi.toFixed(0),hw:S[0].F.B.hw,worst:+S[0].worst.toFixed(2),under:S[0].n}, s2:{from:+S[1].lo.toFixed(0),to:+S[1].hi.toFixed(0),hw:S[1].F.B.hw,worst:+S[1].worst.toFixed(2),under:S[1].n}, end:[e.x|0,e.z|0] }; e.on=false; return res; })()`);
  check('M2 a BTR routed along Holmenkollveien drives through under both decks (within 0.5 m of the road, no stuck event)', r.stuck === 0 && r.s1.from < -r.s1.hw && r.s1.to > r.s1.hw && r.s2.from < -r.s2.hw && r.s2.to > r.s2.hw && r.s1.worst < 0.5 && r.s2.worst < 0.5 && r.s1.under > 10 && r.s2.under > 10, r);
  // 13. a T-72 sent along trail 14 rides over the deck
  r = await ev(`(()=>{ calm(); const g=__game, F=BF(0), B=F.B; for (const e of g.enemies) e.on=false; const [cx,cz]=F.P(F.tc,11.5); let best=1e9, ti=-1, pi=0; __W.trails.forEach((t,k)=>{ for(let i=0;i<t.n;i++){ const d=Math.hypot(t.pts[i*2]-cx,t.pts[i*2+1]-cz); if(d<best){best=d;ti=k;pi=i;} } });
    const t=__W.trails[ti]; let i0=pi; while (i0>0 && Math.abs(F.L(t.pts[i0*2],t.pts[i0*2+1])[0])<B.hl+22) i0--; let i1=pi; while (i1<t.n-1 && Math.abs(F.L(t.pts[i1*2],t.pts[i1*2+1])[0])<B.hl+22) i1++;
    __tp(F.P(F.tc,-B.hw-200)[0], F.P(F.tc,-B.hw-200)[1], 0); __sim(1/60,5); g.spawn(0,0); const e=g.enemies.filter((q)=>q.on).pop(); const x0=t.pts[i0*2], z0=t.pts[i0*2+1];
    Object.assign(e,{x:x0,z:z0,y:__W.heightAt(x0,z0),path:ti,net:0,pi:i0,dir:1,jn:0,evalT:1e9,hold:5,role:0,yaw:Math.atan2(-(t.pts[(i0+1)*2]-x0),-(t.pts[(i0+1)*2+1]-z0))});
    let n=0, worst=0, low=0, luMin=1e9, luMax=-1e9; const st0=g.stuck;
    for (let i=0;i<60*40;i++){ e.evalT=1e9; e.hold=5; e.see=0; e.known=0; __sim(1/60,1); const [lu,lv]=F.L(e.x,e.z); luMin=Math.min(luMin,lu); luMax=Math.max(luMax,lu);
      if (Math.abs(lu)<B.hl-3 && Math.abs(lv)<B.hw-2){ const d=e.y-F.top(lu,lv); worst=Math.max(worst,Math.abs(d)); low=Math.min(low,d); n++; } if (e.path<0 && n>0) break; }
    const res={ trail:ti, onDeck:n, worst:+worst.toFixed(2), lowest:+low.toFixed(2), luMin:+luMin.toFixed(0), luMax:+luMax.toFixed(0), hl:B.hl, stuck:g.stuck-st0 }; e.on=false; return res; })()`);
  check('M2 a T-72 sent along trail 14 rides over the deck', r.onDeck > 30 && r.worst < 0.5 && r.lowest > -1 && r.luMin < -r.hl && r.luMax > r.hl, r);
  // 14. a soldier walked across the deck stays on it
  r = await ev(`(()=>{ calm(); const g=__game, I=g.inf, F=BF(0), B=F.B, [fx,fz]=F.P(F.tc,-B.hw-120); __tp(fx,fz,0); __sim(1/60,5); const [x0,z0]=F.P(B.hl+6,6), [x1,z1]=F.P(-B.hl-6,6);
    const i=g.infSpawn('rifle',x0,z0); I.d[i*8+1]=__W.groundAt(x0,z0,1e5); I.mode[i]=3; I.tx[i]=x1; I.tz[i]=z1; I.mt[i]=0; let n=0, worst=0, low=0, luMin=1e9;
    for (let k=0;k<60*40;k++){ I.mt[i]=0; __sim(1/60,1); const x=I.d[i*8], z=I.d[i*8+2], [lu,lv]=F.L(x,z); luMin=Math.min(luMin,lu); if (Math.abs(lu)<B.hl-3 && Math.abs(lv)<B.hw-1){ const d=I.d[i*8+1]-F.top(lu,lv); worst=Math.max(worst,Math.abs(d)); low=Math.min(low,d); n++; } if (I.mode[i]===2) break; }
    const res={ onDeck:n, worst:+worst.toFixed(3), lowest:+low.toFixed(3), luMin:+luMin.toFixed(1), hl:B.hl, alive:I.d[i*8+7] }; I.reset(); return res; })()`);
  check('M2 a soldier walked across the deck stays on it', r.onDeck > 30 && r.worst < 0.1 && r.alive === 1 && r.luMin < -r.hl, r);
  // 15. an explosion on the deck leaves its chunks on the deck (none falls through to the road)
  r = await ev(`(()=>{ calm(); const F=BF(0), B=F.B, P=__parts, [x,z]=F.P(F.tc,4), y=F.top(F.tc,4), [fx,fz]=F.P(F.tc,-B.hw-60); __tp(fx,fz,0); __sim(1/60,60*30); shell(2, x, y+6, z, 0, -1, 0.001, 300); let below=0, live=0, maxN=0;
    for (let k=0;k<60*3;k++){ __sim(1/60,1); let n=0; for (let i=0;i<P.max;i++){ const o=i*12; if (P.s[o+6]<=0 || P.s[o+10]!==0) continue; const [lu,lv]=F.L(P.s[o],P.s[o+2]); if (Math.abs(lu)>B.hl-1 || Math.abs(lv)>B.hw-1) continue; n++; if (P.s[o+1] < F.top(lu,lv)-0.3) below++; } maxN=Math.max(maxN,n); }
    return { chunksOverDeck:maxN, belowDeckFrames:below }; })()`);
  check('M2 an explosion on the deck leaves its chunks on the deck', r.chunksOverDeck > 20 && r.belowDeckFrames === 0, r);
  // 16. a mine on the road under the deck is not set off by the tank driving over it on the deck; the same tank on the road does
  r = await ev(`(()=>{ calm(); const M=__game.mines, F=BF(0), B=F.B; M.s.fill(0); const [mx,mz]=F.P(F.tc,0); const k=M.at(mx,mz,1,0); __sim(1/60,150);
    const [x,z]=F.P(F.tc,-12); __tp(x,z,F.yawV,true); __sim(1/60,10); const y0=__veh.y; __R.force=[1,0]; __sim(1/60,60*5); const onDeck={ armed:M.s[k]===1, y:+y0.toFixed(1), mineY:+M.y[k].toFixed(1) };
    calm(); __tp(x,z,F.yawV); __sim(1/60,10); __R.force=[1,0]; __sim(1/60,60*5); const under={ armed:M.s[k]===1, hp:+__veh.hp.toFixed(0) }; calm(); __veh.hp=100; __veh.immob=0; M.s.fill(0); return { onDeck, under }; })()`);
  check('M2 a mine on the road under the deck: not set off from the deck, set off on the road', r.onDeck.armed && !r.under.armed, r);
}
// renders
if (!process.argv.includes('--noshots')) {
  const shot = async (name, js, n = 30) => { await ev(js); await ev(`__step(1/60,${n})`); await page.waitForTimeout(80); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', `${out}/${name}.png`); };
  await ev('calm(); __R.god=true; for (const e of __game.enemies) e.on=false; __sim(1/60, 60*30)'); // let the smoke and dust of the tests clear
  const P1 = `const F=BF(0), B=F.B;`;
  await shot('1-approach-road', `(()=>{ ${P1} const [x,z]=F.P(F.tc,-B.hw-40); __tp(x,z,F.yawV); __cam.mode=0; __aimS.pitch=0.02; __cam.dist=12; })()`, 60);
  await shot('2-under-commander', `(()=>{ ${P1} const [x,z]=F.P(F.tc,-B.hw+8); __tp(x,z,F.yawV); __cam.mode=0; __aimS.pitch=0.0; __cam.dist=10; })()`, 60);
  await shot('3-under-gunner', `(()=>{ ${P1} const [x,z]=F.P(F.tc,-B.hw-6); __tp(x,z,F.yawV); __cam.mode=1; __aimS.pitch=0.0; })()`, 60);
  await shot('4-on-top', `(()=>{ ${P1} const [x,z]=F.P(F.tc,11.5); __tp(x,z,F.yawU+Math.PI,true); __cam.mode=0; __aimS.pitch=-0.05; __cam.dist=14; })()`, 60);
  await shot('5-side', `(()=>{ __cam.mode=0; ${P1} const [x,z]=F.P(F.tc+4,-B.hw-34), [tx,tz]=F.P(F.tc+2,0); __R.pose=[x, F.road(-B.hw-34)+9, z, Math.atan2(-(tx-x),-(tz-z)), -0.12]; })()`);
  await shot('6-site2', `(()=>{ const F=BF(1), B=F.B, [x,z]=F.P(F.tc-3,B.hw+30), [tx,tz]=F.P(F.tc,0); __R.pose=[x, F.road(B.hw+30)+4, z, Math.atan2(-(tx-x),-(tz-z)), -0.05]; })()`);
  await shot('7-night', `(()=>{ __R.pose=null; __tod(4); ${P1} const [x,z]=F.P(F.tc,-B.hw-22); __tp(x,z,F.yawV); __cam.mode=0; __aimS.pitch=0.02; __cam.dist=12; })()`, 90);
  await shot('8-thermal', `(()=>{ __tod(1); ${P1} const [x,z]=F.P(F.tc,-B.hw-60); __tp(x,z,F.yawV); __cam.mode=1; __aimS.pitch=0.01; __R.therm=1; })()`, 90);
  await ev('__R.therm=0; __cam.mode=0; __R.pose=null');
  // the other crossings: by name; V(lu, lv from the trench centre, eye height over the ground; target) with __look
  await ev(`window.V=(name,lu,lv,eh,tlu,tlv,th)=>{ const i=__W.br.list.findIndex((b)=>b.name===name); const F=BF(i), [x,z]=F.P(F.tc+lu,lv), [tx,tz]=F.P(F.tc+tlu,tlv); __tp(x+400,z+400,0); __look(x,eh,z,tx,th,tz); }`);
  const V = [['b1-ovre-road', 'Holmenkollbanen over Øvreseterveien', 0, -16, 2.4, 0, 0, 3], ['b1-ovre-side', 'Holmenkollbanen over Øvreseterveien', 12, 19, 9, 0, 0, 2], ['b1-ovre-track', 'Holmenkollbanen over Øvreseterveien', 40, 0, 3.2, 0, 0, 1],
    ['b2-tomm-railbed', 'Tomm Murstadbakken over Holmenkollbanen', 0, -30, 2.5, 0, 0, 3], ['b2-tomm-road', 'Tomm Murstadbakken over Holmenkollbanen', 24, 12, 7, 0, 0, 1],
    ['b3-lille-road', 'Holmenkollbanen over Lillevannsveien', 0, -22, 2.4, 0, 0, 3], ['b4-hefty-railbed', 'The Heftyebakken track over Holmenkollbanen', 0, -30, 2.5, 0, 0, 3], ['b5-blocked-track', 'track', 0, -14, 2.2, 0, 0, 2]];
  for (const [f, n, a, c, eh, tl, tv, th] of V) await shot(f, `V(${JSON.stringify(n)},${a},${c},${eh},${tl},${tv},${th})`, 40);
}
check('no page errors', errs === 0, errs);
console.log(fails ? `${fails} FAILED` : 'all bridge tests passed');
await browser.close();
process.exit(fails ? 1 : 0);
