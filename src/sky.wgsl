fn cloudD(q: vec2f) -> f32 {
  let w = vec2f(vn(q * 0.6 + 3.0), vn(q * 0.6 + 11.0)) - 0.5;
  let s = q * vec2f(0.45, 1.25) + w * 1.1;
  return vn(s) * 0.5 + vn(s * 2.07 + 5.0) * 0.25 + vn(s * 4.3 + 9.0) * 0.125 + vn(s * 8.9 + 2.0) * 0.07 + vn(s * 18.0 + 4.0) * 0.04;
}
struct SOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> SOut {
  var o: SOut;
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  o.pos = vec4f(p, 0.0, 1.0); o.ndc = p;
  return o;
}
@fragment fn fs(in: SOut) -> @location(0) vec4f {
  let a = G.invViewProj * vec4f(in.ndc, 1.0, 1.0);
  let b = G.invViewProj * vec4f(in.ndc, 0.5, 1.0);
  let d = normalize(b.xyz / b.w - a.xyz / a.w);
  var c = skyBase(d);
  let sd = G.skySun.xyz;
  let cs = dot(d, sd);
  // sun disc
  c += G.skySun.w * vec3f(1.0, 0.9, 0.75) * (smoothstep(0.99992, 0.99997, cs) * 60.0 + pow(max(cs, 0.0), 2500.0) * 6.0);
  if (d.y > 0.0) {
    // clouds: warped multi-octave streaks, lit from the sun side
    let q = d.xz / (d.y + 0.12) + vec2f(G.camPos.w * 0.0015, 0.0);
    let dc = cloudD(q);
    let cl = smoothstep(0.5, 0.74, dc) * G.skyHor.a * smoothstep(0.0, 0.1, d.y);
    if (cl > 0.001) {
      let sq = sd.xz / (max(sd.y, 0.0) + 0.12);
      let toS = normalize(sq - q + vec2f(1e-4, 0.0));
      let litf = saturate(0.55 + (dc - cloudD(q + toS * 0.22)) * 5.0);
      let shade = G.skyHor.rgb * 0.55 + G.skyZen.rgb * 0.6;
      let sunlit = G.skyHor.rgb * 0.9 + G.skyZen.rgb * 0.3 + G.fogSun.rgb * (0.5 + 1.6 * pow(max(cs, 0.0), 3.0)) + G.sunCol.rgb * 0.05;
      c = mix(c, mix(shade, sunlit, litf), cl * 0.9);
    }
    // stars
    if (G.skyZen.a > 0.001) {
      let s = d * 400.0; let id = floor(s); let r = hash3(vec3i(id));
      let f = s - id - 0.5;
      let tw = 0.7 + 0.3 * sin(G.camPos.w * (2.0 + r * 5.0) + r * 90.0);
      c += vec3f(0.8, 0.9, 1.0) * (step(0.992, r) * smoothstep(0.3, 0.0, length(f)) * tw * G.skyZen.a * (1.0 - cl) * smoothstep(0.0, 0.2, d.y) * (0.4 + 3.0 * fract(r * 913.0)));
    }
    // moon
    let cm = dot(d, G.sunDir.xyz);
    c += G.sunDir.w * (vec3f(0.95, 0.97, 1.0) * smoothstep(0.99975, 0.9999, cm) * (1.2 - 0.5 * vn(d.xz * 300.0)) + vec3f(0.3, 0.4, 0.6) * pow(max(cm, 0.0), 600.0) * 0.25);
  } else {
    // far ground beyond the terrain: hazy forest plain
    let t = (G.camPos.y - 255.0) / max(-d.y, 1e-4);
    let gp = G.camPos.xyz + d * min(t, 60000.0);
    let fo = fbm3(gp.xz * 0.0011);
    var g = mix(vec3f(0.035, 0.06, 0.07), vec3f(0.6, 0.66, 0.75), smoothstep(0.5, 0.72, fo) * 0.6 + 0.12);
    g *= G.sunCol.rgb * max(G.sunDir.y, 0.05) * G.misc.w + ambient(vec3f(0.0, 1.0, 0.0));
    c = applyFog(g, gp);
  }
  if (G.groom.w > 0.5) { c = vec3f(mix(0.13, 0.025, smoothstep(-0.02, 0.22, d.y))); } // thermal: cold sky, warmer towards the horizon
  return vec4f(c, 1.0);
}
