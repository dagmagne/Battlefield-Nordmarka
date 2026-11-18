// The player's own artillery support (phase 5, part B): one fire mission per wave of six 155 mm rounds, called on the sight's aim point
// or on the point a drone camera looks at. The rounds are player shells of type 11 in the combat shell pool; they are put into the
// pool about a second before they land (a short streak coming in steeply), so all hits go through updateShells and impact().
// Everything is preallocated here; update() allocates nothing (toasts on rare events do).
import { clamp } from './math.js';

const ROUNDS = 6, V = 300, FALL = 1.15, ANG = 0.95; // rounds per mission, terminal speed (m/s), seconds in the pool before impact, descent angle (rad)
const DANGER = 150, MAXR = 3400, COOL = 90; // danger-close warning (m from the tank), longest call (m), free roam: seconds until the next mission
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// h: helpers from combat.js { fire, explode, splash, hurtPlayer, bldFx }
export function initSupport(C, G, h) {
  const { W, veh, aim, cam, rnd, ui, HALF } = C, hAt = W.heightAt, D = G.drone;
  const RT = new Float32Array(ROUNDS), RX = new Float32Array(ROUNDS), RZ = new Float32Array(ROUNDS), RF = new Uint8Array(ROUNDS); // impact time after the call, point, fired
  // st: 0 ready (n missions left), 1 inbound (t counts the mission clock), 2 rounds landing; tx/tz: the called point; last*: what the HUD pill shows
  const S = { n: 1, st: 0, t: 0, t0: 0, tx: 0, tz: 0, ty: 0, src: '', cool: 0, whistle: false, splashT: false, landed: 0, calls: 0, rounds: RT, rx: RX, rz: RZ, fired: RF, hits: 0 };
  let lastKey = -2, lastState = 0;

  function pill() { // only when what it shows changes (an integer key)
    const k = S.st === 0 ? S.n : S.st === 1 ? 100 + Math.max(0, Math.ceil(S.t0 - S.t)) : 99;
    if (k === lastKey) return; lastKey = k;
    if (S.st === 0) ui.set('sR', 'ARTY ' + S.n, 'st' + (S.n ? ' on' : ''));
    else if (S.st === 1) ui.set('sR', 'ARTY ' + (k - 100) + ' s', 'st warn');
    else ui.set('sR', 'ARTY ···', 'st bad');
  }
  function reset() { S.n = 1; S.st = 0; S.t = 0; S.cool = 0; RF.fill(1); lastState = G.state; lastKey = -2; pill(); }

  // where the drone camera's centre meets the ground (or the bomber's predicted drop point); false when it looks at the sky
  const P = new Float32Array(3);
  function droneAim() {
    if (D.type === 1 && D.iok) { P[0] = D.ix; P[1] = D.iy; P[2] = D.iz; return true; }
    const cp = Math.cos(D.pitch); let dx = -Math.sin(D.yaw) * cp, dy = Math.sin(D.pitch), dz = -Math.cos(D.yaw) * cp, ox, oy, oz;
    if (D.type) { ox = D.x; oy = Math.max(D.y - 0.2, hAt(D.x, D.z) + 0.3); oz = D.z; } // the gimbal camera under the airframe
    else { ox = D.x - dx * 2.3; oz = D.z - dz * 2.3; oy = Math.max(D.y - dy * 2.3 + 0.55, hAt(ox, oz) + 0.4); dy -= 0.06; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; } // FPV: the camera trails behind
    let t = 2, tp = 2, hit = false;
    while (t < 4000) { if (oy + dy * t < hAt(ox + dx * t, oz + dz * t)) { hit = true; break; } tp = t; t += Math.max(1.5, t * 0.02); }
    if (!hit) return false;
    for (let i = 0; i < 8; i++) { const m = (t + tp) * 0.5; if (oy + dy * m < hAt(ox + dx * m, oz + dz * m)) t = m; else tp = m; }
    const fb = C.bld.ray(ox, oy, oz, ox + dx * t, oy + dy * t, oz + dz * t, false); if (fb < 1) t *= fb;
    P[0] = ox + dx * t; P[1] = oy + dy * t; P[2] = oz + dz * t; return true;
  }

  // call a mission on (x, z); src names where it came from (for the toast). Rare event: may allocate.
  function call(x, z, src) {
    if (veh.dead) return false;
    if (S.st) { ui.toast('Fire mission already on the way'); return false; }
    if (S.n <= 0) { ui.toast(G.peace ? `No fire mission available — next one in ${Math.ceil(S.cool)} s` : 'No fire mission left this wave — restocked when the wave is cleared'); return false; }
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > HALF - 80 || Math.abs(z) > HALF - 80) { ui.toast('Target outside the map'); return false; }
    const dx = x - veh.x, dz = z - veh.z, d = Math.hypot(dx, dz);
    if (d > MAXR) { ui.toast('Target too far — no observed point'); return false; }
    S.n--; S.st = 1; S.t = 0; S.tx = x; S.tz = z; S.ty = hAt(x, z); S.src = src || ''; S.whistle = false; S.splashT = false; S.landed = 0; S.calls++;
    S.t0 = 22 + rnd() * 6; // time of flight + the battery's reaction
    for (let k = 0; k < ROUNDS; k++) { // a sheaf of ~25 m round the point, dense in the middle, over about 4 s
      const a = rnd() * 6.283, r = 25 * rnd(); RX[k] = x + Math.sin(a) * r; RZ[k] = z - Math.cos(a) * r; RT[k] = S.t0 + k * 0.72 + rnd() * 0.3; RF[k] = 0; }
    const dir = DIRS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8]; // compass bearing from the tank (+z is south)
    const rng = d < 950 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km';
    ui.toast(`Fire mission: ${ROUNDS} rounds, ${Math.round(S.t0)} s — ${rng} ${dir}` + (d < DANGER ? ' · DANGER CLOSE — move away!' : ''));
    lastKey = -2; pill(); return true;
  }
  // B key / ARTY buttons: from the drone camera while a drone flies, else the sight's aim point (commander view or gunner sight)
  function key() {
    if (veh.dead) return;
    if (cam.mode === 4) {
      if (!D.on) return;
      if (!droneAim()) { ui.toast('No target — point the drone camera at the ground'); return; }
      call(P[0], P[2], 'drone');
    } else if (cam.mode < 3) {
      if (!aim.hit || Math.hypot(aim.x - veh.x, aim.z - veh.z) > MAXR - 1) { ui.toast('No target — lay the sight on the ground'); return; } // a sight on the sky has no ground point
      call(aim.x, aim.z, 'sight');
    }
  }

  // one 155 mm round lands (from impact() in combat.js): blast, crater, splash on vehicles and buildings, danger close for the tank
  function impact(x, y, z, bSkip) {
    S.hits++;
    h.explode(x, y, z, 3.6);
    const gh = hAt(x, z), P0 = C.parts;
    if (y - gh < 2) { // a 155 mm round in the snow: a tall fountain of snow and frozen earth, then a dark cloud that hangs for a while
      for (let i = 0; i < 46; i++) { const a = rnd() * 6.283, r = rnd() * 7, dk = rnd() < 0.45, up = 14 + rnd() * 20;
        P0.emit(x + Math.cos(a) * rnd() * 1.5, gh + 0.3, z + Math.sin(a) * rnd() * 1.5, Math.cos(a) * r, up, Math.sin(a) * r, 1.6 + rnd() * 1.4, dk ? 0.07 + rnd() * 0.1 : 0.05 + rnd() * 0.06, 0, 0, dk ? 0.1 : 1, dk ? 0.085 : 1, dk ? 0.07 : 1, 0.95); }
      for (let i = 0; i < 16; i++) { const a = rnd() * 6.283, r = rnd() * 2.5;
        P0.emit(x + Math.cos(a) * r, gh + 1 + rnd() * 9, z + Math.sin(a) * r, Math.cos(a) * 1.4, 3 + rnd() * 5, Math.sin(a) * 1.4, 2.2 + rnd() * 1.5, 1.6 + rnd() * 1.6, 2.4, 1, 1.15, 1.15, 1.18, 0.55); } // white snow dust in the column
      for (let i = 0; i < 12; i++) { const a = rnd() * 6.283, r = rnd() * 4;
        P0.emit(x + Math.cos(a) * r, gh + 1.5 + rnd() * 6, z + Math.sin(a) * r, Math.cos(a) * 1.2, 1.2 + rnd() * 2.5, Math.sin(a) * 1.2, 9 + rnd() * 7, 2.5 + rnd() * 2.5, 1.1, 1, 0.13, 0.12, 0.12, 0.62); } // dark smoke of the burst
    }
    h.splash(x, y, z, 4, 85, 0, 0); // close in: a near-direct hit tears a T-72 open
    h.splash(x, y, z, 15, 30, 160, 0); // fragments: kill light vehicles and BMPs within ~13 m, scratch the T-72s
    C.bld.splash(x, y, z, 12, 60, bSkip, h.bldFx);
    const d = Math.hypot(veh.x - x, veh.y + 1 - y, veh.z - z); if (d < 17.5) h.hurtPlayer(25 * clamp(1 - (d - 2.5) / 15, 0, 1), 1, false); // armour: near misses hurt, a close sheaf can still knock it out
  }

  function update(dt) {
    // restock: one mission per wave (after a cleared wave); in free roam a new one after a cooldown
    if (!G.peace && lastState === 1 && G.state === 0 && G.wave > 0) S.n = 1;
    lastState = G.state;
    if (G.peace && S.n < 1 && !S.st) { S.cool -= dt; if (S.cool <= 0) S.n = 1; }
    if (S.st) {
      S.t += dt;
      if (!S.splashT && S.t >= S.t0 - 5) { S.splashT = true; ui.toast('Splash in 5 — rounds landing'); }
      if (!S.whistle && S.t >= S.t0 - 2.4) { S.whistle = true; C.sfx('whistle', S.tx, S.ty + 30, S.tz, 1.2); }
      let left = 0;
      for (let k = 0; k < ROUNDS; k++) { if (RF[k]) continue; left++;
        if (S.t >= RT[k] - FALL) { // into the shell pool for the last stretch: steep, from the side of the guns (behind the tank)
          RF[k] = 1; S.st = 2;
          let bx = veh.x - RX[k], bz = veh.z - RZ[k], bl = Math.hypot(bx, bz); if (bl < 60) { bx = -RX[k]; bz = -RZ[k]; bl = Math.hypot(bx, bz) || 1; } bx /= bl; bz /= bl;
          const ch = Math.cos(ANG), vx = -bx * V * ch, vz = -bz * V * ch, vy = -V * Math.sin(ANG), T = FALL;
          const gy = hAt(RX[k], RZ[k]) + 0.05, vy0 = vy + 9.81 * T; // start so that the ballistic path ends on the point after T s
          h.fire(0, 11, RX[k] - vx * T, gy - vy0 * T + 0.5 * 9.81 * T * T, RZ[k] - vz * T, vx, vy0, vz, Math.hypot(vx, vy0, vz), 0, T + 1.5);
        } }
      if (!left && S.t > RT[ROUNDS - 1] + 0.5) { S.st = 0; S.cool = COOL; }
    }
    pill();
  }

  // wire into the combat loop once (no per-frame closures)
  const up0 = G.update; G.update = (dt) => { up0(dt); update(dt); };
  const rs0 = G.restart; G.restart = () => { rs0(); reset(); };
  S.call = (x, z) => call(x, z, 'test'); S.key = key; S.impact = impact; S.droneAim = () => (droneAim() ? [P[0], P[1], P[2]] : null); S.reset = reset;
  reset();
  return S;
}
