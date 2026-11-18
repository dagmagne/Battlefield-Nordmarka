// Converts the Sketchfab FPV strike drone (GLB, CC BY 4.0, see tools/assets/CREDITS.md) into the game's compact model format:
// simplified geometry with the four rotors as separate spinning parts, plus two 512 px WebP textures.
//   src/data/fpv.bin    'MDL1' model (see src/model.js for the layout)
//   src/data/fpv_a.webp albedo (RGB)
//   src/data/fpv_n.webp normal map XY in RG, specular in B
// usage: node tools/assets/fpv.mjs <source.glb> [--tris 6000] [--rotor 300] [--scale 1.25] [--err 0.02] [--noflip]
// The source file is not in the repo (like the sound sources).
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptSimplifier as MS } from 'meshoptimizer';
import { chromium } from 'playwright-core';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const SRC = process.argv[2], TRIS = arg('--tris', 6000), RTRIS = arg('--rotor', 300), S = arg('--scale', 1.25), ERR = arg('--err', 0.02), FLIP = !process.argv.includes('--noflip'); // flipped: the warhead's nose and the camera face -z, the game's forward
if (!SRC || SRC.startsWith('--')) { console.log('usage: node tools/assets/fpv.mjs <source.glb> [--tris N] [--rotor N] [--scale k] [--err e] [--noflip]'); process.exit(1); }
await MS.ready;

// ---- GLB ----
const b = readFileSync(SRC), jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString()), bin = b.slice(20 + jl + 8);
const acc = (i) => { const a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array, st = bv.byteStride || n * C.BYTES_PER_ELEMENT, dv = new DataView(bin.buffer, bin.byteOffset);
  const o = new C(a.count * n); for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const p = off + k * st + c * C.BYTES_PER_ELEMENT; o[k * n + c] = C === Float32Array ? dv.getFloat32(p, true) : C === Uint32Array ? dv.getUint32(p, true) : dv.getUint16(p, true); } return o; };
const img = (t) => { const im = J.images[J.textures[t].source], bv = J.bufferViews[im.bufferView]; return `data:${im.mimeType};base64,` + bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength).toString('base64'); };
const M0 = J.materials[0].extensions.KHR_materials_pbrSpecularGlossiness;
const TEX = { alb: img(M0.diffuseTexture.index), spec: img(M0.specularGlossinessTexture.index), nrm: img(J.materials[0].normalTexture.index) };

// ---- merge the material-0 meshes; the root node turns Z-up into Y-up: (x, y, z) -> (x, z, -y) ----
const P = [], N = [], T = [], I = [];
J.meshes.forEach((m) => { for (const pr of m.primitives) { if (pr.material !== 0) continue; // the two tiny extra materials are dropped
  const p = acc(pr.attributes.POSITION), n = acc(pr.attributes.NORMAL), t = acc(pr.attributes.TEXCOORD_0), ix = acc(pr.indices), base = P.length / 3, f = FLIP ? -1 : 1;
  for (let k = 0; k < p.length / 3; k++) { P.push(p[k * 3] * S * f, p[k * 3 + 2] * S, -p[k * 3 + 1] * S * f); N.push(n[k * 3] * f, n[k * 3 + 2], -n[k * 3 + 1] * f); T.push(t[k * 2], t[k * 2 + 1]); }
  for (const v of ix) I.push(v + base); } });
console.log(`source: ${P.length / 3} vertices, ${I.length / 3} triangles`);

// ---- rotors: the motor bell and propeller above the arm plane round each hub (hub order as droneParts: i&1 -> +x, i&2 -> +z) ----
const HUB = [], RR = 0.098 * S;
for (let i = 0; i < 4; i++) { const sx = i & 1 ? 1 : -1, sz = i & 2 ? 1 : -1; let mn = [1e9, 1e9], mx = [-1e9, -1e9];
  for (let k = 0; k < P.length / 3; k++) { const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2]; if (Math.sign(x) !== sx || Math.sign(z) !== sz || Math.abs(x) < 0.06 * S || y < 0) continue;
    mn = [Math.min(mn[0], x), Math.min(mn[1], z)]; mx = [Math.max(mx[0], x), Math.max(mx[1], z)]; }
  HUB.push((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2); }
const partOf = (a, b2, c) => { const cx = (P[a * 3] + P[b2 * 3] + P[c * 3]) / 3, cy = (P[a * 3 + 1] + P[b2 * 3 + 1] + P[c * 3 + 1]) / 3, cz = (P[a * 3 + 2] + P[b2 * 3 + 2] + P[c * 3 + 2]) / 3;
  if (cy < -0.002 * S) return 0; for (let i = 0; i < 4; i++) if (Math.hypot(cx - HUB[i * 2], cz - HUB[i * 2 + 1]) < RR) return i + 1; return 0; };
const parts = [[], [], [], [], []]; for (let t = 0; t < I.length; t += 3) parts[partOf(I[t], I[t + 1], I[t + 2])].push(I[t], I[t + 1], I[t + 2]);

// ---- simplify each part on its own (uv and normal seams weighted), then gather the used vertices ----
const nv0 = P.length / 3, POS = new Float32Array(P), ATT = new Float32Array(nv0 * 5);
for (let k = 0; k < nv0; k++) ATT.set([T[k * 2], T[k * 2 + 1], N[k * 3] * 0.5, N[k * 3 + 1] * 0.5, N[k * 3 + 2] * 0.5], k * 5);
const outV = [], outI = [], remap = new Map();
parts.forEach((ix, pi) => { if (!ix.length) return; const want = (pi ? RTRIS : TRIS) * 3;
  const [si, err] = MS.simplifyWithAttributes(new Uint32Array(ix), POS, 3, ATT, 5, [0.5, 0.5, 0.2, 0.2, 0.2], null, Math.min(want, ix.length), ERR, ['Permissive']);
  console.log(`part ${pi}: ${ix.length / 3} -> ${si.length / 3} triangles (error ${(err * 100).toFixed(2)} % of the extent)`);
  for (const v of si) { const key = v * 8 + pi; let o = remap.get(key); if (o === undefined) { o = outV.length; remap.set(key, o); outV.push([v, pi]); } outI.push(o); } });

// ---- write the model: header, quantised vertices, indices ----
const nv = outV.length, ni = outI.length, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const [v] of outV) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], P[v * 3 + c]); mx[c] = Math.max(mx[c], P[v * 3 + c]); }
let u0 = 1e9, u1 = -1e9; for (const [v] of outV) for (let c = 0; c < 2; c++) { u0 = Math.min(u0, T[v * 2 + c]); u1 = Math.max(u1, T[v * 2 + c]); }
const HDR = 4 + 4 * 2 + 4 * 6 + 4 * 2 + 4 * 8, VS = 16, buf = Buffer.alloc(HDR + nv * VS + ni * (nv < 65536 ? 2 : 4));
let o = 0; buf.write('MDL1', 0); o = 4; buf.writeUInt32LE(nv, o); buf.writeUInt32LE(ni, o + 4); o += 8;
for (const v of [...mn, ...mx, u0, u1, ...HUB]) { buf.writeFloatLE(v, o); o += 4; }
const q16 = (v, a, z) => Math.round(((v - a) / Math.max(z - a, 1e-6)) * 65535), HEAT = [0.32, 0.85, 0.85, 0.85, 0.85]; // thermal: frame and battery lukewarm, the motors hot
for (const [v, pi] of outV) { buf.writeUInt16LE(q16(P[v * 3], mn[0], mx[0]), o); buf.writeUInt16LE(q16(P[v * 3 + 1], mn[1], mx[1]), o + 2); buf.writeUInt16LE(q16(P[v * 3 + 2], mn[2], mx[2]), o + 4);
  const nl = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; for (let c = 0; c < 3; c++) buf.writeInt8(Math.round(N[v * 3 + c] / nl * 127), o + 6 + c);
  buf.writeUInt8(pi, o + 9); buf.writeUInt16LE(q16(T[v * 2], u0, u1), o + 10); buf.writeUInt16LE(q16(T[v * 2 + 1], u0, u1), o + 12); buf.writeUInt8(Math.round(HEAT[pi] * 255), o + 14); buf.writeUInt8(0, o + 15); o += VS; }
for (const i of outI) { if (nv < 65536) { buf.writeUInt16LE(i, o); o += 2; } else { buf.writeUInt32LE(i, o); o += 4; } }
writeFileSync('src/data/fpv.bin', buf);
console.log(`model: ${nv} vertices, ${ni / 3} triangles, ${buf.length} bytes; hubs ${HUB.map((v) => v.toFixed(3)).join(' ')}; extent ${mn.map((v) => v.toFixed(2))} .. ${mx.map((v) => v.toFixed(2))}`);

// ---- textures: resize to 512 and encode WebP in Chrome (canvas); the normal map carries the specular level in B ----
const br = await chromium.launch({ channel: 'chrome', headless: true }), pg = await br.newPage();
const out = await pg.evaluate(async (tx) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [a, s, n] = await Promise.all([load(tx.alb), load(tx.spec), load(tx.nrm)]), R = 512;
  const cv = (im) => { const c = document.createElement('canvas'); c.width = c.height = R; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, R, R); return [c, g]; };
  const [ca] = cv(a), [cn, gn] = cv(n), [, gs] = cv(s), dn = gn.getImageData(0, 0, R, R), ds = gs.getImageData(0, 0, R, R);
  for (let k = 0; k < R * R; k++) { const sp = (ds.data[k * 4] + ds.data[k * 4 + 1] + ds.data[k * 4 + 2]) / 3; dn.data[k * 4 + 2] = sp; dn.data[k * 4 + 3] = 255; }
  gn.putImageData(dn, 0, 0);
  return { a: ca.toDataURL('image/webp', 0.86), n: cn.toDataURL('image/webp', 0.92), sz: [a.width, n.width] };
}, TEX);
await br.close();
for (const [k, f] of [['a', 'src/data/fpv_a.webp'], ['n', 'src/data/fpv_n.webp']]) { const d = Buffer.from(out[k].split(',')[1], 'base64'); writeFileSync(f, d); console.log(`${f}: ${d.length} bytes (source ${out.sz[k === 'a' ? 0 : 1]} px)`); }
