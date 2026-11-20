struct ObjU { parts: array<mat4x4f, 8>, tr: vec4f };
@group(1) @binding(0) var<uniform> OB: ObjU;
struct Def { wp: vec3f, n: vec3f, lp: vec3f };
fn objDeform(pos: vec3f, nrm: vec3f, cm: vec4f, up: vec4f) -> Def {
  var lp = pos; var ln = nrm;
  if (cm.w > 7.5 && cm.w < 8.5) {
    // track link: pos = (x, along, outward) at loop position up.x on the loop of vehicle type up.w. TRKL (loop lengths) and TRKT (two vec4
    // per segment: start s, radius (0 = straight), start angle | point or centre y z, outward y z) come from gear.js, in front of this file
    let ty = i32(up.w + 0.5); let L = TRKL[ty];
    var off = OB.tr.x; if (up.y > 0.0) { off = OB.tr.y; }
    var s = up.x + off; s = s - floor(s / L) * L;
    var k = ty * 16;
    for (var i = 1; i < 8; i++) { if (s >= TRKT[ty * 16 + i * 2].x) { k = ty * 16 + i * 2; } }
    let A = TRKT[k]; let B = TRKT[k + 1]; let u = s - A.x;
    var c: vec2f; var o: vec2f;
    if (A.y > 0.0) { let f = A.z + u / A.y; o = vec2f(-cos(f), sin(f)); c = B.xy + A.y * o; }
    else { o = B.zw; c = B.xy + vec2f(o.y, -o.x) * u; }
    let t = vec2f(o.y, -o.x);
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
