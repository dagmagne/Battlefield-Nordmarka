struct OV { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) uv: vec2f, @location(4) @interpolate(flat) mat: u32, @location(5) lp: vec3f, @location(6) @interpolate(flat) aux: f32 };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) cm: vec4f, @location(3) up: vec4f) -> OV {
  let d = objDeform(pos, nrm, cm, up);
  var o: OV;
  o.wp = d.wp; o.n = d.n; o.lp = d.lp; o.col = cm.rgb; o.uv = up.xy; o.mat = u32(cm.w + 0.5); o.aux = 0.0;
  o.pos = G.viewProj * vec4f(d.wp, 1.0);
  return o;
}
@fragment fn fs(in: OV, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  let wp = in.wp;
  let V = G.camPos.xyz - wp; let dist = length(V); let v = V / dist;
  var alb = in.col; var spec = 0.04; var gloss = 24.0; var emis = vec3f(0.0); var snowy = 0.0; var refl = 0.0;
  let m = in.mat; let uv = in.uv; let isG = OB.tr.w;
  let night = G.misc.x;
  if (m == 0u) { spec = 0.14; gloss = 70.0; refl = 0.16; }
  if (m == 1u || m == 17u) { // boards: vertical (1) or horizontal cladding (17)
    var q = uv; if (m == 17u) { q = uv.yx; }
    let bw = 0.15; let bi = floor(q.x / bw); let bf = fract(q.x / bw);
    let g = vn(vec2f(q.x * 9.0, q.y * 0.9 + bi * 7.0)) * 0.6 + vn(vec2f(q.x * 40.0, q.y * 2.0 + bi * 3.0)) * 0.4;
    alb *= 0.75 + 0.4 * g + 0.12 * (ihash(vec2i(i32(bi), 3)) - 0.5);
    alb *= smoothstep(0.0, 0.07, bf) * smoothstep(1.0, 0.93, bf) * 0.5 + 0.5;
    snowy = 1.0;
  }
  else if (m == 2u) { alb = vec3f(0.93, 0.95, 0.98); }
  else if (m == 3u) { alb *= 0.7 + 0.5 * fbm3(wp.xz * 1.3 + wp.y * 2.1); snowy = 1.0; }
  else if (m == 30u) { // bridge concrete (uv in metres): mottled, formwork panel joints, rain streaks down the faces
    alb *= 0.74 + 0.4 * fbm3(wp.xz * 0.7 + wp.y * 1.3);
    let pj = min(abs(fract(uv.x / 2.4) - 0.5), abs(fract(uv.y / 1.2) - 0.5)); alb *= 1.0 - 0.18 * (1.0 - smoothstep(0.47, 0.49, 0.5 - pj));
    alb *= 0.86 + 0.14 * smoothstep(0.25, 0.7, vn(vec2f(uv.x * 2.7, wp.y * 0.25)));
    spec = 0.03; gloss = 14.0; snowy = 1.0;
  }
  else if (m == 4u) { spec = 0.05; gloss = 300.0; refl = 1.0; emis = vec3f(1.0, 0.7, 0.4) * 0.003 * night * isG; }
  else if (m == 5u) { spec = 0.2; gloss = 40.0; snowy = 1.0 - isG; }
  else if (m == 6u) { emis = in.col * (0.03 + night) * 16.0; alb = vec3f(0.8); }
  else if (m == 7u) {
    let f = fract(uv); let mull = step(0.08, f.x) * step(f.x, 0.92) * step(0.1, f.y) * step(f.y, 0.9) * step(0.035, abs(f.x - 0.5)) * step(0.03, abs(f.y - 0.55));
    let glow = 0.6 + 0.4 * vn(floor(uv) * 3.7 + 1.0);
    emis = vec3f(1.0, 0.62, 0.26) * mull * glow * (0.06 + night * 2.6);
    alb = mix(vec3f(0.85), vec3f(0.03, 0.04, 0.06), mull); spec = 0.3 * mull; gloss = 200.0; refl = 0.5 * mull;
  }
  else if (m == 8u) { spec = 0.4; gloss = 30.0; alb = mix(alb, vec3f(0.93), 0.12); }
  else if (m == 9u) { alb = vec3f(0.028, 0.028, 0.03); }
  else if (m == 10u) { emis = in.col * (0.35 + 7.5 * night); }
  else if (m == 11u) { emis = in.col * (0.6 + 8.0 * pow(saturate(dot(n, G.l2d.xyz)), 3.0)) * (0.5 + 0.5 * night); }
  else if (m == 12u) { alb = mix(vec3f(0.11, 0.11, 0.12), vec3f(0.27, 0.25, 0.22), fbm3(wp.xz * 0.9 + wp.y * 1.7)); alb *= 0.7 + 0.6 * vn(wp.xz * 7.0 + wp.y * 5.0); snowy = 1.3; }
  else if (m == 13u) { // sign board: text-ish bars
    let f = uv; let row = floor(f.y * 3.0); let rf = fract(f.y * 3.0);
    let ink = step(0.3, rf) * step(rf, 0.7) * step(0.12, f.x) * step(f.x, 0.5 + 0.35 * ihash(vec2i(i32(row), i32(in.col.r * 91.0)))) * step(0.35, vn(vec2f(f.x * 46.0, row * 9.0 + in.col.g * 50.0)));
    alb = mix(alb, vec3f(0.92), ink); snowy = 1.0;
  }
  else if (m == 14u) { let r = length(uv); alb = mix(vec3f(0.03), in.col, step(r, 0.78)); let a = atan2(uv.y, uv.x); alb *= 0.55 + 0.45 * step(0.3, abs(fract(a * 0.955 + 0.5) - 0.5) * 2.0 + step(r, 0.25)); spec = 0.2; }
  else if (m == 15u) { alb = mix(vec3f(0.07, 0.07, 0.075), vec3f(0.3, 0.035, 0.03), smoothstep(3.75, 3.9, uv.y)); alb *= 0.8 + 0.2 * step(0.5, fract(uv.x * 23.0)); alb = mix(alb, vec3f(0.92), smoothstep(3.95, 4.12, uv.y) * 0.6); }
  else if (m == 16u) { alb = vec3f(0.04); }
  else if (m == 19u) { alb = vec3f(0.004); spec = 0.0; }
  else if (m == 20u) { // vehicle paint with whitewash winter camouflage (pattern fixed to the part)
    let lp = in.lp; let up = saturate(n.y); let side = 1.0 - abs(n.y);
    let q = vec3f(lp.x * 0.8 - lp.z * 0.6, lp.y, lp.x * 0.6 + lp.z * 0.8) * 0.55; // turned off the lattice axes, or the patch edges run in steps along the hull
    let fine = vn(vec2f(lp.x * 5.4 + lp.z * 7.2, lp.z * 5.4 - lp.x * 7.2) + lp.y * 7.0);
    let drip = vn(vec2f((lp.x + lp.z) * 17.0, lp.y * 1.3)) * 0.6 + vn(vec2f((lp.x + lp.z) * 5.3 + 3.0, lp.y * 0.7)) * 0.4; // vertical runs on the standing plates
    alb *= 0.8 + 0.34 * vn(lp.xz * 3.1 + lp.y * 5.3);
    alb *= 1.0 - 0.13 * side * smoothstep(0.45, 0.8, drip); // rain and exhaust streaks
    // whitewash brushed on in broad patches: opaque in the middle, thin and streaky towards the edges, worn where it is walked on
    let w = fbm3(q.xz * 1.7 + q.y * 2.3 + in.col.g * 40.0) + 0.07 * (fine - 0.5) + 0.08 * side * (drip - 0.5);
    let cov = smoothstep(0.49, 0.58, w); let core = smoothstep(0.54, 0.7, w);
    let brush = 0.6 + 0.4 * smoothstep(0.25, 0.75, vn(vec2f((lp.x - lp.z) * 14.0 + lp.y * 3.0, lp.y * 6.0 + (lp.x + lp.z) * 5.0)));
    let wash = cov * mix(0.5 * brush, 0.92, core) * (1.0 - 0.35 * up * smoothstep(0.45, 0.75, vn(lp.xz * 4.3)));
    alb = mix(alb, vec3f(0.6, 0.62, 0.6) * (0.9 + 0.12 * fine), wash);
    // road grime and packed snow thrown up low on the hull, a dusting of fresh snow on the level plates (not on the warm engine deck)
    let low = smoothstep(1.05, 0.25, lp.y);
    alb = mix(alb, vec3f(0.2, 0.19, 0.17), 0.3 * low * smoothstep(0.35, 0.7, vn(lp.xz * 2.3 + lp.y * 3.0)));
    alb = mix(alb, vec3f(0.66, 0.68, 0.7), 0.4 * low * smoothstep(0.4, 0.75, vn(lp.xz * 5.0 + lp.y * 6.0 + 2.0)));
    let cold = 1.0 - smoothstep(1.3, 1.9, lp.z) * smoothstep(1.75, 1.6, lp.y);
    let dust = smoothstep(0.82, 0.97, n.y) * smoothstep(0.42, 0.72, fbm3(q.xz * 2.3 + 7.0) + 0.08 * (fine - 0.5)) * cold;
    alb = mix(alb, vec3f(0.9, 0.92, 0.95), 0.7 * dust);
    spec = mix(0.08, 0.03, max(wash, dust)); gloss = 18.0;
  }
  else if (m == 22u) { // building rubble: broken, sooty, a dusting of snow on the tops
    alb *= 0.55 + 0.9 * fbm3(wp.xz * 1.7 + wp.y * 2.3);
    alb *= 0.7 + 0.6 * vn(wp.xz * 9.0 + wp.y * 7.0);
    alb = mix(alb, vec3f(0.012, 0.011, 0.01), smoothstep(0.5, 0.8, vn(wp.xz * 0.7 - wp.y * 0.9)) * 0.85);
    spec = 0.03; gloss = 12.0; snowy = 0.15;
  }
  else if (m == 23u) { // scorched walls and roof of a damaged building: soot, burnt-through patches that glow at night
    let hz = dot(wp.xz, vec2f(0.707, 0.707)) + dot(wp.xz, vec2f(-0.707, 0.707)) * 0.3;
    let rg = fbm3(wp.xz * 0.11 + vec2f(wp.y * 0.04, 3.0) + in.col.g * 13.0); // scorched regions
    let st = vn(vec2f(hz * 0.8, wp.y * 0.06));                                  // with streaky edges where smoke rose
    let soot = smoothstep(0.45, 0.59, rg + (st - 0.5) * 0.25); let hole = smoothstep(0.68, 0.7, rg + (vn(wp.xz * 0.9 + wp.y * 0.9) - 0.5) * 0.1);
    alb *= 0.75; alb = mix(alb, vec3f(0.02, 0.018, 0.016), soot * 0.94); alb = mix(alb, vec3f(0.003), hole);
    emis = vec3f(1.0, 0.24, 0.035) * hole * (0.015 + night * 0.2) * smoothstep(0.3, 0.8, vn(wp.xz * 2.3 + wp.y * 2.9));
    spec = 0.05 * (1.0 - soot); gloss = 20.0;
  }
  else if (m >= 24u && m <= 28u && m != 25u) { // soldier: overall 24, chest rig and straps 26, pack and boots 27, gloves 28 (pattern fixed to the part)
    let q = in.lp;
    let crease = vn(vec2f(q.y * 23.0 + q.x * 7.0, q.z * 19.0 + q.x * 11.0)) * 0.6 + vn(vec2f(q.x * 61.0 - q.y * 13.0, q.z * 57.0 + q.y * 17.0)) * 0.4;
    let weave = vn(vec2f(q.x * 260.0 + q.z * 90.0, q.y * 240.0)) - 0.5;
    alb *= (0.84 + 0.22 * crease + 0.06 * weave) * (0.9 + 0.14 * vn(vec2f(q.x * 7.0 + q.y * 3.0, q.z * 7.0 - q.y * 5.0) + in.col.r * 37.0)); // creases, weave, worn patches
    if (m == 24u) {
      let hs = (0.5 - abs(fract(q.y * 4.3) - 0.5)) / 4.3;
      let seam = 1.0 - 0.2 * (1.0 - smoothstep(0.0025, 0.006, abs(q.x))) - 0.12 * (1.0 - smoothstep(0.002, 0.005, hs));
      let gh = textureLoad(heightTex, vec2i(clamp((wp.xz + G.world.x) * 0.5, vec2f(0.0), vec2f(2047.0))), 0).r;
      let dirt = (1.0 - smoothstep(0.05, 0.5, wp.y - gh)) * (0.5 + 0.5 * vn(q.xz * 31.0 + q.y * 17.0));
      alb = mix(alb * seam, vec3f(0.48, 0.45, 0.4), dirt * 0.45);
    }
    alb = min(alb, vec3f(0.74));
    spec = select(0.025, 0.04, m == 27u); gloss = 10.0;
  }
  else if (m == 25u) { alb *= 0.92 + 0.12 * vn(in.lp.xy * 70.0); spec = 0.06; gloss = 24.0; } // soldier: face
  else if (m == 18u) { // Norwegian flag
    let f = uv; let cx = abs(f.x - 0.36); let cy = abs(f.y - 0.5);
    alb = vec3f(0.62, 0.02, 0.04);
    if (cx < 0.09 || cy < 0.125) { alb = vec3f(0.9); }
    if (cx < 0.045 || cy < 0.0625) { alb = vec3f(0.0, 0.03, 0.2); }
  }
  else if (m == 29u) { // track bed (uv = across, along in metres): concrete sleepers every 0.6 m in dark ballast, drifted over with snow in patches
    let fy = fract(uv.y / 0.6); let ax = abs(uv.x);
    let slp = (1.0 - smoothstep(0.11, 0.135, abs(fy - 0.5))) * (1.0 - smoothstep(1.25, 1.3, ax));
    let grav = vn(wp.xz * 9.0) * 0.6 + vn(wp.xz * 31.0) * 0.4;
    alb = mix(vec3f(0.075, 0.068, 0.06) * (0.55 + 0.9 * grav), vec3f(0.4, 0.39, 0.37) * (0.85 + 0.3 * vn(uv * vec2f(4.0, 19.0))), slp);
    let cover = smoothstep(0.14, 0.56, fbm3(wp.xz * 0.33) + 0.35 * (vn(wp.xz * 3.1) - 0.5) - 0.22 * slp + 0.35 * smoothstep(1.2, 1.9, ax) - 0.1 * (1.0 - smoothstep(0.6, 0.85, ax)));
    alb = mix(alb, vec3f(0.93, 0.95, 0.98), cover); spec = 0.03; gloss = 12.0;
  }
  else if (m == 21u) { // Russian protective green: flat, grimy, a little snow dust
    alb *= 0.8 + 0.4 * vn(in.lp.xz * 2.7 + in.lp.y * 4.1);
    alb = mix(alb, vec3f(0.55, 0.57, 0.6), 0.3 * smoothstep(0.45, 0.62, vn(in.lp.xz * 1.9 + 5.0)) * saturate(n.y));
    alb = mix(alb, vec3f(0.6, 0.62, 0.64), 0.25 * smoothstep(0.9, 0.2, in.lp.y) * vn(in.lp.xz * 5.0 + 2.0));
    spec = 0.06; gloss = 16.0;
  }
  if (OB.tr.z > 0.0) { alb = mix(alb, vec3f(0.012, 0.011, 0.01) * (0.6 + 0.8 * vn(in.lp.xz * 3.0 + in.lp.y * 2.0)), OB.tr.z * 0.93); spec *= 1.0 - OB.tr.z; refl *= 1.0 - OB.tr.z; emis *= 1.0 - OB.tr.z; }
  // snow settling on upward faces
  let sn = smoothstep(0.5, 0.78, n.y + (vn(wp.xz * 2.3 + wp.y) - 0.5) * 0.35) * min(snowy, 1.0) + max(snowy - 1.0, 0.0) * smoothstep(0.1, 0.5, n.y + (vn(wp.xz * 1.1) - 0.5) * 0.5);
  alb = mix(alb, vec3f(0.93, 0.95, 0.98), saturate(sn));
  spec = mix(spec, 0.03, saturate(sn));

  // bilinear ground height: the nearest texel jumps 1-2 m per 2 m on a slope, which showed as light and dark squares on stand treads lying just above it
  let hf = clamp((wp.xz + G.world.x) * 0.5 - 0.5, vec2f(0.0), vec2f(2046.0)); let tx = vec2i(floor(hf)); let hw = hf - floor(hf);
  let hgt = mix(mix(textureLoad(heightTex, tx, 0).r, textureLoad(heightTex, tx + vec2i(1, 0), 0).r, hw.x), mix(textureLoad(heightTex, tx + vec2i(0, 1), 0).r, textureLoad(heightTex, tx + vec2i(1, 1), 0).r, hw.x), hw.y);
  let hAbove = max(wp.y - hgt, 0.0);
  let L = G.sunDir.xyz;
  let ndl = saturate(dot(n, L));
  if (isG < 0.5 && m != 30u) { let sf = sightFade(wp); if (sf < 0.999 && sf < 0.15 + 0.85 * ihash(vec2i(in.pos.xy))) { discard; } }
  if (G.groom.w > 0.5) { // thermal sight: heated houses, hot engine deck and running gear, burning wrecks
    var th = 0.24;
    if (m == 2u) { th = 0.1; } else if (m == 24u || m == 26u) { th = mix(0.15, select(0.78, 0.66, m == 26u) - 0.2 * (1.0 - smoothstep(0.3, 1.1, hAbove)), in.aux); } else if (m == 27u) { th = mix(0.13, 0.4, in.aux); } else if (m == 28u) { th = mix(0.15, 0.95, in.aux); } else if (m == 25u) { th = mix(0.17, 1.05, in.aux); } else if (m == 7u) { th = 0.42; } else if (m == 6u || m == 10u) { th = 0.9; } else if (m == 12u || m == 22u) { th = 0.15; } else if (m == 23u) { th = 0.32; }
    if (isG > 0.5) {
      th = 0.36 + 0.1 * vn(in.lp.xz * 2.1 + in.lp.y * 3.0);
      if (m == 8u || m == 9u || m == 14u) { th = 0.8; }
      th += 1.2 * smoothstep(0.7, 1.9, in.lp.z) * smoothstep(0.7, 1.1, in.lp.y) * smoothstep(1.75, 1.55, in.lp.y);
      th = mix(th, 1.0 + 0.9 * vn(in.lp.xz * 1.7 + in.lp.y * 2.0), OB.tr.z);
    }
    return vec4f(thermal(mix(th, 0.1, saturate(sn)), wp), 1.0);
  }
  let sh = shadowSunS(wp, n, dist, 3) * terrainShadow(wp.xz, hAbove);
  let sun = G.sunCol.rgb * sh;
  let ll = localLights(wp, n, 0.0) + lampLight(wp.xz, hAbove) * (0.5 + 0.5 * saturate(n.y + 0.6));
  var col = alb * (sun * ndl + ambient(n) * select(0.55 + 0.45 * saturate(hAbove * 0.5), 1.0, (m == 2u && n.y > 0.7) || (m == 29u && n.y > 0.3)) + ll) + emis;
  let Hh = normalize(L + v);
  col += sun * spec * pow(saturate(dot(n, Hh)), gloss) * ndl * 4.0;
  if (refl > 0.0) {
    let fr = 0.04 + 0.96 * pow(1.0 - saturate(dot(n, v)), 5.0);
    let rr = reflect(-v, n);
    let env = mix(vec3f(0.85, 0.88, 0.95) * (ambient(vec3f(0.0, 1.0, 0.0)) + G.sunCol.rgb * 0.2), skyBase(rr), smoothstep(-0.08, 0.04, rr.y));
    col = mix(col, env, fr * refl);
  }
  return vec4f(applyFog(col, wp), 1.0);
}
