@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) cm: vec4f, @location(3) up: vec4f) -> @builtin(position) vec4f {
  let d = objDeform(pos, nrm, cm, up);
  return SGU.vp * vec4f(d.wp, 1.0);
}
