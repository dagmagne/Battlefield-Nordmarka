@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) uk: vec4f, @location(3) i0: vec4f, @location(4) i1: vec4f) -> @builtin(position) vec4f {
  let d = treeDeform(pos * vec3f(0.93, 1.0, 0.93), nrm, uk.z, i0, i1, SGU.cam.xyz);
  return mix(vec4f(0.0, 0.0, -1.0, 1.0), SGU.vp * vec4f(d.wp, 1.0), d.keep);
}
