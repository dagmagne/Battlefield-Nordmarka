# Imported models: toolchain (parked)

Status: **tested and working, not in main.** The pilot that replaced the player's FPV drone with a textured model from Sketchfab lives on the branch **`claude/fpv-model`** (commit `d2bd430`, closed PR #10). The owner played it on 2026-11-18 and it worked. It is parked, not rejected, so the game stays fully procedural until the owner decides otherwise. This page describes the toolchain so the work can be picked up again without rediscovering it.

Picking it up again: rebase or merge `claude/fpv-model` onto main (it touches `main.js`, `object.wgsl`, `tank.js`, `combat.js`, `mesh.js`, `shell.html`, `CLAUDE.md` and `package.json`), then run `node build.mjs` and `node tools/fpvshots.mjs`. Before it lands, the "Hard rules" in `CLAUDE.md` need the exception for imported models; the branch already words one.

## Overview

```
source.glb (Sketchfab etc., kept outside the repo)
  └─ tools/assets/<model>.mjs           Node + meshoptimizer + headless Chrome
       ├─ src/data/<model>.bin          'MDL1' compact model
       ├─ src/data/<model>_a.webp       albedo (sRGB)
       └─ src/data/<model>_n.webp       normal map XY in RG, specular level in B
build.mjs embeds them as base64 (loader for .bin/.webp already exists)
  └─ src/model.js  decodeModel()        -> the 56-byte object vertex layout (MAT.tex = 29)
                   modelTexture()       -> GPU texture with a mip chain
  └─ main.js       objTexPipe           object pipeline + objtex.wgsl (textures in group 1)
```

## Choosing a model

- **Format:** GLB (glTF 2.0 binary). On Sketchfab take the GLB with 1k textures. More is wasted after the 512 px cut.
- **Licence:** CC BY or CC0 only. Commercial use must be allowed, so no NC. Note author, link and licence in `tools/assets/CREDITS.md` and the credit line in the in-game help (`#help` in `shell.html`). Be wary of titles that name another game (e.g. "War Thunder"): such uploads are often extracted from that game, and then the CC licence is void. The FPV pilot has exactly that caveat.
- **Budget:** a few thousand triangles for small things, and 1–2 textures of 512 px. The FPV came to 5.7k triangles, a 136 kB model and 44 kB of textures, about 240 kB in the bundle after base64.
- Sketchfab GLBs use `KHR_materials_pbrSpecularGlossiness`: diffuse texture, a spec/gloss texture (JPEG, so no gloss in alpha) and a normal map. The root node turns Z-up into Y-up: `(x, y, z) -> (x, z, -y)`.

## Converter (`tools/assets/fpv.mjs`, one script per model)

`node tools/assets/fpv.mjs <source.glb> --tris 4500 --err 0.02 [--scale 1.25] [--noflip]`

1. **Parse the GLB** by hand: JSON chunk, BIN chunk, accessors with or without byte stride. Merge the primitives of the main material and drop tiny extra materials.
2. **Orient:** Z-up to Y-up, scale, and flip 180° about Y so the model faces the game's forward (−z). Check the result with renders: the first try had the warhead pointing backwards.
3. **Split moving parts by position.** For the FPV, the triangles above the arm plane within 0.098 m × scale of each motor hub became rotor parts 1–4. The hub centres are measured from the geometry and stored in the file. `droneParts(out, d, hubs)` spins each part about its hub. Hub order is the same as the procedural drone: `i & 1 -> +x`, `i & 2 -> +z`.
4. **Simplify each part on its own** with `meshoptimizer` (devDependency, `MeshoptSimplifier.simplifyWithAttributes`, uv and normal as attributes with weights `[0.5, 0.5, 0.2, 0.2, 0.2]`). **Use the `Permissive` flag.** Without it the uv seams lock the mesh and it got stuck at 7.2k triangles at 2–3 % error. With it, it reached 4.5k at 0.4 %, and the textures still looked right.
5. **Quantise and write `MDL1`.** Header: `'MDL1'`, u32 vertex count, u32 index count, f32 min xyz / max xyz, uv min / max, 4 rotor hubs (x, z). Vertex, 16 bytes: u16 x y z over min..max, s8 normal xyz, u8 part, u16 u v over the uv range, u8 heat (thermal sight, 0..1), u8 pad. Indices are u16 when there are fewer than 65 536 vertices.
6. **Textures** are resized to 512 px and WebP-encoded in headless Chrome through a canvas (`playwright-core`, already a devDependency, so no image library is needed). **Do not use alpha:** the canvas premultiplies it and corrupts RGB. That is why the specular level goes in the blue channel of the normal map (the normal's z is rebuilt in the shader).
7. **Heat per part** for the thermal sight: frame and battery 0.32, motors 0.85.

## Engine side (on the branch)

- **`src/model.js`**
  - `decodeModel(b64, MAT.tex)` returns `{ v, i, hubs, min, max }` in the normal object layout: position, normal, colour + material (colour r = heat), uv + part in `up.z`.
  - `modelTexture(device, b64, srgb)` decodes the image with `createImageBitmap(..., { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })` and builds the mip chain by drawing smaller and smaller copies on an OffscreenCanvas and calling `copyExternalImageToTexture` for each level. WebGPU has no mip generation. Albedo uses `rgba8unorm-srgb`; the normal map uses `rgba8unorm`.
- **`src/objtex.wgsl`:** group 1 gains bindings 1–3 (albedo, normal, anisotropic repeat sampler). `texFetch(uv, wp, n)` samples both textures and builds the tangent frame from screen-space derivatives (a cotangent frame), so models need **no tangents**. The normal map's green channel is flipped (glTF is +Y up while uv v runs down).
- **`src/objtexstub.wgsl`:** the same `texFetch` returning constants. Every other object module (`objMod`, `infMod`) includes the stub, so `object.wgsl` stays shared and the stub costs nothing.
- **`object.wgsl`:** `texFetch` is called **at the top of `fs`, before any material branch**, because WGSL only allows `textureSample` and `dpdx` in uniform control flow, and the material id is a varying. `if (m == 29u)` then takes albedo, normal and specular from it, and the thermal branch reads the heat from the vertex colour.
- **`main.js`:**
  - `objTexPipe` is `objPipe` with a pipeline layout `[bgl0, bglT]` (uniform, 2 textures, sampler).
  - The model object gets two bind groups: `bgT` for the main pass and the plain `bg` for the shadow pass, which only needs the uniform.
  - After drawing the textured object, switch back to `objPipe`.
  - The part matrices come from the same uniform data as before (combat writes into `droneO.d`, and it is uploaded into whichever object is drawn).

## Checking

- `tools/fpvshots.mjs` renders the model from five sides (front ¾, side, back ¾, top, under), the flying view and thermal. Look at orientation, rotor split, normal-map direction and scale against the camera offset.
- Regression: `dronetest`, `airtest`.
- Performance: one more draw of 5.7k triangles. Medium, `drs=0`, two runs each: GPU avg 10.5 / 11.0 ms on main against 11.0 / 11.1 ms with the model, which is within noise.

## Open ends and next candidates

- The bomber, recon and enemy FPV still use the procedural drone. The enemy FPV could share the model: one more object per air slot, or instancing.
- No LODs yet. The converter could write 2–3 levels (`simplify` at lower targets) and pick by distance.
- Soldiers are the bigger prize: a rigged model plus animation clips (e.g. Mixamo) needs GPU skinning and clip blending, which this toolchain does not cover yet. Vehicles need their part hierarchy (turret, gun, wheels), the track deformation (`TRK` in `objdeform.wgsl`) or a scrolling track texture, and the wreck and cope-cage variants.
- Several imported models would want one texture array instead of a bind group each.
