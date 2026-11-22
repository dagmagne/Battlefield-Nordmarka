// Language check (no GPU, no browser): every mission text has a Norwegian translation, the static toast literals in src/ are translated,
// and a set of sample messages with numbers, names and directions go through the patterns. Prints what stays English and fails on any.
// usage: node tools/langcheck.mjs [-v]
import { readFileSync, readdirSync } from 'node:fs';
import { tr, setLang } from '../src/lang.js';
import { MISSIONS } from '../src/missions.js';
const v = process.argv.includes('-v'); let bad = 0;
setLang('en'); if (tr('Smoke!') !== 'Smoke!') { console.log('FAIL  English must pass through unchanged'); bad++; }
setLang('no');
const same = (s) => { const t = tr(s); if (t === s) { console.log('  untranslated: ' + JSON.stringify(s.slice(0, 110))); bad++; } else if (v) console.log('  ' + s.slice(0, 60) + '  ->  ' + t.slice(0, 80)); };
console.log('missions'); for (const m of MISSIONS) { same(m.name); same(m.card); same(m.brief); for (const s of m.stages) { same(s.t); if (s.limitText) same(s.limitText); } }
// plain string literals handed to the message calls (template strings and concatenations are covered by the samples below)
console.log('static messages'); const seen = new Set(), KEEP = new Set(['']);
for (const f of readdirSync(new URL('../src/', import.meta.url))) { if (!f.endsWith('.js') || f === 'lang.js') continue; const src = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/(?:ui\.toast|m\.say|droneEnd|netOff|finish\(false,)\s*\(?\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) { const s = m[1].replace(/\\'/g, "'"); if (!seen.has(s) && !KEEP.has(s)) { seen.add(s); same(s); } } }
console.log('patterns'); for (const s of [
  'Wave 3 — Pincer: 4 from the north-west, ~600 m · 2 from the east, ~850 m · Mines reported on the roads to the south-east', 'Contact! 2 from the north, ~700 m', 'Wave 2 cleared — resupplied', 'T-72B3 destroyed', 'assault buggy destroyed', 'FPV drone shot down',
  'Out of HE', 'Loading HEAT-MP', 'ATGM launch from the north-east! Smoke or cover breaks its guidance', 'RPG fire from the west! Infantry in the house — HE', 'BMP dismounting infantry to the south', 'Lancet from the east diving on you — shoot it (Q) or move!', 'FPV drone inbound from the south-west!',
  'Lancet lost you in the smoke', 'Hit by an FPV drone!', 'Hit by a Lancet!', 'Drone: 3 mines spotted — marked', 'Drone: 1 mine spotted — marked', 'Rigging the camouflage net — 8 s. Driving or firing throws it off',
  'Recon drone keeps watch on its own for 312 s — launch another drone with X; with RECON picked, X takes it back', 'No BOMB drones left — Z picks another type', 'Drone: FPV (5 left) — one-way shaped charge', 'Fire mission: 6 rounds, 25 s — 230 m north-east · DANGER CLOSE — move away!',
  'Fire mission: 6 rounds, 27 s — 1.2 km south', 'No fire mission available — next one in 42 s', 'A vehicle got through to Voksenkollen (1 of 2 allowed)', 'Trees: medium', 'Thermal sight: white-hot (gunner sight and drone)', 'Free-fly camera — click to look',
  'FPV away — R2 detonates · left stick height/turn · right stick fly · L1/L2 tilt the camera · hold ✕: back to the tank', 'Recon drone climbing — enemies in its camera go on the map · X: back to the tank (it keeps flying) · land on the tank to recover it', 'Recon drone: unarmed — spotted enemies go on the map · B calls artillery where the camera looks',
  'HULL 87', 'TRACK 4 s', 'SMOKE 2', 'NET 5 s', 'NET', 'WAVE 2/6 · 3 KILLS · 300', 'STAND BY · 0 KILLS · 0', 'FREE ROAM', 'RETAKE THE TOWER 2/3 · 5 KILLS · 390', 'BOMB ×3 · 95 s', 'FPV · 120 s · RECON↑ 355 s', 'RECON 1',
  'Destroy the garrison at Tryvann · 5 left · 1.1 km NW', 'Stop the column before Voksenkollen · 8 left · 0/2 through · 550 m W', 'Hold the tower against the counter-attack · 3 left · enemy control 40%', 'Break through to the Holmenkollen arena · 12:30 · 2.6 km S',
  'HOLD ✕ · LAUNCH FPV', 'HOLD ○ · FIRE MISSION', 'HOLD □ · CAMOUFLAGE NET', 'HOLD ✕ · TAKE BACK RECON', 'Mission complete — Retake the tower', 'Mission failed — Hold the arena', 'Next mission: Column on Holmenkollveien',
  '7:42 · 12 vehicles destroyed · hull 65 · best 6:10', 'The enemy took the objective.\n3:50 · 5 vehicles destroyed · hull 40', 'Wave 4 · 9 vehicles destroyed · score 1250', 'All 6 waves beaten · 31 vehicles destroyed · score 4200. Press R to start over, or close this and keep fighting.',
  'Night breakthrough · 9:12 · 4 vehicles destroyed', 'MAP  ·  Tab or tap to close']) { const t = tr(s); if (t === s) { console.log('  unchanged: ' + s); bad++; } else if (/\b(the|from|left|destroyed|with|your|vehicles|breakthrough|wave)\b/i.test(t)) { console.log('  English left in: ' + t); bad++; } else if (v) console.log('  ' + t); }
console.log(bad ? `${bad} problems` : 'all translated'); process.exit(bad ? 1 : 0);
