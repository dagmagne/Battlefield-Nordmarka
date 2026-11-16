# Plan B: solid, destructible buildings

You are changing how buildings behave in **Battlefield Nordmarka**, a WebGPU tank game in a single `index.html`. Read `CLAUDE.md` first: it describes the architecture, the hard rules and the test tools. This plan is self-contained apart from that.

## Goal

The user's request, translated: "Make houses and structures solid (so you cannot drive through them) and so that they can be shot to pieces."

1. **Solid.** The player's tank, enemy vehicles and the drone cannot pass through houses and landmark structures.
2. **Destructible.** Shells and drone charges damage buildings; a building that takes enough damage collapses into rubble, visibly and permanently (until restart).

## Hard constraints

- **No per-frame JS allocations** in the frame loop. Rare events (a building collapsing) may allocate.
- Visual quality is priority 1, frame pacing priority 2, bundle size priority 3. Report the size `node build.mjs` prints.
- WebGPU only, everything procedural, no external files. Do not edit `index.html` by hand.
- Another agent is adding sound in parallel (Plan A). Stay out of `src/audio.js`, the settings menu and `src/ui.js`. For sound, only call the existing hook: `C.sfx('collapse', x, y, z, size)` when a building collapses and `C.sfx('crash', x, y, z, speed)` when the tank hits a wall at speed. The hook is a no-op until Plan A lands.

## What exists today

- **Data.** `W.buildings` (real world only, about 3800 entries) from `src/world.js`: `{ x, z, y, w, d, yaw, kind, lv }` with `w` the length along the building's local x axis, `d` the depth, `y` the levelled pad height, `kind` 1–3 and `lv` storeys (may be 0).
- **Mesh.** `src/props.js` → `buildProps(W)` puts every static structure into **one** mesh through the `MB` builder in `src/mesh.js` (14 floats per vertex: position 3, normal 3, colour 3, material 1, uv 2, part 1, pad 1; 56 bytes). `house(b, B, i, W)` calls `b.at(B.x, B.y, B.z, -B.yaw)` and emits a wall box from 5 m below the pad up to `wall`, a gable or flat roof, and window quads (`MAT.window`, emissive at night). `lodge`, `chapel`, `tvTower`, `skiJump` and `portal` build the landmarks. `main.js` uploads the mesh once with `mkObj(buildProps(W))` (`props.vb`, `props.ib`) and draws it in the main pass and in the shadow passes.
- **Colliders.** `W.colliders` is a flat `Float32Array` of circles `(x, z, r)`. A house gets `round(w / d)` circles along its length with radius `max(0.5, d/2 * 0.95 - 0.9)`, which is smaller than the house: corners and the ends of long houses can be driven through. `collide()` in `main.js` loops over **all** colliders every frame and pushes the tank out of any circle (`LEO.rad` is the tank's radius, 2.6 m). Enemy vehicles ignore colliders entirely. The drone and shells use `collAt(x, z)` in `main.js`, a 32 m grid over the same circles, with a fixed height of 8–9 m above ground (`C.collAt` in `src/combat.js`, in `updateShells` and `updateDrone`).
- **Impacts.** In `updateShells`, a shell that enters a collider calls `impact(type, owner, x, y, z, null, 0, 0)`, which only makes the explosion. Shell types: 0 APFSDS, 1 HEAT-MP, 2 HE, 3 coax MG, 4 enemy 125 mm, 5 enemy 30 mm, 6 smoke grenade. `splash(x, y, z, r, dT, dB, owner)` handles area damage to vehicles. `droneBoom` detonates the drone.
- **Effects you can reuse** (all in `src/combat.js`): `explode(x, y, z, s)`, `parts.emit(...)` (particle kinds: 0 chunk with gravity, 1 smoke, 4 fire that cools to smoke), `blast(x, z, r, k)` for a scorch mark in the snow.
- **Line of sight.** `losBlocked` in `src/combat.js` tests terrain, forest canopy and smoke. Buildings do not block it today.
- **Restart.** `G.restart` in `src/combat.js` resets the game without reloading the page.

## Design

### 1. Building records

In `buildProps`, record for every house (and for the lodge and the chapel) a record: index, centre `x, z`, pad `y`, `yaw`, half-extents `hw, hd`, total height (wall plus roof rise), vertex range `[v0, v1)` in the props mesh (take `b.v.length / 14` before and after the builder call), `hp`, `hpMax`, `state` (0 intact, 1 damaged, 2 rubble). Store them as typed arrays or one array of objects created once at load (allocation at load is fine). Expose them on `W` (for example `W.bld`).

Keep the CPU copy of the props vertex array alive after upload (`mkObj` currently drops nothing, but make the retention explicit) and keep a pristine copy of each building's range for restart. The whole array is on the order of 10–15 MB; a second full copy is acceptable, but copying only the building ranges lazily when first damaged is better.

### 2. Solid: oriented boxes on a grid

- Replace the house circles with oriented boxes. Build a spatial grid for buildings (the 32 m grid idea in `main.js` works; a building goes into every cell its box touches).
- **Player:** in `collide()`, test the tank against the boxes in the cells around it. Treat the tank as two circles (front and rear, about 1.9 m radius, 1.8 m ahead of and behind the centre along the hull) or one circle of `LEO.rad`; push out along the smallest penetration, damp `veh.v`, and add `veh.shake` and `C.sfx('crash', ...)` when it hits at speed. The tank must not tunnel at top speed (19 m/s, 0.32 m per frame at 60 fps: fine) and must slide along a wall rather than stick.
- Stop iterating all of `W.colliders` every frame for the player if you can: put the remaining circle colliders (lamps, pylons, boulders, landmarks) on the same grid.
- **Enemies:** apply the same push to enemy vehicles in `updateEnemy` (they are at `e.x, e.z`). They normally follow trails, which do not cross buildings, but they leave the trail when close to the player.
- **Shells and drone:** test against the box with the building's real height instead of the circle and the fixed 8–9 m. A shell flying over a low hut must pass; one hitting a three-storey wall must stop there. Return which building was hit.
- **Landmarks:** the lodge and the chapel become boxes like houses. The TV tower, the ski-jump towers and supports and the tunnel headwalls stay as solid circle colliders; check that their radii actually cover the structure and fix them if not.
- **Rubble** is not solid for the tank, but slows it (a speed cap of roughly half while inside the footprint is enough).

### 3. Destructible

- **Damage on a direct hit:** HE 70, HEAT-MP 45, APFSDS 20, enemy 125 mm 35, enemy 30 mm 3, MG 0, drone charge 100. Area damage from HE within its blast radius: up to 30 at the wall, falling to 0 at the edge. `hpMax` = 60 + 0.5 × footprint area in m², clamped to 60–400, so a shed falls to one HE round and a large block needs several.
- **States.** Below 50 % hp the building is *damaged*; at 0 it is *rubble*.
- **Rendering a state change:** edit that building's vertex range in the CPU copy and upload just that range with `device.queue.writeBuffer(props.vb, v0 * 56, data, v0 * 14, (v1 - v0) * 14)`. Combat code does not have the device: add a callback in the `C` object from `main.js` (for example `C.bldUpload(v0, v1)`), the way `C.collAt` is passed.
  - *Damaged:* darken and soot the colours, sag the roof ridge and one corner by a metre or so, turn about half the window quads dark (change their material away from `MAT.window`).
  - *Rubble:* work in the building's local frame (undo the `b.at` transform using the record). Squash heights to a noisy heap, about 12–30 % of the original height varying across the footprint with a hash of the local position; push vertices outwards by 0–1.5 m; tilt normals towards up with noise; set colours to charred timber, grey masonry and soot; change every material to a non-emissive, non-snow one (`MAT.paint`, `MAT.stone` or `MAT.rock`: read `src/object.wgsl` for how each shades, and note `MAT.snow` and `MAT.window` must go). The part of the wall box that extends 5 m below the pad should stay below ground.
  The shadow passes draw the same buffer, so the shadow follows automatically.
- **Collapse effects:** a large dust cloud (grey-brown smoke particles spreading outwards along the ground), dark debris chunks, a few seconds of fire for HE and drone hits, a scorch mark with `blast`, camera shake by distance, `C.sfx('collapse', x, y, z, size)`. A toast is not needed.
- **Line of sight:** make intact and damaged buildings block `losBlocked` (sample the segment against the building grid, using the real height). Rubble does not block.
- **Restart:** `G.restart` restores every changed building: pristine vertices re-uploaded, hp and state reset, colliders back.
- **Fantasy world:** it has no `W.buildings`. Its cabin, bridge and dam keep their current colliders and are not destructible. Make sure nothing breaks when `W.buildings` is missing or empty.
- **Thermal sight:** `src/object.wgsl` has a branch for it (`G.groom.w > 0.5`). Rubble can simply read as cold; do not spend time here beyond checking it does not look broken.

## Verification

1. Set up: `npm install`, `node build.mjs`, then serve **this checkout on its own port**: `python3 -m http.server 8092 &`. The screenshot tool takes `--port 8092`: `node tools/cshot.mjs out.png "w=holmenkollen&nohint&q=medium&drs=0&peace" --port 8092 --eval "..."`. It drives headless Chromium with software WebGPU; a rendered frame takes several seconds, so use `__sim(dt, n)` (logic only) for behaviour and render only for pictures. `--eval` splits its argument on `||` to take one screenshot per snippet, so do not use `||` inside the JavaScript.
2. Useful hooks: `__tp(x, z, yaw)` teleports the tank, `__R.force=[throttle, steer]` drives it, `__aimAt(x, y, z)` aims the gun at a world point, `__ui.poll=()=>{}` then `__inp.fire=true` fires, `__game.ammo(2)` selects HE (it restarts the 6 s reload), `__look(ex, eh, ez, tx, th, tz)` places a test camera, `__game.spawn(type)` adds an enemy, `__W.buildings` lists the houses. Add your own (for example `__W.bld`, a function to damage a building directly).
3. Check, with numbers printed from `--eval`:
   - driving straight at the long side, the short end and a corner of several houses (small, large, rotated) never puts the tank's centre inside the box, at 5 and at 19 m/s
   - the tank slides along a wall when it hits at a shallow angle
   - a shell aimed at a wall stops at the wall and damages that building; a shell aimed over a low building passes
   - damage totals follow the table; a building goes intact → damaged → rubble
   - an enemy vehicle steered at a house does not pass through it
   - the drone detonates on a wall and damages the building
   - `losBlocked` is true through an intact house and false through its rubble
   - restart restores everything
   - `collide()` cost: time 10 000 calls in the page before and after and report both
4. Render and **look at** before / damaged / rubble pictures of at least a small house, a large flat-roofed block and the lodge, by day and at night (`tod=4`), from about 25 m. Rubble must read as a collapsed building, not as a flattened texture: adjust until it does. Also render one shot in the thermal sight (`therm=1`).
5. Load `?w=fantasi` and confirm it still starts and the cabin is still solid.
6. Run `tools/battle.sh` once to confirm the existing fight still works.

## Deliverables

- The code, the new test hooks, and updates to `CLAUDE.md`: the `props.js` and `combat.js` bullets, a short "Buildings" bullet (records, boxes, states, how a range is re-uploaded), anything you learned under "Lessons / gotchas", and the new bundle size.
- Commits on your branch with short imperative messages, each ending with the two attribution lines used by the existing commits in `git log` (the `Co-Authored-By` line and the `Claude-Session` line; copy them from the latest commit). Do not push and do not touch `main`.
- A final report: what you built, the numbers you measured, the paths of the renders you looked at, what you could not verify, and the bundle size before and after.
