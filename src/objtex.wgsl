// textured imported models (MAT.tex = 29): albedo, and the normal map (xy) with the specular level (z); the tangent frame comes from
// screen-space derivatives, so the models need no tangents. Sampled at the top of fs (uniform control flow).
@group(1) @binding(1) var txA: texture_2d<f32>;
@group(1) @binding(2) var txN: texture_2d<f32>;
@group(1) @binding(3) var txS: sampler;
struct TexS { alb: vec3f, nrm: vec3f, spec: f32 };
fn texFetch(uv: vec2f, wp: vec3f, n: vec3f) -> TexS {
  var t: TexS; t.alb = textureSample(txA, txS, uv).rgb; let s = textureSample(txN, txS, uv);
  let dp1 = dpdx(wp); let dp2 = dpdy(wp); let du1 = dpdx(uv); let du2 = dpdy(uv);
  let p2 = cross(dp2, n); let p1 = cross(n, dp1); let T = p2 * du1.x + p1 * du2.x; let B = p2 * du1.y + p1 * du2.y;
  let k = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-20)); let tx = s.x * 2.0 - 1.0; let ty = -(s.y * 2.0 - 1.0);
  t.nrm = normalize(T * k * tx + B * k * ty + n * sqrt(saturate(1.0 - tx * tx - ty * ty))); t.spec = s.z;
  return t;
}
