// Renders every procedural sound buffer in Node (no browser) and prints length, peak and RMS; fails on NaN/inf or clipping.
// usage: node tools/audio-check.mjs [sampleRate]
import { synth } from '../src/audio.js';
const sr = +(process.argv[2] || 48000), t0 = performance.now(), B = synth(sr), ms = performance.now() - t0;
let bad = 0, total = 0;
for (const k in B) {
  const a = B[k]; let p = 0, s = 0, nf = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (!Number.isFinite(v)) { nf++; continue; } p = Math.max(p, Math.abs(v)); s += v * v; }
  const rms = Math.sqrt(s / a.length), seam = Math.abs(a[0] - a[a.length - 1]); total += a.length;
  const ok = nf === 0 && p <= 1 && p > 0.01; if (!ok) bad++;
  console.log(`${k.padEnd(5)} ${(a.length / sr).toFixed(3)} s  peak ${p.toFixed(3)}  rms ${rms.toFixed(3)} (${(20 * Math.log10(rms)).toFixed(1)} dBFS)  seam ${seam.toFixed(3)}  ${nf ? nf + ' non-finite ' : ''}${ok ? 'ok' : 'FAIL'}`);
}
console.log(`${Object.keys(B).length} buffers, ${(total / sr).toFixed(2)} s, ${(total * 4 / 1024).toFixed(0)} kB as float32, synthesised in ${ms.toFixed(0)} ms at ${sr} Hz`);
process.exit(bad ? 1 : 0);
