// Writes groomer passes into the grooming mask. One instance = one swept quad.
struct SO { @builtin(position) pos: vec4f, @location(0) w: f32, @location(1) s: f32, @location(2) @interpolate(flat) val: vec4f, @location(3) @interpolate(flat) uu: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) p0: vec4f, @location(1) p1: vec4f, @location(2) sv: vec4f, @location(3) val: vec4f) -> SO {
  let side = f32((vi == 1u || vi == 4u || vi == 5u));
  let fwd = f32((vi == 2u || vi == 3u || vi == 5u));
  let width = max(distance(p1.xy, p1.zw), 0.01);
  let e = val.w / width * 1.5;
  let w = mix(-e, 1.0 + e, side);
  let a = mix(p0.xy, p0.zw, w); let b = mix(p1.xy, p1.zw, w);
  let p = mix(a, b, fwd);
  var o: SO;
  o.pos = vec4f(p.x / 1600.0, -p.y / 1600.0, 0.0, 1.0);
  o.w = w; o.s = mix(sv.x, sv.y, fwd); o.val = val; o.uu = vec3f(sv.z, sv.w, width / val.w);
  return o;
}
struct FO { @location(0) a: vec4f, @location(1) b: vec4f };
// round blast mark: writes only maskA alpha (scorch / crater), see the blast pipeline in main.js
@fragment fn fsBlast(in: SO) -> FO {
  let r = length(vec2f(in.w, in.s) * 2.0 - 1.0);
  var o: FO;
  o.a = vec4f(0.0, 0.0, 0.0, (1.0 - smoothstep(0.3, 1.0, r)) * in.val.x);
  o.b = vec4f(0.0);
  return o;
}
@fragment fn fs(in: SO) -> FO {
  let cov = saturate(min(in.w, 1.0 - in.w) * in.uu.z * 0.5 + 0.5);
  var o: FO;
  o.a = vec4f(in.val.rgb, cov);
  o.b = vec4f(mix(in.uu.x, in.uu.y, in.w), abs(fract(in.s / 8.0) * 2.0 - 1.0), 0.0, step(0.3, cov));
  return o;
}
