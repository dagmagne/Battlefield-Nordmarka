struct ObjU { parts: array<mat4x4f, 8>, tr: vec4f };
@group(1) @binding(0) var<uniform> OB: ObjU;
struct Def { wp: vec3f, n: vec3f, lp: vec3f };
fn objDeform(pos: vec3f, nrm: vec3f, cm: vec4f, up: vec4f) -> Def {
  var lp = pos; var ln = nrm;
  if (cm.w > 7.5 && cm.w < 8.5) {
    let A = 1.75; let R = 0.42; let yc = 0.45; let Lr = PI * R; let L = 4.0 * A + 2.0 * Lr;
    var off = OB.tr.x; if (up.y > 0.0) { off = OB.tr.y; }
    var s = up.x + off; s = s - floor(s / L) * L;
    var c: vec2f; var t: vec2f; var o: vec2f; // (y,z) centre, tangent, outward
    if (s < 2.0 * A) { c = vec2f(yc - R, s - A); t = vec2f(0.0, 1.0); o = vec2f(-1.0, 0.0); }
    else if (s < 2.0 * A + Lr) { let a = (s - 2.0 * A) / R; c = vec2f(yc - R * cos(a), A + R * sin(a)); t = vec2f(sin(a), cos(a)); o = vec2f(-cos(a), sin(a)); }
    else if (s < 4.0 * A + Lr) { c = vec2f(yc + R, A - (s - 2.0 * A - Lr)); t = vec2f(0.0, -1.0); o = vec2f(1.0, 0.0); }
    else { let a = (s - 4.0 * A - Lr) / R; c = vec2f(yc + R * cos(a), -A - R * sin(a)); t = vec2f(-sin(a), -cos(a)); o = vec2f(cos(a), -sin(a)); }
    let yz = c + t * pos.y + o * pos.z;
    lp = vec3f(pos.x, yz);
    ln = vec3f(nrm.x, t * nrm.y + o * nrm.z);
  }
  let M = OB.parts[u32(up.z + 0.5)];
  var d: Def;
  d.wp = (M * vec4f(lp, 1.0)).xyz;
  d.n = (M * vec4f(ln, 0.0)).xyz;
  d.lp = lp;
  return d;
}
