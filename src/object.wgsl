struct OV { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) uv: vec2f, @location(4) @interpolate(flat) mat: u32, @location(5) lp: vec3f, @location(6) @interpolate(flat) aux: f32 };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) cm: vec4f, @location(3) up: vec4f) -> OV {
  let d = objDeform(pos, nrm, cm, up);
  var o: OV;
  o.wp = d.wp; o.n = d.n; o.lp = d.lp; o.col = cm.rgb; o.uv = up.xy; o.mat = u32(cm.w + 0.5); o.aux = 0.0;
  o.pos = G.viewProj * vec4f(d.wp, 1.0);
  return o;
}
@fragment fn fs(in: OV, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(in.n); if (!ff) { n = -n; }
  let wp = in.wp;
  let V = G.camPos.xyz - wp; let dist = length(V); let v = V / dist;
  var alb = in.col; var spec = 0.04; var gloss = 24.0; var emis = vec3f(0.0); var snowy = 0.0; var refl = 0.0;
  let nlp = abs(cross(dpdx(in.lp), dpdy(in.lp))) * vec3f(1.0, 1.13, 0.89); // the face's dominant axis in part space (for the vehicle paint; weighted so a 45 degree chamfer does not flicker between two planes; derivatives must be taken here, in uniform control flow)
  let m = in.mat; let uv = in.uv; let isG = OB.tr.w;
  let night = G.misc.x;
  if (m == 0u) { spec = 0.14; gloss = 70.0; refl = 0.16; }
  if (m == 1u || m == 17u) { // boards: vertical (1) or horizontal cladding (17)
    var q = uv; if (m == 17u) { q = uv.yx; }
    let bw = 0.15; let bi = floor(q.x / bw); let bf = fract(q.x / bw);
    let g = vn(vec2f(q.x * 9.0, q.y * 0.9 + bi * 7.0)) * 0.6 + vn(vec2f(q.x * 40.0, q.y * 2.0 + bi * 3.0)) * 0.4;
    alb *= 0.75 + 0.4 * g + 0.12 * (ihash(vec2i(i32(bi), 3)) - 0.5);
    alb *= smoothstep(0.0, 0.07, bf) * smoothstep(1.0, 0.93, bf) * 0.5 + 0.5;
    snowy = 1.0;
  }
  else if (m == 2u) { alb = vec3f(0.93, 0.95, 0.98); }
  else if (m == 3u) { alb *= 0.7 + 0.5 * fbm3(wp.xz * 1.3 + wp.y * 2.1); snowy = 1.0; }
  else if (m == 30u) { // bridge concrete (uv in metres): mottled, formwork panel joints, rain streaks down the faces
    alb *= 0.74 + 0.4 * fbm3(wp.xz * 0.7 + wp.y * 1.3);
    let pj = min(abs(fract(uv.x / 2.4) - 0.5), abs(fract(uv.y / 1.2) - 0.5)); alb *= 1.0 - 0.18 * (1.0 - smoothstep(0.47, 0.49, 0.5 - pj));
    alb *= 0.86 + 0.14 * smoothstep(0.25, 0.7, vn(vec2f(uv.x * 2.7, wp.y * 0.25)));
    spec = 0.03; gloss = 14.0; snowy = 1.0;
  }
  else if (m == 4u) { spec = 0.05; gloss = 300.0; refl = 1.0; emis = vec3f(1.0, 0.7, 0.4) * 0.003 * night * isG; }
  else if (m == 5u) { spec = 0.2; gloss = 40.0; snowy = 1.0 - isG; }
  else if (m == 6u) { emis = in.col * (0.03 + night) * 16.0; alb = vec3f(0.8); }
  else if (m == 7u) {
    let f = fract(uv); let mull = step(0.08, f.x) * step(f.x, 0.92) * step(0.1, f.y) * step(f.y, 0.9) * step(0.035, abs(f.x - 0.5)) * step(0.03, abs(f.y - 0.55));
    let glow = 0.6 + 0.4 * vn(floor(uv) * 3.7 + 1.0);
    emis = vec3f(1.0, 0.62, 0.26) * mull * glow * (0.06 + night * 2.6);
    alb = mix(vec3f(0.85), vec3f(0.03, 0.04, 0.06), mull); spec = 0.3 * mull; gloss = 200.0; refl = 0.5 * mull;
  }
  else if (m == 8u) { alb *= 0.75 + 0.5 * vn(wp.xz * 13.0 + wp.y * 9.0); spec = 0.005; gloss = 20.0; } // track links: dark steel, rubber pads, packed snow (vertex colours)
  else if (m == 9u) { alb = vec3f(0.028, 0.028, 0.03); }
  else if (m == 10u) { emis = in.col * (0.35 + 7.5 * night); }
  else if (m == 11u) { emis = in.col * (0.6 + 8.0 * pow(saturate(dot(n, G.l2d.xyz)), 3.0)) * (0.5 + 0.5 * night); }
  else if (m == 12u) { alb = mix(vec3f(0.11, 0.11, 0.12), vec3f(0.27, 0.25, 0.22), fbm3(wp.xz * 0.9 + wp.y * 1.7)); alb *= 0.7 + 0.6 * vn(wp.xz * 7.0 + wp.y * 5.0); snowy = 1.3; }
  else if (m == 31u) { // metro glazing: tinted glass over a ray-cast interior. uv: metres along the car, height above the rail; col.r: which way u runs, col.g: a cab bulkhead at +u.
    // col.b = 1: cab glass instead (uv: metres across, height): sky reflection with a gradient, a dark desk silhouette in the lower quarter if col.g = 1
    let amb = ambient(vec3f(0.0, 1.0, 0.0)); let rv = -v;
    alb = vec3f(0.012, 0.014, 0.017); spec = 0.1; gloss = 200.0; refl = 0.75;
    if (in.col.b > 0.5) {
      let rr = reflect(rv, n); let sky = mix(vec3f(0.85, 0.88, 0.95) * amb * 0.6, skyBase(rr), smoothstep(-0.08, 0.04, rr.y));
      let gy = smoothstep(1.5, 3.4, uv.y); let desk = in.col.g * (1.0 - smoothstep(-0.015, 0.03, uv.y - 1.93 - 0.07 * cos(uv.x * 2.4)));
      emis = sky * mix(0.04, 0.17, gy) + amb * vec3f(0.05, 0.052, 0.058) * (1.0 - desk) * (1.0 - 0.6 * gy);
    } else {
      let tu = normalize(cross(vec3f(0.0, 1.0, 0.0), n));
      let ru = dot(rv, tu) * select(1.0, -1.0, in.col.r > 0.5); let rus = select(-1.0, 1.0, ru > 0.0); let rua = max(abs(ru), 1e-4);
      let rd = max(-dot(rv, n), 0.03); let ry = rv.y;
      var tb = 2.95 / rd; var hk = 0; // the far wall, then floor or ceiling, an end wall, seat backs, cushions
      let tf = select((3.28 - uv.y) / max(ry, 1e-4), (1.12 - uv.y) / min(ry, -1e-4), ry < 0.0);
      if (tf < tb) { tb = tf; hk = select(2, 1, ry < 0.0); }
      let te = (select(-8.9, select(8.9, 6.45, in.col.g > 0.5), ru > 0.0) - uv.x) * rus / rua;
      if (te < tb) { tb = te; hk = 3; }
      let u0 = round(uv.x / 0.82) * 0.82; // seat backs: slabs 0.1 m thick every 0.82 m, 1.1 m high, two seats either side of the aisle, none in the vestibules
      if (abs(uv.x - u0) < 0.05 && uv.y < 2.2 && min(abs(u0), abs(abs(u0) - 5.5)) > 1.0) { tb = 0.0; hk = 4; }
      for (var i = 0; i < 4; i++) {
        let uc = u0 + f32(i) * rus * 0.82; let t = (uc - rus * 0.05 - uv.x) * rus / rua;
        if (t > 0.0 && t < tb) { let yy = uv.y + ry * t; let dd = rd * t; if (yy < 2.2 && (dd < 1.0 || dd > 1.95) && min(abs(uc), abs(abs(uc) - 5.5)) > 1.0) { tb = t; hk = 4; } }
      }
      if (ry < 0.0 && uv.y > 1.62) { let t = (1.62 - uv.y) / ry; if (t < tb) { let dd = rd * t; let uu = uv.x + ru * t; if ((dd < 1.0 || dd > 1.95) && min(abs(uu), abs(abs(uu) - 5.5)) > 1.0) { tb = t; hk = 5; } } }
      { let t = 1.95 / rd; if (t < tb) { let uu = uv.x + ru * t; if (uv.y + ry * t < select(1.62, 2.2, abs(uu - round(uu / 0.82) * 0.82) < 0.05) && min(abs(uu), abs(abs(uu) - 5.5)) > 1.0) { tb = t; hk = 7; } } }
      let hu = uv.x + ru * tb; let hy = uv.y + ry * tb; let hd = rd * tb; let da = min(abs(hu), abs(abs(hu) - 5.5));
      let px = 0.0012 * (dist + tb); let fu = px * (1.0 + rua / rd); // a pixel's footprint in metres (no derivatives in this branch): thin features are faded, not point-sampled
      var ic = vec3f(0.46, 0.47, 0.48); var strip = 0.0; var thru = 0.0;
      if (hk == 0) { // far side: windows 1.05 m wide between 0.25 m pillars, door windows in the vestibules
        let wb = saturate((0.525 - abs(fract(hu / 1.3) - 0.5) * 1.3) / fu + 0.5);
        thru = select(step(2.03, hy) * step(hy, 2.89) * wb, step(abs(da - 0.365), 0.235) * step(1.5, hy) * step(hy, 2.87), da < 0.8);
        ic = mix(ic, vec3f(0.36, 0.37, 0.38), step(da, 0.75));
      } else if (hk == 1) { ic = vec3f(0.1, 0.1, 0.11); }
      else if (hk == 2) { ic = vec3f(0.6); strip = step(abs(abs(hd - 1.475) - 0.75), 0.11); }
      else if (hk == 3) { ic = vec3f(0.3, 0.31, 0.33); }
      else if (hk == 4) { ic = vec3f(0.065, 0.095, 0.17) * (1.0 - 0.45 * step(abs(abs(hd - 1.475) - 0.96), 0.025)); }
      else if (hk == 7) { ic = vec3f(0.04, 0.055, 0.1); }
      else { ic = vec3f(0.055, 0.08, 0.145); }
      let lamp = vec3f(1.0, 0.86, 0.68); let li = amb * 0.5 + lamp * (0.04 + 0.45 * night);
      var ci = ic * li * (0.35 + 0.65 * smoothstep(1.1, 2.9, hy)) + lamp * strip * (0.5 + 2.2 * night);
      ci = mix(ci, mix(vec3f(0.85, 0.88, 0.95) * amb, skyBase(rv), smoothstep(-0.08, 0.04, ry)) * 0.5, thru);
      if (ry < 0.0 && uv.y > 2.2) { // seat-back tops: composited with their coverage, they are thin at grazing angles
        let t = (2.2 - uv.y) / ry; if (t < tb) { let dd = rd * t; let uu = uv.x + ru * t; let fw = 0.0012 * (dist + t) * (1.0 + rua / max(-ry, 0.02));
          let cov = mix(saturate((0.05 - abs(uu - round(uu / 0.82) * 0.82)) / fw + 0.5), 0.12, saturate(fw / 0.4));
          if ((dd < 1.0 || dd > 1.95) && min(abs(uu), abs(abs(uu) - 5.5)) > 1.0) { ci = mix(ci, vec3f(0.08, 0.11, 0.19) * li * 0.8, cov); } } }
      for (var j = 0; j < 2; j++) { // yellow grab poles at the vestibule corners and a handrail along the seat blocks, on the two aisle-side planes
        let t = select(1.0, 1.95, j == 1) / rd; if (t < tb) { let uu = uv.x + ru * t; let yy = uv.y + ry * t; let fy = 0.0012 * (dist + t) * (1.0 + abs(ry) / rd); let f2 = 0.0012 * (dist + t) * (1.0 + rua / rd);
          let pole = saturate((0.018 - abs(min(abs(uu), abs(abs(uu) - 5.5)) - 0.98)) / f2 + 0.5) * min(1.0, 0.036 / f2) * step(yy, 3.28) * step(1.12, yy);
          let rail = saturate((0.015 - abs(yy - 3.02)) / fy + 0.5) * min(1.0, 0.03 / fy);
          ci = mix(ci, vec3f(0.75, 0.58, 0.05) * li, max(pole, rail)); } }
      emis = ci * 0.34;
    }
  }
  else if (m == 32u) { spec = 0.05; gloss = 30.0; refl = 0.06; alb *= 1.0 - 0.5 * saturate(dot(n, G.sunDir.xyz)); } // coach paint (the metro cars): satin, and held back where it faces a low sun squarely, so a sunlit side keeps its panel lines instead of clipping to white
  else if (m == 13u) { // sign board: text-ish bars
    let f = uv; let row = floor(f.y * 3.0); let rf = fract(f.y * 3.0);
    let ink = step(0.3, rf) * step(rf, 0.7) * step(0.12, f.x) * step(f.x, 0.5 + 0.35 * ihash(vec2i(i32(row), i32(in.col.r * 91.0)))) * step(0.35, vn(vec2f(f.x * 46.0, row * 9.0 + in.col.g * 50.0)));
    alb = mix(alb, vec3f(0.92), ink); snowy = 1.0;
  }
  else if (m == 14u) { // turned wheel of a tracked vehicle (uv = radius fraction times (cos, sin); 3 = plain): matt paint, a ring of bolts, dirt and snow in the dish, a matt black tyre beyond 0.76
    let r = length(uv); spec = 0.006; gloss = 12.0;
    alb *= 0.8 + 0.35 * vn(in.lp.yz * 9.0);
    if (r > 0.76 && r < 1.5) { alb = vec3f(0.011, 0.011, 0.012) * (0.8 + 0.5 * vn(in.lp.yz * 23.0 + in.lp.x * 31.0)); spec = 0.004; }
    else if (r < 1.5) {
      var a = 0.0; if (r > 0.001) { a = atan2(uv.y, uv.x); }
      let bd = length(vec2f(r - 0.31, (fract(a * 1.5915 + 0.5) - 0.5) * 0.628 * r));
      alb *= 0.45 + 0.55 * smoothstep(0.025, 0.04, bd);
      let dish = smoothstep(0.36, 0.5, r) * (1.0 - smoothstep(0.68, 0.76, r));
      alb = mix(alb, vec3f(0.035, 0.033, 0.03), 0.5 * dish * smoothstep(0.3, 0.7, vn(in.lp.yz * 17.0 + 3.0)));
      alb = mix(alb, vec3f(0.5, 0.52, 0.55), 0.35 * dish * smoothstep(0.5, 0.8, vn(in.lp.yz * 7.0 + in.lp.x * 3.0)));
    }
  }
  else if (m == 15u) { alb = mix(vec3f(0.07, 0.07, 0.075), vec3f(0.3, 0.035, 0.03), smoothstep(3.75, 3.9, uv.y)); alb *= 0.8 + 0.2 * step(0.5, fract(uv.x * 23.0)); alb = mix(alb, vec3f(0.92), smoothstep(3.95, 4.12, uv.y) * 0.6); }
  else if (m == 16u) { alb = vec3f(0.04); }
  else if (m == 19u) { alb = vec3f(0.004); spec = 0.0; }
  else if (m == 20u) { // dead-matt dusty olive with whitewash swabbed on in strokes (fixed to the part; the green channel seeds the strokes per panel group)
    let lp = in.lp; let up = saturate(n.y); let seed = fract(in.col.g * 9000.0 + 0.37) * 37.0;
    // each face is painted in its own plane (hard switch on the local normal), so every face gets the same brushed strokes
    var pp = lp.xz; var side = 0.0;
    if (nlp.x > nlp.y && nlp.x >= nlp.z) { pp = vec2f(lp.z, lp.y + 11.0); side = 1.0; } else if (nlp.z > nlp.y) { pp = vec2f(lp.x + 23.0, lp.y + 5.0); side = 1.0; }
    alb = mix(alb, vec3f(dot(alb, vec3f(0.3, 0.55, 0.15))), 0.18) * 0.85;
    alb *= 0.82 + 0.3 * vn(pp * 3.1 + seed);
    alb = mix(alb, vec3f(0.12, 0.115, 0.095), 0.22 * vn(pp * 1.3 + 3.0));
    let drip = vn(vec2f(pp.x * 17.0, pp.y * 1.3)) * 0.6 + vn(vec2f(pp.x * 5.3 + 3.0, pp.y * 0.7)) * 0.4; // vertical runs on the standing plates
    alb *= 1.0 - 0.13 * side * smoothstep(0.45, 0.8, drip);
    // whitewash: two sets of strokes on jittered grids (broad swabs at about 35 degrees, a sparser set crossing them), each a capsule with its
    // own direction, length and width, a ragged edge and bristle streaks along the stroke; denser at the front than at the sooty rear
    let cover = mix(0.6, 0.42, smoothstep(-3.0, 3.5, lp.z));
    var wash = 0.0;
    for (var st = 0; st < 2; st++) {
      let cs = select(0.9, 1.25, st == 1); let g = pp / cs + seed + f32(st) * 13.7; let c0 = floor(g - 0.5);
      for (var k = 0; k < 4; k++) {
        let cell = c0 + vec2f(f32(k & 1), f32(k >> 1));
        let h = ihash(vec2i(cell) + vec2i(st * 57, 19)); let h2 = fract(h * 91.7); let h3 = fract(h * 357.3); let h4 = fract(h * 1731.1); let h5 = fract(h * 7919.3);
        if (h > cover * select(1.25, 0.75, st == 1)) { continue; }
        let d = (g - cell - 0.5 - (vec2f(h2, h3) - 0.5) * 0.3) * cs;
        let ang = select(0.6, 2.35, st == 1) + (h4 - 0.5) * 0.75; let dir = vec2f(cos(ang), sin(ang));
        let al = dot(d, dir); let ac = dot(d, vec2f(-dir.y, dir.x));
        let hl = cs * (0.38 + 0.28 * h5); let hw = select(0.1 + 0.2 * h2, 0.06 + 0.1 * h2, st == 1);
        let br = vn(vec2f(ac * 42.0 + h * 50.0, al * 2.4));
        let e = hw - length(vec2f(max(abs(al) - hl, 0.0), ac)) - 0.035 * (br - 0.5) - 0.03 * (vn(d * 9.0 + h * 20.0) - 0.5);
        let dry = smoothstep(hl * 0.3, hl * 1.1, abs(al));
        wash = max(wash, smoothstep(0.0, 0.014, e) * (0.62 + 0.38 * smoothstep(0.3 + 0.3 * dry, 0.55 + 0.3 * dry, br + e * 2.0)));
      }
    }
    var wear = up * smoothstep(0.45, 0.75, vn(lp.xz * 2.7 + 9.0)) * 0.7;        // walked on
    wear = max(wear, smoothstep(0.85, 0.5, lp.y) * 0.8);                          // skirt bottoms, spray from the tracks
    wear = max(wear, smoothstep(0.64, 0.8, vn(vec2f(pp.x * 2.3 + pp.y * 1.1, pp.y * 11.0 - pp.x * 3.0) + seed))); // scuffs along the hull
    wash *= 1.0 - wear;
    let soot = smoothstep(0.3, 3.2, lp.z);
    alb = mix(alb, mix(vec3f(0.76, 0.77, 0.75), vec3f(0.6, 0.58, 0.53), soot) * (0.9 + 0.12 * vn(pp * 21.0)), wash * 0.94);
    // road grime and packed snow thrown up low on the hull, a dusting of fresh snow on the level plates (not on the warm engine deck)
    let low = smoothstep(1.05, 0.25, lp.y);
    alb = mix(alb, vec3f(0.14, 0.13, 0.115), 0.45 * low * smoothstep(0.3, 0.65, vn(lp.xz * 2.3 + lp.y * 3.0)));
    alb = mix(alb, vec3f(0.66, 0.68, 0.7), 0.4 * low * smoothstep(0.4, 0.75, vn(lp.xz * 5.0 + lp.y * 6.0 + 2.0)));
    let cold = 1.0 - smoothstep(1.3, 1.9, lp.z) * smoothstep(1.75, 1.6, lp.y);
    let dust = smoothstep(0.82, 0.97, n.y) * smoothstep(0.5, 0.78, vn(lp.xz * 1.7 + 7.0) * 0.7 + 0.3 * vn(lp.xz * 5.1)) * cold;
    alb = mix(alb, vec3f(0.9, 0.92, 0.95), 0.4 * dust);
    spec = 0.01; gloss = 10.0;
  }
  else if (m == 22u) { // building rubble: broken, sooty, a dusting of snow on the tops
    alb *= 0.55 + 0.9 * fbm3(wp.xz * 1.7 + wp.y * 2.3);
    alb *= 0.7 + 0.6 * vn(wp.xz * 9.0 + wp.y * 7.0);
    alb = mix(alb, vec3f(0.012, 0.011, 0.01), smoothstep(0.5, 0.8, vn(wp.xz * 0.7 - wp.y * 0.9)) * 0.85);
    spec = 0.03; gloss = 12.0; snowy = 0.15;
  }
  else if (m == 23u) { // scorched walls and roof of a damaged building: soot, burnt-through patches that glow at night
    let hz = dot(wp.xz, vec2f(0.707, 0.707)) + dot(wp.xz, vec2f(-0.707, 0.707)) * 0.3;
    let rg = fbm3(wp.xz * 0.11 + vec2f(wp.y * 0.04, 3.0) + in.col.g * 13.0); // scorched regions
    let st = vn(vec2f(hz * 0.8, wp.y * 0.06));                                  // with streaky edges where smoke rose
    let soot = smoothstep(0.45, 0.59, rg + (st - 0.5) * 0.25); let hole = smoothstep(0.68, 0.7, rg + (vn(wp.xz * 0.9 + wp.y * 0.9) - 0.5) * 0.1);
    alb *= 0.75; alb = mix(alb, vec3f(0.02, 0.018, 0.016), soot * 0.94); alb = mix(alb, vec3f(0.003), hole);
    emis = vec3f(1.0, 0.24, 0.035) * hole * (0.015 + night * 0.2) * smoothstep(0.3, 0.8, vn(wp.xz * 2.3 + wp.y * 2.9));
    spec = 0.05 * (1.0 - soot); gloss = 20.0;
  }
  else if (m >= 24u && m <= 28u && m != 25u) { // soldier: overall 24, chest rig and straps 26, pack and boots 27, gloves 28 (pattern fixed to the part)
    let q = in.lp;
    let crease = vn(vec2f(q.y * 23.0 + q.x * 7.0, q.z * 19.0 + q.x * 11.0)) * 0.6 + vn(vec2f(q.x * 61.0 - q.y * 13.0, q.z * 57.0 + q.y * 17.0)) * 0.4;
    let weave = vn(vec2f(q.x * 260.0 + q.z * 90.0, q.y * 240.0)) - 0.5;
    alb *= (0.84 + 0.22 * crease + 0.06 * weave) * (0.9 + 0.14 * vn(vec2f(q.x * 7.0 + q.y * 3.0, q.z * 7.0 - q.y * 5.0) + in.col.r * 37.0)); // creases, weave, worn patches
    if (m == 24u) {
      let hs = (0.5 - abs(fract(q.y * 4.3) - 0.5)) / 4.3;
      let seam = 1.0 - 0.2 * (1.0 - smoothstep(0.0025, 0.006, abs(q.x))) - 0.12 * (1.0 - smoothstep(0.002, 0.005, hs));
      let gh = textureLoad(heightTex, vec2i(clamp((wp.xz + G.world.x) * 0.5, vec2f(0.0), vec2f(2047.0))), 0).r;
      let dirt = (1.0 - smoothstep(0.05, 0.5, wp.y - gh)) * (0.5 + 0.5 * vn(q.xz * 31.0 + q.y * 17.0));
      alb = mix(alb * seam, vec3f(0.48, 0.45, 0.4), dirt * 0.45);
    }
    alb = min(alb, vec3f(0.74));
    spec = select(0.025, 0.04, m == 27u); gloss = 10.0;
  }
  else if (m == 25u) { alb *= 0.92 + 0.12 * vn(in.lp.xy * 70.0); spec = 0.06; gloss = 24.0; } // soldier: face
  else if (m == 18u) { // Norwegian flag
    let f = uv; let cx = abs(f.x - 0.36); let cy = abs(f.y - 0.5);
    alb = vec3f(0.62, 0.02, 0.04);
    if (cx < 0.09 || cy < 0.125) { alb = vec3f(0.9); }
    if (cx < 0.045 || cy < 0.0625) { alb = vec3f(0.0, 0.03, 0.2); }
  }
  else if (m == 29u) { // track bed (uv = across, along in metres): concrete sleepers every 0.6 m in dark ballast, drifted over with snow in patches
    let fy = fract(uv.y / 0.6); let ax = abs(uv.x);
    let slp = (1.0 - smoothstep(0.11, 0.135, abs(fy - 0.5))) * (1.0 - smoothstep(1.25, 1.3, ax));
    let grav = vn(wp.xz * 9.0) * 0.6 + vn(wp.xz * 31.0) * 0.4;
    alb = mix(vec3f(0.075, 0.068, 0.06) * (0.55 + 0.9 * grav), vec3f(0.4, 0.39, 0.37) * (0.85 + 0.3 * vn(uv * vec2f(4.0, 19.0))), slp);
    let cover = smoothstep(0.14, 0.56, fbm3(wp.xz * 0.33) + 0.35 * (vn(wp.xz * 3.1) - 0.5) - 0.22 * slp + 0.35 * smoothstep(1.2, 1.9, ax) - 0.1 * (1.0 - smoothstep(0.6, 0.85, ax)));
    alb = mix(alb, vec3f(0.93, 0.95, 0.98), cover); spec = 0.03; gloss = 12.0;
  }
  else if (m == 21u) { // Russian protective green: matt; streaks, slush thrown up the lower hull, thin snow on the level plates and ledges
    let lp = in.lp; let side = 1.0 - abs(n.y); let hz = lp.x + lp.z;
    alb *= 0.84 + 0.3 * vn(lp.xz * 3.7 + lp.y * 5.3);
    alb *= 1.0 - 0.14 * side * smoothstep(0.45, 0.9, vn(vec2f(hz * 8.0, lp.y * 1.2)));
    let low = smoothstep(1.3, 0.4, lp.y) * side;
    alb = mix(alb, vec3f(0.085, 0.075, 0.062), 0.75 * low * smoothstep(0.2, 0.65, vn(vec2f(hz * 1.7, lp.y * 4.5) + 3.0) + 0.6 * low - 0.3));
    alb = mix(alb, vec3f(0.4, 0.4, 0.39), 0.35 * smoothstep(0.7, 0.3, lp.y) * side * smoothstep(0.45, 0.8, vn(vec2f(hz * 6.0, lp.y * 9.0) + 2.0)));
    let dust = smoothstep(0.8, 0.97, n.y) * smoothstep(0.5, 0.7, fbm3(lp.xz * 1.3 + 5.0));
    alb = mix(alb, vec3f(0.85, 0.87, 0.9), 0.6 * dust);
    spec = 0.022 * (1.0 - dust); gloss = 10.0;
  }
  if (OB.tr.z > 0.0) { alb = mix(alb, vec3f(0.012, 0.011, 0.01) * (0.6 + 0.8 * vn(in.lp.xz * 3.0 + in.lp.y * 2.0)), OB.tr.z * 0.93); spec *= 1.0 - OB.tr.z; refl *= 1.0 - OB.tr.z; emis *= 1.0 - OB.tr.z; }
  // snow settling on upward faces
  let sn = smoothstep(0.5, 0.78, n.y + (vn(wp.xz * 2.3 + wp.y) - 0.5) * 0.35) * min(snowy, 1.0) + max(snowy - 1.0, 0.0) * smoothstep(0.1, 0.5, n.y + (vn(wp.xz * 1.1) - 0.5) * 0.5);
  alb = mix(alb, vec3f(0.93, 0.95, 0.98), saturate(sn));
  spec = mix(spec, 0.03, saturate(sn));

  // bilinear ground height: the nearest texel jumps 1-2 m per 2 m on a slope, which showed as light and dark squares on stand treads lying just above it
  let hf = clamp((wp.xz + G.world.x) * 0.5 - 0.5, vec2f(0.0), vec2f(2046.0)); let tx = vec2i(floor(hf)); let hw = hf - floor(hf);
  let hgt = mix(mix(textureLoad(heightTex, tx, 0).r, textureLoad(heightTex, tx + vec2i(1, 0), 0).r, hw.x), mix(textureLoad(heightTex, tx + vec2i(0, 1), 0).r, textureLoad(heightTex, tx + vec2i(1, 1), 0).r, hw.x), hw.y);
  let hAbove = max(wp.y - hgt, 0.0);
  let L = G.sunDir.xyz;
  let ndl = saturate(dot(n, L));
  if (isG < 0.5 && m != 30u) { let sf = sightFade(wp); if (sf < 0.999 && sf < 0.15 + 0.85 * ihash(vec2i(in.pos.xy))) { discard; } }
  if (G.groom.w > 0.5) { // thermal sight: heated houses, hot engine deck and running gear, burning wrecks
    var th = 0.24;
    if (m == 2u) { th = 0.1; } else if (m == 24u || m == 26u) { th = mix(0.15, select(0.78, 0.66, m == 26u) - 0.2 * (1.0 - smoothstep(0.3, 1.1, hAbove)), in.aux); } else if (m == 27u) { th = mix(0.13, 0.4, in.aux); } else if (m == 28u) { th = mix(0.15, 0.95, in.aux); } else if (m == 25u) { th = mix(0.17, 1.05, in.aux); } else if (m == 7u) { th = 0.42; } else if (m == 6u || m == 10u) { th = 0.9; } else if (m == 12u || m == 22u) { th = 0.15; } else if (m == 23u) { th = 0.32; }
    if (isG > 0.5) {
      th = 0.36 + 0.1 * vn(in.lp.xz * 2.1 + in.lp.y * 3.0);
      if (m == 8u || m == 9u || m == 14u) { th = 0.8; }
      if (m >= 24u && m <= 28u) { th = select(select(select(0.74, 0.4, m == 27u), 0.95, m == 28u), 1.05, m == 25u); } // riders baked into a vehicle mesh are warm bodies
      th += 1.2 * smoothstep(0.7, 1.9, in.lp.z) * smoothstep(0.7, 1.1, in.lp.y) * smoothstep(1.75, 1.55, in.lp.y);
      th = mix(th, 1.0 + 0.9 * vn(in.lp.xz * 1.7 + in.lp.y * 2.0), OB.tr.z);
    }
    return vec4f(thermal(mix(th, 0.1, saturate(sn)), wp), 1.0);
  }
  let sh = shadowSunS(wp, n, dist, 3) * terrainShadow(wp.xz, hAbove);
  let sun = G.sunCol.rgb * sh;
  let ll = localLights(wp, n, 0.0) + lampLight(wp.xz, hAbove) * (0.5 + 0.5 * saturate(n.y + 0.6));
  var col = alb * (sun * ndl + ambient(n) * select(0.55 + 0.45 * saturate(hAbove * 0.5), 1.0, (m == 2u && n.y > 0.7) || (m == 29u && n.y > 0.3)) + ll) + emis;
  if (m == 20u || m == 21u || m == 8u || m == 14u) { col += alb * (G.sunCol.rgb * saturate(L.y) * 0.75 + ambient(vec3f(0.0, 1.0, 0.0))) * vec3f(0.9, 0.93, 1.0) * (4.0 * (1.0 - 0.8 * sh * saturate(ndl * 2.0)) * (0.62 - 0.38 * n.y)); } // vehicles: light bounced off the snow fills the shaded sides (far stronger than the sky term alone, which left them black against the snow)
  let Hh = normalize(L + v);
  col += sun * spec * pow(saturate(dot(n, Hh)), gloss) * ndl * 4.0;
  if (refl > 0.0) {
    let fr = 0.04 + 0.96 * pow(1.0 - saturate(dot(n, v)), 5.0);
    let rr = reflect(-v, n);
    let env = mix(vec3f(0.85, 0.88, 0.95) * (ambient(vec3f(0.0, 1.0, 0.0)) + G.sunCol.rgb * 0.2), skyBase(rr), smoothstep(-0.08, 0.04, rr.y));
    col = mix(col, env, fr * refl);
  }
  return vec4f(applyFog(col, wp), 1.0);
}
