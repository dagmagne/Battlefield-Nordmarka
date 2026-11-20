// Look-check renders of the vehicle models: the Leopard, the Tigr, the buggy, the motorcycle (and the other enemy types) staged
// one at a time on the open lake, plus the parked MX3000 metro units at Frognerseteren.
// usage: node tools/vehshots.mjs outdir [--only leo,tigr,buggy,moto,train,t72,bmp,btr] [--tod 1] [--aim] [--q therm=1] [--w 1728 --h 1117 --dpr 1] (+ the GPU tools options)
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
await page.goto(`${base}?w=frogner&nohint&nohud&peace&q=high&drs=0&tod=${tod}${opt('q', '') ? '&' + opt('q', '') : ''}`);
await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }); await logAdapter(page);
const ev = (js) => page.evaluate(js);
const shot = async (name) => { await ev('__step(1/60,4)'); await page.waitForTimeout(120); await page.screenshot({ path: `${out}/${name}.png` }); console.log('ok', `${out}/${name}.png`); };
// [name, bearing from the vehicle's nose (rad, + = its right side), distance in vehicle lengths, eye height in vehicle heights, target height fraction]
const VIEWS = [['fq', 0.65, 1.55, 0.95, 0.45], ['side', Math.PI / 2, 1.5, 0.6, 0.45], ['rq', Math.PI - 0.7, 1.55, 0.95, 0.45], ['front', 0, 1.5, 0.6, 0.45], ['rear', Math.PI, 1.5, 0.7, 0.45],
  ['top', -0.8, 1.35, 2.3, 0.4], ['close', -0.55, 0.85, 0.75, 0.55], ['low', -2.3, 1.2, 0.3, 0.5]];
if (a.includes('--near')) VIEWS.push(['nfq', 0.75, 0.5, 0.75, 0.5], ['nside', Math.PI / 2, 0.55, 0.5, 0.45], ['nrq', Math.PI - 0.8, 0.5, 0.8, 0.5], ['nrear', Math.PI + 0.25, 0.55, 0.6, 0.45], ['nwheel', 1.15, 0.28, 0.3, 0.25], ['nroof', -0.5, 0.45, 1.5, 0.85]); // --near: detail views
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
  // closer looks: [name, bearing, distance (m), eye height (m), target height (m), target shift along the hull (m, + = forward)]
  const NEAR = [['n_fq', 0.6, 7.5, 2.6, 1.3, 0.5], ['n_side', Math.PI / 2, 7.5, 1.5, 1.2, 0], ['n_rq', Math.PI - 0.6, 7.5, 2.8, 1.3, -0.5], ['n_front', 0.12, 7.5, 1.7, 1.3, 2], ['n_rear', Math.PI - 0.1, 7, 1.9, 1.2, -2],
    ['n_gear', 1.25, 4.6, 0.7, 0.6, 1.5], ['n_sprk', Math.PI - 1.0, 4.4, 0.8, 0.7, -2.6], ['n_roof', -0.5, 5.2, 5.2, 2.0, -0.3], ['n_tfront', -0.45, 4.6, 2.5, 2.1, 1.6], ['n_bustle', Math.PI + 0.75, 5.0, 3.0, 2.0, -2.2], ['n_gun', 0.9, 4.5, 2.4, 1.95, 4.2]];
  for (const [vn, br, d, eh, th, sh] of NEAR) {
    await ev(`(()=>{const a=${p[2]}+${br},fx=-Math.sin(${p[2]}),fz=-Math.cos(${p[2]}),tx=${p[0]}+fx*${sh},tz=${p[1]}+fz*${sh};__look(tx-Math.sin(a)*${d},${eh},tz-Math.cos(a)*${d},tx,${th},tz);})()`);
    await shot(`leo_${vn}`);
  }
  await ev('__aim(__veh.yaw+0.9,0.12,0);__sim(1/60,240)'); // turret traversed and the gun up, for the turret sides
  for (const [vn, br, dk, hk, tk] of [['turret', 0.5, 0.95, 1.1, 0.75], ['deck', Math.PI - 0.5, 1.0, 1.35, 0.6]]) {
    await ev(`(()=>{const a=${p[2]}+${br},d=${dk * 7.6 + 1.2};__look(${p[0]}-Math.sin(a)*d,${hk * 2.9},${p[1]}-Math.cos(a)*d,${p[0]},${tk * 2.9},${p[1]});})()`);
    await shot(`leo_${vn}`);
  }
  // what the player sees: commander's view and the gunner sight
  // the mantlet with the gun at full elevation and depression
  for (const [tag, pit] of [['up', 0.4], ['down', -0.3]]) {
    await ev(`__aim(${p[2]},${pit},0);__sim(1/60,200)`); console.log('gun', tag, await ev('__veh.gunPitch.toFixed(3)'));
    await ev(`(()=>{const a=${p[2]}+0.75,fx=-Math.sin(${p[2]}),fz=-Math.cos(${p[2]}),tx=${p[0]}+fx*2.2,tz=${p[1]}+fz*2.2;__look(tx-Math.sin(a)*3.4,2.3,tz-Math.cos(a)*3.4,tx,2.0,tz);})()`);
    await shot('leo_gun_' + tag);
  }
  await ev(`__aim(${p[2]}+0.25,-0.06,0)`); await shot('leo_cmd'); await ev(`__aim(${p[2]},0,0)`);
  // on the bare ice of the lake (no soft snow round the tracks), standing and then driving: the links must follow the loop without gaps
  const q = await ev('(()=>{ __tp(L.x+FX*12, L.z+FZ*12, Math.atan2(-FX,-FZ)+0.5); __sim(1/60,40); return [__veh.x,__veh.z,__veh.yaw]; })()');
  const ICE = [['ice_side', Math.PI / 2, 7.5, 1.3, 1.0, 0], ['ice_gear', 1.3, 3.6, 0.55, 0.5, 2.2], ['ice_sprk', Math.PI - 1.2, 3.6, 0.6, 0.55, -2.6], ['ice_fq', 0.5, 6.5, 1.5, 1.0, 1.5], ['ice_front', 0.05, 6, 1.0, 0.9, 2.5], ['ice_gearL', -1.3, 3.6, 0.55, 0.5, 2.2]];
  const look = async (c, [vn, br, d, eh, th, sh], tag = '') => {
    await ev(`(()=>{const yw=__veh.yaw,a=yw+${br},fx=-Math.sin(yw),fz=-Math.cos(yw),tx=__veh.x+fx*${sh},tz=__veh.z+fz*${sh};__look(tx-Math.sin(a)*${d},${eh},tz-Math.cos(a)*${d},tx,${th},tz);})()`);
    await shot(`leo_${vn}${tag}`);
  };
  for (const v of ICE) await look(q, v);
  for (const [tag, f, n] of [['_fwd1', [1, 0], 100], ['_fwd2', [1, 0], 7], ['_piv', [0, 1], 90], ['_rev', [-1, 0], 120]]) {
    await ev(`(()=>{ __R.force=[${f}]; __sim(1/60,${n}); __R.force=null; })()`);
    await look(q, ICE[1], tag); await look(q, ICE[2], tag); if (tag === '_piv') await look(q, ICE[5], tag);
    console.log('drive', tag, JSON.stringify(await ev('[__veh.v.toFixed(2),__veh.trL.toFixed(2),__veh.trR.toFixed(2)]')));
  }
  await ev(`(()=>{ __R.force=[0,0]; __tp(${p[0]}, ${p[1]}, ${p[2]}); __sim(1/60,60); __R.force=null; })()`); // back off the ice, out of the enemy views
}
const EN = { t72: [0, 7.4, 2.4], bmp: [1, 6.8, 2.2], tigr: [2, 5.8, 2.7], btr: [3, 7.7, 2.6], buggy: [4, 3.5, 1.9], moto: [5, 2.2, 1.5] };
for (const k of Object.keys(EN)) {
  if (!only.includes(k)) continue;
  const [t, L, H] = EN[k];
  const p = await ev(`(()=>{ for (const e of G.enemies) e.on=false; G.spawn(${t},3); const e=G.enemies.find((q)=>q.on&&q.type===${t}); e.x=L.x+FX*25; e.z=L.z+FZ*25; e.y=__W.heightAt(e.x,e.z); e.yaw=Math.atan2(-FX,-FZ)+2.2; e.path=-1; e.immob=true; e.v=0; __sim(1/60,20); return [e.x,e.z,e.yaw]; })()`);
  await ring(k, p[0], p[1], p[2], L, H);
  if (a.includes('--aim')) { // the weapon traversed and elevated, and the wheels rolled on a little
    await ev(`(()=>{ const e=G.enemies.find((q)=>q.on&&q.type===${t}); e.turYaw=1.0; e.gunPitch=0.25; e.trL+=0.4; e.trR+=0.4; const a=${p[2]}+0.3,d=${0.55 * L + 1.2};__look(${p[0]}-Math.sin(a)*d,${0.95 * H},${p[1]}-Math.cos(a)*d,${p[0]},${0.7 * H},${p[1]}); })()`);
    await shot(`${k}_aim`);
    await ev(`(()=>{ const e=G.enemies.find((q)=>q.on&&q.type===${t}); for (let i=0;i<150;i++){ e.known=9; e.see=1; e.v=0; __sim(1/60,1); } })()`);
    for (const [vn, br, dk, hk, tk] of [['aim_fq', 0.65, 1.3, 0.95, 0.5], ['aim_rq', Math.PI - 0.7, 1.3, 0.95, 0.5], ['aim_top', -0.8, 1.2, 2.3, 0.4]]) {
      await ev(`(()=>{const a=${p[2]}+${br},d=${dk * L + 1.2};__look(${p[0]}-Math.sin(a)*d,${hk * H + 0.25},${p[1]}-Math.cos(a)*d,${p[0]},${tk * H},${p[1]});})()`);
      await shot(`${k}_${vn}`);
    }
  }
}
if (only.includes('train')) {
  const T = await ev(`(()=>{ const r=[]; for (const B of __W.bld) if (B.fix && B.boxes && B.boxes.length===3 && B.boxes[0].hd>8 && Math.abs(B.boxes[0].hw-1.6)<0.01) r.push(B.boxes.map((b)=>[b.x,b.z,b.th,b.hd,b.y+0.2])); return r; })()`);
  console.log('trains', JSON.stringify(T).slice(0, 300)); console.log('railStat', JSON.stringify(await ev('__W.railStat')));
  let n = 0;
  for (const tr of T.slice(0, 2)) {
    const [x, z, , , ry] = tr[0], [mx, mz] = tr[1]; n++;
    const ax = (x - mx) / Math.hypot(x - mx, z - mz), az = (z - mz) / Math.hypot(x - mx, z - mz), cab = [x + ax * 9.1, z + az * 9.1]; // along the train towards the cab of car 0, and that cab's nose
    // the nearest platform (to report its height against the car floor, 1.1 m)
    const pl = await ev(`(()=>{ let bd=1e9, r=[0,0,0]; for (const S of __W.rail.st) for (const Q of S.p) { const d=Math.hypot(Q.x-(${mx}),Q.z-(${mz})); if (d<bd) { bd=d; r=[Q.x,Q.z,Q.top]; } } return r; })()`);
    const sg = n === 1 ? 1 : -1, nx = -az * sg, nz = ax * sg; // the open side to look from: the snow bank at Frognerseteren, across the other track at Holmenkollen
    console.log(`train${n}: nearest platform centre top ${(pl[2] - ry).toFixed(2)} m above the rail head at the cab`);
    // [name, eye: along from the nose (+ = ahead of it), sideways (+ = the open side), height above the rail; target: height, along]
    const V = [['fq', 9, 7, 2.6, 2.0, -3], ['fq2', 13, -3.4, 2.4, 2.0, -3], ['front', 11, 0.6, 2.3, 2.0, 0], ['side', -6, 14, 2.4, 1.9, -6], ['close', 4, 4.5, 2.0, 2.0, -1.5], ['long', 22, 9, 4.5, 1.8, -20], ['roof', 6, 8, 7.5, 2.5, -8], ['bogie', -1, 5, 1.0, 0.6, -2.8],
      ['door', -9.1, 6, 2.3, 2.0, -9.1], ['win', -4, 3.6, 2.5, 2.3, -6.5], ['gang', -15, 6, 2.6, 2.0, -18.4], ['face', 5.5, 2.2, 2.0, 2.0, 0], ['under', -7, 6, 0.9, 0.6, -9.1], ['rear', -68, 7, 2.6, 2.0, -55.5], ['plat', -4, -4.5, 2.9, 1.6, -9.5], ['top', -9, 3, 12, 3, -9.1]];
    for (const [vn, da, ds, eh, th, ta] of V) {
      await ev(`(()=>{ const ex=${cab[0] + ax * da + nx * ds}, ey=${ry + eh}, ez=${cab[1] + az * da + nz * ds}, dx=${cab[0] + ax * ta}-ex, dy=${ry + th}-ey, dz=${cab[1] + az * ta}-ez; __R.chase=null; __R.pose=[ex,ey,ez,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz))]; })()`);
      await shot(`train${n}_${vn}`);
    }
  }
}
if (only.includes('train') || only.includes('stations')) { // platforms: the fit against the rail head, and look-checks at stations without a train
  const ST = await ev(`__W.rail.st.map((S)=>({name:S.name,p:S.p.map((Q)=>({x:Q.x,z:Q.z,yaw:Q.yaw,hl:Q.hl,hw:Q.hw,top:Q.top,sl:Q.sl,gap:Q.gap,top0:Q.top0,edge:Q.edge}))}))`);
  for (const S of ST) console.log('platform', S.name.padEnd(16), S.p.map((Q) => `top ${(Q.top - Q.top0 >= 0 ? '+' : '') + (Q.top - Q.top0).toFixed(2)} slope ${(Q.sl * 100).toFixed(1)}% edge-track ${Q.gap.toFixed(2)} len ${(2 * Q.hl).toFixed(0)}`).join(' | '));
  for (const S of ST.filter((S) => /Voksenkollen|Skogen|Besserud|Lillevann/.test(S.name)).slice(0, 3)) { const Q = S.p[0], ax = Math.sin(Q.yaw), az = Math.cos(Q.yaw), bx = Math.cos(Q.yaw) * Q.edge, bz = -Math.sin(Q.yaw) * Q.edge;
    for (const [vn, u, v, eh, tu, tv] of [['a', -Q.hl - 7, Q.hw + 4.5, 2.4, 0, Q.hw - 1], ['b', Q.hl * 0.3, Q.hw + 5, 1.5, -Q.hl * 0.2, Q.hw]]) {
      await ev(`(()=>{ const ex=${Q.x + ax * u + bx * v}, ey=${Q.top + Q.sl * u + eh}, ez=${Q.z + az * u + bz * v}, dx=${Q.x + ax * tu + bx * tv}-ex, dy=${Q.top + Q.sl * tu + 0.3}-ey, dz=${Q.z + az * tu + bz * tv}-ez; __R.chase=null; __R.pose=[ex,ey,ez,Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz))]; })()`);
      await shot(`station_${S.name.replace(/\W/g, '')}_${vn}`); } }
}
await browser.close();
