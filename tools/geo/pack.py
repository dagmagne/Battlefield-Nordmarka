"""Read and write src/data/world.bin (raw-deflated: u32 jsonLen, json, blobs at json.blobs offsets), so the
post-passes (terrain.py, ...) can replace or add blobs without re-running prep.py."""
import json, zlib, struct, fcntl
import numpy as np
PATH = '../../src/data/world.bin'
_lock = None
def load(p=PATH):
    global _lock   # held until the process exits, so two post-passes cannot interleave
    if _lock is None: _lock = open(p + '.lock', 'w'); fcntl.flock(_lock, fcntl.LOCK_EX)
    raw = zlib.decompress(open(p, 'rb').read(), -15); jl = struct.unpack('<I', raw[:4])[0]
    meta = json.loads(raw[4:4 + jl]); body = raw[4 + jl:]
    return meta, {k: bytes(body[o:o + l]) for k, (o, l) in meta['blobs'].items()}
def save(meta, blobs, p=PATH):
    body = bytearray(); meta['blobs'] = {}
    for k, b in blobs.items(): meta['blobs'][k] = [len(body), len(b)]; body.extend(b)
    js = json.dumps(meta, ensure_ascii=False, separators=(',', ':')).encode()
    co = zlib.compressobj(9, zlib.DEFLATED, -15); z = co.compress(struct.pack('<I', len(js)) + js + bytes(body)) + co.flush()
    open(p, 'wb').write(z)
    for k, b in blobs.items(): print(f'  {k:8s} raw {len(b) / 1024:8.1f} kB  deflated {len(zlib.compress(b, 9)) / 1024:7.1f} kB')
    print('world.bin', round(len(z) / 1024, 1), 'kB')
def enc16(q):
    """2-D predicted (left + up - upleft) 16-bit grid -> low byte plane + high byte plane"""
    q = q.astype(np.int64); pr = np.zeros_like(q); pr[1:, 1:] = q[1:, :-1] + q[:-1, 1:] - q[:-1, :-1]; pr[0, 1:] = q[0, :-1]; pr[1:, 0] = q[:-1, 0]
    dq = (q - pr) & 0xFFFF
    return (dq & 255).astype(np.uint8).tobytes() + (dq >> 8).astype(np.uint8).tobytes()
def dec16(b, h, w):
    b = np.frombuffer(b, np.uint8).astype(np.int64); dq = (b[:h * w] + (b[h * w:] << 8)).reshape(h, w)
    # the predictor is separable: cumulative sums along both axes undo it
    return np.cumsum(np.cumsum(dq, 0), 1) & 0xFFFF
