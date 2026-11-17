// Intro music: the first 60 s of "Norwegian Tank Battle" (owner-supplied, MP3 48 kbit/s stereo, fades out at 54-60 s).
// Plays on the start screen and through loading, fades out when the game starts. Browsers block audio until a gesture,
// so it tries at once and otherwise starts on the first click or key (picking a world counts). Skipped when the sound
// is switched off (stored choice or ?mute) and in scripted runs.
import MUS from './data/music.mp3';

export function initMusic(qs) {
  let off = qs.has('mute') || qs.has('nohint') || qs.has('auto') || qs.has('perf');
  try { if (localStorage.gsnd === '0') off = true; } catch (e) { /* ignore */ }
  const M = { a: null, stop() {} };
  if (off || typeof Audio === 'undefined') return M;
  let a, url, done = false;
  try {
    const bin = atob(MUS), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([u8], { type: 'audio/mpeg' }));
    a = M.a = new Audio(url); a.volume = 0.7; a.preload = 'auto';
  } catch (e) { return M; }
  const evs = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  const unhook = () => { for (const e of evs) removeEventListener(e, kick, true); };
  function kick() { if (done) return; const p = a.play(); if (p && p.then) p.then(unhook, () => {}); }
  for (const e of evs) addEventListener(e, kick, true);
  kick(); // allowed straight away where the browser permits autoplay
  // fade out over sec seconds (iOS ignores volume: there it just stops at the end)
  M.stop = (sec = 4) => {
    if (done) return; done = true; unhook();
    if (a.paused) { URL.revokeObjectURL(url); return; }
    const v0 = a.volume, t0 = performance.now();
    const id = setInterval(() => { const k = (performance.now() - t0) / (sec * 1000);
      if (k >= 1) { clearInterval(id); a.pause(); URL.revokeObjectURL(url); } else a.volume = v0 * (1 - k) * (1 - k); }, 50);
  };
  return M;
}
