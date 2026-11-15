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
import { perspRZ, lookAt, mul, invert, ortho, clamp, lerp } from './math.js';
import { genWorld, mipChain, WS, HN, HALF, PLAY, MW, NEAR, NCN, FAR, FCN } from './world.js';
import { setTod, updateTod, writeTod, todIndex } from './tod.js';
import { buildGroomer, groomerParts, SWATH, TILL_Z } from './groomer.js';
import { buildTrees } from './trees.js';
import { buildProps } from './props.js';
import { Particles } from './particles.js';
import { initUI, inp } from './ui.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const fail = (m) => { $('load').style.display = 'none'; $('ui').style.display = 'none'; $('err').style.display = 'flex'; $('errp').textContent = m; };

// ---------- quality tiers ----------
const TIERS = {
  low: { name: 'low', scale: 0.6, minScale: 0.4, msaa: 1, shadow: 1024, casc: 2, clipN: 64, mask: 2048, trees: 0.5, lodMul: 0.5, flakes: 2500, parts: 600, maxPx: 1.8e6, aniso: 2 },
  medium: { name: 'medium', scale: 0.8, minScale: 0.5, msaa: 4, shadow: 1536, casc: 2, clipN: 96, mask: 2048, trees: 0.7, lodMul: 0.7, flakes: 6000, parts: 1200, maxPx: 2.8e6, aniso: 4 },
  high: { name: 'high', scale: 1, minScale: 0.6, msaa: 4, shadow: 2048, casc: 3, clipN: 128, mask: 4096, trees: 1, lodMul: 1, flakes: 14000, parts: 2500, maxPx: 9e6, aniso: 8 },
  ultra: { name: 'ultra', scale: 1, minScale: 0.75, msaa: 4, shadow: 4096, casc: 3, clipN: 160, mask: 4096, trees: 1, lodMul: 1.5, flakes: 22000, parts: 3500, maxPx: 16e6, aniso: 16 },
};
const isTouch = qs.has('touch') || (matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints > 0);

// globals buffer float offsets (must match common.wgsl)
const O = { viewProj: 0, invViewProj: 16, shadowMat: 32, camPos: 80, sunDir: 84, sunCol: 88, ambSky: 92, ambGnd: 96, fogCol: 100, fogSun: 104, skyZen: 108, skyHor: 112, skySun: 116, casc: 120, cascTex: 124, misc: 128, l0p: 132, l0d: 136, l0c: 140, l1p: 144, l1d: 148, l1c: 152, l2p: 156, l2d: 160, l2c: 164, world: 168, screen: 172, groom: 176, lod: 180, lod2: 184 };
const GU = new Float32Array(188);

const R = { frame: 0, time: 0, scale: 1, drs: true, snow: 0, snowAmt: 0, debug: false, manual: false, pose: null, gpuMs: 0, ft: 16.7, ftMax: 0, fovK: 1 };
const cam = { x: 0, y: 300, z: 0, yaw: 0, pitch: -0.1, fov: 55 * Math.PI / 180, mode: 0, prevMode: 0, orbYaw: 0, orbPitch: 0.2, dist: 14, baseYaw: 0, cabYaw: 0, cabPitch: -0.08, idle: 9 };
const veh = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0, steer: 0, throttle: 0, tillDown: true, tillPos: 1, setDown: true, setPos: 1, bladePos: 1, dist: 0, trL: 0, trR: 0, yawRate: 0, turbo: false, vYaw: 0, slip: 0, air: false, vy: 0, airT: 0, airX: 0, airZ: 0, airH: 0, hop: false, pitchV: 0, gPrev: 0, shake: 0, land: 0, tillWas: true, setWas: true };
const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16), ivp = new Float32Array(16);
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 8) / 16777216; };

async function main() {
  if (!navigator.gpu) return fail(isSecureContext ? 'Your browser does not expose WebGPU. Use one of these:' : 'WebGPU only works on secure pages (https or localhost). Open this page over https, in one of these browsers:');
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { /* fallthrough */ }
  if (!adapter) return fail('No compatible graphics adapter was found (WebGPU may be disabled or the GPU blocklisted). Supported setups:');
  const wantTS = adapter.features.has('timestamp-query');
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
    tierName = isTouch ? (mem < 4 || small ? 'low' : 'medium') : 'high';
  }
  const Q = TIERS[tierName]; R.Q = Q; R.scale = Q.scale;
  R.drs = qs.get('drs') !== '0' && store.gdrs !== '0';

  const canvas = $('c'), ctx = canvas.getContext('webgpu');
  const cfmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: cfmt, alphaMode: 'opaque' });

  const tick = (m, p) => { $('msg').textContent = m + '…'; $('bar').firstChild.style.width = (p * 100).toFixed(0) + '%'; return new Promise((r) => setTimeout(r, 0)); };
  await tick('Shaping terrain', 0);
  const W = await genWorld(tick, Q);
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
    const a = [], lo = N / 4 + 1, hi = 3 * N / 4 - 1;
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
  const terrMod = mod(common + terrainW, 'terrain');
  const terrPipe = device.createRenderPipeline({
    layout: lay01,
    vertex: { module: terrMod, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
    fragment: { module: terrMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'back', frontFace: 'ccw' }, depthStencil: depthGE, multisample: msState,
  });
  const skyMod = mod(common + skyW, 'sky');
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
  const groomer = mkObj(buildGroomer());
  const props = mkObj(buildProps(W));

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

  // ---------- trees ----------
  const TM = buildTrees();
  const treeVB = mkBuf(TM.v, U.VERTEX), treeIB = mkBuf(TM.i, U.INDEX), treeInst = mkBuf(W.trees.data, U.VERTEX);
  const treeBufs = [{ arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }] },
    { arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }, { shaderLocation: 4, offset: 16, format: 'float32x4' }] }];
  const treeMod = mod(common + treeDefW + treeW, 'tree');
  const treePipe = device.createRenderPipeline({
    layout: lay01, vertex: { module: treeMod, entryPoint: 'vs', buffers: treeBufs }, fragment: { module: treeMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'none' }, depthStencil: depthGE, multisample: { count: Q.msaa, alphaToCoverageEnabled: Q.msaa > 1 },
  });
  const treeShMod = mod(shadowW + treeDefW + shTreeW, 'treeshadow');
  const treeShPipe = device.createRenderPipeline({ layout: layS, vertex: { module: treeShMod, entryPoint: 'vs', buffers: treeBufs }, primitive: { cullMode: 'none' }, depthStencil: shDepth });
  const LK = Q.lodMul * (+qs.get("lod") || 1), LOD = [37 * LK, 180 * LK, 850 * LK];
  const BAND = 0.07, SNOWX = (qs.get('sx') || '1,0.69,0.56,0.4,1,1,0.85,0.52').split(',').map(Number);
  const lodBG = [[0, LOD[0], 0], [LOD[0], LOD[1], 0], [LOD[1], LOD[2], 1], [LOD[2], 1e9, 1]].map((r, i) => device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: mkBuf(new Float32Array([r[0], r[1], r[2], 1, SNOWX[i], BAND, SNOWX[i + 4], 0]), U.UNIFORM) } }] }));
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
  let draws = 0;
  function drawTrees(p, pl, np, maxLod) {
    p.setVertexBuffer(0, treeVB); p.setVertexBuffer(1, treeInst); p.setIndexBuffer(treeIB, 'uint32');
    const ccx = Math.floor((cam.x + HALF) / NEAR), ccz = Math.floor((cam.z + HALF) / NEAR), rad = Math.ceil(LOD[1] / 0.85 * (1 + BAND) / NEAR) + 1;
    const i0 = Math.max(0, ccx - rad), i1 = Math.min(NCN - 1, ccx + rad), j0 = Math.max(0, ccz - rad), j1 = Math.min(NCN - 1, ccz + rad);
    for (let l = 0; l < 2; l++) {
      p.setBindGroup(1, lodBG[l]);
      const lo = l ? LOD[0] / 1.15 * (1 - BAND) : -1, hi = LOD[l] / 0.85 * (1 + BAND);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const nc = j * NCN + i, y0 = TT.nearY[nc * 2], y1 = TT.nearY[nc * 2 + 1]; if (y1 < y0) continue;
        const x0 = i * NEAR - HALF, z0 = j * NEAR - HALF, dh = Math.hypot(x0 + 16 - cam.x, z0 + 16 - cam.z);
        const dy = cam.y > y1 ? cam.y - y1 : cam.y < y0 ? y0 - cam.y : 0, dyM = Math.max(Math.abs(cam.y - y0), Math.abs(cam.y - y1));
        const dmin = Math.hypot(Math.max(0, dh - 23), dy), dmax = Math.hypot(dh + 23, dyM);
        if (dmin >= hi || dmax <= lo) continue;
        if (!vis(pl, np, x0 - 5, y0 - 1, z0 - 5, x0 + NEAR + 5, y1 + 1, z0 + NEAR + 5)) continue;
        let st = TT.nearStart[nc];
        for (let s = 0; s < 3; s++) { const c = TT.nearCnt[nc * 3 + s]; if (c) { const P = TP[l * 3 + s]; p.drawIndexed(P.count, c, P.first, P.base, st); st += c; draws++; } }
      }
    }
    for (let l = 2; l < maxLod; l++) {
      p.setBindGroup(1, lodBG[l]);
      const lo = LOD[l - 1] / 1.15 * (1 - BAND), hi = l === 2 ? LOD[2] / 0.85 * (1 + BAND) : 1e9, P = TP[4 + l];
      for (let fc = 0; fc < FCN * FCN; fc++) {
        const c = TT.farCnt[fc]; if (!c) continue;
        const x0 = (fc % FCN) * FAR - HALF, z0 = ((fc / FCN) | 0) * FAR - HALF, y0 = TT.farY[fc * 2], y1 = TT.farY[fc * 2 + 1];
        const dh = Math.hypot(x0 + 64 - cam.x, z0 + 64 - cam.z), dmin = Math.max(0, dh - 91), dmax = dh + 91 + Math.abs(cam.y - y0);
        if (dmin >= hi || dmax <= lo) continue;
        if (!vis(pl, np, x0 - 8, y0 - 1, z0 - 8, x0 + FAR + 8, y1 + 1, z0 + FAR + 8)) continue;
        p.drawIndexed(P.count, c, P.first, P.base, TT.farStart[fc]); draws++;
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
  const stampMod = mod(stampW, 'stamp');
  const sBlend = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } };
  const stampPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: stampMod, entryPoint: 'vs', buffers: [{ arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map((i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] },
    fragment: { module: stampMod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm', blend: sBlend, writeMask: 7 }, { format: 'rg16float', blend: sBlend }] },
  });
  const stampPass = { colorAttachments: [{ view: maskA.createView(), loadOp: 'load', storeOp: 'store' }, { view: maskB.createView(), loadOp: 'load', storeOp: 'store' }] };
  const stData = new Float32Array(48), stBuf = device.createBuffer({ size: 192, usage: U.VERTEX | U.COPY_DST });
  const stPrev = new Float32Array(12), stCur = new Float32Array(12), stS = new Float32Array(3); let stN = 0, stInit = false, tillWas = false;
  const TEXM = MW / Q.mask;
  { let n = 0; for (const t of W.trails) n += t.n - 1;
    const d = new Float32Array(n * 16); let o = 0;
    for (const t of W.trails) {
      const P = t.pts, hw = SWATH / 2; let px0, pz0, px1, pz1, s = 0;
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
  const SP = new Float32Array([-SWATH / 2, TILL_Z, SWATH / 2, TILL_Z, -2.0, 1.3, -0.9, 1.3, 0.9, 1.3, 2.0, 1.3]);
  function updateStamps() {
    stampPts(stCur); stN = 0;
    if (!stInit) { stPrev.set(stCur); stInit = true; }
    const till = veh.tillPos > 0.97;
    if (till && !tillWas) { stPrev[0] = stCur[0]; stPrev[1] = stCur[1]; stPrev[2] = stCur[2]; stPrev[3] = stCur[3]; }
    tillWas = till;
    for (let k = 0; k < 3; k++) {
      const i = k * 4, mv = Math.hypot(stCur[i] - stPrev[i], stCur[i + 1] - stPrev[i + 1]) + Math.hypot(stCur[i + 2] - stPrev[i + 2], stCur[i + 3] - stPrev[i + 3]);
      if (mv < 0.07) continue;
      if (!(veh.air && veh.y - veh.gPrev > 0.12) && (k > 0 || till)) {
        const o = stN * 16, d = stData;
        d[o] = stPrev[i]; d[o + 1] = stPrev[i + 1]; d[o + 2] = stPrev[i + 2]; d[o + 3] = stPrev[i + 3];
        d[o + 4] = stCur[i]; d[o + 5] = stCur[i + 1]; d[o + 6] = stCur[i + 2]; d[o + 7] = stCur[i + 3];
        d[o + 8] = stS[k]; d[o + 9] = veh.dist;
        if (k === 0) { d[o + 10] = 0; d[o + 11] = 1; d[o + 12] = 1; d[o + 13] = veh.setPos > 0.9 ? 1 : 0; d[o + 14] = 0; }
        else { d[o + 10] = k === 1 ? 0.3 / 4.6 : 3.2 / 4.6; d[o + 11] = k === 1 ? 1.4 / 4.6 : 4.3 / 4.6; d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 1; }
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
    glowN = g.length / 12; glowBuf = mkBuf(new Float32Array(g), U.VERTEX); }
  const em = { spray: 0, exh: 0, smoke: 0, kick: 0, roost: 0 };
  const tmp3 = new Float32Array(3); let fwdX = 0, fwdZ = -1, eBM = null;
  const loc = (lx, ly, lz) => { const B = eBM; tmp3[0] = B[0] * lx + B[4] * ly + B[8] * lz + B[12]; tmp3[1] = B[1] * lx + B[5] * ly + B[9] * lz + B[13]; tmp3[2] = B[2] * lx + B[6] * ly + B[10] * lz + B[14]; };
  function emitParticles(dt, BM) {
    eBM = BM;
    const c = Math.cos(veh.yaw), s = Math.sin(veh.yaw), sp = Math.abs(veh.v), dir = veh.v >= 0 ? 1 : -1;
    if (veh.tillPos > 0.9 && sp > 0.3 && !veh.air) {
      em.spray += dt * sp * 80;
      while (em.spray >= 1) { em.spray--; loc((rnd() - 0.5) * SWATH, 0.12 + rnd() * 0.25, 3.5 + rnd() * 0.6);
        const bk = (0.3 + rnd() * 1.8) * dir, lat = (rnd() - 0.5) * 1.2, vy = 0.6 + rnd() * 2.0;
        if (rnd() < 0.7) parts.emit(tmp3[0], tmp3[1], tmp3[2], s * bk + c * lat, vy, c * bk - s * lat, 0.3 + rnd() * 0.45, 0.007 + rnd() * 0.013, 0, 0, 1, 1, 1, 0.9);
        else { loc((rnd() - 0.5) * SWATH * 0.9, 0.15 + rnd() * 0.15, 4.2 + rnd() * 0.4); parts.emit(tmp3[0], tmp3[1], tmp3[2], s * (0.6 + bk * 0.5) * dir, 0.2 + rnd() * 0.35, c * (0.6 + bk * 0.5) * dir, 0.7 + rnd() * 0.6, 0.16 + rnd() * 0.1, 0.4, 1, 1.2, 1.2, 1.2, 0.11); } }
    }
    if (sp > 0.5 && !veh.air) {
      em.kick += dt * sp * 14;
      while (em.kick >= 1) { em.kick--; const sd = rnd() < 0.5 ? -1 : 1; loc(sd * (0.95 + rnd() * 1.0), 0.15, veh.v > 0 ? 2.2 : -2.2);
        parts.emit(tmp3[0], tmp3[1], tmp3[2], s * dir * (0.5 + rnd()) + c * (rnd() - 0.5), 0.6 + rnd() * 1.6, c * dir * (0.5 + rnd()) - s * (rnd() - 0.5), 0.3 + rnd() * 0.4, 0.007 + rnd() * 0.012, 0, 0, 1, 1, 1, 0.9); }
      if (veh.v > 0.5 && rnd() < dt * sp * 3) { const sd = rnd() < 0.5 ? -1 : 1; loc(sd * 2.45, 0.3 + rnd() * 0.5, -3.7); parts.emit(tmp3[0], tmp3[1], tmp3[2], -s * sp * 0.6 + c * sd * 1.2, 0.5 + rnd(), -c * sp * 0.6 - s * sd * 1.2, 0.4 + rnd() * 0.4, 0.008 + rnd() * 0.014, 0, 0, 1, 1, 1, 0.9); }
    }
    if (veh.turbo && !veh.air && sp > 8) { // powder roost tail behind the tracks
      em.roost += dt * (sp - 6) * (5 + veh.slip * 10);
      while (em.roost >= 1) { em.roost--; const sd = rnd() < 0.5 ? -1 : 1; loc(sd * (1.45 + (rnd() - 0.5) * 0.9), 0.25, 2.3 + rnd() * 0.5);
        parts.emit(tmp3[0], tmp3[1], tmp3[2], -fwdX * sp * (0.1 + rnd() * 0.25) + c * sd * (0.5 + rnd() * 1.5 + veh.slip * 6), 1.2 + rnd() * 2.6, -fwdZ * sp * (0.1 + rnd() * 0.25) - s * sd * (0.5 + rnd() * 1.5 + veh.slip * 6), 1.0 + rnd() * 0.9, 0.4 + rnd() * 0.5, 1.2, 1, 1.25, 1.25, 1.28, 0.2); }
    }
    if (veh.land > 2) { // touchdown burst
      const n = Math.min(160, veh.land * 14);
      for (let i = 0; i < n; i++) { const sd = rnd() < 0.5 ? -1 : 1, a = rnd() * 6.283, r = 1 + rnd() * 4; loc(sd * (1.2 + rnd() * 0.6), 0.2, (rnd() - 0.5) * 4);
        const big = rnd() < 0.5; parts.emit(tmp3[0], tmp3[1], tmp3[2], Math.cos(a) * r + fwdX * sp * 0.3, 1 + rnd() * veh.land * 0.45, Math.sin(a) * r + fwdZ * sp * 0.3, big ? 1.2 + rnd() : 0.5 + rnd() * 0.5, big ? 0.35 + rnd() * 0.4 : 0.01 + rnd() * 0.015, big ? 1 : 0, big ? 1 : 0, 1.25, 1.25, 1.28, big ? 0.12 : 0.9); }
    }
    veh.land = 0;
    em.exh += dt * (5 + 26 * Math.abs(veh.throttle));
    while (em.exh >= 1) { em.exh--; loc(0.98, 3.1, -0.03); parts.emit(tmp3[0], tmp3[1], tmp3[2], (rnd() - 0.5) * 0.4 + fwdX * veh.v * 0.5, 1.8 + rnd() * 1.2, (rnd() - 0.5) * 0.4 + fwdZ * veh.v * 0.5, 1.1 + rnd() * 0.8, 0.1, 0.7, 1, 0.3, 0.31, 0.34, 0.16 + 0.14 * Math.abs(veh.throttle)); }
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
  for (let i = 0; i < NB * 2 + 1; i++) { pU[i] = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST }); pUData[i] = new Float32Array(8); }
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
  const CAMT = ['Chase camera', 'Cab view', 'Orbit camera', 'Free-fly camera'];
  let ui = null;
  function setCam(m) {
    if (m === 3 && cam.mode !== 3) { cam.prevMode = cam.mode; cam.yaw = Math.atan2(view[2], view[10]); cam.pitch = Math.asin(clamp(-view[6], -1, 1)); }
    if (m !== 3 && document.pointerLockElement) document.exitPointerLock();
    if (m === 2 && cam.mode === 0) cam.orbYaw += cam.baseYaw;
    if (m === 0) cam.orbYaw = 0;
    cam.mode = m; ui.toast(CAMT[m] + (m === 3 && !isTouch ? ' — click to look' : ''));
  }
  const api = {
    tiller() { if (veh.turbo) { if (!veh.air) veh.hop = true; return; } veh.tillDown = !veh.tillDown; ui.toast(veh.tillDown ? 'Tiller down' : 'Tiller up'); },
    turbo(v) {
      veh.turbo = v === undefined ? !veh.turbo : !!v; veh.vYaw = veh.yaw; veh.gPrev = veh.y; veh.vy = 0; veh.air = false;
      if (veh.turbo) { veh.tillWas = veh.tillDown; veh.setWas = veh.setDown; veh.tillDown = veh.setDown = false; } else { veh.tillDown = veh.tillWas; veh.setDown = veh.setWas; }
      document.body.classList.toggle('turbo', veh.turbo);
      ui.toast(veh.turbo ? 'TURBO — Shift boost · Space jump · kickers on the lake' : 'Turbo off');
    },
    setter() { veh.setDown = !veh.setDown; ui.toast(veh.setDown ? 'Track-setter down' : 'Track-setter up'); },
    cam() { setCam((cam.mode + 1) % (isTouch ? 4 : 3)); },
    fly() { setCam(cam.mode === 3 ? cam.prevMode : 3); },
    isFly: () => cam.mode === 3,
    snow(v) { R.snow = v === undefined ? 1 - R.snow : v; ui.toast(R.snow ? 'Snowfall on' : 'Snowfall off'); },
    tod(i) { if (i < 0) i = (todIndex + 1) % 4; setTod(i); tshDirty = 2; ui.toast(TODN[i]); },
    debug(v) { R.debug = v === undefined ? !R.debug : !!v; ui.setDebug(R.debug); },
    quality(v) { try { localStorage.gq = v; } catch (e) { /* ignore */ } const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.href; },
    drs(v) { R.drs = !!v; if (!v) R.scale = Q.scale; try { localStorage.gdrs = v ? '1' : '0'; } catch (e) { /* ignore */ } },
    state: () => ({ quality: pref, tod: todIndex, snow: R.snow, drs: R.drs, debug: R.debug, info: `Tier: ${Q.name} · ${R.w}×${R.h} canvas · render scale ${(R.scale * 100).toFixed(0)}% · ${W.trees.count.toLocaleString()} trees` }),
  };
  ui = initUI(api, isTouch);

  // ---------- state ----------
  veh.x = W.start.x; veh.z = W.start.z; veh.yaw = W.start.yaw; veh.y = W.heightAt(veh.x, veh.z); cam.baseYaw = veh.yaw;
  if (qs.get('veh')) { const q = qs.get('veh').split(',').map(Number); veh.x = q[0]; veh.z = q[1]; veh.yaw = q[2] || 0; veh.y = W.heightAt(veh.x, veh.z); cam.baseYaw = veh.yaw; }
  if (qs.get('cam')) R.pose = qs.get('cam').split(',').map(Number);
  setTod(clamp((+qs.get('tod') || 1) - 1, 0, 3), true);
  if (qs.has('snow')) R.snow = 1;
  if (qs.has('debug')) api.debug(1);
  veh.vYaw = veh.yaw; veh.gPrev = veh.y; if (qs.has('turbo')) api.turbo(1);
  GU[O.world] = HALF; GU[O.world + 1] = 1 / WS; GU[O.world + 2] = MW / 2; GU[O.world + 3] = 1 / MW;
  GU[O.screen + 2] = TEXM; GU[O.screen + 3] = Q.mask;
  GU[O.casc + 3] = 1 / Q.shadow; GU[O.lod2 + 2] = Q.msaa;
  const auto = qs.has('auto') ? { i: W.startI } : null;
  if (auto) { const t = W.trails[0]; veh.x = t.pts[auto.i * 2]; veh.z = t.pts[auto.i * 2 + 1]; veh.y = W.heightAt(veh.x, veh.z); }
  R.auto = auto;

  function collide() {
    const C = W.colliders;
    for (let i = 0; i < C.length; i += 3) { const dx = veh.x - C[i], dz = veh.z - C[i + 1], rr = C[i + 2] + 1.9, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), k = (rr - d) / d; veh.x += dx * k; veh.z += dz * k; veh.v *= 0.9; } }
    const cx = Math.floor((veh.x + HALF) / NEAR), cz = Math.floor((veh.z + HALF) / NEAR), T = TT.data;
    for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= NCN || j >= NCN) continue;
      const nc = j * NCN + i, st = TT.nearStart[nc], n = TT.nearCnt[nc * 3] + TT.nearCnt[nc * 3 + 1] + TT.nearCnt[nc * 3 + 2];
      for (let k = st; k < st + n; k++) { const h = T[k * 8 + 3]; if (h < 3.5) continue; const dx = veh.x - T[k * 8], dz = veh.z - T[k * 8 + 2], rr = 1.75 + h * 0.012, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2), q = (rr - d) / d; veh.x += dx * q; veh.z += dz * q; veh.v *= 0.88; } }
    }
  }
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
    veh.throttle = th; veh.steer += (st - veh.steer) * Math.min(1, dt * (veh.turbo ? 8 : 5));
    fwdX = -Math.sin(veh.yaw); fwdZ = -Math.cos(veh.yaw);
    const sp = Math.abs(veh.v);
    if (!veh.turbo) {
      const vmax = (th >= 0 ? 6.2 : 3.2) * (veh.tillPos > 0.5 ? 0.92 : 1);
      const climb = Math.sin(veh.pitch) * (veh.v >= 0 ? 1 : -1);
      const target = th * vmax * (1 - 0.8 * clamp(climb / 0.5, 0, 1));
      veh.v += (target - veh.v) * Math.min(1, dt * 1.5) - 9.8 * Math.sin(veh.pitch) * 0.1 * dt;
      if (th === 0 && Math.abs(veh.v) < 0.25) veh.v *= 1 - Math.min(1, dt * 6);
      veh.yawRate = veh.steer * lerp(0.95, 0.55, Math.min(1, sp / 6)) * (veh.v < -0.2 ? -1 : 1);
      veh.vYaw = veh.yaw + veh.yawRate * dt;
    } else { // arcade: momentum, full slope gravity, boost, drift, no traction in the air
      const boost = inp.fast && th > 0, vmax = boost ? 38 : 25;
      if (!veh.air) {
        if (th > 0) veh.v += th * (boost ? 10 : 6.5) * (veh.v < 0 ? 2 : 1 - clamp(veh.v / vmax, 0, 1) ** 2) * dt;
        else if (th < 0) veh.v = veh.v > 0.3 ? Math.max(0, veh.v + th * 16 * dt) : Math.max(-8, veh.v + th * 5 * dt);
        veh.v -= (9.8 * Math.sin(veh.pitch) + veh.v * (th === 0 ? 0.3 : 0.05) + (veh.v > vmax ? (veh.v - vmax) * 0.8 : 0)) * dt;
        if (th === 0 && sp < 0.3) veh.v *= 1 - Math.min(1, dt * 6);
      }
      veh.yawRate = veh.steer * (veh.air ? 0.35 : lerp(1.15, 0.62, Math.min(1, sp / 30))) * (veh.v < -0.2 ? -1 : 1);
      let dy = veh.yaw + veh.yawRate * dt - veh.vYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const grip = veh.air ? 0 : lerp(14, 2.6, clamp((sp - 6) / 26, 0, 1)) * (boost ? 0.8 : 1);
      veh.vYaw += dy * Math.min(1, dt * grip); veh.slip = Math.abs(Math.sin(dy));
      if (!veh.air) veh.v *= 1 - veh.slip * 0.5 * dt;
    }
    veh.yaw += veh.yawRate * dt;
    veh.dist += veh.v * dt; veh.trL += (veh.v + veh.yawRate * 1.45) * dt; veh.trR += (veh.v - veh.yawRate * 1.45) * dt;
    veh.tillPos = clamp(veh.tillPos + (veh.tillDown ? dt : -dt) * 1.3, 0, 1); veh.setPos = clamp(veh.setPos + (veh.setDown ? dt : -dt) * 1.6, 0, 1);
    const mx = -Math.sin(veh.vYaw), mz = -Math.cos(veh.vYaw);
    veh.x = clamp(veh.x + mx * veh.v * dt, -PLAY, PLAY); veh.z = clamp(veh.z + mz * veh.v * dt, -PLAY, PLAY);
    if (!veh.turbo) veh.vYaw = veh.yaw;
    fwdX = -Math.sin(veh.yaw); fwdZ = -Math.cos(veh.yaw);
    const v0 = Math.abs(veh.v); collide();
    if (veh.turbo && v0 > 6 && Math.abs(veh.v) < v0 * 0.9) { veh.shake = Math.max(veh.shake, Math.min(1, v0 / 22)); veh.v *= 0.55; }
    const rx = -fwdZ, rz = fwdX, hl = 1.9, hw = 1.3, h = W.heightAt, fx = fwdX, fz = fwdZ;
    const a = h(veh.x + fx * hl + rx * hw, veh.z + fz * hl + rz * hw), b = h(veh.x + fx * hl - rx * hw, veh.z + fz * hl - rz * hw), c = h(veh.x - fx * hl + rx * hw, veh.z - fz * hl + rz * hw), d = h(veh.x - fx * hl - rx * hw, veh.z - fz * hl - rz * hw);
    const gY = (a + b + c + d) / 4 + 0.03, gV = clamp((gY - veh.gPrev) / dt, -40, 40); veh.gPrev = gY;
    const bob = Math.sin(R.time * 31) * 0.004 * Math.min(1, sp) + Math.sin(veh.dist * 2.1) * 0.012;
    veh.shake *= 1 - Math.min(1, dt * 3.5);
    if (!veh.turbo) {
      const k = Math.min(1, dt * 6);
      veh.pitch += (Math.atan2((a + b - c - d) / 2, hl * 2) - veh.pitch) * k; veh.roll += (Math.atan2((a + c - b - d) / 2, hw * 2) - veh.roll) * k;
      veh.y += (gY + bob - veh.y) * Math.min(1, dt * 12); veh.air = false; veh.vy = 0;
      return;
    }
    const G = 10.5;
    if (!veh.air) {
      const ball = veh.y + veh.vy * dt - 0.5 * G * dt * dt;
      if (veh.hop || (gY < ball - 0.04 && sp > 4)) { // leave the ground: crest, kicker lip or hop
        veh.air = true; veh.airT = 0; veh.airX = veh.x; veh.airZ = veh.z; veh.airH = 0;
        if (veh.hop) { veh.vy = Math.max(veh.vy, 0) + 6.5; veh.y += 0.05; } else { veh.y = ball; if (veh.vy > 1.5) veh.vy *= 1.25; }
        veh.pitchV = 0;
      } else { veh.vy = gV; veh.y = gY; }
      veh.hop = false;
    }
    if (veh.air) {
      veh.vy -= G * dt; veh.y += veh.vy * dt; veh.airT += dt; veh.airH = Math.max(veh.airH, veh.y - gY);
      veh.pitch += (clamp(Math.atan2(veh.vy, Math.max(sp, 3)) * 0.6, -0.55, 0.5) - veh.pitch) * Math.min(1, dt * 1.4);
      veh.roll *= 1 - Math.min(1, dt * 1.2);
      if (veh.y <= gY) { // touchdown
        const imp = Math.max(0, gV - veh.vy);
        veh.air = false; veh.y = gY; veh.vy = gV; veh.land = imp;
        veh.shake = Math.max(veh.shake, Math.min(1.3, imp / 9)); veh.v *= 1 - Math.min(0.3, imp * 0.012);
        if (veh.airT > 0.7) { const dd = Math.hypot(veh.x - veh.airX, veh.z - veh.airZ); ui.toast(`AIR ${veh.airT.toFixed(1)} s · ${dd.toFixed(0)} m · ${veh.airH.toFixed(1)} m high`); }
      }
    }
    if (!veh.air) {
      const k = Math.min(1, dt * 14);
      veh.pitch += (Math.atan2((a + b - c - d) / 2, hl * 2) - veh.pitch) * k; veh.roll += (Math.atan2((a + c - b - d) / 2, hw * 2) + veh.yawRate * sp * 0.006 - veh.roll) * k;
    }
  }
  function updateCamera(dt, BM) {
    const sens = isTouch ? 0.006 : 0.0045;
    if (cam.mode === 3) {
      cam.yaw -= inp.lookX * sens * 0.7; cam.pitch = clamp(cam.pitch - inp.lookY * sens * 0.7, -1.5, 1.5);
      const cp = Math.cos(cam.pitch), fx = -Math.sin(cam.yaw) * cp, fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * cp, sp = (inp.fast ? 70 : 14) * dt;
      cam.x = clamp(cam.x + (fx * inp.mvZ + Math.cos(cam.yaw) * inp.mvX) * sp, -1950, 1950); cam.z = clamp(cam.z + (fz * inp.mvZ - Math.sin(cam.yaw) * inp.mvX) * sp, -1950, 1950);
      cam.y = clamp(cam.y + (fy * inp.mvZ + inp.mvY) * sp, W.heightAt(cam.x, cam.z) + 0.7, 1500);
      lookAt(view, cam.x, cam.y, cam.z, cam.x + fx, cam.y + fy, cam.z + fz, 0, 1, 0);
    } else if (cam.mode === 1) {
      cam.cabYaw = clamp(cam.cabYaw - inp.lookX * sens, -2.7, 2.7); cam.cabPitch = clamp(cam.cabPitch - inp.lookY * sens, -0.8, 0.6);
      const cp = Math.cos(cam.cabPitch), lx = -Math.sin(cam.cabYaw) * cp, ly = Math.sin(cam.cabPitch), lz = -Math.cos(cam.cabYaw) * cp, ex = 0, ey = 2.08, ez = -1.75;
      cam.x = BM[0] * ex + BM[4] * ey + BM[8] * ez + BM[12]; cam.y = BM[1] * ex + BM[5] * ey + BM[9] * ez + BM[13]; cam.z = BM[2] * ex + BM[6] * ey + BM[10] * ez + BM[14];
      lookAt(view, cam.x, cam.y, cam.z, cam.x + BM[0] * lx + BM[4] * ly + BM[8] * lz, cam.y + BM[1] * lx + BM[5] * ly + BM[9] * lz, cam.z + BM[2] * lx + BM[6] * ly + BM[10] * lz, BM[4], BM[5], BM[6]);
    } else {
      cam.orbYaw -= inp.lookX * sens; cam.orbPitch = clamp(cam.orbPitch + inp.lookY * sens, -0.12, 1.35); cam.dist = clamp(cam.dist * Math.exp(inp.zoom), 6, 70);
      let d = veh.yaw - cam.baseYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.baseYaw += d * Math.min(1, dt * 2.6);
      if (cam.mode === 0) { cam.idle = inp.drag || inp.lookX || inp.lookY ? 0 : cam.idle + dt; if (cam.idle > 3 && Math.abs(veh.v) > 0.6) { cam.orbYaw = Math.atan2(Math.sin(cam.orbYaw), Math.cos(cam.orbYaw)); cam.orbYaw *= 1 - Math.min(1, dt * 1.2); } }
      const yaw = (cam.mode === 0 ? cam.baseYaw : 0) + cam.orbYaw, cp = Math.cos(cam.orbPitch);
      const tx = veh.x + fwdX * 1.2, ty = veh.y + 2.1, tz = veh.z + fwdZ * 1.2, cd = cam.dist * (veh.turbo ? 1 + 0.5 * clamp(Math.abs(veh.v) / 30, 0, 1) : 1);
      const ex = tx + Math.sin(yaw) * cp * cd, ez = tz + Math.cos(yaw) * cp * cd;
      const ey = Math.max(ty + Math.sin(cam.orbPitch) * cd, W.heightAt(ex, ez) + 1.1);
      const k = R.frame < 3 || R.snap ? 1 : Math.min(1, dt * 9); R.snap = false;
      cam.x += (ex - cam.x) * k; cam.y += (ey - cam.y) * k; cam.z += (ez - cam.z) * k;
      cam.y = Math.max(cam.y, W.heightAt(cam.x, cam.z) + 0.8);
      const sk = veh.shake * veh.shake * 0.35, t = R.time;
      lookAt(view, cam.x + Math.sin(t * 37) * sk, cam.y + Math.sin(t * 43 + 1) * sk, cam.z + Math.sin(t * 29 + 2) * sk, tx, ty, tz, 0, 1, 0);
    }
    inp.lookX = inp.lookY = inp.zoom = 0;
    if (R.pose) { const q = R.pose; cam.x = q[0]; cam.y = q[1]; cam.z = q[2]; const cp = Math.cos(q[4]); lookAt(view, q[0], q[1], q[2], q[0] - Math.sin(q[3]) * cp, q[1] + Math.sin(q[4]), q[2] - Math.cos(q[3]) * cp, 0, 1, 0); }
  }
  function setLight(o, BM, lx, ly, lz, dx, dy, dz, range, outer, inner, r, g, b) {
    GU[o] = BM[0] * lx + BM[4] * ly + BM[8] * lz + BM[12]; GU[o + 1] = BM[1] * lx + BM[5] * ly + BM[9] * lz + BM[13]; GU[o + 2] = BM[2] * lx + BM[6] * ly + BM[10] * lz + BM[14]; GU[o + 3] = range;
    const l = 1 / Math.hypot(dx, dy, dz); dx *= l; dy *= l; dz *= l;
    GU[o + 4] = BM[0] * dx + BM[4] * dy + BM[8] * dz; GU[o + 5] = BM[1] * dx + BM[5] * dy + BM[9] * dz; GU[o + 6] = BM[2] * dx + BM[6] * dy + BM[10] * dz; GU[o + 7] = outer;
    GU[o + 8] = r; GU[o + 9] = g; GU[o + 10] = b; GU[o + 11] = inner;
  }
  // dynamic resolution
  let dAcc = 0, dN = 0, dCeil = 9, dCeilT = 0, dUp = false;
  function drs(raw) {
    dAcc += raw; dN++; if (dN < 20) return;
    const ft = dAcc / dN * 1000; dAcc = 0; dN = 0; R.ft = ft;
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
    ui.poll(cam.mode === 3);
    simulate(dt);
    const BM = groomerParts(groomer.d, veh);
    updateCamera(dt, BM);
    R.snowAmt += (R.snow - R.snowAmt) * Math.min(1, dt * 0.8);

    const rw = Math.max(8, Math.round(R.w * R.scale)), rh = Math.max(8, Math.round(R.h * R.scale));
    R.fovK += ((veh.turbo && cam.mode !== 3 ? 1 + 0.22 * clamp((Math.abs(veh.v) - 8) / 28, 0, 1) : 1) - R.fovK) * Math.min(1, dt * 2);
    const fovy = cam.fov * (R.w < R.h ? 1.3 : 1) * (cam.mode === 1 ? 1.15 : 1) * R.fovK;
    perspRZ(proj, fovy, rw / rh, cam.mode === 1 ? 0.12 : 0.25);
    mul(vp, proj, view); invert(ivp, vp);
    GU.set(vp, O.viewProj); GU.set(ivp, O.invViewProj);
    GU[O.camPos] = cam.x; GU[O.camPos + 1] = cam.y; GU[O.camPos + 2] = cam.z; GU[O.camPos + 3] = R.time;
    writeTod(GU, O);
    GU[O.groom] = veh.x; GU[O.groom + 1] = veh.y; GU[O.groom + 2] = veh.z; GU[O.lod2] = Q.casc === 3 ? 1 : 0; GU[O.lod2 + 3] = (cam.mode === 0 || cam.mode === 2) && !R.pose ? 1.5 : 0;
    GU[O.misc + 1] = R.snowAmt; GU[O.screen] = rw; GU[O.screen + 1] = rh; GU[O.groom + 3] = cam.mode === 1 && !R.pose ? 1 : 0;
    if (R.snowAmt > 0.01) { const k = 1 - 0.55 * R.snowAmt; GU[O.sunCol] *= k; GU[O.sunCol + 1] *= k; GU[O.sunCol + 2] *= k; GU[O.fogCol + 3] *= 1 + 5 * R.snowAmt; GU[O.skyHor + 3] = Math.min(1.6, GU[O.skyHor + 3] + R.snowAmt); }
    updateCascades(rw / rh, fovy);
    planesFrom(camPlanes, vp, 5); draws = 0;
    updateStamps();
    const nt = 0.12 + 0.88 * GU[O.misc];
    groomer.d[128] = veh.trL; groomer.d[129] = veh.trR; groomer.d[131] = 1;
    device.queue.writeBuffer(groomer.u, 0, groomer.d);
    setLight(O.l0p, BM, 0, 2.7, -2.15, 0, -0.2, -1, 90, Math.cos(0.98), Math.cos(0.2), 1.25 * nt, 1.18 * nt, 1.0 * nt);
    setLight(O.l1p, BM, 0, 2.65, -0.2, 0, -0.5, 1, 32, Math.cos(1.1), Math.cos(0.5), 0.5 * nt, 0.48 * nt, 0.42 * nt);
    { const a = R.time * 5.5, o = O.l2p; GU[o] = BM[0] * 0.6 + BM[4] * 2.75 + BM[8] * -1.1 + BM[12]; GU[o + 1] = BM[1] * 0.6 + BM[5] * 2.75 + BM[9] * -1.1 + BM[13]; GU[o + 2] = BM[2] * 0.6 + BM[6] * 2.75 + BM[10] * -1.1 + BM[14]; GU[o + 3] = 26;
      GU[o + 4] = Math.cos(a); GU[o + 5] = -0.1; GU[o + 6] = Math.sin(a); GU[o + 8] = 0.8 * nt; GU[o + 9] = 0.3 * nt; GU[o + 10] = 0.03 * nt; }
    device.queue.writeBuffer(gBuf, 0, GU);
    for (let l = 0; l < NL; l++) {
      const c = lvCell(l);
      lvData[0] = Math.floor(cam.x / (2 * c)) * 2 * c - N / 2 * c; lvData[1] = Math.floor(cam.z / (2 * c)) * 2 * c - N / 2 * c; lvData[2] = c; lvData[3] = N;
      device.queue.writeBuffer(lvBuf[l], 0, lvData);
    }
    emitParticles(dt, BM);
    const pn = parts.update(dt, W.heightAt, 1.3, 0.5);
    if (pn) device.queue.writeBuffer(partBuf, 0, parts.out, 0, pn * 12);

    const enc = device.createCommandEncoder();
    if (tshDirty > 0 && (--tshDirty === 0 || (R.frame & 3) === 0)) {
      tshD[0] = GU[O.sunDir]; tshD[1] = GU[O.sunDir + 1]; tshD[2] = GU[O.sunDir + 2]; device.queue.writeBuffer(tshU, 0, tshD);
      const tp = enc.beginRenderPass(tshPass); tp.setPipeline(tshPipe); tp.setBindGroup(0, tshBG); tp.draw(3); tp.end();
    }
    if (stN) { const sp = enc.beginRenderPass(stampPass); sp.setPipeline(stampPipe); sp.setVertexBuffer(0, stBuf); sp.draw(6, stN); sp.end(); }
    for (let c = 0; c < NC; c++) {
      if (skipCasc(c)) continue;
      const sp = enc.beginRenderPass(shPass[c]);
      sp.setBindGroup(0, shBG[c]);
      sp.setPipeline(objShPipe); sp.setBindGroup(1, groomer.bg); sp.setVertexBuffer(0, groomer.vb); sp.setIndexBuffer(groomer.ib, 'uint32'); sp.drawIndexed(groomer.n);
      sp.setBindGroup(1, props.bg); sp.setVertexBuffer(0, props.vb); sp.setIndexBuffer(props.ib, 'uint32'); sp.drawIndexed(props.n);
      sp.setPipeline(treeShPipe); drawTrees(sp, shPlanes[c], 4, 3);
      sp.end();
    }
    const p = enc.beginRenderPass(mainPass);
    p.setViewport(0, 0, rw, rh, 0, 1); p.setScissorRect(0, 0, rw, rh);
    p.setBindGroup(0, bg0);
    p.setPipeline(objPipe); p.setBindGroup(1, groomer.bg); p.setVertexBuffer(0, groomer.vb); p.setIndexBuffer(groomer.ib, 'uint32'); p.drawIndexed(groomer.n);
    p.setBindGroup(1, props.bg); p.setVertexBuffer(0, props.vb); p.setIndexBuffer(props.ib, 'uint32'); p.drawIndexed(props.n);
    p.setPipeline(treePipe); drawTrees(p, camPlanes, 5, 4);
    p.setPipeline(terrPipe); p.setVertexBuffer(0, tvb);
    for (let l = 0; l < NL; l++) {
      p.setBindGroup(1, lvBG[l]);
      if (l === 0) { p.setIndexBuffer(tibF, 'uint32'); p.drawIndexed(tiFull.length); } else { if (l === 1) p.setIndexBuffer(tibR, 'uint32'); p.drawIndexed(tiRing.length); }
    }
    p.setPipeline(skyPipe); p.draw(3);
    p.setPipeline(partPipe);
    if (GU[O.misc] > 0.02) { p.setVertexBuffer(0, glowBuf); p.draw(4, glowN); }
    if (pn) { p.setVertexBuffer(0, partBuf); p.draw(4, pn); }
    if (R.snowAmt > 0.01) { p.setPipeline(flakePipe); p.draw(4, Math.round(Q.flakes * Math.min(1, R.snowAmt * 1.5))); }
    p.end();

    const sx = rw / R.w, sy = rh / R.h, expo = GU[O.misc + 2];
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
    const fu = pUData[NB * 2]; fu[0] = sx; fu[1] = sy; fu[2] = 1 / R.w; fu[3] = 1 / R.h; fu[4] = expo; fu[5] = 0.1; fu[6] = R.manual ? 0.37 : R.time; fu[7] = R.scale < 0.99 ? 1 : 0;
    device.queue.writeBuffer(pU[NB * 2], 0, fu);
    finalPass.colorAttachments[0].view = ctx.getCurrentTexture().createView();
    const fp = enc.beginRenderPass(finalPass); fp.setPipeline(finalPipe); fp.setBindGroup(0, finalBG); fp.draw(3); fp.end();
    let ri = -1;
    if (ts && (perf || (R.frame & 3) === 0)) { enc.resolveQuerySet(ts.qs, 0, 2, ts.res, 0); for (let i = 0; i < 3; i++) if (!ts.busy[i]) { ri = i; break; } if (ri >= 0) enc.copyBufferToBuffer(ts.res, 0, ts.rb[ri], 0, 16); }
    device.queue.submit([enc.finish()]);
    if (ri >= 0) { ts.busy[ri] = true; ts.rb[ri].mapAsync(GPUMapMode.READ).then(ts.cb[ri]); }

    drs(raw); if (raw * 1000 > R.ftMax) R.ftMax = raw * 1000;
    ui.hud(Math.min(199, Math.round(Math.abs(veh.v) * 3.6)), veh.tillDown ? 1 : 0, veh.setDown ? 1 : 0, cam.mode);
    if (R.debug && (dbgT += raw) > 0.5) { dbgT = 0; ui.dbgText(`${(1000 / R.ft).toFixed(0)} fps  ${R.ft.toFixed(1)} ms (max ${R.ftMax.toFixed(0)})\ngpu ${R.gpuMs ? R.gpuMs.toFixed(1) + ' ms' : 'n/a'}\ntier ${Q.name}  scale ${(R.scale * 100).toFixed(0)}%\n${rw}×${rh} → ${R.w}×${R.h}  msaa ${Q.msaa}\ndraws ${draws}  particles ${pn}`); R.ftMax = 0; }
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
  window.__info = () => `tier=${Q.name} ${R.w}x${R.h} scale=${R.scale.toFixed(2)} trees=${W.trees.count} draws=${draws} gpu=${R.gpuMs.toFixed(2)}ms ft=${R.ft.toFixed(2)}`;
  window.__pose = (q, tod) => { R.pose = q; if (tod) { setTod(tod - 1, true); tshDirty = 1; } };
  window.__look = (ex, eh, ez, tx, th, tz) => { const ey = W.heightAt(ex, ez) + eh, ty = W.heightAt(tx, tz) + th, dx = tx - ex, dy = ty - ey, dz = tz - ez; R.pose = [ex, ey, ez, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  window.__chase = (yaw, pitch, dist) => { R.pose = null; cam.mode = 0; cam.orbYaw = yaw; cam.orbPitch = pitch; cam.dist = dist; cam.idle = -1e9; R.snap = true; };
  window.__tod = (i) => { setTod(i - 1, true); tshDirty = 1; };
  window.__tp = (x, z, yaw) => { veh.x = x; veh.z = z; veh.yaw = veh.vYaw = yaw; veh.v = 0; veh.vy = 0; veh.air = false; veh.y = veh.gPrev = W.heightAt(x, z) + 0.03; cam.baseYaw = yaw; stInit = false; R.snap = true; };
  Object.assign(window, { __R: R, __W: W, __cam: cam, __veh: veh, __inp: inp, __api: api, __ui: ui });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });
  $('load').style.display = 'none';
  if (!qs.has('nohint') && !auto && !R.pose) ui.firstRun();
  if (qs.has('nohud')) $('ui').style.display = 'none';
  requestAnimationFrame(frame);
  window.__ready = true;
}
main().catch((e) => { console.error(e); fail('Something went wrong while starting: ' + (e.message || e)); });
