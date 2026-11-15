struct OV { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) uv: vec2f, @location(4) @interpolate(flat) mat: u32, @location(5) lp: vec3f };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) cm: vec4f, @location(3) up: vec4f) -> OV {
  let d = objDeform(pos, nrm, cm, up);
  var o: OV;
  o.wp = d.wp; o.n = d.n; o.lp = d.lp; o.col = cm.rgb; o.uv = up.xy; o.mat = u32(cm.w + 0.5);
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
  if (m == 4u && isG > 0.5 && G.groom.w > 0.5) { discard; }
  if (m == 0u) { spec = 0.14; gloss = 70.0; refl = 0.16; }
  else if (m == 1u || m == 17u) { // boards: vertical (1) or horizontal cladding (17)
    var q = uv; if (m == 17u) { q = uv.yx; }
    let bw = 0.15; let bi = floor(q.x / bw); let bf = fract(q.x / bw);
    let g = vn(vec2f(q.x * 9.0, q.y * 0.9 + bi * 7.0)) * 0.6 + vn(vec2f(q.x * 40.0, q.y * 2.0 + bi * 3.0)) * 0.4;
    alb *= 0.75 + 0.4 * g + 0.12 * (ihash(vec2i(i32(bi), 3)) - 0.5);
    alb *= smoothstep(0.0, 0.07, bf) * smoothstep(1.0, 0.93, bf) * 0.5 + 0.5;
    snowy = 1.0;
  }
  else if (m == 2u) { alb = vec3f(0.93, 0.95, 0.98); }
  else if (m == 3u) { alb *= 0.7 + 0.5 * fbm3(wp.xz * 1.3 + wp.y * 2.1); snowy = 1.0; }
  else if (m == 4u) { spec = 0.5; gloss = 300.0; refl = 1.0; emis = vec3f(1.0, 0.7, 0.4) * 0.003 * night * isG; }
  else if (m == 5u) { spec = 0.2; gloss = 40.0; snowy = 1.0 - isG; }
  else if (m == 6u) { emis = in.col * (0.03 + night) * 16.0; alb = vec3f(0.8); }
  else if (m == 7u) {
    let f = fract(uv); let mull = step(0.08, f.x) * step(f.x, 0.92) * step(0.1, f.y) * step(f.y, 0.9) * step(0.035, abs(f.x - 0.5)) * step(0.03, abs(f.y - 0.55));
    let glow = 0.6 + 0.4 * vn(floor(uv) * 3.7 + 1.0);
    emis = vec3f(1.0, 0.62, 0.26) * mull * glow * (0.06 + night * 2.6);
    alb = mix(vec3f(0.85), vec3f(0.03, 0.04, 0.06), mull); spec = 0.3 * mull; gloss = 200.0; refl = 0.5 * mull;
  }
  else if (m == 8u) { spec = 0.4; gloss = 30.0; alb = mix(alb, vec3f(0.93), smoothstep(0.3, 0.7, vn(vec2f(in.lp.x * 7.0, uv.x * 9.0)))); }
  else if (m == 9u) { alb = mix(vec3f(0.025), vec3f(0.9), smoothstep(0.35, 0.75, vn(vec2f(in.lp.x * 6.0, uv.y * 2.5)))* 0.75); }
  else if (m == 10u) { emis = in.col * (0.35 + 7.5 * night); }
  else if (m == 11u) { emis = in.col * (0.6 + 8.0 * pow(saturate(dot(n, G.l2d.xyz)), 3.0)) * (0.5 + 0.5 * night); }
  else if (m == 12u) { alb = mix(vec3f(0.11, 0.11, 0.12), vec3f(0.27, 0.25, 0.22), fbm3(wp.xz * 0.9 + wp.y * 1.7)); alb *= 0.7 + 0.6 * vn(wp.xz * 7.0 + wp.y * 5.0); snowy = 1.3; }
  else if (m == 13u) { // sign board: text-ish bars
    let f = uv; let row = floor(f.y * 3.0); let rf = fract(f.y * 3.0);
    let ink = step(0.3, rf) * step(rf, 0.7) * step(0.12, f.x) * step(f.x, 0.5 + 0.35 * ihash(vec2i(i32(row), i32(in.col.r * 91.0)))) * step(0.35, vn(vec2f(f.x * 46.0, row * 9.0 + in.col.g * 50.0)));
    alb = mix(alb, vec3f(0.92), ink); snowy = 1.0;
  }
  else if (m == 14u) { let r = length(uv); alb = mix(vec3f(0.03), vec3f(0.5, 0.5, 0.52), step(r, 0.72)); let a = atan2(uv.y, uv.x); alb *= 0.55 + 0.45 * step(0.3, abs(fract(a * 0.955 + 0.5) - 0.5) * 2.0 + step(r, 0.25)); spec = 0.2; }
  else if (m == 15u) { alb = mix(vec3f(0.07, 0.07, 0.075), vec3f(0.3, 0.035, 0.03), smoothstep(3.75, 3.9, uv.y)); alb *= 0.8 + 0.2 * step(0.5, fract(uv.x * 23.0)); alb = mix(alb, vec3f(0.92), smoothstep(3.95, 4.12, uv.y) * 0.6); }
  else if (m == 16u) { alb = vec3f(0.04); }
  else if (m == 18u) { // Norwegian flag
    let f = uv; let cx = abs(f.x - 0.36); let cy = abs(f.y - 0.5);
    alb = vec3f(0.62, 0.02, 0.04);
    if (cx < 0.09 || cy < 0.125) { alb = vec3f(0.9); }
    if (cx < 0.045 || cy < 0.0625) { alb = vec3f(0.0, 0.03, 0.2); }
  }
  // snow settling on upward faces
  let sn = smoothstep(0.5, 0.78, n.y + (vn(wp.xz * 2.3 + wp.y) - 0.5) * 0.35) * min(snowy, 1.0) + max(snowy - 1.0, 0.0) * smoothstep(0.1, 0.5, n.y + (vn(wp.xz * 1.1) - 0.5) * 0.5);
  alb = mix(alb, vec3f(0.93, 0.95, 0.98), saturate(sn));
  spec = mix(spec, 0.03, saturate(sn));

  let tx = vec2i(clamp((wp.xz + G.world.x) * 0.5, vec2f(0.0), vec2f(2047.0)));
  let hAbove = max(wp.y - textureLoad(heightTex, tx, 0).r, 0.0);
  let L = G.sunDir.xyz;
  let ndl = saturate(dot(n, L));
  if (isG < 0.5) { let sf = sightFade(wp); if (sf < 0.999 && sf < 0.15 + 0.85 * ihash(vec2i(in.pos.xy))) { discard; } }
  let sh = shadowSun(wp, n, dist) * terrainShadow(wp.xz, hAbove);
  let sun = G.sunCol.rgb * sh;
  let ll = localLights(wp, n, 0.0) + lampLight(wp.xz, hAbove) * (0.5 + 0.5 * saturate(n.y + 0.6));
  var col = alb * (sun * ndl + ambient(n) * (0.55 + 0.45 * saturate(hAbove * 0.5)) + ll) + emis;
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
