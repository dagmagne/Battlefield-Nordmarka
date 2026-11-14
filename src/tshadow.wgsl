// Bakes large-scale heightfield shadows: r = signed occlusion height above ground (m), g = penumbra width
@group(0) @binding(0) var<uniform> U: vec4f;
@group(0) @binding(1) var hT: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0, 0.0, 1.0);
}
fn Hh(p: vec2f) -> f32 { return textureLoad(hT, vec2i(clamp((p + 2048.0) * 0.5, vec2f(0.0), vec2f(2047.0))), 0).r; }
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = (pos.xy / 1024.0 - 0.5) * 4096.0;
  let h0 = (Hh(p + vec2f(1.0, 1.0)) + Hh(p + vec2f(-1.0, 1.0)) + Hh(p + vec2f(1.0, -1.0)) + Hh(p + vec2f(-1.0, -1.0))) * 0.25;
  let l = normalize(U.xz); let tanE = U.y / max(length(U.xz), 1e-4);
  var m = -1000.0; var td = 0.0; var t = 5.0;
  for (var i = 0; i < 80; i++) {
    let q = p + l * t;
    if (max(abs(q.x), abs(q.y)) > 2047.0) { break; }
    let c = Hh(q) - (h0 + t * tanE);
    if (c > m) { m = c; td = t; }
    t = t * 1.075 + 2.5;
  }
  return vec4f(clamp(m, -60.0, 400.0), 0.5 + td * 0.014, 0.0, 0.0);
}
