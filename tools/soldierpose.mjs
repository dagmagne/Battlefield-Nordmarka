// Pose geometry check for the soldier (no GPU): one soldier at the origin per pose on flat ground, then measures
// the cheek weld (eye to stock), butt to shoulder, elbow/knee bends, rifle elevation and cant, and parts below the ground.
// usage: node tools/soldierpose.mjs [aim=0] [deadTime]
import { initSoldiers, IST, RIF_PTS } from '../src/soldier.js';
const aim = +(process.argv[2] || 0), deadT = process.argv[3] ? +process.argv[3] : null;
const S = initSoldiers(40, () => 0), d = new Float32Array(40 * 8), inf = { n: 1, d }, pl = new Float32Array(0);
const P = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), r2 = (v) => +v.toFixed(3);
const ang = (A, B) => r2(Math.acos(Math.max(-1, Math.min(1, A[4] * B[4] + A[5] * B[5] + A[6] * B[6]))) * 180 / Math.PI);
const name = { 0: 'stand', 1: 'walk', 2: 'run', 3: 'kneel', 4: 'prone', 5: 'standaim', 6: 'dead', 7: 'rpg' };
for (const [pose, slot] of deadT !== null ? [[6, 0], [6, 1], [6, 2], [6, 3]] : [0, 1, 2, 5, 3, 7, 4].map((p) => [p, 0])) {
  S.reset(); d.fill(0); inf.n = slot + 1; const b0 = slot * 8; d[b0 + 4] = pose; d[b0 + 5] = deadT !== null ? deadT : 0.3; d[b0 + 6] = aim; d[b0 + 7] = pose === 6 ? 2 : 1;
  for (let k = 0; k < 3; k++) S.update(inf, 0.016, 0, 1.5, 10, pl, 0);
  const o = S.out, M = (p) => o.subarray(p * 16, p * 16 + 16);
  const eye = P(M(2), 0, 0.152, -0.098), R = M(11), comb = P(R, 0, RIF_PTS.comb[1], RIF_PTS.comb[2]), butt = P(R, ...RIF_PTS.butt), shR = P(M(4), 0, 0, 0);
  const mz = P(R, 0, 0, RIF_PTS.muzzle), elev = Math.atan2(R[9] * -1, Math.hypot(R[8], R[10])) * 180 / Math.PI;
  let low = 9, lowP = -1; const LEN = { 3: 0.29, 4: 0.29, 5: 0.34, 6: 0.34, 7: 0.42, 8: 0.42, 9: 0.5, 10: 0.5, 0: 0.1, 1: 0.45, 2: 0.25 };
  for (const p in LEN) for (const f of [0, 0.5, 1]) for (const z of p >= 9 ? [-0.2, 0, 0.06] : [0]) { const y = p <= 2 ? LEN[p] * f : -LEN[p] * f, q = P(M(+p), 0, y, z); if (q[1] < low) { low = q[1]; lowP = +p; } }
  const ex = eye[0] - R[12], ey = eye[1] - R[13], ez = eye[2] - R[14], eyeLocal = [R[0] * ex + R[1] * ey + R[2] * ez, R[4] * ex + R[5] * ey + R[6] * ez, R[8] * ex + R[9] * ey + R[10] * ez].map(r2);
  const G2 = M(12), gx = eye[0] - G2[12], gy = eye[1] - G2[13], gz = eye[2] - G2[14], eyeInRpg = [G2[0] * gx + G2[1] * gy + G2[2] * gz, G2[4] * gx + G2[5] * gy + G2[6] * gz, G2[8] * gx + G2[9] * gy + G2[10] * gz].map(r2);
  const FL = M(5), handL = [FL[12] - FL[4] * 0.31, FL[13] - FL[5] * 0.31, FL[14] - FL[6] * 0.31], gripL = P(R, -0.007, -0.042, pose === 4 ? -0.13 : -0.27);
  console.log(name[pose].padEnd(9), JSON.stringify({ handGapL: r2(dist(handL, gripL)), shToGripL: r2(dist(P(M(3), 0, 0, 0), gripL)), eyeInRifle: eyeLocal, ...(pose === 7 ? { eyeInRpg, restAboveShoulderR: P(G2, 0, 0, 0).map((v, i) => r2(v - shR[i])), handGapRpg: r2(dist(handL, P(G2, 0, -0.075, -0.243))) } : {}), eyeStock: r2(dist(eye, comb)), eyeAboveComb: r2(eye[1] - comb[1]), buttShoulder: r2(dist(butt, shR)), elbowL: ang(M(3), M(5)), elbowR: ang(M(4), M(6)),
    kneeL: ang(M(7), M(9)), kneeR: ang(M(8), M(10)), rifleElev: r2(elev), rifleUpY: r2(R[5]), muzzleY: r2(mz[1]), lowestLimb: r2(low), lowPart: lowP, headY: r2(eye[1]), shoulderY: r2(shR[1]), toeL: P(M(9), 0, -0.48, -0.2).map(r2), toeR: P(M(10), 0, -0.48, -0.2).map(r2) }));
}
