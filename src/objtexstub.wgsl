struct TexS { alb: vec3f, nrm: vec3f, spec: f32 };
fn texFetch(uv: vec2f, wp: vec3f, n: vec3f) -> TexS { var t: TexS; t.nrm = n; return t; }
