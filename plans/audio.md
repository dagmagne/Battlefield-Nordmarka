# Plan A: sound (engine, guns, explosions)

You are adding sound to **Battlefield Nordmarka**, a WebGPU tank game in a single `index.html`. Read `CLAUDE.md` first: it describes the architecture, the hard rules and the test tools. This plan is self-contained apart from that.

## Goal

The game is silent today. Add procedural sound for the engine and tracks, the main gun, the coaxial machine gun, enemy fire, explosions, hits on the player, reloading, smoke grenades and the drone. The user's request, translated: "Add engine sounds and the sound of shots and cannons and so on."

## Hard constraints

- **No audio files.** Everything is synthesised with the Web Audio API. Nothing external is loaded.
- **No per-frame JS allocations** in the frame loop (project rule). Per frame you may only set `AudioParam` values and read state. Creating nodes on a rare event (a cannon shot, an explosion) is allowed. The machine gun fires 18 rounds per second and is *not* a rare event: run it as one looping source that is switched on and off.
- Browsers block audio until a user gesture. Create or resume the `AudioContext` on the first `pointerdown` or `keydown`. The game must run unchanged if audio never starts or `AudioContext` is missing.
- Keep the bundle small: aim for at most about 6 kB added to `index.html`. Report the size `node build.mjs` prints.
- UI text is English. Do not edit `index.html` by hand; it is a build output.
- Another agent is working in parallel on destructible buildings (Plan B). Stay out of `src/props.js` and the collision code, and keep your edits in `src/combat.js` to one-line `C.sfx(...)` calls so the two branches merge cleanly.

## What already exists

- `src/main.js` passes a hook into combat: `const sfx = (name, x, y, z, k) => { if (R.sfx) R.sfx(name, x, y, z, k); };`, available in `src/combat.js` as `C.sfx`. Nothing calls it yet and nothing installs `R.sfx`. You install `R.sfx` and add the calls. `name` is a short string, `x, y, z` a world position in metres, `k` a strength (your choice of scale per event).
- The listener is the camera: `cam.x, cam.y, cam.z` in `main.js`. The camera's forward direction is in the `view` matrix (`-view[2], -view[6], -view[10]`), its right vector is `view[0], view[4], view[8]`.
- Player vehicle state `veh`: `v` (m/s, signed), `throttle` (-1..1), `yawRate`, `air`, `dead`, `immob`, `road` (0..1, plowed road under the tracks), `turYaw`. Turret slew happens in `updateAim` in `main.js`.
- Combat events in `src/combat.js` (function names are stable, line numbers are not):
  - player main gun fires: inside `G.update`, the block that calls `fire(0, G.sel, ...)` and `muzzle(...)`
  - reload finished: `if (G.rl > 0 && !veh.dead) { G.rl -= dt; if (G.rl <= 0) { G.rl = 0; } }`
  - coax MG: the `while (mgT >= 1 && G.mg > 0)` loop; it runs while `inp.mg` is held
  - enemy fires: end of `updateEnemy`, the `if (e.fire)` block (`e.type` 0 = T-72 125 mm, 1 = BMP-2 30 mm burst)
  - explosions: `explode(x, y, z, s)` with `s` from about 0.4 (30 mm) to 3.2 (HE); every impact, kill and drone detonation goes through it
  - player hit: `hurtPlayer(d, fc, low)`; vehicle destroyed: `kill(e)`
  - smoke grenades: `G.smoke`; a cloud bursting: `smokeBurst`
  - drone: `G.drone` (`D.on`, `D.x/y/z`, `D.vx/vy/vz`), launched in `G.droneKey`, ends in `droneEnd` / `droneBoom`
  - enemies: `G.enemies[i]` with `on`, `dead`, `x, y, z`, `v`
- Input and menu: `src/ui.js` (`initUI`, keyboard handler, `seg(...)` rows, `syncMenu`), markup and CSS in `src/shell.html` (settings rows use ids `mQ`, `mD`, `mN`, `mF`, `mR`, `mB`). The `api` object in `main.js` holds the actions the UI calls, and `api.state()` feeds `syncMenu`.

## Design

Create `src/audio.js` exporting `initAudio(ctx)` where `ctx` carries what you need (`R`, `cam`, `veh`, `view`, a getter for the game object). It returns an object with `update(dt)` (called once per frame from `tickFrame` in `main.js`, before the `if (R.simOnly) return;` line so logic-only test steps exercise it), `setOn(bool)` and a small stats object for tests.

1. **Buffers rendered once at start-up.** Fill `AudioBuffer`s with plain JS loops (filtered noise, decaying sines, simple waveshaping): cannon report, a distant-cannon variant, explosion, MG loop (a few rounds, seamless), reload clunk, armour hit clang, smoke-grenade pop, collapse rumble (Plan B will call `C.sfx('collapse', x, y, z, size)` and `C.sfx('crash', x, y, z, speed)`; give both a sound). Keep them short and mono. Check each for non-finite samples and a peak at or below 1.
2. **Continuous voices, created once:** engine (two or three layers whose gain and playback rate follow `|veh.v|` and `veh.throttle`; idle when stopped; silent when `veh.dead`), track clatter (gain by speed, a little brighter on `veh.road`), turret traverse whine (gain by how fast `veh.turYaw` changes), MG loop (gain gated by an `mgOn` flag), drone buzz (on while `D.on`, pitch by drone speed, positioned at the drone), and up to three positional enemy-engine voices assigned each frame to the nearest live enemies.
3. **One-shots** through a small voice path: buffer source → lowpass → gain → stereo panner → master. Per event compute distance `d` from the camera, then:
   - gain falls with distance (roughly `1 / (1 + d / 40)`, tune by ear-free reasoning: a cannon at 800 m must still be clearly audible, a 30 mm at 800 m faint)
   - lowpass cutoff drops with distance (distant thunder, close crack)
   - start time is delayed by `d / 340` seconds, capped at 3 s, so far shots are heard after the flash
   - pan from the direction relative to the camera's right vector
   Cap simultaneous one-shots (for example 12) and drop the quietest request when full.
4. **In the gunner sight and the drone view** the listener is still the camera. In the drone view the tank's engine should therefore fade with distance like any other source.
5. **Master and mute.** Master gain about 0.6 with a compressor node before the destination so stacked explosions do not clip. Add a settings row "Sound" (Off / On) and the `M` key; persist as `localStorage.gsnd`; default on. Add `?mute` to start silent. Mention `M` in the help text and the keys bar in `src/shell.html`.

## Hook points to add in `src/combat.js`

One line each, all via `C.sfx`:

| Event | Call |
|---|---|
| player main gun | `C.sfx('gun', aim.mx, aim.my, aim.mz, 1)` |
| reload finished | `C.sfx('reload', veh.x, veh.y + 2, veh.z, 1)` |
| enemy fires | `C.sfx(e.type ? 'auto' : 'egun', mx, my, mz, 1)` |
| explosion | `C.sfx('boom', x, y, z, s)` at the top of `explode` |
| player hit | `C.sfx('hit', veh.x, veh.y + 1.5, veh.z, d)` in `hurtPlayer` |
| smoke launch / burst | `C.sfx('smoke', ...)` |
| MG | set a flag the audio module reads, for example `G.mgOn = true` while the loop fires, cleared otherwise |

The drone and the engines are read directly from state in `audio.update`; they need no events.

## Verification

Nobody can listen to your output, so verify what can be measured.

1. Set up: `npm install`, `node build.mjs`, then serve **this checkout on its own port**: `python3 -m http.server 8091 &`. The screenshot tool takes `--port 8091`. It drives headless Chromium with software WebGPU; rendering a frame takes seconds, so use `__sim` (logic only) for behaviour and render only when you need a picture.
2. Expose `window.__audio` with at least: `state` (the `AudioContext` state), `count` (events played per name), `live` (current one-shot voices), `engine` (current engine rate and gain), `mg` (MG loop gain).
3. With `tools/cshot.mjs` and `--eval`, script and assert (print values, check them yourself):
   - audio starts after a synthetic `pointerdown` / key event, or via a test call such as `__audio.start()`
   - driving (`__R.force=[1,0]; __sim(1/60, 240)`) raises engine rate and gain above idle
   - firing (`__ui.poll=()=>{}; __inp.fire=true; __sim(1/60,2)`) increments `count.gun`, and 6 s later `count.reload`
   - holding `__inp.mg=true` turns the MG loop on, releasing turns it off
   - `__game.spawn(0)` plus a scripted kill produces `boom` events; an enemy firing produces `egun`
   - mute (`M` / menu / `?mute`) silences the master gain and survives a reload through `localStorage`
   - 20 seconds of fighting does not grow the number of live nodes without bound
   Note that `--eval` splits its argument on `||` to take several screenshots, so do not use `||` inside the JavaScript.
4. Write a small script (for example `tools/audio-check.mjs`, run with Node and no browser if you factor the synthesis into pure functions, or in the page otherwise) that prints peak, RMS and length per buffer and fails on NaN or clipping.
5. Confirm the game still starts and plays with `AudioContext` deleted (`delete window.AudioContext` before load, or a guard test) and with `?mute`.

## Deliverables

- `src/audio.js`, the hook calls, the menu row and key, `window.__audio`, the check script.
- `CLAUDE.md`: a short "Sound" bullet in the architecture overview, `M` in the controls line, `mute` in the URL parameters, `__audio` in the test hooks, and the new bundle size.
- Commits on your branch with short imperative messages, each ending with the two attribution lines used by the existing commits in `git log` (the `Co-Authored-By` line and the `Claude-Session` line; copy them from the latest commit). Do not push and do not touch `main`.
- A final report: what you built, what you measured (with the numbers), what you could not verify (in particular that nobody has heard it), and the bundle size before and after.
