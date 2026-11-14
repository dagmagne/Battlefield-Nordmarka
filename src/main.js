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
import { buildTrees } from './trees.js';
import { NEAR, NCN, FAR, FCN } from './world.js';
import { ortho } from './math.js';
import tshW from './tshadow.wgsl';
import { buildProps } from './props.js';
import { buildGroomer, groomerParts, TILL_Z, SWATH } from './groomer.js';
import { perspRZ, lookAt, mul, invert, clamp, lerp } from './math.js';
import { genWorld, mipChain, WS, HN, HALF, PLAY } from './world.js';
import { setTod, updateTod, writeTod, todIndex } from './tod.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const fail = (m) => { $('load').style.display = 'none'; $('err').style.display = 'flex'; $('errp').textContent = m; };

// ---------- quality tiers ----------
const TIERS = {
  low: { name: 'low', scale: 0.62, minScale: 0.4, msaa: 1, shadow: 1024, casc: 2, clipN: 64, mask: 2048, trees: 0.45, lodMul: 0.5, flakes: 2500, bloom: 1, maxPx: 1.7e6 },
  medium: { name: 'medium', scale: 0.8, minScale: 0.5, msaa: 4, shadow: 1024, casc: 2, clipN: 96, mask: 2048, trees: 0.65, lodMul: 0.7, flakes: 5000, bloom: 1, maxPx: 2.6e6 },
  high: { name: 'high', scale: 1, minScale: 0.6, msaa: 4, shadow: 2048, casc: 3, clipN: 128, mask: 4096, trees: 1, lodMul: 1, flakes: 12000, bloom: 1, maxPx: 9e6 },
  ultra: { name: 'ultra', scale: 1, minScale: 0.7, msaa: 4, shadow: 4096, casc: 3, clipN: 160, mask: 4096, trees: 1, lodMul: 1.5, flakes: 20000, bloom: 1, maxPx: 16e6 },
};
const isTouch = qs.has('touch') || (matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints > 0);

// globals buffer float offsets
const O = { viewProj: 0, invViewProj: 16, shadowMat: 32, camPos: 80, sunDir: 84, sunCol: 88, ambSky: 92, ambGnd: 96, fogCol: 100, fogSun: 104, skyZen: 108, skyHor: 112, skySun: 116, casc: 120, cascTex: 124, misc: 128, l0p: 132, l0d: 136, l0c: 140, l1p: 144, l1d: 148, l1c: 152, l2p: 156, l2d: 160, l2c: 164, world: 168, screen: 172, groom: 176, lod: 180, lod2: 184 };
const GU = new Float32Array(188);

const R = { frame: 0, time: 0, scale: 1 }; // renderer state
const cam = { x: 0, y: 300, z: 0, yaw: 0, pitch: -0.2, fov: 55 * Math.PI / 180, mode: 0, orbYaw: 0, orbPitch: 0.22, dist: 13, tx: 0, ty: 0, tz: 0 };
const veh = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0, steer: 0, throttle: 0, tillDown: true, tillPos: 1, setDown: true, setPos: 1, bladePos: 1, dist: 0, trL: 0, trR: 0, yawRate: 0 };
const keys = new Set();
const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16), ivp = new Float32Array(16);

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
  let tierName = qs.get('q') || localStorage.getItem('gq') || 'auto';
  if (!TIERS[tierName]) {
    const mem = navigator.deviceMemory || 4, small = Math.min(screen.width, screen.height) < 500;
    tierName = isTouch ? (mem <= 4 && small ? 'low' : 'medium') : 'high';
  }
  const Q = TIERS[tierName]; R.Q = Q; R.scale = Q.scale;

  const canvas = $('c'), ctx = canvas.getContext('webgpu');
  const cfmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: cfmt, alphaMode: 'opaque' });

  const tick = (m, p) => { $('msg').textContent = m + '…'; $('bar').firstChild.style.width = (p * 100).toFixed(0) + '%'; return new Promise((r) => setTimeout(r, 0)); };
  await tick('Shaping terrain', 0);
  const W = await genWorld(tick, Q);
  await tick('Uploading', 0.96);

  // ---------- static textures ----------
  const lin = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', maxAnisotropy: 4 });
  const linClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const shSmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
  const heightTex = device.createTexture({ size: [HN, HN], format: 'r32float', usage: 6 });
  device.queue.writeTexture({ texture: heightTex }, W.H, { bytesPerRow: HN * 4 }, [HN, HN]);
  const mkMip = (data) => {
    const chain = mipChain(data, HN), t = device.createTexture({ size: [HN, HN], format: 'rgba8unorm', usage: 6, mipLevelCount: chain.length });
    chain.forEach((d, i) => { const s = HN >> i; device.queue.writeTexture({ texture: t, mipLevel: i }, d, { bytesPerRow: s * 4 }, [s, s]); });
    return t;
  };
  const normTex = mkMip(W.nrm), matTex = mkMip(W.mat);
  const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING;
  const tshTex = device.createTexture({ size: [1024, 1024], format: 'rg16float', usage: RA | TB });
  const maskA = device.createTexture({ size: [Q.mask, Q.mask], format: 'rgba8unorm', usage: RA | TB });
  const maskB = device.createTexture({ size: [Q.mask, Q.mask], format: 'rg16float', usage: RA | TB });
  const shadowTex = device.createTexture({ size: [Q.shadow, Q.shadow, 3], format: 'depth32float', usage: RA | TB });
  const shadowViews = [0, 1, 2].map((i) => shadowTex.createView({ dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1 }));
  { // initial clears
    const e = device.createCommandEncoder();
    e.beginRenderPass({ colorAttachments: [{ view: tshTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [-100, 1, 0, 0] }] }).end();
    e.beginRenderPass({ colorAttachments: [{ view: maskA.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }, { view: maskB.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] }).end();
    for (const v of shadowViews) e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: v, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 } }).end();
    device.queue.submit([e.finish()]);
  }

  // ---------- globals ----------
  const gBuf = device.createBuffer({ size: GU.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
  const mkBuf = (data, usage) => { const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(b, 0, data); return b; };
  const tvb = mkBuf(tv, GPUBufferUsage.VERTEX), tiFull = mkIdx(false), tiRing = mkIdx(true);
  const tibF = mkBuf(tiFull, GPUBufferUsage.INDEX), tibR = mkBuf(tiRing, GPUBufferUsage.INDEX);
  const bglL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: {} }] });
  const lvBuf = [], lvBG = [], lvData = new Float32Array(4);
  for (let l = 0; l < NL; l++) { lvBuf[l] = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); lvBG[l] = device.createBindGroup({ layout: bglL, entries: [{ binding: 0, resource: { buffer: lvBuf[l] } }] }); }
  const terrMod = mod(common + terrainW, 'terrain');
  const depthGE = { format: DF, depthWriteEnabled: true, depthCompare: 'greater' };
  const terrPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglL] }),
    vertex: { module: terrMod, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
    fragment: { module: terrMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'back', frontFace: 'ccw' }, depthStencil: depthGE, multisample: msState,
  });
  const skyMod = mod(common + skyW, 'sky');
  const skyPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0] }),
    vertex: { module: skyMod, entryPoint: 'vs' }, fragment: { module: skyMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DF, depthWriteEnabled: false, depthCompare: 'equal' }, multisample: msState,
  });

  // ---------- objects (groomer + props) ----------
  const bglO = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: {} }] });
  const objMod = mod(common + objDefW + objectW, 'object');
  const objVB = [{ arrayStride: 56, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }, { shaderLocation: 3, offset: 40, format: 'float32x4' }] }];
  const objPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglO] }),
    vertex: { module: objMod, entryPoint: 'vs', buffers: objVB }, fragment: { module: objMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'none' }, depthStencil: depthGE, multisample: msState,
  });
  const mkObj = (mesh) => {
    const u = device.createBuffer({ size: 528, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), d = new Float32Array(132);
    for (let i = 0; i < 8; i++) d[i * 16] = d[i * 16 + 5] = d[i * 16 + 10] = d[i * 16 + 15] = 1;
    device.queue.writeBuffer(u, 0, d);
    return { vb: mkBuf(mesh.v, GPUBufferUsage.VERTEX), ib: mkBuf(mesh.i, GPUBufferUsage.INDEX), n: mesh.i.length, u, d, bg: device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: u } }] }) };
  };
  const groomer = mkObj(buildGroomer());
  const props = mkObj(buildProps(W));
  // terrain shadow bake
  const tshMod = mod(tshW, 'tshadow');
  const tshPipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: tshMod, entryPoint: 'vs' }, fragment: { module: tshMod, entryPoint: 'fs', targets: [{ format: 'rg16float' }] } });
  const tshU = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), tshD = new Float32Array(4);
  const tshBG = device.createBindGroup({ layout: tshPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: tshU } }, { binding: 1, resource: heightTex.createView() }] });
  const tshPass = { colorAttachments: [{ view: tshTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] };
  let tshDirty = 3;

  // ---------- shadows ----------
  const NC = Q.casc, SPLITS = Q.casc === 3 ? [26, 105, 420] : [38, 190, 190];
  const bglS = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: {} }] });
  const shU = [], shBG = [], shData = [], shPass = [], shPlanes = [];
  for (let i = 0; i < 3; i++) {
    shU[i] = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); shData[i] = new Float32Array(20); shPlanes[i] = new Float32Array(16);
    shBG[i] = device.createBindGroup({ layout: bglS, entries: [{ binding: 0, resource: { buffer: shU[i] } }] });
    shPass[i] = { colorAttachments: [], depthStencilAttachment: { view: shadowViews[i], depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 } };
  }
  const shDepth = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 };
  const objShMod = mod(shadowW + objDefW + shObjW, 'objshadow');
  const objShPipe = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglS, bglO] }), vertex: { module: objShMod, entryPoint: 'vs', buffers: objVB }, primitive: { cullMode: 'none' }, depthStencil: shDepth });

  // ---------- trees ----------
  const TM = buildTrees();
  const treeVB = mkBuf(TM.v, GPUBufferUsage.VERTEX), treeIB = mkBuf(TM.i, GPUBufferUsage.INDEX), treeInst = mkBuf(W.trees.data, GPUBufferUsage.VERTEX);
  const treeBufs = [{ arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }] },
    { arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }, { shaderLocation: 4, offset: 16, format: 'float32x4' }] }];
  const treeMod = mod(common + treeDefW + treeW, 'tree');
  const treePipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglO] }),
    vertex: { module: treeMod, entryPoint: 'vs', buffers: treeBufs }, fragment: { module: treeMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { cullMode: 'none' }, depthStencil: depthGE, multisample: { count: Q.msaa, alphaToCoverageEnabled: Q.msaa > 1 },
  });
  const treeShMod = mod(shadowW + treeDefW + shTreeW, 'treeshadow');
  const treeShPipe = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglS, bglO] }), vertex: { module: treeShMod, entryPoint: 'vs', buffers: treeBufs }, primitive: { cullMode: 'none' }, depthStencil: shDepth });
  const LOD = [42 * Q.lodMul, 200 * Q.lodMul, 850 * Q.lodMul];
  const lodBG = [[0, LOD[0], 0], [LOD[0], LOD[1], 0], [LOD[1], LOD[2], 1], [LOD[2], 1e9, 1]].map((r) => {
    const u = mkBuf(new Float32Array([r[0], r[1], r[2], 0]), GPUBufferUsage.UNIFORM);
    return device.createBindGroup({ layout: bglO, entries: [{ binding: 0, resource: { buffer: u } }] });
  });
  const camPlanes = new Float32Array(20);
  function planesFrom(out, m, n) { // 4 side planes (+ near)
    for (let i = 0; i < 4; i++) { const a = i >> 1, sg = i & 1 ? -1 : 1; for (let k = 0; k < 4; k++) out[i * 4 + k] = m[k * 4 + 3] + sg * m[k * 4 + a]; }
    if (n > 4) for (let k = 0; k < 4; k++) out[16 + k] = m[k * 4 + 3] - m[k * 4 + 2];
  }
  function vis(pl, n, x0, y0, z0, x1, y1, z1) {
    for (let i = 0; i < n; i++) { const a = pl[i * 4], b = pl[i * 4 + 1], c = pl[i * 4 + 2]; if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + pl[i * 4 + 3] < 0) return false; }
    return true;
  }
  const TP = TM.parts, TT = W.trees;
  let treeDraws = 0;
  function drawTrees(p, pl, np, shadow) {
    p.setVertexBuffer(0, treeVB); p.setVertexBuffer(1, treeInst); p.setIndexBuffer(treeIB, 'uint32');
    const ccx = Math.floor((cam.x + HALF) / NEAR), ccz = Math.floor((cam.z + HALF) / NEAR), rad = Math.ceil(LOD[1] / 0.85 / NEAR) + 1;
    const i0 = Math.max(0, ccx - rad), i1 = Math.min(NCN - 1, ccx + rad), j0 = Math.max(0, ccz - rad), j1 = Math.min(NCN - 1, ccz + rad);
    for (let l = 0; l < 2; l++) {
      p.setBindGroup(1, lodBG[l]);
      const lo = l ? LOD[0] / 1.15 : -1, hi = LOD[l] / 0.85;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const nc = j * NCN + i, y0 = TT.nearY[nc * 2], y1 = TT.nearY[nc * 2 + 1]; if (y1 < y0) continue;
        const x0 = i * NEAR - HALF, z0 = j * NEAR - HALF, dx = x0 + 16 - cam.x, dz = z0 + 16 - cam.z, dh = Math.hypot(dx, dz);
        const dy = cam.y > y1 ? cam.y - y1 : cam.y < y0 ? y0 - cam.y : 0, dyM = Math.max(Math.abs(cam.y - y0), Math.abs(cam.y - y1));
        const dmin = Math.hypot(Math.max(0, dh - 23), dy), dmax = Math.hypot(dh + 23, dyM);
        if (dmin >= hi || dmax <= lo) continue;
        if (!vis(pl, np, x0 - 5, y0 - 1, z0 - 5, x0 + NEAR + 5, y1 + 1, z0 + NEAR + 5)) continue;
        let st = TT.nearStart[nc];
        for (let s = 0; s < 3; s++) { const c = TT.nearCnt[nc * 3 + s]; if (c) { const P = TP[l * 3 + s]; p.drawIndexed(P.count, c, P.first, P.base, st); st += c; treeDraws++; } }
      }
    }
    for (let l = 2; l < (shadow ? 3 : 4); l++) {
      p.setBindGroup(1, lodBG[l]);
      const lo = LOD[l - 1] / 1.15, hi = l === 2 ? LOD[2] / 0.85 : 1e9, P = TP[4 + l];
      for (let fc = 0; fc < FCN * FCN; fc++) {
        const c = TT.farCnt[fc]; if (!c) continue;
        const x0 = (fc % FCN) * FAR - HALF, z0 = ((fc / FCN) | 0) * FAR - HALF, y0 = TT.farY[fc * 2], y1 = TT.farY[fc * 2 + 1];
        const dh = Math.hypot(x0 + 64 - cam.x, z0 + 64 - cam.z), dmin = Math.max(0, dh - 91), dmax = dh + 91 + Math.abs(cam.y - y0);
        if (dmin >= hi || dmax <= lo) continue;
        if (!vis(pl, np, x0 - 8, y0 - 1, z0 - 8, x0 + FAR + 8, y1 + 1, z0 + FAR + 8)) continue;
        p.drawIndexed(P.count, c, P.first, P.base, TT.farStart[fc]); treeDraws++;
      }
    }
  }
  const lview = new Float32Array(16), lproj = new Float32Array(16), lvp = new Float32Array(16);
  function updateCascades(aspect, fovy) {
    const Lx = GU[O.sunDir], Ly = GU[O.sunDir + 1], Lz = GU[O.sunDir + 2];
    let rx = Lz, rz = -Lx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl; // right = up x L
    const ux = Ly * rz, uy = Lz * rx - Lx * rz, uz = -Ly * rx; // up2 = L x right
    const fx = -view[2], fy = -view[6], fz = -view[10], th = Math.tan(fovy / 2), k2 = 1 + th * th * (1 + aspect * aspect);
    let n = 0.25;
    for (let c = 0; c < 3; c++) {
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
    if (NC === 2) GU[O.casc + 2] = SPLITS[1];
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
  const stData = new Float32Array(48), stBuf = device.createBuffer({ size: 192, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const stPrev = new Float32Array(12), stCur = new Float32Array(12), stS = new Float32Array(3); let stN = 0, stInit = false, tillWas = false;
  const TEXM = 2048 / Q.mask;
  { // pre-stamp the existing trail network as old, snowed-in grooming
    let n = 0; for (const t of W.trails) n += t.n - 1;
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
    const b = mkBuf(d, GPUBufferUsage.VERTEX), e = device.createCommandEncoder(), p = e.beginRenderPass(stampPass);
    p.setPipeline(stampPipe); p.setVertexBuffer(0, b); p.draw(6, n); p.end(); device.queue.submit([e.finish()]);
  }
  function stampPts(out) { // world xz of: tiller L,R ; left track l,r ; right track l,r
    const c = Math.cos(veh.yaw), s = Math.sin(veh.yaw);
    const P = (i, lx, lz) => { out[i * 2] = veh.x + c * lx + s * lz; out[i * 2 + 1] = veh.z - s * lx + c * lz; };
    P(0, -SWATH / 2, TILL_Z); P(1, SWATH / 2, TILL_Z); P(2, -2.0, 1.3); P(3, -0.9, 1.3); P(4, 0.9, 1.3); P(5, 2.0, 1.3);
  }
  function updateStamps() {
    stampPts(stCur); stN = 0;
    if (!stInit) { stPrev.set(stCur); stInit = true; }
    const till = veh.tillPos > 0.97;
    if (till && !tillWas) { stPrev[0] = stCur[0]; stPrev[1] = stCur[1]; stPrev[2] = stCur[2]; stPrev[3] = stCur[3]; }
    tillWas = till;
    for (let k = 0; k < 3; k++) {
      const i = k * 4, mv = Math.hypot(stCur[i] - stPrev[i], stCur[i + 1] - stPrev[i + 1]) + Math.hypot(stCur[i + 2] - stPrev[i + 2], stCur[i + 3] - stPrev[i + 3]);
      if (mv < 0.07) continue;
      if (k > 0 || till) {
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
  function setLight(o, BM, lx, ly, lz, dx, dy, dz, range, outer, inner, r, g, b) {
    GU[o] = BM[0] * lx + BM[4] * ly + BM[8] * lz + BM[12]; GU[o + 1] = BM[1] * lx + BM[5] * ly + BM[9] * lz + BM[13]; GU[o + 2] = BM[2] * lx + BM[6] * ly + BM[10] * lz + BM[14]; GU[o + 3] = range;
    const l = 1 / Math.hypot(dx, dy, dz); dx *= l; dy *= l; dz *= l;
    GU[o + 4] = BM[0] * dx + BM[4] * dy + BM[8] * dz; GU[o + 5] = BM[1] * dx + BM[5] * dy + BM[9] * dz; GU[o + 6] = BM[2] * dx + BM[6] * dy + BM[10] * dz; GU[o + 7] = outer;
    GU[o + 8] = r; GU[o + 9] = g; GU[o + 10] = b; GU[o + 11] = inner;
  }

  // ---------- post ----------
  const postMod = mod(postW, 'post');
  const bglP = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VF, buffer: {} }, { binding: 1, visibility: VF, texture: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, texture: {} }] });
  const postLayout = device.createPipelineLayout({ bindGroupLayouts: [bglP] });
  const mkPost = (fs, fmt, blend) => device.createRenderPipeline({ layout: postLayout, vertex: { module: postMod, entryPoint: 'vs' }, fragment: { module: postMod, entryPoint: fs, targets: [{ format: fmt, blend }] } });
  const finalPipe = mkPost('fsFinal', cfmt);
  const downPipe = mkPost('fsDown', HDR);
  const upPipe = mkPost('fsUp', HDR, { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'zero' } });
  const NB = 6;
  const pU = [], pUData = [];
  for (let i = 0; i < NB * 2 + 1; i++) { pU[i] = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); pUData[i] = new Float32Array(8); }
  const black = device.createTexture({ size: [1, 1], format: HDR, usage: TB }).createView();

  // ---------- size-dependent targets ----------
  let hdrMS, hdr, depth, hdrView, bloom = [], bloomBG = [], upBG = [], finalBG;
  const mainPass = { colorAttachments: [{ view: null, resolveTarget: undefined, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }], depthStencilAttachment: { view: null, depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 0 } };
  const bloomPass = [], finalPass = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    let w = Math.max(16, Math.round(canvas.clientWidth * dpr)), h = Math.max(16, Math.round(canvas.clientHeight * dpr));
    const k = Math.sqrt(Q.maxPx / (w * h)); if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); }
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
  }
  resize();
  addEventListener('resize', resize);
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);

  // ---------- input (keyboard for now) ----------
  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') { veh.tillDown = !veh.tillDown; e.preventDefault(); } if (e.code === 'KeyT') veh.setDown = !veh.setDown; if (e.code >= 'Digit1' && e.code <= 'Digit4') setTod(+e.code[5] - 1); if (e.code === 'KeyC') cam.mode = (cam.mode + 1) % 3; });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ---------- state ----------
  veh.x = W.start.x; veh.z = W.start.z; veh.yaw = W.start.yaw; veh.y = W.heightAt(veh.x, veh.z);
  if (qs.get('veh')) { const q = qs.get('veh').split(',').map(Number); veh.x = q[0]; veh.z = q[1]; veh.yaw = q[2] || 0; veh.y = W.heightAt(veh.x, veh.z); }
  if (qs.get('cam')) R.pose = qs.get('cam').split(',').map(Number);
  setTod(clamp((+qs.get('tod') || 1) - 1, 0, 3), true);
  GU[O.world] = HALF; GU[O.world + 1] = 1 / WS; GU[O.world + 2] = 1024; GU[O.world + 3] = 1 / 2048;
  GU[O.screen + 2] = 2048 / Q.mask; GU[O.screen + 3] = Q.mask;
  GU[O.casc + 3] = 1 / Q.shadow;
  for (const k of [O.l0p, O.l1p, O.l2p]) GU[k + 3] = 1;

  function simulate(dt) {
    const th = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const st = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    veh.throttle = th; veh.steer += (st - veh.steer) * Math.min(1, dt * 5);
    const fx = -Math.sin(veh.yaw), fz = -Math.cos(veh.yaw);
    const vmax = th >= 0 ? 6 : 3.2;
    const target = th * vmax * (1 - 0.85 * clamp(Math.sin(veh.pitch) * Math.sign(veh.v || th) / 0.5, 0, 1));
    veh.v += (target - veh.v) * Math.min(1, dt * 1.6) - 9.8 * Math.sin(veh.pitch) * 0.12 * dt;
    if (th === 0 && Math.abs(veh.v) < 0.05) veh.v = 0;
    veh.dist += veh.v * dt;
    const k3 = Math.min(1, dt * 2.5); veh.tillPos += ((veh.tillDown ? 1 : 0) - veh.tillPos) * k3 * 1.6; veh.tillPos = clamp(veh.tillPos + (veh.tillDown ? dt : -dt) * 0.6, 0, 1); veh.setPos = clamp(veh.setPos + (veh.setDown ? dt : -dt) * 1.5, 0, 1);
    veh.yawRate = veh.steer * lerp(0.9, 0.55, Math.min(1, Math.abs(veh.v) / 6)) * (veh.v < -0.2 ? -1 : 1);
    veh.trL += (veh.v + veh.yawRate * 1.45) * dt; veh.trR += (veh.v - veh.yawRate * 1.45) * dt;
    veh.yaw += veh.steer * dt * lerp(0.9, 0.55, Math.min(1, Math.abs(veh.v) / 6)) * (veh.v < -0.2 ? -1 : 1);
    veh.x = clamp(veh.x + fx * veh.v * dt, -PLAY, PLAY); veh.z = clamp(veh.z + fz * veh.v * dt, -PLAY, PLAY);
    const rx = -fz, rz = fx, hl = 1.9, hw = 1.3, h = W.heightAt;
    const hF = (h(veh.x + fx * hl + rx * hw, veh.z + fz * hl + rz * hw) + h(veh.x + fx * hl - rx * hw, veh.z + fz * hl - rz * hw)) / 2;
    const hB = (h(veh.x - fx * hl + rx * hw, veh.z - fz * hl + rz * hw) + h(veh.x - fx * hl - rx * hw, veh.z - fz * hl - rz * hw)) / 2;
    const hR = (h(veh.x + fx * hl + rx * hw, veh.z + fz * hl + rz * hw) + h(veh.x - fx * hl + rx * hw, veh.z - fz * hl + rz * hw)) / 2;
    const hL = (h(veh.x + fx * hl - rx * hw, veh.z + fz * hl - rz * hw) + h(veh.x - fx * hl - rx * hw, veh.z - fz * hl - rz * hw)) / 2;
    const k = Math.min(1, dt * 7);
    veh.pitch += (Math.atan2(hF - hB, hl * 2) - veh.pitch) * k; veh.roll += (Math.atan2(hR - hL, hw * 2) - veh.roll) * k;
    veh.y += ((hF + hB) / 2 + 0.05 - veh.y) * Math.min(1, dt * 12);
  }
  function updateCamera(dt) {
    const fx = -Math.sin(veh.yaw), fz = -Math.cos(veh.yaw);
    const yaw = veh.yaw + cam.orbYaw, cp = Math.cos(cam.orbPitch), d = cam.dist;
    cam.tx = veh.x; cam.ty = veh.y + 2.2; cam.tz = veh.z;
    const ex = cam.tx + Math.sin(yaw) * cp * d, ez = cam.tz + Math.cos(yaw) * cp * d;
    let ey = cam.ty + Math.sin(cam.orbPitch) * d;
    ey = Math.max(ey, W.heightAt(ex, ez) + 1.0);
    const k = Math.min(1, dt * 6);
    cam.x += (ex - cam.x) * k; cam.y += (ey - cam.y) * k; cam.z += (ez - cam.z) * k;
    if (R.frame < 2) { cam.x = ex; cam.y = ey; cam.z = ez; }
    lookAt(view, cam.x, cam.y, cam.z, cam.tx + fx * 2, cam.ty, cam.tz + fz * 2, 0, 1, 0);
  }

  const lvCell = (l) => 0.25 * (1 << l);
  let last = 0, running = true;
  function frame(tms) {
    if (!running) return;
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (tms - last) / 1000 || 0.016); last = tms;
    R.time += dt; R.frame++;
    if (updateTod(dt)) tshDirty = 2;
    simulate(dt);
    updateCamera(dt);
    if (R.pose) { const q = R.pose; cam.x = q[0]; cam.y = q[1]; cam.z = q[2]; const cp = Math.cos(q[4]); lookAt(view, q[0], q[1], q[2], q[0] - Math.sin(q[3]) * cp, q[1] + Math.sin(q[4]), q[2] - Math.cos(q[3]) * cp, 0, 1, 0); }

    const rw = Math.max(8, Math.round(R.w * R.scale)), rh = Math.max(8, Math.round(R.h * R.scale));
    perspRZ(proj, cam.fov * (R.w < R.h ? 1.35 : 1), rw / rh, 0.25);
    mul(vp, proj, view); invert(ivp, vp);
    GU.set(vp, O.viewProj); GU.set(ivp, O.invViewProj);
    GU[O.camPos] = cam.x; GU[O.camPos + 1] = cam.y; GU[O.camPos + 2] = cam.z; GU[O.camPos + 3] = R.time;
    writeTod(GU, O);
    updateCascades(rw / rh, cam.fov * (R.w < R.h ? 1.35 : 1));
    GU[O.lod2 + 2] = Q.msaa > 1 ? 1 : 0;
    planesFrom(camPlanes, vp, 5); treeDraws = 0;
    updateStamps();
    const BM = groomerParts(groomer.d, veh), nt = 0.12 + 0.88 * GU[O.misc];
    groomer.d[128] = veh.trL; groomer.d[129] = veh.trR; groomer.d[131] = 1;
    device.queue.writeBuffer(groomer.u, 0, groomer.d);
    setLight(O.l0p, BM, 0, 2.7, -2.15, 0, -0.2, -1, 90, Math.cos(0.75), Math.cos(0.3), 2.6 * nt, 2.45 * nt, 2.1 * nt);
    setLight(O.l1p, BM, 0, 2.65, -0.2, 0, -0.5, 1, 32, Math.cos(1.1), Math.cos(0.5), 1.3 * nt, 1.25 * nt, 1.1 * nt);
    { const a = R.time * 5.5, o = O.l2p; GU[o] = BM[0] * 0.6 + BM[4] * 2.75 + BM[8] * -1.1 + BM[12]; GU[o + 1] = BM[1] * 0.6 + BM[5] * 2.75 + BM[9] * -1.1 + BM[13]; GU[o + 2] = BM[2] * 0.6 + BM[6] * 2.75 + BM[10] * -1.1 + BM[14]; GU[o + 3] = 26;
      GU[o + 4] = Math.cos(a); GU[o + 5] = -0.1; GU[o + 6] = Math.sin(a); GU[o + 8] = 1.6 * nt; GU[o + 9] = 0.6 * nt; GU[o + 10] = 0.06 * nt; }
    GU[O.screen] = rw; GU[O.screen + 1] = rh;
    device.queue.writeBuffer(gBuf, 0, GU);
    for (let l = 0; l < NL; l++) {
      const c = lvCell(l);
      lvData[0] = Math.floor(cam.x / (2 * c)) * 2 * c - N / 2 * c; lvData[1] = Math.floor(cam.z / (2 * c)) * 2 * c - N / 2 * c; lvData[2] = c; lvData[3] = N;
      device.queue.writeBuffer(lvBuf[l], 0, lvData);
    }
    const enc = device.createCommandEncoder();
    if (tshDirty > 0 && (--tshDirty === 0 || (R.frame & 3) === 0)) {
      tshD[0] = GU[O.sunDir]; tshD[1] = GU[O.sunDir + 1]; tshD[2] = GU[O.sunDir + 2]; device.queue.writeBuffer(tshU, 0, tshD);
      const tp = enc.beginRenderPass(tshPass); tp.setPipeline(tshPipe); tp.setBindGroup(0, tshBG); tp.draw(3); tp.end();
    }
    if (stN) { const sp = enc.beginRenderPass(stampPass); sp.setPipeline(stampPipe); sp.setVertexBuffer(0, stBuf); sp.draw(6, stN); sp.end(); }
    for (let c = 0; c < NC; c++) {
      const sp = enc.beginRenderPass(shPass[c]);
      sp.setBindGroup(0, shBG[c]);
      sp.setPipeline(objShPipe); sp.setBindGroup(1, groomer.bg); sp.setVertexBuffer(0, groomer.vb); sp.setIndexBuffer(groomer.ib, 'uint32'); sp.drawIndexed(groomer.n);
      sp.setBindGroup(1, props.bg); sp.setVertexBuffer(0, props.vb); sp.setIndexBuffer(props.ib, 'uint32'); sp.drawIndexed(props.n);
      sp.setPipeline(treeShPipe); drawTrees(sp, shPlanes[c], 4, true);
      sp.end();
    }
    const p = enc.beginRenderPass(mainPass);
    p.setViewport(0, 0, rw, rh, 0, 1); p.setScissorRect(0, 0, rw, rh);
    p.setBindGroup(0, bg0);
    p.setPipeline(treePipe); drawTrees(p, camPlanes, 5, false);
    p.setPipeline(terrPipe); p.setVertexBuffer(0, tvb);
    for (let l = 0; l < NL; l++) {
      p.setBindGroup(1, lvBG[l]);
      if (l === 0) { p.setIndexBuffer(tibF, 'uint32'); p.drawIndexed(tiFull.length); } else { if (l === 1) p.setIndexBuffer(tibR, 'uint32'); p.drawIndexed(tiRing.length); }
    }
    p.setPipeline(objPipe); p.setBindGroup(1, groomer.bg); p.setVertexBuffer(0, groomer.vb); p.setIndexBuffer(groomer.ib, 'uint32'); p.drawIndexed(groomer.n);
    p.setBindGroup(1, props.bg); p.setVertexBuffer(0, props.vb); p.setIndexBuffer(props.ib, 'uint32'); p.drawIndexed(props.n);
    p.setPipeline(skyPipe); p.draw(3);
    p.end();

    // bloom chain
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
    const fu = pUData[NB * 2]; fu[0] = sx; fu[1] = sy; fu[2] = 1 / R.w; fu[3] = 1 / R.h; fu[4] = expo; fu[5] = 0.12; fu[6] = R.time; fu[7] = 0;
    device.queue.writeBuffer(pU[NB * 2], 0, fu);
    finalPass.colorAttachments[0].view = ctx.getCurrentTexture().createView();
    const fp = enc.beginRenderPass(finalPass); fp.setPipeline(finalPipe); fp.setBindGroup(0, finalBG); fp.draw(3); fp.end();
    device.queue.submit([enc.finish()]);
    if (waiters.length && --waitN <= 0) { const w = waiters; waiters = []; w.forEach((f) => f()); }
  }
  let waiters = [], waitN = 0;
  window.__waitFrames = (n) => new Promise((r) => { waitN = n; waiters.push(r); });
  window.__info = () => `tier=${Q.name} ${R.w}x${R.h} scale=${R.scale} trees=${W.trees.count} draws=${treeDraws}`;
  window.__pose = (q, tod) => { R.pose = q; if (tod) setTod(tod - 1, true); tshDirty = 1; };
  window.__tp = (x, z, yaw) => { veh.x = x; veh.z = z; veh.yaw = yaw; veh.y = W.heightAt(x, z); stInit = false; R.frame = 0; };
  window.__R = R; window.__W = W; window.__cam = cam; window.__veh = veh;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });
  $('load').style.display = 'none';
  requestAnimationFrame(frame);
  window.__ready = true;
}
main().catch((e) => { console.error(e); fail('Something went wrong while starting: ' + (e.message || e)); });
