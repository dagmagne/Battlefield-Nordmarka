struct TU { r: vec4f, s: vec4f }; // s: x = snow extent on tier LODs, y = cross-fade band // min dist, max dist, generic flag
@group(1) @binding(0) var<uniform> TR: TU;
struct TDef { wp: vec3f, n: vec3f, keep: f32, hy: f32, fade: vec2f, sv: vec4f, ao: f32 }; // sv: snow multiplier, dead branch, two per-tree colour randoms
// per-tree random numbers from the trunk position (the instance seed is tied to the height, and the integer part of i1.z is a lattice)
fn thash(p: vec2f) -> vec4f { // four 8-bit randoms
  let q = vec2u(vec2i(floor(p * 8.0) + 65536.0)); var h = (q.x * 1597334677u) ^ (q.y * 3812015801u);
  h = (h ^ (h >> 15u)) * 2246822519u; h = (h ^ (h >> 13u)) * 3266489917u; h = h ^ (h >> 16u);
  return vec4f(vec4u(h, h >> 8u, h >> 16u, h >> 24u) & vec4u(255u)) / 255.0;
}
fn treeDeform(pos: vec3f, nrm: vec3f, kind: f32, i0: vec4f, i1: vec4f, cam: vec3f) -> TDef {
  var o: TDef;
  let d = distance(cam, i0.xyz) * (0.85 + 0.3 * fract(i1.z * 7.31));
  let bd = TR.s.y; let a0 = TR.r.x * (1.0 - bd); let a1 = TR.r.x * (1.0 + bd) + 1e-3; let b0 = TR.r.y * (1.0 - bd); let b1 = TR.r.y * (1.0 + bd);
  o.keep = f32(d >= a0 && d < b1);
  o.fade = vec2f(smoothstep(a0, TR.r.x + 1e-3, d), 1.0 - smoothstep(TR.r.y, b1, d));
  var p = pos;
  let sp = floor(i1.y + 0.001); let fall = clamp(fract(i1.y + 0.001) * 2.5, 0.0, 1.0); // a small tree a vehicle ran over: the fraction of the species field is how far it has fallen
  if (TR.r.z > 0.5) {
    if (sp > 1.5) { if (kind > 0.5) { p.y = 0.3 + 0.7 * p.y; p = vec3f(p.x * 1.25, p.y, p.z * 1.25); } else { p.y *= 1.3; } }
    else if (sp > 0.5) { if (kind > 0.5) { p.y = 0.32 + 0.68 * p.y; p = vec3f(p.x * 1.3, p.y, p.z * 1.3); } else { p.y *= 1.0; } }
  }
  // per-tree crown shape, the same function of the unit-height position on every LOD (so silhouettes match when they switch):
  // lopsided, wavy outline, a little lean, thinner or broader crowns, and on big spruces a bare lower trunk with dead branches
  let rr = thash(i0.xz); let r1 = rr.x; let r2 = rr.y; let r3 = rr.z; let r4 = rr.w;
  let th = atan2(p.z, p.x); let y = p.y; let rad = length(p.xz);
  let amp = select(select(0.24, 0.3, sp > 1.5), 0.36, sp > 0.5 && sp < 1.5);
  var f = 1.0 + amp * (0.5 * cos(th - 6.283 * r1) * (0.35 + y) + (0.3 * cos(2.0 * th + 6.283 * r2 + 3.0 * y) + 0.2 * cos(3.0 * th - 6.283 * r3 + 5.0 * y + 1.5 * sin(4.0 * y + r1 * 9.0))) * (0.55 + 0.45 * smoothstep(0.05, 0.3, y)));
  f *= 1.0 + 0.1 * sin(y * 31.0 + r2 * 40.0) * cos(th * 2.0 + r3 * 20.0);
  var wv = 1.0; var dead = 0.0;
  if (sp < 0.5) {
    wv = (0.8 + 0.32 * r2) * mix(1.1, 0.88, clamp((i0.w - 8.0) / 14.0, 0.0, 1.0));
    let cb = clamp((i0.w - 11.0) / 9.0, 0.0, 1.0) * max(r4 - 0.3, 0.0) * 0.5; // crown base (unit height) of a forest-grown spruce
    if (kind > 0.5) { let k = smoothstep(cb - 0.07, cb + 0.01, y); dead = (1.0 - k) * step(0.001, cb); f *= mix(0.3, 1.0, k); }
  }
  p = vec3f(p.x * f * wv, p.y, p.z * f * wv);
  let la = 6.283 * r3; let ln = (0.015 + 0.04 * r4 * r4) * y * y;
  p = vec3f(p.x + cos(la) * ln, p.y, p.z + sin(la) * ln);
  // crown interior is darker: radial position against the species' crown radius at this height
  let cr = select(select(0.17 * pow(max(1.0 - y, 0.0), 0.72) + 0.02, 0.2, sp > 1.5), 0.13, sp > 0.5 && sp < 1.5);
  o.ao = select(1.0, mix(0.62, 1.0, smoothstep(0.15, 0.85, rad / cr)), kind > 0.5 && kind < 2.5);
  // snow load per tree (wind, shelter, how long since it fell) times clumps of roughly a metre, evaluated per vertex (cheap; a
  // fragment noise cost several ms on fill-bound GPUs); a function of the unit-height position, so every LOD carries the same amount
  let m = pos * i0.w + vec3f(r1, r2, r3) * 40.0;
  let cl = 0.5 + 0.32 * sin(m.x * 1.7 + m.y * 0.6) * sin(m.z * 1.9 - m.y * 0.8 + 1.3) + 0.18 * sin(m.x * 3.3 - m.z * 2.1 + m.y * 1.9);
  let snow = (0.48 + 0.52 * fract(r1 * 7.13 + r4 * 3.71)) * mix(1.0, clamp(0.22 + 1.6 * smoothstep(0.3, 0.7, cl), 0.0, 1.0), 0.85 * (1.0 - smoothstep(140.0, 420.0, d)));
  o.sv = vec4f(snow, dead, r1, r2);
  let c = cos(i1.x); let s = sin(i1.x);
  var q = vec3f(p.x * i1.w, p.y, p.z * i1.w) * i0.w;
  var nl = nrm;
  if (fall > 0.0) { let fa = fall * fall * 1.32; let cf = cos(fa); let sf = sin(fa); q = vec3f(q.x, q.y * cf - q.z * sf + fall * fall * i0.w * 0.12, q.y * sf + q.z * cf); nl = vec3f(nl.x, nl.y * cf - nl.z * sf, nl.y * sf + nl.z * cf); } // tips over towards local +z (the rotation aims it along the vehicle's path)
  o.wp = vec3f(q.x * c + q.z * s, q.y, q.z * c - q.x * s) + i0.xyz;
  o.n = vec3f(nl.x * c + nl.z * s, nl.y, nl.z * c - nl.x * s);
  o.hy = q.y;
  return o;
}
