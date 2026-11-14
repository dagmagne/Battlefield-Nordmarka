import common from './common.wgsl';
import terrainW from './terrain.wgsl';
import skyW from './sky.wgsl';
import postW from './post.wgsl';
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
const veh = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0, steer: 0, throttle: 0 };
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
  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code >= 'Digit1' && e.code <= 'Digit4') setTod(+e.code[5] - 1); if (e.code === 'KeyC') cam.mode = (cam.mode + 1) % 3; });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ---------- state ----------
  veh.x = W.start.x; veh.z = W.start.z; veh.yaw = W.start.yaw; veh.y = W.heightAt(veh.x, veh.z);
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
    updateTod(dt);
    simulate(dt);
    updateCamera(dt);

    const rw = Math.max(8, Math.round(R.w * R.scale)), rh = Math.max(8, Math.round(R.h * R.scale));
    perspRZ(proj, cam.fov * (R.w < R.h ? 1.35 : 1), rw / rh, 0.25);
    mul(vp, proj, view); invert(ivp, vp);
    GU.set(vp, O.viewProj); GU.set(ivp, O.invViewProj);
    GU[O.camPos] = cam.x; GU[O.camPos + 1] = cam.y; GU[O.camPos + 2] = cam.z; GU[O.camPos + 3] = R.time;
    writeTod(GU, O);
    GU[O.screen] = rw; GU[O.screen + 1] = rh;
    device.queue.writeBuffer(gBuf, 0, GU);
    for (let l = 0; l < NL; l++) {
      const c = lvCell(l);
      lvData[0] = Math.floor(cam.x / (2 * c)) * 2 * c - N / 2 * c; lvData[1] = Math.floor(cam.z / (2 * c)) * 2 * c - N / 2 * c; lvData[2] = c; lvData[3] = N;
      device.queue.writeBuffer(lvBuf[l], 0, lvData);
    }
    const enc = device.createCommandEncoder();
    const p = enc.beginRenderPass(mainPass);
    p.setViewport(0, 0, rw, rh, 0, 1); p.setScissorRect(0, 0, rw, rh);
    p.setBindGroup(0, bg0);
    p.setPipeline(terrPipe); p.setVertexBuffer(0, tvb);
    for (let l = 0; l < NL; l++) {
      p.setBindGroup(1, lvBG[l]);
      if (l === 0) { p.setIndexBuffer(tibF, 'uint32'); p.drawIndexed(tiFull.length); } else { if (l === 1) p.setIndexBuffer(tibR, 'uint32'); p.drawIndexed(tiRing.length); }
    }
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
  window.__info = () => `tier=${Q.name} ${R.w}x${R.h} scale=${R.scale} trees=${W.trees.count}`;
  window.__R = R; window.__W = W; window.__cam = cam; window.__veh = veh;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });
  $('load').style.display = 'none';
  requestAnimationFrame(frame);
  window.__ready = true;
}
main().catch((e) => { console.error(e); fail('Something went wrong while starting: ' + (e.message || e)); });
