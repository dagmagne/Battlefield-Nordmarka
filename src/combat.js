// Weapons, projectiles, effects, enemy AI and the wave game.
// Everything is preallocated in initCombat(); update() and its helpers allocate nothing per frame.
import { clamp } from './math.js';
import { tankParts, droneParts, gunMat, LEO, T72, BMP } from './tank.js';
import { cur as todCur } from './tod.js';
import { initMinimap, MAP_M, MAP_PX } from './minimap.js';

export const AMMO = [{ name: 'APFSDS', v: 1650, max: 20 }, { name: 'HEAT-MP', v: 1140, max: 12 }, { name: 'HE', v: 950, max: 10 }];
export const MAXE = 10, MAXG = 760, MAXM = 48; // enemies, glow sprites, mines
// drone types: 0 FPV (one-way shaped charge), 1 bomber (hovers, drops VOG grenades, lands back on the tank to rearm), 2 recon (high, long, quiet, unarmed)
// n per game, battery t (s), top speed v (m/s), radio range r (m), spotting range see (m), how long a sighting stays on the map mark (s), climb after launch (m above ground)
export const DTYPE = [{ name: 'FPV', n: 5, t: 75, v: 26, r: 1500, see: 800, mark: 20, climb: 0 }, { name: 'BOMB', n: 2, t: 120, v: 14, r: 1500, see: 900, mark: 25, climb: 30 }, { name: 'RECON', n: 2, t: 180, v: 18, r: 2200, see: 1500, mark: 40, climb: 110 }];
// grenades per bomber sortie, seconds between drops; a lost contact fades from the map over LOST_T s; NFLD pre-laid minefields enemies know about and drive around
const BOMBS = 3, BOMB_RL = 0.7, LOST_T = 40, NFLD = 6;
// mine damage by shell type (radius in m around a ground impact that sets a mine off): APFSDS, HEAT, HE, MG, 125 mm, 30 mm, smoke, VOG
const MCLR = [1.5, 2.5, 4.5, 0.8, 2, 1, 0, 2.5];
const RELOAD = 6, MGV = 820, SN = 96, SS = 10, GRAV = 9.81, WAVES = 6;
// shell types: 0 APFSDS, 1 HEAT, 2 HE, 3 coax MG, 4 enemy 125 mm, 5 enemy 30 mm, 6 smoke grenade, 7 VOG grenade dropped from the bomber
const TRACE = [[34, 27, 14, 0.5, 7], [34, 17, 6, 0.5, 6], [34, 17, 6, 0.5, 6], [16, 4.5, 1.6, 0.22, 3], [9, 34, 11, 0.5, 7], [8, 24, 8, 0.3, 4], [0, 0, 0, 0, 0], [3, 2.4, 1.5, 0.1, 1]];
const BDMG = [20, 45, 70, 0, 35, 3, 0, 25]; // direct-hit damage to a building by shell type (the drone charge does 100)
// enemy roles: assault closes in; overwatch takes a high spot with a view and holds; flanker swings wide to come in from the side;
// raider (BMP) runs fast along the plowed roads to close range
const ASL = 0, OVW = 1, FLK = 2, RAID = 3, ROLES = ['assault', 'overwatch', 'flanker', 'raider'], PQN = 16;
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const ETYPE = [{ K: T72, hp: 100, vmax: 9, slew: 0.45, v: 1700, shell: 4, reload: 8.5, range: 1800, burst: 1, night: 0.35, name: 'T-72B3' }, { K: BMP, hp: 45, vmax: 12, slew: 0.7, v: 960, shell: 5, reload: 3.6, range: 1200, burst: 5, night: 0.8, name: 'BMP-2' }];
// spotting: e.see grows at vis·sig/(1+(d/SEE_R)²)·cue − SEE_FLOOR per second; 1 = detected (turret on, engages), the first shot needs 1 + d/1000.
// vis: line-of-sight transmittance (foliage optical depth: one e-fold per FOL_L m of full canopy, blocked below 0.1);
// sig: how conspicuous the Leopard is (moving, firing, concealed under canopy, darkness vs. the sight: night = loss without a muzzle flash).
const SEE_R = 700, SEE_FLOOR = 0.12, FOL_L = 14, FOL_MAX = 255 * FOL_L * 2.3;

export function initCombat(C) {
  const { W, R, veh, aim, cam, inp, parts, rnd, ui, HALF, WS, HN, PLAY } = C, hAt = W.heightAt, trails = W.trails;
  const SO = new Float32Array(5), S = new Float32Array(SN * SS), CL = new Float32Array(16 * 5), FL = new Float32Array(24 * 8);
  const G = { fx: new Float32Array(MAXG * 12), fxN: 0, blasts: new Float32Array(16 * 4), blastN: 0, flash: new Float32Array(8), enemies: [], sel: 0, n: [20, 12, 10], mg: 2000, smokeN: 2, rl: 0, wave: 0, kills: 0, timer: 6, state: 0, won: false, score: 0, peace: !!C.peace };
  const D = G.drone = { on: false, hold: 0, bx: 0, by: 0, bz: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, t: 0, spin: 0, tp: 0, tr: 0, sec: -1,
    type: 0, bombs: 0, rel: 0, climb: 0, away: false, scan: 0, ix: 0, iy: 0, iz: 0, iok: false, drops: 0 }; // bomber: grenades left, drop cooldown, predicted impact point
  G.dn = new Int32Array(3); for (let i = 0; i < 3; i++) G.dn[i] = DTYPE[i].n; G.dsel = 0; G.rep = 0; G.spot = false;
  let fireWas = false, fireBlock = false;
  let sNext = 0, flNext = 0, clNext = 0, mgT = 0, mapT = 0, hudDirty = true, lastMg = -1, dryT = 0;
  for (let i = 0; i < MAXE; i++) G.enemies.push({ on: false, dead: false, type: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, dp: 0, dr: 0, tl: 0, tt: 0, tlV: 0, turYaw: 0, gunPitch: 0, recoil: 0, v: 0, hp: 0, state: 0, rl: 0, path: -1, pi: 0, dir: 1, burn: 0, burnt: 0, see: 0, losT: 0, los: false, known: 0, trL: 0, trR: 0, ex: 0, ey: 0, ez: 0, errT: 0, shots: 0, burstN: 0, burstT: 0, immob: false, evalT: 0, emT: 0, d: C.eobj[i],
    role: 0, grp: -1, brg: 0, side: 1, ph: 0, gx: 0, gz: 0, net: 0, hold: 500, ox: 0, oz: 0, scT: 0, sx: 0, sz: 0, shL: 0, hpL: 0, retT: 0, smk: 0, revT: 0, rvD: -1, stN: 0, cT: 0, cnx: 0, cnz: 0, noRt: 0, idleT: 0, noLos: 0, phT: 0, stT: 0, stX: 0, stZ: 0, wantT: 0, tgt: 0, st: 0, spotT: 0, seen: false, lostT: 0, lx: 0, lz: 0 }); // spotT: seconds left as a fresh contact on the map; lx/lz: last known position
  // pending spawns of the current wave (staggered groups, reinforcements): preallocated, filled by planWave on a wave start
  const PQ = []; for (let i = 0; i < PQN; i++) PQ.push({ t: 0, trig: -1, type: 0, role: 0, brg: 0, grp: 0, ann: 0 });
  let pqN = 0, noSlot = false, anyWreck = false; const GA = new Float32Array(8 * 3), GS = new Float32Array(8 * 4), COV = new Float32Array(36); let annNow = 0; // group anchors (x, z, set); per-release tally per group (n, unit x, unit z, distance); route points per 10° of bearing
  G.stuck = 0; G.lastAxis = NaN; G.bag = null; G.wt = 0; G.plan = '';
  const map = typeof document !== 'undefined' && document.getElementById('map'), mctx = map && map.getContext ? map.getContext('2d') : null;
  const mm = mctx ? initMinimap(W, C.bld, HALF) : null; // static base map, pre-rendered once

  // ---------- small helpers ----------
  const glow = (x, y, z, size, r, g, b) => { if (G.fxN >= MAXG) return; const o = G.fxN++ * 12, f = G.fx; f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = size; f[o + 4] = r; f[o + 5] = g; f[o + 6] = b; f[o + 7] = 0; f[o + 8] = 3; f[o + 9] = 0; f[o + 10] = 8; f[o + 11] = 0; };
  const flashAdd = (x, y, z, size, life, r, g, b) => { const o = flNext * 8; flNext = (flNext + 1) % 24; FL[o] = x; FL[o + 1] = y; FL[o + 2] = z; FL[o + 3] = size; FL[o + 4] = life; FL[o + 5] = life; FL[o + 6] = r; FL[o + 7] = g; const L = G.flash; L[0] = x; L[1] = y + 1; L[2] = z; L[3] = 30 + size * 9; L[4] = r * 0.5 * size; L[5] = g * 0.5 * size; L[6] = g * 0.2 * size; L[7] = 1; };
  const blast = (x, z, r, k) => { if (G.blastN >= 16) return; const o = G.blastN++ * 4; G.blasts[o] = x; G.blasts[o + 1] = z; G.blasts[o + 2] = r; G.blasts[o + 3] = k; };
  const sr = () => rnd() - 0.5, d2p = (e) => Math.hypot(e.x - veh.x, e.z - veh.z);
  function fire(owner, type, x, y, z, dx, dy, dz, v, spread, life) {
    let i = sNext; for (let k = 0; k < SN; k++) { if (S[i * SS + 8] <= 0) break; i = (i + 1) % SN; } sNext = (i + 1) % SN;
    const o = i * SS; dx += sr() * spread; dy += sr() * spread; dz += sr() * spread; const l = v / Math.hypot(dx, dy, dz);
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = dx * l; S[o + 4] = dy * l; S[o + 5] = dz * l; S[o + 6] = type; S[o + 7] = owner; S[o + 8] = life;
  }
  function explode(x, y, z, s) {
    C.sfx('boom', x, y, z, s);
    const gh = hAt(x, z), low = y - gh < 1.6;
    flashAdd(x, y + 0.4, z, 3 + 3.2 * s, 0.16, 30, 17, 5);
    for (let i = 0, n = 4 + 6 * s; i < n; i++) { const a = rnd() * 6.283, r = rnd() * 2.2 * s; parts.emit(x + Math.cos(a) * r * 0.4, y + 0.3 + rnd() * s, z + Math.sin(a) * r * 0.4, Math.cos(a) * r, 1.5 + rnd() * 3 * s, Math.sin(a) * r, 1.1 + rnd() * 1.3 * Math.sqrt(s), 0.5 * s + rnd() * 0.6, 1.4 + s, 4, 0.1, 0.1, 0.11, 0.85); }
    for (let i = 0, n = 2 + 3 * s; i < n; i++) parts.emit(x + sr() * s, y + 0.5 + rnd() * s, z + sr() * s, sr() * 1.5, 2 + rnd() * 2.5, sr() * 1.5, 3 + rnd() * 3, 0.8 * s + rnd(), 1.1 + 0.5 * s, 1, 0.16, 0.16, 0.17, 0.5);
    if (low) {
      for (let i = 0, n = 14 + 16 * s; i < n; i++) { const a = rnd() * 6.283, r = 2 + rnd() * 6 * Math.sqrt(s), dk = rnd() < 0.35; parts.emit(x, gh + 0.2, z, Math.cos(a) * r, 3 + rnd() * 8 * Math.sqrt(s), Math.sin(a) * r, 0.8 + rnd() * 1.1, dk ? 0.03 + rnd() * 0.05 : 0.015 + rnd() * 0.03, 0, 0, dk ? 0.12 : 1, dk ? 0.1 : 1, dk ? 0.08 : 1, 0.95); }
      for (let i = 0, n = 5 + 5 * s; i < n; i++) { const a = rnd() * 6.283, r = 3 + rnd() * 4 * s; parts.emit(x + Math.cos(a) * s, gh + 0.4, z + Math.sin(a) * s, Math.cos(a) * r, 0.6 + rnd() * 1.5, Math.sin(a) * r, 1.5 + rnd() * 1.5, 0.8 + rnd() * s, 1.6, 1, 1.2, 1.2, 1.24, 0.3); }
      blast(x, z, 1.3 + 1.5 * s, Math.min(1, 0.55 + 0.25 * s));
    }
    const d = Math.hypot(x - veh.x, z - veh.z); veh.shake = Math.max(veh.shake, Math.min(1.2, s * 14 / (d + 8)));
  }
  function muzzle(x, y, z, dx, dy, dz, s) {
    flashAdd(x + dx * 1.5, y + dy * 1.5, z + dz * 1.5, 4.5 * s, 0.09, 34, 20, 7);
    for (let i = 0; i < 9 * s; i++) { const v = 6 + rnd() * 22; parts.emit(x + dx * rnd() * 2, y + dy * rnd() * 2, z + dz * rnd() * 2, dx * v + sr() * 5, dy * v + sr() * 3 + 0.8, dz * v + sr() * 5, 0.9 + rnd() * 1.2, 0.5 + rnd() * 0.7, 2.6, 4, 0.2, 0.2, 0.21, 0.6); }
    for (let i = 0; i < 6 * s; i++) { const sd = i & 1 ? 1 : -1, v = 6 + rnd() * 6; parts.emit(x, y, z, -dz * sd * v + dx * 2, 0.5 + rnd(), dx * sd * v + dz * 2, 0.9 + rnd() * 0.8, 0.5 + rnd() * 0.5, 2.2, 1, 0.3, 0.3, 0.31, 0.4); }
    const gx = x + dx * 2, gz = z + dz * 2, gh = hAt(gx, gz);
    if (y - gh < 4.5) for (let i = 0; i < 22 * s; i++) { const a = rnd() * 6.283, r = 2 + rnd() * 7; parts.emit(gx + Math.cos(a) * 1.5, gh + 0.3, gz + Math.sin(a) * 1.5, Math.cos(a) * r + dx * 5, 0.5 + rnd() * 2.2, Math.sin(a) * r + dz * 5, 1.4 + rnd() * 1.6, 0.7 + rnd() * 0.9, 1.8, 1, 1.22, 1.22, 1.26, 0.26); }
  }
  // line of sight as a transmittance 0..1: buildings, terrain and smoke block; foliage below the crowns attenuates
  function losVis(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, d = Math.hypot(dx, dy, dz), n = clamp(Math.ceil(d / 8), 6, 160), st = d / n; let fol = 0;
    if (C.bld.seg(x0, y0, z0, x1, y1, z1)) return 0; // intact and damaged buildings (rubble does not block)
    for (let k = 1; k < n; k++) {
      const f = k / n, x = x0 + dx * f, y = y0 + dy * f, z = z0 + dz * f, g = hAt(x, z);
      if (y < g + 0.4) return 0;
      if (R.trees && y < g + 12) { fol += canAt(x, z) * st; if (fol > FOL_MAX) return 0; }
    }
    for (let c = 0; c < 16; c++) { const o = c * 5; if (CL[o + 4] < 1 || CL[o + 3] < 1.2 || CL[o + 3] > 22) continue;
      const t = clamp(((CL[o] - x0) * dx + (CL[o + 1] - y0) * dy + (CL[o + 2] - z0) * dz) / (d * d), 0, 1); if (Math.hypot(x0 + dx * t - CL[o], y0 + dy * t - CL[o + 1], z0 + dz * t - CL[o + 2]) < 10) return 0; }
    return Math.exp(-fol / (255 * FOL_L));
  }
  const losBlocked = (x0, y0, z0, x1, y1, z1) => losVis(x0, y0, z0, x1, y1, z1) <= 0;
  const canAt = (x, z) => W.nrm[(clamp(((z + HALF) / WS * HN) | 0, 0, HN - 1) * HN + clamp(((x + HALF) / WS * HN) | 0, 0, HN - 1)) * 4 + 2]; // canopy density 0..255
  // how conspicuous the player is to an observer of type E (1 = a still tank in the open by day)
  function playerSig(E) {
    const sp = Math.min(Math.abs(veh.v), 10) / 10, conc = R.trees ? canAt(veh.x, veh.z) / 255 : 0, dark = clamp((2 - todCur[1]) / 22, 0, 1);
    const body = (1 + 1.5 * sp) * (1 - conc * (sp > 0.05 ? 0.35 : 0.7)) * (1 - E.night * dark); // motion, snow spray and exhaust; canopy hides a still tank best
    const shot = G.rl > 0 ? 2 + 4 * G.rl / RELOAD : 0; // muzzle flash and blast cloud for the reload after a main-gun shot
    return Math.max(body, shot, G.mgOn ? 2 : 0);
  }
  // which part of a vehicle contains the point: 0 none, 1 hull, 2 turret
  function inside(t, K, x, y, z) {
    const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz > 22) return 0;
    const dy = y - t.y, c = Math.cos(t.yaw), s = Math.sin(t.yaw), lx = c * dx - s * dz, lz = s * dx + c * dz;
    if (dy > K.hh - 0.06 && dy < K.th && lx * lx + (lz - K.tz) * (lz - K.tz) < K.tr * K.tr) return 2;
    return dy > 0.15 && dy <= K.hh && Math.abs(lx) < 1.86 && Math.abs(lz) < 3.75 ? 1 : 0;
  }
  const face = (t, yaw, vx, vz) => { const l = Math.hypot(vx, vz) || 1, d = (-Math.sin(yaw) * vx - Math.cos(yaw) * vz) / l; return d < -0.62 ? 0 : d > 0.62 ? 2 : 1; };

  // ---------- damage ----------
  const DT72 = [[60, 110, 140], [28, 75, 110], [22, 24, 30]];
  function kill(e) {
    e.dead = true; e.hp = 0; e.burn = 0.01; e.state = 3; e.v = 0; e.seen = true; e.lx = e.x; e.lz = e.z; G.kills++; G.score += e.type ? 60 : 100; hudDirty = true;
    explode(e.x, e.y + 1.4, e.z, 2.4); explode(e.x, e.y + 0.4, e.z, 1.2);
    if (e.type === 0 && rnd() < 0.45) e.tlV = 7 + rnd() * 5; // ammunition cook-off throws the turret
    ui.toast(ETYPE[e.type].name + ' destroyed'); R.hitT = 0.6;
  }
  function hurtPlayer(d, fc, low) {
    if (!veh.dead) C.sfx('hit', veh.x, veh.y + 1.5, veh.z, d);
    if (veh.dead || R.god) return;
    veh.hp = Math.max(0, veh.hp - d); R.hurtT = Math.min(1, 0.35 + d * 0.03); veh.shake = Math.max(veh.shake, Math.min(1.2, d * 0.06)); hudDirty = true;
    if (fc === 1 && low && d > 10 && rnd() < 0.35 && veh.immob <= 0) { veh.immob = 6; ui.toast('Track hit — repairing'); }
    if (veh.hp <= 0) { veh.dead = true; veh.tl = 0.12; veh.tt = 0.14; explode(veh.x, veh.y + 1.6, veh.z, 2.6); G.burnP = 0.01; ui.over('Your Leopard was knocked out', `Wave ${G.wave} · ${G.kills} vehicles destroyed · score ${G.score}`); }
  }
  function hitVehicle(type, t, zone, fc, x, y, z) {
    if (t === veh) { const d = type === 4 ? [16, 30, 44][fc] * (zone === 2 ? 0.8 : 1) : type === 5 ? [1.5, 4, 7][fc] : 0; if (d) hurtPlayer(d, fc, y - veh.y < 0.95); return; }
    if (t.dead) return;
    let d = 0, deck = false;
    if (type === 7) { // VOG from above: the thin roof and the engine deck (rear, local +z) are where it hurts
      const lz = Math.sin(t.yaw) * (x - t.x) + Math.cos(t.yaw) * (z - t.z); deck = zone === 1 && lz > 0.9;
      d = t.type ? 110 : zone === 2 ? 50 : deck ? 85 : 30; }
    else if (t.type === 0) { if (type < 3) d = DT72[type][fc] * (zone === 2 && fc === 0 ? 0.85 : 1); }
    else d = type === 0 ? 100 : type === 1 ? 130 : type === 2 ? 110 : 3;
    if (d <= 0) return;
    t.hp -= d * (0.85 + rnd() * 0.3); t.known = 15; t.spotT = Math.max(t.spotT, 10); if (type !== 3 || R.hitT < 0.1) R.hitT = 0.3;
    if ((type < 3 && fc === 1 && y - t.y < 0.95 && rnd() < 0.4) || deck) t.immob = true;
    t.dpV = 0; t.see = Math.max(t.see, 1.2); // it now knows where the shot came from
    if (t.hp <= 0) kill(t); else if (type === 7) ui.toast(deck ? 'Grenade hit — engine deck, it is immobilised' : zone === 2 ? 'Grenade hit — turret roof' : 'Grenade hit'); else if (type < 3) ui.toast(fc === 0 ? 'Hit — frontal armour held' : 'Hit');
  }
  function splash(x, y, z, r, dT, dB, owner) {
    if (owner === 0) { for (const e of G.enemies) { if (!e.on || e.dead) continue; const d = Math.hypot(e.x - x, e.y + 1 - y, e.z - z); if (d < r + 2.5) { e.hp -= (e.type ? dB : dT) * clamp(1 - (d - 2.5) / r, 0, 1); e.known = 15; if (e.hp <= 0) kill(e); } } }
    else { const d = Math.hypot(veh.x - x, veh.y + 1 - y, veh.z - z); if (d < r + 2.5) hurtPlayer(dT * clamp(1 - (d - 2.5) / r, 0, 1), 1, false); }
  }
  function impact(type, owner, x, y, z, t, zone, fc) {
    if (t) hitVehicle(type, t, zone, fc, x, y, z); else if (MCLR[type] && y - hAt(x, z) < 1.5) mineHit(x, z, MCLR[type]);
    if (type === 0 || type === 4) { explode(x, y, z, t ? 0.9 : 0.55); if (t) for (let i = 0; i < 14; i++) parts.emit(x, y, z, sr() * 14, rnd() * 9, sr() * 14, 0.3 + rnd() * 0.4, 0.02 + rnd() * 0.02, 0, 0, 3, 2.2, 1, 1); }
    else if (type === 1) { explode(x, y, z, 1.7); splash(x, y, z, 3.5, 6, 40, owner); }
    else if (type === 2) { explode(x, y, z, 3.2); splash(x, y, z, 9, 12, 70, owner); C.bld.splash(x, y, z, 9, 30, bSkip, bldFx); }
    else if (type === 5) { explode(x, y, z, 0.4); }
    else if (type === 3) { if (t) glow(x, y, z, 0.5, 20, 12, 4); else for (let i = 0; i < 3; i++) parts.emit(x, y + 0.1, z, sr() * 2, 1.5 + rnd() * 2.5, sr() * 2, 0.4 + rnd() * 0.3, 0.012 + rnd() * 0.015, 0, 0, 1, 1, 1, 0.9); }
    else if (type === 6) smokeBurst(x, y, z);
    else if (type === 7) { explode(x, y, z, 0.75); splash(x, y, z, 3, 6, 18, owner); }
  }
  function smokeBurst(x, y, z) { C.sfx('smoke', x, y, z, 0.5); const o = clNext * 5; clNext = (clNext + 1) % 16; CL[o] = x; CL[o + 1] = Math.max(y, hAt(x, z) + 2); CL[o + 2] = z; CL[o + 3] = 0; CL[o + 4] = 1; flashAdd(x, y, z, 1.5, 0.08, 20, 18, 14); }

  // ---------- buildings: damage, collapse ----------
  const FI = new Float32Array(8 * 5); let fiNext = 0, bSkip = -1; // building fires: x y z time-left radius
  function bldHit(i, d, x, y, z, hot) { const s = C.bld.damage(i, d); if (s >= 0) bldState(i, s, x, y, z, hot); }
  const bldFx = (i, s) => bldState(i, s, C.bld.x[i], C.bld.y[i] + 2, C.bld.z[i], true);
  function bldState(i, s, x, y, z, hot) {
    const B = C.bld, bx = B.x[i], by = B.y[i], bz = B.z[i], sz = B.size[i], r = sz * 0.5;
    if (s === 1) { // damaged: a puff of plaster dust and splinters where it was hit
      for (let k = 0; k < 10; k++) parts.emit(x + sr() * 2, y + sr() * 2, z + sr() * 2, sr() * 3, 0.5 + rnd(), sr() * 3, 4 + rnd() * 3, 1.2 + rnd() * 1.4, 0.9, 1, 0.45, 0.42, 0.38, 0.6);
      for (let k = 0; k < 16; k++) parts.emit(x, y, z, sr() * 9, 2 + rnd() * 6, sr() * 9, 1 + rnd(), 0.05 + rnd() * 0.1, 0, 0, 0.09, 0.08, 0.07, 1);
      return;
    }
    // collapse: a dust cloud rolling out along the ground, a column, debris, fire for HE and the drone charge
    for (let k = 0, n = Math.min(80, 30 + sz * 2); k < n; k++) { const a = rnd() * 6.283, rr = rnd() * r, v = 2.5 + rnd() * 6;
      parts.emit(bx + Math.cos(a) * rr, by + 0.6 + rnd() * 2.5, bz + Math.sin(a) * rr, Math.cos(a) * v, 0.3 + rnd() * 1.4, Math.sin(a) * v, 8 + rnd() * 8, 2.5 + rnd() * 3.5, 1.3, 1, 0.43, 0.4, 0.35, 0.78); }
    for (let k = 0; k < 14; k++) parts.emit(bx + sr() * r, by + 2 + rnd() * 4, bz + sr() * r, sr() * 1.5, 2.5 + rnd() * 4, sr() * 1.5, 7 + rnd() * 6, 3 + rnd() * 3, 1.5, 1, 0.3, 0.28, 0.25, 0.7);
    for (let k = 0; k < 40; k++) parts.emit(bx + sr() * r, by + 1 + rnd() * sz * 0.25, bz + sr() * r, sr() * 12, 3 + rnd() * 9, sr() * 12, 1.2 + rnd(), 0.08 + rnd() * 0.2, 0, 0, 0.07, 0.06, 0.05, 1);
    blast(bx, bz, r + 2.5, 0.75);
    if (hot) { const o = fiNext * 5; fiNext = (fiNext + 1) % 8; FI[o] = bx; FI[o + 1] = by; FI[o + 2] = bz; FI[o + 3] = 6 + rnd() * 4; FI[o + 4] = Math.min(r, 9); }
    const d = Math.hypot(bx - veh.x, bz - veh.z); veh.shake = Math.max(veh.shake, Math.min(1.2, sz * 0.9 / (d + 10)));
    C.sfx('collapse', bx, by, bz, sz);
  }

  // ---------- projectiles ----------
  function updateShells(dt) {
    for (let i = 0; i < SN; i++) {
      const o = i * SS; if (S[o + 8] <= 0) continue;
      S[o + 8] -= dt;
      const type = S[o + 6], owner = S[o + 7], x0 = S[o], y0 = S[o + 1], z0 = S[o + 2], vx = S[o + 3], vz = S[o + 5];
      const vy = S[o + 4] - GRAV * dt * 0.5; S[o + 4] -= GRAV * dt;
      const x1 = x0 + vx * dt, y1 = y0 + vy * dt, z1 = z0 + vz * dt, len = Math.hypot(vx, vy, vz) * dt, n = type === 3 ? clamp(Math.ceil(len / 1.5), 2, 12) : clamp(Math.ceil(len / 0.6), 2, 48);
      let px = x0, py = y0, pz = z0, hit = false;
      for (let k = 1; k <= n && !hit; k++) {
        const f = k / n, qx = x0 + (x1 - x0) * f, qy = y0 + (y1 - y0) * f, qz = z0 + (z1 - z0) * f;
        if (type !== 6) {
          if (owner === 0) { for (let e = 0; e < MAXE; e++) { const t = G.enemies[e]; if (!t.on) continue; const zn = inside(t, ETYPE[t.type].K, qx, qy, qz); if (zn) { impact(type, owner, px, py, pz, t, zn, face(t, zn === 2 ? t.yaw + t.turYaw : t.yaw, vx, vz)); hit = true; break; } } }
          else { const zn = inside(veh, LEO, qx, qy, qz); if (zn) { impact(type, owner, px, py, pz, veh, zn, face(veh, zn === 2 ? veh.yaw + veh.turYaw : veh.yaw, vx, vz)); hit = true; } }
          if (hit) break;
        }
        const gh = hAt(qx, qz);
        if (qy < gh) { let a = 0, b = 1; for (let it = 0; it < 5; it++) { const m = (a + b) / 2; if (py + (qy - py) * m < hAt(px + (qx - px) * m, pz + (qz - pz) * m)) b = m; else a = m; }
          const ix = px + (qx - px) * b, iz = pz + (qz - pz) * b; impact(type, owner, ix, hAt(ix, iz) + 0.05, iz, null, 0, 0); hit = true; break; }
        const bh = C.bld.at(qx, qy, qz, 0);
        if (bh >= 0) { bSkip = bh; bldHit(bh, BDMG[type], px, py, pz, type === 2); impact(type, owner, px, py, pz, null, 0, 0); bSkip = -1; hit = true; break; }
        if (qy < gh + 9 && type !== 6 && C.collAt(qx, qz)) { impact(type, owner, px, py, pz, null, 0, 0); hit = true; break; }
        if (Math.abs(qx) > HALF || Math.abs(qz) > HALF) { hit = true; break; }
        px = qx; py = qy; pz = qz;
      }
      if (hit) { S[o + 8] = 0; continue; }
      if (S[o + 8] <= 0 && type === 6) { smokeBurst(x1, y1, z1); continue; }
      S[o] = x1; S[o + 1] = y1; S[o + 2] = z1;
      const T = TRACE[type], nd = T[4]; // tracer: a dotted streak over this frame's travel
      const ts = T[3] * (1 + Math.hypot(x1 - cam.x, y1 - cam.y, z1 - cam.z) * 0.011); // keep tracers a few pixels wide at range
      for (let k = 0; k < nd; k++) { const f = 1 - k / nd * Math.min(1, 22 / len); glow(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f, ts * (1 - k / nd * 0.6), T[0], T[1], T[2]); }
    }
  }

  // ---------- enemies ----------
  const roads = W.roads || [], NETS = [trails, roads], wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const brgOf = (x, z) => Math.atan2(x - veh.x, -(z - veh.z)); // compass bearing from the player (0 = north; +z is south)
  function pathDir(e) { // walk the route polyline (trail or road) in the direction that closes on the goal
    const t = NETS[e.net][e.path], a = clamp(e.pi + 18, 0, t.n - 1), b = clamp(e.pi - 18, 0, t.n - 1);
    const da = Math.hypot(t.pts[a * 2] - e.gx, t.pts[a * 2 + 1] - e.gz), db = Math.hypot(t.pts[b * 2] - e.gx, t.pts[b * 2 + 1] - e.gz), d0 = Math.hypot(t.pts[e.pi * 2] - e.gx, t.pts[e.pi * 2 + 1] - e.gz);
    if (Math.min(da, db) > d0 - 4) return 0;
    return da < db ? 1 : -1;
  }
  // off a route: look for a nearby trail or road stretch that leads towards the goal (raiders prefer roads)
  function findRoute(e) {
    const dg = Math.hypot(e.gx - e.x, e.gz - e.z); if (dg < 160) return false;
    let best = 14, bn = -1, bp = -1, bi = 0, bd = 1;
    for (let n = 0; n < 2; n++) { const L = NETS[n], R0 = n ? 60 : 45, bonus = n === 1 ? (e.role === RAID ? 30 : 10) : 0;
      for (let p = 0; p < L.length; p++) { const t = L[p], P = t.pts;
        for (let i = 2; i < t.n - 2; i += 3) { const px = P[i * 2], pz = P[i * 2 + 1], dx = px - e.x, dz = pz - e.z; if (dx * dx + dz * dz > R0 * R0) continue;
          const dp = Math.sqrt(dx * dx + dz * dz);
          for (let s = -1; s <= 1; s += 2) { const j = clamp(i + s * 30, 0, t.n - 1), g = dg - Math.hypot(P[j * 2] - e.gx, P[j * 2 + 1] - e.gz) - dp * 0.6 + bonus;
            if (g > best) { best = g; bn = n; bp = p; bi = i; bd = s; } } } } }
    if (bn < 0) return false;
    e.net = bn; e.path = bp; e.pi = bi; e.dir = bd; return true;
  }
  const okSpot = (x, z) => Math.abs(x) < PLAY - 60 && Math.abs(z) < PLAY - 60 && !C.collAt(x, z) && C.bld.at(x, hAt(x, z) + 1.5, z, 6) < 0 && Math.abs(hAt(x + 4, z) - hAt(x - 4, z)) + Math.abs(hAt(x, z + 4) - hAt(x, z - 4)) < 3.2;
  // overwatch: a spot r0..r1 from the player around bearing b, scored by height over the player, a clear view and the drive to get there
  function pickSpot(e, b, r0, r1) {
    let best = -1e9, bx = e.x, bz = e.z;
    for (let k = 0; k < 44; k++) { const a = b + (rnd() - 0.5) * 1.6, r = r0 + rnd() * (r1 - r0), x = veh.x + Math.sin(a) * r, z = veh.z - Math.cos(a) * r; if (!okSpot(x, z)) continue;
      const y = hAt(x, z), sc = clamp((y - veh.y) * 0.04, -1, 1.5) - Math.hypot(x - e.x, z - e.z) / 380 + rnd() * 0.3 + (losBlocked(x, y + 2.4, z, veh.x, veh.y + 1.9, veh.z) ? 0 : 1.6);
      if (sc > best) { best = sc; bx = x; bz = z; } }
    e.ox = bx; e.oz = bz; e.ph = 0;
  }
  // shoot and scoot / sidestep: a short hop across the line of fire (fwd > 0: towards the player) to a fresh spot
  function scoot(e, fwd) {
    const b = brgOf(e.x, e.z), sd = rnd() < 0.5 ? -1 : 1, l = 22 + rnd() * 20; if (Math.hypot(e.x - veh.x, e.z - veh.z) < 200) fwd = -Math.abs(fwd) - 10; // too close already: hop back
    for (let k = 0; k < 4; k++) { const s = k & 1 ? -sd : sd, x = e.x + Math.cos(b) * s * l - Math.sin(b) * fwd, z = e.z + Math.sin(b) * s * l + Math.cos(b) * fwd;
      if (okSpot(x, z)) { e.sx = x; e.sz = z; e.scT = 9; e.idleT = 0; return; } }
  }
  // stuck again and again: pick the open direction (no wall or collider on the way) that best leads towards the goal and drive there first
  function escape(e) {
    let best = -9; const y = e.y + 1.4, gb = Math.atan2(e.gx - e.x, e.gz - e.z);
    for (let k = 0; k < 12; k++) { const a = k * 0.5236 + rnd() * 0.3, x = e.x + Math.sin(a) * 28, z = e.z + Math.cos(a) * 28;
      if (!okSpot(x, z) || C.bld.seg(e.x, y, e.z, x, y, z) || C.collAt(e.x + Math.sin(a) * 14, e.z + Math.cos(a) * 14)) continue;
      const sc = Math.cos(a - gb) + rnd() * 0.6; if (sc > best) { best = sc; e.sx = x; e.sz = z; } }
    if (best > -9) { e.scT = 9; e.idleT = 0; }
  }
  function spawn(type, role = ASL, brg = NaN, grp = -1) {
    let e = null; for (const q of G.enemies) if (!q.on) { e = q; break; }
    if (!e) { let fd = -1; for (const q of G.enemies) { const dq = Math.hypot(q.x - veh.x, q.z - veh.z), dc = Math.hypot(q.x - cam.x, q.z - cam.z); // full: recycle the farthest wreck that is out of the way
        if (q.dead && dq > fd && (anyWreck || (dc > 250 && dq > 250) || (dc > 150 && q.burn > 90))) { fd = dq; e = q; } }
      if (!e) { noSlot = true; return false; } }
    const dir = brg === brg, net = role === RAID && roads.length ? 1 : 0, ga = grp >= 0 && GA[grp * 3 + 2] > 0;
    let bx = 0, bz = 0, bp = -1, bi = 0, best = -1, bn = 0;
    for (let k = 0; k < (dir ? 420 : 260); k++) {
      const n = k & 1 ? 0 : net, L = NETS[n], ti = (rnd() * L.length) | 0, t = L[ti]; if (!t || t.n < 30) continue;
      const i = 4 + ((rnd() * (t.n - 8)) | 0), x = t.pts[i * 2], z = t.pts[i * 2 + 1], d = Math.hypot(x - veh.x, z - veh.z);
      if (Math.abs(x) > PLAY - 60 || Math.abs(z) > PLAY - 60 || d < 380) continue;
      let ok = true; for (const q of G.enemies) if (q.on && !q.dead && Math.hypot(q.x - x, q.z - z) < 45) { ok = false; break; } if (!ok) continue;
      let sc;
      if (!dir) sc = (d > 480 && d < 900 ? 2 : 1) + (z < veh.z ? 1 : 0) + rnd(); // prefer 480–900 m away and to the north
      else sc = (d > 520 && d < 950 ? 2 : d < 1250 ? 1 : -4 - (d - 1250) / 300) + 3 * Math.max(0, 1 - Math.abs(wrap(brgOf(x, z) - brg)) / 0.85) + 1.5 * (1 - Math.abs(wrap(brgOf(x, z) - brg)) / 3.1416) + (n === net ? 1.2 : 0) + (ga ? 2 * clamp(1 - Math.hypot(x - GA[grp * 3], z - GA[grp * 3 + 1]) / 260, 0, 1) : 0) + rnd() * 0.8;
      if (sc > best) { best = sc; bx = x; bz = z; bp = ti; bi = i; bn = n; }
      if (!dir && best > 3.6) break;
    }
    if (bp < 0) return false;
    const E = ETYPE[type];
    Object.assign(e, { on: true, dead: false, type, x: bx, z: bz, y: hAt(bx, bz), pitch: 0, roll: 0, tl: 0, tt: 0, tlV: 0, turYaw: 0, gunPitch: 0, recoil: 0, v: 0, hp: E.hp, state: 0, rl: 3 + rnd() * 4, path: bp, pi: bi, burn: 0, burnt: 0, see: 0, losT: rnd() * 0.3, los: false, known: 0, shots: 0, burstN: 0, immob: false, evalT: 0, errT: 0,
      role, grp, brg: dir ? brg : brgOf(bx, bz), side: rnd() < 0.5 ? -1 : 1, ph: 0, net: bn, gx: veh.x, gz: veh.z, scT: 0, shL: 0, hpL: E.hp, retT: 0, smk: 1, revT: 0, stN: 0, cT: 0, noRt: 0, idleT: 0, noLos: 0, phT: 0, stT: 0, stX: bx, stZ: bz, wantT: 0,
      hold: role === RAID ? 230 + rnd() * 150 : role === FLK ? 300 + rnd() * 200 : type ? 320 + rnd() * 160 : 400 + rnd() * 250 });
    if (role === OVW) pickSpot(e, brgOf(bx, bz), 650, 1000);
    if (role === FLK && G.lastAxis === G.lastAxis && Math.abs(wrap(e.brg - G.lastAxis)) > 0.3) e.side = wrap(e.brg - G.lastAxis) > 0 ? 1 : -1; // keep swinging away from the main axis
    if (grp >= 0 && !ga) { GA[grp * 3] = bx; GA[grp * 3 + 1] = bz; GA[grp * 3 + 2] = 1; }
    if (grp >= 0) { const dd = Math.hypot(bx - veh.x, bz - veh.z) || 1; GS[grp * 4]++; GS[grp * 4 + 1] += (bx - veh.x) / dd; GS[grp * 4 + 2] += (bz - veh.z) / dd; GS[grp * 4 + 3] += dd; }
    e.spotT = 0; e.seen = false; e.lostT = 0; e.lx = bx; e.lz = bz;
    roleGoal(e); e.dir = pathDir(e) || 1; const t = NETS[bn][bp], j = clamp(bi + e.dir, 0, t.n - 1); e.yaw = Math.atan2(-(t.pts[j * 2] - bx), -(t.pts[j * 2 + 1] - bz));
    return true;
  }
  // the goal of each role, refreshed on every route evaluation
  function roleGoal(e) {
    if (e.role === OVW && e.ph === 0) { e.gx = e.ox; e.gz = e.oz; return; }
    if (e.role === FLK && e.ph === 0) { const b = e.brg + e.side * 0.75, r = 560; e.gx = clamp(veh.x + Math.sin(b) * r, -PLAY + 80, PLAY - 80); e.gz = clamp(veh.z - Math.cos(b) * r, -PLAY + 80, PLAY - 80); return; }
    e.gx = veh.x; e.gz = veh.z;
  }
  const toPt = (e, E, tx, tz, f) => {
    let ux = tx - e.x, uz = tz - e.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    for (let f = 0; f < NFLD; f++) { const o = f * 4; if (!FLD[o + 3]) continue; const fx = e.x - FLD[o], fz = e.z - FLD[o + 1], fd = Math.hypot(fx, fz) || 1, rr = FLD[o + 2] + 14; // own minefields: swing round them
      if (fd < rr) { const w = (rr - fd) / 14 * 1.8; ux += fx / fd * w; uz += fz / fd * w; } }
    if (e.cT > 0) { const dn = ux * e.cnx + uz * e.cnz; if (dn < 0.2) { ux -= e.cnx * (dn - 0.2); uz -= e.cnz * (dn - 0.2); if (dn < -0.9) { ux -= e.cnz * e.side; uz += e.cnx * e.side; } } } // against a wall: slide along it
    const a = wrap(Math.atan2(-ux, -uz) - e.yaw); e.st = clamp(a * 2.2, -1, 1); e.tgt = E.vmax * f * (1 - 0.6 * Math.abs(e.st)); };
  // movement: sets e.tgt (speed, negative = reverse) and e.st (steer) from the role, hit reactions, scoots and the route
  function drive(e, E, d, dt) {
    e.tgt = 0; e.st = 0; e.cT -= dt; e.noRt -= dt;
    const hit = e.hp < e.hpL - 0.5; e.hpL = e.hp;
    if (hit && e.smk > 0 && rnd() < (e.type ? 0.5 : 0.7)) { // smoke dischargers towards the threat, then back out of the line of fire
      e.smk--; const b = Math.atan2(veh.x - e.x, veh.z - e.z);
      for (let k = 0; k < 4; k++) { const a = b + (k - 1.5) * 0.28; fire(1, 6, e.x, e.y + 2.3, e.z, Math.sin(a) * 0.82, 0.57, Math.cos(a) * 0.82, 24 + (k & 1) * 4, 0.03, 1.15 + rnd() * 0.2); }
      C.sfx('smoke', e.x, e.y + 2.2, e.z, 0.8); e.retT = 5 + rnd() * 3; e.scT = 0; if (e.role === ASL || e.role === RAID) e.hold += 150;
    } else if (hit && !e.immob && e.retT <= 0 && rnd() < 0.5) scoot(e, -8);
    if (e.immob) return;
    if (e.revT > 0) { e.revT -= dt; e.tgt = 3 * e.rvD; e.st = e.side; return; } // unstick
    if (e.shots !== e.shL) { e.shL = e.shots; if (e.role !== RAID && e.state === 1 && Math.abs(e.v) < 2 && rnd() < (e.role === OVW ? 0.45 : 0.6)) scoot(e, e.role === OVW ? -6 : 12); } // shoot and scoot
    if (e.retT > 0) { e.retT -= dt; const a = wrap(Math.atan2(-(veh.x - e.x), -(veh.z - e.z)) - e.yaw); e.st = clamp(a * 2.2, -1, 1); e.tgt = -4.5; }
    else if (e.scT > 0) { e.scT -= dt; if (Math.hypot(e.sx - e.x, e.sz - e.z) < 7) e.scT = 0; else toPt(e, E, e.sx, e.sz, 0.65); }
    else {
      if (e.role === FLK && e.ph === 0) { e.phT += dt; if (d < 430 || e.phT > 110 || Math.hypot(e.gx - e.x, e.gz - e.z) < 90) { e.ph = 1; e.evalT = 0; } } // flank reached: turn in
      if (e.role === OVW) { e.noLos = e.los ? 0 : e.noLos + dt; if ((e.ph === 1 && (e.noLos > 28 || d > 1300)) || (e.ph === 0 && e.phT > 100)) { pickSpot(e, brgOf(e.x, e.z), 600, 950); e.noLos = 0; e.phT = 0; e.evalT = 0; } }
      const atSpot = e.role === OVW && (e.ph === 1 || Math.hypot(e.ox - e.x, e.oz - e.z) < 14);
      if (atSpot && e.ph === 0) { e.ph = 1; e.phT = 0; } else if (e.role === OVW && e.ph === 0) e.phT += dt;
      const halt = d < 70 || atSpot || (e.state === 1 && d < (e.role === FLK && e.ph === 0 ? 260 : e.hold));
      if (halt) {
        const a = wrap(Math.atan2(-(veh.x - e.x), -(veh.z - e.z)) - e.yaw); if (e.type === 0 && Math.abs(a) > 0.6 && e.state === 1) { e.st = clamp(a * 2, -1, 1); e.tgt = 0.7; } // turn the front armour to the threat
        e.idleT += dt; if (e.idleT > (e.role === RAID ? 6 : e.role === OVW ? 30 : 13) + (e.grp & 3)) scoot(e, e.role === OVW ? -5 : 15);
      } else {
        e.idleT = 0; e.evalT -= dt;
        if (e.evalT <= 0) { e.evalT = 4 + rnd() * 2; roleGoal(e); if (e.path >= 0) { const nd = pathDir(e); if (nd === 0) e.path = -1; else e.dir = nd; } if (e.path < 0 && e.noRt <= 0) findRoute(e); }
        let tx = e.gx, tz = e.gz; // (route points inside one of our own minefields are skipped)
        if (e.path >= 0) { const t = NETS[e.net][e.path]; while (Math.hypot(t.pts[e.pi * 2] - e.x, t.pts[e.pi * 2 + 1] - e.z) < 8 || inField(t.pts[e.pi * 2], t.pts[e.pi * 2 + 1], 4)) { e.pi += e.dir; if (e.pi < 0 || e.pi >= t.n) { e.path = -1; e.evalT = Math.min(e.evalT, 0.5); break; } } if (e.path >= 0) { tx = t.pts[e.pi * 2]; tz = t.pts[e.pi * 2 + 1]; } }
        toPt(e, E, tx, tz, e.path < 0 ? 0.55 : e.net ? 1.3 : 1);
      }
    }
    // keep station in a column: do not drive into the back of a friendly vehicle
    if (e.tgt > 0) { const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      for (let j = 0; j < MAXE; j++) { const q = G.enemies[j]; if (q === e || !q.on) continue; const qx = q.x - e.x, qz = q.z - e.z, qd = Math.hypot(qx, qz), ah = qx * fx + qz * fz;
        if (qd < 16 && ah > qd * 0.6) { e.tgt = Math.min(e.tgt, q.dead ? 1.5 : Math.max(0, q.v * 0.8)); if (q.dead || qd < 10) e.st = clamp(e.st + (qx * fz - qz * fx > 0 ? 0.6 : -0.6), -1, 1); } } } // and steer round it
    // stuck: wanted to move for a while but did not get anywhere -> back off (or push forward), then sidestep and look for a new route
    e.stT += dt; if (Math.abs(e.tgt) > 2) e.wantT += dt;
    if (e.stT > 4) { const mv = Math.hypot(e.x - e.stX, e.z - e.stZ);
      if (e.wantT > 3 && mv < 3) { e.rvD = e.tgt < 0 ? 1 : -1; e.revT = 2.5; e.side = -e.side; e.path = -1; e.evalT = 2.6; e.retT = 0; e.scT = 0; G.stuck++; if (++e.stN > 2) { escape(e); e.noRt = 15; } else if (e.stN > 1) scoot(e, -10); if (G.onStuck) G.onStuck(e); }
      else if (mv > 15) e.stN = 0;
      e.stT = 0; e.wantT = 0; e.stX = e.x; e.stZ = e.z; }
  }
  // ---------- waves: scenarios with groups, roles, directions and reinforcements ----------
  function pq(t, trig, type, role, brg, grp, ann) { if (pqN >= PQN) return; const q = PQ[pqN++]; q.t = t; q.trig = trig; q.type = type; q.role = role; q.brg = brg; q.grp = grp; q.ann = ann; }
  function planWave(w) { // rare event: may allocate
    COV.fill(0);
    for (let n = 0; n < 2; n++) for (const t of NETS[n]) for (let i = 0; i < t.n; i += 5) { const x = t.pts[i * 2], z = t.pts[i * 2 + 1], d = Math.hypot(x - veh.x, z - veh.z);
      if (d > 500 && d < 1000 && Math.abs(x) < PLAY - 60 && Math.abs(z) < PLAY - 60) COV[Math.floor((brgOf(x, z) + 3.1416) / 6.2832 * 36) % 36]++; }
    const feas = (b) => { const c = Math.floor((wrap(b) + 3.1416) / 6.2832 * 36); let f = 0; for (let k = -2; k <= 2; k++) f += COV[(c + k + 36) % 36]; return f; };
    let ax = 0, best = -1;
    for (let k = 0; k < 40; k++) { const a = w === 1 && k < 20 ? (rnd() - 0.5) * 1.2 : rnd() * 6.283 - 3.1416; // wave 1 comes from the north if it can
      const sc = Math.min(1, feas(a) / 40) + rnd() * 0.5 - (G.lastAxis === G.lastAxis && Math.abs(wrap(a - G.lastAxis)) < 1.1 ? 1 : 0); if (sc > best) { best = sc; ax = a; } }
    G.lastAxis = ax; const fp = feas(ax + 1.45), fm = feas(ax - 1.45), sd = fp > 15 && fm > 15 ? (rnd() < 0.5 ? -1 : 1) : fp >= fm ? 1 : -1, n = Math.min(2 + w, 7), B = () => rnd() < 0.5 ? 1 : 0;
    if (!G.bag || !G.bag.length) { G.bag = ['platoon', 'raid', 'pincer', 'echelon']; for (let i = 3; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = G.bag[i]; G.bag[i] = G.bag[j]; G.bag[j] = t; } }
    const sc = w === 1 ? 'probe' : w === WAVES ? 'final' : G.bag.pop(); pqN = 0; GA.fill(0);
    if (sc === 'probe') { pq(0, -1, 0, OVW, ax, 0, 0); pq(0, -1, 1, ASL, ax, 0, 0); pq(0, -1, 1, n > 3 ? RAID : ASL, ax + sd * 0.3, 0, 0); for (let i = 3; i < n; i++) pq(0, -1, B(), ASL, ax, 0, 0); return 'Recon in force'; }
    if (sc === 'platoon') { pq(0, -1, 0, OVW, ax, 0, 0); for (let i = 1; i < n - 1; i++) pq(0, -1, 0, ASL, ax, 0, 0); pq(0, -1, 1, ASL, ax, 0, 0); pq(30 + rnd() * 20, 1, 1, RAID, ax + sd * 0.6, 1, 1); return 'Tank platoon with escort'; }
    if (sc === 'raid') { for (let i = 0; i < n; i++) { const ow = i === n - 1 && n > 4; pq(i < 2 ? 0 : 6 + i * 4, -1, ow ? 0 : 1, ow ? OVW : RAID, ax + (i & 1 ? 0.25 : -0.25), 0, 0); } return 'BMP raid on the roads'; }
    if (sc === 'pincer') { const f = Math.ceil(n / 2); pq(0, -1, 0, OVW, ax, 0, 0); for (let i = 1; i < f; i++) pq(0, -1, B(), ASL, ax, 0, 0);
      const t = 14 + rnd() * 14; for (let i = f; i < n; i++) pq(t, -1, i === f ? 0 : B(), FLK, ax + sd * 1.45, 1, 1); return 'Pincer'; }
    if (sc === 'echelon') { const f = Math.max(2, n - 3); for (let i = 0; i < f; i++) pq(0, -1, i ? B() : 0, i ? ASL : OVW, ax, 0, 0);
      const t = 45 + rnd() * 20; for (let i = f; i <= n; i++) pq(t, 1, i === f ? 0 : B(), i === n ? FLK : ASL, ax + sd * 0.7, 1, 1); return 'Two echelons'; }
    // final: overwatch and an assault group on the main axis, a BMP raid from one side, then tanks flanking from the other
    pq(0, -1, 0, OVW, ax, 0, 0); pq(0, -1, 0, OVW, ax + 0.3, 0, 0); pq(0, -1, 0, ASL, ax, 1, 0); pq(0, -1, 0, ASL, ax, 1, 0); pq(0, -1, 1, ASL, ax, 1, 0);
    const tr = 22 + rnd() * 10, tf = 55 + rnd() * 15; pq(tr, -1, 1, RAID, ax + sd * 1.7, 2, 1); pq(tr, -1, 1, RAID, ax + sd * 1.7, 2, 0);
    pq(tf, 2, 0, FLK, ax - sd * 1.4, 3, 1); pq(tf, 2, 0, FLK, ax - sd * 1.4, 3, 0);
    return 'Final assault';
  }
  // spawn whatever is due (by time, by the number still alive, or at once when the field is empty); GS tallies each group for the announcement
  function releaseWave(alive) {
    let made = 0; GS.fill(0); annNow = 0;
    for (let i = 0; i < pqN;) { const q = PQ[i];
      noSlot = false; anyWreck = alive === 0;
      if ((G.wt >= q.t || (q.trig >= 0 && alive <= q.trig) || alive === 0) && (spawn(q.type, q.role, q.brg, q.grp) ? (annNow |= q.ann, ++made) : !noSlot)) { PQ[i] = PQ[pqN - 1]; PQ[pqN - 1] = q; pqN--; } // no free slot: stays pending
      else i++; }
    anyWreck = false;
    return made;
  }
  const dirName = (x, z) => DIRS[Math.round(((Math.atan2(x, -z) * 57.296 + 360) % 360) / 45) % 8];
  function announce(head, tail = '') { // rare event
    let msg = head, k = 0;
    for (let g = 0; g < 8; g++) { const n = GS[g * 4]; if (!n) continue;
      msg += (k++ ? ' · ' : '') + `${n} from the ${dirName(GS[g * 4 + 1], GS[g * 4 + 2])}, ~${Math.round(GS[g * 4 + 3] / n / 50) * 50} m`; }
    ui.toast(msg + tail);
  }
  function updateEnemy(e, dt, idx) {
    const E = ETYPE[e.type], K = E.K;
    if (e.spotT > 0) { e.spotT -= dt; e.seen = true; e.lostT = 0; if (!e.dead) { e.lx = e.x; e.lz = e.z; } } else e.lostT += dt; // map contact: fresh while spotted, then the last known position
    if (e.dead) { // wreck: burn, then smoulder; a thrown turret comes back down askew
      e.burn += dt; e.burnt = Math.min(1, e.burnt + dt * 0.5);
      if (e.tlV !== 0) { e.tlV -= 13 * dt; e.tl += e.tlV * dt; e.tt += dt * 2.2; e.turYaw += dt * 1.7; if (e.tl <= 0.1 && e.tlV < 0) { e.tl = 0.1; e.tlV = 0; e.tt = 0.16; explode(e.x, e.y + 1.5, e.z, 0.8); } }
      e.emT += dt * (e.burn < 28 ? 20 : e.burn < 110 ? 6 : 0);
      if (Math.hypot(e.x - cam.x, e.z - cam.z) > 700) e.emT = 0;
      while (e.emT >= 1) { e.emT--; if (e.burn < 28 && rnd() < 0.5) parts.emit(e.x + sr() * 1.8, e.y + 1.3 + rnd(), e.z + sr() * 2.6, sr(), 2 + rnd() * 2.5, sr(), 0.9 + rnd() * 0.7, 0.7 + rnd() * 0.8, 1.2, 4, 0.06, 0.06, 0.06, 0.85); else parts.emit(e.x + sr() * 1.5, e.y + 2 + rnd(), e.z + sr() * 2, sr(), 3 + rnd() * 2.5, sr(), 6 + rnd() * 4, 1.2 + rnd(), 1.15, 1, 0.045, 0.045, 0.05, 0.72); }
      if (e.burn < 28 && (R.frame & 3) === idx % 4) glow(e.x, e.y + 1.9, e.z, 2.2 + rnd(), 9, 3.5, 0.8);
    } else {
      const dx = veh.x - e.x, dz = veh.z - e.z, d = Math.hypot(dx, dz);
      // perception (staggered line-of-sight checks)
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.28; e.los = !veh.dead && d < 2200 ? losVis(e.x, e.y + 2.2, e.z, veh.x, veh.y + 1.9, veh.z) : 0; }
      if (e.los > 0) e.see = Math.min(4, e.see + (e.los * playerSig(E) / (1 + d * d / (SEE_R * SEE_R)) * (e.known > 0 ? 1.6 : 1) - SEE_FLOOR) * dt);
      else e.see -= 0.5 * dt;
      if (e.see < 0) e.see = 0;
      if (e.see >= 1) { e.known = Math.max(e.known, 12); if (e.los > 0) G.spot = true; }
      // the crew sees it (the same sight line, reversed): inside the sight's field of view or close by, within a range that shrinks at night without the thermal sight
      if (e.los > 0.2 && !veh.dead) { const rng = 1600 * (1 - (R.therm ? 0.15 : 0.6) * clamp((2 - todCur[1]) / 22, 0, 1));
        if (d < rng && (d < 180 || Math.abs(wrap(Math.atan2(-(e.x - veh.x), -(e.z - veh.z)) - aim.yaw)) < 0.75)) e.spotT = Math.max(e.spotT, 6); }
      if (G.rep > 5) e.known = Math.max(e.known, 3); // a contact report from another crew (radio delay) tells it where to look
      e.known -= dt;
      const engage = e.los > 0 && d < E.range && e.see >= 1;
      e.state = engage ? 1 : 0;
      // movement: role-driven (see drive())
      drive(e, E, d, dt); const tgt = e.tgt, st = e.st;
      for (let j = 0; j < MAXE; j++) { const q = G.enemies[j]; if (q === e || !q.on) continue; const qx = e.x - q.x, qz = e.z - q.z, qd = Math.hypot(qx, qz); if (qd < 7 && qd > 0.01) { const k = (7 - qd) / qd * (q.dead ? 1 : 0.5); e.x += qx * k; e.z += qz * k; } }
      e.v += (tgt - e.v) * Math.min(1, dt * 0.9); const yr = st * 0.55 * (Math.abs(e.v) > 0.5 || tgt !== 0 ? 1 : 0);
      e.yaw += yr * dt; e.x = clamp(e.x - Math.sin(e.yaw) * e.v * dt, -PLAY, PLAY); e.z = clamp(e.z - Math.cos(e.yaw) * e.v * dt, -PLAY, PLAY);
      for (let s = -1; s <= 1; s++) { const px = e.x - Math.sin(e.yaw) * 1.8 * s, pz = e.z - Math.cos(e.yaw) * 1.8 * s; if (C.solid(px, pz, 1.9, SO)) { e.x += SO[0] - px; e.z += SO[1] - pz; e.v *= 0.92; if (SO[4] > 0) { e.cnx = SO[2]; e.cnz = SO[3]; e.cT = 1.2; } } } // buildings and colliders are solid
      if (C.bld.rubble(e.x, e.z)) e.v = Math.min(e.v, 4.5);
      e.trL += (e.v + yr * 1.43) * dt; e.trR += (e.v - yr * 1.43) * dt;
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), hl = K.hl, hw = K.hw;
      const a = hAt(e.x + fx * hl - fz * hw, e.z + fz * hl + fx * hw), b = hAt(e.x + fx * hl + fz * hw, e.z + fz * hl - fx * hw), c = hAt(e.x - fx * hl - fz * hw, e.z - fz * hl + fx * hw), dd = hAt(e.x - fx * hl + fz * hw, e.z - fz * hl - fx * hw), k = Math.min(1, dt * 8);
      e.y = (a + b + c + dd) / 4 + 0.02; e.pitch += (Math.atan2((a + b - c - dd) / 2, hl * 2) - e.pitch) * k; e.roll += (Math.atan2((a + c - b - dd) / 2, hw * 2) - e.roll) * k;
      // gunnery: lead, an aim error that settles with each shot, ballistic elevation
      e.errT -= dt;
      if (e.errT <= 0) { e.errT = 2.2; const sg = (1.1 + d * 0.0042 + Math.abs(veh.v) * 0.22) * (1 + (2.2 + d / 700) / (1 + e.shots)) * (R.easy || 1); e.ex = (rnd() + rnd() + rnd() - 1.5) * sg; e.ey = (rnd() + rnd() + rnd() - 1.5) * sg * 0.45; e.ez = (rnd() + rnd() + rnd() - 1.5) * sg; }
      const M = e.d, ox = M[4] * K.gy + M[8] * K.gz + M[12], oy = M[5] * K.gy + M[9] * K.gz + M[13], oz = M[6] * K.gy + M[10] * K.gz + M[14];
      let wx = fx, wy = 0, wz = fz;
      if (e.see > 0.6 || e.known > 0) {
        const tof = d / E.v, tx = veh.x - Math.sin(veh.yaw) * veh.v * tof * 0.85 + e.ex - ox, ty = veh.y + 1.35 + e.ey - oy, tz = veh.z - Math.cos(veh.yaw) * veh.v * tof * 0.85 + e.ez - oz;
        const hd = Math.max(1, Math.hypot(tx, tz)), v2 = E.v * E.v, disc = v2 * v2 - GRAV * (GRAV * hd * hd + 2 * ty * v2), el = disc > 0 ? Math.atan2(v2 - Math.sqrt(disc), GRAV * hd) : 0.3, ce = Math.cos(el);
        wx = tx / hd * ce; wy = Math.sin(el); wz = tz / hd * ce;
      }
      const lx = M[0] * wx + M[1] * wy + M[2] * wz, ly = M[4] * wx + M[5] * wy + M[6] * wz, lz = M[8] * wx + M[9] * wy + M[10] * wz;
      let dyaw = Math.atan2(-lx, -lz) - e.turYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const dpt = clamp(Math.asin(clamp(ly, -1, 1)), -0.1, 0.3) - e.gunPitch;
      e.turYaw += clamp(dyaw, -E.slew * dt, E.slew * dt); e.gunPitch += clamp(dpt, -0.35 * dt, 0.35 * dt);
      e.rl -= dt; e.recoil *= 1 - Math.min(1, dt * 4.5);
      if (e.burstN > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burstT = 0.2; e.burstN--; e.fire = true; } }
      else if (engage && !G.peace && e.rl <= 0 && Math.hypot(dyaw, dpt) < 0.012 && e.see >= (e.shots ? 1 : 1 + d * 0.001)) { e.rl = E.reload * (0.9 + rnd() * 0.3); e.shots++; e.fire = true; e.burstN = E.burst - 1; e.burstT = 0.2; }
    }
    tankParts(e.d, e, K); e.d[128] = e.trL; e.d[129] = e.trR; e.d[130] = e.burnt; e.d[131] = 1;
    if (e.fire) { e.fire = false; if (d2p(e) < 2500) e.spotT = Math.max(e.spotT, 8); const M = gunMat(), mx = M[4] * K.gy + M[8] * K.mz + M[12], my = M[5] * K.gy + M[9] * K.mz + M[13], mz = M[6] * K.gy + M[10] * K.mz + M[14], l = -1 / Math.hypot(M[8], M[9], M[10]);
      C.sfx(e.type ? 'auto' : 'egun', mx, my, mz, 1);
      const E2 = ETYPE[e.type]; fire(1, E2.shell, mx, my, mz, M[8] * l, M[9] * l, M[10] * l, E2.v, e.type ? 0.004 : 0.0016, 4);
      muzzle(mx, my, mz, M[8] * l, M[9] * l, M[10] * l, e.type ? 0.3 : 1); e.recoil = e.type ? 0.05 : 0.3; e.known = 14; }
  }

  // ---------- HUD ----------
  function hud() {
    hudDirty = false; lastMg = Math.ceil(G.mg / 50) * 50;
    const hp = Math.ceil(veh.hp);
    ui.set('sH', 'HULL ' + hp, 'st ' + (hp > 60 ? 'on' : hp > 30 ? 'warn' : 'bad'));
    if (veh.immob > 0 && !veh.dead) ui.set('sT', 'TRACK ' + Math.ceil(veh.immob) + ' s', 'st bad'); ui.show('sT', veh.immob > 0 && !veh.dead);
    ui.set('sA', AMMO[G.sel].name + ' ' + G.n[G.sel], 'st ' + (G.n[G.sel] ? 'on' : 'bad'));
    ui.set('sM', 'MG ' + lastMg, 'st'); ui.set('sK', 'SMOKE ' + G.smokeN, 'st');
    const DT = DTYPE[D.on ? D.type : G.dsel];
    ui.set('sD', D.on ? DT.name + (D.type === 1 ? ' ×' + D.bombs : '') + ' · ' + D.sec + ' s' : DT.name + ' ' + G.dn[G.dsel], 'st' + (D.on ? (D.sec > 15 ? ' on' : ' warn') : ''));
    if (ui.droneUI) ui.droneUI(DT.name, D.on ? D.type : -1);
    ui.set('wave', G.peace ? 'FREE ROAM' : (G.wave ? 'WAVE ' + G.wave + (G.won ? '' : '/' + WAVES) : 'STAND BY') + ' · ' + G.kills + ' KILLS · ' + G.score);
  }
  function drawMap() {
    if (!mctx) return; const c = mctx, Wd = 176, sc = Wd / MAP_M, cx = Wd / 2;
    const mx0 = D.on ? D.x : veh.x, mz0 = D.on ? D.z : veh.z; // the map follows the drone while it flies
    c.setTransform(1, 0, 0, 1, 0, 0);
    let mx = mx0, mz = mz0; if (mm) { mm.draw(c, mx0, mz0); mx = mm.cx; mz = mm.cz; } else c.clearRect(0, 0, MAP_PX, MAP_PX);
    c.setTransform(MAP_PX / Wd, 0, 0, MAP_PX / Wd, 0, 0); // markers are drawn in CSS pixels
    c.strokeStyle = '#ffffff38'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cx, 500 * sc, 0, 6.283); c.stroke();
    c.fillStyle = '#ffffffb0'; c.fillRect(cx - 0.5, 3, 1, 6);
    c.strokeStyle = '#05080cd0'; c.lineWidth = 1.2;
    // marked mines: small amber crosses
    c.strokeStyle = '#ffc04a'; c.lineWidth = 1.3; c.beginPath();
    for (let i = 0; i < MAXM; i++) { if (!MR[i] || (MS[i] !== 1 && MS[i] !== 2)) continue; const x = cx + (MX[i] - mx) * sc, y = cx + (MZ[i] - mz) * sc; if (x < 2 || y < 2 || x > Wd - 2 || y > Wd - 2) continue;
      c.moveTo(x - 1.8, y - 1.8); c.lineTo(x + 1.8, y + 1.8); c.moveTo(x + 1.8, y - 1.8); c.lineTo(x - 1.8, y + 1.8); }
    c.stroke(); c.strokeStyle = '#05080cd0'; c.lineWidth = 1.2;
    // only what has been seen (crew, sight, drones, muzzle flashes): fresh contacts solid, lost ones as a hollow marker at the last known position that fades out
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on || !e.seen) continue;
      const fresh = e.dead || e.spotT > 0, ex = e.dead ? e.x : e.lx, ez = e.dead ? e.z : e.lz; if ((!fresh && e.lostT > LOST_T) || Math.abs(ex - mx) > 900 || Math.abs(ez - mz) > 900) continue;
      const x = clamp(cx + (ex - mx) * sc, 4, Wd - 4), y = clamp(cx + (ez - mz) * sc, 4, Wd - 4), col = e.dead ? '#59606a' : e.type ? '#ff9a3d' : '#ff4a3a';
      c.beginPath(); if (e.type) c.rect(x - 2.6, y - 2.6, 5.2, 5.2); else c.arc(x, y, 3.7, 0, 6.283);
      if (fresh) { c.fillStyle = col; c.fill(); c.stroke(); }
      else { c.globalAlpha = 0.25 + 0.75 * (1 - e.lostT / LOST_T); c.strokeStyle = '#05080c90'; c.lineWidth = 3; c.stroke(); c.strokeStyle = col; c.lineWidth = 1.4; c.stroke(); c.globalAlpha = 1; c.strokeStyle = '#05080cd0'; c.lineWidth = 1.2; } }
    const a = veh.yaw, t = veh.yaw + veh.turYaw, vx = clamp(cx + (veh.x - mx) * sc, 6, Wd - 6), vy = clamp(cx + (veh.z - mz) * sc, 6, Wd - 6);
    c.strokeStyle = '#05080cb0'; c.lineWidth = 3; c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx - Math.sin(t) * 26, vy - Math.cos(t) * 26); c.stroke();
    c.strokeStyle = '#ffd36b'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#7dffb0'; c.strokeStyle = '#05080cd0'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(vx - Math.sin(a) * 7, vy - Math.cos(a) * 7); c.lineTo(vx - Math.sin(a + 2.5) * 5, vy - Math.cos(a + 2.5) * 5); c.lineTo(vx - Math.sin(a - 2.5) * 5, vy - Math.cos(a - 2.5) * 5); c.closePath(); c.fill(); c.stroke();
    if (D.on) { const q = D.yaw, dx = cx + (D.x - mx) * sc, dy = cx + (D.z - mz) * sc; c.fillStyle = '#6fd6ff'; c.beginPath(); c.moveTo(dx - Math.sin(q) * 8, dy - Math.cos(q) * 8); c.lineTo(dx - Math.sin(q + 2.4) * 5, dy - Math.cos(q + 2.4) * 5); c.lineTo(dx - Math.sin(q - 2.4) * 5, dy - Math.cos(q - 2.4) * 5); c.closePath(); c.fill(); c.stroke(); }
  }

  // ---------- mines: pre-laid fields on the roads ahead (buried, a faint disturbance in the snow) and rocket-laid mines on the surface ----------
  // state MS: 0 free, 1 buried, 2 on the surface, 3 falling (rocket-laid, MT s to impact); MA arming delay; MR revealed (drone, crew or seen landing); MP snow stamp pending
  const MX = new Float32Array(MAXM), MY = new Float32Array(MAXM), MZ = new Float32Array(MAXM), MT = new Float32Array(MAXM), MA = new Float32Array(MAXM), MW = new Float32Array(MAXM);
  const MS = new Uint8Array(MAXM), MR = new Uint8Array(MAXM), MP = new Uint8Array(MAXM), FLD = new Float32Array(NFLD * 4); // field: x z radius on
  let rlAt = -1, rlT = 0, rlX = 0, rlZ = 0, crewT = 0, immS = -1, fixT = 0, mineSeq = 0;
  const mesh = (i) => { if (C.mineMesh) C.mineMesh(i, MX[i], MY[i], MZ[i], MW[i], MS[i] === 2, MR[i] && (MS[i] === 1 || MS[i] === 2)); };
  function mineSlot() { let o = -1, oa = 1e9; for (let i = 0; i < MAXM; i++) { if (!MS[i]) return i; if (MS[i] === 2 && MT[i] < oa) { oa = MT[i]; o = i; } } return o; } // full: reuse the oldest surface mine
  function mineAt(x, z, st, t) {
    const i = mineSlot(); if (i < 0) return -1;
    MX[i] = x; MZ[i] = z; MY[i] = hAt(x, z); MS[i] = st; MT[i] = st === 3 ? t : ++mineSeq; MA[i] = 1.5; MR[i] = 0; MP[i] = st === 1 ? 1 : 0; MW[i] = rnd() * 6.283; mesh(i); return i;
  }
  const inField = (x, z, pad) => { for (let f = 0; f < NFLD; f++) { const o = f * 4; if (FLD[o + 3] && Math.hypot(x - FLD[o], z - FLD[o + 1]) < FLD[o + 2] + pad) return true; } return false; };
  // a field across a road: two staggered rows over both track lanes, along about 20 m
  function layField(cx, cz, dx, dz) {
    let f = 0; while (f < NFLD && FLD[f * 4 + 3]) f++; if (f >= NFLD) return 0;
    const n = 6 + ((rnd() * 4) | 0); let made = 0;
    for (let k = 0; k < n; k++) { const a = (k - (n - 1) / 2) * 2.8 + sr() * 1.2, c = (k & 1 ? 1 : -1) * (0.8 + rnd() * 2.2), x = cx + dx * a - dz * c, z = cz + dz * a + dx * c;
      if (C.bld.at(x, hAt(x, z) + 0.5, z, 0.5) >= 0 || C.collAt(x, z)) continue; if (mineAt(x, z, 1, 0) >= 0) made++; }
    const o = f * 4; FLD[o] = cx; FLD[o + 1] = cz; FLD[o + 2] = n * 1.45 + 3; FLD[o + 3] = 1;
    return made;
  }
  // on a wave start (rare event): mine one or two road or trail stretches 120–380 m out towards the main axis
  function planFields(w) {
    if (w < 2 || rnd() > 0.65) return 0;
    const want = w >= 4 && rnd() < 0.5 ? 2 : 1; let laid = 0, bx = 0, bz = 0;
    for (let m = 0; m < want; m++) { let best = -1e9, px = 0, pz = 0, ux = 0, uz = 0;
      for (let k = 0; k < 300; k++) { const n = k % 3 ? 1 : 0, L = NETS[n]; if (!L.length) continue; const t = L[(rnd() * L.length) | 0]; if (!t || t.n < 12) continue;
        const i = 3 + ((rnd() * (t.n - 6)) | 0), x = t.pts[i * 2], z = t.pts[i * 2 + 1], d = Math.hypot(x - veh.x, z - veh.z);
        if (d < 120 || d > 380 || Math.abs(x) > PLAY - 60 || Math.abs(z) > PLAY - 60 || inField(x, z, 60)) continue;
        const sc = 2 * Math.max(0, 1 - Math.abs(wrap(brgOf(x, z) - G.lastAxis)) / 1.1) + (n ? 1 : 0) + rnd() * 0.6 - Math.abs(d - 230) / 300;
        if (sc > best) { best = sc; px = x; pz = z; const ex = t.pts[i * 2 + 2] - t.pts[i * 2 - 2], ez = t.pts[i * 2 + 3] - t.pts[i * 2 - 1], l = Math.hypot(ex, ez) || 1; ux = ex / l; uz = ez / l; } }
      if (best > -1e9) { const n0 = layField(px, pz, ux, uz); if (n0) { laid += n0; bx = px; bz = pz; } } }
    return laid ? dirName(bx - veh.x, bz - veh.z) : 0;
  }
  function mineBoom(i, under) {
    const x = MX[i], y = MY[i], z = MZ[i]; MS[i] = 0; MR[i] = 0; MP[i] = 0; mesh(i);
    explode(x, y + 0.15, z, 1.5);
    for (let k = 0; k < 14; k++) parts.emit(x, y + 0.3, z, sr() * 10, 3 + rnd() * 8, sr() * 10, 0.4 + rnd() * 0.5, 0.05 + rnd() * 0.06, 0, 0, 0.05, 0.05, 0.05, 1); // track links and fuze debris
    if (under) { // the tank rolled onto it: damage and a broken track
      const d = 15 + rnd() * 10; hurtPlayer(d, 0, false); veh.immob = Math.max(veh.immob, 4 + rnd() * 4); veh.shake = 1.2; veh.v *= 0.2; hudDirty = true;
      ui.toast('MINE! Track blown — repairing'); return; }
    const dp = Math.hypot(veh.x - x, veh.z - z); if (dp < 7) hurtPlayer(6 * (1 - dp / 7), 1, false);
  }
  // ground impacts and blasts set off mines nearby (HE clears a lane; the MG can pick off a mine it hits)
  function mineHit(x, z, r) { for (let i = 0; i < MAXM; i++) { if (MS[i] !== 1 && MS[i] !== 2) continue; if (Math.hypot(MX[i] - x, MZ[i] - z) < (MS[i] === 1 ? r * 0.8 : r)) mineBoom(i, false); } }
  // rocket-laid mines: a warning, then a cassette bursts over the spot the tank was at and scatters mines on the snow around it
  function strike() { rlT = 4; rlX = veh.x; rlZ = veh.z; C.sfx('whistle', veh.x, veh.y + 40, veh.z, 1); ui.toast('Incoming rockets — remote mining! Move!'); }
  function updateMines(dt) {
    let stamps = 0;
    for (let i = 0; i < MAXM; i++) { const st = MS[i]; if (!st) continue;
      if (MP[i] && G.blastN < 12 && stamps < 4) { MP[i] = 0; stamps++; blast(MX[i], MZ[i], 1.3, 0.3); } // fresh digging: a faint scar in the snow (and a little warmth in the thermal sight)
      if (st === 3) { MT[i] -= dt; const h = MT[i] * 45;
        if (MT[i] > 0) { if (h < 160) glow(MX[i], MY[i] + h, MZ[i], 0.35 + h * 0.004, 5, 3, 1.5); continue; }
        MS[i] = 2; MT[i] = ++mineSeq; MR[i] = 1; MA[i] = 2; mesh(i);
        for (let k = 0; k < 8; k++) parts.emit(MX[i] + sr() * 0.4, MY[i] + 0.15, MZ[i] + sr() * 0.4, sr() * 3, 1 + rnd() * 2.5, sr() * 3, 0.5 + rnd() * 0.5, 0.03 + rnd() * 0.04, 0, 0, 1, 1, 1, 0.9);
        C.sfx('hit', MX[i], MY[i], MZ[i], 0.2); continue; }
      if (MA[i] > 0) { MA[i] -= dt; continue; }
      // pressure fuze: a track rolling over it (on the ground: a tank in the air over a crest does not set it off)
      if (!veh.dead && !veh.air && veh.y - MY[i] < 0.8 && (Math.abs(veh.v) > 0.2 || Math.abs(veh.yawRate) > 0.05)) { const dx = MX[i] - veh.x, dz = MZ[i] - veh.z;
        if (dx * dx + dz * dz < 20) { const c = Math.cos(veh.yaw), s = Math.sin(veh.yaw); if (Math.abs(c * dx - s * dz) < 1.95 && Math.abs(s * dx + c * dz) < 3.9) { mineBoom(i, true); continue; } } }
      if (MR[i] && todCur[1] < 2) { const d = Math.hypot(MX[i] - cam.x, MZ[i] - cam.z); if (d < 450) glow(MX[i] + Math.cos(MW[i]) * 0.3, MY[i] + 0.8, MZ[i] - Math.sin(MW[i]) * 0.3, 0.12 * (1 + d * 0.012) * (0.75 + 0.25 * Math.sin(R.time * 5 + i)), 9, 1.2, 0.3); } // marked, in the dark: a pulsing red light on the picket
    }
    // the crew notices disturbed snow close ahead in the sight (every 0.5 s)
    crewT -= dt; if (crewT <= 0 && !veh.dead) { crewT = 0.5; let seen = 0;
      for (let i = 0; i < MAXM; i++) { if (MS[i] !== 1 || MR[i]) continue; const dx = MX[i] - veh.x, dz = MZ[i] - veh.z, d = Math.hypot(dx, dz);
        if (d < 30 && d > 2 && Math.abs(wrap(Math.atan2(-dx, -dz) - aim.yaw)) < 0.45 && losVis(veh.x, veh.y + 3, veh.z, MX[i], MY[i] + 0.2, MZ[i]) > 0.3) { MR[i] = 1; mesh(i); seen++; } }
      if (seen) ui.toast('Disturbed snow ahead — possible mines — marked'); }
    // rocket strike: due in this wave, then the warning, then the scatter
    if (rlAt > 0 && G.state === 1 && G.wt >= rlAt && !veh.dead) { rlAt = -1; strike(); }
    if (rlT > 0) { rlT -= dt; if (rlT <= 0) { flashAdd(rlX, hAt(rlX, rlZ) + 75, rlZ, 2, 0.12, 30, 20, 8); C.sfx('boom', rlX, hAt(rlX, rlZ) + 75, rlZ, 0.3);
      for (let k = 0; k < 10; k++) { const a = rnd() * 6.283, r = 18 + rnd() * 62; mineAt(rlX + Math.sin(a) * r, rlZ - Math.cos(a) * r, 3, 0.5 + k * 0.12 + rnd() * 0.2); } } }
    // track repair: the pill counts down, a clank every so often
    if (veh.immob > 0) { const s = Math.ceil(veh.immob); if (s !== immS) { immS = s; hudDirty = true; } fixT -= dt; if (fixT <= 0) { fixT = 1.1 + rnd() * 0.6; C.sfx('reload', veh.x, veh.y + 0.8, veh.z, 0.3); } }
    else if (immS >= 0) { immS = -1; hudDirty = true; }
  }
  // drones see mines (buried ones by the disturbed snow) inside their camera cone
  function droneMines(fx, fy, fz, range) {
    let n = 0;
    for (let i = 0; i < MAXM; i++) { if ((MS[i] !== 1 && MS[i] !== 2) || MR[i]) continue; const dx = MX[i] - D.x, dy = MY[i] - D.y, dz = MZ[i] - D.z, dd = Math.hypot(dx, dy, dz);
      if (dd > range || (dx * fx + dy * fy + dz * fz) / dd < 0.72) continue; if (losVis(D.x, D.y, D.z, MX[i], MY[i] + 0.3, MZ[i]) > 0.1) { MR[i] = 1; mesh(i); n++; } }
    if (n) ui.toast(`Drone: ${n} mine${n > 1 ? 's' : ''} spotted — marked`);
  }
  function minesReset() { MS.fill(0); MR.fill(0); MP.fill(0); FLD.fill(0); rlAt = -1; rlT = 0; for (let i = 0; i < MAXM; i++) mesh(i); }

  // ---------- per-frame update ----------
  G.update = (dt) => {
    G.fxN = 0; // (blastN is cleared by the renderer once the scorch stamps are drawn)
    const gM = C.gunM;
    // main gun
    if (G.rl > 0 && !veh.dead) { G.rl -= dt; if (G.rl <= 0) { G.rl = 0; C.sfx('reload', veh.x, veh.y + 2, veh.z, 1); } }
    R.reload = 1 - G.rl / RELOAD; dryT -= dt;
    if (!inp.fire) fireBlock = false;
    if (inp.fire && !veh.dead && !R.pose && !D.on && D.hold <= 0 && !fireBlock) {
      if (G.n[G.sel] <= 0) { if (dryT <= 0) { dryT = 1.5; ui.toast('Out of ' + AMMO[G.sel].name); } }
      else if (G.rl <= 0) {
        G.n[G.sel]--; G.rl = RELOAD; hudDirty = true;
        fire(0, G.sel, aim.mx, aim.my, aim.mz, aim.gx, aim.gy, aim.gz, AMMO[G.sel].v, 0.0005, 5);
        muzzle(aim.mx, aim.my, aim.mz, aim.gx, aim.gy, aim.gz, 1);
        C.sfx('gun', aim.mx, aim.my, aim.mz, 1);
        veh.recoil = 0.34; veh.dpV += 0.55 * Math.cos(veh.turYaw); veh.drV -= 0.55 * Math.sin(veh.turYaw); veh.shake = Math.max(veh.shake, 0.75); veh.v -= 0.5 * Math.cos(veh.turYaw);
      }
    }
    // coaxial MG3: the fire control corrects for its steeper trajectory at the lased range
    if ((G.mgOn = inp.mg && !veh.dead && G.mg > 0)) {
      mgT += dt * 18;
      while (mgT >= 1 && G.mg > 0) { mgT--; G.mg--;
        const px = gM[0] * -0.32 + gM[4] * (LEO.gy + 0.15) + gM[8] * -2.4 + gM[12], py = gM[1] * -0.32 + gM[5] * (LEO.gy + 0.15) + gM[9] * -2.4 + gM[13], pz = gM[2] * -0.32 + gM[6] * (LEO.gy + 0.15) + gM[10] * -2.4 + gM[14];
        // the coax follows the sight's aim point (its own fire control: parallax to the sight head and the MG's drop) while the gun is laid near it; otherwise it fires along the bore
        let cx = aim.x - px, cy = aim.y - py, cz = aim.z - pz; const cl = Math.hypot(cx, cy, cz) || 1, tg = Math.min(cl, 1500) / MGV; let drop = 0.5 * GRAV * tg * tg; // hold-over aiming straight at the point
        if ((cx * aim.gx + cy * aim.gy + cz * aim.gz) / cl < 0.99) { const r = Math.min(aim.range, 1500); cx = aim.gx * cl; cy = (aim.gy + 0.5 * GRAV * r * (1 / (MGV * MGV) - 1 / (R.shellV * R.shellV))) * cl; cz = aim.gz * cl; drop = 0; } // along the bore: the bore already holds over for the main gun, add only the difference
        fire(0, 3, px, py, pz, cx / cl, (cy + drop) / cl, cz / cl, MGV, 0.0035, 2.2);
        if ((G.mg & 1) === 0) glow(px + aim.gx * 0.4, py + aim.gy * 0.4, pz + aim.gz * 0.4, 0.7, 26, 14, 4);
        if (rnd() < 0.3) parts.emit(px, py, pz, aim.gx * 3 + sr(), 0.6, aim.gz * 3 + sr(), 0.5, 0.15, 0.6, 1, 0.3, 0.3, 0.31, 0.25);
      }
      if (Math.ceil(G.mg / 50) * 50 !== lastMg) hudDirty = true;
    } else mgT = Math.min(mgT, 1);
    // smoke clouds
    for (let c = 0; c < 16; c++) { const o = c * 5; if (CL[o + 4] < 1) continue; CL[o + 3] += dt; const gh = hAt(CL[o], CL[o + 2]); CL[o + 1] = Math.max(gh + 1.8, CL[o + 1] - 3 * dt);
      if (CL[o + 3] > 24) { CL[o + 4] = 0; continue; }
      if (CL[o + 3] < 13 && rnd() < dt * 8) parts.emit(CL[o] + sr() * 7, CL[o + 1] + sr() * 3, CL[o + 2] + sr() * 7, sr() * 0.8, 0.15 + rnd() * 0.3, sr() * 0.8, 9 + rnd() * 5, 3.4 + rnd() * 2.6, 0.5, 5, 0.66, 0.67, 0.7, 0.72); }
    // waves
    if (!G.peace && !veh.dead) {
      let alive = 0; for (const e of G.enemies) if (e.on && !e.dead) alive++;
      if (G.state === 0) { G.timer -= dt; if (G.timer <= 0) { G.wave++; G.wt = 0;
        for (const e of G.enemies) if (e.on && e.dead && Math.hypot(e.x - veh.x, e.z - veh.z) > 500) e.on = false; // recycle distant wrecks
        G.plan = planWave(G.wave); const more = PQ.slice(0, pqN).some((q) => q.ann); releaseWave(1e9);
        const mf = planFields(G.wave); rlAt = G.wave >= 3 && rnd() < 0.55 ? 35 + rnd() * 45 : -1; // minefields ahead; maybe a rocket-laid strike later in the wave
        G.state = 1; hudDirty = true; announce(`Wave ${G.wave} — ${G.plan}: `, mf ? ` · Mines reported on the roads to the ${mf}` : ''); if (more) setTimeout(() => { if (G.state === 1) ui.toast('More enemy movement reported — watch your flanks'); }, 3500); } }
      else {
        G.wt += dt; // the wave clock runs for the whole wave (scheduled strikes come after the last reinforcement too)
        if (pqN > 0) { const m = releaseWave(alive); if (m) { alive += m; hudDirty = true; if (annNow) announce('Contact! '); } } // staggered groups and reinforcements
        if (alive === 0 && pqN === 0) { G.state = 0; G.timer = 9; G.score += 150 * G.wave; hudDirty = true;
        for (let i = 0; i < 3; i++) G.n[i] = Math.min(AMMO[i].max, G.n[i] + [7, 4, 3][i]); G.mg = Math.min(2000, G.mg + 500); G.smokeN = Math.min(2, G.smokeN + 1); veh.hp = Math.min(100, veh.hp + 25);
        if (G.wave === WAVES && !G.won) { G.won = true; ui.over('Nordmarka held', `All ${WAVES} waves beaten · ${G.kills} vehicles destroyed · score ${G.score}. Press R to start over, or close this and keep fighting.`, true); }
        else ui.toast(`Wave ${G.wave} cleared — resupplied`); } }
    }
    G.rep = G.spot ? G.rep + dt : 0; G.spot = false; // how long some crew has held the player in sight
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (e.on) updateEnemy(e, dt, i); }
    // vehicles are solid for each other
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on) continue; const dx = veh.x - e.x, dz = veh.z - e.z, d = Math.hypot(dx, dz); if (d < 5.6 && d > 0.01) { const k = (5.6 - d) / d; veh.x += dx * k; veh.z += dz * k; veh.v *= 0.9; } }
    updateShells(dt); updateMines(dt);
    for (let f = 0; f < 8; f++) { const o = f * 5; if (FI[o + 3] <= 0) continue; FI[o + 3] -= dt; const r = FI[o + 4]; // collapsed buildings burn for a few seconds
      if (rnd() < dt * 22) parts.emit(FI[o] + sr() * r, FI[o + 1] + 0.6 + rnd(), FI[o + 2] + sr() * r, sr(), 2 + rnd() * 2.5, sr(), 1 + rnd() * 0.8, 0.9 + rnd() * 1.1, 1.2, 4, 0.06, 0.06, 0.06, 0.85);
      if ((R.frame & 1) === 0) glow(FI[o] + sr() * r * 0.6, FI[o + 1] + 1.4, FI[o + 2] + sr() * r * 0.6, 2.6 + rnd() * 1.6, 9, 3.5, 0.8); }
    if (G.burnP > 0) { G.burnP += dt; if (rnd() < dt * (G.burnP < 30 ? 9 : 3)) parts.emit(veh.x + sr() * 1.6, veh.y + 1.8 + rnd(), veh.z + sr() * 2.4, sr(), 2 + rnd() * 2, sr(), G.burnP < 30 ? 1.4 + rnd() : 5 + rnd() * 3, 0.7 + rnd() * 0.6, 1.2, G.burnP < 30 ? 4 : 1, 0.1, 0.1, 0.1, 0.7); }
    // flashes -> glow sprites, flash light decay, timers
    for (let i = 0; i < 24; i++) { const o = i * 8; if (FL[o + 4] <= 0) continue; FL[o + 4] -= dt; const k = Math.max(0, FL[o + 4] / FL[o + 5]); glow(FL[o], FL[o + 1], FL[o + 2], FL[o + 3] * (1.3 - 0.3 * k), FL[o + 6] * k, FL[o + 7] * k, FL[o + 7] * 0.3 * k); }
    G.flash[7] *= 1 - Math.min(1, dt * 11);
    R.hitT = Math.max(0, (R.hitT || 0) - dt); R.hurtT = Math.max(0, (R.hurtT || 0) - dt * 1.6);
    if (veh.immob > 0) { veh.immob -= dt; if (veh.immob <= 0) ui.toast('Track repaired'); }
    updateDrone(dt); fireWas = inp.fire;
    if (hudDirty) hud();
    mapT -= dt; if (mapT <= 0 && !R.simOnly) { mapT = 0.2; drawMap(); }
  };
  G.ammo = (i) => { if (i < 0) i = (G.sel + 1) % 3; if (i === G.sel || veh.dead) return; G.sel = i; R.shellV = AMMO[i].v; G.rl = RELOAD; hudDirty = true; ui.toast('Loading ' + AMMO[i].name); };
  G.smoke = () => {
    if (veh.dead) return; if (G.smokeN <= 0) { ui.toast('No smoke grenades left'); return; }
    G.smokeN--; hudDirty = true; C.sfx('smoke', veh.x, veh.y + 2.2, veh.z, 1); const a = veh.yaw + veh.turYaw, T = C.turM;
    for (let k = 0; k < 8; k++) { const sd = k < 4 ? -1 : 1, o = sd * (0.25 + (k % 4) * 0.33), dx = -Math.sin(a - o) * 0.82, dz = -Math.cos(a - o) * 0.82, lx = sd * 1.65, ly = 2.1, lz = 0.7;
      fire(0, 6, T[0] * lx + T[4] * ly + T[8] * lz + T[12], T[1] * lx + T[5] * ly + T[9] * lz + T[13], T[2] * lx + T[6] * ly + T[10] * lz + T[14], dx, 0.57, dz, 24 + (k % 4) * 3, 0.03, 1.15 + rnd() * 0.2); }
    ui.toast('Smoke!');
  };
  // ---------- drones: FPV (one-way shaped charge), bomber (drops VOG grenades), recon (high and long, spots for the map) ----------
  function droneEnd(msg) { D.on = false; D.iok = false; cam.mode = 0; R.snap = true; hudDirty = true; fireBlock = true; if (msg) ui.toast(msg); }
  function droneBoom() {
    explode(D.x, D.y, D.z, 1.9); splash(D.x, D.y, D.z, 4, 115, 140, 0);
    const db = C.bld.at(D.x, D.y, D.z, 0.9); if (db >= 0) bldHit(db, 100, D.x, D.y, D.z, true); C.bld.splash(D.x, D.y, D.z, 5, 30, db, bldFx);
    if (D.y - hAt(D.x, D.z) < 3) mineHit(D.x, D.z, 3.5);
    const d = Math.hypot(veh.x - D.x, veh.y + 1 - D.y, veh.z - D.z); if (d < 6.5) hurtPlayer(35 * clamp(1 - (d - 2.5) / 4, 0, 1), 1, false);
    D.on = false; D.vx = D.vy = D.vz = 0; D.hold = 4.5; D.bx = D.x; D.by = D.y; D.bz = D.z; hudDirty = true; // the camera stays on the blast (see updateCamera), then returns to the tank
  }
  // bomber: where a grenade released now would land (ballistic fall from the drone's height and velocity; ground, roofs and vehicles stop it)
  // where the grenade stops: the same tests as updateShells (ground, round colliders, vehicles, buildings)
  const dropHit = (x, y, z) => { if (y < hAt(x, z)) return true; if (y < hAt(x, z) + 9 && C.collAt(x, z)) return true; if (y < hAt(x, z) + 4) for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (e.on && inside(e, ETYPE[e.type].K, x, y, z)) return true; } return C.bld.at(x, y, z, 0) >= 0; };
  function predictDrop() {
    let x = D.x, y = D.y - 0.25, z = D.z, vy = D.vy - 0.3; const h = 0.04; D.iok = false;
    for (let k = 0; k < 400; k++) {
      const nx = x + D.vx * h, ny = y + (vy - GRAV * h * 0.5) * h, nz = z + D.vz * h; vy -= GRAV * h;
      if (dropHit(nx, ny, nz)) { let a = 0, b = 1; for (let it = 0; it < 6; it++) { const m = (a + b) * 0.5; if (dropHit(x + (nx - x) * m, y + (ny - y) * m, z + (nz - z) * m)) b = m; else a = m; } // refine to the surface
        D.ix = x + (nx - x) * b; D.iz = z + (nz - z) * b; D.iy = Math.max(y + (ny - y) * b, hAt(D.ix, D.iz)); D.iok = true; return; }
      x = nx; y = ny; z = nz;
    }
  }
  // drone sensor: enemies inside the camera's view cone with a clear line are marked on the map (staggered: every 0.3 s)
  function droneScan(T) {
    const cp = Math.cos(D.pitch), fx = -Math.sin(D.yaw) * cp, fy = Math.sin(D.pitch), fz = -Math.cos(D.yaw) * cp;
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on || e.dead) continue;
      const dx = e.x - D.x, dy = e.y + 1.5 - D.y, dz = e.z - D.z, dd = Math.hypot(dx, dy, dz); if (dd > T.see || dd < 1) continue;
      if ((dx * fx + dy * fy + dz * fz) / dd < 0.72) continue; // about ±44°, the wide drone camera
      if (losVis(D.x, D.y, D.z, e.x, e.y + 1.5, e.z) > 0.15) e.spotT = Math.max(e.spotT, T.mark); }
    droneMines(fx, fy, fz, D.type ? 450 : 250);
  }
  function updateDrone(dt) {
    if (!D.on) { if (D.hold > 0) { D.hold -= dt; if (D.hold <= 0 || veh.dead || (inp.fire && !fireWas)) { D.hold = 0; droneEnd(null); } } return; }
    if (veh.dead) { droneEnd('Drone link lost'); return; }
    const T = DTYPE[D.type], g0 = hAt(D.x, D.z);
    D.t -= dt; D.spin += dt * 95;
    if (D.type === 0) { // FPV: flies where the camera points
      const cp = Math.cos(D.pitch), fx = -Math.sin(D.yaw) * cp, fy = Math.sin(D.pitch), fz = -Math.cos(D.yaw) * cp, rx = Math.cos(D.yaw), rz = -Math.sin(D.yaw), k = Math.min(1, dt * 2.6);
      D.vx += ((fx * inp.mvZ + rx * inp.mvX) * T.v - D.vx) * k; D.vy += ((fy * inp.mvZ + inp.mvY * 0.55) * T.v - D.vy) * k; D.vz += ((fz * inp.mvZ + rz * inp.mvX) * T.v - D.vz) * k;
    } else { // bomber and recon: level flight on the heading, a stiff hover, height from Space/Shift (and the climb after launch); the camera gimbal tilts freely
      const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw), rx = Math.cos(D.yaw), rz = -Math.sin(D.yaw), k = Math.min(1, dt * (D.type === 1 ? 3.2 : 2));
      let vy = inp.mvY * (D.type === 2 ? 10 : 5);
      if (D.climb > 0) { if (inp.mvY !== 0 || D.y - g0 > D.climb) D.climb = 0; else vy = D.type === 2 ? 14 : 7; }
      D.vx += ((fx * inp.mvZ + rx * inp.mvX) * T.v - D.vx) * k; D.vy += (vy - D.vy) * k; D.vz += ((fz * inp.mvZ + rz * inp.mvX) * T.v - D.vz) * k;
    }
    D.x = clamp(D.x + D.vx * dt, -HALF + 60, HALF - 60); D.y = Math.min(D.y + D.vy * dt, g0 + 250); D.z = clamp(D.z + D.vz * dt, -HALF + 60, HALF - 60);
    const lean = D.type ? 0.22 : 0.38; D.tp += (-inp.mvZ * lean - D.tp) * Math.min(1, dt * 5); D.tr += (-inp.mvX * lean - D.tr) * Math.min(1, dt * 5); // lean into the motion
    const gh = hAt(D.x, D.z), press = inp.fire && !fireWas; let boom = D.type === 0 && press, crash = false;
    if (D.y < gh + 0.35) { if (Math.hypot(D.vx, D.vy, D.vz) > 9) crash = true; else { D.y = gh + 0.35; D.vy = Math.max(0, D.vy); } }
    if ((D.y < gh + 8 && C.collAt(D.x, D.z)) || C.bld.at(D.x, D.y, D.z, 0.3) >= 0) crash = true;
    for (let i = 0; i < MAXE && !crash; i++) { const e = G.enemies[i]; if (e.on && inside(e, ETYPE[e.type].K, D.x, D.y, D.z)) crash = true; }
    if (D.type === 0 && (boom || crash)) { droneBoom(); return; }
    if (crash) { explode(D.x, D.y, D.z, 0.35); droneEnd((D.type === 1 ? 'Bomber' : 'Recon drone') + ' crashed — lost'); return; }
    if (D.type === 1) { // drop a grenade; the predicted impact point is drawn as the marker in the drone view
      D.rel -= dt;
      if (press) { if (D.bombs > 0 && D.rel <= 0) { D.bombs--; D.drops++; D.rel = BOMB_RL; hudDirty = true; const vy = D.vy - 0.3; fire(0, 7, D.x, D.y - 0.25, D.z, D.vx, vy, D.vz, Math.max(0.01, Math.hypot(D.vx, vy, D.vz)), 0, 30); C.sfx('reload', D.x, D.y, D.z, 0.4); if (!D.bombs) ui.toast('Grenades gone — fly back and land on the tank to rearm, or X to cut the link'); }
        else if (!D.bombs) ui.toast('No grenades left — land on the tank'); }
      if (cam.mode === 4) predictDrop(); else D.iok = false;
    } else if (D.type === 2 && press) ui.toast('Recon drone: unarmed — spotted enemies go on the map');
    // bomber and recon land back on the tank (on the engine deck, slowly) and are ready again
    const dv = Math.hypot(D.x - veh.x, D.z - veh.z); if (dv > 15) D.away = true;
    if (D.type && D.away && dv < 4.5 && D.y < veh.y + 4.5 && Math.hypot(D.vx, D.vy, D.vz) < 5) { G.dn[D.type]++; droneEnd(D.type === 1 ? 'Bomber landed — rearmed' : 'Recon drone landed'); return; }
    if (D.t <= 0) { droneEnd('Drone battery empty — lost'); return; }
    if (dv > T.r) { droneEnd('Drone out of radio range — lost'); return; }
    D.scan -= dt; if (D.scan <= 0) { D.scan = 0.3; droneScan(T); }
    const sec = Math.ceil(D.t); if (sec !== D.sec) { D.sec = sec; hudDirty = true; }
    droneParts(C.dobj, D); C.dobj[131] = 1;
  }
  // X: launch the selected drone type from the turret roof, or cut the link to the one in the air (it is lost)
  G.droneKey = () => {
    if (D.hold > 0) { D.hold = 0; droneEnd(null); return; }
    if (D.on) { droneEnd('Drone link cut — back in the tank'); return; }
    if (veh.dead || cam.mode === 3) return;
    const ty = G.dsel, T = DTYPE[ty];
    if (G.dn[ty] <= 0) { ui.toast(`No ${T.name} drones left` + (G.dn[0] + G.dn[1] + G.dn[2] ? ' — Z picks another type' : '')); return; }
    G.dn[ty]--; Object.assign(D, { on: true, type: ty, x: veh.x, y: veh.y + 3.4, z: veh.z, vx: 0, vy: 5, vz: 0, yaw: aim.yaw, pitch: ty ? -0.5 : -0.12, t: T.t, spin: 0, tp: 0, tr: 0, sec: T.t,
      bombs: ty === 1 ? BOMBS : 0, rel: 0, climb: T.climb, away: false, scan: 0, iok: false });
    cam.mode = 4; R.snap = true; hudDirty = true; droneParts(C.dobj, D); C.dobj[131] = 1;
    ui.toast(ty === 0 ? 'FPV away — WASD fly · Space/Shift up/down · LMB detonate · X back to the tank'
      : ty === 1 ? 'Bomber away — WASD fly · mouse tilts the camera · LMB drops a grenade on the marker · land on the tank to rearm'
        : 'Recon drone climbing — enemies in its camera go on the map · land on the tank to recover it');
  };
  // Z: pick the drone type for the next launch
  G.droneType = (i) => {
    if (D.on) { ui.toast('Land the drone or cut the link first'); return; }
    G.dsel = i === undefined || i < 0 ? (G.dsel + 1) % 3 : i; hudDirty = true;
    const T = DTYPE[G.dsel]; ui.toast(`Drone: ${T.name} (${G.dn[G.dsel]} left)` + [' — one-way shaped charge', ' — hovers and drops grenades', ' — flies high and spots for the map'][G.dsel]);
  };
  G.restart = () => {
    for (const e of G.enemies) e.on = false; minesReset(); veh.immob = 0; pqN = 0; G.bag = null; G.lastAxis = NaN; S.fill(0); CL.fill(0); FI.fill(0); C.bld.restore();
    D.on = false; D.hold = 0; if (cam.mode === 4) cam.mode = 0;
    for (let i = 0; i < 3; i++) G.dn[i] = DTYPE[i].n; D.iok = false;
    Object.assign(G, { sel: 0, mg: 2000, smokeN: 2, rl: 0, wave: 0, kills: 0, timer: 6, state: 0, won: false, score: 0, burnP: 0 }); G.n[0] = 20; G.n[1] = 12; G.n[2] = 10; R.shellV = AMMO[0].v;
    Object.assign(veh, { x: W.start.x, z: W.start.z, yaw: W.start.yaw, v: 0, hp: 100, dead: false, immob: 0, tl: 0, tt: 0, turYaw: 0, gunPitch: 0 }); veh.y = veh.gPrev = hAt(veh.x, veh.z); aim.yaw = veh.yaw; aim.pitch = 0;
    R.snap = true; hudDirty = true; ui.over(null); ui.toast('Stand by — contact expected from the north');
  };
  // the sight ray also ranges on vehicles (returns the nearer distance)
  G.aimHit = (ox, oy, oz, dx, dy, dz, t) => {
    const tb = C.bld.ray(ox, oy, oz, ox + dx * t, oy + dy * t, oz + dz * t, false); if (tb < 1) t *= tb;
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on) continue; const cx = e.x - ox, cy = e.y + 1.3 - oy, cz = e.z - oz, b = cx * dx + cy * dy + cz * dz, q = cx * cx + cy * cy + cz * cz - b * b; if (b > 0 && q < 6.8 && b - 1.5 < t) t = b - Math.sqrt(6.8 - q) * 0.6; }
    return t;
  };
  G.mines = { x: MX, z: MZ, y: MY, s: MS, r: MR, fld: FLD, lay: layField, at: mineAt, plan: planFields, strike, hit: mineHit, armed: () => { let n = 0; for (let i = 0; i < MAXM; i++) if (MS[i] === 1 || MS[i] === 2) n++; return n; } };
  G.spawn = spawn; G.ROLES = ROLES; G.pending = () => pqN; G.bldHit = bldHit; G.los = losBlocked; G.vis = losVis; G.hurt = hurtPlayer; G.S = S; G.inside = inside;
  hud();
  return G;
}
