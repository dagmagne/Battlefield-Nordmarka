// Enemy artillery (phase 5, part A): when an Orlan or the enemy crews have held the player in view for WATCH s on end, a battery
// is called onto the position observed at that moment. A ranging round lands 60–120 m off a few seconds before the barrage
// (4–8 rounds of 152 mm, spread 25–40 m around the observed point) arrives 20–40 s after the call. Moving away is the counter.
// Each round is scheduled here; in its last FLY s it becomes shell type 10 in the combat shell pool (a short falling streak),
// which hits terrain, buildings or the tank and calls boom(). Everything is preallocated; update() allocates nothing.
export const WATCH = 15, MAXR = 10, FLY = 1.3, WHISTLE = 2.1, V = 320;

export function initArty(A) {
  const { G, veh, rnd, ui, sfx, hAt, fire, explode, hurtPlayer, kill, bld, bldFx, parts, enemies } = A;
  const RT = new Float32Array(MAXR), RX = new Float32Array(MAXR), RZ = new Float32Array(MAXR), RS = new Int8Array(MAXR), RK = new Int8Array(MAXR); // time to impact, aim point, state (0 free, 1 scheduled, 2 whistled, 3 in flight), kind (1 ranging)
  const IX = new Float32Array(32), IZ = new Float32Array(32), IK = new Int8Array(32); // last impacts (ring), for tests
  const T = G.arty = { x: 0, z: 0, cool: 0, n: 0, calls: 0, src: '', t: 0, brg: 0, el: 1, imp: 0, ix: IX, iz: IZ, ik: IK, rt: RT, rx: RX, rz: RZ, rs: RS, rk: RK };
  let lastState = 0;
  // schedule a barrage on (x, z): the ranging round first, then the rest
  T.call = (x, z, src) => {
    T.x = x; T.z = z; T.src = src || 'test'; T.calls++; T.brg = rnd() * 6.283; T.el = 0.95 + rnd() * 0.25; // battery bearing from the target, descent angle
    const at = 20 + rnd() * 20, n = 4 + ((rnd() * 5) | 0), R = 25 + rnd() * 15; let k = 0;
    T.cool = at + 60 + rnd() * 30; RS.fill(0);
    { const a = rnd() * 6.283, r = 60 + rnd() * 60; RT[k] = at - 4 - rnd() * 3; RX[k] = x + Math.sin(a) * r; RZ[k] = z - Math.cos(a) * r; RS[k] = 1; RK[k] = 1; k++; }
    for (let i = 0; i < n && k < MAXR; i++, k++) { const a = rnd() * 6.283, r = R * Math.pow(rnd(), 0.75); RT[k] = at + i * (0.5 + rnd() * 1.1) + rnd() * 0.4; RX[k] = x + Math.sin(a) * r; RZ[k] = z - Math.cos(a) * r; RS[k] = 1; RK[k] = 0; }
    T.n = k; T.t = at;
  };
  T.reset = () => { RS.fill(0); T.n = 0; T.cool = 0; T.imp = 0; };
  T.update = (dt) => {
    T.cool -= dt;
    const watch = Math.max(G.orlan, G.rep);
    if (!G.peace && G.state === 1 && !veh.dead && T.n === 0 && T.cool <= 0 && watch >= WATCH) T.call(veh.x, veh.z, G.orlan >= WATCH ? 'orlan' : 'crew');
    if (lastState === 1 && G.state !== 1) for (let i = 0; i < MAXR; i++) if (RS[i] && RS[i] < 3) RS[i] = 0; // wave over: the guns stop (rounds in the air still land)
    lastState = G.state;
    let n = 0;
    for (let i = 0; i < MAXR; i++) { if (!RS[i]) continue; RT[i] -= dt;
      if (RS[i] === 1 && RT[i] <= WHISTLE) { RS[i] = 2; sfx('incoming', RX[i], hAt(RX[i], RZ[i]) + 20, RZ[i], 1); }
      if (RS[i] === 2 && RT[i] <= FLY) { RS[i] = 3; launch(i, Math.max(RT[i], 0.05)); }
      if (RS[i] === 3 && RT[i] <= 0) { RS[i] = 0; if (RK[i] && Math.hypot(veh.x - T.x, veh.z - T.z) < 300 && !veh.dead) ui.toast('Artillery ranging on you — move!'); continue; }
      n++; }
    T.n = n;
  };
  // the round's last stretch: a shell in the pool that reaches the aim point (a little below the snow) exactly tf s from now
  function launch(i, tf) {
    const c = Math.cos(T.el), s = Math.sin(T.el), hx = -Math.sin(T.brg), hz = Math.cos(T.brg), vx = hx * c * V, vy = -s * V, vz = hz * c * V, ty = hAt(RX[i], RZ[i]) - 0.5;
    fire(1, 10, RX[i] - vx * tf, ty - vy * tf + 4.905 * tf * tf, RZ[i] - vz * tf, vx, vy, vz, V, 0, tf + 1.5);
  }
  // impact of a 152 mm round (t: the vehicle it struck, skip: the building it struck, already damaged by the shell pool)
  T.boom = (x, y, z, t, skip) => {
    const o = T.imp++ & 31; IX[o] = x; IZ[o] = z; IK[o] = t === veh ? 2 : 0;
    explode(x, y, z, 4);
    const gh = hAt(x, z);
    if (y - gh < 2) { // the fountain of frozen earth and snow a heavy shell throws up: a column, and clods falling back
      for (let k = 0; k < 30; k++) { const r = rnd() * 2, a = rnd() * 6.283, dk = k % 3 === 0;
        parts.emit(x + Math.cos(a) * r, gh + 0.5, z + Math.sin(a) * r, Math.cos(a) * r, 6 + rnd() * 14, Math.sin(a) * r, 2.5 + rnd() * 3, 1.8 + rnd() * 2.2, 1.3, 1, dk ? 0.14 : 0.62, dk ? 0.12 : 0.62, dk ? 0.1 : 0.64, dk ? 0.8 : 0.7); }
      for (let k = 0; k < 24; k++) { const a = rnd() * 6.283, r = 3 + rnd() * 9; parts.emit(x, gh + 0.4, z, Math.cos(a) * r, 10 + rnd() * 14, Math.sin(a) * r, 2 + rnd() * 1.5, 0.12 + rnd() * 0.18, 0, 0, 0.08, 0.07, 0.06, 1); } }
    // the player: a direct hit is heavy, splash falls off to nothing at 18 m (the armour keeps a near miss moderate)
    if (t === veh) hurtPlayer(45 + rnd() * 15, 1, true);
    else { const d = Math.hypot(veh.x - x, veh.y + 1 - y, veh.z - z); if (d < 2.5) hurtPlayer(45 + rnd() * 15, 1, true); else if (d < 18) hurtPlayer(16 * (1 - (d - 2.5) / 15.5), 1, d < 8); }
    // enemies nearby take the same (no score: these are their own guns)
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.on || e.dead) continue; const d = Math.hypot(e.x - x, e.y + 1 - y, e.z - z); if (d > 16) continue;
      e.hp -= (e.type ? 90 : 55) * Math.min(1, 1 - (d - 3) / 13); if (e.hp <= 0) { const k0 = G.kills, s0 = G.score; kill(e); G.kills = k0; G.score = s0; } }
    bld.splash(x, y, z, 14, 60, skip, bldFx);
  };
  return T;
}
