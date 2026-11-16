// Procedural sound: every buffer is synthesised at start-up (no audio files), continuous voices are created once,
// and update() only sets AudioParams (no per-frame allocation). One-shots go through a fixed pool of 12 voice chains.

// ---------- synthesis (pure: no browser APIs, so tools/audio-check.mjs can run it in Node) ----------
// add(): one component into buffer a at time t0 (s); loops (wrap) wrap around the end so they stay seamless, one-shots are cut.
// f0 > 0: sine gliding from f0 to f1; f0 < 0: white noise through a one-pole lowpass at -f0 Hz. Envelope exp(-t/dec), optional attack.
function add(a, sr, rn, wrap, t0, amp, dec, f0, f1, att) {
  const n = a.length, i0 = Math.round(t0 * sr), m = Math.min(wrap ? n : n - i0, Math.ceil(dec * 7 * sr));
  const k = f0 < 0 ? 1 - Math.exp(-6.283 * -f0 / sr) : 0, nk = k ? Math.sqrt((2 - k) / k) * 0.6 : 0, de = Math.exp(-1 / (dec * sr)), da = att ? Math.exp(-1 / (att * sr)) : 0;
  let y = 0, ph = 0, e = amp, ea = 1, g = 1;
  for (let i = 0; i < m; i++) {
    let v;
    if (k) { y += k * (rn() - y); v = y * nk; } else { ph += 6.283 * (f1 + (f0 - f1) * g) / sr; v = Math.sin(ph); }
    a[(i0 + i) % n] += v * e * (1 - ea);
    e *= de; g *= de; ea *= da;
  }
}
// feedback echo through a lowpass (the valley answering), soft clip, fade the end of one-shots, normalise the peak to 0.9
function fin(a, sr, wrap, del, fb, drive) {
  const n = a.length;
  if (del) { const d = Math.round(del * sr); let y = 0; for (let i = d; i < n; i++) { y += 0.3 * (a[i - d] - y); a[i] += fb * y; } }
  let p = 1e-9; for (let i = 0; i < n; i++) { if (drive) a[i] = Math.tanh(a[i] * drive); if (!wrap && i > n * 0.7) a[i] *= 0.5 + 0.5 * Math.cos(3.1416 * (i - n * 0.7) / (n * 0.3)); p = Math.max(p, Math.abs(a[i])); }
  for (let i = 0; i < n; i++) a[i] *= 0.9 / p;
  return a;
}
export function synth(sr) {
  let sd = 7; const rn = () => (sd = Math.imul(sd, 1664525) + 1013904223 | 0) / 2147483648, u = () => rn() * 0.5 + 0.5;
  const B = {};
  const mk = (name, sec, fn, del, fb, drive) => { const a = new Float32Array(Math.round(sec * sr)), w = 'mg dsl trk'.includes(name); fn((t, amp, dec, f0, f1, att) => add(a, sr, rn, w, t, amp, dec, f0, f1 || 0, att)); B[name] = fin(a, sr, w, del, fb, drive); };
  const parts = (c, t, fs, as, ds, g) => { for (let i = 0; i < fs.length; i++) c(t, as[i] * g, ds[i], fs[i], fs[i] * 0.985); };
  // 120/125 mm report: supersonic crack, muzzle blast body, pressure thump, rolling rumble, echo
  mk('gun', 2.6, (c) => { c(0, 1.3, 0.006, -6000); c(0, 1, 0.22, -500); c(0, 1.2, 0.2, 75, 32); c(0.01, 0.8, 0.9, -160, 0, 0.04); }, 0.37, 0.32, 1.6);
  mk('dgun', 3.8, (c) => { c(0, 0.6, 0.35, -300, 0, 0.02); c(0, 0.8, 0.35, 45, 25, 0.01); c(0, 1, 1.3, -120, 0, 0.12); }, 0.6, 0.45);
  mk('boom', 3.4, (c) => { c(0, 1, 0.02, -5000); c(0, 1.2, 0.4, -700, 0, 0.003); c(0, 1.2, 0.35, 55, 24); c(0, 0.9, 1.4, -110, 0, 0.08);
    for (let i = 0; i < 14; i++) c(0.15 + u() * 1.2, 0.15 * u(), 0.01, -3000); }, 0.5, 0.3, 1.3);
  mk('s30', 0.9, (c) => { c(0, 1, 0.004, -7000); c(0, 0.8, 0.06, -1100); c(0, 0.8, 0.05, 130, 70); c(0, 0.35, 0.3, -250, 0, 0.01); }, 0.3, 0.2, 1.4);
  // coax MG3 loop: six rounds at 18 rounds/s, integer spacing so it loops without a seam
  const p = Math.round(sr / 18);
  mk('mg', 6 * p / sr, (c) => { for (let k = 0; k < 6; k++) { const t = k * p / sr + u() * 0.0008, g = 0.85 + 0.15 * u();
    c(t, g, 0.003, -8000); c(t, 0.6 * g, 0.016, -1500); c(t, 0.7 * g, 0.012, 160, 90); c(t + 0.012, 0.25, 0.0015, -9000); } });
  mk('rel', 1, (c) => { c(0, 0.15, 0.05, -2500, 0, 0.04); parts(c, 0.35, [190, 433, 870, 1520, 2650], [1, 0.6, 0.4, 0.25, 0.15], [0.12, 0.09, 0.07, 0.05, 0.04], 1);
    c(0.35, 0.6, 0.004, -6000); c(0.62, 0.3, 0.02, 1250, 1200); c(0.62, 0.3, 0.002, -7000); });
  mk('hit', 1.5, (c) => { c(0, 1.2, 0.012, -7000); c(0, 1, 0.1, 70, 45); parts(c, 0, [220, 563, 1145, 1987, 3240, 4710], [0.6, 0.55, 0.45, 0.35, 0.25, 0.2], [0.6, 0.45, 0.35, 0.25, 0.18, 0.12], 1); }, 0, 0, 1.5);
  mk('smk', 0.7, (c) => { c(0, 1, 0.06, 95, 50); c(0, 0.7, 0.08, -900); c(0.02, 0.25, 0.25, -5000, 0, 0.02); });
  mk('col', 4, (c) => { c(0, 0.8, 0.03, -3000); c(0, 1, 1.6, -90, 0, 0.15); c(0, 0.6, 1, -350, 0, 0.3);
    for (let i = 0; i < 60; i++) { const q = u(), t = 2.8 * q * q; c(t, 0.35 * (1 - t / 3.2), 0.02, -1000 - 2500 * u()); }
    for (let i = 0; i < 10; i++) c(u() * 2, 0.4, 0.08, 60 + 30 * u(), 40); }, 0.45, 0.25);
  mk('cr', 1, (c) => { c(0, 1, 0.02, -2500); c(0, 1, 0.1, 75, 45); for (let i = 0; i < 18; i++) c(u() * 0.6, 0.3 * u(), 0.01, -2000 - 3000 * u()); c(0, 0.3, 0.15, 1300, 1250); c(0, 0.25, 0.12, 2200, 2150); });
  // V12 diesel loop: 30 firing pulses in 0.5 s (60 Hz at idle), uneven cylinders, plus a 30 Hz half-order (whole cycles: seamless)
  mk('dsl', 0.5, (c) => { for (let k = 0; k < 30; k++) { const t = k / 60, g = (0.7 + 0.3 * rn()) * (k % 6 ? 1 : 1.25); c(t, 0.6 * g, 0.004, -2000); c(t, g, 0.006, 150, 130); c(t, 0.5 * g, 0.012, 70, 60); } });
  for (let i = 0, a = B.dsl; i < a.length; i++) a[i] = a[i] * 0.85 + 0.12 * Math.sin(6.283 * 30 * i / sr);
  // track links slapping the sprockets and road wheels: 8 per loop
  mk('trk', 0.6, (c) => { for (let k = 0; k < 8; k++) { const t = k * 0.075 + u() * 0.006, g = 0.7 + 0.3 * u(); c(t, 0.8 * g, 0.003, -6000); c(t, 0.5 * g, 0.025, 820 + 60 * rn(), 800);
    c(t, 0.35 * g, 0.018, 1780 + 90 * rn(), 1750); c(t, 0.25 * g, 0.012, 2950, 2900); c(t, 0.6 * g, 0.03, 90, 70); } });
  const nz = B.nz = new Float32Array(sr); for (let i = 0; i < sr; i++) nz[i] = rn() * 0.9;
  return B;
}

// ---------- runtime ----------
// event name -> [buffer, volume a + b*k, reference distance (m), playback rate r0 + rk*k]
const EV = { gun: ['gun', 1.3, 0, 70, 1, 0], egun: ['gun', 1.2, 0, 70, 0.92, 0], auto: ['s30', 0.8, 0, 35, 1, 0], boom: ['boom', 0.35, 0.35, 70, 1.4, -0.18],
  hit: ['hit', 0.5, 0.025, 20, 1, 0], reload: ['rel', 0.5, 0, 10, 1, 0], smoke: ['smk', 0, 0.7, 30, 1.3, -0.3], collapse: ['col', 0.5, 0.25, 90, 1.1, -0.1], crash: ['cr', 0.3, 0.05, 40, 1, 0] };
const NV = 12, SR = 48000;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const lpf = (d) => 200 + 17000 * Math.exp(-d / 250); // air absorption: distant thunder, close crack

export function initAudio(o) {
  const { R, cam, veh, view, game } = o, D = game.drone, EN = game.enemies;
  let ac = null, B = null, bus, T = 0, LD = 0, LP = 0, rpm = 1, tPrev = veh.turYaw, offT = 0;
  const S = { on: !!o.on, count: {}, played: {}, live: 0, srcs: 0, nodes: 0, master: 0, engine: { rate: 0, gain: 0 }, mg: 0, start, setOn, update, play };
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined; // webkit prefix: iOS before 14.5
  Object.defineProperty(S, 'state', { get: () => (ac ? ac.state : !AC ? 'unsupported' : 'waiting') });
  const vEnd = new Float64Array(NV), vG = new Float32Array(NV), vSrc = [], vLP = [], vGain = [], vPan = [];
  const best = new Int16Array(3), bd = new Float32Array(3), eV = new Int16Array(3).fill(-1), eSrc = [], eLP = [], eG = [], eP = [];
  let tSum, tLP, tPan, dsl, eLPf, eGain, rBP, rG, wO, wG, trk, kLP, kG, cLP, cG, uO1, uO2, uG, mG, dO = [], dLP, dG, dPan;
  const raw = AC ? synth(SR) : null; // ~0.1 s at load, so the first click does not hitch
  R.sfx = play;

  // listener = camera; sets LD (distance) and LP (pan from the camera's right vector)
  function loc(x, y, z) { const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z; LD = Math.sqrt(dx * dx + dy * dy + dz * dz); LP = LD > 0.5 ? cl((dx * view[0] + dy * view[4] + dz * view[8]) / LD, -1, 1) * 0.8 : 0; }
  const sp = (p, v, tau) => p.setTargetAtTime(v, T, tau || 0.06);
  const now = (p, v) => { p.cancelScheduledValues(0); p.setValueAtTime(v, T); };
  const endFn = () => { S.srcs--; };

  function build() {
    const nd = (n) => { S.nodes++; return n; };
    const G = (v, dst) => { const g = nd(ac.createGain()); g.gain.value = v; if (dst) g.connect(dst); return g; };
    const F = (type, f, dst, q) => { const b = nd(ac.createBiquadFilter()); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; b.connect(dst); return b; };
    const Pn = (dst) => { const p = nd(ac.createStereoPanner()); p.connect(dst); return p; };
    const loop = (buf, dst, off) => { const s = nd(ac.createBufferSource()); s.buffer = buf; s.loop = true; s.connect(dst); s.start(0, off || 0); return s; };
    const osc = (type, f, dst) => { const s = nd(ac.createOscillator()); s.type = type; s.frequency.value = f; s.connect(dst); s.start(); return s; };
    B = {}; for (const k in raw) { const b = ac.createBuffer(1, raw[k].length, SR); b.copyToChannel(raw[k], 0); B[k] = b; }
    const comp = nd(ac.createDynamicsCompressor()); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25; comp.connect(ac.destination);
    bus = G(S.on ? 0.6 : 0, comp); S.master = bus.gain.value;
    for (let i = 0; i < NV; i++) { vPan[i] = Pn(bus); vGain[i] = G(0, vPan[i]); vLP[i] = F('lowpass', 18000, vGain[i]); vSrc[i] = null; }
    // the player's tank: everything sums into one bus that is attenuated, filtered and panned as a single source
    tPan = Pn(bus); tLP = F('lowpass', 18000, tPan); tSum = G(0, tLP);
    eGain = G(0, tSum); eLPf = F('lowpass', 600, eGain); dsl = loop(B.dsl, eLPf);
    rG = G(0, tSum); rBP = F('bandpass', 300, rG, 0.7); loop(B.nz, rBP);
    wG = G(0, tSum); wO = osc('sine', 1500, wG);
    kG = G(0, tSum); kLP = F('lowpass', 1600, kG); trk = loop(B.trk, kLP);
    cG = G(0, tSum); cLP = F('lowpass', 400, cG); loop(B.nz, cLP, 0.5);
    uG = G(0, tSum); const uLP = F('lowpass', 900, uG); uO1 = osc('sawtooth', 210, uLP); uO2 = osc('sawtooth', 317, uLP);
    mG = G(0, tSum); loop(B.mg, mG);
    // FPV drone: four detuned rotors
    dPan = Pn(bus); dG = G(0, dPan); dLP = F('lowpass', 2400, dG); for (let i = 0; i < 4; i++) dO.push(osc('sawtooth', 200, dLP));
    // three positional enemy engines, given to the nearest live enemies each frame
    for (let i = 0; i < 3; i++) { eP[i] = Pn(bus); eG[i] = G(0, eP[i]); eLP[i] = F('lowpass', 800, eG[i]); eSrc[i] = loop(B.dsl, eLP[i], i * 0.13); }
  }
  function start() {
    if (!ac) {
      const A = raw && AC; if (!A) return;
      // iOS: without this Web Audio counts as 'ambient' and the ring/silent switch mutes it
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
      try { ac = new A({ latencyHint: 'interactive' }); build(); } catch (e) { ac = null; return; }
      if (!S.on) ac.suspend().catch(() => {});
    }
    if (S.on && ac.state !== 'running') ac.resume().catch(() => {}); // also 'interrupted' (iOS after a call or app switch)
  }
  function setOn(v) {
    S.on = !!v; if (!ac) return;
    T = ac.currentTime; bus.gain.cancelScheduledValues(0); bus.gain.setTargetAtTime(S.on ? 0.6 : 0, T, 0.02); S.master = S.on ? 0.6 : 0;
    clearTimeout(offT);
    if (S.on) ac.resume().catch(() => {});
    else { for (let i = 0; i < NV; i++) if (vSrc[i]) { try { vSrc[i].stop(); } catch (e) { /* ended */ } vSrc[i] = null; vEnd[i] = 0; }
      offT = setTimeout(() => { if (!S.on) ac.suspend().catch(() => {}); }, 150); } // suspended = no audio CPU while muted
  }
  if (typeof addEventListener !== 'undefined') {
    // iOS Safari only unlocks audio on the release of a touch (touchend / pointerup / click), not on pointerdown
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, start, true);
    document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => {}); else if (S.on) ac.resume().catch(() => {}); });
  }

  // one-shot: delayed by the speed of sound, quieter and darker with distance, panned; drops the quietest when all 12 voices are busy
  function play(n, x, y, z, k) {
    S.count[n] = (S.count[n] | 0) + 1;
    const E = EV[n]; if (!E || !ac || !S.on || ac.state !== 'running') return;
    T = ac.currentTime; loc(x, y, z);
    const d = LD, g = Math.min(1.6, E[1] + E[2] * k) / (1 + d / E[3]), buf = B[E[0] === 'gun' && d > 300 ? 'dgun' : E[0]];
    let i = -1, q = g;
    for (let j = 0; j < NV; j++) { if (vEnd[j] <= T) { i = j; break; } if (vG[j] < q) { q = vG[j]; i = j; } }
    if (i < 0) return;
    if (vSrc[i] && vEnd[i] > T) { try { vSrc[i].stop(); } catch (e) { /* ended */ } }
    const t0 = T + Math.min(3, d / 340), r = cl(E[4] + E[5] * k, 0.6, 2) * (0.96 + 0.08 * Math.random()), s = ac.createBufferSource();
    s.buffer = buf; s.playbackRate.value = r; s.connect(vLP[i]); s.onended = endFn;
    now(vLP[i].frequency, lpf(d)); now(vGain[i].gain, g); now(vPan[i].pan, LP);
    s.start(t0); S.srcs++; vSrc[i] = s; vEnd[i] = t0 + buf.duration / r; vG[i] = g;
    S.played[n] = (S.played[n] | 0) + 1;
  }

  // per frame: only AudioParam values (no allocation)
  function update(dt) {
    if (!ac || ac.state !== 'running') return;
    T = ac.currentTime;
    let live = 0; for (let i = 0; i < NV; i++) if (vEnd[i] > T) live++; S.live = live;
    const alive = !veh.dead, av = Math.abs(veh.v), sv = Math.min(1, av / 18), th = Math.abs(veh.throttle) * (alive ? 1 : 0);
    loc(veh.x, veh.y + 1.6, veh.z); sp(tSum.gain, 1 / (1 + LD / 40)); sp(tLP.frequency, lpf(LD)); sp(tPan.pan, LP);
    rpm += ((1 + 1.9 * sv + 0.55 * th) - rpm) * Math.min(1, dt * 3);
    const eg = alive ? 0.3 + 0.25 * th + 0.15 * sv : 0;
    sp(dsl.playbackRate, rpm); sp(eLPf.frequency, 350 + 900 * th + 500 * sv); sp(eGain.gain, eg, 0.15);
    sp(rBP.frequency, 260 * rpm); sp(rG.gain, alive ? 0.05 + 0.12 * th : 0, 0.15);
    sp(wO.frequency, 1500 * rpm); sp(wG.gain, alive ? 0.006 + 0.012 * th * sv : 0, 0.2);
    const kv = alive ? Math.min(1, av / 3) * (veh.air ? 0.3 : 1) : 0;
    sp(trk.playbackRate, 0.35 + av / 5.5); sp(kG.gain, 0.45 * kv * (0.6 + 0.4 * sv)); sp(kLP.frequency, 1600 + 3500 * veh.road);
    sp(cG.gain, 0.25 * kv * Math.min(1, av / 6) * (1 - 0.7 * veh.road)); sp(cLP.frequency, 300 + 250 * sv);
    let dy = veh.turYaw - tPrev; tPrev = veh.turYaw; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)));
    const tr = dt > 0 ? Math.min(1, dy / dt / 0.75) : 0;
    sp(uG.gain, 0.1 * tr, 0.04); sp(uO1.frequency, 180 + 50 * tr); sp(uO2.frequency, 272 + 75 * tr);
    const mg = game.mgOn ? 0.55 : 0; sp(mG.gain, mg, mg ? 0.004 : 0.025);
    S.engine.rate = rpm; S.engine.gain = eg; S.mg = mg;
    // drone
    if (D.on) { loc(D.x, D.y, D.z); const f = 185 + 3.5 * Math.hypot(D.vx, D.vy, D.vz); for (let i = 0; i < 4; i++) sp(dO[i].frequency, f * (1 + (i - 1.5) * 0.013), 0.08);
      sp(dG.gain, 0.09 / (1 + LD / 25)); sp(dLP.frequency, Math.min(2400, lpf(LD))); sp(dPan.pan, LP); } else sp(dG.gain, 0, 0.03);
    // the three nearest live enemy engines (stable assignment, so a voice does not jump between vehicles)
    bd.fill(1e12); best.fill(-1);
    for (let i = 0; i < EN.length; i++) { const e = EN[i]; if (!e.on || e.dead) continue; const d2 = (e.x - cam.x) ** 2 + (e.z - cam.z) ** 2; if (d2 > 1.44e6) continue;
      for (let j = 0; j < 3; j++) if (d2 < bd[j]) { for (let m = 2; m > j; m--) { bd[m] = bd[m - 1]; best[m] = best[m - 1]; } bd[j] = d2; best[j] = i; break; } }
    for (let v = 0; v < 3; v++) if (eV[v] >= 0 && best.indexOf(eV[v]) < 0) eV[v] = -1;
    for (let j = 0; j < 3; j++) { const b = best[j]; if (b < 0 || eV.indexOf(b) >= 0) continue; const v = eV.indexOf(-1); if (v >= 0) eV[v] = b; }
    for (let v = 0; v < 3; v++) { const e = eV[v] >= 0 ? EN[eV[v]] : null;
      if (!e) { sp(eG[v].gain, 0, 0.2); continue; }
      loc(e.x, e.y + 1.5, e.z); const ev = Math.min(1, Math.abs(e.v) / 9);
      sp(eSrc[v].playbackRate, (e.type ? 1.15 : 0.85) * (1 + 1.4 * ev)); sp(eG[v].gain, (0.3 + 0.25 * ev) / (1 + LD / 40), 0.15); sp(eLP[v].frequency, Math.min(1400, lpf(LD))); sp(eP[v].pan, LP); }
  }
  return S;
}
