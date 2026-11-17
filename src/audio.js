// Sound: the engines, tracks and drone are recorded loops (src/sndrec.js, decoded when the AudioContext starts); every
// other buffer is synthesised at start-up. Continuous voices are created once and update() only sets AudioParams
// (no per-frame allocation). One-shots go through a fixed pool of 12 voice chains.

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
  const mk = (name, sec, fn, del, fb, drive) => { const a = new Float32Array(Math.round(sec * sr)), w = name === 'mg'; fn((t, amp, dec, f0, f1, att) => add(a, sr, rn, w, t, amp, dec, f0, f1 || 0, att)); B[name] = fin(a, sr, w, del, fb, drive); };
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
  // hit on our own armour, heard inside: sharp crack, heavy body thump, a short dead metallic knock (no ringing), spall rattle, dust rumble
  mk('hit', 1.4, (c) => { c(0, 1, 0.006, -6000); c(0, 1.3, 0.16, 62, 34); c(0, 1, 0.07, -450); c(0, 0.5, 0.35, -140, 0, 0.02);
    parts(c, 0, [310, 677, 1190, 1730], [0.35, 0.25, 0.18, 0.12], [0.04, 0.03, 0.022, 0.016], 1);
    for (let i = 0; i < 16; i++) { const q = u(); c(0.02 + 0.45 * q * q, 0.18 * u(), 0.006, -2500 - 3500 * u()); } }, 0, 0, 1.4);
  mk('smk', 0.7, (c) => { c(0, 1, 0.06, 95, 50); c(0, 0.7, 0.08, -900); c(0.02, 0.25, 0.25, -5000, 0, 0.02); });
  mk('col', 4, (c) => { c(0, 0.8, 0.03, -3000); c(0, 1, 1.6, -90, 0, 0.15); c(0, 0.6, 1, -350, 0, 0.3);
    for (let i = 0; i < 60; i++) { const q = u(), t = 2.8 * q * q; c(t, 0.35 * (1 - t / 3.2), 0.02, -1000 - 2500 * u()); }
    for (let i = 0; i < 10; i++) c(u() * 2, 0.4, 0.08, 60 + 30 * u(), 40); }, 0.45, 0.25);
  mk('cr', 1, (c) => { c(0, 1, 0.02, -2500); c(0, 1, 0.1, 75, 45); for (let i = 0; i < 18; i++) c(u() * 0.6, 0.3 * u(), 0.01, -2000 - 3000 * u()); c(0, 0.3, 0.15, 1300, 1250); c(0, 0.25, 0.12, 2200, 2150); });
  const nz = B.nz = new Float32Array(sr); for (let i = 0; i < sr; i++) nz[i] = rn() * 0.9;
  return B;
}

// ---------- runtime ----------
// event name -> [buffer, volume a + b*k, reference distance (m), playback rate r0 + rk*k]
const EV = { gun: ['gun', 1.3, 0, 70, 1, 0], egun: ['gun', 1.2, 0, 70, 0.92, 0], auto: ['s30', 0.8, 0, 35, 1, 0], boom: ['boom', 0.35, 0.35, 70, 1.4, -0.18],
  hit: ['hit', 0.5, 0.025, 20, 1.15, -0.012], reload: ['rel', 0.5, 0, 10, 1, 0], smoke: ['smk', 0, 0.7, 30, 1.3, -0.3], collapse: ['col', 0.5, 0.25, 90, 1.1, -0.1], crash: ['cr', 0.3, 0.05, 40, 1, 0] };
const NV = 12, SR = 48000;
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const lpf = (d) => 200 + 17000 * Math.exp(-d / 250); // air absorption: distant thunder, close crack

export function initAudio(o) {
  const { R, cam, veh, view, game } = o, D = game.drone, EN = game.enemies;
  let ac = null, B = null, bus, T = 0, LD = 0, LP = 0, rpm = 0.85, ld = 0, tPrev = veh.turYaw, offT = 0;
  const S = { on: !!o.on, rec: {}, count: {}, played: {}, live: 0, srcs: 0, nodes: 0, master: 0, engine: { rate: 0, gain: 0 }, mg: 0, start, setOn, update, play };
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined; // webkit prefix: iOS before 14.5
  Object.defineProperty(S, 'state', { get: () => (ac ? ac.state : !AC ? 'unsupported' : 'waiting') });
  const vEnd = new Float64Array(NV), vG = new Float32Array(NV), vSrc = [], vLP = [], vGain = [], vPan = [];
  const best = new Int16Array(3), bd = new Float32Array(3), eV = new Int16Array(3).fill(-1), eSrc = [], eLP = [], eG = [], eP = [];
  let tSum, tLP, tPan, eLPf, eGain, kLP, kG, cLP, cG, uO1, uO2, uG, mG, dLP, dG, dPan;
  const eL = [], eLG = [], trk = [], dS = [], REC = o.rec || {}, RM = o.recM || {}; // recorded loops: engine layers, tracks, drone rotors
  const recS = [];
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
    // engine: three recorded layers (Leopard 2A4 idle, Leopard running, a heavier engine under load) at a common pitch
    eGain = G(0, tSum); eLPf = F('lowpass', 2000, eGain);
    for (let i = 0; i < 3; i++) { eLG[i] = G(0, eLPf); eL[i] = rec('e' + i, eLG[i], i * 0.7); }
    kG = G(0, tSum); kLP = F('lowpass', 2500, kG); trk.push(rec('tk', kLP, 0));
    cG = G(0, tSum); cLP = F('lowpass', 400, cG); loop(B.nz, cLP, 0.5);
    uG = G(0, tSum); const uLP = F('lowpass', 900, uG); uO1 = osc('sawtooth', 210, uLP); uO2 = osc('sawtooth', 317, uLP);
    mG = G(0, tSum); loop(B.mg, mG);
    // FPV drone: the recorded rotor loop twice, slightly detuned (the motors never run in step)
    dPan = Pn(bus); dG = G(0, dPan); dLP = F('lowpass', 6000, dG); for (let i = 0; i < 2; i++) dS.push(rec('dr', dLP, i * 0.21));
    // three positional enemy engines (a recorded tank on the move), given to the nearest live enemies each frame
    for (let i = 0; i < 3; i++) { eP[i] = Pn(bus); eG[i] = G(0, eP[i]); eLP[i] = F('lowpass', 2000, eG[i]); eSrc[i] = rec('en', eLP[i], i * 0.9); }
    decode();
  }
  // a looping source whose buffer arrives once the MP3 is decoded (silent until then; playbackRate can be set at once)
  function rec(k, dst, off) { const s = ac.createBufferSource(); S.nodes++; s.loop = true; s.connect(dst); s.off = off; s.key = k; recS.push(s); return s; }
  // decode each MP3, then build the seamless loop: body L after the margin M, its first F seconds cross-faded (equal power)
  // with the continuation recorded after the body, so the seam lands on continuous material whatever the decoder delay
  function decode() {
    for (const k in REC) {
      const b64 = REC[k], m = RM[k]; if (!b64 || !m) continue;
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const ok = (d) => {
        const sr = d.sampleRate, x = d.getChannelData(0), m0 = Math.round(RM.M * sr), n = Math.round(m[0] * sr), f = Math.round(m[1] * sr);
        if (x.length < m0 + n + f) return;
        const b = ac.createBuffer(1, n, sr), y = b.getChannelData(0);
        y.set(x.subarray(m0, m0 + n));
        for (let i = 0; i < f; i++) { const a = 1.5708 * i / f; y[i] = x[m0 + i] * Math.sin(a) + x[m0 + n + i] * Math.cos(a); }
        S.rec[k] = b.duration;
        for (const s of recS) if (s.key === k && !s.buffer) { s.buffer = b; s.start(0, s.off % b.duration); }
      };
      try { const p = ac.decodeAudioData(u8.buffer, ok, () => {}); if (p && p.catch) p.catch(() => {}); } catch (e) { /* undecodable: stays silent */ }
    }
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
    // rpm (playback rate of the recordings): idle 0.85, about 1.45 at full speed on full throttle; load picks the layer
    rpm += ((0.85 + 0.4 * sv + 0.2 * th) - rpm) * Math.min(1, dt * 2.5);
    ld += (cl(0.7 * th + 0.45 * sv, 0, 1) - ld) * Math.min(1, dt * 4);
    const eg = alive ? 0.55 + 0.25 * ld : 0, x0 = cl(ld * 2, 0, 1), x1 = cl(ld * 2 - 1, 0, 1);
    sp(eLG[0].gain, Math.cos(1.5708 * x0)); sp(eLG[1].gain, Math.sin(1.5708 * x0) * Math.cos(1.5708 * x1)); sp(eLG[2].gain, 0.8 * Math.sin(1.5708 * x1));
    for (let i = 0; i < 3; i++) sp(eL[i].playbackRate, rpm * (i === 2 ? 0.92 : 1));
    sp(eLPf.frequency, 1800 + 5000 * ld); sp(eGain.gain, eg, 0.15);
    const kv = alive ? Math.min(1, av / 2.5) * (veh.air ? 0.3 : 1) : 0;
    sp(trk[0].playbackRate, cl(0.45 + av / 9, 0.45, 1.9)); sp(kG.gain, 0.6 * kv * (0.7 + 0.3 * sv)); sp(kLP.frequency, 2500 + 5000 * veh.road);
    sp(cG.gain, 0.25 * kv * Math.min(1, av / 6) * (1 - 0.7 * veh.road)); sp(cLP.frequency, 300 + 250 * sv);
    let dy = veh.turYaw - tPrev; tPrev = veh.turYaw; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy)));
    const tr = dt > 0 ? Math.min(1, dy / dt / 0.75) : 0;
    sp(uG.gain, 0.1 * tr, 0.04); sp(uO1.frequency, 180 + 50 * tr); sp(uO2.frequency, 272 + 75 * tr);
    const mg = game.mgOn ? 0.55 : 0; sp(mG.gain, mg, mg ? 0.004 : 0.025);
    S.engine.rate = rpm; S.engine.gain = eg; S.mg = mg;
    // drone
    if (D.on) { loc(D.x, D.y, D.z); const f = 0.85 + 0.016 * Math.hypot(D.vx, D.vy, D.vz); sp(dS[0].playbackRate, f, 0.08); sp(dS[1].playbackRate, f * 1.027, 0.08);
      sp(dG.gain, 0.4 / (1 + LD / 25)); sp(dLP.frequency, Math.min(6000, lpf(LD))); sp(dPan.pan, LP); } else sp(dG.gain, 0, 0.03);
    // the three nearest live enemy engines (stable assignment, so a voice does not jump between vehicles)
    bd.fill(1e12); best.fill(-1);
    for (let i = 0; i < EN.length; i++) { const e = EN[i]; if (!e.on || e.dead) continue; const d2 = (e.x - cam.x) ** 2 + (e.z - cam.z) ** 2; if (d2 > 1.44e6) continue;
      for (let j = 0; j < 3; j++) if (d2 < bd[j]) { for (let m = 2; m > j; m--) { bd[m] = bd[m - 1]; best[m] = best[m - 1]; } bd[j] = d2; best[j] = i; break; } }
    for (let v = 0; v < 3; v++) if (eV[v] >= 0 && best.indexOf(eV[v]) < 0) eV[v] = -1;
    for (let j = 0; j < 3; j++) { const b = best[j]; if (b < 0 || eV.indexOf(b) >= 0) continue; const v = eV.indexOf(-1); if (v >= 0) eV[v] = b; }
    for (let v = 0; v < 3; v++) { const e = eV[v] >= 0 ? EN[eV[v]] : null;
      if (!e) { sp(eG[v].gain, 0, 0.2); continue; }
      loc(e.x, e.y + 1.5, e.z); const ev = Math.min(1, Math.abs(e.v) / 9);
      sp(eSrc[v].playbackRate, (e.type ? 1.12 : 0.9) * (0.8 + 0.4 * ev)); sp(eG[v].gain, (0.45 + 0.35 * ev) / (1 + LD / 40), 0.15); sp(eLP[v].frequency, Math.min(2500, lpf(LD))); sp(eP[v].pan, LP); }
  }
  return S;
}
