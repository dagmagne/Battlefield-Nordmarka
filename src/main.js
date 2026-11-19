import common from './common.wgsl';
import terrainW from './terrain.wgsl';
import skyW from './sky.wgsl';
import postW from './post.wgsl';
import objDefW from './objdeform.wgsl';
import objectW from './object.wgsl';
import stampW from './stamp.wgsl';
import treeDefW from './treedeform.wgsl';
import treeW from './tree.wgsl';
import shadowW from './shadow.wgsl';
import shTreeW from './shadowtree.wgsl';
import shObjW from './shadowobj.wgsl';
import tshW from './tshadow.wgsl';
import particleW from './particle.wgsl';
import soldierW from './soldier.wgsl';
import soldierShW from './soldiershadow.wgsl';
import { perspRZ, lookAt, mul, invert, ortho, clamp, lerp } from './math.js';
import { genWorld, mipChain, WS, HN, HALF, NEAR, NCN, FAR, FCN } from './world.js';
import { genFantasy } from './fantasy.js';
import { setTod, updateTod, writeTod, todIndex } from './tod.js';
import { buildLeopard, buildT72, buildBMP, buildTigr, buildBTR, buildBuggy, buildMoto, buildDrone, buildMine, buildLancet, buildOrlan, tankParts, turMat, gunMat, LEO, TRK } from './tank.js';
import { initCombat, MAXE, MAXG, MAXM, MAXA, MAXI } from './combat.js';
import { buildSoldier, initSoldiers, IST, WALK_V, RUN_V } from './soldier.js';
import { buildTrees } from './trees.js';
import { buildProps } from './props.js';
import { initBuildings, DMAX } from './buildings.js';
import { initBridges } from './bridges.js';
import { Particles } from './particles.js';
import { initUI, inp } from './ui.js';
import { initAudio } from './audio.js';
import { initHaptics } from './haptics.js';
import { REC, RECM } from './sndrec.js';
import { initMusic } from './music.js';
import TITLE from './data/title.webp';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
// title screen art and music (the music button works before the game has loaded; the in-game one goes through api.music)
$('load').style.backgroundImage = `linear-gradient(180deg,#0b142099 0%,#0b142000 30%,#0b142000 50%,#0b1420e6 100%),url(data:image/webp;base64,${TITLE})`;
const music = initMusic(qs);
music.onchange = (on) => { for (const id of ['lMu', 'bMu']) $(id).classList.toggle('on', on); };
music.onchange(music.on);
$('lMu').addEventListener('click', (e) => { e.stopPropagation(); music.toggle(); $('lMu').blur(); });
const fail = (m) => { music.sound(false); $('load').style.display = 'none'; $('ui').style.display = 'none'; $('err').style.display = 'flex'; $('errp').textContent = m; };

// ---------- quality tiers ----------
const TIERS = {
  low: { name: 'low', scale: 0.6, minScale: 0.4, msaa: 1, shadow: 1024, casc: 2, clipN: 64, mask: 2048, trees: 0.5, lodMul: 0.5, flakes: 2500, parts: 1400, maxPx: 1.8e6, aniso: 2 },
  medium: { name: 'medium', scale: 0.8, minScale: 0.5, msaa: 4, shadow: 1536, casc: 2, clipN: 96, mask: 2048, trees: 0.7, lodMul: 0.7, flakes: 6000, parts: 2600, maxPx: 2.8e6, aniso: 4 },
  high: { name: 'high', scale: 1, minScale: 0.6, msaa: 4, shadow: 2048, casc: 3, clipN: 128, mask: 4096, trees: 1, lodMul: 1, flakes: 14000, parts: 4500, maxPx: 9e6, aniso: 8 },
  ultra: { name: 'ultra', scale: 1, minScale: 0.75, msaa: 4, shadow: 4096, casc: 3, clipN: 160, mask: 4096, trees: 1, lodMul: 1.5, flakes: 22000, parts: 6000, maxPx: 16e6, aniso: 16 },
};
const isTouch = qs.has('touch') || (matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints > 0);

// globals buffer float offsets (must match common.wgsl)
const O = { viewProj: 0, invViewProj: 16, shadowMat: 32, camPos: 80, sunDir: 84, sunCol: 88, ambSky: 92, ambGnd: 96, fogCol: 100, fogSun: 104, skyZen: 108, skyHor: 112, skySun: 116, casc: 120, cascTex: 124, misc: 128, l0p: 132, l0d: 136, l0c: 140, l1p: 144, l1d: 148, l1c: 152, l2p: 156, l2d: 160, l2c: 164, world: 168, screen: 172, groom: 176, lod: 180, lod2: 184 };
const GU = new Float32Array(188);

const R = { frame: 0, time: 0, scale: 1, drs: true, snow: 0, snowAmt: 0, debug: false, manual: false, pose: null, therm: 0, thAll: false, gpuMs: 0, ft: 16.7, ftMax: 0, fovK: 1 };
const cam = { x: 0, y: 300, z: 0, yaw: 0, pitch: -0.1, fov: 55 * Math.PI / 180, mode: 0, prevMode: 0, dist: 13, zoom: 0, fovNow: 1, sightK: 0 };
// where the player is aiming: world yaw/pitch of the sight line, the point it hits, and the gun's own state
const aim = { hit: false, yaw: 0, pitch: 0, x: 0, y: 0, z: 0, range: 800, dx: 0, dy: 0, dz: -1, sx: 9, sy: 9, ready: 0, err: 1, mx: 0, my: 0, mz: 0, gx: 0, gy: 0, gz: -1 };
const veh = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0, steer: 0, throttle: 0, dist: 0, trL: 0, trR: 0, yawRate: 0, air: false, vy: 0, airT: 0, gPrev: 0, shake: 0, land: 0, turYaw: 0, gunPitch: 0, recoil: 0, dp: 0, dr: 0, tl: 0, tt: 0, dpV: 0, drV: 0, acc: 0, road: 0, hp: 100, dead: false, immob: 0 };
const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16), ivp = new Float32Array(16);
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 8) / 16777216; };

async function main() {
  if (!navigator.gpu) return fail(isSecureContext ? 'Your browser does not expose WebGPU. Use one of these:' : 'WebGPU only works on secure pages (https or localhost). Open this page over https, in one of these browsers:');
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { /* fallthrough */ }
  if (!adapter) return fail('No compatible graphics adapter was found (WebGPU may be disabled or the GPU blocklisted). Supported setups:');
  const wantTS = adapter.features.has('timestamp-query');
  // which GPU the browser actually gave us (laptops with two GPUs often hand out the integrated one)
  let gpuName = ''; try { const gi = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null); if (gi) gpuName = [gi.vendor, gi.architecture, gi.description || gi.device].filter(Boolean).join(' '); } catch (e) { /* not exposed */ }
  R.gpuName = gpuName || 'unknown GPU';
  const device = await adapter.requestDevice({ requiredFeatures: wantTS ? ['timestamp-query'] : [] });
  device.lost.then((i) => { if (i.reason !== 'destroyed') fail('The graphics device was lost (' + i.message + '). Reload the page to continue.'); });
  device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));

  // tier selection
  let store = {}; try { store = localStorage; } catch (e) { /* private mode */ }
  let pref = qs.get('q') || store.gq || 'auto';
  let tierName = pref;
  if (!TIERS[tierName]) {
    pref = 'auto';
    const mem = navigator.deviceMemory || 4, small = Math.min(screen.width, screen.height) < 380;
    // integrated Intel graphics cannot carry the high tier (measured: gen-12lp, 6 fps on high, 23 on low)
    const igpu = /intel/i.test(gpuName) ? (/gen-?\d/i.test(gpuName) ? 'low' : /lp/i.test(gpuName) ? 'medium' : '') : '';
    tierName = isTouch ? (mem < 4 || small ? 'low' : 'medium') : igpu || 'high';
  }
  const Q = TIERS[tierName]; R.Q = Q; R.scale = Q.scale;
  R.drs = qs.get('drs') !== '0' && store.gdrs !== '0';
  // tree detail (menu): high / medium / low / off. Off = not drawn, not solid, no canopy shade, no cover
  { const d = Q.name === 'low' ? 'low' : Q.name === 'medium' ? 'medium' : 'high', v = qs.has('notrees') ? 'off' : qs.get('trees') || (store.gtrees === '0' ? 'off' : store.gtrees) || d;
    R.treeSel = ['high', 'medium', 'low', 'off'].includes(v) ? v : d; R.trees = R.treeSel !== 'off'; }

  const canvas = $('c'), ctx = canvas.getContext('webgpu');
  const cfmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: cfmt, alphaMode: 'opaque' });

  const tick = (m, p) => { $('msg').textContent = m + '…'; $('bar').firstChild.style.width = (p * 100).toFixed(0) + '%'; return new Promise((r) => setTimeout(r, 0)); };
  // world choice: ?w=fantasi|holmenkollen|frogner, otherwise ask (scripted runs with ?nohint default to Frognerseteren)
  let wsel = qs.get('w') || (qs.has('nohint') ? 'frogner' : '');
  if (!wsel) { $('pick').style.display = 'flex'; $('bar').style.display = $('msg').style.display = 'none';
    wsel = await new Promise((r) => { for (const b of $('pick').children) b.onclick = () => r(b.dataset.w); });
    $('pick').style.display = 'none'; $('bar').style.display = $('msg').style.display = ''; }
  await tick('Shaping terrain', 0);
  const W = wsel === 'fantasi' ? await genFantasy(tick, Q) : await genWorld(tick, Q, wsel);
  const PLAY = W.PLAY, MW = W.MW;
  W.br = initBridges(W.brg || [], W.heightAt); W.groundAt = W.br.groundAt; W.br.shade(W.nrm, HN, HALF); // functional bridges (src/bridges.js): deck slabs over the heightfield, walls; the road under a deck is shaded
  await tick('Building scene', 0.95);

  // ---------- static textures ----------
  const U = GPUBufferUsage, RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING, CD = GPUTextureUsage.COPY_DST;
  const lin = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: Q.aniso });
  const linClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const shSmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
  const heightTex = device.createTexture({ size: [HN, HN], format: 'r32float', usage: TB | CD });
  device.queue.writeTexture({ texture: heightTex }, W.H, { bytesPerRow: HN * 4 }, [HN, HN]);
  const mkMip = (data) => {
    const chain = mipChain(data, HN), t = device.createTexture({ size: [HN, HN], format: 'rgba8unorm', usage: TB | CD, mipLevelCount: chain.length });
    chain.forEach((d, i) => { const s = HN >> i; device.queue.writeTexture({ texture: t, mipLevel: i }, d, { bytesPerRow: s * 4 }, [s, s]); });
    return t;
  };
  const normTex = mkMip(W.nrm), matTex = mkMip(W.mat);
  const tshTex = device.createTexture({ size: [1024, 1024], format: 'rg16float', usage: RA | TB });
  const maskA = device.createTexture({ size: [Q.mask, Q.mask], format: 'rgba8unorm', usage: RA | TB });
  const maskB = device.createTexture({ size: [Q.mask, Q.mask], format: 'rg16float', usage: RA | TB });
  const shadowTex = device.createTexture({ size: [Q.shadow, Q.shadow, 3], format: 'depth32float', usage: RA | TB });
  const shadowViews = [0, 1, 2].map((i) => shadowTex.createView({ dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1 }));
  { const e = device.createCommandEncoder();
    e.beginRenderPass({ colorAttachments: [{ view: maskA.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }, { view: maskB.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] }).end();
    for (const v of shadowViews) e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: v, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 } }).end();
    device.queue.submit([e.finish()]); }

  // ---------- globals ----------
  const gBuf = device.createBuffer({ size: GU.byteLength, usage: U.UNIFORM | U.COPY_DST });
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const bgl0 = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VF, buffer: {} },
    { binding: 1, visibility: VF, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
    { binding: 2, visibility: VF, sampler: { type: 'comparison' } },
    { binding: 3, visibility: VF, texture: { sampleType: 'unfilterable-float' } },
    { binding: 4, visibility: VF, texture: {} }, { binding: 5, visibility: VF, texture: {} },
    { binding: 6, visibility: VF, sampler: {} },
    { binding: 7, visibility: VF, texture: {} }, { binding: 8, visibility: VF, texture: {} }, { binding: 9, visibility: VF, texture: {} },
  ] });
  const bg0 = device.createBindGroup({ layout: bgl0, entries: [
    { binding: 0, resource: { buffer: gBuf } }, { binding: 1, resource: shadowTex.createView() }, { binding: 2, resource: shSmp },
    { binding: 3, resource: heightTex.createView() }, { binding: 4, resource: normTex.createView() }, { binding: 5, resource: matTex.createView() },
    { binding: 6, resource: lin }, { binding: 7, resource: tshTex.createView() }, { binding: 8, resource: maskA.createView() }, { binding: 9, resource: maskB.createView() },
  ] });
  const HDR = 'rgba16float', DF = 'depth32float';
  const mod = (code, label) => device.createShaderModule({ code, label });
  const msState = { count: Q.msaa };
  const mkBuf = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, (data.byteLength + 3) & ~3), usage: usage | U.COPY_DST }); device.queue.writeBuffer(b, 0, data); return b; };
  const depthGE = { format: DF, depthWriteEnabled: true, depthCompare: 'greater' };
  const bglO = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: {} }] });
  const lay01 = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglO] }), lay0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });

  // ---------- terrain clipmap ----------
  const N = Q.clipN, NL = 9;
  const tv = new Float32Array((N + 1) * (N + 1) * 2);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { tv[(j * (N + 1) + i) * 2] = i; tv[(j * (N + 1) + i) * 2 + 1] = j; }
  const mkIdx = (hole) => {
    // The hole in each coarser ring is one cell smaller than the finer level on every side. With an exact shared edge on one side,
    // NVIDIA (D3D12) left single-pixel cracks along that seam; the outer 4 fine cells are fully morphed to the coarse grid, so the overlap coincides.
    const a = [], lo = N / 4 + 2, hi = 3 * N / 4 - 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (hole && i >= lo && i <= hi && j >= lo && j <= hi) continue;
      const v = j * (N + 1) + i;
      if ((i + j) & 1) a.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2); else a.push(v, v + N + 1, v + N + 2, v, v + N + 2, v + 1);
    }
    return new Uint32Array(a);
  };
  const tvb = mkBuf(tv, U.VERTEX), tiFull = mkIdx(false), tiRing = mkIdx(true);
  const tibF = mkBuf(tiFull, U.INDEX), tibR = mkBuf(tiRing, U.INDEX);
  const lvBuf = [], lvBG = [], lvData = new Float32Array(4);
  for (let l = 0; l < NL; l++) { lvBuf[l] = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }); lvBG[l] = device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: lvBuf[l] } }] }); }
  // beyond the map edge: the real world falls away to the city and fjord in the south and rises into the forest hills in the north
  const REAL = W.name !== 'fantasy';
  const terrMod = mod(common + (REAL ? terrainW.replace(/ROADS\s*=\s*0\.0/, 'ROADS=1.0').replace('262.0', '(mix(440.0,30.0,smoothstep(-2600.0,3600.0,xz.y))+50.0*sin(xz.x*0.0011)*sin(xz.y*0.0013))') : terrainW), 'terrain');
  const terrPipe = device.createRenderPipeline({
    layout: lay01,
    vertex: { module: terrMod, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
    fragment: { module: terrMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'back', frontFace: 'ccw' }, depthStencil: depthGE, multisample: msState,
  });
  const skyMod = mod(common + (REAL ? skyW.replace('255.0', '15.0') : skyW), 'sky');
  const skyPipe = device.createRenderPipeline({
    layout: lay0, vertex: { module: skyMod, entryPoint: 'vs' }, fragment: { module: skyMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DF, depthWriteEnabled: false, depthCompare: 'equal' }, multisample: msState,
  });

  // ---------- objects (groomer + props) ----------
  const objMod = mod(common + objDefW + objectW, 'object');
  const objVB = [{ arrayStride: 56, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }, { shaderLocation: 3, offset: 40, format: 'float32x4' }] }];
  const objPipe = device.createRenderPipeline({
    layout: lay01, vertex: { module: objMod, entryPoint: 'vs', buffers: objVB }, fragment: { module: objMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'none' }, depthStencil: depthGE, multisample: msState,
  });
  const mkObj = (mesh) => {
    const u = device.createBuffer({ size: 528, usage: U.UNIFORM | U.COPY_DST }), d = new Float32Array(132);
    for (let i = 0; i < 8; i++) d[i * 16] = d[i * 16 + 5] = d[i * 16 + 10] = d[i * 16 + 15] = 1;
    device.queue.writeBuffer(u, 0, d);
    return { vb: mkBuf(mesh.v, U.VERTEX), ib: mkBuf(mesh.i, U.INDEX), n: mesh.i.length, u, d, bg: device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: u } }] }) };
  };
  const groomer = mkObj(buildLeopard()), droneO = mkObj(buildDrone());
  const propsMesh = buildProps(W), props = mkObj(propsMesh); // the CPU copy stays alive: building state changes edit and re-upload ranges of it
  const BL = initBuildings(W, propsMesh, HALF);
  BL.upload = (v0, v1) => device.queue.writeBuffer(props.vb, v0 * 56, propsMesh.v, v0 * 14, (v1 - v0) * 14);
  const debO = { vb: device.createBuffer({ size: DMAX * 24 * 56, usage: U.VERTEX | U.COPY_DST }), ib: mkBuf(BL.di, U.INDEX) }; // rubble debris boxes
  BL.debUpload = (k, n) => device.queue.writeBuffer(debO.vb, k * 24 * 56, BL.dv, k * 24 * 14, n * 24 * 14);
  // mines on the surface: MAXM copies of one small mesh in a vertex buffer; a copy is rewritten (moved or collapsed) only when a mine changes
  const mineT = buildMine(), mNV = mineT.v.length / 14, mNI = mineT.i.length, mineV = new Float32Array(MAXM * mNV * 14), mineI = new Uint32Array(MAXM * mNI);
  for (let k = 0; k < MAXM; k++) for (let j = 0; j < mNI; j++) mineI[k * mNI + j] = mineT.i[j] + k * mNV;
  const mineO = { vb: device.createBuffer({ size: mineV.byteLength, usage: U.VERTEX | U.COPY_DST }), ib: mkBuf(mineI, U.INDEX), n: 0, on: new Uint8Array(MAXM) };
  // surface: the mine lies on the snow; marked: a red-flagged picket stands beside it (a marked buried mine shows only its top)
  const mineMesh = (k, x, y, z, yaw, surface, marked) => { const o = k * mNV * 14, c = Math.cos(yaw), s = Math.sin(yaw), T = mineT.v, show = surface || marked;
    for (let j = 0; j < mNV; j++) { const a = j * 14, b = o + a; for (let q = 0; q < 14; q++) mineV[b + q] = T[a + q];
      if (j < mineT.nm ? !show : !marked) { mineV[b] = mineV[b + 1] = mineV[b + 2] = 0; continue; }
      mineV[b] = x + c * T[a] + s * T[a + 2]; mineV[b + 1] = y - (j < mineT.nm && !surface ? 0.11 : 0.03) + T[a + 1]; mineV[b + 2] = z - s * T[a] + c * T[a + 2]; mineV[b + 3] = c * T[a + 3] + s * T[a + 5]; mineV[b + 5] = -s * T[a + 3] + c * T[a + 5]; }
    device.queue.writeBuffer(mineO.vb, o * 4, mineV, o, mNV * 14); if (mineO.on[k] !== (show ? 1 : 0)) { mineO.on[k] = show ? 1 : 0; mineO.n += show ? 1 : -1; } };
  // enemy vehicles: two shared meshes, one uniform block (part matrices) per slot
  // by enemy type (T-72, BMP-2, Tigr, BTR-82A, buggy, motorcycle); the last is the T-72 with a cope cage
  const eMesh = [buildT72(), buildBMP(), buildTigr(), buildBTR(), buildBuggy(), buildMoto(), buildT72(true)].map((m) => ({ vb: mkBuf(m.v, U.VERTEX), ib: mkBuf(m.i, U.INDEX), n: m.i.length }));
  const eObj = []; for (let i = 0; i < MAXE; i++) { const u = device.createBuffer({ size: 528, usage: U.UNIFORM | U.COPY_DST }); eObj.push({ u, d: new Float32Array(132), bg: device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: u } }] }) }); }
  // enemy air units: one uniform block per slot, three meshes (FPV, Lancet, Orlan)
  const aMesh = [buildDrone(), buildLancet(), buildOrlan()].map((m) => ({ vb: mkBuf(m.v, U.VERTEX), ib: mkBuf(m.i, U.INDEX), n: m.i.length }));
  const aObj = []; for (let i = 0; i < MAXA; i++) { const u = device.createBuffer({ size: 528, usage: U.UNIFORM | U.COPY_DST }); aObj.push({ u, d: new Float32Array(132), bg: device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: u } }] }) }); }
  // collider lookup grid for projectiles (32 m cells)
  const CG = 32, NCG = Math.ceil(WS / CG), cgStart = new Uint32Array(NCG * NCG + 1); let cgItems;
  { const C = W.colliders, cnt = new Uint32Array(NCG * NCG), cell = (v) => clamp(Math.floor((v + HALF) / CG), 0, NCG - 1);
    const each = (f) => { for (let i = 0; i < C.length; i += 3) { const r = C[i + 2] + 4.5; for (let j = cell(C[i + 1] - r); j <= cell(C[i + 1] + r); j++) for (let k = cell(C[i] - r); k <= cell(C[i] + r); k++) f(j * NCG + k, i); } };
    each((c) => cnt[c]++); for (let c = 0; c < NCG * NCG; c++) cgStart[c + 1] = cgStart[c] + cnt[c];
    cgItems = new Uint32Array(cgStart[NCG * NCG]); cnt.fill(0); each((c, i) => { cgItems[cgStart[c] + cnt[c]++] = i; }); }
  // circles are listed in every cell within 4.5 m of them, so a vehicle-sized circle needs only its own cell
  const collAt = (x, z) => { const C = W.colliders, c = clamp(Math.floor((z + HALF) / CG), 0, NCG - 1) * NCG + clamp(Math.floor((x + HALF) / CG), 0, NCG - 1);
    for (let q = cgStart[c]; q < cgStart[c + 1]; q++) { const i = cgItems[q], dx = x - C[i], dz = z - C[i + 1]; if (dx * dx + dz * dz < C[i + 2] * C[i + 2]) return true; } return false; };
  // push a circle (r <= 4.5) out of the buildings and the circle colliders; out = [x, z, nx, nz, depth]; returns the contact count
  const solid = (x, z, r, out) => {
    let n = BL.push(x, z, r, out); const C = W.colliders, c = clamp(Math.floor((out[1] + HALF) / CG), 0, NCG - 1) * NCG + clamp(Math.floor((out[0] + HALF) / CG), 0, NCG - 1);
    for (let q = cgStart[c]; q < cgStart[c + 1]; q++) { const i = cgItems[q], dx = out[0] - C[i], dz = out[1] - C[i + 1], rr = C[i + 2] + r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), k = rr - d; out[0] += dx / d * k; out[1] += dz / d * k; n++; if (k > out[4]) { out[2] = dx / d; out[3] = dz / d; out[4] = k; } } }
    return n;
  };
  const SO = new Float32Array(5);
  const NP = qs.has('np');
  // ?hide=<letters> (diagnostics): leave parts of the frame out to find where a rendering fault comes from.
  // t terrain, s sky, p particles and glows, v vehicles and drone, o props, h shadow casters, x sight overlay (trees: ?trees=off)
  const HIDE = qs.get('hide') || '', hT = HIDE.includes('t'), hS = HIDE.includes('s'), hP = HIDE.includes('p'), hV = HIDE.includes('v'), hO = HIDE.includes('o') || NP, hH = HIDE.includes('h'), hX = HIDE.includes('x');

  // ---------- terrain shadow bake ----------
  const tshMod = mod(tshW, 'tshadow');
  const tshPipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: tshMod, entryPoint: 'vs' }, fragment: { module: tshMod, entryPoint: 'fs', targets: [{ format: 'rg16float' }] } });
  const tshU = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }), tshD = new Float32Array(4);
  const tshBG = device.createBindGroup({ layout: tshPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: tshU } }, { binding: 1, resource: heightTex.createView() }] });
  const tshPass = { colorAttachments: [{ view: tshTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] };
  let tshDirty = 1;

  // ---------- shadows ----------
  const NC = Q.casc, SPLITS = NC === 3 ? [26, 105, 420] : [40, 200, 200];
  const shU = [], shBG = [], shData = [], shPass = [], shPlanes = [];
  for (let i = 0; i < 3; i++) {
    shU[i] = device.createBuffer({ size: 80, usage: U.UNIFORM | U.COPY_DST }); shData[i] = new Float32Array(20); shPlanes[i] = new Float32Array(16);
    shBG[i] = device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: shU[i] } }] });
    shPass[i] = { colorAttachments: [], depthStencilAttachment: { view: shadowViews[i], depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 } };
  }
  const shDepth = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 };
  const layS = device.createPipelineLayout({ bindGroupLayouts: [bglO, bglO] });
  const objShMod = mod(shadowW + objDefW + shObjW, 'objshadow');
  const objShPipe = device.createRenderPipeline({ layout: layS, vertex: { module: objShMod, entryPoint: 'vs', buffers: objVB }, primitive: { cullMode: 'none' }, depthStencil: shDepth });

  // ---------- infantry: one instanced draw per LOD; part matrices per soldier in a storage buffer, object.wgsl shading ----------
  const bglI = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: {} }, { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }] });
  const infMod = mod(common + objDefW + objectW + soldierW, 'soldier');
  const infPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglI] }), vertex: { module: infMod, entryPoint: 'vsInf', buffers: objVB },
    fragment: { module: infMod, entryPoint: 'fs', targets: [{ format: HDR }] }, primitive: { cullMode: 'back', frontFace: 'ccw' }, depthStencil: depthGE, multisample: msState,
  });
  const infShMod = mod(shadowW + soldierShW, 'soldiershadow');
  const infShPipe = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglO, bglI] }), vertex: { module: infShMod, entryPoint: 'vs', buffers: objVB }, primitive: { cullMode: 'none' }, depthStencil: shDepth });
  const infMesh = [buildSoldier(0), buildSoldier(1)].map((m) => ({ vb: mkBuf(m.v, U.VERTEX), ib: mkBuf(m.i, U.INDEX), n: m.i.length }));
  const infBuf = device.createBuffer({ size: MAXI * IST * 4, usage: U.STORAGE | U.COPY_DST }), infU = mkBuf(new Float32Array(132), U.UNIFORM);
  const infBG = device.createBindGroup({ layout: bglI, entries: [{ binding: 0, resource: { buffer: infU } }, { binding: 1, resource: { buffer: infBuf } }] });
  let infN = 0;
  function drawInf(p, shadow) {
    const S = SOL; if (shadow && S.nNear) { p.setVertexBuffer(0, infMesh[0].vb); p.setIndexBuffer(infMesh[0].ib, 'uint32'); p.drawIndexed(infMesh[0].n, S.nNear); return; }
    for (let l = 0; l < 2; l++) { const c = l ? S.nFar : S.nNear; if (!c) continue; const m = infMesh[l]; p.setVertexBuffer(0, m.vb); p.setIndexBuffer(m.ib, 'uint32'); p.drawIndexed(m.n, c, 0, 0, l ? S.nNear : 0); }
  }

  // ---------- trees ----------
  const TM = buildTrees();
  const treeVB = mkBuf(TM.v, U.VERTEX), treeIB = mkBuf(TM.i, U.INDEX), treeInst = mkBuf(W.trees.data, U.VERTEX);
  const treeBufs = [{ arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }] },
    { arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }, { shaderLocation: 4, offset: 16, format: 'float32x4' }] }];
  // ?tfs=0 (diagnostics): flat-colour tree fragments, to separate shading cost from geometry cost
  const treeMod = mod(common + treeDefW + (qs.get('tfs') === '0' ? treeW.replace(/let wp\s*=\s*in\.wp;/, 'if (G.lod2.z > -1.0) { return vec4f(0.05, 0.09, 0.05, 1.0); } let wp = in.wp;') : treeW), 'tree');
  const treePipe = device.createRenderPipeline({
    layout: lay01, vertex: { module: treeMod, entryPoint: 'vs', buffers: treeBufs }, fragment: { module: treeMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'none' }, depthStencil: depthGE, multisample: { count: Q.msaa, alphaToCoverageEnabled: Q.msaa > 1 },
  });
  const treeShMod = mod(shadowW + treeDefW + shTreeW, 'treeshadow');
  const treeShPipe = device.createRenderPipeline({ layout: layS, vertex: { module: treeShMod, entryPoint: 'vs', buffers: treeBufs }, primitive: { cullMode: 'none' }, depthStencil: shDepth });
  const LK = Q.lodMul * (+qs.get("lod") || 1), LOD = [37 * LK, 180 * LK, 850 * LK];
  const BAND = 0.07, SNOWX = (qs.get('sx') || '1,0.69,0.56,0.4,1,1,0.85,0.52').split(',').map(Number);
  // LOD range uniforms 0..3, plus 4 = shadow-only "mid model from distance 0" (see the tree detail levels below)
  const lodBuf = [0, 1, 2, 3, 4].map(() => device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST })), lodD = new Float32Array(8);
  const lodBG = lodBuf.map((b) => device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: b } }] }));
  // Tree detail (menu): 0 high = full; 1 medium = shadows from simpler models, LOD ranges x0.8;
  // 2 low = also every other distant tree (the rest drawn wider), LOD ranges x0.55, no tree shadows in the far cascade.
  let thinInst = null, thinStart = null, thinCnt = null;
  function setTreeQ(q) {
    R.treeQ = q; const k = LK * [1, 0.8, 0.55][q]; LOD[0] = 37 * k; LOD[1] = 180 * k; LOD[2] = 850 * k;
    const rr = [[0, LOD[0], 0], [LOD[0], LOD[1], 0], [LOD[1], LOD[2], 1], [LOD[2], 1e9, 1], [0, LOD[1], 0]];
    for (let i = 0; i < 5; i++) { const r = rr[i], si = i < 4 ? i : 1; lodD[0] = r[0]; lodD[1] = r[1]; lodD[2] = r[2]; lodD[3] = 1; lodD[4] = SNOWX[si]; lodD[5] = BAND; lodD[6] = SNOWX[si + 4]; lodD[7] = 0; device.queue.writeBuffer(lodBuf[i], 0, lodD); }
    if (q === 2 && !thinInst) { // thinned copy of the instances for the farthest LOD: a random half per far cell, 1.32x wider
      const T = W.trees.data, out = new Float32Array(W.trees.count * 8); let n = 0; thinStart = new Uint32Array(FCN * FCN); thinCnt = new Uint32Array(FCN * FCN);
      for (let fc = 0; fc < FCN * FCN; fc++) { const s = W.trees.farStart[fc], e = s + W.trees.farCnt[fc]; thinStart[fc] = n;
        for (let t = s; t < e; t++) { const h = T[t * 8 + 6] * 13.7 + 0.31; if (h - Math.floor(h) < 0.5) { for (let j = 0; j < 8; j++) out[n * 8 + j] = T[t * 8 + j]; out[n * 8 + 7] *= 1.32; out[n * 8 + 3] *= 1.05; n++; } }
        thinCnt[fc] = n - thinStart[fc]; }
      thinInst = mkBuf(out.subarray(0, n * 8), U.VERTEX); R.thinN = n;
    }
  }
  const TREEQ = ['high', 'medium', 'low'];
  setTreeQ(Math.max(0, TREEQ.indexOf(R.treeSel)));
  const camPlanes = new Float32Array(20);
  function planesFrom(out, m, n) {
    for (let i = 0; i < 4; i++) { const a = i >> 1, sg = i & 1 ? -1 : 1; for (let k = 0; k < 4; k++) out[i * 4 + k] = m[k * 4 + 3] + sg * m[k * 4 + a]; }
    if (n > 4) for (let k = 0; k < 4; k++) out[16 + k] = m[k * 4 + 3] - m[k * 4 + 2];
  }
  function vis(pl, n, x0, y0, z0, x1, y1, z1) {
    for (let i = 0; i < n; i++) { const a = pl[i * 4], b = pl[i * 4 + 1], c = pl[i * 4 + 2]; if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + pl[i * 4 + 3] < 0) return false; }
    return true;
  }
  const TP = TM.parts, TT = W.trees;
  let draws = 0; const triStat = new Float64Array(8); R.triStat = triStat;
  function drawTrees(p, pl, np, maxLod, sh) { // sh: 0 = main pass, 1..3 = shadow cascade + 1
    const simple = sh > 0 && R.treeQ > 0; if (sh === 3 && R.treeQ === 2) return;
    p.setVertexBuffer(0, treeVB); p.setVertexBuffer(1, treeInst); p.setIndexBuffer(treeIB, 'uint32');
    const sb = maxLod === 4 ? 0 : 4; // triangle statistics: [0..3] main pass per LOD, [4..6] shadow passes per LOD
    const ccx = Math.floor((cam.x + HALF) / NEAR), ccz = Math.floor((cam.z + HALF) / NEAR), rad = Math.ceil(LOD[1] / 0.85 * (1 + BAND) / NEAR) + 1;
    const i0 = Math.max(0, ccx - rad), i1 = Math.min(NCN - 1, ccx + rad), j0 = Math.max(0, ccz - rad), j1 = Math.min(NCN - 1, ccz + rad);
    const cfx = clamp(Math.floor((cam.x + HALF) / FAR), 0, FCN - 1), cfz = clamp(Math.floor((cam.z + HALF) / FAR), 0, FCN - 1);
    for (let l = simple ? 1 : 0; l < 2; l++) { // simple shadows: the mid model casts for every near tree
      p.setBindGroup(1, lodBG[simple ? 4 : l]);
      const lo = l && !simple ? LOD[0] / 1.15 * (1 - BAND) : -1, hi = LOD[l] / 0.85 * (1 + BAND);
      // nearest cells first (square rings around the camera), so closer trees fill the depth buffer before farther ones are shaded
      for (let r = 0; r <= rad; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r, stp = dj === -r || dj === r ? 1 : 2 * r; di <= r; di += stp) {
        const i = ccx + di, j = ccz + dj; if (i < i0 || i > i1 || j < j0 || j > j1) continue;
        const nc = j * NCN + i, y0 = TT.nearY[nc * 2], y1 = TT.nearY[nc * 2 + 1]; if (y1 < y0) continue;
        const x0 = i * NEAR - HALF, z0 = j * NEAR - HALF, dh = Math.hypot(x0 + 16 - cam.x, z0 + 16 - cam.z);
        const dy = cam.y > y1 ? cam.y - y1 : cam.y < y0 ? y0 - cam.y : 0, dyM = Math.max(Math.abs(cam.y - y0), Math.abs(cam.y - y1));
        const pn = padN[nc], dmin = Math.hypot(Math.max(0, dh - 23 - pn), dy), dmax = Math.hypot(dh + 23 + pn, dyM);
        if (dmin >= hi || dmax <= lo) continue;
        if (!vis(pl, np, x0 - 5 - pn, y0 - 1, z0 - 5 - pn, x0 + NEAR + 5 + pn, y1 + 1, z0 + NEAR + 5 + pn)) continue;
        let st = TT.nearStart[nc];
        for (let s = 0; s < 3; s++) { const c = TT.nearCnt[nc * 3 + s]; if (c) { const P = TP[l * 3 + s]; p.drawIndexed(P.count, c, P.first, P.base, st); st += c; draws++; triStat[sb + l] += P.count / 3 * c; } }
      }
    }
    for (let l = 2; l < maxLod; l++) {
      p.setBindGroup(1, lodBG[l]);
      const lo = LOD[l - 1] / 1.15 * (1 - BAND), hi = l === 2 ? LOD[2] / 0.85 * (1 + BAND) : 1e9, P = simple ? TP[7] : TP[4 + l]; // simple shadows: the farthest model casts for everything past the near cells
      const thin = l === 3 && R.treeQ === 2 && thinInst; if (thin) p.setVertexBuffer(1, thinInst);
      for (let r = 0; r < FCN; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r, stp = dj === -r || dj === r ? 1 : 2 * r; di <= r; di += stp) { // near to far, as above
        const fi = cfx + di, fj = cfz + dj; if (fi < 0 || fj < 0 || fi >= FCN || fj >= FCN) continue;
        const fc = fj * FCN + fi, c = thin ? thinCnt[fc] : TT.farCnt[fc]; if (!c) continue;
        const x0 = (fc % FCN) * FAR - HALF, z0 = ((fc / FCN) | 0) * FAR - HALF, y0 = TT.farY[fc * 2], y1 = TT.farY[fc * 2 + 1];
        const pf = padF[fc], dh = Math.hypot(x0 + 64 - cam.x, z0 + 64 - cam.z), dmin = Math.max(0, dh - 91 - pf), dmax = dh + 91 + pf + Math.abs(cam.y - y0);
        if (dmin >= hi || dmax <= lo) continue;
        if (!vis(pl, np, x0 - 8 - pf, y0 - 1, z0 - 8 - pf, x0 + FAR + 8 + pf, y1 + 1, z0 + FAR + 8 + pf)) continue;
        p.drawIndexed(P.count, c, P.first, P.base, thin ? thinStart[fc] : TT.farStart[fc]); draws++; triStat[sb + l] += P.count / 3 * c;
      }
    }
  }
  // far cascades are refreshed on alternating frames (static world; halves shadow cost)
  const skipCasc = (c) => c > 0 && R.frame > 6 && !R.manual && ((R.frame + c) & 1) === 1;
  const lview = new Float32Array(16), lproj = new Float32Array(16), lvp = new Float32Array(16);
  function updateCascades(aspect, fovy) {
    const Lx = GU[O.sunDir], Ly = GU[O.sunDir + 1], Lz = GU[O.sunDir + 2];
    let rx = Lz, rz = -Lx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
    const ux = Ly * rz, uy = Lz * rx - Lx * rz, uz = -Ly * rx;
    const fx = -view[2], fy = -view[6], fz = -view[10], th = Math.tan(fovy / 2), k2 = 1 + th * th * (1 + aspect * aspect);
    let n = 0.25;
    for (let c = 0; c < NC; c++) {
      if (skipCasc(c)) { n = SPLITS[c] * 0.88; continue; }
      const f = SPLITS[c], d = Math.min(f, (n + f) / 2 * k2), r = Math.sqrt((f - d) * (f - d) + f * f * (k2 - 1)) * 1.02, D = 520;
      const cx = cam.x + fx * d, cy = cam.y + fy * d, cz = cam.z + fz * d, tex = 2 * r / Q.shadow;
      const sx = Math.round((cx * rx + cz * rz) / tex) * tex, sy = Math.round((cx * ux + cy * uy + cz * uz) / tex) * tex, sz = cx * Lx + cy * Ly + cz * Lz;
      lview[0] = rx; lview[1] = ux; lview[2] = Lx; lview[3] = 0; lview[4] = 0; lview[5] = uy; lview[6] = Ly; lview[7] = 0; lview[8] = rz; lview[9] = uz; lview[10] = Lz; lview[11] = 0;
      lview[12] = -sx; lview[13] = -sy; lview[14] = -(sz + D); lview[15] = 1;
      ortho(lproj, -r, r, -r, r, 0, 2 * D); mul(lvp, lproj, lview);
      GU.set(lvp, O.shadowMat + c * 16); GU[O.casc + c] = f; GU[O.cascTex + c] = tex;
      shData[c].set(lvp, 0); shData[c][16] = cam.x; shData[c][17] = cam.y; shData[c][18] = cam.z;
      device.queue.writeBuffer(shU[c], 0, shData[c]);
      planesFrom(shPlanes[c], lvp, 4);
      n = f * 0.88;
    }
    if (NC === 2) { GU[O.casc + 2] = SPLITS[1]; GU[O.cascTex + 2] = GU[O.cascTex + 1]; }
  }

  // ---------- grooming mask stamps ----------
  const stampMod = mod(stampW.replace(/1600\.0/g, (MW / 2).toFixed(1)), 'stamp');
  const sBlend = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
  const stampPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: stampMod, entryPoint: 'vs', buffers: [{ arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] },
    fragment: { module: stampMod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm', blend: sBlend, writeMask: 7 }, { format: 'rg16float', blend: sBlend }] },
  });
  const stampPass = { colorAttachments: [{ view: maskA.createView(), loadOp: 'load', storeOp: 'store' }, { view: maskB.createView(), loadOp: 'load', storeOp: 'store' }] };
  const blastPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: stampMod, entryPoint: 'vs', buffers: [{ arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] },
    fragment: { module: stampMod, entryPoint: 'fsBlast', targets: [{ format: 'rgba8unorm', blend: { color: { srcFactor: 'zero', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }, writeMask: GPUColorWrite.ALPHA }, { format: 'rg16float', writeMask: 0 }] },
  });
  const blData = new Float32Array(16 * 16), blBuf = device.createBuffer({ size: 16 * 64, usage: U.VERTEX | U.COPY_DST });
  const fxBuf = device.createBuffer({ size: MAXG * 48, usage: U.VERTEX | U.COPY_DST });
  const stData = new Float32Array(48), stBuf = device.createBuffer({ size: 192, usage: U.VERTEX | U.COPY_DST });
  const stPrev = new Float32Array(12), stCur = new Float32Array(12), stS = new Float32Array(3); let stN = 0, stInit = false;
  const TEXM = MW / Q.mask;
  { let n = 0; for (const t of W.trails) n += t.n - 1;
    const d = new Float32Array(n * 16); let o = 0;
    for (const t of W.trails) {
      const P = t.pts, hw = 2.3; let px0, pz0, px1, pz1, s = 0;
      for (let i = 0; i < t.n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(t.n - 1, i + 1); let tx = P[b * 2] - P[a * 2], tz = P[b * 2 + 1] - P[a * 2 + 1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const lx = P[i * 2] + tz * hw, lz = P[i * 2 + 1] - tx * hw, rx = P[i * 2] - tz * hw, rz = P[i * 2 + 1] + tx * hw;
        if (i > 0) { d.set([px0, pz0, px1, pz1, lx, lz, rx, rz, s, s + 2, 0, 1, 0.45, 0.45, 0, TEXM], o); o += 16; s += 2; }
        px0 = lx; pz0 = lz; px1 = rx; pz1 = rz;
      }
    }
    const b = mkBuf(d, U.VERTEX), e = device.createCommandEncoder(), p = e.beginRenderPass(stampPass);
    p.setPipeline(stampPipe); p.setVertexBuffer(0, b); p.draw(6, n); p.end(); device.queue.submit([e.finish()]); }
  function stampPts(out) {
    const c = Math.cos(veh.yaw), s = Math.sin(veh.yaw);
    for (let i = 0; i < 6; i++) { const lx = SP[i * 2], lz = SP[i * 2 + 1]; out[i * 2] = veh.x + c * lx + s * lz; out[i * 2 + 1] = veh.z - s * lx + c * lz; }
  }
  const TX0 = TRK.x - TRK.w / 2, TX1 = TRK.x + TRK.w / 2, SP = new Float32Array([-2.3, 3.2, 2.3, 3.2, -TX1, 2.2, -TX0, 2.2, TX0, 2.2, TX1, 2.2]);
  function updateStamps() {
    stampPts(stCur); stN = 0;
    if (!stInit) { stPrev.set(stCur); stInit = true; }
    for (let k = 1; k < 3; k++) {
      const i = k * 4, mv = Math.hypot(stCur[i] - stPrev[i], stCur[i + 1] - stPrev[i + 1]) + Math.hypot(stCur[i + 2] - stPrev[i + 2], stCur[i + 3] - stPrev[i + 3]);
      if (mv < 0.07) continue;
      if (!(veh.air && veh.y - veh.gPrev > 0.12) && !veh.deck) {
        const o = stN * 16, d = stData;
        d[o] = stPrev[i]; d[o + 1] = stPrev[i + 1]; d[o + 2] = stPrev[i + 2]; d[o + 3] = stPrev[i + 3];
        d[o + 4] = stCur[i]; d[o + 5] = stCur[i + 1]; d[o + 6] = stCur[i + 2]; d[o + 7] = stCur[i + 3];
        d[o + 8] = stS[k]; d[o + 9] = veh.dist;
        d[o + 10] = k === 1 ? 0.3 / 4.6 : 3.2 / 4.6; d[o + 11] = k === 1 ? 1.4 / 4.6 : 4.3 / 4.6; d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 1;
        d[o + 15] = TEXM; stN++;
      }
      stS[k] = veh.dist;
      stPrev[i] = stCur[i]; stPrev[i + 1] = stCur[i + 1]; stPrev[i + 2] = stCur[i + 2]; stPrev[i + 3] = stCur[i + 3];
    }
    if (stN) device.queue.writeBuffer(stBuf, 0, stData, 0, stN * 16);
  }

  // ---------- particles ----------
  const partMod = mod(common + particleW, 'particle');
  const pBlend = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const pDepth = { format: DF, depthWriteEnabled: false, depthCompare: 'greater' };
  const partPipe = device.createRenderPipeline({
    layout: lay0, vertex: { module: partMod, entryPoint: 'vs', buffers: [{ arrayStride: 48, stepMode: 'instance', attributes: [0, 1, 2].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] },
    fragment: { module: partMod, entryPoint: 'fs', targets: [{ format: HDR, blend: pBlend }] }, primitive: { topology: 'triangle-strip' }, depthStencil: pDepth, multisample: msState,
  });
  const flakePipe = device.createRenderPipeline({
    layout: lay0, vertex: { module: partMod, entryPoint: 'vsFlake' }, fragment: { module: partMod, entryPoint: 'fsFlake', targets: [{ format: HDR, blend: pBlend }] },
    primitive: { topology: 'triangle-strip' }, depthStencil: pDepth, multisample: msState,
  });
  const parts = new Particles(Q.parts), partBuf = device.createBuffer({ size: Q.parts * 48, usage: U.VERTEX | U.COPY_DST });
  let glowN = 0, glowBuf;
  { const g = [];
    for (const L of W.lamps) g.push(L.x + Math.sin(L.yaw) * 1.55, L.y + 6.0, L.z + Math.cos(L.yaw) * 1.55, 0.95, 0.9, 0.65, 0.34, 0, 2, 0, 0, 0);
    const AG = W.glows || []; for (let i = 0; i < AG.length; i += 3) g.push(AG[i], AG[i + 1], AG[i + 2], 1, 0.95, 0.85, 1.6, 0, 2, 0, 0, 0); // arena floodlights (props.js)
    const RG = W.railGlow || []; for (let i = 0; i < RG.length; i += 3) g.push(RG[i], RG[i + 1], RG[i + 2], 0.92, 0.94, 1, 0.3, 0, 2, 0, 0, 0); // platform lamps (props.js railway)
    glowN = g.length / 12; glowBuf = mkBuf(new Float32Array(g), U.VERTEX); }
  const em = { spray: 0, exh: 0, smoke: 0, kick: 0, roost: 0 };
  const tmp3 = new Float32Array(3); let fwdX = 0, fwdZ = -1, eBM = null;
  const loc = (lx, ly, lz) => { const B = eBM; tmp3[0] = B[0] * lx + B[4] * ly + B[8] * lz + B[12]; tmp3[1] = B[1] * lx + B[5] * ly + B[9] * lz + B[13]; tmp3[2] = B[2] * lx + B[6] * ly + B[10] * lz + B[14]; };
  function emitParticles(dt, BM) {
    eBM = BM;
    const c = Math.cos(veh.yaw), s = Math.sin(veh.yaw), sp = Math.abs(veh.v), dir = veh.v >= 0 ? 1 : -1;
    if (sp > 0.5 && !veh.air) {
      em.kick += dt * sp * 14;
      while (em.kick >= 1) { em.kick--; const sd = rnd() < 0.5 ? -1 : 1; loc(sd * (TRK.x + (rnd() - 0.5) * 0.6), 0.15, veh.v > 0 ? 3.25 : -3.25);
        parts.emit(tmp3[0], tmp3[1], tmp3[2], s * dir * (0.5 + rnd()) + c * (rnd() - 0.5), 0.6 + rnd() * 1.6, c * dir * (0.5 + rnd()) - s * (rnd() - 0.5), 0.3 + rnd() * 0.4, 0.007 + rnd() * 0.012, 0, 0, 1, 1, 1, 0.9); }
    }
    if (!veh.air && sp > 7) { // powder roost tail behind the tracks
      em.roost += dt * (sp - 5) * 5;
      while (em.roost >= 1) { em.roost--; const sd = rnd() < 0.5 ? -1 : 1; loc(sd * (TRK.x + (rnd() - 0.5) * 0.6), 0.25, 3.2 + rnd() * 0.5);
        parts.emit(tmp3[0], tmp3[1], tmp3[2], -fwdX * sp * (0.1 + rnd() * 0.25) + c * sd * (0.5 + rnd() * 1.5), 1.0 + rnd() * 2.2, -fwdZ * sp * (0.1 + rnd() * 0.25) - s * sd * (0.5 + rnd() * 1.5), 1.0 + rnd() * 0.9, 0.4 + rnd() * 0.5, 1.2, 1, 1.25, 1.25, 1.28, 0.2); }
    }
    if (veh.land > 2) { // touchdown burst
      const n = Math.min(160, veh.land * 14);
      for (let i = 0; i < n; i++) { const sd = rnd() < 0.5 ? -1 : 1, a = rnd() * 6.283, r = 1 + rnd() * 4; loc(sd * (1.2 + rnd() * 0.6), 0.2, (rnd() - 0.5) * 4);
        const big = rnd() < 0.5; parts.emit(tmp3[0], tmp3[1], tmp3[2], Math.cos(a) * r + fwdX * sp * 0.3, 1 + rnd() * veh.land * 0.45, Math.sin(a) * r + fwdZ * sp * 0.3, big ? 1.2 + rnd() : 0.5 + rnd() * 0.5, big ? 0.35 + rnd() * 0.4 : 0.01 + rnd() * 0.015, big ? 1 : 0, big ? 1 : 0, 1.25, 1.25, 1.28, big ? 0.12 : 0.9); }
    }
    veh.land = 0;
    em.exh += dt * (5 + 26 * Math.abs(veh.throttle));
    while (em.exh >= 1) { em.exh--; loc(rnd() < 0.5 ? -1.12 : 1.12, 1.2, 3.95); parts.emit(tmp3[0], tmp3[1], tmp3[2], (rnd() - 0.5) * 0.4 - fwdX * (1.5 - veh.v * 0.5), 0.6 + rnd() * 0.9, (rnd() - 0.5) * 0.4 - fwdZ * (1.5 - veh.v * 0.5), 1.1 + rnd() * 0.8, 0.1, 0.7, 1, 0.3, 0.31, 0.34, 0.16 + 0.14 * Math.abs(veh.throttle)); }
    em.smoke += dt * 11;
    while (em.smoke >= 1) { em.smoke--; const ch = W.cabin.chimney; parts.emit(ch[0] + (rnd() - 0.5) * 0.3, ch[1], ch[2] + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 1.3 + rnd() * 0.6, (rnd() - 0.5) * 0.3, 8 + rnd() * 5, 0.3 + rnd() * 0.25, 0.45, 1, 0.8, 0.8, 0.84, 0.42); }
  }

  // ---------- post ----------
  const postMod = mod(postW, 'post');
  const bglP = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VF, buffer: {} }, { binding: 1, visibility: VF, texture: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, texture: {} }] });
  const postLayout = device.createPipelineLayout({ bindGroupLayouts: [bglP] });
  const mkPost = (fs, fmt, blend) => device.createRenderPipeline({ layout: postLayout, vertex: { module: postMod, entryPoint: 'vs' }, fragment: { module: postMod, entryPoint: fs, targets: [{ format: fmt, blend }] } });
  const finalPipe = mkPost('fsFinal', cfmt), downPipe = mkPost('fsDown', HDR);
  const upPipe = mkPost('fsUp', HDR, { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'zero' } });
  const NB = Q.name === 'low' ? 4 : 6;
  const pU = [], pUData = [];
  for (let i = 0; i < NB * 2 + 1; i++) { pU[i] = device.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST }); pUData[i] = new Float32Array(24); }
  const black = device.createTexture({ size: [1, 1], format: HDR, usage: TB }).createView();

  // ---------- GPU timing ----------
  const ts = wantTS ? { qs: device.createQuerySet({ type: 'timestamp', count: 2 }), res: device.createBuffer({ size: 16, usage: U.QUERY_RESOLVE | U.COPY_SRC }), rb: [], busy: [false, false, false], cb: [] } : null;
  const perf = qs.has('perf') || qs.has('auto') ? { dt: new Float32Array(20000), gpu: new Float32Array(20000), n: 0, ng: 0, t: 0, done: false } : null;
  if (ts) for (let i = 0; i < 3; i++) {
    ts.rb[i] = device.createBuffer({ size: 16, usage: U.MAP_READ | U.COPY_DST });
    ts.cb[i] = () => { const a = new BigInt64Array(ts.rb[i].getMappedRange()); const ms = Number(a[1] - a[0]) / 1e6; ts.rb[i].unmap(); ts.busy[i] = false; if (ms > 0 && ms < 2000) { R.gpuMs = R.gpuMs ? R.gpuMs * 0.8 + ms * 0.2 : ms; if (perf && perf.t > 2 && !perf.done && perf.ng < 20000) perf.gpu[perf.ng++] = ms; } };
  }

  // ---------- size-dependent targets ----------
  let hdrMS, hdr, depth, hdrView, bloom = [], bloomBG = [], upBG = [], finalBG;
  const mainPass = { colorAttachments: [{ view: null, resolveTarget: undefined, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }], depthStencilAttachment: { view: null, depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 0 } };
  const bloomPass = [], finalPass = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  if (ts) { shPass[0].timestampWrites = { querySet: ts.qs, beginningOfPassWriteIndex: 0 }; finalPass.timestampWrites = { querySet: ts.qs, endOfPassWriteIndex: 1 }; }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    let w = Math.max(16, Math.round(canvas.clientWidth * dpr)), h = Math.max(16, Math.round(canvas.clientHeight * dpr));
    const k = Math.sqrt(Q.maxPx / (w * h)); if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); }
    const lim = device.limits.maxTextureDimension2D; w = Math.min(w, lim); h = Math.min(h, lim);
    if (canvas.width === w && canvas.height === h && hdr) return;
    canvas.width = w; canvas.height = h;
    for (const t of [hdrMS, hdr, depth, ...bloom]) if (t) t.destroy();
    hdr = device.createTexture({ size: [w, h], format: HDR, usage: RA | TB }); hdrView = hdr.createView();
    depth = device.createTexture({ size: [w, h], format: DF, usage: RA, sampleCount: Q.msaa });
    const ca = mainPass.colorAttachments[0];
    if (Q.msaa > 1) { hdrMS = device.createTexture({ size: [w, h], format: HDR, usage: RA, sampleCount: Q.msaa }); ca.view = hdrMS.createView(); ca.resolveTarget = hdrView; ca.storeOp = 'discard'; }
    else { hdrMS = null; ca.view = hdrView; ca.storeOp = 'store'; }
    mainPass.depthStencilAttachment.view = depth.createView();
    bloom = []; bloomBG = []; upBG = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < NB; i++) {
      bloom[i] = device.createTexture({ size: [Math.max(bw, 1), Math.max(bh, 1)], format: HDR, usage: RA | TB });
      const v = bloom[i].createView();
      bloomPass[i] = { colorAttachments: [{ view: v, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
      bloomPass[NB + i] = { colorAttachments: [{ view: v, loadOp: 'load', storeOp: 'store' }] };
      bloom[i].w = Math.max(bw, 1); bloom[i].h = Math.max(bh, 1); bloom[i].v = v;
      bw >>= 1; bh >>= 1;
    }
    const mk = (u, a, b) => device.createBindGroup({ layout: bglP, entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: a }, { binding: 2, resource: linClamp }, { binding: 3, resource: b }] });
    for (let i = 0; i < NB; i++) bloomBG[i] = mk(pU[i], i === 0 ? hdrView : bloom[i - 1].v, black);
    for (let i = 0; i < NB - 1; i++) upBG[i] = mk(pU[NB + i], bloom[i + 1].v, black);
    finalBG = mk(pU[NB * 2], hdrView, bloom[0].v);
    R.w = w; R.h = h;
    if (qs.has('safe')) { const st = $('ui').style, pt = innerHeight > innerWidth; st.setProperty('--st', (pt ? 59 : 10) + 'px'); st.setProperty('--sb', (pt ? 34 : 21) + 'px'); st.setProperty('--sl', (pt ? 12 : 59) + 'px'); st.setProperty('--sr', (pt ? 12 : 59) + 'px'); }
  }
  resize();
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  // ---------- UI ----------
  const TODN = ['Midday', 'Golden hour', 'Blue hour', 'Night'];
  const CAMT = ['Commander view', 'Gunner sight', '', 'Free-fly camera', 'Drone'];
  let ui = null;
  function setCam(m) {
    if (m === 3 && cam.mode !== 3) { cam.prevMode = cam.mode; cam.yaw = Math.atan2(view[2], view[10]); cam.pitch = Math.asin(clamp(-view[6], -1, 1)); }
    cam.mode = m; R.snap = true; ui.toast(CAMT[m] + (m === 3 && !isTouch ? ' — click to look' : ''));
  }
  const api = {
    cam() { if (cam.mode !== 4) setCam(cam.mode === 0 ? 1 : 0); },
    drone() { if (R.game) R.game.droneKey(); },
    bigMap(on) { if (R.game) R.game.bigMap(on); },
    droneType(i) { if (R.game) R.game.droneType(i); },
    droneLabel: () => (R.game ? R.game.droneLabel() : ''),
    arty() { if (R.game) R.game.support.key(); },
    ammo(i) { if (R.game) R.game.ammo(i); },
    smoke() { if (R.game) R.game.smoke(); },
    thermal(v) { R.therm = v === undefined ? (R.therm + 1) % 3 : v; ui.toast(['Thermal sight off', 'Thermal sight: white-hot', 'Thermal sight: black-hot'][R.therm] + (R.therm && cam.mode !== 1 && cam.mode !== 4 ? ' (gunner sight and drone)' : '')); },
    restart() { treesRestore(); if (R.game) R.game.restart(); },
    snow(v) { R.snow = v === undefined ? 1 - R.snow : v; ui.toast(R.snow ? 'Snowfall on' : 'Snowfall off'); },
    tod(i) { if (i < 0) i = (todIndex + 1) % 4; setTod(i); tshDirty = 2; ui.toast(TODN[i]); },
    debug(v) { R.debug = v === undefined ? !R.debug : !!v; ui.setDebug(R.debug); },
    quality(v) { try { localStorage.gq = v; } catch (e) { /* ignore */ } const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.href; },
    trees(v) { R.treeSel = v; R.trees = v !== 'off'; if (R.trees) setTreeQ(TREEQ.indexOf(v)); try { localStorage.gtrees = v; } catch (e) { /* ignore */ } ui.toast('Trees: ' + v); },
    sound(v) { const on = v === undefined ? !audio.on : !!v; audio.setOn(on); music.sound(on); try { localStorage.gsnd = on ? '1' : '0'; } catch (e) { /* ignore */ } ui.toast(on ? 'Sound on' : 'Sound off'); },
    music(v) { const on = v === undefined ? music.toggle() : (music.set(v), music.on); ui.toast(on ? 'Music on' : 'Music off'); },
    vib(v) { R.hap.setLevel(v); try { localStorage.gvib = String(v); } catch (e) { /* ignore */ } ui.toast(['Vibration off', 'Vibration light', 'Vibration full'][v]); },
    drs(v) { R.drs = !!v; if (!v) R.scale = Q.scale; try { localStorage.gdrs = v ? '1' : '0'; } catch (e) { /* ignore */ } },
    state: () => ({ quality: pref, tod: todIndex, snow: R.snow, sound: audio.on, music: music.on, vib: R.hap ? R.hap.level : 2, drs: R.drs, trees: R.treeSel, debug: R.debug, info: `Tier: ${Q.name} · ${R.w}×${R.h} canvas · render scale ${(R.scale * 100).toFixed(0)}% · ${W.trees.count.toLocaleString()} trees · GPU: ${R.gpuName}` }),
  };
  ui = initUI(api, isTouch);
  const turM = new Float32Array(16), gunM = new Float32Array(16);
  // sound hook: gameplay code reports events here; the audio module (if present) installs R.sfx. name, world position, strength.
  const sfx = (name, x, y, z, k) => { if (R.sfx) R.sfx(name, x, y, z, k); if (R.hap) R.hap.ev(name, x, y, z, k); };
  const game = initCombat({ W, R, veh, aim, cam, inp, parts, rnd, ui, sfx, HALF, WS, HN, PLAY, collAt, solid, bld: BL, turM, gunM, dobj: droneO.d, mineMesh, treeHit, aobj: aObj.map((a) => a.d), eobj: eObj.map((e) => e.d), peace: qs.has('peace') || qs.has('auto') || qs.has('perf') || W.name === 'fantasy' });
  R.game = game; R.aimHit = game.aimHit;
  const SOL = initSoldiers(MAXI, W.heightAt);
  // Sound is off by default until recorded engine and drone loops replace the synthetic ones (they read as a spaceship).
  // The menu row or M turns it on and the choice is remembered; ?sound starts with it on, ?mute forces it off.
  let sndOn = true; /* on by default; a stored choice (M or the menu) and ?mute win */ try { const g = localStorage.gsnd; if (g === '1') sndOn = true; else if (g === '0') sndOn = false; } catch (e) { /* ignore */ }
  if (qs.has('mute')) sndOn = false;
  const audio = initAudio({ R, cam, veh, view, game, on: sndOn, rec: REC, recM: RECM }); window.__audio = audio;
  // controller vibration: off / light / full (menu row; localStorage.gvib, ?novib)
  let vibL = 2; try { const g = localStorage.gvib; if (g === '0' || g === '1' || g === '2') vibL = +g; } catch (e) { /* ignore */ }
  if (qs.has('novib')) vibL = 0;
  const hap = R.hap = initHaptics({ veh, game, ui, level: vibL }); window.__hap = hap;

  // ---------- state ----------
  veh.x = W.start.x; veh.z = W.start.z; veh.yaw = W.start.yaw; veh.y = W.heightAt(veh.x, veh.z);
  if (qs.get('veh')) { const q = qs.get('veh').split(',').map(Number); veh.x = q[0]; veh.z = q[1]; veh.yaw = q[2] || 0; veh.y = W.heightAt(veh.x, veh.z); }
  if (qs.get('therm')) { R.therm = +qs.get('therm'); R.thAll = true; } // test hook: thermal view in every camera
  if (qs.get('cam')) R.pose = qs.get('cam').split(',').map(Number);
  setTod(clamp((+qs.get('tod') || 1) - 1, 0, 3), true);
  if (qs.has('snow')) R.snow = 1;
  if (qs.has('debug')) api.debug(1);
  veh.gPrev = veh.y; aim.yaw = veh.yaw;
  GU[O.world] = HALF; GU[O.world + 1] = 1 / WS; GU[O.world + 2] = MW / 2; GU[O.world + 3] = 1 / MW;
  GU[O.screen + 2] = TEXM; GU[O.screen + 3] = Q.mask;
  GU[O.casc + 3] = 1 / Q.shadow; GU[O.lod2 + 2] = Q.msaa;
  const auto = qs.has('auto') ? { i: W.startI } : null;
  if (auto) { const t = W.trails[0]; veh.x = t.pts[auto.i * 2]; veh.z = t.pts[auto.i * 2 + 1]; veh.y = W.heightAt(veh.x, veh.z); }
  R.auto = auto;

  let wallC = false; // in contact with a building last frame
  let infDemo = null; // __infDemo's per-frame update
  function collide(dt) {
    const C = W.colliders, fx = -Math.sin(veh.yaw), fz = -Math.cos(veh.yaw);
    // buildings: the hull as three circles (front, middle, rear); push out along the smallest penetration, slide along the wall
    let a = 0;
    for (let s = -1; s <= 1; s++) { const px = veh.x + fx * 1.8 * s, pz = veh.z + fz * 1.8 * s;
      if (BL.push(px, pz, 1.9, SO)) { veh.x += SO[0] - px; veh.z += SO[1] - pz; a = Math.max(a, Math.abs(fx * SO[2] + fz * SO[3])); }
      const qx = veh.x + fx * 1.8 * s, qz = veh.z + fz * 1.8 * s; if (W.br.push(qx, qz, veh.y, 1.9, SO)) { veh.x += SO[0] - qx; veh.z += SO[1] - qz; a = Math.max(a, Math.abs(fx * SO[2] + fz * SO[3])); } } // bridge walls at the hull's own level (abutments under a deck, parapets on it)
    if (a > 0) {
      const sp = Math.abs(veh.v);
      if (!wallC) { // impact: lose the speed into the wall
        if (sp * a > 3) { veh.shake = Math.max(veh.shake, Math.min(1.1, sp * a / 12)); sfx('crash', veh.x + fx * 3.6 * Math.sign(veh.v || 1), veh.y + 1, veh.z + fz * 3.6 * Math.sign(veh.v || 1), sp * a); }
        veh.v *= 1 - a * 0.85;
      } else veh.v *= 1 - Math.min(1, dt * (6 * a * a + 0.3)); // grinding along it
    }
    wallC = a > 0;
    if (BL.rubble(veh.x, veh.z) && Math.abs(veh.v) > 6.5) { veh.v -= Math.sign(veh.v) * (Math.abs(veh.v) - 6.5) * Math.min(1, dt * 4); veh.shake = Math.max(veh.shake, 0.18); } // rubble: half speed
    // circle colliders (lamps, pylons, boulders, landmark towers) from the grid cell under the tank
    const c = clamp(Math.floor((veh.z + HALF) / CG), 0, NCG - 1) * NCG + clamp(Math.floor((veh.x + HALF) / CG), 0, NCG - 1);
    for (let q = cgStart[c]; q < cgStart[c + 1]; q++) { const i = cgItems[q], dx = veh.x - C[i], dz = veh.z - C[i + 1], rr = C[i + 2] + LEO.rad, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), k = (rr - d) / d; veh.x += dx * k; veh.z += dz * k; veh.v *= 0.9; } }
    if (!R.trees) return; // a 55 t tank fells trees up to about 10 m
    if (treeHit(veh.x, veh.z, -Math.sin(veh.yaw), -Math.cos(veh.yaw), 1.8, 1.9, Math.abs(veh.v) > 0.6 || Math.abs(veh.yawRate) > 0.05, TO, 10)) { veh.x += TO[0]; veh.z += TO[1]; if (TO[4] > 0) veh.v *= 0.88; }
  }
  // ---------- trees and vehicles: a vehicle (a capsule: centre, forward, half-length, radius) knocks over small trees it drives into and is pushed off big ones ----------
  // out: [0, 1] push to add to the centre, [2, 3] a steering nudge away from big trunks just ahead, [4] the deepest contact; returns trees touched
  // felled trees: a restore list for a restart (rotation and species as they were), a small ring of falls in progress, and per-cell culling padding so a crown that fell over a cell edge is still drawn
  const SMALL_T = 7, TO = new Float32Array(5), RMAX = 4096, RK = new Int32Array(RMAX), RR = new Float32Array(RMAX * 2), AMAX = 64, AK = new Int32Array(AMAX).fill(-1), AT = new Float32Array(AMAX);
  const padN = new Float32Array(NCN * NCN), padF = new Float32Array(FCN * FCN); let rN = 0, aLive = 0;
  function fell(k, dx, dz) { // rare event (a tree goes over); false when the restore list is full (the tree then stays solid)
    if (rN >= RMAX) return false; const T = TT.data, o = k * 8; RK[rN] = k; RR[rN * 2] = T[o + 4]; RR[rN * 2 + 1] = T[o + 5]; rN++;
    T[o + 4] = Math.atan2(dx, dz); T[o + 5] = Math.floor(T[o + 5]) + 0.004; device.queue.writeBuffer(treeInst, k * 32 + 16, T, o + 4, 2);
    const ci = clamp(Math.floor((T[o] + HALF) / NEAR), 0, NCN - 1), cj = clamp(Math.floor((T[o + 2] + HALF) / NEAR), 0, NCN - 1), L = T[o + 3] * 1.15;
    padN[cj * NCN + ci] = Math.max(padN[cj * NCN + ci], L); const fc = ((cj * NEAR / FAR) | 0) * FCN + ((ci * NEAR / FAR) | 0); padF[fc] = Math.max(padF[fc], L);
    let a = 0; while (a < AMAX && AK[a] >= 0) a++;
    if (a < AMAX) { AK[a] = k; AT[a] = 0; aLive++; } else { T[o + 5] = Math.floor(T[o + 5]) + 0.4; device.queue.writeBuffer(treeInst, k * 32 + 20, T, o + 5, 1); } // no animation slot: it is simply down
    const y = T[o + 1] + 0.5; for (let i = 0; i < 8; i++) parts.emit(T[o] + (rnd() - 0.5), y + rnd() * 1.5, T[o + 2] + (rnd() - 0.5), (rnd() - 0.5) * 2 + dx * 2, 0.5 + rnd() * 1.5, (rnd() - 0.5) * 2 + dz * 2, 1.2 + rnd(), 0.5 + rnd() * 0.5, 1.2, 1, 1.15, 1.15, 1.18, 0.35); // snow off the branches
    sfx('crash', T[o], y, T[o + 2], 0.12);
    return true;
  }
  function fallStep(dt) { if (!aLive) return; const T = TT.data;
    for (let a = 0; a < AMAX; a++) { const k = AK[a]; if (k < 0) continue; AT[a] = Math.min(1, AT[a] + dt / 0.7); const o = k * 8; T[o + 5] = Math.floor(T[o + 5]) + 0.004 + AT[a] * 0.396; device.queue.writeBuffer(treeInst, k * 32 + 20, T, o + 5, 1); if (AT[a] >= 1) { AK[a] = -1; aLive--; } } }
  function treesRestore() { const T = TT.data; for (let i = 0; i < rN; i++) { const k = RK[i], o = k * 8; T[o + 4] = RR[i * 2]; T[o + 5] = RR[i * 2 + 1]; device.queue.writeBuffer(treeInst, k * 32 + 16, T, o + 4, 2); } rN = 0; aLive = 0; AK.fill(-1); padN.fill(0); padF.fill(0); }
  function treeHit(x, z, fx, fz, half, r, moving, out, small = SMALL_T) { // small: the tallest tree this vehicle knocks over
    out[0] = out[1] = out[2] = out[3] = out[4] = 0; if (!R.trees) return 0;
    const T = TT.data, reach = half + r + 7, cx = Math.floor((x + HALF) / NEAR), cz = Math.floor((z + HALF) / NEAR); let hits = 0;
    for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= NCN || j >= NCN) continue;
      const nc = j * NCN + i, st = TT.nearStart[nc], n = TT.nearCnt[nc * 3] + TT.nearCnt[nc * 3 + 1] + TT.nearCnt[nc * 3 + 2];
      for (let k = st; k < st + n; k++) { const o = k * 8, tx = T[o] - x, tz = T[o + 2] - z; if (tx * tx + tz * tz > reach * reach || T[o + 5] - Math.floor(T[o + 5]) > 0.001) continue; // far, or already down
        const h = T[o + 3], a = clamp(tx * fx + tz * fz, -half, half), px = tx - fx * a, pz = tz - fz * a, d = Math.hypot(px, pz) || 1e-3; // nearest point on the hull's spine
        if (h < small) { if (!(d < r * 0.85 && moving)) continue; if (fell(k, fx * Math.sign(a || 1), fz * Math.sign(a || 1))) { hits++; continue; } } // could not be felled: solid like a big one
        const rc = r + 0.25 + h * 0.012;
        if (d < rc) { const q = rc - d; out[0] -= px / d * q; out[1] -= pz / d * q; if (q > out[4]) out[4] = q; hits++; }
        else if (tx * fx + tz * fz > 0 && d < rc + 2.5) { const w = (rc + 2.5 - d) / 2.5; out[2] -= px / d * w; out[3] -= pz / d * w; } } // a trunk ahead: lean away from it
    }
    return hits;
  }
  const gq = (x, z) => W.groundAt(x, z, veh.y); // the track-corner ground query (no closure per frame)
  function simulate(dt) {
    let th = inp.th, st = inp.st;
    if (R.force) { th = R.force[0]; st = R.force[1]; }
    if (R.auto) { // follow the lit loop
      const t = W.trails[0]; let i = R.auto.i;
      while (Math.hypot(t.pts[i * 2] - veh.x, t.pts[i * 2 + 1] - veh.z) < 7) i = (i + 1) % t.n;
      R.auto.i = i;
      let d = Math.atan2(-(t.pts[i * 2] - veh.x), -(t.pts[i * 2 + 1] - veh.z)) - veh.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      st = clamp(d * 2.5, -1, 1); th = 1 - 0.4 * Math.abs(st);
    }
    if (veh.dead || veh.immob > 0) { th = 0; if (veh.dead) st = 0; }
    veh.throttle = th; veh.steer += (st - veh.steer) * Math.min(1, dt * 6);
    fwdX = -Math.sin(veh.yaw); fwdZ = -Math.cos(veh.yaw);
    const sp = Math.abs(veh.v), v0 = veh.v;
    // plowed roads are fast, deep snow is slower (real world: mat G holds the distance to the asphalt edge)
    { const mi = clamp(Math.round((veh.x + HALF) / WS * HN), 0, HN - 1), mj = clamp(Math.round((veh.z + HALF) / WS * HN), 0, HN - 1); veh.road += ((REAL && W.mat[(mj * HN + mi) * 4 + 1] > 165 ? 1 : 0) - veh.road) * Math.min(1, dt * 3); }
    const vmax = lerp(13.5, 19, veh.road);
    if (!veh.air) {
      const g = 9.8 * Math.sin(veh.pitch) * 0.75;
      if (th > 0) veh.v += th * 4.8 * (veh.v < 0 ? 2 : 1 - clamp(veh.v / vmax, 0, 1) ** 2) * dt;
      else if (th < 0) veh.v = veh.v > 0.3 ? Math.max(0, veh.v + th * 9 * dt) : Math.max(-8.6, veh.v + th * 3.4 * dt);
      veh.v -= (g + veh.v * 0.05 + (veh.v > vmax ? (veh.v - vmax) * 0.8 : 0)) * dt;
      if (th === 0) { const br = 6.5 * dt; veh.v = Math.abs(veh.v) <= br ? 0 : veh.v - Math.sign(veh.v) * br; } // brakes hold on slopes
      veh.v *= 1 - Math.abs(veh.steer) * 0.22 * dt;
    }
    veh.yawRate = veh.steer * (veh.air ? 0.2 : lerp(0.72, 0.4, Math.min(1, sp / 15))) * (veh.v < -0.2 ? -1 : 1) * (veh.immob > 0 ? 0.25 : 1);
    veh.yaw += veh.yawRate * dt;
    veh.dist += veh.v * dt; veh.trL += (veh.v + veh.yawRate * TRK.x) * dt; veh.trR += (veh.v - veh.yawRate * TRK.x) * dt;
    fwdX = -Math.sin(veh.yaw); fwdZ = -Math.cos(veh.yaw);
    veh.x = clamp(veh.x + fwdX * veh.v * dt, -PLAY, PLAY); veh.z = clamp(veh.z + fwdZ * veh.v * dt, -PLAY, PLAY);
    const vc = Math.abs(veh.v); collide(dt);
    if (vc > 5 && Math.abs(veh.v) < vc * 0.9 && !wallC) { veh.shake = Math.max(veh.shake, Math.min(1, vc / 18)); veh.v *= 0.5; }
    const rx = -fwdZ, rz = fwdX, hl = LEO.hl, hw = LEO.hw, h = gq, fx = fwdX, fz = fwdZ; // ground at the hull's own level: a bridge deck counts only from STEP below its top
    const a = h(veh.x + fx * hl + rx * hw, veh.z + fz * hl + rz * hw), b = h(veh.x + fx * hl - rx * hw, veh.z + fz * hl - rz * hw), c = h(veh.x - fx * hl + rx * hw, veh.z - fz * hl + rz * hw), d = h(veh.x - fx * hl - rx * hw, veh.z - fz * hl - rz * hw);
    const gY = (a + b + c + d) / 4 + 0.02, gV = clamp((gY - veh.gPrev) / dt, -40, 40); veh.gPrev = gY;
    veh.shake *= 1 - Math.min(1, dt * 3.5);
    // suspension: the hull squats under acceleration, dives under braking and rocks from recoil and hits
    veh.acc += ((veh.v - v0) / dt - veh.acc) * Math.min(1, dt * 5);
    veh.dpV += (-70 * (veh.dp - clamp(veh.acc * 0.006, -0.05, 0.05)) - 7 * veh.dpV) * dt; veh.dp += veh.dpV * dt;
    veh.drV += (-70 * veh.dr - 7 * veh.drV) * dt; veh.dr += veh.drV * dt;
    const G = 10.5;
    if (!veh.air) {
      const ball = veh.y + veh.vy * dt - 0.5 * G * dt * dt;
      if ((gY < ball - 0.05 && sp > 6) || gY < veh.y - 1.2) { veh.air = true; veh.airT = 0; veh.y = ball; } // crest, or the ground falls away under the hull (an edge): leave the ground
      else { veh.vy = gY - veh.y > 0.2 ? 0 : gV; veh.y = gY; } // a step up (onto a deck edge, a kerb) is climbed, not launched from
    }
    if (veh.air) {
      veh.vy -= G * dt; veh.y += veh.vy * dt; veh.airT += dt;
      veh.pitch += (clamp(Math.atan2(veh.vy, Math.max(sp, 3)) * 0.5, -0.4, 0.3) - veh.pitch) * Math.min(1, dt * 1.2);
      veh.roll *= 1 - Math.min(1, dt * 1.2);
      if (veh.y <= gY) { // touchdown
        const imp = Math.max(0, gV - veh.vy);
        veh.air = false; veh.y = gY; veh.vy = gV; veh.land = imp; sfx('land', veh.x, veh.y, veh.z, imp); veh.dpV -= Math.min(0.6, imp * 0.05);
        veh.shake = Math.max(veh.shake, Math.min(1.3, imp / 9)); veh.v *= 1 - Math.min(0.3, imp * 0.012);
      }
    }
    if (!veh.air) {
      const k = Math.min(1, dt * 10);
      veh.pitch += (Math.atan2((a + b - c - d) / 2, hl * 2) - veh.pitch) * k; veh.roll += (Math.atan2((a + c - b - d) / 2, hw * 2) - veh.roll) * k;
    }
    veh.deck = W.br.top(veh.x, veh.z, veh.y) > W.heightAt(veh.x, veh.z) + 0.3; // on a bridge deck (no track marks: the snow mask is 2-D and would mark the road below)
  }
  // sight line -> aim point (terrain ray march), then slew turret and gun towards the ballistic solution
  const AMMO_V = 1650;
  function updateAim(dt) {
    if (R.aimAt) { const q = R.aimAt, ax = q[0] - cam.x, ay = q[1] - cam.y, az = q[2] - cam.z; aim.yaw = Math.atan2(-ax, -az); aim.pitch = Math.atan2(ay, Math.hypot(ax, az)); } // scripted tests
    else if (cam.mode < 3 && !R.pose && !veh.dead) {
      const sens = (isTouch ? 0.006 : 0.0028) * cam.fovNow;
      aim.yaw -= inp.lookX * sens; aim.pitch = clamp(aim.pitch - inp.lookY * sens, -0.5, cam.mode === 0 ? 1.2 : 0.75); // the commander's view can look up high (hatch MG against drones)
    }
    const cp = Math.cos(aim.pitch), dx = -Math.sin(aim.yaw) * cp, dy = Math.sin(aim.pitch), dz = -Math.cos(aim.yaw) * cp;
    aim.dx = dx; aim.dy = dy; aim.dz = dz;
    const own = R.frame < 3 || cam.mode >= 3, ox = own ? veh.x : cam.x, oy = own ? veh.y + 3.5 : cam.y, oz = own ? veh.z : cam.z; // free-fly and drone cameras do not move the sight line
    let t = 8, tp = 8, hit = false;
    while (t < 3500) { if (oy + dy * t < W.heightAt(ox + dx * t, oz + dz * t)) { hit = true; break; } tp = t; t += Math.max(2, t * 0.035); }
    if (hit) for (let i = 0; i < 7; i++) { const m = (t + tp) / 2; if (oy + dy * m < W.heightAt(ox + dx * m, oz + dz * m)) t = m; else tp = m; }
    const tr = t; t = R.aimHit ? R.aimHit(ox, oy, oz, dx, dy, dz, t) : t;
    aim.hit = hit || t < tr - 0.01; // the sight ray met terrain, a building or a vehicle (not the sky)
    aim.x = ox + dx * t; aim.y = oy + dy * t; aim.z = oz + dz * t;
    // ballistic solution from the trunnion (the fire control computer adds the superelevation)
    const B = hullM, tx = B[4] * LEO.gy + B[8] * LEO.gz + B[12], ty = B[5] * LEO.gy + B[9] * LEO.gz + B[13], tz = B[6] * LEO.gy + B[10] * LEO.gz + B[14];
    const ex = aim.x - tx, ey = aim.y - ty, ez = aim.z - tz, hd = Math.max(1, Math.hypot(ex, ez)), v2 = R.shellV * R.shellV, g = 9.81;
    aim.range = Math.hypot(hd, ey);
    const disc = v2 * v2 - g * (g * hd * hd + 2 * ey * v2), el = disc > 0 ? Math.atan2(v2 - Math.sqrt(disc), g * hd) : 0.6, ce = Math.cos(el);
    const wx = ex / hd * ce, wy = Math.sin(el), wz = ez / hd * ce;
    const lx = B[0] * wx + B[1] * wy + B[2] * wz, ly = B[4] * wx + B[5] * wy + B[6] * wz, lz = B[8] * wx + B[9] * wy + B[10] * wz;
    let dyaw = Math.atan2(-lx, -lz) - veh.turYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const dpt = clamp(Math.asin(clamp(ly, -1, 1)), -0.157, 0.35) - veh.gunPitch;
    if (!veh.dead) { veh.turYaw += clamp(dyaw, -0.75 * dt, 0.75 * dt); veh.gunPitch += clamp(dpt, -0.45 * dt, 0.45 * dt); }
    aim.err = Math.hypot(dyaw, dpt); aim.ready = aim.err < 0.0035 ? 1 : 0;
    veh.recoil *= 1 - Math.min(1, dt * 4.5);
  }
  const hullM = new Float32Array(16); hullM[0] = hullM[5] = hullM[10] = hullM[15] = 1; R.shellV = AMMO_V;
  // after the part matrices are current: muzzle position, bore direction and where the round would land (screen space)
  function updateGun() {
    const M = gunMat(), gy = LEO.gy, mz = LEO.mz;
    aim.mx = M[4] * gy + M[8] * mz + M[12]; aim.my = M[5] * gy + M[9] * mz + M[13]; aim.mz = M[6] * gy + M[10] * mz + M[14];
    const l = 1 / Math.hypot(M[8], M[9], M[10]); aim.gx = -M[8] * l; aim.gy = -M[9] * l; aim.gz = -M[10] * l;
  }
  function gunMarker() {
    const hd = Math.hypot(aim.x - aim.mx, aim.z - aim.mz), ch = Math.max(0.05, Math.hypot(aim.gx, aim.gz)), t = hd / (R.shellV * ch);
    const px = aim.mx + aim.gx * R.shellV * t, py = aim.my + aim.gy * R.shellV * t - 4.905 * t * t, pz = aim.mz + aim.gz * R.shellV * t;
    const w = vp[3] * px + vp[7] * py + vp[11] * pz + vp[15];
    if (w > 0.1) { aim.sx = (vp[0] * px + vp[4] * py + vp[8] * pz + vp[12]) / w; aim.sy = (vp[1] * px + vp[5] * py + vp[9] * pz + vp[13]) / w; } else { aim.sx = 9; aim.sy = 9; }
    // bomber: the predicted grenade impact replaces the gun marker in the drone view (ring green when a grenade is ready)
    const D = game.drone; R.dropSx = 9; R.dropSy = 9;
    if (cam.mode === 4 && D.on && D.type === 1 && D.iok) { const dw = vp[3] * D.ix + vp[7] * D.iy + vp[11] * D.iz + vp[15];
      if (dw > 0.1) { R.dropSx = (vp[0] * D.ix + vp[4] * D.iy + vp[8] * D.iz + vp[12]) / dw; R.dropSy = (vp[1] * D.ix + vp[5] * D.iy + vp[9] * D.iz + vp[13]) / dw; } }
  }
  const chaseP = new Float32Array(5), osdV = new Float32Array(10); let dzAcc = 0; R.dZoom = 1; R.dFirst = false;
  function updateCamera(dt, BM) {
    const sens = isTouch ? 0.006 : 0.0045, sight = cam.mode === 1 || (inp.sight && cam.mode === 0);
    if (sight && cam.mode === 0) cam.mode = 1; else if (cam.mode === 1 && cam.held && !inp.sight) cam.mode = 0;
    cam.held = inp.sight;
    if (cam.mode === 4) { // FPV drone: the mouse turns it, the camera trails just behind and above
      const D = game.drone;
      if (D.on) { // pad yaw: a rate that spins up firmly and coasts down slowly when the stick is let go (mouse turns stay direct)
        const u = inp.yawR; D.yr += (-u * 1.5 - D.yr) * Math.min(1, dt * (Math.abs(u) > 0.05 ? 5 : 4)); D.yaw += D.yr * dt;
      }
      if (D.on) { // view levels (D-pad up/down, wheel, pinch): FPV 0 chase far, 1 chase, 2 goggles; bomber/recon 0 outside, 1 camera, 2 zoom 2×, 3 zoom 4×
        dzAcc += inp.zoom; const top = D.type ? 3 : 2, v0 = D.view;
        if (dzAcc <= -0.3) { D.view = Math.min(top, D.view + 1); dzAcc = 0; } else if (dzAcc >= 0.3) { D.view = Math.max(0, D.view - 1); dzAcc = 0; }
        if (D.view !== v0) { game.dview[D.type] = D.view; ui.toast(D.type ? ['Outside view', 'Camera', 'Camera 2×', 'Camera 4×'][D.view] : ['Chase camera, far', 'Chase camera', 'FPV goggles'][D.view]); }
      } else dzAcc = 0;
      const zk = D.on && D.type ? (D.view === 2 ? 0.5 : D.view === 3 ? 0.25 : 1) : 1; R.dZoom = zk; // optical zoom: narrower field, slower look
      R.dFirst = D.on && (D.type ? D.view >= 1 : D.view === 2); // first person: the drone mesh is not drawn
      if (D.on && D.type) { // bomber and recon: the view from the gimbal camera under the airframe, which tilts down to the vertical
        D.yaw -= inp.lookX * sens * 0.6 * zk; D.pitch = clamp(D.pitch - inp.lookY * sens * 0.6 * zk, -1.5707, 0.35);
        const cp = Math.cos(D.pitch), fx = -Math.sin(D.yaw) * cp, fy = Math.sin(D.pitch), fz = -Math.cos(D.yaw) * cp;
        if (D.view === 0) { // outside: behind and above the airframe along the heading, looking a little ahead of it (handy for landing on the tank)
          const hx = -Math.sin(D.yaw), hz = -Math.cos(D.yaw);
          cam.x = D.x - hx * 4.5; cam.z = D.z - hz * 4.5; cam.y = Math.min(Math.max(D.y + 1.8, W.groundAt(cam.x, cam.z, D.y) + 0.6), W.br.over(D.x, D.z, D.y) - 0.3);
          lookAt(view, cam.x, cam.y, cam.z, D.x + hx * 5, D.y - 1.2, D.z + hz * 5, 0, 1, 0);
        } else {
          cam.x = D.x; cam.z = D.z; cam.y = Math.max(D.y - 0.2, W.groundAt(cam.x, cam.z, D.y) + 0.3);
          if (cp < 0.02) lookAt(view, cam.x, cam.y, cam.z, cam.x + fx, cam.y + fy, cam.z + fz, -Math.sin(D.yaw), 0, -Math.cos(D.yaw)); // straight down: up is the heading
          else lookAt(view, cam.x, cam.y, cam.z, cam.x + fx, cam.y + fy, cam.z + fz, 0, 1, 0);
        }
      } else if (D.on) { // FPV, rigidly attached: a lagging follow jitters at 26 m/s whenever the frame time varies
        D.yaw -= inp.lookX * sens * 0.6; D.pitch = clamp(D.pitch - inp.lookY * sens * 0.6, -1.3, 1.1);
        const cp = Math.cos(D.pitch), fx = -Math.sin(D.yaw) * cp, fy = Math.sin(D.pitch), fz = -Math.cos(D.yaw) * cp;
        if (D.view === 2) { // goggles: the camera in the nose, bolted to the frame (no gimbal), so the picture banks and pitches with the airframe.
          // Roll: the sideways lean plus a bank into pad yaw turns. Pitch: only the change of the forward lean (the nose dips as it speeds up and lifts
          // as it brakes); a real FPV camera is tilted up to cancel the steady cruise lean, so the view is level again at constant speed.
          D.tpS += (D.tp - D.tpS) * Math.min(1, dt * 1.2);
          const ro = -D.tr - D.yr * 0.22, pa = D.pitch + (D.tp - D.tpS) * 0.8, cq = Math.cos(pa), gx = -Math.sin(D.yaw) * cq, gy = Math.sin(pa), gz = -Math.cos(D.yaw) * cq;
          const rl = Math.hypot(gx, gz) || 1, rx = -gz / rl, rz = gx / rl, ux = -rz * gy, uy = rz * gx - rx * gz, uz = rx * gy, cr = Math.cos(ro), sr = Math.sin(ro);
          cam.x = D.x + fx * 0.3; cam.z = D.z + fz * 0.3; cam.y = Math.max(D.y + fy * 0.3 + 0.06, W.groundAt(cam.x, cam.z, D.y) + 0.2);
          lookAt(view, cam.x, cam.y, cam.z, cam.x + gx, cam.y + gy, cam.z + gz, ux * cr + rx * sr, uy * cr, uz * cr + rz * sr);
        } else {
          const cd = D.view ? 2.3 : 7, cu = D.view ? 0.55 : 1.9;
          cam.x = D.x - fx * cd; cam.z = D.z - fz * cd; cam.y = Math.min(Math.max(D.y - fy * cd + cu, W.groundAt(cam.x, cam.z, D.y) + 0.4), W.br.over(D.x, D.z, D.y) - 0.3);
          lookAt(view, cam.x, cam.y, cam.z, cam.x + fx, cam.y + fy - (D.view ? 0.06 : 0.2), cam.z + fz, 0, 1, 0);
        }
      } else { // after the detonation: pull back and up, and keep watching the blast for a few seconds
        const tx = D.bx + Math.sin(D.yaw) * 11, tz = D.bz + Math.cos(D.yaw) * 11, ty = Math.min(Math.max(D.by + 5, W.groundAt(tx, tz, D.by) + 2.5), W.br.over(D.bx, D.bz, D.by) - 0.4), k = Math.min(1, dt * 1.5);
        cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k; cam.y = Math.max(cam.y, W.groundAt(cam.x, cam.z, D.by) + 0.6);
        lookAt(view, cam.x, cam.y, cam.z, D.bx, D.by + 0.6, D.bz, 0, 1, 0);
      }
      R.snap = false;
    } else if (cam.mode === 3) {
      cam.yaw -= inp.lookX * sens * 0.7; cam.pitch = clamp(cam.pitch - inp.lookY * sens * 0.7, -1.5, 1.5);
      const cp = Math.cos(cam.pitch), fx = -Math.sin(cam.yaw) * cp, fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * cp, sp = (inp.fast ? 70 : 14) * dt;
      cam.x = clamp(cam.x + (fx * inp.mvZ + Math.cos(cam.yaw) * inp.mvX) * sp, -1950, 1950); cam.z = clamp(cam.z + (fz * inp.mvZ - Math.sin(cam.yaw) * inp.mvX) * sp, -1950, 1950);
      cam.y = clamp(cam.y + (fy * inp.mvZ + inp.mvY) * sp, W.heightAt(cam.x, cam.z) + 0.7, 1500);
      lookAt(view, cam.x, cam.y, cam.z, cam.x + fx, cam.y + fy, cam.z + fz, 0, 1, 0);
    } else if (cam.mode === 1) { // gunner sight: stabilised view along the sight line from the EMES 15 head
      const T = turM, ex = 0.9, ey = 2.52, ez = -2.0;
      if (inp.zoom) cam.zoom = inp.zoom < 0 ? 1 : 0;
      cam.x = T[0] * ex + T[4] * ey + T[8] * ez + T[12]; cam.y = T[1] * ex + T[5] * ey + T[9] * ez + T[13]; cam.z = T[2] * ex + T[6] * ey + T[10] * ez + T[14];
      const sk = veh.shake * veh.shake * 0.05, t = R.time;
      lookAt(view, cam.x, cam.y, cam.z, cam.x + aim.dx + Math.sin(t * 37) * sk, cam.y + aim.dy + Math.sin(t * 43 + 1) * sk, cam.z + aim.dz, 0, 1, 0);
    } else { // commander view: behind and above the turret, looking along the sight line
      cam.dist = clamp(cam.dist * Math.exp(inp.zoom), 7, 45);
      const cd = cam.dist, tx = veh.x, ty = veh.y + 2.6 + cd * 0.1, tz = veh.z;
      const ex = tx - aim.dx * cd, ez = tz - aim.dz * cd, ey = Math.max(ty - aim.dy * cd * 0.6, W.groundAt(ex, ez, veh.y + 1) + 1.0);
      const k = R.frame < 3 || R.snap ? 1 : Math.min(1, dt * 14); R.snap = false;
      cam.x += (ex - cam.x) * k; cam.y += (ey - cam.y) * k; cam.z += (ez - cam.z) * k;
      cam.y = Math.max(cam.y, W.groundAt(cam.x, cam.z, veh.y + 1) + 0.8);
      const cl = Math.min(W.br.over(veh.x, veh.z, veh.y + 1), W.br.over(cam.x, cam.z, veh.y + 1)); // under a deck: the camera stays below the slab, pulled in towards the turret when the ground or a wall is in the way
      if (cl < 1e8) { const cy = Math.min(cam.y, cl - 0.8); let f = 1;
        while (f > 0.15 && (W.groundAt(veh.x + (cam.x - veh.x) * f, veh.z + (cam.z - veh.z) * f, veh.y + 1) + 0.6 > cy || W.br.inSolid(veh.x + (cam.x - veh.x) * f, cy, veh.z + (cam.z - veh.z) * f) >= 0)) f -= 0.1;
        cam.x = veh.x + (cam.x - veh.x) * f; cam.z = veh.z + (cam.z - veh.z) * f; cam.y = cy; }
      const sk = veh.shake * veh.shake * 0.35, t = R.time;
      lookAt(view, cam.x + Math.sin(t * 37) * sk, cam.y + Math.sin(t * 43 + 1) * sk, cam.z + Math.sin(t * 29 + 2) * sk, cam.x + aim.dx, cam.y + aim.dy, cam.z + aim.dz, 0, 1, 0);
    }
    inp.lookX = inp.lookY = inp.zoom = 0;
    if (R.chase) { const q = R.chase, cp = Math.cos(q[1]), P = chaseP; P[0] = veh.x + Math.sin(veh.yaw + q[0]) * cp * q[2]; P[1] = veh.y + 1.6 + Math.sin(q[1]) * q[2]; P[2] = veh.z + Math.cos(veh.yaw + q[0]) * cp * q[2]; P[3] = veh.yaw + q[0]; P[4] = -q[1]; R.pose = P; }
    if (R.pose) { const q = R.pose; cam.x = q[0]; cam.y = q[1]; cam.z = q[2]; const cp = Math.cos(q[4]); lookAt(view, q[0], q[1], q[2], q[0] - Math.sin(q[3]) * cp, q[1] + Math.sin(q[4]), q[2] - Math.cos(q[3]) * cp, 0, 1, 0); }
  }
  function setLight(o, BM, lx, ly, lz, dx, dy, dz, range, outer, inner, r, g, b) {
    GU[o] = BM[0] * lx + BM[4] * ly + BM[8] * lz + BM[12]; GU[o + 1] = BM[1] * lx + BM[5] * ly + BM[9] * lz + BM[13]; GU[o + 2] = BM[2] * lx + BM[6] * ly + BM[10] * lz + BM[14]; GU[o + 3] = range;
    const l = 1 / Math.hypot(dx, dy, dz); dx *= l; dy *= l; dz *= l;
    GU[o + 4] = BM[0] * dx + BM[4] * dy + BM[8] * dz; GU[o + 5] = BM[1] * dx + BM[5] * dy + BM[9] * dz; GU[o + 6] = BM[2] * dx + BM[6] * dy + BM[10] * dz; GU[o + 7] = outer;
    GU[o + 8] = r; GU[o + 9] = g; GU[o + 10] = b; GU[o + 11] = inner;
  }
  // dynamic resolution
  let slowN = 0, dAcc = 0, dN = 0, dCeil = 9, dCeilT = 0, dUp = false;
  function drs(raw) {
    dAcc += raw; dN++; if (dN < 20) return;
    const ft = dAcc / dN * 1000; dAcc = 0; dN = 0; R.ft = ft;
    if (ft > 40 && !R.manual && R.frame > 200) { if (++slowN === 12) ui.toast('Low frame rate — open MENU and lower Quality or Trees'); } else if (slowN < 12) slowN = 0;
    if (!R.drs || R.manual) return;
    let s = R.scale; dCeilT -= 1; if (dCeilT <= 0) dCeil = 9;
    if (ts && R.gpuMs > 0) { const load = R.gpuMs / 13.0; if (load > 1) s *= Math.max(0.86, 1 / Math.sqrt(load)); else if (load < 0.7 && ft < 18.5) s *= 1.03; if (ft > 24 && load > 0.8) s *= 0.95; }
    else if (ft > 19.6) { if (dUp) { dCeil = s * 0.94; dCeilT = 60; } s *= ft > 28 ? 0.86 : 0.93; dUp = false; }
    else if (ft < 17.7 && s < Math.min(Q.scale, dCeil)) { s *= 1.025; dUp = true; } else dUp = false;
    R.scale = clamp(s, Q.minScale, Math.min(Q.scale, dCeil));
  }

  const lvCell = (l) => 0.25 * (1 << l);
  let dbgT = 0, waiters = [], waitN = 0;
  function tickFrame(dt, raw) {
    R.time += dt; R.frame++;
    if (updateTod(dt)) tshDirty = 2;
    ui.poll(cam.mode === 3 ? 1 : cam.mode === 4 ? 2 : 0);
    updateAim(dt);
    simulate(dt);
    hullM.set(tankParts(groomer.d, veh, LEO)); turM.set(turMat()); gunM.set(gunMat());
    const BM = hullM;
    updateGun();
    game.update(dt); fallStep(dt);
    updateCamera(dt, BM);
    cam.sightK += ((cam.mode === 1 && !R.pose ? 1 : 0) - cam.sightK) * Math.min(1, dt * 12);
    cam.fovNow = lerp(1, cam.zoom ? 0.085 : 0.26, cam.sightK);
    emitParticles(dt, BM);
    const pn = parts.update(dt, W.heightAt, 1.3, 0.5);
    audio.update(dt); hap.update(dt);
    if (R.simOnly) return; // logic-only step for scripted tests (window.__sim)
    R.snowAmt += (R.snow - R.snowAmt) * Math.min(1, dt * 0.8);

    const rw = Math.max(8, Math.round(R.w * R.scale)), rh = Math.max(8, Math.round(R.h * R.scale));
    const fovy = cam.fov * (R.w < R.h ? 1.3 : 1) * cam.fovNow * (cam.mode === 4 ? 1.25 * R.dZoom : 1);
    perspRZ(proj, fovy, rw / rh, 0.25);
    mul(vp, proj, view); invert(ivp, vp);
    GU.set(vp, O.viewProj); GU.set(ivp, O.invViewProj);
    GU[O.camPos] = cam.x; GU[O.camPos + 1] = cam.y; GU[O.camPos + 2] = cam.z; GU[O.camPos + 3] = R.time;
    writeTod(GU, O);
    GU[O.groom] = veh.x; GU[O.groom + 1] = veh.y; GU[O.groom + 2] = veh.z; GU[O.lod2] = Q.casc === 3 ? 1 : 0; GU[O.lod2 + 1] = R.trees ? 0 : 1; GU[O.lod2 + 3] = cam.mode === 0 && !R.pose ? 1.5 : 0;
    GU[O.misc + 1] = R.snowAmt; GU[O.screen] = rw; GU[O.screen + 1] = rh; R.thNow = R.therm && (R.thAll || (!R.pose && (cam.mode === 1 || cam.mode === 4))) ? R.therm + (cam.mode === 4 ? 2 : 0) : 0; GU[O.groom + 3] = R.thNow ? 1 : 0; gunMarker();
    if (R.snowAmt > 0.01) { const k = 1 - 0.55 * R.snowAmt; GU[O.sunCol] *= k; GU[O.sunCol + 1] *= k; GU[O.sunCol + 2] *= k; GU[O.fogCol + 3] *= 1 + 5 * R.snowAmt; GU[O.skyHor + 3] = Math.min(1.6, GU[O.skyHor + 3] + R.snowAmt); }
    updateCascades(rw / rh, fovy);
    planesFrom(camPlanes, vp, 5); draws = 0; triStat.fill(0);
    if (infDemo) infDemo(dt);
    infN = game.inf ? SOL.update(game.inf, dt, cam.x, cam.y, cam.z, camPlanes, 5) : 0;
    if (infN) device.queue.writeBuffer(infBuf, 0, SOL.out, 0, infN * IST);
    updateStamps();
    const nt = 0.12 + 0.88 * GU[O.misc];
    groomer.d[128] = veh.trL; groomer.d[129] = veh.trR; groomer.d[130] = veh.dead ? Math.min(1, (game.burnP || 0) * 0.5) : 0; groomer.d[131] = 1;
    device.queue.writeBuffer(groomer.u, 0, groomer.d);
    const droneOn = game.drone.on; if (droneOn) device.queue.writeBuffer(droneO.u, 0, droneO.d);
    for (let i = 0; i < MAXE; i++) if (game.enemies[i].on) device.queue.writeBuffer(eObj[i].u, 0, eObj[i].d);
    for (let i = 0; i < MAXA; i++) if (game.air[i].on) device.queue.writeBuffer(aObj[i].u, 0, aObj[i].d);
    if (game.fxN) device.queue.writeBuffer(fxBuf, 0, game.fx, 0, game.fxN * 12);
    for (let i = 0; i < game.blastN; i++) { const o = i * 16, b = game.blasts, x = b[i * 4], z = b[i * 4 + 1], r = b[i * 4 + 2], d = blData;
      d[o] = x - r; d[o + 1] = z - r; d[o + 2] = x + r; d[o + 3] = z - r; d[o + 4] = x - r; d[o + 5] = z + r; d[o + 6] = x + r; d[o + 7] = z + r; d[o + 8] = 0; d[o + 9] = 1; d[o + 10] = 0; d[o + 11] = 1; d[o + 12] = b[i * 4 + 3]; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = TEXM; }
    if (game.blastN) device.queue.writeBuffer(blBuf, 0, blData, 0, game.blastN * 16);
    setLight(O.l0p, BM, 0, 1.5, -2.9, 0, -0.14, -1, 90, Math.cos(0.98), Math.cos(0.2), 1.25 * nt, 1.18 * nt, 1.0 * nt);
    setLight(O.l1p, BM, 0, 1.4, 3.9, 0, -0.5, 1, 14, Math.cos(1.1), Math.cos(0.5), 0.25 * nt, 0.03 * nt, 0.02 * nt);
    { const a = R.time * 5.5, o = O.l2p; GU[o] = BM[0] * 0.6 + BM[4] * 2.75 + BM[8] * -1.1 + BM[12]; GU[o + 1] = BM[1] * 0.6 + BM[5] * 2.75 + BM[9] * -1.1 + BM[13]; GU[o + 2] = BM[2] * 0.6 + BM[6] * 2.75 + BM[10] * -1.1 + BM[14]; GU[o + 3] = 26;
      GU[o + 4] = Math.cos(a); GU[o + 5] = -0.1; GU[o + 6] = Math.sin(a); GU[o + 8] = 0; GU[o + 9] = 0; GU[o + 10] = 0;
      const F = game.flash, k = F[7]; GU[o] = F[0]; GU[o + 1] = F[1]; GU[o + 2] = F[2]; GU[o + 3] = Math.max(1, F[3]); GU[o + 8] = F[4] * k; GU[o + 9] = F[5] * k; GU[o + 10] = F[6] * k; }
    device.queue.writeBuffer(gBuf, 0, GU);
    for (let l = 0; l < NL; l++) {
      const c = lvCell(l);
      lvData[0] = Math.floor(cam.x / (2 * c)) * 2 * c - N / 2 * c; lvData[1] = Math.floor(cam.z / (2 * c)) * 2 * c - N / 2 * c; lvData[2] = c; lvData[3] = N;
      device.queue.writeBuffer(lvBuf[l], 0, lvData);
    }
    if (pn) device.queue.writeBuffer(partBuf, 0, parts.out, 0, pn * 12);

    const enc = device.createCommandEncoder();
    if (tshDirty > 0 && (--tshDirty === 0 || (R.frame & 3) === 0)) {
      tshD[0] = GU[O.sunDir]; tshD[1] = GU[O.sunDir + 1]; tshD[2] = GU[O.sunDir + 2]; device.queue.writeBuffer(tshU, 0, tshD);
      const tp = enc.beginRenderPass(tshPass); tp.setPipeline(tshPipe); tp.setBindGroup(0, tshBG); tp.draw(3); tp.end();
    }
    if (stN || game.blastN) { const sp = enc.beginRenderPass(stampPass);
      if (stN) { sp.setPipeline(stampPipe); sp.setVertexBuffer(0, stBuf); sp.draw(6, stN); }
      if (game.blastN) { sp.setPipeline(blastPipe); sp.setVertexBuffer(0, blBuf); sp.draw(6, game.blastN); game.blastN = 0; }
      sp.end(); }
    for (let c = 0; c < NC; c++) {
      if (skipCasc(c)) continue;
      const sp = enc.beginRenderPass(shPass[c]);
      sp.setBindGroup(0, shBG[c]);
      if (!hH) {
      sp.setPipeline(objShPipe); sp.setBindGroup(1, groomer.bg); sp.setVertexBuffer(0, groomer.vb); sp.setIndexBuffer(groomer.ib, 'uint32'); sp.drawIndexed(groomer.n);
      if (droneOn) { sp.setBindGroup(1, droneO.bg); sp.setVertexBuffer(0, droneO.vb); sp.setIndexBuffer(droneO.ib, 'uint32'); sp.drawIndexed(droneO.n); }
      for (let i = 0; i < MAXA; i++) { const a = game.air[i]; if (!a.on || c > 0) continue; const m = aMesh[a.type]; sp.setBindGroup(1, aObj[i].bg); sp.setVertexBuffer(0, m.vb); sp.setIndexBuffer(m.ib, 'uint32'); sp.drawIndexed(m.n); }
      for (let i = 0; i < MAXE; i++) { const e = game.enemies[i]; if (!e.on) continue; const m = eMesh[e.cage ? 6 : e.type]; sp.setBindGroup(1, eObj[i].bg); sp.setVertexBuffer(0, m.vb); sp.setIndexBuffer(m.ib, 'uint32'); sp.drawIndexed(m.n); }
      if (!hO) { sp.setBindGroup(1, props.bg); sp.setVertexBuffer(0, props.vb); sp.setIndexBuffer(props.ib, 'uint32'); sp.drawIndexed(props.n);
        if (BL.dN) { sp.setVertexBuffer(0, debO.vb); sp.setIndexBuffer(debO.ib, 'uint32'); sp.drawIndexed(BL.dN * 36); }
        if (mineO.n && c === 0) { sp.setVertexBuffer(0, mineO.vb); sp.setIndexBuffer(mineO.ib, 'uint32'); sp.drawIndexed(MAXM * mNI); } }
      if (infN && c < 2) { sp.setPipeline(infShPipe); sp.setBindGroup(1, infBG); drawInf(sp, true); }
      if (R.trees) { sp.setPipeline(treeShPipe); drawTrees(sp, shPlanes[c], 4, 3, c + 1); }
      }
      sp.end();
    }
    const p = enc.beginRenderPass(mainPass);
    p.setViewport(0, 0, rw, rh, 0, 1); p.setScissorRect(0, 0, rw, rh);
    p.setBindGroup(0, bg0);
    p.setPipeline(objPipe);
    if (!hV && (cam.mode !== 1 || R.pose)) { p.setBindGroup(1, groomer.bg); p.setVertexBuffer(0, groomer.vb); p.setIndexBuffer(groomer.ib, 'uint32'); p.drawIndexed(groomer.n); }
    if (droneOn && !hV && !(cam.mode === 4 && R.dFirst)) { p.setBindGroup(1, droneO.bg); p.setVertexBuffer(0, droneO.vb); p.setIndexBuffer(droneO.ib, 'uint32'); p.drawIndexed(droneO.n); }
    for (let i = 0; i < MAXA; i++) { const a = game.air[i]; if (!a.on || hV) continue; const m = aMesh[a.type]; p.setBindGroup(1, aObj[i].bg); p.setVertexBuffer(0, m.vb); p.setIndexBuffer(m.ib, 'uint32'); p.drawIndexed(m.n); }
    for (let i = 0; i < MAXE; i++) { const e = game.enemies[i]; if (!e.on || hV) continue; const m = eMesh[e.cage ? 6 : e.type]; p.setBindGroup(1, eObj[i].bg); p.setVertexBuffer(0, m.vb); p.setIndexBuffer(m.ib, 'uint32'); p.drawIndexed(m.n); }
    if (!hO) { p.setBindGroup(1, props.bg); p.setVertexBuffer(0, props.vb); p.setIndexBuffer(props.ib, 'uint32'); p.drawIndexed(props.n);
      if (BL.dN) { p.setVertexBuffer(0, debO.vb); p.setIndexBuffer(debO.ib, 'uint32'); p.drawIndexed(BL.dN * 36); }
      if (mineO.n) { p.setVertexBuffer(0, mineO.vb); p.setIndexBuffer(mineO.ib, 'uint32'); p.drawIndexed(MAXM * mNI); } }
    if (infN && !hV) { p.setPipeline(infPipe); p.setBindGroup(1, infBG); drawInf(p, false); }
    if (R.trees) { p.setPipeline(treePipe); drawTrees(p, camPlanes, 5, 4, 0); }
    p.setPipeline(terrPipe); p.setVertexBuffer(0, tvb);
    for (let l = 0; l < NL && !hT; l++) {
      p.setBindGroup(1, lvBG[l]);
      if (l === 0) { p.setIndexBuffer(tibF, 'uint32'); p.drawIndexed(tiFull.length); } else { if (l === 1) p.setIndexBuffer(tibR, 'uint32'); p.drawIndexed(tiRing.length); }
    }
    if (!hS) { p.setPipeline(skyPipe); p.draw(3); }
    p.setPipeline(partPipe);
    if (hP) { /* particles hidden */ } else {
    if (GU[O.misc] > 0.02) { p.setVertexBuffer(0, glowBuf); p.draw(4, glowN); }
    if (pn) { p.setVertexBuffer(0, partBuf); p.draw(4, pn); }
    if (game.fxN) { p.setVertexBuffer(0, fxBuf); p.draw(4, game.fxN); }
    if (R.snowAmt > 0.01) { p.setPipeline(flakePipe); p.draw(4, Math.round(Q.flakes * Math.min(1, R.snowAmt * 1.5))); }
    }
    p.end();

    const sx = rw / R.w, sy = rh / R.h, expo = R.thNow ? 1 : GU[O.misc + 2];
    for (let i = 0; i < NB; i++) {
      const u = pUData[i], sw = i === 0 ? R.w : bloom[i - 1].w, sh = i === 0 ? R.h : bloom[i - 1].h;
      u[0] = i === 0 ? sx : 1; u[1] = i === 0 ? sy : 1; u[2] = 1 / sw; u[3] = 1 / sh; u[4] = expo; u[5] = 0; u[6] = R.time; u[7] = i === 0 ? 1 : 0;
      device.queue.writeBuffer(pU[i], 0, u);
      const bp = enc.beginRenderPass(bloomPass[i]); bp.setPipeline(downPipe); bp.setBindGroup(0, bloomBG[i]); bp.draw(3); bp.end();
    }
    for (let i = NB - 2; i >= 0; i--) {
      const u = pUData[NB + i]; u[0] = 1; u[1] = 1; u[2] = 1 / bloom[i + 1].w; u[3] = 1 / bloom[i + 1].h; u[4] = expo; u[5] = 1; u[6] = 0; u[7] = 0;
      device.queue.writeBuffer(pU[NB + i], 0, u);
      const bp = enc.beginRenderPass(bloomPass[NB + i]); bp.setPipeline(upPipe); bp.setBindGroup(0, upBG[i]); bp.draw(3); bp.end();
    }
    const fu = pUData[NB * 2]; fu[0] = sx; fu[1] = sy; fu[2] = 1 / R.w; fu[3] = 1 / R.h; fu[4] = expo; fu[5] = 0.1; fu[6] = R.manual ? 0.37 : R.time; fu[7] = R.thNow;
    const hudOn = cam.mode !== 3 && !R.pose && !R.nohud && !hX;
    const Dr = game.drone, drop = cam.mode === 4 && Dr.on && Dr.type === 1;
    fu[8] = cam.mode === 4 ? R.dropSx : aim.sx; fu[9] = cam.mode === 4 ? R.dropSy : aim.sy; fu[10] = drop ? (Dr.bombs ? clamp(1 - Dr.rel / 0.7, 0, 1) : 0) : R.reload || 0; fu[11] = hudOn ? (cam.mode === 1 ? 2 : 1) : 0; fu[12] = R.hitT || 0; fu[13] = drop ? (Dr.bombs ? 1 : 0) : aim.ready; fu[14] = cam.sightK; fu[15] = R.hurtT || 0;
    fu[16] = game.thr[0]; fu[17] = game.thr[1]; fu[18] = game.thr[2]; fu[19] = game.thr[3]; // incoming drone arrows
    fu[20] = cam.mode === 4 && Dr.on && R.dFirst && !R.pose ? (Dr.type ? 2 : 1) : 0; fu[21] = Dr.sig; // drone video look (goggles / digital)
    if (fu[20] && hudOn) { // OSD numbers (ui.osd writes only what changed, a few times a second)
      const O = osdV, hx = veh.x - Dr.x, hz = veh.z - Dr.z, rel = Math.atan2(-hx, -hz) - Dr.yaw; O[0] = Dr.type; O[1] = Math.round(1 / R.dZoom); O[2] = Math.round(Dr.sig * 100);
      O[3] = Math.max(0, Math.ceil(Dr.t)); O[4] = Math.max(0, Math.round(Dr.t / Dr.tMax * 100)); O[5] = Math.round((Dr.type ? Math.hypot(Dr.vx, Dr.vz) : Math.hypot(Dr.vx, Dr.vy, Dr.vz)) * 10);
      O[6] = Math.round(Dr.y - W.heightAt(Dr.x, Dr.z)); O[7] = Math.round(Math.hypot(hx, hz) / 10) * 10; O[8] = ((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8; O[9] = Dr.bombs; ui.osd(fu[20], O);
    } else ui.osd(0, osdV);
    device.queue.writeBuffer(pU[NB * 2], 0, fu);
    finalPass.colorAttachments[0].view = ctx.getCurrentTexture().createView();
    const fp = enc.beginRenderPass(finalPass); fp.setPipeline(finalPipe); fp.setBindGroup(0, finalBG); fp.draw(3); fp.end();
    let ri = -1;
    if (ts && (perf || (R.frame & 3) === 0)) { enc.resolveQuerySet(ts.qs, 0, 2, ts.res, 0); for (let i = 0; i < 3; i++) if (!ts.busy[i]) { ri = i; break; } if (ri >= 0) enc.copyBufferToBuffer(ts.res, 0, ts.rb[ri], 0, 16); }
    device.queue.submit([enc.finish()]);
    if (ri >= 0) { ts.busy[ri] = true; ts.rb[ri].mapAsync(GPUMapMode.READ).then(ts.cb[ri]); }

    drs(raw); if (raw * 1000 > R.ftMax) R.ftMax = raw * 1000;
    ui.hud(Math.min(199, Math.round((cam.mode === 4 ? Math.hypot(game.drone.vx, game.drone.vy, game.drone.vz) : Math.abs(veh.v)) * 3.6)), cam.mode, Math.round(aim.range / 10) * 10);
    if (R.debug && (dbgT += raw) > 0.5) { dbgT = 0; ui.dbgText(`${(1000 / R.ft).toFixed(0)} fps  ${R.ft.toFixed(1)} ms (max ${R.ftMax.toFixed(0)})\ngpu ${R.gpuMs ? R.gpuMs.toFixed(1) + ' ms' : 'n/a'}\ntier ${Q.name}  scale ${(R.scale * 100).toFixed(0)}%\n${rw}×${rh} → ${R.w}×${R.h}  msaa ${Q.msaa}\ndraws ${draws}  particles ${pn}\n${R.gpuName}  trees ${R.treeSel}${HIDE ? '  hide ' + HIDE : ''}\ntree tris ${((triStat[0] + triStat[1] + triStat[2] + triStat[3]) / 1e6).toFixed(2)}M + shadow ${((triStat[4] + triStat[5] + triStat[6]) / 1e6).toFixed(2)}M`); R.ftMax = 0; }
    if (perf && !perf.done) {
      perf.t += raw; if (perf.t > 2 && perf.n < 20000) perf.dt[perf.n++] = raw * 1000;
      if (perf.t > 62) { perf.done = true; const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); return n ? { avg: +(s.reduce((x, y) => x + y, 0) / n).toFixed(2), p50: +s[n >> 1].toFixed(2), p99: +s[Math.floor(n * 0.99)].toFixed(2), max: +s[n - 1].toFixed(2), n } : null; };
        const hitches = []; for (let i = 0; i < perf.n; i++) if (perf.dt[i] > 25) hitches.push([i, +perf.dt[i].toFixed(1)]);
        window.__perf = { frame: st(perf.dt, perf.n), gpu: st(perf.gpu, perf.ng), hitches, tier: Q.name, res: [R.w, R.h], scale: R.scale }; console.log('PERF ' + JSON.stringify(window.__perf)); }
    }
    if (waiters.length && --waitN <= 0) { const w = waiters; waiters = []; w.forEach((f) => f()); }
  }
  let last = 0, running = true;
  function frame(tms) {
    if (!running) return;
    requestAnimationFrame(frame);
    const raw = (tms - last) / 1000 || 0.016; last = tms;
    if (R.manual) return;
    tickFrame(Math.min(0.05, raw), raw);
  }
  window.__waitFrames = (n) => new Promise((r) => { if (R.manual) return r(); waitN = n; waiters.push(r); });
  window.__step = (dt, n = 1) => { R.manual = true; for (let i = 0; i < n; i++) tickFrame(dt, dt); return device.queue.onSubmittedWorkDone(); };
  window.__sim = (dt, n = 1) => { R.manual = true; R.simOnly = true; for (let i = 0; i < n; i++) tickFrame(dt, dt); R.simOnly = false; };
  window.__info = () => `tier=${Q.name} ${R.w}x${R.h} scale=${R.scale.toFixed(2)} trees=${W.trees.count} draws=${draws} gpu=${R.gpuMs.toFixed(2)}ms ft=${R.ft.toFixed(2)}`;
  window.__pose = (q, tod) => { R.chase = null; R.pose = q; if (tod) { setTod(tod - 1, true); tshDirty = 1; } };
  window.__look = (ex, eh, ez, tx, th, tz) => { R.chase = null; const ey = W.heightAt(ex, ez) + eh, ty = W.heightAt(tx, tz) + th, dx = tx - ex, dy = ty - ey, dz = tz - ez; R.pose = [ex, ey, ez, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  window.__chase = (yaw, pitch, dist) => { R.chase = [yaw, pitch, dist]; }; // fixed third-person test camera that follows the hull
  window.__aimAt = (x, y, z) => { R.aimAt = x === undefined ? null : [x, y, z]; };
  window.__aim = (yaw, pitch, mode) => { R.pose = null; R.chase = null; aim.yaw = yaw; aim.pitch = pitch; if (mode !== undefined) cam.mode = mode; R.snap = true; };
  window.__tod = (i) => { setTod(i - 1, true); tshDirty = 1; };
  window.__tp = (x, z, yaw, top) => { veh.x = x; veh.z = z; veh.yaw = aim.yaw = yaw; veh.v = 0; veh.vy = 0; veh.air = false; veh.y = veh.gPrev = (top ? W.groundAt(x, z, 1e5) : W.heightAt(x, z)) + 0.03; stInit = false; R.snap = true; }; // top: on the highest surface (a bridge deck)
  Object.assign(window, { __parts: parts, __game: game, __R: R, __W: W, __cam: cam, __veh: veh, __aimS: aim, __inp: inp, __api: api, __ui: ui });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });
  $('load').style.display = 'none'; music.game();
  if (!qs.has('nohint') && !auto && !R.pose) ui.firstRun();
  if (qs.has('nohud')) { $('ui').style.display = 'none'; R.nohud = true; }
  requestAnimationFrame(frame);
  window.__bld = BL; // building records, boxes and states (test hook)
  let rSave = 0; window.__treesFull = (on) => { if (on) { rSave = rN; rN = RMAX; } else rN = rSave; }; // tests: pretend the felled-tree restore list is full
  window.__sol = SOL; // soldier renderer: out (packed instance matrices), nNear, nFar
  // test hook: soldiers in every pose around (x, z). o: { poses: [..], n, cols, sp (m), yaw, aim, move (walkers and runners advance at their cycle speed), dead: seconds already dead }
  // walkers/runners get their phase advanced every frame; the dead ones fall and then lie still
  window.__infDemo = (x, z, o = {}) => {
    const I = game.inf, d = I.d, poses = o.poses || [0, 1, 2, 5, 3, 7, 4, 6], n = Math.min(MAXI, o.n || poses.length), cols = o.cols || n, sp = o.sp || 2.2, yaw = o.yaw || 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx, sx = new Float32Array(n), sz = new Float32Array(n), pz = new Float32Array(n), ay = new Float32Array(n), ya = new Float32Array(n);
    d.fill(0); SOL.reset();
    for (let i = 0; i < n; i++) { const c = i % cols, r = (i / cols) | 0, ps = poses[i % poses.length], k = i * 8;
      sx[i] = x + rx * (c - (cols - 1) / 2) * sp - fx * r * sp * 1.6; sz[i] = z + rz * (c - (cols - 1) / 2) * sp - fz * r * sp * 1.6;
      d[k] = sx[i]; d[k + 2] = sz[i]; d[k + 1] = W.heightAt(sx[i], sz[i]); d[k + 3] = yaw + (o.jit ? (rnd() - 0.5) * o.jit : 0); d[k + 4] = ps === 6 ? 6 : ps; d[k + 5] = ps === 6 ? (o.dead || 0) : i * 0.37; d[k + 6] = o.aim || 0; d[k + 7] = ps === 6 ? 2 : 1; pz[i] = d[k + 4]; ay[i] = d[k + 6]; ya[i] = d[k + 3]; }
    I.n = n;
    infDemo = (dt) => { for (let i = 0; i < I.n; i++) { const k = i * 8, ps = d[k + 4]; if (d[k + 7] < 0.5) continue; d[k + 5] += dt; if (d[k + 7] === 1) { d[k + 4] = pz[i]; d[k + 6] = ay[i]; d[k + 3] = ya[i]; } // the infantry logic also ticks these slots: keep the demo's pose
      if (o.move && (ps === 1 || ps === 2)) { const v = ps === 1 ? WALK_V : RUN_V, ax = -Math.sin(d[k + 3]), az = -Math.cos(d[k + 3]); d[k] += ax * v * dt; d[k + 2] += az * v * dt;
        if (Math.hypot(d[k] - sx[i], d[k + 2] - sz[i]) > (o.move > 1 ? o.move : 8)) { d[k] = sx[i]; d[k + 2] = sz[i]; } d[k + 1] = W.heightAt(d[k], d[k + 2]); } } };
    return n;
  };
  window.__collBench = (n = 10000) => { const x = veh.x, z = veh.z, v = veh.v, t0 = performance.now(); for (let i = 0; i < n; i++) { veh.x = x; veh.z = z; veh.v = v; collide(1 / 60); } const ms = performance.now() - t0; veh.x = x; veh.z = z; veh.v = v; return ms; }; // collide() cost test
  window.__ready = true;
}
main().catch((e) => { console.error(e); fail('Something went wrong while starting: ' + (e.message || e)); });
