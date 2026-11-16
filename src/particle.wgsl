// Billboard particles (CPU simulated) + procedural snowfall. Premultiplied alpha; alpha 0 = additive glow.
struct PV { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) kind: f32, @location(3) seed: f32 };
fn corner(vi: u32) -> vec2f { return vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0; }
fn camRight() -> vec3f { return normalize(vec3f(G.viewProj[0][0], G.viewProj[1][0], G.viewProj[2][0])); }
fn camUp() -> vec3f { return normalize(vec3f(G.viewProj[0][1], G.viewProj[1][1], G.viewProj[2][1])); }
fn litAt(p: vec3f, hAbove: f32) -> vec3f {
  let vd = distance(p, G.camPos.xyz);
  let sh = shadowSun(p, vec3f(0.0, 1.0, 0.0), vd) * terrainShadow(p.xz, hAbove);
  let up = vec3f(0.0, 1.0, 0.0);
  return G.sunCol.rgb * sh * 0.55 + ambient(up) + spotL(p, up, G.l0p, G.l0d, G.l0c, 1.0) * 2.5 + spotL(p, up, G.l1p, G.l1d, G.l1c, 1.0) * 2.5 + lampLight(p.xz, hAbove);
}
// a: xyz pos, w size ; b: rgb tint, a alpha ; c: x kind (0 chunk, 1 smoke, 2 lamp glow, 3 flash glow, 4 fire, 5 screening smoke), y seed, z height above ground, w age
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f) -> PV {
  let q = corner(vi);
  let wp = a.xyz + (camRight() * q.x + camUp() * q.y) * a.w;
  var o: PV;
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.uv = q; o.kind = c.x; o.seed = c.y;
  var col = b.rgb;
  if (c.x < 1.5 || c.x > 3.5) { let vd = normalize(a.xyz - G.camPos.xyz); col *= litAt(a.xyz, c.z) + G.sunCol.rgb * pow(saturate(dot(vd, G.sunDir.xyz)), 5.0) * 1.2; } else if (c.x < 2.5) { col *= G.misc.x; }
  if (c.x > 3.5 && c.x < 4.5) { col = mix(vec3f(9.0, 3.0, 0.55) * (1.0 - c.w * 2.2), col, smoothstep(0.03, 0.3, c.w)); } // fireball cooling into smoke (c.w = age 0..1)
  var al = b.a;
  if (G.groom.w > 0.5) { // thermal: dust and exhaust smoke are nearly transparent, fire is hot, screening smoke (5) is a hot aerosol that blinds the sensor
    var t = 0.25;
    if (c.x > 4.5) { t = 1.15; al = min(1.0, al * 1.3); }
    else if (c.x > 3.5) { t = mix(5.0, 0.3, smoothstep(0.0, 0.5, c.w)); al *= mix(1.0, 0.2, smoothstep(0.25, 0.6, c.w)); }
    else if (c.x > 2.5) { t = dot(b.rgb, vec3f(0.33)); }
    else if (c.x > 1.5) { t = 0.0; }
    else if (c.x > 0.5) { al *= 0.2; }
    col = vec3f(t);
  }
  o.col = vec4f(col, al);
  if (b.a <= 0.0 && c.x < 1.5) { o.pos = vec4f(0.0, 0.0, -1.0, 1.0); }
  return o;
}
@fragment fn fs(in: PV) -> @location(0) vec4f {
  let r = length(in.uv);
  var a = 0.0; var col = in.col.rgb;
  if (in.kind > 1.5 && in.kind < 3.5) { // glow halo (2 = lamps at night, 3 = tracers and flashes)
    let g = exp(-r * r * 5.0) * 0.5 + exp(-r * 14.0) * 1.5;
    return vec4f(col * g * (1.0 - smoothstep(0.8, 1.0, r)), 0.0);
  }
  let n = vn(in.uv * 1.7 + in.seed * 37.0) * 0.6 + vn(in.uv * 4.1 + in.seed * 11.0) * 0.4;
  if (in.kind < 0.5) { a = saturate((1.0 - r) * 2.5) * in.col.a; } else { a = saturate((1.0 - r) * 1.6 - (1.0 - n) * 0.9) * in.col.a; }
  a = a * a * (3.0 - 2.0 * a);
  return vec4f(col * a, a);
}
// ---- snowfall ----
@vertex fn vsFlake(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PV {
  let q = corner(vi);
  let h = vec3f(hash3(vec3i(i32(ii), 1, 7)), hash3(vec3i(i32(ii), 5, 3)), hash3(vec3i(i32(ii), 9, 2)));
  let t = G.camPos.w;
  let box = 44.0;
  let fall = vec3f(0.9 + sin(t * 0.3 + h.x * 6.0) * 0.4, -(1.1 + h.z * 0.9), 0.5 + cos(t * 0.23 + h.y * 6.0) * 0.4);
  var p = h * box + fall * t + vec3f(sin(t * (0.8 + h.y) + h.x * 20.0), 0.0, cos(t * (0.7 + h.x) + h.y * 20.0)) * 0.25;
  let c = G.camPos.xyz + normalize(vec3f(G.viewProj[0][3], 0.0, G.viewProj[2][3]) + 1e-4) * (box * 0.32);
  p = p - floor((p - c) / box + 0.5) * box;
  let dist = distance(p, G.camPos.xyz);
  let sz = (0.011 + 0.014 * h.y) * (1.0 + dist * 0.035);
  let wp = p + (camRight() * q.x + camUp() * q.y) * sz;
  var o: PV;
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.uv = q; o.kind = 0.0; o.seed = h.x;
  let fade = saturate(1.0 - dist / (box * 0.5)) * saturate(dist * 0.8 - 0.3) * G.misc.y;
  let up = vec3f(0.0, 1.0, 0.0);
  let lit = G.sunCol.rgb * 0.35 + ambient(up) * 1.3 + spotL(p, up, G.l0p, G.l0d, G.l0c, 1.0) * 5.0 + spotL(p, up, G.l1p, G.l1d, G.l1c, 1.0) * 5.0 + lampLight(p.xz, 3.0) * 1.5;
  o.col = vec4f(lit, fade * min(1.0, 0.012 / (sz * 0.5) * 1.6));
  if (fade <= 0.0 || G.groom.w > 0.5) { o.pos = vec4f(0.0, 0.0, -1.0, 1.0); }
  return o;
}
@fragment fn fsFlake(in: PV) -> @location(0) vec4f {
  let r = length(in.uv);
  let a = saturate(1.0 - r) * in.col.a;
  return vec4f(in.col.rgb * a, a);
}
