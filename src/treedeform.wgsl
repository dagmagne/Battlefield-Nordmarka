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
  if (TR.r.z > 0.5) {
    let sp = i1.y;
    if (sp > 1.5) { if (kind > 0.5) { p.y = 0.3 + 0.7 * p.y; p = vec3f(p.x * 1.25, p.y, p.z * 1.25); } else { p.y *= 1.3; } }
    else if (sp > 0.5) { if (kind > 0.5) { p.y = 0.32 + 0.68 * p.y; p = vec3f(p.x * 1.3, p.y, p.z * 1.3); } else { p.y *= 1.0; } }
  }
  let c = cos(i1.x); let s = sin(i1.x);
  let q = vec3f(p.x * i1.w, p.y, p.z * i1.w) * i0.w;
  o.wp = vec3f(q.x * c + q.z * s, q.y, q.z * c - q.x * s) + i0.xyz;
  o.n = vec3f(nrm.x * c + nrm.z * s, nrm.y, nrm.z * c - nrm.x * s);
  o.hy = q.y;
  return o;
}
