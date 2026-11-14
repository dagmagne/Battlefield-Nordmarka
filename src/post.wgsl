struct PU { a: vec4f, b: vec4f }; // a: xy = uv scale, zw = src texel ; b: x = exposure, y = bloom, z = time, w = mode
@group(0) @binding(0) var<uniform> U: PU;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var src2: texture_2d<f32>;

struct PO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> PO {
  var o: PO;
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
fn S(uv: vec2f) -> vec3f { return textureSampleLevel(src, smp, min(uv * U.a.xy, U.a.xy - U.a.zw * 0.5), 0.0).rgb; }

// bloom prefilter + 13-tap downsample
@fragment fn fsDown(in: PO) -> @location(0) vec4f {
  let t = U.a.zw / U.a.xy; let uv = in.uv;
  let A = S(uv + t * vec2f(-2.0, -2.0)); let B = S(uv + t * vec2f(0.0, -2.0)); let C = S(uv + t * vec2f(2.0, -2.0));
  let D = S(uv + t * vec2f(-2.0, 0.0)); let E = S(uv); let F = S(uv + t * vec2f(2.0, 0.0));
  let Gg = S(uv + t * vec2f(-2.0, 2.0)); let Hh = S(uv + t * vec2f(0.0, 2.0)); let I = S(uv + t * vec2f(2.0, 2.0));
  let J = S(uv + t * vec2f(-1.0, -1.0)); let K = S(uv + t * vec2f(1.0, -1.0)); let Ll = S(uv + t * vec2f(-1.0, 1.0)); let M = S(uv + t * vec2f(1.0, 1.0));
  var c = E * 0.125 + (A + C + Gg + I) * 0.03125 + (B + D + F + Hh) * 0.0625 + (J + K + Ll + M) * 0.125;
  if (U.b.w > 0.5) { // first pass: soft knee + firefly clamp
    let l = max(c.r, max(c.g, c.b));
    c *= smoothstep(0.7, 2.2, l * U.b.x) ;
    c = min(c, vec3f(24.0 / U.b.x));
  }
  return vec4f(c, 1.0);
}
@fragment fn fsUp(in: PO) -> @location(0) vec4f {
  let t = U.a.zw / U.a.xy; let uv = in.uv;
  var c = S(uv) * 4.0;
  c += (S(uv + t * vec2f(-1.0, 0.0)) + S(uv + t * vec2f(1.0, 0.0)) + S(uv + t * vec2f(0.0, -1.0)) + S(uv + t * vec2f(0.0, 1.0))) * 2.0;
  c += S(uv + t * vec2f(-1.0, -1.0)) + S(uv + t * vec2f(1.0, -1.0)) + S(uv + t * vec2f(-1.0, 1.0)) + S(uv + t * vec2f(1.0, 1.0));
  return vec4f(c / 16.0, U.b.y);
}
fn tonemap(x: vec3f) -> vec3f { // ACES fit (Narkowicz), slightly softened
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
}
@fragment fn fsFinal(in: PO) -> @location(0) vec4f {
  var c = S(in.uv);
  let bl = textureSampleLevel(src2, smp, in.uv, 0.0).rgb;
  c = mix(c, bl, U.b.y * 0.5) + bl * U.b.y * 0.5;
  c *= U.b.x;
  let q = in.uv - 0.5;
  c *= 1.0 - dot(q, q) * 0.42;
  // gentle filmic curve that keeps snow highlights clean
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(l), c, 1.08);
  c = tonemap(max(c, vec3f(0.0)) * 0.85);
  c = pow(c, vec3f(1.0 / 2.2));
  // triangular dither
  let n = fract(sin(dot(in.pos.xy + fract(U.b.z) * 61.0, vec2f(12.9898, 78.233))) * 43758.5453);
  let n2 = fract(sin(dot(in.pos.xy + 31.7, vec2f(39.346, 11.135))) * 24634.6345);
  c += (n + n2 - 1.0) / 255.0;
  return vec4f(c, 1.0);
}
