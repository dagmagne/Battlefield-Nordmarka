# groomerweb

Real-time WebGPU winter scene: drive a snow groomer through a procedural, Nordmarka-like forest with three mountains, lakes, a creek, trails, lamps, a cabin and a dam. No engines (no Three.js/Babylon), no asset files: every mesh, texture and sound is procedural. The deliverable is a single self-contained `index.html`.

## Priorities (in order)
1. **Visual quality.** This is a desktop showcase.
2. **Smooth frame pacing.** The target is a steady 60 fps at native Retina on a MacBook Pro M2 Max in the latest Chrome.
3. **Small bundle.** Currently about 132 kB (about 50 kB gzip). Report the size after changes.

The Mac is the only target platform. Mobile is out of scope for now: don't test, verify or tune for phones or touch, and don't spend effort on mobile-specific changes. The existing touch and phone code (`?touch`, `phone.sh`) can stay, but it is not maintained.

## Hard rules
- WebGPU only, and everything procedural. No external texture, model or audio files.
- **No per-frame JS allocations** in the frame loop. Use preallocated typed arrays and no closures, arrays or objects per frame. Allocating on rare events (toasts, key presses) is fine.
- If WebGPU is unavailable, show a friendly message instead of a blank page.
- Never leave `index.html` broken. Rebuild after every meaningful change.
- Commit after each milestone or fix, with a short imperative message. Commit only when it works.

## Build and run
- Source lives in `src/` (`*.js`, `*.wgsl`, `shell.html`). `node build.mjs` bundles it with esbuild and a WGSL minifier into `index.html`, then prints the size. `node build.mjs --dev` skips minification.
- Serve with `npm run serve` (`python3 -m http.server 8080`) and open http://localhost:8080. The server is usually already running, so check with `lsof -iTCP:8080` before starting one.
- Don't edit `index.html` by hand. It is a build output.

## Architecture overview
- **`main.js`** is the orchestrator: quality tiers (low/medium/high/ultra, auto-selected plus a manual override in the menu), pipelines, the frame loop, cameras, vehicle physics (`simulate`), stamps, particles, dynamic resolution (DRS) and the perf harness.
- **Rendering:** forward HDR in `rgba16float` with 4× MSAA, reversed-Z infinite projection, a bloom chain, ACES tonemapping and dither. DRS renders into a sub-rect, so render targets are never reallocated.
- **`terrain.wgsl`:** geometry clipmap with 9 levels and CDLOD morphing. The heightmap is 2048² `r32float` at 2 m per texel (world 4096 m, playable area ±1000 m).
- **Grooming mask:** maskA is `rgba8` (groomed, track, imprint) and maskB is `rg16float` (lateral u, longitudinal phase). Both are stamped by instanced quads (`stamp.wgsl`), and the shader derives corduroy, classic tracks and berms from them.
- **Trees (`trees.js`, `tree.wgsl`, `treedeform.wgsl`):** about 207k instances on the high tier, 3 species and 4 LODs (37/180/850 m × `lodMul`), with a two-phase cross-fade. Snow load must look the same on every LOD (see "Lessons").
- **Shadows:** 3 cascades (the far ones update on alternate frames), PCSS on cascade 0, plus a baked heightfield shadow that is re-baked when the time of day changes.
- **`world.js`:** world generation (heightmap, lakes, bogs, creek, A*-routed trails, carving, snow kickers on the big lake, tree placement, props).
- **`tod.js`:** four time-of-day presets (keys 1–4), interpolated into the global uniforms.
- **Turbo mode (X):** arcade physics with momentum, slope gravity, drift, Shift boost and Space to hop. Jumps are ballistic, with touchdown shake and a powder burst, and stamps pause while airborne. Normal mode must keep its original slow groomer behaviour.

## Test hooks
- **URL parameters:** `nohint nohud drs=0 tod=1..4 q=<tier> perf debug auto turbo veh=x,z,yaw cam=x,y,z,yaw,pitch lod=<mul> sx=<snow extents>`.
- **`window` globals:** `__ready __step(dt,n) __pose __look __chase __tod __tp(x,z,yaw) __info __waitFrames`, plus `__R __W __cam __veh __inp __api __ui`. `__step` switches to manual, deterministic stepping, and `__R.force=[throttle,steer]` scripts the input.

## Verification workflow (always do this, don't just reason about the code)
All tools drive a **headed** Chrome with the GPU enabled through playwright-core, at 1728×1117 and DPR 2 (MacBook Retina).
- `tools/shot.mjs`: single screenshot. `tools/multi.mjs`: a batch of shots in one session.
- `tools/poses.mjs` with `tools/scenes.mjs`: the 6 fixed verification scenes. Render these after visual changes.
- `tools/drive.mjs outdir [--video]`: scripted drive with consecutive frames (shimmer check), sparse frames and an optional mp4.
- `tools/turbo.mjs outdir [--video]`: boosts over the lake kickers and logs airtime and height.
- `tools/perf.mjs`: a 60 s drive that prints frame-time and GPU-timestamp stats (avg/p50/p99/max, hitches). The in-app overlay is the backquote key or `?debug`.
- `tools/lodcmp.sh`: forces each tree LOD on the same view and prints the mean colour per LOD, to catch LOD pops.
- Screenshots go in `shots/<topic>/`. Look at them yourself with Read before you claim something looks right.

### Visual critic gate
For larger visual milestones, run a **critic subagent that sees only the renders** (no code, no intent). Have it grade issues as MAJOR/MODERATE/MINOR, then fix and re-render until nothing above MINOR remains. The original gate passed in round 6 (history: 5 MAJOR → 8 MODERATE → 4 → 3 → 1 → MINOR only). The final review is in `critic-final.md`.

### Performance discipline
- Measure GPU time with timestamp queries, not just frame time. Compare before and after with an **A/B under identical conditions** (stash, build, measure, pop).
- Other apps on the machine (browser, IDE, WindowServer) skew absolute numbers a lot. Report the load you saw, and don't treat a loaded-machine number as the baseline. The idle baseline on high/native was frame avg 14.2 ms / p99 18.3 ms and GPU avg 12.9 ms / p99 15.4 ms.

## How the work was done (process to keep following)
1. **The first prompt was a full spec**: the world, groomer, grooming mask, controls, quality tiers and DRS, the verification plan and a "done when the critic gate passes" criterion. Write a working `index.html` early, then iterate in milestones (terrain, then trees, then groomer and mask, then lighting and post, then UI and perf). Overwrite `index.html` and commit after each one.
2. **Every visual change is verified with renders**: the fixed poses, drive frames and video where motion matters. Analyse problems quantitatively when possible (mean colour per LOD, frame-time stats) instead of eyeballing.
3. **Follow-up requests from the user are in Norwegian, and you answer in Norwegian.** The pattern is: analyse the root cause with measurements, explain what was wrong, fix it, verify with renders and perf, commit, and report briefly with honest caveats (what wasn't verified, and measurement noise).
4. **Examples of follow-ups:**
   - The tree LOD "pop" (heavy snow at a distance, little up close) was fixed with consistent snow extent on all LODs, shading for the far LODs, and a two-phase cross-fade.
   - Turbo mode (driving fast, drifting and jumping) added kickers on the lake and ballistic physics.
5. When a usage limit interrupts the work, resume where it stopped without redoing finished work.

## Lessons / gotchas
- WebGPU doesn't allow `alphaToCoverageEnabled` together with a `sample_mask` fragment output. Use alpha cross-fades with alpha-to-coverage instead.
- Blanket renames in WGSL can corrupt identifiers (for example `duv.x` became `dux`). Grep after any mechanical edit.
- Tree LODs have to match in mean colour and snow distribution. Simple cones with full snow cover read as white blobs and pop when they switch. Check with `tools/lodcmp.sh`.
- Wide LOD fade bands and extra skirt geometry cost about 35% GPU time. Keep the band at about 7%.
- Lake material (`mat` R) also blocks tree placement (`> 8`), so terrain edits on lakes have to keep R ≥ 9.
- The mp4 height has to be even for ffmpeg (`-vf scale=1728:1116`).
