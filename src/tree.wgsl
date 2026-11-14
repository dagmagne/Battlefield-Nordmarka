struct TV { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) ks: vec4f, @location(4) ao: f32, @location(5) hy: f32 };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uk: vec4f, @location(3) i0: vec4f, @location(4) i1: vec4f) -> TV {
  let d = treeDeform(pos, nrm, uk.z, i0, i1, G.camPos.xyz);
  var o: TV;
  o.wp = d.wp; o.n = d.n; o.uv = uk.xy; o.ks = vec4f(uk.z, i1.y, fract(i1.z), i0.w); o.ao = uk.w; o.hy = d.hy;
  o.pos = mix(vec4f(0.0, 0.0, -1.0, 1.0), G.viewProj * vec4f(d.wp, 1.0), d.keep);
  return o;
}
fn tri(x: f32) -> f32 { return abs(fract(x) - 0.5) * 2.0; }
@fragment fn fs(in: TV, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let wp = in.wp; let uv = in.uv; let kind = in.ks.x; let sp = in.ks.y; let seed = in.ks.z;
  let duv = fwidth(uv);
  let V = G.camPos.xyz - wp; let dist = length(V); let v = V / dist;
  var n = normalize(in.n);
  let under = dot(n, v) < 0.0;
  if (under) { n = -n; }
  var alb = vec3f(0.2); var alpha = 1.0; var snow = 0.0; var trans = 0.0;
  let generic = TR.r.z > 0.5;
  if (kind > 0.5 && kind < 1.5) {
    let e = abs(uv.y);
    if (generic && sp > 1.5) { // distant birch: frosted twig haze
      alpha = 0.34 + 0.3 * vn(wp.xz * 1.7 + wp.y * 2.3);
      alb = mix(vec3f(0.2, 0.15, 0.16), vec3f(0.74, 0.74, 0.8), 0.55);
    } else {
      // needle fringe
      let fr = e + 0.26 * tri(uv.x * 9.0 + seed * 7.0) * smoothstep(0.25, 0.6, e) + 0.1 * tri(uv.x * 23.0 + seed * 3.0);
      let aw = max(duv.y * 1.2, 0.04);
      alpha = 1.0 - smoothstep(0.95 - aw, 0.95 + aw, fr);
      var g = mix(vec3f(0.028, 0.062, 0.03), vec3f(0.05, 0.082, 0.035), step(0.5, sp));
      g *= 0.75 + 0.5 * seed;
      g *= 0.7 + 0.6 * vn(vec2f(uv.x * 14.0 + seed * 40.0, uv.y * 5.0));
      // snow load on the top side, heavier along the branch axis
      let sw = 0.78 - 0.3 * uv.x + (vn(vec2f(uv.x * 4.0 + seed * 31.0, floor(in.hy * 1.5) + seed * 9.0)) - 0.5) * 0.6;
      snow = (1.0 - smoothstep(sw - 0.1, sw + 0.03, e)) * smoothstep(0.02, 0.12, uv.x);
      if (under) { snow = 0.0; g *= 0.5; }
      alb = g; trans = 1.0;
    }
  } else if (kind > 1.5 && kind < 2.5) { // birch twig card
    let fine = saturate(duv.x * 26.0);
    var a = 0.0;
    for (var l = 0; l < 2; l++) {
      let fl = f32(l);
      let x = uv.x * (13.0 + fl * 7.0) + sin(uv.y * (5.0 + fl * 3.0) + seed * 20.0 + fl * 2.0) * 0.5 + fl * 0.37;
      let id = floor(x); let r = ihash(vec2i(i32(id), l + i32(seed * 50.0)));
      let w = 0.16 + 0.1 * r;
      let ln = 1.0 - smoothstep(w * 0.4, w, tri(x + 0.5));
      a = max(a, ln * step(uv.y, 0.35 + 0.65 * r) * smoothstep(0.0, 0.04, uv.y));
    }
    let env = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x) * smoothstep(1.0, 0.8, uv.y);
    alpha = mix(a, 0.3, fine) * env;
    alb = mix(vec3f(0.16, 0.11, 0.12), vec3f(0.78, 0.78, 0.84), 0.5 + 0.3 * vn(wp.xz * 3.0));
    trans = 0.5;
  } else if (kind > 2.5) { // birch bark
    let dk = in.ao;
    let mk = smoothstep(0.62, 0.75, vn(vec2f(uv.x * 5.0 + seed * 9.0, wp.y * 7.0))) * 0.85 + smoothstep(0.7, 0.8, vn(vec2f(uv.x * 2.0, wp.y * 1.3 + seed * 5.0)));
    alb = mix(vec3f(0.8, 0.78, 0.74), vec3f(0.05, 0.045, 0.045), saturate(mk + smoothstep(0.5, 1.0, dk) * 0.9 + smoothstep(1.2, 0.0, in.hy) * 0.5));
  } else { // conifer bark
    let b = vn(vec2f(uv.x * 12.0, wp.y * 2.5 + seed * 5.0));
    alb = mix(vec3f(0.09, 0.07, 0.06), vec3f(0.2, 0.16, 0.13), b);
    if (sp > 0.5 && sp < 1.5) { alb = mix(alb, vec3f(0.42, 0.2, 0.09) * (0.6 + 0.6 * b), smoothstep(0.3, 0.55, uv.y)); }
    snow = smoothstep(0.75, 0.9, vn(vec2f(uv.x * 3.0 + seed, wp.y * 0.8)) + n.x * 0.2) * 0.7;
  }
  if (G.lod2.z < 0.5) { if (alpha < 0.5) { discard; } alpha = 1.0; }
  if (alpha < 0.02) { discard; }
  alb = mix(alb, vec3f(0.93, 0.95, 0.99), snow);
  trans *= 1.0 - snow;
  let L = G.sunDir.xyz;
  let ndl = dot(n, L);
  let ao = (0.35 + 0.65 * in.ao) * mix(0.55, 1.0, saturate(in.hy / max(in.ks.w * 0.6, 1.0)));
  var sh = shadowSun(wp, n, dist) * terrainShadow(wp.xz, in.hy);
  // distant trees: approximate neighbour shadowing by height in the canopy
  sh *= mix(1.0, saturate(0.25 + in.hy / max(in.ks.w, 1.0) * 1.2), smoothstep(G.casc.z * 0.6, G.casc.z, dist) * (1.0 - G.misc.w) * 1.4);
  let sun = G.sunCol.rgb * sh;
  let dif = saturate((ndl + 0.35) / 1.35);
  let ll = localLights(wp, n, 0.4) + lampLight(wp.xz, in.hy);
  var col = alb * (sun * dif + ambient(n) * ao + ll);
  col += alb * sun * trans * pow(saturate(dot(v, -L)), 2.0) * 1.6;
  col += sun * snow * pow(saturate(dot(n, normalize(L + v))), 24.0) * 0.12;
  return vec4f(applyFog(col, wp), alpha);
}
