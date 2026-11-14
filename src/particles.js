// CPU particle pool (preallocated, zero per-frame allocation).
export class Particles {
  constructor(max) {
    this.max = max; this.n = 0; this.next = 0;
    this.s = new Float32Array(max * 12); // x y z vx vy vz life maxLife size grow kind seed
    this.c = new Float32Array(max * 4);  // r g b a(base)
    this.out = new Float32Array(max * 12);
    this.live = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, kind, r, g, b, a) {
    const i = this.next; this.next = (i + 1) % this.max; const o = i * 12, s = this.s;
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = vx; s[o + 4] = vy; s[o + 5] = vz; s[o + 6] = life; s[o + 7] = life; s[o + 8] = size; s[o + 9] = grow; s[o + 10] = kind; s[o + 11] = (i * 0.61803) % 1;
    const c = this.c; c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
  }
  // returns number of live instances written to this.out
  update(dt, heightAt, wx, wz) {
    const s = this.s, c = this.c, out = this.out; let n = 0;
    for (let i = 0; i < this.max; i++) {
      const o = i * 12; if (s[o + 6] <= 0) continue;
      s[o + 6] -= dt; if (s[o + 6] <= 0) continue;
      const kind = s[o + 10], t = 1 - s[o + 6] / s[o + 7];
      if (kind === 0) { s[o + 4] -= 6.5 * dt; const d = 1 - 1.6 * dt; s[o + 3] *= d; s[o + 5] *= d; }
      else { const d = 1 - 1.2 * dt; s[o + 3] += (wx - s[o + 3]) * 0.8 * dt; s[o + 5] += (wz - s[o + 5]) * 0.8 * dt; s[o + 4] *= d; s[o + 4] += 0.5 * dt; }
      s[o] += s[o + 3] * dt; s[o + 1] += s[o + 4] * dt; s[o + 2] += s[o + 5] * dt;
      s[o + 8] += s[o + 9] * dt;
      let gy = 0;
      if (kind === 0) { gy = heightAt(s[o], s[o + 2]); if (s[o + 1] < gy + 0.05) { s[o + 6] = 0; continue; } }
      const q = n * 12;
      out[q] = s[o]; out[q + 1] = s[o + 1]; out[q + 2] = s[o + 2]; out[q + 3] = s[o + 8];
      const fade = kind === 0 ? Math.min(1, (1 - t) * 2.5) : Math.min(t * 8, 1) * (1 - t) * (1 - t);
      out[q + 4] = c[i * 4]; out[q + 5] = c[i * 4 + 1]; out[q + 6] = c[i * 4 + 2]; out[q + 7] = c[i * 4 + 3] * fade;
      out[q + 8] = kind; out[q + 9] = s[o + 11]; out[q + 10] = kind === 0 ? s[o + 1] - gy : 8; out[q + 11] = 0;
      n++;
    }
    this.live = n; return n;
  }
}
