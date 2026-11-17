// Infantry vertex stage (instanced): part matrices per soldier from a storage buffer; the fragment stage is fs in object.wgsl.
struct Inf { m: array<mat4x4f, 13>, ex: vec4f };
@group(1) @binding(1) var<storage, read> SI: array<Inf>;
@vertex fn vsInf(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) cm: vec4f, @location(3) up: vec4f, @builtin(instance_index) ii: u32) -> OV {
  let M = SI[ii].m[u32(up.z + 0.5)];
  var o: OV;
  o.wp = (M * vec4f(pos, 1.0)).xyz; o.n = (M * vec4f(nrm, 0.0)).xyz; o.lp = pos;
  o.col = cm.rgb; o.uv = up.xy; o.mat = u32(cm.w + 0.5); o.aux = SI[ii].ex.x;
  o.pos = G.viewProj * vec4f(o.wp, 1.0);
  return o;
}
