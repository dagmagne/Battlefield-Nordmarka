// Music: the whole of "Norwegian Tank Battle" (owner-supplied, 200 s, MP3 48 kbit/s stereo), looped. Plays from the start
// screen through loading and into the game, where it drops to a lower level under the game sounds. Browsers block audio
// until a gesture, so it tries at once and otherwise starts on the first click or key (picking a world counts).
// The music button (start screen, in-game top bar), the menu row and U toggle it (localStorage.gmus); the sound switch
// (M / menu) silences it too. Not started on its own in scripted runs (nohint auto perf).
import MUS from './data/music.mp3';

export function initMusic(qs) {
  const st = (k) => { try { return localStorage[k]; } catch (e) { return undefined; } };
  const M = { on: st('gmus') !== '0', snd: !(qs.has('mute') || st('gsnd') === '0'), a: null, toggle, set, sound, game, onchange: null };
  const auto = !(qs.has('nohint') || qs.has('auto') || qs.has('perf'));
  let a = null, vol = 0.6, fadeId = 0, armed = false;
  const evs = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  function el() { // built on first need: the base64 decode of 1.6 MB takes a few ms
    if (a || typeof Audio === 'undefined') return a;
    try {
      const bin = atob(MUS), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      a = M.a = new Audio(URL.createObjectURL(new Blob([u8], { type: 'audio/mpeg' }))); a.loop = true; a.preload = 'auto'; a.volume = vol;
    } catch (e) { a = null; }
    return a;
  }
  const want = () => M.on && M.snd;
  function arm(v) { if (v === armed || typeof addEventListener === 'undefined') return; armed = v; for (const e of evs) (v ? addEventListener : removeEventListener)(e, kick, true); }
  function kick(e) { if (e && e.target && e.target.closest && e.target.closest('.mbtn')) return;
    if (!want() || !el()) { arm(false); return; } if (!a.paused) { arm(false); return; } const p = a.play(); if (p && p.then) p.then(() => arm(false), () => {}); }
  function apply() { if (want()) { arm(true); kick(); } else { arm(false); if (a && !a.paused) a.pause(); } if (M.onchange) M.onchange(M.on); }
  // volume glide (iOS ignores volume: there the music simply plays at full level)
  function fadeTo(v, sec) { vol = v; if (!a) return; clearInterval(fadeId); const v0 = a.volume, t0 = performance.now();
    fadeId = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / (sec * 1000)); a.volume = v0 + (v - v0) * k; if (k >= 1) clearInterval(fadeId); }, 50); }
  function set(v) { M.on = !!v; try { localStorage.gmus = M.on ? '1' : '0'; } catch (e) { /* ignore */ } apply(); }
  // on but not heard yet (blocked autoplay, or never started): a press means "play", not "off"
  function toggle() { if (M.on && M.snd && (!a || a.paused)) set(true); else set(!M.on); return M.on; }
  function sound(v) { M.snd = !!v; apply(); }
  function game() { fadeTo(0.3, 4); } // the game has started: sit under the engine and the guns
  if (auto) apply();
  return M;
}
