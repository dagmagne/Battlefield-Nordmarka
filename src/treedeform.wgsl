struct TU { r: vec4f, s: vec4f }; // s: x = snow extent on tier LODs, y = cross-fade band // min dist, max dist, generic flag
@group(1) @binding(0) var<uniform> TR: TU;
struct TDef { wp: vec3f, n: vec3f, keep: f32, hy: f32, fade: vec2f };
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
  let c = cos(i1.x); let s = sin(i1.x);
  var q = vec3f(p.x * i1.w, p.y, p.z * i1.w) * i0.w;
  var nl = nrm;
  if (fall > 0.0) { let fa = fall * fall * 1.32; let cf = cos(fa); let sf = sin(fa); q = vec3f(q.x, q.y * cf - q.z * sf + fall * fall * i0.w * 0.12, q.y * sf + q.z * cf); nl = vec3f(nl.x, nl.y * cf - nl.z * sf, nl.y * sf + nl.z * cf); } // tips over towards local +z (the rotation aims it along the vehicle's path)
  o.wp = vec3f(q.x * c + q.z * s, q.y, q.z * c - q.x * s) + i0.xyz;
  o.n = vec3f(nl.x * c + nl.z * s, nl.y, nl.z * c - nl.x * s);
  o.hy = q.y;
  return o;
}
