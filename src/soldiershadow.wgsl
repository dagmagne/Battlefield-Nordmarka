struct Inf { m: array<mat4x4f, 13>, ex: vec4f };
@group(1) @binding(1) var<storage, read> SI: array<Inf>;
@vertex fn vs(@location(0) pos: vec3f, @location(3) up: vec4f, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  return SGU.vp * (SI[ii].m[u32(up.z + 0.5)] * vec4f(pos, 1.0));
}
