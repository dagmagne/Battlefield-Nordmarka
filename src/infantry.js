import { WALK_V, RUN_V } from './soldier.js';
// Infantry logic and AI (phase 6, part B). A pool of MAXI soldiers in squads:
//  - RPG teams (2–3 men) hidden in houses along the roads or at forest edges 120–350 m ahead at a wave start; they fire RPG
//    rockets (shell type 12) at the tank inside 250 m once they see it. An HE round into their house kills or scatters them.
//  - ATGM teams (gunner and loader with a tripod launcher) on heights; the missile is shell type 8, guided from the gunner.
//  - Dismounts: a BMP or BTR that stops in contact drops a squad of 4–6 once; they advance by bounds and fire rifle bursts (type 9).
// The renderer (part A) reads G.inf.d: 8 floats per soldier [x, y, z, yaw, pose, phase, aim, state], written here every frame.
// pose: 0 stand, 1 walk, 2 run, 3 kneel-aim, 4 prone-aim, 5 stand-aim, 6 dead, 7 RPG-aim; state: 0 unused, 1 alive, 2 dead.
// Everything is preallocated in initInfantry(); update() and the hit tests allocate nothing (toasts on rare events do).
import { clamp } from './math.js';
import { cur as todCur } from './tod.js';

export const MAXI = 40;
const MAXQ = MAXI, LOST_T = 40;
const RIF = 0, RPG = 1, ATG = 2, LDR = 3; // roles: rifleman, RPG gunner, ATGM gunner, ATGM loader (unarmed)
const QRPG = 0, QATG = 1, QDIS = 2; // squad kinds
const M_HIDE = 0, M_MOVE = 1, M_FIRE = 2, M_FLEE = 3; // behaviour modes
const RUN = 4.5, WALK = 1.5, CRAWL = 0.4, RPG_N = 4; // RPG_N: rockets per RPG gunner (a gunner and his assistant carry about four)
const RPG_V = 120, RPG_RL = 8, RPG_R = 250, RPG_G = 0.2; // rocket speed, reload (s), range (m), net gravity left after the motor (× g)
const RIF_R = 550, ATG_R = 1500, ATG_RL = 24, ATG_V = 250, SEE_RI = 420, SEE_RA = 900, FLOOR = 0.12, HEAR = 150;
const NIGHT = { night: 0.75 }; // observer type for playerSig: soldiers see poorly in the dark
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const dirName = (x, z) => DIRS[Math.round(((Math.atan2(x, -z) * 57.296 + 360) % 360) / 45) % 8];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// h: helpers from combat.js { fire, muzzle, losVis, playerSig, canAt, S }
export function initInfantry(C, G, h) {
  const { W, R, veh, aim, cam, rnd, ui, PLAY } = C, hAt = W.heightAt, B = C.bld, S = h.S;
  const d = G.inf.d; // created in initCombat (the renderer's interface)
  const SQ = new Int8Array(MAXI), RL = new Uint8Array(MAXI), MD = new Uint8Array(MAXI), MI = new Uint8Array(MAXI), BP = new Uint8Array(MAXI), SEEN = new Uint8Array(MAXI);
  const HB = new Int32Array(MAXI), LT = new Float32Array(MAXI), SEE = new Float32Array(MAXI), VIS = new Float32Array(MAXI), KN = new Float32Array(MAXI), REL = new Float32Array(MAXI);
  const SPT = new Float32Array(MAXI), LOST = new Float32Array(MAXI), LX = new Float32Array(MAXI), LZ = new Float32Array(MAXI), SUP = new Float32Array(MAXI);
  const TX = new Float32Array(MAXI), TZ = new Float32Array(MAXI), EX = new Float32Array(MAXI), EY = new Float32Array(MAXI), EZ = new Float32Array(MAXI);
  // RK: rockets an RPG gunner still carries
  const RK = new Uint8Array(MAXI), BN = new Uint8Array(MAXI), BT = new Float32Array(MAXI), AT = new Float32Array(MAXI), MT = new Float32Array(MAXI), FT = new Float32Array(MAXI);
  // squads: kind, state (0 hidden/deploying, 1 engaged/advancing, 2 holding, 3 withdrawing), house, initial size, timer, moving fire team, stand-off, told (toast given)
  const QK = new Int8Array(MAXQ).fill(-1), QS = new Uint8Array(MAXQ), QB = new Int32Array(MAXQ).fill(-1), QI = new Uint8Array(MAXQ), QT = new Float32Array(MAXQ), QA = new Uint8Array(MAXQ), QSO = new Float32Array(MAXQ), QTD = new Uint8Array(MAXQ);
  const I = Object.assign(G.inf, { n: 0, MAXI, sq: SQ, role: RL, mode: MD, see: SEE, vis: VIS, spot: SPT, seen: SEEN, hb: HB, sup: SUP, rel: REL, qk: QK, qs: QS, qb: QB, kills: 0, rockets: 0, atgms: 0, bursts: 0, drawn: 0, hi: -1, lastBy: '' });
  const SO = new Float32Array(5), LP = new Float32Array(3);
  let sig = 1, lastState = 0;

  // ---------- slots and squads ----------
  function slot() {
    for (let i = 0; i < MAXI; i++) if (d[i * 8 + 7] === 0) return i;
    let b = -1, bt = 20; // full: recycle the dead body that has lain longest out of the camera's way
    for (let i = 0; i < MAXI; i++) { const o = i * 8; if (d[o + 7] !== 2 || Math.hypot(d[o] - cam.x, d[o + 2] - cam.z) < 150) continue; if (d[o + 5] > bt) { bt = d[o + 5]; b = i; } }
    return b;
  }
  const free = () => { let n = 0; for (let i = 0; i < MAXI; i++) { const s = d[i * 8 + 7]; if (s === 0 || (s === 2 && d[i * 8 + 5] > 20 && Math.hypot(d[i * 8] - cam.x, d[i * 8 + 2] - cam.z) >= 150)) n++; } return n; };
  function squad(kind) {
    for (let q = 0; q < MAXQ; q++) { if (QK[q] < 0) { QK[q] = kind; QS[q] = 0; QB[q] = -1; QI[q] = 0; QT[q] = 0; QA[q] = 0; QSO[q] = 100 + rnd() * 60; QTD[q] = 0; return q; } }
    for (let q = 0; q < MAXQ; q++) { let live = 0; for (let i = 0; i < MAXI; i++) if (SQ[i] === q && d[i * 8 + 7] === 1) live++; if (!live) { for (let i = 0; i < MAXI; i++) if (SQ[i] === q) SQ[i] = -1; QK[q] = -1; return squad(kind); } }
    return -1;
  }
  function soldier(q, role, x, z, yaw) {
    const i = slot(); if (i < 0) return -1; const o = i * 8;
    d[o] = x; d[o + 1] = hAt(x, z); d[o + 2] = z; d[o + 3] = yaw; d[o + 4] = 0; d[o + 5] = 0; d[o + 6] = 0; d[o + 7] = 1;
    RK[i] = RPG_N; SQ[i] = q; RL[i] = role; MD[i] = M_HIDE; MI[i] = q >= 0 ? QI[q]++ : 0; BP[i] = 4; SEEN[i] = 0; HB[i] = -1; LT[i] = rnd() * 0.45; SEE[i] = 0; VIS[i] = 0; KN[i] = 0;
    REL[i] = 1 + rnd() * 2; SPT[i] = 0; LOST[i] = 0; LX[i] = x; LZ[i] = z; SUP[i] = 0; TX[i] = x; TZ[i] = z; EX[i] = NaN; BN[i] = 0; BT[i] = 0; AT[i] = 0; MT[i] = 0; FT[i] = 0;
    if (i >= I.n) I.n = i + 1; return i;
  }
  const footOk = (x, z) => W.inP(x, z, 40) && !C.collAt(x, z) && B.at(x, hAt(x, z) + 1, z, 0.8) < 0 && W.br.id(x, z, 3) < 0; // (not on or under a bridge)
  const gAt = (x, z, y) => W.groundAt(x, z, y); // ground for a soldier at height y: on a deck when walking on it, the road under it otherwise
  const leave = (i) => { const o = i * 8; if (HB[i] < 0 || B.push(d[o], d[o + 2], 0.5, SO) === 0) return; d[o] = SO[0]; d[o + 2] = SO[1]; d[o + 1] = hAt(d[o], d[o + 2]); }; // out through the nearest wall before the house binding is dropped (rare event)
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

  // ---------- RPG teams: in a house along a road, or at a forest edge, ahead on the enemy axis ----------
  function nearRoad(x, z, r) { const L = W.roads || []; for (let p = 0; p < L.length; p++) { const P = L[p].pts, n = L[p].n; for (let k = 0; k < n; k += 3) { const dx = P[k * 2] - x, dz = P[k * 2 + 1] - z; if (dx * dx + dz * dz < r * r) return true; } } return false; }
  function houseTeam(b, n) { // b: building index; the team stands just inside the wall that faces the player, an eye point at the window outside it
    const X = B.box, o = B.b0[b] * 10, cx = X[o], cz = X[o + 1], ux = X[o + 2], uz = X[o + 3], hw = X[o + 4], hd = X[o + 5], fl = X[o + 6];
    const px = veh.x - cx, pz = veh.z - cz; let nx, nz, hn, ht, tx, tz; // face normal, half-depth along it, half-width along the wall, wall tangent
    const sx = px * ux + pz * uz, sz = pz * ux - px * uz; // player in the box frame (local x along (ux, uz), local z along (-uz, ux))
    if (Math.abs(sx) / hw > Math.abs(sz) / hd) { const s = sx > 0 ? 1 : -1; nx = ux * s; nz = uz * s; hn = hw; ht = hd; tx = -uz; tz = ux; }
    else { const s = sz > 0 ? 1 : -1; nx = -uz * s; nz = ux * s; hn = hd; ht = hw; tx = ux; tz = uz; }
    const q = squad(QRPG); if (q < 0) return -1; QB[q] = b;
    for (let k = 0; k < n; k++) { const off = clamp((k - (n - 1) / 2) * 1.7, -(ht - 0.8), ht - 0.8), x = cx + nx * (hn - 0.45) + tx * off, z = cz + nz * (hn - 0.45) + tz * off;
      const i = soldier(q, k === 0 || (n === 3 && k === 2) ? RPG : RIF, x, z, Math.atan2(-nx, -nz)); if (i < 0) break;
      d[i * 8 + 1] = Math.max(fl, hAt(x, z)); HB[i] = b; BP[i] = 0; EX[i] = cx + nx * (hn + 0.9) + tx * off; EY[i] = d[i * 8 + 1] + 1.5; EZ[i] = cz + nz * (hn + 0.9) + tz * off; }
    return q;
  }
  function fieldTeam(x, z, n) { // at a forest edge: prone in a short line across the bearing to the player
    const q = squad(QRPG); if (q < 0) return -1; const b = yawTo(x, z, veh.x, veh.z), tx = Math.cos(b), tz = -Math.sin(b);
    for (let k = 0; k < n; k++) { const off = (k - (n - 1) / 2) * 3.5; let px = x + tx * off, pz = z + tz * off; if (!footOk(px, pz)) { px = x; pz = z; }
      const i = soldier(q, k === 0 || (n === 3 && k === 2) ? RPG : RIF, px, pz, b); if (i >= 0) BP[i] = 4; }
    return q;
  }
  function placeRPG(axis) { // rare event (wave start): may allocate
    const n = 2 + (rnd() < 0.5 ? 1 : 0); let best = -1e9, bb = -1;
    for (let b = 0; b < B.n; b++) { if (B.st[b] || B.size[b] < 6 || B.size[b] > 22) continue; const dx = B.x[b] - veh.x, dz = B.z[b] - veh.z, dd = Math.hypot(dx, dz); if (dd < 120 || dd > 350) continue;
      const db = Math.abs(wrap(Math.atan2(dx, -dz) - axis)); if (db > 1.0) continue; let used = false; for (let q = 0; q < MAXQ; q++) if (QK[q] >= 0 && QB[q] === b) used = true; if (used) continue;
      let sc = 2 * (1 - db) + rnd() * 0.8 - Math.abs(dd - 210) / 250; if (nearRoad(B.x[b], B.z[b], 40)) sc += 1.5;
      if (sc > best - 2 && h.losVis(B.x[b] - dx / dd * (B.size[b] * 0.5 + 1), B.y[b] + 1.6, B.z[b] - dz / dd * (B.size[b] * 0.5 + 1), veh.x, veh.y + 1.9, veh.z) > 0.2) sc += 2;
      if (sc > best) { best = sc; bb = b; } }
    if (bb >= 0 && best > 1.5 && rnd() < 0.8) return houseTeam(bb, n);
    best = -1e9; let fx = 0, fz = 0; // forest edge instead
    for (let k = 0; k < 260; k++) { const a = axis + (rnd() - 0.5) * 1.8, r = 120 + rnd() * 220, x = veh.x + Math.sin(a) * r, z = veh.z - Math.cos(a) * r; if (!footOk(x, z) || (R.trees && h.canAt(x, z) < 70)) continue;
      const v = h.losVis(x, hAt(x, z) + 0.6, z, veh.x, veh.y + 1.9, veh.z); const sc = v * 3 + (1 - Math.abs(wrap(a - axis))) + rnd() * 0.5 - Math.abs(r - 200) / 300; if (sc > best) { best = sc; fx = x; fz = z; } }
    return best > -1e9 ? fieldTeam(fx, fz, n) : -1;
  }
  // ---------- ATGM team: on a height with a view, 450–950 m out ----------
  function atgmTeam(x, z) {
    const q = squad(QATG); if (q < 0) return -1; const b = yawTo(x, z, veh.x, veh.z), tx = Math.cos(b), tz = -Math.sin(b);
    const g = soldier(q, ATG, x, z, b); if (g >= 0) BP[g] = 3;
    const l = soldier(q, LDR, x + tx * 1.8 + Math.sin(b) * 0.8, z + tz * 1.8 + Math.cos(b) * 0.8, b); if (l >= 0) BP[l] = 4;
    return q;
  }
  function placeATGM(axis) {
    let best = -1e9, bx = 0, bz = 0;
    for (let k = 0; k < 240; k++) { const a = axis + (rnd() - 0.5) * 1.8, r = 380 + rnd() * 570, x = veh.x + Math.sin(a) * r, z = veh.z - Math.cos(a) * r; if (!footOk(x, z)) continue;
      const y = hAt(x, z), v = h.losVis(x, y + 1.05, z, veh.x, veh.y + 1.9, veh.z), sc = clamp((y - veh.y) * 0.04, -1, 1.5) + rnd() * 0.3 + (v > 0.2 ? 2.5 + v * 2 : 0) - Math.abs(wrap(a - axis)); if (sc > best) { best = sc; bx = x; bz = z; } }
    return best > -1e9 ? atgmTeam(bx, bz) : -1;
  }
  // ---------- dismounts: once per BMP/BTR, from the rear door, when it stops in contact ----------
  function dismount(e, n) {
    if (free() < 4) return -1; const q = squad(QDIS); if (q < 0) return -1; e.dsm = 1;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw), px = veh.x - e.x, pz = veh.z - e.z, pd = Math.hypot(px, pz) || 1;
    for (let k = 0; k < n; k++) { const lat = (k - (n - 1) / 2) * 1.1; let x = e.x - fx * (4.6 + (k & 1) * 0.8) + rx * lat, z = e.z - fz * (4.6 + (k & 1) * 0.8) + rz * lat;
      if (C.solid(x, z, 0.4, SO, e.y)) { x = SO[0]; z = SO[1]; }
      const i = soldier(q, n >= 5 && k === 1 ? RPG : RIF, x, z, e.yaw + 3.1416); if (i < 0) break; d[i * 8 + 1] = gAt(x, z, e.y + 0.5); // (on a deck if the vehicle stands on one)
      BP[i] = rnd() < 0.6 ? 4 : 3; const sp = (k - (n - 1) / 2) * 5; // deploy: a line abreast on the player's side of the vehicle
      cover(i, e.x + px / pd * 10 - pz / pd * sp, e.z + pz / pd * 10 + px / pd * sp); MD[i] = M_MOVE; MT[i] = 0; }
    QS[q] = 0; QT[q] = 0; return q;
  }
  // a move target near (x, z): prefer forest cover or the lee of a wall, keep out of buildings and the own minefields
  function cover(i, x, z) {
    let best = -1e9, bx = x, bz = z;
    for (let k = 0; k < 6; k++) { const px = x + (k ? (rnd() - 0.5) * 12 : 0), pz = z + (k ? (rnd() - 0.5) * 12 : 0); if (!footOk(px, pz) || G.mines && inFld(px, pz, 6)) continue; const y = hAt(px, pz) + 1;
      const sc = (R.trees ? h.canAt(px, pz) / 255 : 0) + (B.at(px, y, pz, 3) >= 0 ? 0.8 : 0) + rnd() * 0.3; if (sc > best) { best = sc; bx = px; bz = pz; } }
    TX[i] = W.cpx(bx, 40); TZ[i] = W.cpz(bz, 40);
  }
  function inFld(x, z, pad) { const F = G.mines.fld; for (let f = 0; f < F.length; f += 4) if (F[f + 3] && Math.hypot(x - F[f], z - F[f + 1]) < F[f + 2] + pad) return true; return false; }

  // ---------- death, damage ----------
  function kill(i, by) {
    const o = i * 8; if (d[o + 7] !== 1) return; d[o + 7] = 2; d[o + 4] = 6; d[o + 5] = 0; d[o + 6] = 0; MD[i] = M_HIDE; SEEN[i] = 1; SPT[i] = Math.max(SPT[i], 8);
    I.kills++; I.lastBy = by || ''; G.score += 10; if (G.dirty) G.dirty();
    const q = SQ[i]; if (q < 0 || QTD[q]) return;
    if (QK[q] === QRPG || QK[q] === QATG) { const wpn = QK[q] === QRPG ? RPG : ATG; let left = 0; for (let j = 0; j < MAXI; j++) if (SQ[j] === q && RL[j] === wpn && d[j * 8 + 7] === 1) left++;
      if (!left) { QTD[q] = 1; G.score += 40; ui.toast(QK[q] === QRPG ? 'RPG team taken out' : 'ATGM team taken out'); } }
  }
  // blast (player HE, HEAT, VOG, drone charge, artillery): kills within a radius, pins down further out; in a house the walls take most of it
  function blast(x, y, z, r) {
    const rk = Math.max(4, r * 0.8);
    for (let i = 0; i < I.n; i++) { const o = i * 8; if (d[o + 7] !== 1) continue; const dd = Math.hypot(d[o] - x, d[o + 1] + 0.6 - y, d[o + 2] - z), k = rk * (d[o + 4] === 4 ? 0.6 : 1) * (HB[i] >= 0 ? 0.5 : 1);
      if (dd < k) kill(i, 'blast'); else if (dd < rk * 3) { SUP[i] = Math.min(6, SUP[i] + 3); KN[i] = Math.max(KN[i], 8); } }
  }
  // a building changed state (from combat's bldState): collapse kills those inside; damage kills some and scatters the rest
  function onBld(b, s) {
    for (let i = 0; i < I.n; i++) { if (HB[i] !== b || d[i * 8 + 7] !== 1) continue;
      if (s === 2 || rnd() < 0.5) { kill(i, 'house'); continue; }
      leave(i); HB[i] = -1; EX[i] = NaN; flee(i, 30 + rnd() * 15); REL[i] = 25 + rnd() * 10; SUP[i] = 6; }
  }
  function flee(i, r) { const o = i * 8, px = d[o] - veh.x, pz = d[o + 2] - veh.z, l = Math.hypot(px, pz) || 1, s = rnd() - 0.5; cover(i, d[o] + (px / l + s * pz / l) * r, d[o + 2] + (pz / l - s * px / l) * r); MD[i] = M_FLEE; MT[i] = 0; BP[i] = 4; }

  // ---------- hit tests for the player's rounds ----------
  let segS = 0;
  function segSeg(ax, ay, az, bx, by, bz, cx, cy, cz, ex, ey, ez) { // squared distance between segments ab and ce; segS: parameter on ab
    const d1x = bx - ax, d1y = by - ay, d1z = bz - az, d2x = ex - cx, d2y = ey - cy, d2z = ez - cz, rx = ax - cx, ry = ay - cy, rz = az - cz;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz; let s = 0, t = 0;
    if (a < 1e-9) { t = e > 1e-9 ? clamp(f / e, 0, 1) : 0; }
    else { const c = d1x * rx + d1y * ry + d1z * rz; if (e < 1e-9) s = clamp(-c / a, 0, 1);
      else { const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b; s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); } } }
    segS = s; const qx = ax + d1x * s - cx - d2x * t, qy = ay + d1y * s - cy - d2y * t, qz = az + d1z * s - cz - d2z * t; return qx * qx + qy * qy + qz * qz;
  }
  const exposed = (i) => HB[i] < 0 || d[i * 8 + 4] === 5 || d[i * 8 + 4] === 7; // in a house only at the window while aiming
  // the first soldier this frame's shell segment strikes: fraction along it (2: none; I.hi = soldier); MG near misses pin soldiers down
  function seg(type, x0, y0, z0, x1, y1, z1) {
    let best = 2; I.hi = -1; const mnx = Math.min(x0, x1) - 3, mxx = Math.max(x0, x1) + 3, mnz = Math.min(z0, z1) - 3, mxz = Math.max(z0, z1) + 3;
    for (let i = 0; i < I.n; i++) { const o = i * 8; if (d[o + 7] !== 1) continue; const x = d[o], y = d[o + 1], z = d[o + 2]; if (x < mnx || x > mxx || z < mnz || z > mxz || !exposed(i)) continue;
      const p = d[o + 4]; let q2, r;
      if (p === 4) { const fx = -Math.sin(d[o + 3]) * 0.8, fz = -Math.cos(d[o + 3]) * 0.8; q2 = segSeg(x0, y0, z0, x1, y1, z1, x - fx, y + 0.22, z - fz, x + fx, y + 0.22, z + fz); r = 0.22; }
      else { const top = p === 3 || p === 7 ? 0.85 : 1.5; q2 = segSeg(x0, y0, z0, x1, y1, z1, x, y + 0.3, z, x, y + top, z); r = p === 3 || p === 7 ? 0.32 : 0.3; }
      if (q2 < r * r) { if (segS < best) { best = segS; I.hi = i; } }
      else if (type === 3 && q2 < 6.25) { SUP[i] = Math.min(6, SUP[i] + 0.35); KN[i] = Math.max(KN[i], 6); } }
    return best;
  }
  // the sight ray ranges on exposed soldiers too
  function aimHit(ox, oy, oz, dx, dy, dz, t) {
    for (let i = 0; i < I.n; i++) { const o = i * 8; if (d[o + 7] !== 1 || !exposed(i)) continue; const p = d[o + 4], hc = p === 4 ? 0.25 : p === 3 || p === 7 ? 0.6 : 0.9;
      const cx = d[o] - ox, cy = d[o + 1] + hc - oy, cz = d[o + 2] - oz, b = cx * dx + cy * dy + cz * dz; if (b <= 0 || b >= t) continue; if (cx * cx + cy * cy + cz * cz - b * b < 0.36) t = b; }
    return t;
  }

  // ---------- weapons ----------
  const eye = (i) => { const o = i * 8, p = d[o + 4]; if (EX[i] === EX[i]) { LP[0] = EX[i]; LP[1] = EY[i]; LP[2] = EZ[i]; } else { LP[0] = d[o]; LP[1] = d[o + 1] + (p === 4 ? 0.45 : p === 3 || p === 7 ? 1.05 : 1.55); LP[2] = d[o + 2]; } };
  function rocket(i, dist) {
    eye(i); const sx = LP[0], sy = LP[1], sz = LP[2], tof = dist / RPG_V, sg = 0.5 + dist * 0.012 + Math.abs(veh.v) * 0.15; // about half the rockets miss a still tank at 250 m
    const tx = veh.x - Math.sin(veh.yaw) * veh.v * tof * 0.8 + (rnd() + rnd() - 1) * sg - sx, ty = veh.y + 1.25 + (rnd() + rnd() - 1) * sg * 0.4 - sy + 0.5 * RPG_G * 9.81 * tof * tof, tz = veh.z - Math.cos(veh.yaw) * veh.v * tof * 0.8 + (rnd() + rnd() - 1) * sg - sz;
    const l = Math.hypot(tx, ty, tz) || 1, dx = tx / l, dy = ty / l, dz = tz / l;
    h.fire(1, 12, sx + dx * 0.8, sy + dy * 0.8, sz + dz * 0.8, dx, dy, dz, RPG_V, 0, 4); I.rockets++;
    h.muzzle(sx + dx * 0.3, sy, sz + dz * 0.3, dx, dy, dz, 0.25); C.sfx('atgm', sx, sy, sz, 0.8);
    for (let k = 0; k < 10; k++) { const v = 4 + rnd() * 10; C.parts.emit(sx - dx * 0.8, sy - dy * 0.8, sz - dz * 0.8, -dx * v + (rnd() - 0.5) * 3, -dy * v + rnd() * 1.5, -dz * v + (rnd() - 0.5) * 3, 1.6 + rnd() * 1.4, 0.5 + rnd() * 0.6, 1.3, 1, 0.75, 0.74, 0.72, 0.6); } // back-blast
    SPT[i] = Math.max(SPT[i], 8); const q = SQ[i];
    if (q >= 0 && QS[q] === 0) { QS[q] = 1; ui.toast(`RPG fire from the ${dirName(sx - veh.x, sz - veh.z)}!` + (HB[i] >= 0 ? ' Infantry in the house — HE' : '')); }
  }
  function missile(i) {
    eye(i); const sx = LP[0], sy = LP[1] + 0.1, sz = LP[2], tx = veh.x - sx, ty = veh.y + 1.4 - sy, tz = veh.z - sz, l = Math.hypot(tx, ty, tz) || 1;
    const o = h.fire(1, 8, sx + tx / l * 1.2, sy + ty / l * 1.2, sz + tz / l * 1.2, tx / l, ty / l + 0.04, tz / l, ATG_V, 0, 10); S[o + 9] = -(i + 1); I.atgms++; // guided by this soldier (combat.js guide())
    h.muzzle(sx, sy, sz, tx / l, ty / l, tz / l, 0.45); C.sfx('atgm', sx, sy, sz, 1); SPT[i] = Math.max(SPT[i], 8);
    ui.toast(`ATGM launch from the ${dirName(sx - veh.x, sz - veh.z)}! Smoke or cover breaks its guidance`); if (SQ[i] >= 0) QS[SQ[i]] = 1;
  }
  function rifle(i, dist) { // one round of a burst
    eye(i); const sx = LP[0], sy = LP[1], sz = LP[2], sg = 0.6 + dist * 0.005 + Math.abs(veh.v) * 0.15, tof = dist / 850;
    const tx = veh.x - Math.sin(veh.yaw) * veh.v * tof + (rnd() + rnd() - 1) * sg - sx, ty = veh.y + 1.3 + (rnd() + rnd() - 1) * sg * 0.5 - sy + 0.5 * 9.81 * tof * tof, tz = veh.z - Math.cos(veh.yaw) * veh.v * tof + (rnd() + rnd() - 1) * sg - sz, l = Math.hypot(tx, ty, tz) || 1;
    h.fire(1, 9, sx + tx / l * 0.7, sy + ty / l * 0.7, sz + tz / l * 0.7, tx / l, ty / l, tz / l, 850, 0.004, 1.6);
    if ((BN[i] & 1) === 0) h.glow(sx + tx / l * 0.7, sy + ty / l * 0.7, sz + tz / l * 0.7, 0.35, 24, 13, 4);
  }
  // the guidance needs the gunner alive with a view: his eye point, false if he is gone
  function lpos(i, out) { if (i < 0 || i >= MAXI || d[i * 8 + 7] !== 1) return false; eye(i); out[0] = LP[0]; out[1] = LP[1]; out[2] = LP[2]; return true; }
  // RPG rocket in flight (from updateShells): the motor holds most of it up; a thick grey trail
  function trail(o, dt) {
    S[o + 4] += 9.81 * dt * (1 - RPG_G);
    for (let k = 0; k < 3; k++) { const f = rnd(); C.parts.emit(S[o] - S[o + 3] * dt * f, S[o + 1] - S[o + 4] * dt * f, S[o + 2] - S[o + 5] * dt * f, (rnd() - 0.5) * 0.5, 0.2 + rnd() * 0.4, (rnd() - 0.5) * 0.5, 1.4 + rnd() * 1.4, 0.35 + rnd() * 0.3, 1.5, 1, 0.7, 0.69, 0.68, 0.6); }
  }

  // ---------- per frame ----------
  function move(i, sp, dt) { // towards TX/TZ; true when there
    const o = i * 8, x = d[o], z = d[o + 2]; let ux = TX[i] - x, uz = TZ[i] - z; const l = Math.hypot(ux, uz); if (l < 0.9) return true; ux /= l; uz /= l;
    const F = G.mines ? G.mines.fld : null; // own minefields: swing round them
    if (F) for (let f = 0; f < F.length; f += 4) { if (!F[f + 3]) continue; const fx = x - F[f], fz = z - F[f + 1], fd = Math.hypot(fx, fz) || 1, rr = F[f + 2] + 6; if (fd < rr) { const w = (rr - fd) / 6 * 1.8; ux += fx / fd * w; uz += fz / fd * w; } }
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    let nx = W.cpx(x + ux * sp * dt), nz = W.cpz(z + uz * sp * dt);
    if (C.solid(nx, nz, 0.4, SO, d[o + 1])) { nx = SO[0]; nz = SO[1]; }
    d[o] = nx; d[o + 2] = nz; d[o + 1] = gAt(nx, nz, d[o + 1]); d[o + 3] += wrap(Math.atan2(-ux, -uz) - d[o + 3]) * Math.min(1, dt * 8);
    d[o + 5] += dt * sp / (sp > 2.6 ? RUN_V : WALK_V); // the gait clock follows ground speed so planted feet don't slide (soldier.js)
    return false;
  }
  function squadTick(q, dt) {
    let live = 0, cx = 0, cz = 0, moving = 0, seen = false;
    for (let i = 0; i < I.n; i++) { if (SQ[i] !== q || d[i * 8 + 7] !== 1) continue; live++; cx += d[i * 8]; cz += d[i * 8 + 2]; if (MD[i] === M_MOVE) moving++; if (SEE[i] >= 1) seen = true; }
    if (!live) return;
    if (seen) for (let i = 0; i < I.n; i++) if (SQ[i] === q) KN[i] = Math.max(KN[i], 8); // what one sees, the squad knows
    QT[q] += dt;
    if (QS[q] === 3) return;
    if (live * 3 <= QI[q] && QK[q] === QDIS || G.state === 0 && lastState === 1) { QS[q] = 3; for (let i = 0; i < I.n; i++) if (SQ[i] === q && d[i * 8 + 7] === 1) { leave(i); HB[i] = -1; EX[i] = NaN; flee(i, 330); } return; } // broken, or the wave is over: withdraw out of the fight (the slot is freed once 300 m away)
    if (QK[q] !== QDIS) return;
    const md = Math.hypot(cx / live - veh.x, cz / live - veh.z);
    if (QS[q] === 0) { if (!moving || QT[q] > 10) { QS[q] = 1; QA[q] = 0; bound(q); } return; }
    if (QS[q] === 2) { if (md > QSO[q] + 90) { QS[q] = 1; bound(q); } return; }
    if (md < QSO[q]) { QS[q] = 2; for (let i = 0; i < I.n; i++) if (SQ[i] === q && d[i * 8 + 7] === 1 && MD[i] !== M_FLEE) MD[i] = M_FIRE; return; }
    if ((!moving && QT[q] > 4) || QT[q] > 14) { QA[q] ^= 1; bound(q); }
  }
  function bound(q) { // the moving fire team rushes 20–30 m closer to the next bit of cover while the other covers it
    QT[q] = 0;
    for (let i = 0; i < I.n; i++) { if (SQ[i] !== q || d[i * 8 + 7] !== 1 || MD[i] === M_FLEE) continue; const o = i * 8;
      if ((MI[i] & 1) !== QA[q]) { MD[i] = M_FIRE; continue; }
      const px = veh.x - d[o], pz = veh.z - d[o + 2], pd = Math.hypot(px, pz) || 1, step = Math.min(20 + rnd() * 10, pd - QSO[q] + 10), sd = (rnd() - 0.5) * 8;
      if (step < 3) { MD[i] = M_FIRE; continue; }
      cover(i, d[o] + px / pd * step - pz / pd * sd, d[o + 2] + pz / pd * step + px / pd * sd); MD[i] = M_MOVE; MT[i] = 0; BP[i] = rnd() < 0.6 ? 4 : 3; }
  }
  // dismount watch: a BMP or BTR that has stopped in contact (engaging), or has stood still for a few seconds close to the tank
  const STOP = new Float32Array(64);
  function watchCarriers(dt) {
    for (let k = 0; k < G.enemies.length && k < 64; k++) { const e = G.enemies[k]; if (!e.on || e.dead || e.dsm || (e.type !== 1 && e.type !== 3)) { STOP[k] = 0; continue; }
      const de = Math.hypot(e.x - veh.x, e.z - veh.z); STOP[k] = Math.abs(e.v) < 1 && de < 250 ? STOP[k] + dt : 0;
      if ((e.state === 1 && Math.abs(e.v) < 1 && de < 400) || STOP[k] > 4) { const q = dismount(e, 4 + ((rnd() * 3) | 0)); if (q >= 0 && !veh.dead) ui.toast(`${e.type === 1 ? 'BMP' : 'BTR'} dismounting infantry to the ${dirName(e.x - veh.x, e.z - veh.z)}`); } }
  }
  function update(dt) {
    sig = h.playerSig(NIGHT); const dark = clamp((2 - todCur[1]) / 22, 0, 1), rng0 = 1 - (R.therm ? 0.15 : 0.6) * dark, thm = R.therm ? 1.6 : 1;
    watchCarriers(dt);
    for (let q = 0; q < MAXQ; q++) if (QK[q] >= 0) squadTick(q, dt);
    let n = 0;
    for (let i = 0; i < I.n; i++) { const o = i * 8, st = d[o + 7]; if (st === 0) continue; n = i + 1;
      if (SPT[i] > 0) { SPT[i] -= dt; SEEN[i] = 1; LOST[i] = 0; if (st === 1) { LX[i] = d[o]; LZ[i] = d[o + 2]; } } else LOST[i] += dt;
      if (st === 2) { d[o + 5] += dt; continue; }
      const x = d[o], z = d[o + 2], dx = veh.x - x, dz = veh.z - z, dist = Math.hypot(dx, dz);
      // run over: the tank's hull footprint (a still tank pushes them aside)
      if (dist < 5 && !veh.dead) { const c = Math.cos(veh.yaw), s = Math.sin(veh.yaw), lx = c * -dx - s * -dz, lz = s * -dx + c * -dz;
        if (Math.abs(lx) < 2.15 && Math.abs(lz) < 4.1 && Math.abs(d[o + 1] - veh.y) < 1.5) { if (Math.abs(veh.v) > 0.6 || Math.abs(veh.yawRate || 0) > 0.15) { kill(i, 'tracks'); continue; } const sd = lx < 0 ? -1 : 1, p = 2.15 * sd - lx; d[o] += c * p; d[o + 2] -= s * p; } }
      // withdrawn out of everyone's way: the slot is freed
      if (SQ[i] >= 0 && QS[SQ[i]] === 3 && dist > 300 && Math.hypot(x - cam.x, z - cam.z) > 300) { d[o + 7] = 0; continue; }
      // perception (staggered)
      LT[i] -= dt;
      if (LT[i] <= 0) { LT[i] = 0.45; eye(i); VIS[i] = !veh.dead && dist < 1800 ? h.losVis(LP[0], LP[1], LP[2], veh.x, veh.y + 1.9, veh.z) : 0;
        if (VIS[i] > 0.2 && !veh.dead) { const p = d[o + 4], hid = HB[i] >= 0 && !exposed(i), r = (p === 4 ? 220 : p === 3 || p === 7 ? 380 : 600) * (hid ? 0.12 : 1) * thm * rng0 * (1 - (R.trees ? h.canAt(x, z) / 255 * 0.5 : 0));
          if (dist < r && (dist < 60 || Math.abs(wrap(Math.atan2(-(x - veh.x), -(z - veh.z)) - aim.yaw)) < 0.75)) SPT[i] = Math.max(SPT[i], 6); } }
      if (VIS[i] > 0) SEE[i] = Math.min(4, SEE[i] + (VIS[i] * sig * (G.net >= 1 && SEE[i] < 1 ? 0.35 : 1) / (1 + dist * dist / (RL[i] === ATG ? SEE_RA * SEE_RA : SEE_RI * SEE_RI)) * (KN[i] > 0 ? 1.6 : 1) - FLOOR) * dt); else SEE[i] -= 0.4 * dt;
      if (SEE[i] < 0) SEE[i] = 0; // detection progress never goes negative (as for the vehicles)
      if (dist < HEAR && Math.abs(veh.v) > 1 && !veh.dead) KN[i] = Math.max(KN[i], 5); // they hear the engine and the tracks
      if (SEE[i] >= 1 && VIS[i] > 0) G.spot = true;
      KN[i] -= dt; SUP[i] = Math.max(0, SUP[i] - dt * 0.5); REL[i] -= dt;
      const md = MD[i], role = RL[i];
      if (md === M_MOVE || md === M_FLEE) { // on the move: run (crawl when pinned down)
        MT[i] += dt; const pin = SUP[i] > 1.5 && md === M_MOVE, sp = pin ? CRAWL : md === M_FLEE || KN[i] > 0 || SEE[i] > 0.5 ? RUN : WALK;
        d[o + 4] = pin ? 4 : sp === RUN ? 2 : 1; d[o + 6] = 0;
        if (move(i, sp, dt) || MT[i] > (md === M_FLEE ? 90 : 25)) { MD[i] = M_FIRE; if (md === M_FLEE) d[o + 4] = 4; }
        continue;
      }
      // in position: face the tank when it is known, aim and fire
      const known = SEE[i] >= 1 || KN[i] > 0; if (known) d[o + 3] += wrap(Math.atan2(-dx, -dz) - d[o + 3]) * Math.min(1, dt * 3);
      let pose = SUP[i] > 1.5 && HB[i] < 0 ? 4 : BP[i]; if (md === M_FIRE && known && pose === 0) pose = 5;
      const can = SEE[i] >= 1 && VIS[i] > 0 && !G.peace && !veh.dead && SUP[i] < 3, q = SQ[i];
      if (role === RPG && can && dist < RPG_R && REL[i] <= 0 && RK[i] > 0) { pose = 7; AT[i] += dt; if (AT[i] >= 1.2) { rocket(i, dist); RK[i]--; REL[i] = RPG_RL * (0.9 + rnd() * 0.2); AT[i] = 0; FT[i] = 0.7; if (!RK[i]) { leave(i); HB[i] = -1; EX[i] = NaN; flee(i, 60 + rnd() * 40); } } } // out of rockets: the gunner pulls back
      else if (role === ATG && can && VIS[i] > 0.1 && dist < ATG_R && REL[i] <= 0) { pose = 3; AT[i] += dt; if (AT[i] >= 2) { missile(i); REL[i] = ATG_RL * (0.9 + rnd() * 0.3); AT[i] = 0; } }
      else if (role === RIF && can && dist < RIF_R && (md === M_FIRE || (q >= 0 && QS[q] > 0))) { if (pose === 0) pose = 5;
        if (BN[i] > 0) { BT[i] -= dt; if (BT[i] <= 0) { BT[i] = 0.11; BN[i]--; rifle(i, dist); } }
        else if (REL[i] <= 0) { BN[i] = 3; BT[i] = 0; REL[i] = 5 + rnd() * 3.5; I.bursts++; SPT[i] = Math.max(SPT[i], dist < 250 ? 3 : 1.5); C.sfx('mgb', x, d[o + 1] + 1.2, z, 0.35); } }
      else AT[i] = Math.max(0, AT[i] - dt);
      if (FT[i] > 0) { FT[i] -= dt; pose = 7; } // the launcher stays up a moment after the shot
      d[o + 4] = pose; eye(i); d[o + 6] = known && pose !== 0 ? clamp(Math.atan2(veh.y + 1.2 - LP[1], Math.max(dist, 1)), -0.6, 0.6) : 0;
    }
    I.n = n; lastState = G.state;
  }

  // ---------- minimap: spotted soldiers as small dots (dead ones grey), lost ones fading at the last known position ----------
  function map(c, cx, mx, mz, sc, Wd, lim = 1200, u = 1) { // lim: half-width of the map in metres (1200 minimap, more for the large map); u: marker size scale
    let k = 0;
    for (let i = 0; i < I.n; i++) { const o = i * 8, st = d[o + 7]; if (!st || !SEEN[i]) continue; const fresh = st === 2 || SPT[i] > 0; if (!fresh && LOST[i] > LOST_T) continue;
      const ex = st === 2 ? d[o] : LX[i], ez = st === 2 ? d[o + 2] : LZ[i]; if (Math.abs(ex - mx) > lim || Math.abs(ez - mz) > lim) continue;
      const x = clamp(cx + (ex - mx) * sc, 3 * u, Wd - 3 * u), y = clamp(cx + (ez - mz) * sc, 3 * u, Wd - 3 * u);
      c.globalAlpha = fresh ? 1 : 0.25 + 0.6 * (1 - LOST[i] / LOST_T); c.fillStyle = st === 2 ? '#7c848e' : RL[i] === RPG || RL[i] === ATG ? '#ffd23f' : '#ff7a5a';
      c.fillRect(x - 1.4 * u, y - 1.4 * u, 2.8 * u, 2.8 * u); k++; }
    c.globalAlpha = 1; I.drawn = k;
  }
  // drones see soldiers in their camera cone (not those hidden inside houses)
  function scan(ox, oy, oz, fx, fy, fz, see, mark) {
    for (let i = 0; i < I.n; i++) { const o = i * 8; if (d[o + 7] !== 1 || !exposed(i)) continue; const dx = d[o] - ox, dy = d[o + 1] + 0.6 - oy, dz = d[o + 2] - oz, dd = Math.hypot(dx, dy, dz);
      if (dd > see * 0.6 || dd < 1 || (dx * fx + dy * fy + dz * fz) / dd < 0.72) continue; if (h.losVis(ox, oy, oz, d[o], d[o + 1] + 0.6, d[o + 2]) > 0.15) SPT[i] = Math.max(SPT[i], mark); }
  }

  // ---------- waves, reset, tests ----------
  function wave(w, plan) { // rare event (wave start): may allocate
    for (let i = 0; i < I.n; i++) { const o = i * 8, st = d[o + 7]; if (!st) continue; const dp = Math.hypot(d[o] - veh.x, d[o + 2] - veh.z), dc = Math.hypot(d[o] - cam.x, d[o + 2] - cam.z);
      if ((st === 1 && (dp > 500 || (SQ[i] >= 0 && QS[SQ[i]] === 3 && dp > 200)) && dc > 200) || (st === 2 && dc > 200)) d[o + 7] = 0; } // far away, withdrawing, or dead out of sight
    for (let q = 0; q < MAXQ; q++) { if (QK[q] < 0) continue; let live = 0; for (let i = 0; i < I.n; i++) if (SQ[i] === q && d[i * 8 + 7] === 1) live++; if (!live) QK[q] = -1; }
    const ax = G.lastAxis === G.lastAxis ? G.lastAxis : 0;
    const nr = w === 6 ? 2 + (rnd() < 0.5 ? 1 : 0) : w >= 4 ? (rnd() < 0.7 ? 2 : 1) : w >= 2 ? (rnd() < 0.7 ? 1 : 0) : 0;
    let made = 0; for (let k = 0; k < nr; k++) if (placeRPG(ax + (k ? (rnd() - 0.5) * 1.2 : 0)) >= 0) made++;
    if (plan === 'ATGM ambush' || w === 6 || (w >= 4 && rnd() < 0.3)) placeATGM(ax + (rnd() - 0.5) * 0.8);
    return made;
  }
  // the crew of a destroyed buggy or motorcycle: n bodies thrown clear beside the wreck (no score: the vehicle was the kill)
  function bodies(x, z, yaw, n) { const q = squad(QDIS); if (q < 0) return;
    for (let k = 0; k < n; k++) { const a = yaw + (k & 1 ? 1.6 : -1.6) + (rnd() - 0.5) * 0.6 + (k >> 1) * 1.1, r = 1.6 + rnd() * 1.2 + (k >> 1) * 0.8, i = soldier(q, RIF, x + Math.sin(a) * r, z + Math.cos(a) * r, rnd() * 6.283); if (i < 0) return;
      const o = i * 8; d[o + 7] = 2; d[o + 4] = 6; d[o + 5] = 0; SEEN[i] = 1; SPT[i] = 8; } }
  function reset() { d.fill(0); I.n = 0; QK.fill(-1); QB.fill(-1); I.kills = 0; I.rockets = 0; I.atgms = 0; I.bursts = 0; I.drawn = 0; lastState = 0; }
  const ROLE = { rifle: RIF, rpg: RPG, atgm: ATG, loader: LDR };
  // tests: one soldier (a squad of his own) at (x, z); in building b (house team position) when given
  G.infSpawn = (role, x, z, b) => {
    if (b >= 0) { const q = houseTeam(b, 1); if (q < 0) return -1; for (let i = 0; i < I.n; i++) if (SQ[i] === q) { RL[i] = ROLE[role] ?? RIF; return i; } return -1; }
    const r = ROLE[role] ?? RIF, q = squad(r === RPG ? QRPG : r === RIF ? QDIS : QATG); if (q < 0) return -1; const i = soldier(q, r, x, z, yawTo(x, z, veh.x, veh.z));
    if (i >= 0) { BP[i] = r === ATG ? 3 : 5; MD[i] = M_FIRE; QS[q] = 2; } return i;
  };
  // tests: kind 'rpg' (house b, or forest at x, z), 'atgm', 'dis' (dismounts from enemy e), 'auto-rpg' (placeRPG on the axis)
  G.infSquad = (kind, x, z, n, b) => kind === 'rpg' ? (b >= 0 ? houseTeam(b, n || 2) : fieldTeam(x, z, n || 2)) : kind === 'atgm' ? atgmTeam(x, z) : kind === 'dis' ? dismount(x, n || 5) : kind === 'auto-rpg' ? placeRPG(x) : kind === 'auto-atgm' ? placeATGM(x) : -1;
  I.kill = kill; I.flee = flee; I.reset = reset; I.tx = TX; I.tz = TZ; I.mt = MT; I.ex = EX; I.ey = EY; I.ez = EZ;
  return { update, seg, aimHit, blast, onBld, trail, lpos, map, scan, wave, reset, bodies, hitKill: (by) => { if (I.hi >= 0) kill(I.hi, by); } };
}
