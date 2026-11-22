// Missions (real world): scripted fights on real places, as an alternative to the six defence waves of combat.js.
// A mission is a list of stages; each stage has an objective text, an optional zone on the map, a setup (`on`), timed events (`ev`),
// a completion test (`done`) and optional ways to fail (`limit` seconds, `cap` enemy control of a zone, `fail`). While a mission runs,
// G.msn is set and combat.js skips its own wave logic; the script places enemies itself through G.spawn at fixed places.
// Checks run four times a second; nothing here allocates per frame (the objective pill is rebuilt only when what it shows changes).
const T72 = 0, BMP = 1, TIGR = 2, BTR = 3, BUG = 4, MOTO = 5, ASL = 0, OVW = 1, RAID = 3;
const GO = 0, DEF = 1, ATK = 2, FIND = 3; // zone kinds: drive there, defend it, attack what is there, search area
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FROG = [-317, -314], TOWER = [-663, -1486], ARENA = [-542, 1340], VOKS = [-840, -515];
// Holmenkollveien from the arena north to Voksenkollen station, about every 200 m: the column's waypoints (a single far goal let it cut corners over other roads and through the forest)
const HKV = [[-569, 1457], [-484, 1275], [-372, 1107], [-402, 917], [-415, 727], [-359, 534], [-331, 336], [-319, 136], [-291, -48], [-282, -245], [-399, -360], [-595, -389], [-772, -483], VOKS];
const CPS = [[672, -644], [771, -997], [548, -1308], [364, 274]]; // command post sites on the eastern forest road (road 23)
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// Every mission: id (URL ?m=), name, card (start screen), brief (briefing card), lvl (stands in for the wave number: cope cages from 3),
// tod (0 midday .. 3 night; set on every start, T still changes it afterwards), arty (fire missions at the start), start [x, z] (snapped to the nearest road or trail).
// Stage: t objective text, zone [x, z, r, kind], cnt tag (show how many of that tag are left), on(m) setup, ev [[seconds into the stage, fn(m)]],
// done(m), limit (s, whole mission clock), cap [x, z, r, s] (enemy vehicles inside for s seconds in all = lost), fail(m) -> reason or ''.
export const MISSIONS = [
  { id: 'contact', name: 'First contact', card: 'Meet a patrol on Tryvannsveien. A short first fight.', lvl: 1, tod: 0, arty: 1, start: FROG,
    brief: 'Scouts report vehicles coming down Tryvannsveien from the north.\n\nDrive up to the car park at Øvresetertjern, stop the patrol on the road, and deal with whatever follows it.',
    stages: [
      { t: 'Drive to the car park at Øvresetertjern', zone: [-630, -673, 55, GO], done: (m) => m.inZone() },
      { t: 'Destroy the patrol coming down the road', zone: [-650, -900, 260, ATK], cnt: 1,
        on(m) { m.say('Patrol on Tryvannsveien, north of you — light vehicles'); m.veh(BMP, ASL, -678, -1164, { k: 0 }); m.veh(BTR, RAID, -678, -1164, { k: 1 }); m.veh(BUG, RAID, -678, -1164, { k: 2 }); m.veh(MOTO, RAID, -678, -1164, { k: 3 }); },
        done: (m) => m.left(1) === 0 },
      { t: 'A tank follows the patrol — destroy it', zone: [-650, -900, 260, ATK], cnt: 2,
        on(m) { m.resupply(); m.say('Patrol destroyed — resupplied. A T-72 with an escort is coming down from Tryvann'); m.veh(T72, ASL, -695, -1333, { tag: 2 }); m.veh(BMP, ASL, -767, -1293, { tag: 2 }); },
        done: (m) => m.left(2) === 0 }] },

  { id: 'convoy', name: 'Column on Holmenkollveien', card: 'Eight vehicles drive north to Voksenkollen. Let no more than two through.', lvl: 2, tod: 1, arty: 1, start: FROG,
    brief: 'An enemy column has broken through in the south and is driving north up Holmenkollveien to join the force at Tryvann.\n\nIt will not stop to fight you. Pick a place along the road, and destroy it before it reaches Voksenkollen station. No more than two vehicles may get through.',
    stages: [
      { t: 'Stop the column before Voksenkollen', zone: [VOKS[0], VOKS[1], 60, DEF], cnt: 1, esc: 2,
        on(m) { const L = [BMP, BTR, TIGR, BMP, BTR, TIGR, BUG, BUG]; for (let k = 0; k < L.length; k++) m.veh(L[k], RAID, -660, 1561, { k: L.length - 1 - k, via: HKV, glr: 30, hold: 0, step: 9 }); m.say('Column of 8 on Holmenkollveien, far south of you, heading north'); },
        ev: [[75, (m) => m.say('The column is passing the Holmenkollen arena')]],
        done: (m) => m.left(1) === 0, fail: (m) => (m.esc > 2 ? 'Too many vehicles of the column got through to Voksenkollen.' : '') }] },

  { id: 'tower', name: 'Retake the tower', card: 'Clear the garrison at Tryvannstårnet, then hold the tower.', lvl: 3, tod: 0, arty: 1, start: FROG,
    brief: 'The enemy holds Tryvannstårnet with tanks, a Kornet vehicle and infantry, and has mined the road up.\n\nDestroy the garrison, drive up to the tower and hold it against the counter-attack. A recon drone will show you what waits at the car park.',
    stages: [
      { t: 'Destroy the garrison at Tryvann', zone: [-700, -1330, 250, ATK], cnt: 1,
        on(m) { m.veh(T72, OVW, -733, -1278, { gar: 1 }); m.veh(T72, OVW, -640, -1440, { gar: 1 }); m.veh(BMP, ASL, -633, -990, { gar: 1 }); m.veh(BTR, ASL, -767, -1293, { gar: 1 }); m.veh(TIGR, OVW, -554, -1454, { gar: 1 });
          m.rpg(-681, -831, 3); m.atgm(-700, -1420); m.mines(-532, -671); },
        done: (m) => m.left(1) === 0 },
      { t: 'Drive up to the tower', zone: [TOWER[0] - 30, TOWER[1] + 60, 70, GO], on(m) { m.say('Garrison destroyed — drive up to the tower'); }, done: (m) => m.inZone() },
      { t: 'Hold the tower against the counter-attack', zone: [TOWER[0] - 30, TOWER[1] + 60, 110, DEF], cnt: 2, cap: [TOWER[0] - 30, TOWER[1] + 60, 110, 40],
        on(m) { m.resupply(); m.say('Tower taken — resupplied. Counter-attack coming from the west and up the road from the south');
          const g = [TOWER[0] - 30, TOWER[1] + 60]; m.veh(T72, ASL, -1446, -927, { tag: 2, goal: g, k: 0 }); m.veh(T72, ASL, -1446, -927, { tag: 2, goal: g, k: 1 }); m.veh(BMP, ASL, -1446, -927, { tag: 2, goal: g, k: 2 });
          m.veh(BTR, RAID, -404, -583, { tag: 2, goal: g, k: 0 }); m.veh(BMP, RAID, -404, -583, { tag: 2, goal: g, k: 1 }); },
        ev: [[40, (m) => m.air(0, 3.9)], [95, (m) => m.air(0, 2.4)]],
        done: (m) => m.left(2) === 0 }] },

  { id: 'arena', name: 'Hold the arena', card: 'Three attacks on Holmenkollen. Keep them out of the arena.', lvl: 4, tod: 1, arty: 1, start: [-562, 1385],
    brief: 'The enemy wants the Holmenkollen arena as a staging area. Three attacks are coming: down Holmenkollveien from the north, a raid from the west, then a push from two sides.\n\nKeep their vehicles out of the arena. If they stand in it for 45 seconds in all, it is lost. You are resupplied between the attacks.',
    stages: [
      { t: 'Stop the attack from the north', zone: [ARENA[0], ARENA[1], 110, DEF], cnt: 1, cap: [ARENA[0], ARENA[1], 110, 45],
        on(m) { m.say('Tanks on Holmenkollveien to the north, coming for the arena'); m.veh(T72, ASL, -359, 534, { goal: ARENA, k: 0 }); m.veh(T72, ASL, -359, 534, { goal: ARENA, k: 1 }); m.veh(BMP, ASL, -359, 534, { goal: ARENA, k: 2 }); m.veh(BMP, ASL, -359, 534, { goal: ARENA, k: 3 }); },
        done: (m) => m.left(1) === 0 },
      { t: 'Stop the raid from the west', zone: [ARENA[0], ARENA[1], 110, DEF], cnt: 2, cap: [ARENA[0], ARENA[1], 110, 45],
        on(m) { m.resupply(); m.say('Attack beaten — resupplied. Fast vehicles coming in from the west');
          m.veh(BTR, RAID, -1208, 1080, { tag: 2, goal: ARENA, k: 0 }); m.veh(BUG, RAID, -1208, 1080, { tag: 2, goal: ARENA, k: 1 }); m.veh(BUG, RAID, -1208, 1080, { tag: 2, goal: ARENA, k: 2 }); m.veh(MOTO, RAID, -1208, 1080, { tag: 2, goal: ARENA, k: 3 }); m.veh(TIGR, OVW, -1010, 813, { tag: 2 }); },
        ev: [[25, (m) => m.air(0, -1.6)]],
        done: (m) => m.left(2) === 0 },
      { t: 'Stop the final push from north and east', zone: [ARENA[0], ARENA[1], 110, DEF], cnt: 3, cap: [ARENA[0], ARENA[1], 110, 45],
        on(m) { m.resupply(); m.say('Raid beaten — resupplied. The main force is coming: tanks from the north, more from the east');
          for (let k = 0; k < 3; k++) m.veh(T72, ASL, -415, 727, { tag: 3, goal: ARENA, k }); m.veh(BMP, ASL, -415, 727, { tag: 3, goal: ARENA, k: 3 });
          m.veh(BMP, RAID, 233, 1248, { tag: 3, goal: ARENA, k: 0 }); m.veh(BTR, RAID, 233, 1248, { tag: 3, goal: ARENA, k: 1 }); },
        ev: [[15, (m) => m.air(2, 0.3)], [45, (m) => m.air(0, 0.5)], [80, (m) => m.air(1, 0)], [120, (m) => m.air(0, 1.4)]],
        done: (m) => m.left(3) === 0 }] },

  { id: 'cp', name: 'Find the command post', card: 'A camouflaged command post directs artillery at you. Search the forest with the drone and destroy it.', lvl: 3, tod: 2, arty: 2, start: FROG,
    brief: 'An enemy command post somewhere in the forest east of Frognerseteren is directing artillery. It does not have your position: its fire searches the area, and an Orlan will come looking. Under the camouflage net (K) a still tank is hidden from it; once it has watched you for a quarter of a minute, the fire is accurate.\n\nIt stands under camouflage nets on one of the forest roads, in a different place every time: a drone has to pass within about 350 m to make it out, so search the area road by road with the recon drone (Z picks the type). Then destroy its command vehicle and both Kornet carriers. You have two fire missions.',
    stages: [
      { t: 'Find the command post in the eastern forest', zone: [480, -480, 1000, FIND], on(m) { // one of four sites along the forest road, under nets: a drone or the crew sees its vehicles only from about 350 m
        const s = CPS[m.pick(CPS.length)], x = s[0], z = s[1], o = { tag: 2, gar: 1, cam: 0.24 }; m.site(x, z);
        m.veh(BTR, ASL, x, z, { ...o, k: 0 }); m.veh(TIGR, OVW, x, z, { ...o, k: 4 }); m.veh(TIGR, OVW, x, z, { ...o, k: 9 });
        m.veh(T72, OVW, x - 40, z + 230, { gar: 1, cam: 0.4 }); m.veh(BMP, ASL, x, z, { gar: 1, cam: 0.4, k: 15 }); m.atgm(x + 25, z - 25); m.rpg(x - 60, z + 170, 2); m.mines(x * 0.6 + FROG[0] * 0.4, z * 0.6 + FROG[1] * 0.4); },
        ev: [[75, (m) => m.shell()], [150, (m) => { m.say('An Orlan is coming to look for you — a camouflage net or thick forest hides a still tank'); m.air(2, 1.2); }], [200, (m) => m.shell()], [320, (m) => m.shell()], [400, (m) => m.air(2, 0.6)], [440, (m) => m.shell()], [560, (m) => m.shell()]],
        done: (m) => m.seen(2) },
      { t: 'Destroy the command vehicle and the Kornet carriers', zone: [672, -644, 160, ATK], cnt: 2, on(m) { m.zone(m.sx, m.sz, 160, ATK); m.say('Command post found — destroy its three vehicles'); },
        ev: [[60, (m) => m.shell()], [180, (m) => m.shell()], [300, (m) => m.shell()], [420, (m) => m.shell()]],
        done: (m) => m.left(2) === 0 }] },

  { id: 'night', name: 'Night breakthrough', card: 'Cut off at Tryvann in the dark. Fight south to the arena in 14 minutes.', lvl: 4, tod: 3, arty: 1, start: [-733, -1278],
    brief: 'You are cut off at Tryvann and it is dark. The way out is south: down Tryvannsveien and Holmenkollveien to the Holmenkollen arena, 3 km through roadblocks, mines and ambushes.\n\nUse the thermal sight (V). The corridor closes in 14 minutes.',
    stages: [
      { t: 'Break through to the Holmenkollen arena', zone: [-562, 1385, 60, GO], limit: 840, limitText: 'The corridor closed before you reached the arena.',
        on(m) { m.veh(T72, OVW, -317, -314, { gar: 1 }); m.veh(BMP, ASL, -246, -266, { gar: 1 }); m.mines(-532, -671);
          m.veh(TIGR, OVW, -298, -11, { gar: 1 }); m.rpg(-331, 336, 2);
          m.veh(T72, OVW, -415, 727, { gar: 1 }); m.veh(BTR, ASL, -402, 917, { gar: 1 }); m.mines(-359, 534);
          m.veh(T72, OVW, -310, 1179, { gar: 1 }); m.veh(BMP, ASL, -424, 1147, { gar: 1 }); m.atgm(-470, 1262); },
        ev: [[100, (m) => m.air(0, 3.1)], [220, (m) => m.air(0, 2.2)], [300, (m) => { m.say('Vehicles behind you — they are giving chase'); m.chase(BMP); m.chase(BMP); }], [420, (m) => m.air(0, 3.6)]],
        done: (m) => m.inZone() }] },
];

// C: { W, R, veh, aim, cam, rnd, ui, parts, bld }; h: { tp(x, z, yaw), tod(i), quiet (no briefing card: scripted runs) }
export function initMissions(C, G, h) {
  const { W, R, veh, cam, rnd, ui, parts, bld } = C, hAt = W.heightAt, E = G.enemies, NETS = [W.roads || [], W.trails || []];
  // run state: s stage, t mission clock, st stage clock, ei next timed event, cap seconds of enemy control, esc escaped vehicles, done 0 running / 1 won / 2 failed
  const M = { on: false, cur: null, i: -1, s: 0, t: 0, st: 0, ei: 0, cap: 0, esc: 0, done: 0, brief: false, ck: 0, zx: 0, zz: 0, zr: 0, zk: -1, smk: 0, reason: '' };
  let key = -1, best = {}; try { best = JSON.parse(localStorage.gmsn || '{}') || {}; } catch (e) { best = {}; }
  const RP = new Float32Array(4); // nearest route point: x, z, direction along the route

  // ---- placing things (rare events: may allocate) ----
  // the route point nearest (x, z) within r, moved k * step points along the line (a column); roads only unless trails is set
  function routePt(x, z, r, k = 0, trails = false, step = 7) {
    let bd = r, bt = null, bi = 0;
    for (let n = 0; n < (trails ? 2 : 1); n++) for (const t of NETS[n]) for (let i = 0; i < t.n; i += 2) { const d = Math.hypot(t.pts[i * 2] - x, t.pts[i * 2 + 1] - z); if (d < bd) { bd = d; bt = t; bi = i; } }
    if (!bt) return false;
    const j = Math.max(1, Math.min(bt.n - 2, bi + (bi + k * step < bt.n - 1 ? k * step : -k * step)));
    RP[0] = bt.pts[j * 2]; RP[1] = bt.pts[j * 2 + 1]; const dx = bt.pts[j * 2 + 2] - bt.pts[j * 2 - 2], dz = bt.pts[j * 2 + 3] - bt.pts[j * 2 - 1], l = Math.hypot(dx, dz) || 1; RP[2] = dx / l; RP[3] = dz / l;
    return true;
  }
  // an open, level spot near (x, z) that no vehicle stands on
  function openPt(x, z, lim) {
    for (let k = 0; k < 90; k++) { const a = k * 2.4, r = k * 1.6, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r; if (!G.okSpot(px, pz, lim)) continue;
      let ok = true; for (const q of E) if (q.on && Math.hypot(q.x - px, q.z - pz) < 12) { ok = false; break; } if (ok) { RP[0] = px; RP[1] = pz; return true; } }
    RP[0] = x; RP[1] = z; return false;
  }
  const api = {
    // one vehicle: road-bound types stand on the nearest road, the others on open ground; o: tag, gar (garrison), cam (camouflage: the factor on the range at which a drone or the crew makes it out), goal [x, z] (drives there, not at the tank) or via (a list of such points, driven in order), glr, hold, k (place in a column), step
    veh(type, role, x, z, o = {}) {
      const T = G.ETYPE[type], g = o.via ? o.via[0] : o.goal; let tx = g ? g[0] : veh.x, tz = g ? g[1] : veh.z, yaw;
      if ((T.road || o.k !== undefined) && routePt(x, z, 90, o.k || 0, false, o.step)) { const s = (tx - RP[0]) * RP[2] + (tz - RP[1]) * RP[3] < 0 ? -1 : 1; yaw = Math.atan2(-RP[2] * s, -RP[3] * s); }
      else { openPt(x, z, T.road ? 45 : 110); yaw = Math.atan2(-(tx - RP[0]), -(tz - RP[1])); }
      if (!G.spawn(type, role, NaN, -1, RP[0], RP[1], yaw)) return null;
      const e = G.lastSpawn; e.tag = o.tag || 1; e.gar = o.gar ? 1 : 0; e.cam = o.cam || 1; if (o.hold !== undefined) e.hold = o.hold;
      e.via = o.via || null; e.wp = 0; e.vr = o.glr || 60;
      if (g) { e.gl = 1; e.glx = e.gx = g[0]; e.glz = e.gz = g[1]; e.glr = o.via ? 0 : e.vr; }
      return e;
    },
    chase(type) { if (G.spawn(type, RAID, Math.atan2(M.sx - veh.x, -(M.sz - veh.z)))) G.lastSpawn.tag = 9; }, // a pursuer on a route behind the tank (the bearing back to the start)
    // an RPG team: in the nearest intact house within 70 m, else lying at the spot
    rpg(x, z, n = 2) { let b = -1, bd = 70; for (let i = 0; i < bld.n; i++) { if (bld.st[i] || (bld.fix && bld.fix[i])) continue; const d = Math.hypot(bld.x[i] - x, bld.z[i] - z); if (d < bd) { bd = d; b = i; } }
      return G.infSquad('rpg', x, z, n, b); },
    atgm(x, z) { openPt(x, z, 150); return G.infSquad('atgm', RP[0], RP[1]); },
    mines(x, z) { return routePt(x, z, 120, 0, true) ? G.mines.lay(RP[0], RP[1], RP[2], RP[3]) : 0; },
    air(type, brg) { G.airSpawn(type, brg); }, // 0 FPV, 1 Lancet, 2 Orlan; bearing from the tank
    // searching fire: the command post does not know where the tank is, so the barrage lands 90-180 m off (250-400 m off a netted tank).
    // Accurate fire comes only through the normal rule in arty.js: an Orlan or a crew that has watched the tank for 15 s.
    shell() { if (!G.arty || G.arty.n || veh.dead || G.orlan > 0 || G.rep > 0) return; const a = rnd() * 6.283, r = G.net >= 1 ? 250 + rnd() * 150 : 90 + rnd() * 90;
      G.arty.call(veh.x + Math.sin(a) * r, veh.z + Math.cos(a) * r, 'search'); if (!M.shT) { M.shT = 1; ui.toast('Enemy artillery is searching the area — they do not have your position yet'); } },
    say(t) { ui.toast(t); },
    pick(n) { return X.force >= 0 ? X.force % n : Math.min(n - 1, (rnd() * n) | 0); }, // a random variant (X.force: tests)
    site(x, z) { M.px = x; M.pz = z; }, get sx() { return M.px; }, get sz() { return M.pz; },
    zone(x, z, r, k) { M.zx = x; M.zz = z; M.zr = r; M.zk = k; key = -1; },
    left(tag) { let n = 0; for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.on && !e.dead && e.tag === tag) n++; } return n; },
    seen(tag) { for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.on && e.tag === tag && e.seen) return true; } return false; },
    inZone() { return M.zk >= 0 && Math.hypot(veh.x - M.zx, veh.z - M.zz) < M.zr; },
    resupply() { const n = G.n, add = [7, 4, 3], max = [20, 12, 10]; for (let i = 0; i < 3; i++) n[i] = Math.min(max[i], n[i] + add[i]); G.mg = Math.min(2000, G.mg + 500); G.smokeN = Math.min(2, G.smokeN + 1); veh.hp = Math.min(100, veh.hp + 25); G.support.n = Math.max(G.support.n, 1); G.dirty(); },
    get esc() { return M.esc; }, get t() { return M.t; },
  };

  // ---- flow ----
  function enter(s) { // rare event
    const S = M.cur.stages[s]; M.s = s; M.st = 0; M.ei = 0; M.cap = 0; key = -1;
    if (S.zone) { M.zx = S.zone[0]; M.zz = S.zone[1]; M.zr = S.zone[2]; M.zk = S.zone[3]; } else M.zk = -1;
    G.msnHud = M.cur.name.toUpperCase() + (M.cur.stages.length > 1 ? ' ' + (s + 1) + '/' + M.cur.stages.length : ''); G.dirty();
    if (S.on) S.on(api);
    if (s === 0) ui.toast(S.t);
  }
  function finish(won, reason) { // rare event
    M.done = won ? 1 : 2; M.reason = reason || ''; G.state = 0; M.zk = -1; key = -1; pill();
    const c = M.cur, stats = `${fmt(M.t)} · ${G.kills} vehicles destroyed · hull ${Math.ceil(veh.hp)}`;
    if (won) { const sec = Math.ceil(M.t), old = best[c.id]; if (!(old > 0) || sec < old) { best[c.id] = sec; try { localStorage.gmsn = JSON.stringify(best); } catch (e) { /* private mode */ } }
      const nx = MISSIONS[M.i + 1];
      ui.card({ title: 'Mission complete — ' + c.name, text: stats + (old > 0 && sec >= old ? ` · best ${fmt(old)}` : old > 0 ? ' · new best time' : '') + (nx ? '' : '\n\nThat was the last mission. Defence mode and the other missions are on the start screen (menu).'), cont: true,
        go: nx ? 'Next mission: ' + nx.name : 'Play again', goFn: nx ? () => h.go(nx.id) : null, alt: nx ? 'Play again' : '', altFn: null }); }
    else ui.card({ title: 'Mission failed — ' + c.name, text: reason + '\n' + stats, go: 'Try again (R)' });
  }
  function begin() { // from G.restart and at load
    M.on = !!M.cur && !G.peace; G.msn = M.on ? M.cur : null; ui.show('obj', M.on); M.done = 0; M.zk = -1; key = -1;
    if (!M.on) return;
    const c = M.cur; M.t = 0; M.esc = 0; M.shT = 0; M.s = 0; M.ck = 0; G.wave = c.lvl; G.state = 1; G.wt = 0; G.support.n = c.arty === undefined ? 1 : c.arty;
    if (c.tod !== undefined) h.tod(c.tod);
    const z = c.stages[0].zone; let x = c.start[0], zz = c.start[1], yaw = z ? Math.atan2(-(z[0] - x), -(z[1] - zz)) : 0;
    if (routePt(x, zz, 80, 0, true)) { x = RP[0]; zz = RP[1]; if (z) { const s = (z[0] - x) * RP[2] + (z[1] - zz) * RP[3] < 0 ? -1 : 1; yaw = Math.atan2(-RP[2] * s, -RP[3] * s); } }
    M.sx = x; M.sz = zz; h.tp(x, zz, yaw);
    G.msnHud = c.name.toUpperCase(); G.dirty(); ui.set('obj', c.stages[0].t);
    M.brief = !h.quiet;
    if (M.brief) ui.card({ title: c.name, text: c.brief, go: 'Roll out', goFn: () => ui.card(null), keys: true, cont: true }); else enter(0);
  }
  G.msnDead = () => `${M.cur.name} · ${fmt(M.t)} · ${G.kills} vehicles destroyed`;

  // the objective pill: text, what is left, the clock, and range and direction to the zone; rebuilt only when its integer key changes
  function pill() {
    if (M.done) { if (key !== -2) { key = -2; ui.set('obj', M.done === 1 ? 'Mission complete' : 'Mission failed'); } return; }
    const S = M.cur.stages[M.s], left = S.cnt ? api.left(S.cnt) : 0, sec = S.limit ? Math.ceil(S.limit - M.t) : 0, pc = S.cap ? Math.min(99, Math.floor(M.cap / S.cap[3] * 100)) : 0;
    let db = 0, dir = 0; if (M.zk >= 0) { const dx = M.zx - veh.x, dz = M.zz - veh.z, d = Math.hypot(dx, dz); if (d > M.zr) { db = Math.max(1, Math.round(d / 50)); dir = ((Math.round(Math.atan2(dx, -dz) / 0.7854) % 8) + 8) % 8; } }
    const k = (((M.s * 20 + left) * 1000 + sec) * 100 + pc) * 1000 + db * 8 + dir + M.esc * 1e12; if (k === key) return; key = k;
    let t = S.t; if (S.cnt) t += ' · ' + left + ' left'; if (S.esc) t += ' · ' + M.esc + '/' + S.esc + ' through'; if (S.cap && pc > 0) t += ' · enemy control ' + pc + '%'; if (S.limit) t += ' · ' + fmt(sec);
    if (db) t += ' · ' + (db >= 20 ? (db / 20).toFixed(1) + ' km ' : db * 50 + ' m ') + DIRS[dir];
    ui.set('obj', t, 'pill' + (S.limit && sec < 120 || pc > 60 ? ' hot' : ''));
  }

  function update(dt) {
    if (!M.on) return;
    if (M.brief) { if (ui.cardOpen()) return; M.brief = false; enter(0); }
    if (M.done || veh.dead) return;
    M.t += dt; M.st += dt;
    if (M.zk === GO || M.zk === DEF) { M.smk -= dt; if (M.smk <= 0) { M.smk = 0.09; // signal smoke marks a place to drive to (green) or to hold (blue): a standing column, since smoke particles barely rise on their own
        if (Math.hypot(cam.x - M.zx, cam.z - M.zz) < 1400) { const g = M.zk === GO, q = rnd(), hy = q * q * 24;
          parts.emit(M.zx + (rnd() - 0.5) * (1 + hy * 0.1) + hy * 0.12, W.groundAt(M.zx, M.zz, 1e5) + 0.4 + hy, M.zz + (rnd() - 0.5) * (1 + hy * 0.1), 0.4, 0.8 + rnd(), 0, 6 + rnd() * 3, 1.1 + hy * 0.07, 0.35, 1, g ? 0.2 : 0.25, g ? 0.75 : 0.45, g ? 0.25 : 0.95, 0.8); } } }
    M.ck -= dt; if (M.ck > 0) return; M.ck += 0.25;
    const S = M.cur.stages[M.s];
    while (S.ev && M.ei < S.ev.length && M.st >= S.ev[M.ei][0]) S.ev[M.ei++][1](api);
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e.on || e.dead || !e.via || e.wp >= e.via.length - 1 || Math.hypot(e.glx - e.x, e.glz - e.z) > 70) continue; // next waypoint
      const p = e.via[++e.wp]; e.glx = e.gx = p[0]; e.glz = e.gz = p[1]; if (e.wp === e.via.length - 1) e.glr = e.vr; }
    // vehicles with a goal that reach it while an escape count runs: gone (the column)
    if (S.esc !== undefined) for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.on && !e.dead && e.gl && (!e.via || e.wp === e.via.length - 1) && Math.hypot(e.glx - e.x, e.glz - e.z) < e.glr + 25) { e.on = false; M.esc++; ui.toast(M.esc <= S.esc ? `A vehicle got through to Voksenkollen (${M.esc} of ${S.esc} allowed)` : 'Too many got through'); } }
    if (S.cap) { const c = S.cap; let inside = false; for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.on && !e.dead && Math.hypot(e.x - c[0], e.z - c[1]) < c[2]) { inside = true; break; } }
      if (inside) { if (M.cap === 0) ui.toast('Enemy vehicles inside the objective — drive them out!'); M.cap += 0.25; if (M.cap >= c[3]) { finish(false, 'The enemy took the objective.'); return; } } }
    if (S.limit && M.t >= S.limit) { finish(false, S.limitText || 'Out of time.'); return; }
    const why = S.fail ? S.fail(api) : ''; if (why) { finish(false, why); return; }
    if (S.done(api)) { if (M.s + 1 < M.cur.stages.length) enter(M.s + 1); else { finish(true); return; } }
    pill();
  }

  // map markers (minimap and big map): the zone as a dashed ring, and a pin that stays on the map edge when the zone is off it
  const ZC = ['#7dffb0', '#6fb8ff', '#ff6a55', '#ffc04a'];
  G.msnMap = (c, cx, mx, mz, sc, Wd, lim, u) => {
    if (!M.on || M.zk < 0) return;
    const x = cx + (M.zx - mx) * sc, y = cx + (M.zz - mz) * sc, col = ZC[M.zk], m = 6 * u, px = Math.max(m, Math.min(Wd - m, x)), py = Math.max(m, Math.min(Wd - m, y));
    c.strokeStyle = col; c.lineWidth = 1.6 * u; c.setLineDash([5 * u, 4 * u]); c.beginPath(); c.arc(x, y, Math.max(M.zr * sc, 4 * u), 0, 6.283); c.stroke(); c.setLineDash([]);
    c.fillStyle = col; c.strokeStyle = '#05080cd0'; c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(px, py + 5 * u); c.lineTo(px + 4.5 * u, py - 3.5 * u); c.lineTo(px - 4.5 * u, py - 3.5 * u); c.closePath(); c.fill(); c.stroke(); // a pin pointing down at the place
  };

  ui.show('obj', false);
  const up0 = G.update; G.update = (dt) => { up0(dt); update(dt); };
  const rs0 = G.restart; G.restart = () => { rs0(); begin(); };
  const X = { M, list: MISSIONS, api, best: () => best, begin, force: -1,
    set(id) { M.i = MISSIONS.findIndex((m) => m.id === id); M.cur = M.i >= 0 ? MISSIONS[M.i] : null; return !!M.cur; },
    id: () => (M.cur ? M.cur.id : '') };
  return X;
}
