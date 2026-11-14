struct LevelU { origin: vec2f, cell: f32, n: f32 };
@group(1) @binding(0) var<uniform> LV: LevelU;

const SW = 4.6;      // groomed swath width (m)
const NR = 96.0;     // corduroy ridges across the swath

fn baseH(xz: vec2f) -> f32 {
  let half = G.world.x;
  let t = clamp((xz + half) * 0.5 - 0.5, vec2f(0.0), vec2f(2046.999));
  let fl = floor(t); let i = vec2i(fl); let f = t - fl;
  let a = textureLoad(heightTex, i, 0).r; let b = textureLoad(heightTex, i + vec2i(1, 0), 0).r;
  let c = textureLoad(heightTex, i + vec2i(0, 1), 0).r; let d = textureLoad(heightTex, i + vec2i(1, 1), 0).r;
  var h = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  let o = max(abs(xz.x), abs(xz.y)) - half;
  if (o > 0.0) { h = mix(h, 262.0, smoothstep(0.0, 1200.0, o)); }
  return h;
}
fn pressOf(m: vec4f) -> f32 { return max(smoothstep(0.08, 0.3, m.r), m.b * 0.85); }
fn bermOf(m: vec4f) -> f32 { return smoothstep(0.02, 0.1, m.r) * (1.0 - smoothstep(0.1, 0.28, m.r)); }
fn icePatch(p: vec2f) -> f32 {
  let q = vec2f(p.x * 0.6 + p.y * 0.8, p.y * 0.6 - p.x * 0.8) * vec2f(0.011, 0.034);
  return smoothstep(0.55, 0.63, fbm3(q) + 0.12 * vn(p * 0.21));
}
// soft-snow displacement above the packed base: x = height, yz = gradient
fn snowDetail(p: vec2f, dist: f32, mt: vec4f) -> vec3f {
  let f1 = 1.0 - smoothstep(150.0, 420.0, dist);
  let f2 = 1.0 - smoothstep(40.0, 110.0, dist);
  let f3 = 1.0 - smoothstep(10.0, 28.0, dist);
  var r = vec3f(0.0);
  if (f1 > 0.0) {
    let n1 = vnoise(p * 0.11);
    r = vec3f(0.17 + (n1.x - 0.5) * 0.36, n1.yz * (0.11 * 0.36)) * f1;
    if (f2 > 0.0) {
      let n2 = vnoise(p * 0.43 + 17.3);
      r += vec3f(n2.x - 0.5, n2.yz * 0.43) * (0.11 * f2);
      // bog tussocks
      let n4 = vnoise(p * 0.9 + 3.3);
      r += vec3f(n4.x, n4.yz * 0.9) * (0.2 * f2 * mt.b);
    }
    if (f3 > 0.0) { let n3 = vnoise(p * 1.7 + 5.1); r += vec3f(n3.x - 0.5, n3.yz * 1.7) * (0.028 * f3); }
  }
  return r * (1.0 - 0.9 * max(mt.r, mt.g));
}

struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f };

@vertex fn vs(@location(0) ij: vec2f) -> VOut {
  var xz = LV.origin + ij * LV.cell;
  let cam = G.camPos.xz;
  let d = max(abs(xz.x - cam.x), abs(xz.y - cam.y));
  let M = LV.n * 0.125;
  let a = clamp((d / LV.cell - (LV.n * 0.5 - 4.0 - M)) / M, 0.0, 1.0);
  let par = ij - 2.0 * floor(ij * 0.5);
  xz -= par * LV.cell * a;
  var h = baseH(xz);
  let dist = distance(xz, cam);
  if (dist < 420.0) {
    let mt = textureSampleLevel(matTex, linSmp, (xz + G.world.x) * G.world.y, 0.0);
    let det = snowDetail(xz, dist, mt);
    var press = 0.0; var berm = 0.0;
    if (max(abs(xz.x), abs(xz.y)) < G.world.z) {
      let mA = textureSampleLevel(maskA, linSmp, xz * G.world.w + 0.5, 0.0);
      press = pressOf(mA); berm = bermOf(mA);
    }
    h += det.x * (1.0 - press) + 0.06 * berm * (1.0 - smoothstep(60.0, 120.0, dist));
  }
  var o: VOut;
  o.wp = vec3f(xz.x, h, xz.y);
  o.pos = G.viewProj * vec4f(o.wp, 1.0);
  return o;
}

fn sparkle1(p: vec3f, cell: f32, v: vec3f) -> f32 {
  let q = p / cell; let id = floor(q);
  let ii = vec3i(id);
  let r = hash3(ii);
  let r2 = hash3(ii + vec3i(17, 5, 11));
  let ph = fract(r + dot(v, vec3f(7.3, 5.1, 6.7)) * (1.0 + r2));
  let g = smoothstep(0.972, 1.0, ph);
  let c = q - id - 0.5;
  return g * smoothstep(0.5, 0.15, length(c)) * (0.4 + 2.0 * r2 * r2);
}
fn sparkle(wp: vec3f, v: vec3f, dist: f32) -> f32 {
  let lv = log2(max(dist, 0.5)) + 1.0; let l0 = floor(lv); let f = lv - l0;
  let c0 = 0.0016 * exp2(l0);
  return mix(sparkle1(wp, c0, v), sparkle1(wp, c0 * 2.0, v), f);
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let wp = in.wp; let p = wp.xz;
  let dpx = dpdx(p); let dpy = dpdy(p);
  let uvW = (p + G.world.x) * G.world.y;
  let nt = textureSample(normTex, linSmp, uvW);
  let mt = textureSample(matTex, linSmp, uvW);
  let V = G.camPos.xyz - wp; let dist = length(V); let v = V / dist;
  let nxz = nt.xy * 2.0 - 1.0; let ny = sqrt(max(1.0 - dot(nxz, nxz), 0.04));
  let S0 = -nxz / ny;
  let nb = normalize(vec3f(nxz.x, ny, nxz.y));
  let dxz = distance(p, G.camPos.xz);
  let det = snowDetail(p, dxz, mt);
  var S = S0;
  var Sd = det.yz;
  var groomed = 0.0; var fresh = 0.0; var groove = 0.0; var imp = 0.0; var cordAvg = 0.0; var pan = 0.0;
  if (max(abs(p.x), abs(p.y)) < G.world.z && dist < 700.0) {
    let muv = p * G.world.w + 0.5;
    let mA = textureSampleLevel(maskA, linSmp, muv, 0.0);
    if (mA.r + mA.b > 0.004) {
      let e = 1.0 / G.screen.w; let tm = G.screen.z;
      let mB = textureSampleLevel(maskB, linSmp, muv, 0.0);
      let ax0 = textureSampleLevel(maskA, linSmp, muv - vec2f(e, 0.0), 0.0); let ax1 = textureSampleLevel(maskA, linSmp, muv + vec2f(e, 0.0), 0.0);
      let az0 = textureSampleLevel(maskA, linSmp, muv - vec2f(0.0, e), 0.0); let az1 = textureSampleLevel(maskA, linSmp, muv + vec2f(0.0, e), 0.0);
      let bx0 = textureSampleLevel(maskB, linSmp, muv - vec2f(e, 0.0), 0.0); let bx1 = textureSampleLevel(maskB, linSmp, muv + vec2f(e, 0.0), 0.0);
      let bz0 = textureSampleLevel(maskB, linSmp, muv - vec2f(0.0, e), 0.0); let bz1 = textureSampleLevel(maskB, linSmp, muv + vec2f(0.0, e), 0.0);
      let press = pressOf(mA);
      let gp = vec2f(pressOf(ax1) - pressOf(ax0), pressOf(az1) - pressOf(az0)) / (2.0 * tm);
      let gb = vec2f(bermOf(ax1) - bermOf(ax0), bermOf(az1) - bermOf(az0)) / (2.0 * tm);
      Sd = det.yz * (1.0 - press) - det.x * gp + 0.06 * gb * (1.0 - smoothstep(60.0, 120.0, dxz));
      let gu = vec2f(bx1.r - bx0.r, bz1.r - bz0.r) / (2.0 * tm);
      let gl = length(gu);
      let valid = smoothstep(0.45, 0.8, gl * SW) * (1.0 - smoothstep(1.35, 1.9, gl * SW));
      let lat = gu / max(gl, 1e-4);
      let u = mB.r;
      groomed = smoothstep(0.2, 0.35, mA.r);
      fresh = smoothstep(0.55, 0.9, mA.r);
      // classic tracks
      let ut = abs(u - 0.5); let tcs = ut - 0.337; let tc = abs(tcs);
      let trk = mA.g * valid * groomed;
      pan = trk * (1.0 - smoothstep(0.05, 0.062, tc));
      let gds = tc - 0.026; let gd = abs(gds);
      let hw = 0.0088;
      let tt = clamp((gd - hw * 0.45) / (hw * 0.8), 0.0, 1.0);
      let gr = 1.0 - tt * tt * (3.0 - 2.0 * tt);
      let sg = sign(gds) * sign(tcs) * sign(u - 0.5);
      let upp = max(abs(dot(gu, dpx)), abs(dot(gu, dpy)));
      let gf = 1.0 - smoothstep(0.35, 0.9, upp / hw);
      groove = gr * trk * gf;
      S += lat * (0.055 * 6.0 * tt * (1.0 - tt) / (hw * 0.8) * sg * gl * trk * gf);
      // corduroy
      let cyc = NR * upp;
      let cf = 1.0 - smoothstep(0.16, 0.42, cyc);
      let cf2 = 1.0 - smoothstep(0.16, 0.42, cyc / 8.0);
      let amp = groomed * mix(0.3, 1.0, fresh) * valid * (1.0 - pan);
      let ph = u * NR * 2.0 * PI;
      let wob = 1.0 + 0.25 * sin(mB.g * 40.0 + u * 31.0);
      S += lat * ((-0.0105 * PI * NR * gl) * sin(ph) * cf * wob + (-0.004 * PI * NR / 8.0 * gl) * sin(ph / 8.0) * cf2) * amp;
      cordAvg = amp * (1.0 - cf);
      // track imprints (grouser bars)
      imp = mA.b * (1.0 - groomed);
      let gt = vec2f(bx1.g - bx0.g, bz1.g - bz0.g) / (2.0 * tm);
      let gtl = length(gt);
      let bpp = 20.0 * max(abs(dot(gt, dpx)), abs(dot(gt, dpy)));
      let bf = (1.0 - smoothstep(0.16, 0.42, bpp)) * smoothstep(0.1, 0.2, gtl) * (1.0 - smoothstep(0.4, 0.6, gtl));
      S += gt / max(gtl, 1e-4) * (0.42 * sin(mB.g * 20.0 * 2.0 * PI) * imp * bf);
    }
  }
  S += Sd;
  // fine grain
  let gfine = 1.0 - smoothstep(4.0, 14.0, dist);
  if (gfine > 0.0) { let n5 = vnoise(p * 23.0); let n6 = vnoise(p * 57.0 + 9.0); S += (n5.yz * 0.004 * 23.0 + n6.yz * 0.0012 * 57.0) * gfine * (1.0 - 0.6 * groomed); }

  // ---- materials ----
  let slope0 = length(S0);
  let alpine = mt.a;
  let nA = vn(p * 0.09); let nB = vn(p * 0.31 + 4.0);
  // wind ripples (sastrugi) on exposed ground
  let expo = max(alpine, mt.r) * (1.0 - groomed) * (1.0 - smoothstep(60.0, 220.0, dist));
  if (expo > 0.01) {
    let q = vec2f(p.x * 0.6 + p.y * 0.8, p.y * 0.6 - p.x * 0.8);
    let w1 = vnoise(q * vec2f(0.5, 2.6) + nA * 3.0);
    S += vec2f(w1.y * 0.5 * 0.6 - w1.z * 2.6 * 0.8, w1.y * 0.5 * 0.8 + w1.z * 2.6 * 0.6) * 0.09 * expo;
  }
  var rock = smoothstep(0.62, 0.95, slope0 + (nA - 0.5) * 0.45 + (nB - 0.5) * 0.25 + alpine * 0.12);
  rock = max(rock, alpine * smoothstep(0.69, 0.76, vn(p * 0.045 + 31.0) * 0.6 + nB * 0.4) * smoothstep(0.12, 0.3, slope0));
  rock *= 1.0 - max(groomed, imp);
  if (rock > 0.01) { let rn = vnoise(p * 1.9); let rn2 = vnoise(p * 6.3); S += (rn.yz * 1.9 * 0.22 + rn2.yz * 6.3 * 0.03) * rock; }
  var n = normalize(vec3f(-S.x, 1.0, -S.y));

  let L = G.sunDir.xyz;
  let ndl = dot(n, L);
  let ndv = saturate(dot(n, v));
  let canopy = nt.b;
  var sh = shadowSun(wp, nb, dist) * terrainShadow(p, 0.3);
  sh *= mix(1.0, G.misc.w, saturate(canopy * 1.6) * smoothstep(G.casc.z * 0.6, G.casc.z, dist));
  let ao = 1.0 - 0.5 * saturate(canopy * 1.3) - 0.25 * groove;

  var alb = mix(vec3f(0.93, 0.95, 0.98), vec3f(0.86, 0.9, 0.96), groomed * 0.6);
  alb *= 1.0 - 0.07 * cordAvg - 0.3 * groove - 0.06 * imp;
  alb = mix(alb, vec3f(0.80, 0.86, 0.95), alpine * 0.35 * smoothstep(0.45, 0.7, nB));
  // sedge tufts on bogs
  let tuft = mt.b * smoothstep(0.78, 0.9, vn(p * 2.3)) * smoothstep(0.4, 0.7, vn(p * 0.4 + 9.0)) * (1.0 - groomed) * (1.0 - smoothstep(80.0, 200.0, dist));
  alb = mix(alb, vec3f(0.42, 0.33, 0.16), tuft * 0.8);
  let rcol = mix(vec3f(0.10, 0.10, 0.11), vec3f(0.23, 0.21, 0.19), vn(p * 0.7) * 0.6 + vn(p * 4.1) * 0.4);
  let rsnow = smoothstep(0.55, 0.8, n.y + (vn(p * 2.7) - 0.5) * 0.5);
  alb = mix(alb, mix(rcol, alb, rsnow * 0.75), rock);
  var snowy = 1.0 - rock * (1.0 - rsnow * 0.75);

  let wrap = 0.12;
  var dif = saturate((ndl + wrap) / (1.0 + wrap));
  let sun = G.sunCol.rgb * sh;
  let ll = localLights(wp, n, 0.15) + lampLight(p, 0.0);
  var col = alb * (sun * dif + ambient(n) * ao + ll);
  // subsurface-ish glow on shadow terminator
  col += alb * G.sunCol.rgb * sh * vec3f(0.3, 0.5, 0.8) * 0.06 * saturate(1.0 - abs(ndl) * 4.0) * snowy;
  let Hh = normalize(L + v);
  let ndh = saturate(dot(n, Hh));
  col += sun * pow(ndh, 36.0) * (0.05 + 0.5 * pow(1.0 - ndv, 4.0)) * saturate(ndl * 8.0) * snowy;
  // sparkles
  let spk = sparkle(wp, v, dist) * snowy * (1.0 - smoothstep(60.0, 160.0, dist));
  col += (sun * saturate(ndl * 6.0) * G.sunCol.a + ll * 0.6) * spk * (0.6 + 5.0 * pow(ndh, 6.0)) * 3.0;

  // lake ice + open creek water
  let icy = mt.r * icePatch(p) * (1.0 - max(groomed, imp));
  let water = smoothstep(0.55, 0.8, mt.g + (nB - 0.5) * 0.3) * (1.0 - groomed);
  let wet = max(icy, water);
  if (wet > 0.003) {
    let ni = normalize(vec3f((vn(p * 0.8) - 0.5) * 0.03, 1.0, (vn(p * 0.8 + 40.0) - 0.5) * 0.03) + vec3f(S0.x, 0.0, S0.y) * (-0.3));
    let r = reflect(-v, ni);
    let fr = 0.03 + 0.97 * pow(1.0 - saturate(dot(ni, v)), 5.0);
    let cr = abs(vn(p * 0.35 + 11.0) - 0.5); let cr2 = abs(vn(p * 1.3 + 5.0) - 0.5);
    let crack = (1.0 - smoothstep(0.0, 0.012, cr)) * 0.7 + (1.0 - smoothstep(0.0, 0.02, cr2)) * 0.25;
    var ic = mix(vec3f(0.015, 0.07, 0.11), vec3f(0.05, 0.16, 0.2), vn(p * 0.06 + 3.0));
    ic = mix(ic, vec3f(0.55, 0.7, 0.78), crack * (1.0 - smoothstep(40.0, 140.0, dist)) + 0.1 * vn(p * 9.0));
    ic = mix(ic, vec3f(0.006, 0.012, 0.018), water);
    var c2 = ic * (sun * saturate(dot(ni, L)) + ambient(ni) + ll) + skyBase(r) * fr * mix(0.8, 1.0, sh);
    c2 += sun * pow(saturate(dot(ni, Hh)), 400.0) * 6.0;
    col = mix(col, c2, wet);
  }
  return vec4f(applyFog(col, wp), 1.0);
}
