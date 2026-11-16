// Weapons, projectiles, effects, enemy AI and the wave game.
// Everything is preallocated in initCombat(); update() and its helpers allocate nothing per frame.
import { clamp } from './math.js';
import { tankParts, droneParts, gunMat, LEO, T72, BMP } from './tank.js';

export const AMMO = [{ name: 'APFSDS', v: 1650, max: 20 }, { name: 'HEAT-MP', v: 1140, max: 12 }, { name: 'HE', v: 950, max: 10 }];
export const MAXE = 10, MAXG = 760;
const DRONES = 5, DRONE_T = 75, DRONE_V = 26, DRONE_R = 1500; // drones per game, battery (s), top speed (m/s), radio range (m)
const RELOAD = 6, MGV = 820, SN = 96, SS = 10, GRAV = 9.81, WAVES = 6;
// shell types: 0 APFSDS, 1 HEAT, 2 HE, 3 coax MG, 4 enemy 125 mm, 5 enemy 30 mm, 6 smoke grenade
const TRACE = [[34, 27, 14, 0.5, 7], [34, 17, 6, 0.5, 6], [34, 17, 6, 0.5, 6], [16, 4.5, 1.6, 0.22, 3], [9, 34, 11, 0.5, 7], [8, 24, 8, 0.3, 4], [0, 0, 0, 0, 0]];
const BDMG = [20, 45, 70, 0, 35, 3, 0]; // direct-hit damage to a building by shell type (the drone charge does 100)
const ETYPE = [{ K: T72, hp: 100, vmax: 9, slew: 0.45, v: 1700, shell: 4, reload: 8.5, range: 1500, burst: 1, name: 'T-72B3' }, { K: BMP, hp: 45, vmax: 12, slew: 0.7, v: 960, shell: 5, reload: 3.6, range: 950, burst: 5, name: 'BMP-2' }];

export function initCombat(C) {
  const { W, R, veh, aim, cam, inp, parts, rnd, ui, HALF, WS, HN, PLAY } = C, hAt = W.heightAt, trails = W.trails;
  const SO = new Float32Array(5), S = new Float32Array(SN * SS), CL = new Float32Array(16 * 5), FL = new Float32Array(24 * 8);
  const G = { fx: new Float32Array(MAXG * 12), fxN: 0, blasts: new Float32Array(16 * 4), blastN: 0, flash: new Float32Array(8), enemies: [], sel: 0, n: [20, 12, 10], mg: 2000, smokeN: 2, rl: 0, wave: 0, kills: 0, timer: 6, state: 0, won: false, score: 0, peace: !!C.peace };
  const D = G.drone = { on: false, hold: 0, bx: 0, by: 0, bz: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, t: 0, spin: 0, tp: 0, tr: 0, sec: -1 }; G.drones = DRONES;
  let fireWas = false, fireBlock = false;
  let sNext = 0, flNext = 0, clNext = 0, mgT = 0, mapT = 0, hudDirty = true, lastMg = -1, dryT = 0;
  for (let i = 0; i < MAXE; i++) G.enemies.push({ on: false, dead: false, type: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, dp: 0, dr: 0, tl: 0, tt: 0, tlV: 0, turYaw: 0, gunPitch: 0, recoil: 0, v: 0, hp: 0, state: 0, rl: 0, path: -1, pi: 0, dir: 1, burn: 0, burnt: 0, see: 0, losT: 0, los: false, known: 0, trL: 0, trR: 0, ex: 0, ey: 0, ez: 0, errT: 0, shots: 0, burstN: 0, burstT: 0, immob: false, evalT: 0, emT: 0, d: C.eobj[i] });
  const map = typeof document !== 'undefined' && document.getElementById('map'), mctx = map && map.getContext ? map.getContext('2d') : null;

  // ---------- small helpers ----------
  const glow = (x, y, z, size, r, g, b) => { if (G.fxN >= MAXG) return; const o = G.fxN++ * 12, f = G.fx; f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = size; f[o + 4] = r; f[o + 5] = g; f[o + 6] = b; f[o + 7] = 0; f[o + 8] = 3; f[o + 9] = 0; f[o + 10] = 8; f[o + 11] = 0; };
  const flashAdd = (x, y, z, size, life, r, g, b) => { const o = flNext * 8; flNext = (flNext + 1) % 24; FL[o] = x; FL[o + 1] = y; FL[o + 2] = z; FL[o + 3] = size; FL[o + 4] = life; FL[o + 5] = life; FL[o + 6] = r; FL[o + 7] = g; const L = G.flash; L[0] = x; L[1] = y + 1; L[2] = z; L[3] = 30 + size * 9; L[4] = r * 0.5 * size; L[5] = g * 0.5 * size; L[6] = g * 0.2 * size; L[7] = 1; };
  const blast = (x, z, r, k) => { if (G.blastN >= 16) return; const o = G.blastN++ * 4; G.blasts[o] = x; G.blasts[o + 1] = z; G.blasts[o + 2] = r; G.blasts[o + 3] = k; };
  const sr = () => rnd() - 0.5;
  function fire(owner, type, x, y, z, dx, dy, dz, v, spread, life) {
    let i = sNext; for (let k = 0; k < SN; k++) { if (S[i * SS + 8] <= 0) break; i = (i + 1) % SN; } sNext = (i + 1) % SN;
    const o = i * SS; dx += sr() * spread; dy += sr() * spread; dz += sr() * spread; const l = v / Math.hypot(dx, dy, dz);
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = dx * l; S[o + 4] = dy * l; S[o + 5] = dz * l; S[o + 6] = type; S[o + 7] = owner; S[o + 8] = life;
  }
  function explode(x, y, z, s) {
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
  // line of sight: terrain, forest canopy (density raster) and smoke clouds
  function losBlocked(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, d = Math.hypot(dx, dy, dz), n = clamp(Math.ceil(d / 10), 6, 110), st = d / n; let can = 0;
    if (C.bld.seg(x0, y0, z0, x1, y1, z1)) return true; // intact and damaged buildings (rubble does not block)
    for (let k = 1; k < n; k++) {
      const f = k / n, x = x0 + dx * f, y = y0 + dy * f, z = z0 + dz * f, g = hAt(x, z);
      if (y < g + 0.4) return true;
      if (R.trees && y < g + 10) { const i = clamp(((x + HALF) / WS * HN) | 0, 0, HN - 1), j = clamp(((z + HALF) / WS * HN) | 0, 0, HN - 1); can += W.nrm[(j * HN + i) * 4 + 2] * st; if (can > 9500) return true; }
    }
    for (let c = 0; c < 16; c++) { const o = c * 5; if (CL[o + 4] < 1 || CL[o + 3] < 1.2 || CL[o + 3] > 22) continue;
      const t = clamp(((CL[o] - x0) * dx + (CL[o + 1] - y0) * dy + (CL[o + 2] - z0) * dz) / (d * d), 0, 1); if (Math.hypot(x0 + dx * t - CL[o], y0 + dy * t - CL[o + 1], z0 + dz * t - CL[o + 2]) < 10) return true; }
    return false;
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
    e.dead = true; e.hp = 0; e.burn = 0.01; e.state = 3; e.v = 0; G.kills++; G.score += e.type ? 60 : 100; hudDirty = true;
    explode(e.x, e.y + 1.4, e.z, 2.4); explode(e.x, e.y + 0.4, e.z, 1.2);
    if (e.type === 0 && rnd() < 0.45) e.tlV = 7 + rnd() * 5; // ammunition cook-off throws the turret
    ui.toast(ETYPE[e.type].name + ' destroyed'); R.hitT = 0.6;
  }
  function hurtPlayer(d, fc, low) {
    if (veh.dead || R.god) return;
    veh.hp = Math.max(0, veh.hp - d); R.hurtT = Math.min(1, 0.35 + d * 0.03); veh.shake = Math.max(veh.shake, Math.min(1.2, d * 0.06)); hudDirty = true;
    if (fc === 1 && low && d > 10 && rnd() < 0.35 && veh.immob <= 0) { veh.immob = 6; ui.toast('Track hit — repairing'); }
    if (veh.hp <= 0) { veh.dead = true; veh.tl = 0.12; veh.tt = 0.14; explode(veh.x, veh.y + 1.6, veh.z, 2.6); G.burnP = 0.01; ui.over('Your Leopard was knocked out', `Wave ${G.wave} · ${G.kills} vehicles destroyed · score ${G.score}`); }
  }
  function hitVehicle(type, t, zone, fc, x, y, z) {
    if (t === veh) { const d = type === 4 ? [16, 30, 44][fc] * (zone === 2 ? 0.8 : 1) : type === 5 ? [1.5, 4, 7][fc] : 0; if (d) hurtPlayer(d, fc, y - veh.y < 0.95); return; }
    if (t.dead) return;
    let d = 0;
    if (t.type === 0) { if (type < 3) d = DT72[type][fc] * (zone === 2 && fc === 0 ? 0.85 : 1); }
    else d = type === 0 ? 100 : type === 1 ? 130 : type === 2 ? 110 : 3;
    if (d <= 0) return;
    t.hp -= d * (0.85 + rnd() * 0.3); t.known = 15; if (type !== 3 || R.hitT < 0.1) R.hitT = 0.3;
    if (type < 3 && fc === 1 && y - t.y < 0.95 && rnd() < 0.4) t.immob = true;
    t.dpV = 0; t.see = Math.max(t.see, 1.2); // it now knows where the shot came from
    if (t.hp <= 0) kill(t); else if (type < 3) ui.toast(fc === 0 ? 'Hit — frontal armour held' : 'Hit');
  }
  function splash(x, y, z, r, dT, dB, owner) {
    if (owner === 0) { for (const e of G.enemies) { if (!e.on || e.dead) continue; const d = Math.hypot(e.x - x, e.y + 1 - y, e.z - z); if (d < r + 2.5) { e.hp -= (e.type ? dB : dT) * clamp(1 - (d - 2.5) / r, 0, 1); e.known = 15; if (e.hp <= 0) kill(e); } } }
    else { const d = Math.hypot(veh.x - x, veh.y + 1 - y, veh.z - z); if (d < r + 2.5) hurtPlayer(dT * clamp(1 - (d - 2.5) / r, 0, 1), 1, false); }
  }
  function impact(type, owner, x, y, z, t, zone, fc) {
    if (t) hitVehicle(type, t, zone, fc, x, y, z);
    if (type === 0 || type === 4) { explode(x, y, z, t ? 0.9 : 0.55); if (t) for (let i = 0; i < 14; i++) parts.emit(x, y, z, sr() * 14, rnd() * 9, sr() * 14, 0.3 + rnd() * 0.4, 0.02 + rnd() * 0.02, 0, 0, 3, 2.2, 1, 1); }
    else if (type === 1) { explode(x, y, z, 1.7); splash(x, y, z, 3.5, 6, 40, owner); }
    else if (type === 2) { explode(x, y, z, 3.2); splash(x, y, z, 9, 12, 70, owner); C.bld.splash(x, y, z, 9, 30, bSkip, bldFx); }
    else if (type === 5) { explode(x, y, z, 0.4); }
    else if (type === 3) { if (t) glow(x, y, z, 0.5, 20, 12, 4); else for (let i = 0; i < 3; i++) parts.emit(x, y + 0.1, z, sr() * 2, 1.5 + rnd() * 2.5, sr() * 2, 0.4 + rnd() * 0.3, 0.012 + rnd() * 0.015, 0, 0, 1, 1, 1, 0.9); }
    else if (type === 6) smokeBurst(x, y, z);
  }
  function smokeBurst(x, y, z) { const o = clNext * 5; clNext = (clNext + 1) % 16; CL[o] = x; CL[o + 1] = Math.max(y, hAt(x, z) + 2); CL[o + 2] = z; CL[o + 3] = 0; CL[o + 4] = 1; flashAdd(x, y, z, 1.5, 0.08, 20, 18, 14); }

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
  function pathDir(e) { // walk the trail in the direction that closes on the player
    const t = trails[e.path], a = clamp(e.pi + 18, 0, t.n - 1), b = clamp(e.pi - 18, 0, t.n - 1);
    const da = Math.hypot(t.pts[a * 2] - veh.x, t.pts[a * 2 + 1] - veh.z), db = Math.hypot(t.pts[b * 2] - veh.x, t.pts[b * 2 + 1] - veh.z), d0 = Math.hypot(t.pts[e.pi * 2] - veh.x, t.pts[e.pi * 2 + 1] - veh.z);
    if (Math.min(da, db) > d0 - 4) return 0;
    return da < db ? 1 : -1;
  }
  function spawn(type) {
    let e = null; for (const q of G.enemies) if (!q.on) { e = q; break; } if (!e) return false;
    let bx = 0, bz = 0, bp = -1, bi = 0, best = -1;
    for (let k = 0; k < 260; k++) {
      const ti = (rnd() * trails.length) | 0, t = trails[ti]; if (t.n < 30) continue;
      const i = 4 + ((rnd() * (t.n - 8)) | 0), x = t.pts[i * 2], z = t.pts[i * 2 + 1], d = Math.hypot(x - veh.x, z - veh.z);
      if (Math.abs(x) > PLAY - 60 || Math.abs(z) > PLAY - 60 || d < 380) continue;
      let ok = true; for (const q of G.enemies) if (q.on && Math.hypot(q.x - x, q.z - z) < 45) { ok = false; break; } if (!ok) continue;
      const sc = (d > 480 && d < 900 ? 2 : 1) + (z < veh.z ? 1 : 0) + rnd(); // prefer 480–900 m away and to the north
      if (sc > best) { best = sc; bx = x; bz = z; bp = ti; bi = i; }
      if (best > 3.6) break;
    }
    if (bp < 0) return false;
    const E = ETYPE[type];
    Object.assign(e, { on: true, dead: false, type, x: bx, z: bz, y: hAt(bx, bz), pitch: 0, roll: 0, tl: 0, tt: 0, tlV: 0, turYaw: 0, gunPitch: 0, recoil: 0, v: 0, hp: E.hp, state: 0, rl: 3 + rnd() * 4, path: bp, pi: bi, burn: 0, burnt: 0, see: 0, losT: rnd() * 0.3, los: false, known: 0, shots: 0, burstN: 0, immob: false, evalT: 0, errT: 0 });
    e.dir = pathDir(e) || 1; const t = trails[bp], j = clamp(bi + e.dir, 0, t.n - 1); e.yaw = Math.atan2(-(t.pts[j * 2] - bx), -(t.pts[j * 2 + 1] - bz));
    return true;
  }
  function updateEnemy(e, dt, idx) {
    const E = ETYPE[e.type], K = E.K;
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
      if (e.losT <= 0) { e.losT = 0.28; e.los = !veh.dead && d < 2200 && !losBlocked(e.x, e.y + 2.2, e.z, veh.x, veh.y + 1.9, veh.z); }
      if (e.los) { e.see += dt; e.known = Math.max(e.known, d < 1300 ? 12 : 0); } else e.see = Math.max(0, e.see - dt * 0.6);
      e.known -= dt;
      const engage = e.los && d < E.range && e.see > 0.4;
      e.state = engage && (d < 700 || e.see > 1) ? 1 : 0;
      // movement: follow the trail towards the player, hold at stand-off range once in contact
      let tgt = 0, st = 0;
      if (!e.immob && !(e.state === 1 && d < 650) && d > 70) {
        e.evalT -= dt; if (e.evalT <= 0 && e.path >= 0) { e.evalT = 5; const nd = pathDir(e); if (nd === 0) e.path = -1; else e.dir = nd; }
        let tx = veh.x, tz = veh.z;
        if (e.path >= 0) { const t = trails[e.path]; while (Math.hypot(t.pts[e.pi * 2] - e.x, t.pts[e.pi * 2 + 1] - e.z) < 8) { e.pi += e.dir; if (e.pi < 0 || e.pi >= t.n) { e.path = -1; break; } } if (e.path >= 0) { tx = t.pts[e.pi * 2]; tz = t.pts[e.pi * 2 + 1]; } }
        let a = Math.atan2(-(tx - e.x), -(tz - e.z)) - e.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        st = clamp(a * 2.2, -1, 1); tgt = E.vmax * (e.path < 0 ? 0.55 : 1) * (1 - 0.6 * Math.abs(st));
      }
      for (let j = 0; j < MAXE; j++) { const q = G.enemies[j]; if (q === e || !q.on) continue; const qx = e.x - q.x, qz = e.z - q.z, qd = Math.hypot(qx, qz); if (qd < 7 && qd > 0.01) { const k = (7 - qd) / qd * (q.dead ? 1 : 0.5); e.x += qx * k; e.z += qz * k; } }
      e.v += (tgt - e.v) * Math.min(1, dt * 0.9); const yr = st * 0.55 * (e.v > 0.5 || tgt > 0 ? 1 : 0);
      e.yaw += yr * dt; e.x = clamp(e.x - Math.sin(e.yaw) * e.v * dt, -PLAY, PLAY); e.z = clamp(e.z - Math.cos(e.yaw) * e.v * dt, -PLAY, PLAY);
      for (let s = -1; s <= 1; s++) { const px = e.x - Math.sin(e.yaw) * 1.8 * s, pz = e.z - Math.cos(e.yaw) * 1.8 * s; if (C.solid(px, pz, 1.9, SO)) { e.x += SO[0] - px; e.z += SO[1] - pz; e.v *= 0.92; } } // buildings and colliders are solid
      if (C.bld.rubble(e.x, e.z)) e.v = Math.min(e.v, 4.5);
      e.trL += (e.v + yr * 1.43) * dt; e.trR += (e.v - yr * 1.43) * dt;
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), hl = K.hl, hw = K.hw;
      const a = hAt(e.x + fx * hl - fz * hw, e.z + fz * hl + fx * hw), b = hAt(e.x + fx * hl + fz * hw, e.z + fz * hl - fx * hw), c = hAt(e.x - fx * hl - fz * hw, e.z - fz * hl + fx * hw), dd = hAt(e.x - fx * hl + fz * hw, e.z - fz * hl - fx * hw), k = Math.min(1, dt * 8);
      e.y = (a + b + c + dd) / 4 + 0.02; e.pitch += (Math.atan2((a + b - c - dd) / 2, hl * 2) - e.pitch) * k; e.roll += (Math.atan2((a + c - b - dd) / 2, hw * 2) - e.roll) * k;
      // gunnery: lead, an aim error that settles with each shot, ballistic elevation
      e.errT -= dt;
      if (e.errT <= 0) { e.errT = 2.2; const sg = (1.1 + d * 0.0042 + Math.abs(veh.v) * 0.22) * (1 + 2.2 / (1 + e.shots)) * (R.easy || 1); e.ex = (rnd() + rnd() + rnd() - 1.5) * sg; e.ey = (rnd() + rnd() + rnd() - 1.5) * sg * 0.45; e.ez = (rnd() + rnd() + rnd() - 1.5) * sg; }
      const M = e.d, ox = M[4] * K.gy + M[8] * K.gz + M[12], oy = M[5] * K.gy + M[9] * K.gz + M[13], oz = M[6] * K.gy + M[10] * K.gz + M[14];
      let wx = fx, wy = 0, wz = fz;
      if (e.see > 0.2 || e.known > 0) {
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
      else if (engage && !G.peace && e.rl <= 0 && Math.hypot(dyaw, dpt) < 0.012 && e.see > (e.shots ? 0.6 : 1.6)) { e.rl = E.reload * (0.9 + rnd() * 0.3); e.shots++; e.fire = true; e.burstN = E.burst - 1; e.burstT = 0.2; }
    }
    tankParts(e.d, e, K); e.d[128] = e.trL; e.d[129] = e.trR; e.d[130] = e.burnt; e.d[131] = 1;
    if (e.fire) { e.fire = false; const M = gunMat(), mx = M[4] * K.gy + M[8] * K.mz + M[12], my = M[5] * K.gy + M[9] * K.mz + M[13], mz = M[6] * K.gy + M[10] * K.mz + M[14], l = -1 / Math.hypot(M[8], M[9], M[10]);
      const E2 = ETYPE[e.type]; fire(1, E2.shell, mx, my, mz, M[8] * l, M[9] * l, M[10] * l, E2.v, e.type ? 0.004 : 0.0016, 4);
      muzzle(mx, my, mz, M[8] * l, M[9] * l, M[10] * l, e.type ? 0.3 : 1); e.recoil = e.type ? 0.05 : 0.3; e.known = 14; }
  }

  // ---------- HUD ----------
  function hud() {
    hudDirty = false; lastMg = Math.ceil(G.mg / 50) * 50;
    const hp = Math.ceil(veh.hp);
    ui.set('sH', 'HULL ' + hp, 'st ' + (hp > 60 ? 'on' : hp > 30 ? 'warn' : 'bad'));
    ui.set('sA', AMMO[G.sel].name + ' ' + G.n[G.sel], 'st ' + (G.n[G.sel] ? 'on' : 'bad'));
    ui.set('sM', 'MG ' + lastMg, 'st'); ui.set('sK', 'SMOKE ' + G.smokeN, 'st');
    ui.set('sD', D.on ? 'DRONE ' + D.sec + ' s' : 'DRONE ' + G.drones, 'st' + (D.on ? (D.sec > 15 ? ' on' : ' warn') : ''));
    ui.set('wave', G.peace ? 'FREE ROAM' : (G.wave ? 'WAVE ' + G.wave + (G.won ? '' : '/' + WAVES) : 'STAND BY') + ' · ' + G.kills + ' KILLS · ' + G.score);
  }
  function drawMap() {
    if (!mctx) return; const c = mctx, Wd = 176, sc = Wd / 1800, cx = Wd / 2;
    c.clearRect(0, 0, Wd, Wd);
    c.strokeStyle = '#ffffff30'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cx, 500 * sc, 0, 6.283); c.stroke();
    c.fillStyle = '#ffffff90'; c.fillRect(cx - 0.5, 3, 1, 6);
    const mx = D.on ? D.x : veh.x, mz = D.on ? D.z : veh.z; // the map follows the drone while it flies
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on || Math.abs(e.x - mx) > 900 || Math.abs(e.z - mz) > 900) continue; // datalink: everything within 900 m is plotted
      const x = clamp(cx + (e.x - mx) * sc, 4, Wd - 4), y = clamp(cx + (e.z - mz) * sc, 4, Wd - 4);
      c.fillStyle = e.dead ? '#59606a' : e.type ? '#ff9a3d' : '#ff4a3a'; if (e.type) c.fillRect(x - 2.5, y - 2.5, 5, 5); else { c.beginPath(); c.arc(x, y, 3.6, 0, 6.283); c.fill(); } }
    const a = veh.yaw, t = veh.yaw + veh.turYaw, vx = clamp(cx + (veh.x - mx) * sc, 6, Wd - 6), vy = clamp(cx + (veh.z - mz) * sc, 6, Wd - 6);
    c.strokeStyle = '#ffd36b'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(vx, vy); c.lineTo(vx - Math.sin(t) * 26, vy - Math.cos(t) * 26); c.stroke();
    c.fillStyle = '#7dffb0'; c.beginPath(); c.moveTo(vx - Math.sin(a) * 7, vy - Math.cos(a) * 7); c.lineTo(vx - Math.sin(a + 2.5) * 5, vy - Math.cos(a + 2.5) * 5); c.lineTo(vx - Math.sin(a - 2.5) * 5, vy - Math.cos(a - 2.5) * 5); c.fill();
    if (D.on) { const q = D.yaw; c.fillStyle = '#6fd6ff'; c.beginPath(); c.moveTo(cx - Math.sin(q) * 8, cx - Math.cos(q) * 8); c.lineTo(cx - Math.sin(q + 2.4) * 5, cx - Math.cos(q + 2.4) * 5); c.lineTo(cx - Math.sin(q - 2.4) * 5, cx - Math.cos(q - 2.4) * 5); c.fill(); }
  }

  // ---------- per-frame update ----------
  G.update = (dt) => {
    G.fxN = 0; // (blastN is cleared by the renderer once the scorch stamps are drawn)
    const gM = C.gunM;
    // main gun
    if (G.rl > 0 && !veh.dead) { G.rl -= dt; if (G.rl <= 0) { G.rl = 0; } }
    R.reload = 1 - G.rl / RELOAD; dryT -= dt;
    if (!inp.fire) fireBlock = false;
    if (inp.fire && !veh.dead && !R.pose && !D.on && D.hold <= 0 && !fireBlock) {
      if (G.n[G.sel] <= 0) { if (dryT <= 0) { dryT = 1.5; ui.toast('Out of ' + AMMO[G.sel].name); } }
      else if (G.rl <= 0) {
        G.n[G.sel]--; G.rl = RELOAD; hudDirty = true;
        fire(0, G.sel, aim.mx, aim.my, aim.mz, aim.gx, aim.gy, aim.gz, AMMO[G.sel].v, 0.0005, 5);
        muzzle(aim.mx, aim.my, aim.mz, aim.gx, aim.gy, aim.gz, 1);
        veh.recoil = 0.34; veh.dpV += 0.55 * Math.cos(veh.turYaw); veh.drV -= 0.55 * Math.sin(veh.turYaw); veh.shake = Math.max(veh.shake, 0.75); veh.v -= 0.5 * Math.cos(veh.turYaw);
      }
    }
    // coaxial MG3: the fire control corrects for its steeper trajectory at the lased range
    if (inp.mg && !veh.dead && G.mg > 0) {
      mgT += dt * 18;
      while (mgT >= 1 && G.mg > 0) { mgT--; G.mg--;
        const px = gM[0] * -0.32 + gM[4] * (LEO.gy + 0.15) + gM[8] * -2.4 + gM[12], py = gM[1] * -0.32 + gM[5] * (LEO.gy + 0.15) + gM[9] * -2.4 + gM[13], pz = gM[2] * -0.32 + gM[6] * (LEO.gy + 0.15) + gM[10] * -2.4 + gM[14];
        const r = Math.min(aim.range, 1500), up = 0.5 * GRAV * r * (1 / (MGV * MGV) - 1 / (R.shellV * R.shellV));
        fire(0, 3, px, py, pz, aim.gx, aim.gy + up, aim.gz, MGV, 0.0035, 2.2);
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
      if (G.state === 0) { G.timer -= dt; if (G.timer <= 0) { G.wave++; const n = Math.min(2 + G.wave, MAXE - 3);
        for (const e of G.enemies) if (e.on && e.dead && Math.hypot(e.x - veh.x, e.z - veh.z) > 500) e.on = false; // recycle distant wrecks
        let made = 0; for (let i = 0; i < n; i++) if (spawn(i > 0 && rnd() < 0.4 ? 1 : 0)) made++;
        G.state = 1; hudDirty = true; let ax = 0, az = 0; for (const e of G.enemies) if (e.on && !e.dead) { ax += e.x - veh.x; az += e.z - veh.z; }
        const br = ((Math.atan2(ax, -az) * 57.296 + 360) % 360), dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
        ui.toast(`Wave ${G.wave}: ${made} vehicles from the ${dirs[Math.round(br / 45) % 8]}, ~${Math.round(Math.hypot(ax, az) / made / 50) * 50} m — see the map`); } }
      else if (alive === 0) { G.state = 0; G.timer = 9; G.score += 150 * G.wave; hudDirty = true;
        for (let i = 0; i < 3; i++) G.n[i] = Math.min(AMMO[i].max, G.n[i] + [7, 4, 3][i]); G.mg = Math.min(2000, G.mg + 500); G.smokeN = Math.min(2, G.smokeN + 1); veh.hp = Math.min(100, veh.hp + 25);
        if (G.wave === WAVES && !G.won) { G.won = true; ui.over('Nordmarka held', `All ${WAVES} waves beaten · ${G.kills} vehicles destroyed · score ${G.score}. Press R to start over, or close this and keep fighting.`, true); }
        else ui.toast(`Wave ${G.wave} cleared — resupplied`); }
    }
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (e.on) updateEnemy(e, dt, i); }
    // vehicles are solid for each other
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on) continue; const dx = veh.x - e.x, dz = veh.z - e.z, d = Math.hypot(dx, dz); if (d < 5.6 && d > 0.01) { const k = (5.6 - d) / d; veh.x += dx * k; veh.z += dz * k; veh.v *= 0.9; } }
    updateShells(dt);
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
    G.smokeN--; hudDirty = true; const a = veh.yaw + veh.turYaw, T = C.turM;
    for (let k = 0; k < 8; k++) { const sd = k < 4 ? -1 : 1, o = sd * (0.25 + (k % 4) * 0.33), dx = -Math.sin(a - o) * 0.82, dz = -Math.cos(a - o) * 0.82, lx = sd * 1.65, ly = 2.1, lz = 0.7;
      fire(0, 6, T[0] * lx + T[4] * ly + T[8] * lz + T[12], T[1] * lx + T[5] * ly + T[9] * lz + T[13], T[2] * lx + T[6] * ly + T[10] * lz + T[14], dx, 0.57, dz, 24 + (k % 4) * 3, 0.03, 1.15 + rnd() * 0.2); }
    ui.toast('Smoke!');
  };
  // ---------- FPV drone: recon and a one-way attack with a shaped charge ----------
  function droneEnd(msg) { D.on = false; cam.mode = 0; R.snap = true; hudDirty = true; fireBlock = true; if (msg) ui.toast(msg); }
  function droneBoom() {
    explode(D.x, D.y, D.z, 1.9); splash(D.x, D.y, D.z, 4, 115, 140, 0);
    const db = C.bld.at(D.x, D.y, D.z, 0.9); if (db >= 0) bldHit(db, 100, D.x, D.y, D.z, true); C.bld.splash(D.x, D.y, D.z, 5, 30, db, bldFx);
    const d = Math.hypot(veh.x - D.x, veh.y + 1 - D.y, veh.z - D.z); if (d < 6.5) hurtPlayer(35 * clamp(1 - (d - 2.5) / 4, 0, 1), 1, false);
    D.on = false; D.vx = D.vy = D.vz = 0; D.hold = 4.5; D.bx = D.x; D.by = D.y; D.bz = D.z; hudDirty = true; // the camera stays on the blast (see updateCamera), then returns to the tank
  }
  function updateDrone(dt) {
    if (!D.on) { if (D.hold > 0) { D.hold -= dt; if (D.hold <= 0 || veh.dead || (inp.fire && !fireWas)) { D.hold = 0; droneEnd(null); } } return; }
    if (veh.dead) { droneEnd('Drone link lost'); return; }
    D.t -= dt; D.spin += dt * 95;
    const cp = Math.cos(D.pitch), fx = -Math.sin(D.yaw) * cp, fy = Math.sin(D.pitch), fz = -Math.cos(D.yaw) * cp, rx = Math.cos(D.yaw), rz = -Math.sin(D.yaw), k = Math.min(1, dt * 2.6);
    D.vx += ((fx * inp.mvZ + rx * inp.mvX) * DRONE_V - D.vx) * k; D.vy += ((fy * inp.mvZ + inp.mvY * 0.55) * DRONE_V - D.vy) * k; D.vz += ((fz * inp.mvZ + rz * inp.mvX) * DRONE_V - D.vz) * k;
    D.x = clamp(D.x + D.vx * dt, -HALF + 60, HALF - 60); D.y += D.vy * dt; D.z = clamp(D.z + D.vz * dt, -HALF + 60, HALF - 60);
    D.tp += (-inp.mvZ * 0.38 - D.tp) * Math.min(1, dt * 5); D.tr += (-inp.mvX * 0.38 - D.tr) * Math.min(1, dt * 5); // lean into the motion
    const gh = hAt(D.x, D.z); let boom = inp.fire && !fireWas;
    if (D.y < gh + 0.35) { if (Math.hypot(D.vx, D.vy, D.vz) > 9) boom = true; else { D.y = gh + 0.35; D.vy = Math.max(0, D.vy); } }
    if ((D.y < gh + 8 && C.collAt(D.x, D.z)) || C.bld.at(D.x, D.y, D.z, 0.3) >= 0) boom = true;
    for (let i = 0; i < MAXE && !boom; i++) { const e = G.enemies[i]; if (e.on && inside(e, ETYPE[e.type].K, D.x, D.y, D.z)) boom = true; }
    if (boom) { droneBoom(); return; }
    if (D.t <= 0) { droneEnd('Drone battery empty — lost'); return; }
    if (Math.hypot(D.x - veh.x, D.z - veh.z) > DRONE_R) { droneEnd('Drone out of radio range — lost'); return; }
    const sec = Math.ceil(D.t); if (sec !== D.sec) { D.sec = sec; hudDirty = true; }
    droneParts(C.dobj, D); C.dobj[131] = 1;
  }
  // X: launch a drone from the turret roof, or cut the link to the one in the air (it is lost)
  G.droneKey = () => {
    if (D.hold > 0) { D.hold = 0; droneEnd(null); return; }
    if (D.on) { droneEnd('Drone link cut — back in the tank'); return; }
    if (veh.dead || cam.mode === 3) return;
    if (G.drones <= 0) { ui.toast('No drones left'); return; }
    G.drones--; Object.assign(D, { on: true, x: veh.x, y: veh.y + 3.4, z: veh.z, vx: 0, vy: 5, vz: 0, yaw: aim.yaw, pitch: -0.12, t: DRONE_T, spin: 0, tp: 0, tr: 0, sec: DRONE_T });
    cam.mode = 4; R.snap = true; hudDirty = true; droneParts(C.dobj, D); C.dobj[131] = 1;
    ui.toast('Drone away — WASD fly · Space/Shift up/down · LMB detonate · X back to the tank');
  };
  G.restart = () => {
    for (const e of G.enemies) e.on = false; S.fill(0); CL.fill(0); FI.fill(0); C.bld.restore();
    D.on = false; D.hold = 0; if (cam.mode === 4) cam.mode = 0;
    Object.assign(G, { drones: DRONES, sel: 0, mg: 2000, smokeN: 2, rl: 0, wave: 0, kills: 0, timer: 6, state: 0, won: false, score: 0, burnP: 0 }); G.n[0] = 20; G.n[1] = 12; G.n[2] = 10; R.shellV = AMMO[0].v;
    Object.assign(veh, { x: W.start.x, z: W.start.z, yaw: W.start.yaw, v: 0, hp: 100, dead: false, immob: 0, tl: 0, tt: 0, turYaw: 0, gunPitch: 0 }); veh.y = veh.gPrev = hAt(veh.x, veh.z); aim.yaw = veh.yaw; aim.pitch = 0;
    R.snap = true; hudDirty = true; ui.over(null); ui.toast('Stand by — contact expected from the north');
  };
  // the sight ray also ranges on vehicles (returns the nearer distance)
  G.aimHit = (ox, oy, oz, dx, dy, dz, t) => {
    const tb = C.bld.ray(ox, oy, oz, ox + dx * t, oy + dy * t, oz + dz * t, false); if (tb < 1) t *= tb;
    for (let i = 0; i < MAXE; i++) { const e = G.enemies[i]; if (!e.on) continue; const cx = e.x - ox, cy = e.y + 1.3 - oy, cz = e.z - oz, b = cx * dx + cy * dy + cz * dz, q = cx * cx + cy * cy + cz * cz - b * b; if (b > 0 && q < 6.8 && b - 1.5 < t) t = b - Math.sqrt(6.8 - q) * 0.6; }
    return t;
  };
  G.spawn = spawn; G.bldHit = bldHit; G.los = losBlocked; G.hurt = hurtPlayer; G.S = S; G.inside = inside;
  hud();
  return G;
}
