// Imported models (tools/assets/*.mjs write them): 'MDL1' header, quantised vertices, indices. Decoded once at load into the
// object vertex layout (56 bytes: pos, normal, colour+material, uv+part) so they draw with the object pipelines.
// header: 'MDL1', u32 vertices, u32 indices, f32 min xyz, max xyz, uv min, uv max, rotor hubs (4 × x,z)
// vertex (16 bytes): u16 x y z (over min..max), s8 normal xyz, u8 part, u16 u v (over uv min..max), u8 heat (thermal sight), u8 pad
export function decodeModel(b64, mat) {
  const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < u.length; i++) u[i] = s.charCodeAt(i);
  const dv = new DataView(u.buffer), nv = dv.getUint32(4, true), ni = dv.getUint32(8, true), f = (k) => dv.getFloat32(12 + k * 4, true);
  const mn = [f(0), f(1), f(2)], mx = [f(3), f(4), f(5)], u0 = f(6), u1 = f(7), hubs = new Float32Array(8); for (let k = 0; k < 8; k++) hubs[k] = f(8 + k);
  const v = new Float32Array(nv * 14), i = new Uint32Array(ni); let o = 12 + 16 * 4;
  for (let k = 0; k < nv; k++, o += 16) { const w = k * 14;
    for (let c = 0; c < 3; c++) v[w + c] = mn[c] + dv.getUint16(o + c * 2, true) / 65535 * (mx[c] - mn[c]);
    const nx = dv.getInt8(o + 6) / 127, ny = dv.getInt8(o + 7) / 127, nz = dv.getInt8(o + 8) / 127, nl = Math.hypot(nx, ny, nz) || 1; v[w + 3] = nx / nl; v[w + 4] = ny / nl; v[w + 5] = nz / nl;
    v[w + 6] = dv.getUint8(o + 14) / 255; v[w + 7] = 0; v[w + 8] = 0; v[w + 9] = mat; // colour slot: r = heat
    v[w + 10] = u0 + dv.getUint16(o + 10, true) / 65535 * (u1 - u0); v[w + 11] = u0 + dv.getUint16(o + 12, true) / 65535 * (u1 - u0); v[w + 12] = dv.getUint8(o + 9); v[w + 13] = 0; }
  const wide = nv >= 65536; for (let k = 0; k < ni; k++, o += wide ? 4 : 2) i[k] = wide ? dv.getUint32(o, true) : dv.getUint16(o, true);
  return { v, i, hubs, min: mn, max: mx };
}
// a WebP/PNG (base64) as a GPU texture with a full mip chain (downscaled on a canvas; WebGPU has no mip generation)
export async function modelTexture(device, b64, srgb, mime = 'image/webp') {
  const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < u.length; i++) u[i] = s.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([u], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const levels = Math.floor(Math.log2(Math.max(bmp.width, bmp.height))) + 1;
  const tex = device.createTexture({ size: [bmp.width, bmp.height], format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  let w = bmp.width, h = bmp.height;
  for (let l = 0; l < levels; l++) { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
    device.queue.copyExternalImageToTexture({ source: c }, { texture: tex, mipLevel: l }, [w, h]); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
  return tex;
}
