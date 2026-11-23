# Architecture plan: easier to develop, still one URL

Goal: remove the development bottlenecks without changing what a player does: open one URL on any device and play. Nothing here may add an install step, a login or a server component.

Owner's decisions (2026-11-23):
1. "One self-contained `index.html`" is replaced by "one URL". Data may be separate files on the same site; a single-file build stays available as an option.
2. Imported, freely licensed models are allowed for new units.

## Step 1: safety net (no change for the player)
- [x] GitHub Pages builds from source; `index.html` is no longer in git.
- [x] `npm run check` (commentlint, langcheck, leocheck, soldiercheck, audio-check, bridgecheck) in CI on every push; bundle size in the job summary.
- [ ] Type checking without a new build step: `// @ts-check` + JSDoc, `tsc --noEmit` in CI, one file at a time (needs `typescript` as a dev dependency).
- [ ] Split `CLAUDE.md` (123 kB) into a short core (rules, build, workflow) and `docs/<system>.md` read on demand.

## Step 2: one URL, not one file (faster start)
About 0.5 MB of the 4.4 MB bundle is code and shaders; the rest is map data, music, title image and sound as base64.
- [x] `node build.mjs --split` writes `dist/`: `index.html` (682 kB, 301 kB gzip) plus `world.bin`, `music.mp3`, `title.webp` as hashed files fetched at run time (the 84 kB of sound loops stay embedded). The plain `node build.mjs` is still today's self-contained file.
- [x] The map blob is fetched while the start screen is up (not with `?w=fantasi`); the music streams.
- [x] Service worker: everything cached after the first visit, starts offline (`tools/splittest.mjs`).
- [x] Pages serves the single file at the root as before and the split build under `/next/`.
- [x] Owner tried `/next/` on an iPhone: starts, music plays, starts from the home screen in flight mode.
- [ ] Try it on iPad, Mac Safari, Android and desktop; then make it the root (owner's call).
- [ ] World generation in a Web Worker (the start screen stays responsive; groundwork for streamed map tiles and a larger world).

## Step 3: untangle the code (no change for the player)
- [ ] A system registry (ordered list with `update` / `restart`) instead of `support.js` and `missions.js` wrapping `G.update` / `G.restart`.
- [ ] Split `combat.js` along its seams: shells, enemy AI, waves, drones, mines, map / HUD.
- [ ] Named offsets for the typed-array records, generated from one schema.
- [ ] Game logic runnable in Node (stub world, seeded random): ballistics, detection and AI tested in seconds in CI. The GPU tools stay for visuals.

## Step 4: content and map
- [ ] Imported models: glTF converted at build time to the engine's vertex format; no run-time loader. Start by merging the FPV pilot (`claude/fpv-model`, `docs/imported-models.md`).
- [ ] Map pipeline: stable building ids (from the OSM id, not the order), raw inputs archived, so `prep.py` can be re-run. Needed before the world grows.
- [ ] Weak devices: a short GPU measurement at start picks the tier instead of the adapter name; a lighter tier below low (no MSAA, fewer cascades). Measure on Mac, iPad and Android.
