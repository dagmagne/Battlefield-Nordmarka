// Controller vibration through the Gamepad API ('dual-rumble': strong = the low-frequency motor, weak = the high-frequency one).
// A continuous layer (engine, tracks, turret, MG) plus decaying kicks from game events (own gun, hits, explosions, trees, walls, landings).
// One effect with the current mix is re-issued about every 50 ms (a new playEffect replaces the running one); the parameter object is reused,
// so the only allocation is the browser's promise at that rate. Nothing is sent without a pad that has an actuator.
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const NK = 8, LV = [0, 0.55, 1], ENG = 0.65; // kick pool; level gain: off, light, full; engine layer gain (owner: 'a bit less than the rest')

export function initHaptics(o) {
  const { veh, game, ui } = o, D = game.drone;
  const KS = new Float32Array(NK), KW = new Float32Array(NK), KT = new Float32Array(NK), KD = new Float32Array(NK);
  const P = { startDelay: 0, duration: 120, strongMagnitude: 0, weakMagnitude: 0 };
  let tIss = 0, active = false, fresh = false, ld = 0, rpm = 0.85, ep = 0, iv = 0.045, tPrev = veh.turYaw, mgF = 0, act = null;
  const H = { level: o.level === undefined ? 2 : o.level, strong: 0, weak: 0, calls: 0, events: 0, ev, update, setLevel, stop };

  function kick(s, w, dur) {
    let j = 0, q = 1e9; // replace a finished or the weakest kick
    for (let i = 0; i < NK; i++) { const v = KT[i] <= 0 ? -1 : (KS[i] + KW[i]) * KT[i] / KD[i]; if (v < q) { q = v; j = i; } }
    KS[j] = cl(s, 0, 1); KW[j] = cl(w, 0, 1); KT[j] = KD[j] = dur; fresh = true; H.events++;
  }
  // game events (the same names as the sound events, plus 'land'); distances from the vehicle being controlled
  function ev(n, x, y, z, k) {
    if (!H.level || !ui.pad) return; // nothing to feel it on: do not queue kicks that would replay when a pad connects
    const fly = D.on && !D.auto, lx = fly ? D.x : veh.x, ly = fly ? D.y : veh.y + 1.5, lz = fly ? D.z : veh.z;
    const d = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly) + (z - lz) * (z - lz));
    switch (n) {
      case 'gun': if (d < 25) kick(1, 0.75, 0.34); break; // own main gun
      case 'hit': if (!fly && d < 8) { const s = cl(0.2 + k * 0.025, 0.25, 1); kick(s, 0.35 + 0.5 * s, 0.1 + 0.012 * Math.min(k, 30)); } break; // hits on the own tank (k = damage)
      case 'boom': { const a = cl(k * 0.45, 0.15, 1.2) / (1 + (d / (14 + 10 * k)) ** 2); if (a > 0.04) kick(a, a * 0.6, 0.22 + 0.08 * Math.min(k, 4)); break; }
      case 'collapse': { const a = 0.7 / (1 + (d / 35) ** 2); if (a > 0.04) kick(a, a * 0.4, 0.6); break; }
      case 'crash': if (k < 1) { if (!fly && d < 9) kick(0.28, 0.6, 0.15); } else if (!fly && d < 10) { const s = cl(k / 10, 0.3, 1); kick(s, s * 0.7, 0.3); } break; // tree felled / wall
      case 'egun': { const a = 0.3 / (1 + (d / 40) ** 2); if (a > 0.04) kick(a, a * 0.5, 0.15); break; }
      case 'smoke': if (!fly && d < 5) kick(0.2, 0.4, 0.12); break; // own smoke grenades
      case 'reload': if (!fly && d < 6) kick(0.05, 0.3 * k, 0.07); else if (fly && d < 3) kick(0, 0.25, 0.06); break; // breech closes (k 1), repair clank (k 0.3); a bomber grenade released
      case 'land': if (!fly && k > 1) kick(cl(k / 8, 0.2, 1), cl(k / 12, 0.1, 0.8), 0.25); break; // touchdown after a crest (k = impact speed)
    }
  }
  function send(pad) {
    if (act !== pad.vibrationActuator) act = pad.vibrationActuator || null;
    try {
      if (act && act.playEffect) { act.playEffect('dual-rumble', P); H.calls++; }
      else if (pad.hapticActuators && pad.hapticActuators[0]) { pad.hapticActuators[0].pulse(Math.max(P.strongMagnitude, P.weakMagnitude), P.duration); H.calls++; } // Firefox
    } catch (e) { /* unsupported effect: stay silent */ }
  }
  function stop() {
    const pad = ui.pad; H.strong = H.weak = 0; KT.fill(0);
    if (active && pad) { P.strongMagnitude = P.weakMagnitude = 0; P.duration = 1; send(pad); }
    active = false;
  }
  function setLevel(v) { H.level = v; if (!v) stop(); else { kick(0.6 * LV[v], 0.6 * LV[v], 0.2); } } // a short buzz so the choice can be felt

  function update(dt) {
    let pad = ui.pad;
    if (pad && !pad.vibrationActuator && !pad.hapticActuators) pad = null;
    if (!pad || !H.level || (typeof document !== 'undefined' && document.hidden)) { if (active) stop(); else KT.fill(0); return; } // drop pending kicks too
    const menu = ui.modalOpen && ui.modalOpen(); // help or menu open: only kicks (the test buzz of the menu row)
    // continuous layer: engine (pulses that follow the rpm of the sound), tracks by speed (softer on a plowed road), turret traverse, MG
    const alive = !veh.dead, av = Math.abs(veh.v), sv = Math.min(1, av / 18), th = alive ? Math.abs(veh.throttle) : 0;
    ld += (cl(0.7 * th + 0.45 * sv, 0, 1) - ld) * Math.min(1, dt * 4);
    rpm += ((0.85 + 0.4 * sv + 0.2 * th) - rpm) * Math.min(1, dt * 2.5); // the same rpm as the engine sound: 0.85 idle .. 1.45
    const r = cl((rpm - 0.85) / 0.6, 0, 1), ef = 3 + 4 * r; // engine pulse rate: a slow chug at idle (3 Hz) to a fast throb (7 Hz at full revs)
    ep += dt * ef; if (ep > 1) ep -= Math.floor(ep);
    iv = cl(0.24 / ef, 0.03, 0.045); // send often enough for about four samples per pulse (on average: the interval accumulates)
    let dy = veh.turYaw - tPrev; tPrev = veh.turYaw; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)));
    const tr = dt > 0 ? Math.min(1, dy / dt / 0.75) : 0, fly = D.on && !D.auto;
    let s = 0, w = 0;
    if (alive && !menu) {
      const trk = veh.air ? 0 : Math.min(1, av / 2.5) * (0.06 + 0.2 * sv) * (1 - 0.45 * veh.road);
      const dep = 0.8 - 0.5 * r, wave = 0.5 + 0.5 * Math.sin(ep * 6.2832); // deep pulses at idle, smoother when revving
      s = ENG * (0.035 + 0.045 * r + 0.02 * ld) * (1 - dep + dep * wave) + 0.2 * veh.shake;
      w = ENG * 0.03 * r * r + trk * (0.8 + 0.4 * Math.random()) + 0.06 * tr; // a little of the fast motor joins at high rpm
      if (game.mgOn || game.hmgOn) { w += mgF ? 0.42 : 0.18; s += 0.08; } // alternates per effect sent: a rattle
      if (fly) { s = 0; w = D.type === 0 ? 0.025 + 0.04 * Math.min(1, Math.hypot(D.vx, D.vy, D.vz) / 26) : 0; } // flying a drone: the tank is out of mind; the FPV hums faintly with its speed, bomber and recon are still
    }
    // kicks: linear fade with a little hold at the start
    for (let i = 0; i < NK; i++) { if (KT[i] <= 0) continue; const f = Math.min(1, 1.25 * KT[i] / KD[i]); s += KS[i] * f; w += KW[i] * f; KT[i] -= dt; }
    const g = LV[H.level] || 0;
    H.strong = s = cl(s * g, 0, 1); H.weak = w = cl(w * g, 0, 1);
    tIss -= dt;
    if (tIss > 0 && !fresh) return;
    tIss = Math.max(tIss + iv, 0.5 * iv); fresh = false; mgF ^= 1;
    if (s < 0.01 && w < 0.01) { if (active) stop(); return; }
    P.strongMagnitude = s; P.weakMagnitude = w; P.duration = Math.round(Math.max(120, dt * 2500));
    send(pad); active = true;
  }
  return H;
}
