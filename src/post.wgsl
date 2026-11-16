struct PU { a: vec4f, b: vec4f, c: vec4f, d: vec4f }; // c: xy = gun marker (ndc), z = reload 0..1, w = hud mode (1 commander, 2 sight) ; d: x = hit marker, y = gun ready, z = sight blend, w = damage flash
// // a: xy = uv scale, zw = src texel ; b: x = exposure, y = bloom, z = time, w = mode
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
  // ---- sight overlays (drawn here so the HUD never touches the DOM per frame) ----
  let res = 1.0 / U.a.zw; let px = (in.uv - 0.5) * res; let s = max(1.0, res.y / 1100.0);
  c = mix(c, vec3f(0.75, 0.04, 0.02), U.d.w * smoothstep(0.25, 0.75, length(q)) * 0.55);
  if (U.c.w > 0.5) {
    let ax = abs(px.x) / s; let ay = abs(px.y) / s; let sb = U.d.z;
    // optics: round field stop and a faint green tint
    let rr = length(px) / (res.y * 0.47);
    c = mix(c, c * vec3f(0.86, 1.0, 0.88), sb * 0.5);
    c *= 1.0 - sb * smoothstep(0.985, 1.0, rr);
    var m = 0.0; var o = 0.0;
    let gap = mix(7.0, 14.0, sb); let len = mix(20.0, 150.0, sb);
    let lh = step(ay, 0.8) * step(gap, ax) * step(ax, len); let lv = step(ax, 0.8) * step(gap, ay) * step(ay, len);
    m = max(lh, lv);
    o = max(step(ay, 2.0) * step(gap - 1.2, ax) * step(ax, len + 1.2), step(ax, 2.0) * step(gap - 1.2, ay) * step(ay, len + 1.2));
    m = max(m, step(length(px) / s, 1.3)); o = max(o, step(length(px) / s, 2.6));
    // range stadia below the cross in the sight
    let st = step(0.5, sb) * step(0.0, px.y) * step(abs(fract(ay / 24.0) - 0.5), 0.5) * step(abs(ay - round(ay / 24.0) * 24.0), 0.7) * step(ax, 10.0 + 4.0 * round(ay / 24.0)) * step(20.0, ay) * step(ay, 130.0);
    m = max(m, st);
    // hit marker
    let hx = abs(ax - ay); let hm = step(hx, 1.2) * step(9.0, ax) * step(ax, 19.0) * step(0.01, U.d.x);
    var col = vec3f(0.95, 1.0, 0.95);
    c = mix(c, vec3f(0.0), o * 0.45); c = mix(c, col, m * 0.95);
    c = mix(c, vec3f(1.0, 0.25, 0.15), hm);
    // gun marker: where the round would land now; ring fills clockwise while loading
    let g = (in.uv - (U.c.xy * vec2f(0.5, -0.5) + 0.5)) * res / s; let gd = length(g);
    let ring = 1.0 - smoothstep(0.9, 1.9, abs(gd - 11.0));
    let ang = atan2(g.x, -g.y) / 6.2831853 + 0.5;
    let arc = (1.0 - smoothstep(1.2, 2.2, abs(gd - 16.0))) * step(ang, U.c.z) * step(U.c.z, 0.999);
    let gc = mix(vec3f(1.0, 0.62, 0.1), vec3f(0.35, 1.0, 0.45), U.d.y * step(0.999, U.c.z));
    c = mix(c, vec3f(0.0), (1.0 - smoothstep(1.9, 3.2, abs(gd - 11.0))) * 0.35);
    c = mix(c, gc, ring); c = mix(c, vec3f(1.0, 0.8, 0.3), arc);
  }
  return vec4f(c, 1.0);
}
