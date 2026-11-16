struct Globals {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  shadowMat: array<mat4x4f, 3>,
  camPos: vec4f,   // xyz, w = time
  sunDir: vec4f,   // direction to key light (sun or moon), w = moon disc visibility
  sunCol: vec4f,   // rgb radiance, w = sparkle strength
  ambSky: vec4f,
  ambGnd: vec4f,
  fogCol: vec4f,   // a = density
  fogSun: vec4f,   // rgb glow colour, a = height falloff
  skyZen: vec4f,   // a = stars
  skyHor: vec4f,   // a = cloud amount
  skySun: vec4f,   // true sun direction, w = sun disc intensity
  casc: vec4f,     // cascade far distances, w = 1/shadow res
  cascTex: vec4f,  // world size of a texel per cascade
  misc: vec4f,     // x = night (lamps), y = snowfall, z = exposure, w = far forest shade
  l0p: vec4f, l0d: vec4f, l0c: vec4f,
  l1p: vec4f, l1d: vec4f, l1c: vec4f,
  l2p: vec4f, l2d: vec4f, l2c: vec4f,
  world: vec4f,    // x = half size, y = 1/size, z = mask half size, w = 1/mask size
  screen: vec4f,   // xy = render size, z = mask texel (m), w = mask res
  groom: vec4f,
  lod: vec4f,      // tree LOD distances
  lod2: vec4f,
};
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var shadowTex: texture_depth_2d_array;
@group(0) @binding(2) var shadowSmp: sampler_comparison;
@group(0) @binding(3) var heightTex: texture_2d<f32>;
@group(0) @binding(4) var normTex: texture_2d<f32>;
@group(0) @binding(5) var matTex: texture_2d<f32>;
@group(0) @binding(6) var linSmp: sampler;
@group(0) @binding(7) var tshadowTex: texture_2d<f32>;
@group(0) @binding(8) var maskA: texture_2d<f32>;
@group(0) @binding(9) var maskB: texture_2d<f32>;

const PI = 3.14159265;

fn ihash(p: vec2i) -> f32 {
  var n = u32(p.x) * 374761393u + u32(p.y) * 668265263u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return f32(n) * (1.0 / 4294967296.0);
}
fn hash3(p: vec3i) -> f32 {
  var n = u32(p.x) * 374761393u + u32(p.y) * 668265263u + u32(p.z) * 2246822519u;
  n = (n ^ (n >> 13u)) * 1274126177u;
  n = n ^ (n >> 16u);
  return f32(n) * (1.0 / 4294967296.0);
}
// value noise: x = value [0,1], yz = derivative
fn vnoise(p: vec2f) -> vec3f {
  let i = floor(p); let f = p - i; let ii = vec2i(i);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  let a = ihash(ii); let b = ihash(ii + vec2i(1, 0)); let c = ihash(ii + vec2i(0, 1)); let d = ihash(ii + vec2i(1, 1));
  let k1 = b - a; let k2 = c - a; let k4 = a - b - c + d;
  return vec3f(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2f(k1 + k4 * u.y, k2 + k4 * u.x));
}
fn vn(p: vec2f) -> f32 { return vnoise(p).x; }
fn fbm2(p: vec2f) -> f32 { return vn(p) * 0.65 + vn(p * 2.13 + 7.7) * 0.35; }
fn fbm3(p: vec2f) -> f32 { return vn(p) * 0.55 + vn(p * 2.13 + 7.7) * 0.3 + vn(p * 4.31 + 3.1) * 0.15; }

// ---------- sky ----------
fn skyBase(d: vec3f) -> vec3f {
  let h = clamp(d.y, 0.0, 1.0); // pow() of a negative base is NaN on NVIDIA (D3D): keep every base in [0, 1]
  var c = mix(G.skyZen.rgb, G.skyHor.rgb, pow(1.0 - h, 5.0));
  let sd = G.skySun.xyz;
  let cs = max(dot(d, sd), 0.0);
  let az = saturate(dot(normalize(d.xz + vec2f(1e-5, 0.0)), normalize(sd.xz + vec2f(1e-5, 0.0))) * 0.5 + 0.5); // rounding took this just below 0 looking exactly away from the sun
  c += G.fogSun.rgb * (pow(az, 3.0) * pow(1.0 - h, 9.0) * 0.8 + pow(cs, 10.0) * 0.3 + pow(cs, 90.0) * 0.6);
  return c;
}
// Thermal sight (G.groom.w > 0.5): every surface writes an apparent temperature instead of light
// (0.1 snow, 0.2 forest, 0.4 hull, 1+ engine, fire). Long-wave IR passes haze, so only a faint path term remains.
fn thermal(t: f32, wp: vec3f) -> vec3f { return vec3f(mix(0.13, t, exp(-distance(wp, G.camPos.xyz) * 0.00012))); }
fn applyFog(col: vec3f, wp: vec3f) -> vec3f {
  let v = wp - G.camPos.xyz; let d = length(v); let dir = v / d;
  let k = G.fogSun.a;
  let dy = v.y; let kd = k * dy;
  var f = 1.0;
  if (abs(kd) > 0.001) { f = (1.0 - exp(-kd)) / kd; }
  let od = G.fogCol.a * exp(-k * (G.camPos.y - 232.0)) * d * f + d * G.fogCol.a * 0.12;
  let a = 1.0 - exp(-od);
  let fc = skyBase(normalize(vec3f(dir.x, max(dir.y, 0.0) * 0.4 + 0.015, dir.z))) * G.fogCol.rgb;
  return mix(col, fc, a);
}

// ---------- lights ----------
fn ambient(n: vec3f) -> vec3f {
  // sky is brighter towards the sun's azimuth: gives shape to snow relief in shade
  let az = normalize(G.sunDir.xz + vec2f(1e-4, 0.0));
  return mix(G.ambGnd.rgb, G.ambSky.rgb, n.y * 0.5 + 0.5) * clamp(1.0 + 0.55 * dot(n.xz, az), 0.45, 1.6);
}

fn spotL(P: vec3f, N: vec3f, lp: vec4f, ld: vec4f, lc: vec4f, wrap: f32) -> vec3f {
  let v = lp.xyz - P; let d2 = dot(v, v); let d = sqrt(d2); let l = v / d;
  let cone = smoothstep(ld.w, lc.w, dot(-l, ld.xyz));
  let win = saturate(1.0 - d / lp.w);
  let att = cone * win * win / (1.0 + d2 * 0.03);
  return lc.rgb * att * saturate((dot(N, l) + wrap) / (1.0 + wrap));
}
fn localLights(P: vec3f, N: vec3f, wrap: f32) -> vec3f {
  var c = spotL(P, N, G.l0p, G.l0d, G.l0c, wrap) + spotL(P, N, G.l1p, G.l1d, G.l1c, wrap);
  // flash: point light
  let v = G.l2p.xyz - P; let d2 = dot(v, v); let l = v * inverseSqrt(d2);
  let beam = 1.0; // l2 is the omni flash light (muzzle blast, explosions)
  let w = saturate(1.0 - sqrt(d2) / G.l2p.w);
  c += G.l2c.rgb * beam * w * w / (1.0 + d2 * 0.05) * saturate((dot(N, l) + wrap) / (1.0 + wrap));
  return c;
}
fn lampLight(wxz: vec2f, hAbove: f32) -> vec3f {
  let a = textureSampleLevel(normTex, linSmp, (wxz + G.world.x) * G.world.y, 0.0).a;
  return vec3f(1.0, 0.74, 0.42) * (a * a * G.misc.x * 1.0 / (1.0 + hAbove * hAbove * 0.03));
}

// ---------- shadows ----------
fn shadowCasc(wp: vec3f, ci: i32, soft: i32) -> f32 {
  let p = G.shadowMat[ci] * vec4f(wp, 1.0);
  let uv = p.xy * vec2f(0.5, -0.5) + 0.5;
  let t = G.casc.w;
  let z = p.z;
  if (soft == 0 || G.lod2.x < 0.5 || (soft == 1 && ci == 2)) {
    var s = textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(-0.75, -0.75) * t, ci, z);
    s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(0.75, -0.75) * t, ci, z);
    s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(-0.75, 0.75) * t, ci, z);
    s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(0.75, 0.75) * t, ci, z);
    return s * 0.25;
  }
  // contact-hardening: blocker search then variable-width PCF (receiver is terrain, which is not in the map)
  var P = array<vec2f, 12>(vec2f(-0.326, -0.406), vec2f(-0.84, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621), vec2f(0.962, -0.195), vec2f(0.473, -0.48),
    vec2f(0.519, 0.767), vec2f(0.185, -0.893), vec2f(0.507, 0.064), vec2f(0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598));
  let res = 1.0 / t; let tw = G.cascTex[ci];
  var ang = ihash(vec2i(floor(wp.xz * 140.0))) * 6.2832;
  if (soft == 3) { ang = 0.7; }
  let rc = cos(ang); let rs = sin(ang);
  let sr = clamp(0.55 / tw, 2.0, 10.0);
  var pen = 3.0;
  if (soft == 1 && ci > 0) { pen = 2.2; }
  if (soft == 1 && ci == 0) {
    var zb = 0.0; var nb = 0.0;
    let mx = vec2f(res - 1.0);
    for (var i = 0; i < 6; i++) {
      let o = vec2f(P[i * 2].x * rc - P[i * 2].y * rs, P[i * 2].x * rs + P[i * 2].y * rc) * sr;
      let d = textureLoad(shadowTex, vec2i(clamp(uv * res + o, vec2f(0.0), mx)), ci, 0);
      if (d < z - 0.0004) { zb += d; nb += 1.0; }
    }
    if (nb < 0.5) { return 1.0; }
    pen = clamp((z - zb / nb) * 1040.0 * 0.022 / tw, 1.0, sr);
  }
  var s = 0.0;
  for (var i = 0; i < 8; i++) {
    let o = vec2f(P[i].x * rc - P[i].y * rs, P[i].x * rs + P[i].y * rc) * pen;
    s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + o * t, ci, z);
  }
  return s * 0.125;
}
fn shadowSunS(wp: vec3f, n: vec3f, vd: f32, soft: i32) -> f32 {
  if (vd >= G.casc.z) { return 1.0; }
  var ci = 0;
  if (vd > G.casc.x) { ci = 1; }
  if (vd > G.casc.y) { ci = 2; }
  let tex = G.cascTex[ci];
  let ndl = saturate(dot(n, G.sunDir.xyz));
  let pb = wp + n * tex * (1.2 + 2.0 * (1.0 - ndl)) + G.sunDir.xyz * tex * 1.5;
  var s = shadowCasc(pb, ci, soft);
  let far = G.casc[ci];
  let bl = smoothstep(far * 0.88, far, vd);
  if (bl > 0.0) {
    var s2 = 1.0;
    if (ci < 2) { let t2 = G.cascTex[ci + 1]; s2 = shadowCasc(wp + n * t2 * (1.2 + 2.0 * (1.0 - ndl)) + G.sunDir.xyz * t2 * 1.5, ci + 1, soft); }
    s = mix(s, s2, bl);
  }
  return s;
}
fn shadowSun(wp: vec3f, n: vec3f, vd: f32) -> f32 { return shadowSunS(wp, n, vd, 0); }
// fades geometry that sits between the chase camera and the groomer (x = keep factor)
fn sightFade(wp: vec3f) -> f32 {
  let r = G.lod2.w;
  if (r <= 0.0) { return 1.0; }
  let a = G.camPos.xyz; let ab = G.groom.xyz + vec3f(0.0, 1.6, 0.0) - a;
  let t = dot(wp - a, ab) / dot(ab, ab);
  if (t < 0.0 || t > 0.93) { return 1.0; }
  let d = length(wp - a - ab * t);
  return smoothstep(r * (0.35 + 0.65 * (1.0 - t)), r * (1.0 + 0.6 * (1.0 - t)), d);
}
// baked heightfield shadow (large scale): rg = signed clearance (m), softness
fn terrainShadow(wxz: vec2f, hAbove: f32) -> f32 {
  let t = textureSampleLevel(tshadowTex, linSmp, (wxz + G.world.x) * G.world.y, 0.0);
  return smoothstep(-t.g, t.g, hAbove - t.r);
}
