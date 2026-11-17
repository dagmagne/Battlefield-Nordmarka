#!/usr/bin/env python3
"""Cut the recorded loops for audio.js out of the Freesound sources (run by hand; needs numpy and ffmpeg).

usage: python3 -I tools/snd/prep.py <dir with the source files>   -> src/data/snd/*.mp3 + meta.json (loop length L, cross-fade F, margin M)

Each output holds a lead-in margin M, the loop body L and the continuation F after it (+ a tail margin).
audio.js builds the seamless loop after decoding by cross-fading the first F seconds with the continuation,
so the result does not depend on the MP3 decoder's start delay (which differs between browsers).
"""
import glob, json, os, subprocess, sys
import numpy as np

SR = 48000
M = 0.1          # lead/tail margin (s), longer than any MP3 decoder delay
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'snd')

def load(src, pat):
    f = glob.glob(os.path.join(src, pat))[0]
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)

def hp(x, fc):  # one-pole highpass, run twice
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.empty_like(x); p = 0.0; xp = 0.0
        for i in range(len(x)):
            p = a * (p + x[i] - xp); xp = x[i]; y[i] = p
        x = y
    return x

def notch(x, f0, q):  # RBJ biquad notch
    w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q); c = np.cos(w)
    b0, b1, b2, a0, a1, a2 = 1, -2 * c, 1, 1 + al, -2 * c, 1 - al
    y = np.empty_like(x); x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1, y2, y1 = x1, x[i], y1, v; y[i] = v
    return y

def agc(x, win=0.35, amount=0.6):  # flatten slow level swings so the loop does not "breathe" every few seconds
    n = int(win * SR); k = np.hanning(n); k /= k.sum()
    env = np.sqrt(np.convolve(x * x, k, 'same')) + 1e-6
    return x / (env / np.median(env)) ** amount

def best_len(x, s, L, F, span=0.12):
    """loop length near L whose continuation matches the start best (normalised correlation over F)"""
    a = x[s:s + int(F * SR)]; best = (-2, L)
    for d in range(-int(span * SR), int(span * SR), 24):
        b = x[s + int(L * SR) + d: s + int(L * SR) + d + len(a)]
        c = (a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum() + 1e-12)
        if c > best[0]: best = (c, L + d / SR)
    return best

def f0_track(x, lo, hi, hop=0.01, n=4096):
    """fundamental by harmonic sum (6 harmonics), every hop seconds"""
    fs = np.arange(lo, hi, 0.5); t = []; f = []
    fr = np.fft.rfftfreq(4 * n, 1 / SR)
    for i in range(0, len(x) - n, int(hop * SR)):
        S = np.abs(np.fft.rfft(x[i:i + n] * np.hanning(n), 4 * n))
        sc = sum(np.interp(fs * k, fr, S) for k in range(1, 7))
        t.append((i + n / 2) / SR); f.append(fs[np.argmax(sc)])
    f = np.convolve(np.pad(np.array(f), 4, mode='edge'), np.ones(9) / 9, 'valid')
    return np.array(t), f

def write(name, y, rms_db, meta):
    y = y * (10 ** (rms_db / 20) / np.sqrt((y * y).mean()))
    p = np.abs(y).max()
    if p > 0.95: y *= 0.95 / p
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '40k',
                    '-map_metadata', '-1', '-write_xing', '0', out], input=y.astype(np.float32).tobytes(), check=True)
    print(f'{name:5s} L={meta[0]:.3f} F={meta[1]:.2f} corr={meta[2]:+.2f} peak={min(p, 0.95):.2f} -> {os.path.getsize(out)} B')

def cut(x, s, L, F, name, rms_db, pre=None):
    i = int(s * SR); c, L = best_len(x, i, L, F)
    y = x[i - int(M * SR): i + int((L + F + M) * SR)]
    write(name, y, rms_db, (L, F, c))
    return L, F

def main(src):
    meta = {}
    leo = agc(hp(load(src, '*161895*'), 30))          # Leopard 2A4 engine running (joniheinonen)
    meta['e0'] = cut(leo, 3.0, 2.6, 0.3, 'e0', -16)     # idle part of the recording
    meta['e1'] = cut(leo, 31.0, 2.6, 0.3, 'e1', -16)    # brighter running part
    qe = hp(load(src, '*200303*'), 30)                 # tank engine loop (qubodup): heavier, for load
    for f0, q in ((963, 5), (1928, 6), (4444, 8)): qe = notch(qe, f0, q)  # its whine reads as a whistle when pitched up
    qe = agc(qe)
    meta['e2'] = cut(qe, 1.0, 2.6, 0.3, 'e2', -16)
    tr = agc(hp(load(src, '*849062*'), 40), 0.25, 0.5) # tracks moving (christerljung)
    meta['tk'] = cut(tr, 0.25, 2.6, 0.3, 'tk', -16)
    t26 = agc(hp(load(src, '*329800*'), 30))           # T-26 moving (greatmganga): enemy engine + tracks at a distance
    meta['en'] = cut(t26, 7.6, 2.8, 0.3, 'en', -16)
    # FPV drone (qubodup): only the fly-by is loud; remove the wind thump, then resample so the rotor pitch is constant
    d = hp(load(src, '*854646*'), 260)
    a, b = int(2.72 * SR), int(3.52 * SR)
    t, f = f0_track(d[a - 2048:b + 2048], 280, 420)
    t += (a - 2048) / SR
    ref = 330.0
    # read position advances by ref/f(t) per output sample -> constant fundamental ref
    pos = [a]; ff = np.interp(np.arange(a, b) / SR, t, f)
    while pos[-1] < b - 1: pos.append(pos[-1] + ref / np.interp(pos[-1] / SR, t, f))
    pos = np.array(pos); y = np.interp(pos, np.arange(len(d)), d)
    y = agc(y, 0.12, 0.8)
    print('drone f0 range', ff.min(), ff.max(), 'warped len', len(y) / SR)
    s = M + 0.01; i = int(s * SR); F = 0.1; c, L = best_len(y, i, len(y) / SR - s - F - M - 0.05, F, 0.05)
    write('dr', y[i - int(M * SR): i + int((L + F + M) * SR)], -18, (L, F, c)); meta['dr'] = (L, F)
    meta = {k: [round(v[0], 4), v[1]] for k, v in meta.items()}; meta['M'] = M
    with open(os.path.join(OUT, 'meta.json'), 'w') as fh: json.dump(meta, fh)
    print('meta.json', meta)

if __name__ == '__main__':
    main(sys.argv[1])
