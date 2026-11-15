struct TU { r: vec4f }; // min dist, max dist, generic flag
@group(1) @binding(0) var<uniform> TR: TU;
struct TDef { wp: vec3f, n: vec3f, keep: f32, hy: f32 };
fn treeDeform(pos: vec3f, nrm: vec3f, kind: f32, i0: vec4f, i1: vec4f, cam: vec3f) -> TDef {
  var o: TDef;
  let d = distance(cam, i0.xyz) * (0.85 + 0.3 * fract(i1.z * 7.31));
  o.keep = f32(d >= TR.r.x && d < TR.r.y);
  var p = pos;
  if (TR.r.z > 0.5) {
    let sp = i1.y;
    if (sp > 1.5) { if (kind > 0.5) { p.y = 0.3 + 0.7 * p.y; p = vec3f(p.x * 1.25, p.y, p.z * 1.25); } else { p.y *= 1.3; } }
    else if (sp > 0.5) { if (kind > 0.5) { p.y = 0.4 + 0.6 * p.y; p = vec3f(p.x * 1.35, p.y, p.z * 1.35); } else { p.y *= 1.2; } }
  }
  let c = cos(i1.x); let s = sin(i1.x);
  let q = vec3f(p.x * i1.w, p.y, p.z * i1.w) * i0.w;
  o.wp = vec3f(q.x * c + q.z * s, q.y, q.z * c - q.x * s) + i0.xyz;
  o.n = vec3f(nrm.x * c + nrm.z * s, nrm.y, nrm.z * c - nrm.x * s);
  o.hy = q.y;
  return o;
}
