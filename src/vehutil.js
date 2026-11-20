// Shared helpers for the procedural vehicle meshes (tank.js, wheeled.js, bikes.js).
// ---- helpers: flat polygons that always face away from an interior point ----
export function poly(b, P, c) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
  const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return; nx /= l; ny /= l; nz /= l;
  let mx = 0, my = 0, mz = 0; for (const p of P) { mx += p[0]; my += p[1]; mz += p[2]; } mx /= P.length; my /= P.length; mz /= P.length;
  const flip = nx * (mx - c[0]) + ny * (my - c[1]) + nz * (mz - c[2]) < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const base = b.v.length / 14;
  for (const p of P) b.vert(p[0], p[1], p[2], nx, ny, nz, 0, 0);
  for (let i = 1; i < P.length - 1; i++) { if (flip) b.i.push(base, base + i + 1, base + i); else b.i.push(base, base + i, base + i + 1); }
}
// extrude a convex side profile [[y,z],...] along x
export function extX(b, prof, x0, x1) {
  let cy = 0, cz = 0; for (const p of prof) { cy += p[0]; cz += p[1]; } cy /= prof.length; cz /= prof.length;
  const c = [(x0 + x1) / 2, cy, cz], n = prof.length;
  for (let i = 0; i < n; i++) { const p = prof[i], q = prof[(i + 1) % n]; poly(b, [[x0, p[0], p[1]], [x1, p[0], p[1]], [x1, q[0], q[1]], [x0, q[0], q[1]]], c); }
  poly(b, prof.map((p) => [x0, p[0], p[1]]), c); poly(b, prof.map((p) => [x1, p[0], p[1]]), c);
}
// extrude a convex plan [[x,z],...] along y; the top can be shrunk towards (kx,kz) by k (sloped walls)
export function extY(b, plan, y0, y1, k = 0, kx = 0, kz = 0) {
  let cx = 0, cz = 0; for (const p of plan) { cx += p[0]; cz += p[1]; } cx /= plan.length; cz /= plan.length;
  const c = [cx, (y0 + y1) / 2, cz], n = plan.length, top = plan.map((p) => [p[0] + (kx - p[0]) * k, p[1] + (kz - p[1]) * k]);
  for (let i = 0; i < n; i++) { const p = plan[i], q = plan[(i + 1) % n], pt = top[i], qt = top[(i + 1) % n]; poly(b, [[p[0], y0, p[1]], [q[0], y0, q[1]], [qt[0], y1, qt[1]], [pt[0], y1, pt[1]]], c); }
  poly(b, plan.map((p) => [p[0], y0, p[1]]), c); poly(b, top.map((p) => [p[0], y1, p[1]]), c);
}
export const mirror = (plan) => plan.concat(plan.slice().reverse().map((p) => [-p[0], p[1]]));

