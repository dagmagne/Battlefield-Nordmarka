struct TV { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) ks: vec4f, @location(4) ao: f32, @location(5) hy: f32 };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uk: vec4f, @location(3) i0: vec4f, @location(4) i1: vec4f) -> TV {
  var sc = 1.0;
  if (G.lod2.w > 0.0) {
    let a = G.camPos.xz; let ab = G.groom.xz - a; let t = dot(i0.xz - a, ab) / dot(ab, ab);
    if (t > 0.0 && t < 0.9) { sc = smoothstep(1.2, 3.2, length(i0.xz - a - ab * t) + 4.0 * max(t - 0.75, 0.0)); }
    sc = min(sc, smoothstep(1.6, 3.6, distance(i0.xz, a)));
  }
  let d = treeDeform(pos * sc, nrm, uk.z, i0, i1, G.camPos.xyz);
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
      alpha = (1.0 - smoothstep(0.2, 0.3, e + 0.25 * tri(uv.x * 5.0 + seed * 9.0))) * step(0.12, uv.x);
      alb = mix(vec3f(0.2, 0.15, 0.16), vec3f(0.74, 0.74, 0.8), 0.5);
    } else {
      var ux = uv.x; var skirt = false;
      if (ux > 1.5) { ux -= 2.0; skirt = true; }
      // needle fringe
      let fr = e + 0.26 * tri(ux * 9.0 + seed * 7.0) * smoothstep(0.25, 0.6, e) + 0.1 * tri(ux * 23.0 + seed * 3.0);
      let aw = max(duv.y * 0.75, 0.012);
      alpha = 1.0 - smoothstep(0.95 - aw, 0.95 + aw, fr);
      var g = mix(vec3f(0.028, 0.062, 0.03), vec3f(0.05, 0.082, 0.035), step(0.5, sp));
      g *= 0.75 + 0.5 * seed;
      // needle rows: fine herringbone streaks along the branch
      let nd = tri(ux * 26.0 + e * 5.0 + seed * 3.0);
      g *= (0.65 + 0.55 * vn(vec2f(ux * 14.0 + seed * 40.0, uv.y * 5.0))) * (0.72 + 0.5 * nd * (1.0 - saturate(duv.x * 40.0)));
      // snow load on the top side, heavier along the branch axis
      let sw = 0.78 - 0.3 * ux + (vn(vec2f(ux * 4.0 + seed * 31.0, floor(in.hy * 1.5) + seed * 9.0)) - 0.5) * 0.6;
      snow = (1.0 - smoothstep(sw - 0.1, sw + 0.03, e)) * smoothstep(0.02, 0.12, ux);
      if (under) { snow = 0.0; g *= 1.5; }
      if (skirt) { snow = 0.0; g *= 1.9; }
      snow *= 0.82 + 0.18 * vn(vec2f(ux * 9.0 + seed * 5.0, uv.y * 3.0 + in.hy));
      alb = g; trans = 1.0;
    }
  } else if (kind > 1.5 && kind < 2.5) { // birch twig spray: main twigs from the apex with alternating side shoots
    let y = uv.y; let px = max(duv.x, duv.y);
    let fine = saturate(px * 45.0);
    var a = 0.0;
    for (var k = 0; k < 4; k++) {
      let fk = f32(k); let r1 = ihash(vec2i(k, i32(seed * 97.0))); let r2 = ihash(vec2i(k + 9, i32(seed * 61.0)));
      let dirx = (fk - 1.5) * 0.22 + (r1 - 0.5) * 0.14;
      let len = 0.62 + 0.38 * r2; let t = y / len;
      let xc = 0.5 + dirx * (1.7 * t - 0.7 * t * t) * len * 1.35 + sin(y * 9.0 + r1 * 20.0) * 0.012;
      let ddx = uv.x - xc;
      let w = 0.0085 * (1.0 - 0.55 * t);
      var l = (1.0 - smoothstep(w * 0.5, w + px, abs(ddx))) * step(t, 1.0);
      let m = y * 12.0 + r1 * 7.0; let cell = floor(m); let f = m - cell;
      let sd = f32(i32(cell) & 1) * 2.0 - 1.0;
      let sl = 0.1 * (1.0 - 0.45 * t) * (0.5 + ihash(vec2i(i32(cell), k + i32(seed * 31.0))));
      let dxs = ddx * sd;
      l = max(l, (1.0 - smoothstep(0.003, 0.0055 + px, abs(dxs - f * sl))) * step(0.0, dxs) * step(dxs, sl) * step(t, 0.96) * step(0.06, t) * (1.0 - fine));
      a = max(a, l);
    }
    let env = smoothstep(0.02, 0.2, uv.x) * smoothstep(0.98, 0.8, uv.x) * smoothstep(1.0, 0.75, y);
    alpha = a * env;
    let frost = 0.25 + 0.4 * vn(wp.xz * 2.0 + wp.y * 3.0);
    alb = mix(vec3f(0.13, 0.08, 0.075), vec3f(0.8, 0.8, 0.86), frost);
    trans = 0.3;
  } else if (kind > 2.5) { // birch bark: white with dark lenticels, darker limbs
    let dk = in.ao;
    let lent = smoothstep(0.7, 0.8, vn(vec2f(uv.x * 4.0 + seed * 9.0, wp.y * 26.0))) * smoothstep(0.35, 0.6, vn(vec2f(uv.x * 2.0, wp.y * 3.0 + seed * 5.0)));
    let scar = smoothstep(0.78, 0.86, vn(vec2f(uv.x * 3.0 + seed * 3.0, wp.y * 1.6 + seed * 15.0)));
    let basef = smoothstep(1.4, 0.0, in.hy) * (0.5 + 0.5 * vn(vec2f(uv.x * 8.0, wp.y * 5.0)));
    alb = mix(vec3f(0.82, 0.8, 0.76), vec3f(0.05, 0.045, 0.045), saturate(lent * 0.85 + scar + basef * 0.8 + smoothstep(0.45, 0.9, dk)));
    snow = smoothstep(0.8, 0.95, vn(vec2f(uv.x * 2.0 + seed, wp.y * 0.6)) + n.x * 0.15) * 0.5 * step(dk, 0.5);
  } else { // conifer bark
    let b = vn(vec2f(uv.x * 12.0, wp.y * 2.5 + seed * 5.0));
    alb = mix(vec3f(0.09, 0.07, 0.06), vec3f(0.2, 0.16, 0.13), b);
    if (sp > 0.5 && sp < 1.5) { alb = mix(alb, vec3f(0.2, 0.12, 0.075) * (0.6 + 0.6 * b), smoothstep(0.6, 0.85, uv.y) * (1.0 - TR.r.z * 0.8)); }
    snow = smoothstep(0.75, 0.9, vn(vec2f(uv.x * 3.0 + seed, wp.y * 0.8)) + n.x * 0.2) * 0.7;
  }
  if (G.lod2.z < 0.5) { if (alpha < 0.5) { discard; } alpha = 1.0; }
  if (alpha < 0.02) { discard; }
  snow *= 0.66 + 0.34 * fract(seed * 5.3);
  alb = mix(alb, vec3f(0.93, 0.95, 0.99), snow);
  trans *= 1.0 - snow;
  let L = G.sunDir.xyz;
  let ndl = dot(n, L);
  let ao = (0.45 + 0.55 * in.ao) * mix(0.6, 1.0, saturate(in.hy / max(in.ks.w * 0.6, 1.0)));
  var sh = shadowSun(wp, n, dist) * terrainShadow(wp.xz, in.hy);
  // distant trees: approximate neighbour shadowing by height in the canopy
  sh *= mix(1.0, saturate(0.25 + in.hy / max(in.ks.w, 1.0) * 1.2), smoothstep(G.casc.z * 0.6, G.casc.z, dist) * (1.0 - G.misc.w) * 1.4);
  let sun = G.sunCol.rgb * sh;
  let dif = saturate((ndl + 0.35) / 1.35);
  let ll = localLights(wp, n, 0.4) + lampLight(wp.xz, in.hy);
  var amb = ambient(n) * ao;
  if (under) { amb = (ambient(n) * 0.5 + ambient(vec3f(0.0, 1.0, 0.0)) * 0.3) * ao; }
  var col = alb * (sun * dif + amb + ll);
  col += alb * sun * trans * pow(saturate(dot(v, -L)), 2.0) * 1.6;
  col += sun * snow * pow(saturate(dot(n, normalize(L + v))), 24.0) * 0.12;
  return vec4f(applyFog(col, wp), alpha);
}
