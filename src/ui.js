// Input (keyboard, mouse, touch) and DOM UI. All state lives in `inp`; nothing here allocates per frame.
const $ = (id) => document.getElementById(id);
export const inp = { th: 0, st: 0, lookX: 0, lookY: 0, zoom: 0, mvX: 0, mvZ: 0, mvY: 0, fast: false, locked: false, drag: false, fire: false, mg: false, sight: false };
const keys = new Set();
const SPD = []; for (let i = 0; i < 200; i++) SPD.push(String(i));
const CAMN = ['CMDR', 'SIGHT', '', 'FLY'];
const RNG = []; for (let i = 0; i <= 400; i++) RNG.push(i * 10 + ' m');

export function initUI(api, isTouch) {
  const ui = $('ui'), canvas = $('c');
  document.body.classList.add(isTouch ? 'touch' : 'desk');
  $(isTouch ? 'hD' : 'hT').style.display = 'none';
  const modalOpen = () => $('help').classList.contains('show') || $('menu').classList.contains('show');
  const showHelp = (v) => { $('help').classList.toggle('show', v); if (!v) { try { localStorage.setItem('hint1', '1'); } catch (e) { /* private mode */ } } };
  const showMenu = (v) => { $('menu').classList.toggle('show', v); if (v) syncMenu(); };
  let toastT = 0;
  const toast = (m) => { const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; }, 1400); };
  const U = { toast, showHelp, showMenu, dbgOn: false };

  // ---- keyboard ----
  addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey) return;
    const c = e.code;
    if (modalOpen()) { if (c === 'Escape' || c === 'Enter' || c === 'Space' || c === 'KeyH') { showHelp(false); showMenu(false); e.preventDefault(); } return; }
    keys.add(c);
    if (c === 'Space' || c === 'Tab') e.preventDefault();
    else if (c === 'KeyT') api.tod(-1);
    else if (c === 'KeyC' || c === 'KeyV') api.cam();
    else if (c === 'KeyF') api.fly();
    else if (c === 'KeyN') api.snow();
    else if (c === 'KeyG') api.smoke();
    else if (c === 'KeyR') api.restart();
    else if (c === 'KeyH') showHelp(true);
    else if (c === 'Escape') showMenu(true);
    else if (c === 'Backquote') api.debug();
    else if (c >= 'Digit1' && c <= 'Digit3') api.ammo(+c[5] - 1);
    if (c.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ---- pointers ----
  const MAXP = 8, pid = new Int32Array(MAXP).fill(-1), prole = new Uint8Array(MAXP), px = new Float32Array(MAXP), py = new Float32Array(MAXP);
  let mFire = false, mSight = false, tFire = false;
  let joyId = -1, jx0 = 0, jy0 = 0, jx = 0, jy = 0, pinch = 0, tapN = 0, tapT = 0, tapMax = 0;
  const joy = $('joy'), knob = joy.firstChild, JR = 58;
  const slot = (id) => { for (let i = 0; i < MAXP; i++) if (pid[i] === id) return i; return -1; };
  const looks = () => { let n = 0; for (let i = 0; i < MAXP; i++) if (pid[i] >= 0 && prole[i] === 2) n++; return n; };
  const pinchDist = () => { let a = -1, b = -1; for (let i = 0; i < MAXP; i++) if (pid[i] >= 0 && prole[i] === 2) { if (a < 0) a = i; else if (b < 0) b = i; } return b < 0 ? 0 : Math.hypot(px[a] - px[b], py[a] - py[b]); };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      if (!inp.locked) { if (canvas.requestPointerLock) { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } if (e.button === 2) mSight = true; }
      else { if (e.button === 0) mFire = true; else if (e.button === 2) mSight = true; return; }
      if (e.button !== 0) return;
    }
    const s = slot(-1); if (s < 0) return;
    pid[s] = e.pointerId; px[s] = e.clientX; py[s] = e.clientY;
    const touch = e.pointerType !== 'mouse';
    if (touch) { const now = performance.now(); if (now - tapT > 350) { tapN = 0; tapMax = 0; tapT = now; } tapN++; if (tapN > tapMax) tapMax = tapN; }
    if (touch && joyId < 0 && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.22) {
      prole[s] = 1; joyId = e.pointerId; jx0 = e.clientX; jy0 = e.clientY; jx = jy = 0;
      joy.style.display = 'block'; joy.style.transform = `translate(${jx0}px,${jy0}px)`; knob.style.transform = ''; $('joyhint').style.opacity = 0;
    } else { prole[s] = 2; pinch = pinchDist(); inp.drag = true; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (inp.locked) { inp.lookX += e.movementX; inp.lookY += e.movementY; return; }
    const s = slot(e.pointerId); if (s < 0) return;
    const dx = e.clientX - px[s], dy = e.clientY - py[s]; px[s] = e.clientX; py[s] = e.clientY;
    if (prole[s] === 1) {
      let vx = e.clientX - jx0, vy = e.clientY - jy0; const l = Math.hypot(vx, vy);
      if (l > JR) { vx *= JR / l; vy *= JR / l; }
      jx = vx / JR; jy = vy / JR; knob.style.transform = `translate(${vx}px,${vy}px)`;
    } else if (looks() >= 2) { const d = pinchDist(); if (pinch > 0 && d > 0) inp.zoom += Math.log(pinch / d) * 1.6; pinch = d; }
    else { inp.lookX += dx; inp.lookY += dy; }
  });
  const up = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) mFire = false; else if (e.button === 2) mSight = false; }
    const s = slot(e.pointerId); if (s < 0) return;
    if (prole[s] === 1) { joyId = -1; jx = jy = 0; joy.style.display = 'none'; $('joyhint').style.opacity = 1; }
    pid[s] = -1; pinch = 0; inp.drag = looks() > 0;
    if (e.pointerType !== 'mouse') { tapN = Math.max(0, tapN - 1); if (tapN === 0 && tapMax === 3 && performance.now() - tapT < 500) api.debug(); if (tapN === 0) tapMax = 0; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { inp.zoom += e.deltaY * 0.0015; e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { inp.locked = document.pointerLockElement === canvas; if (!inp.locked) mFire = mSight = false; });
  for (const ev of ['contextmenu', 'gesturestart', 'gesturechange', 'dblclick', 'selectstart']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.card')) e.preventDefault(); }, { passive: false });

  // ---- buttons ----
  const btn = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); b.blur(); }); };
  btn('bS', () => api.ammo(-1));
  { const b = $('bT'), set = (on) => (e) => { e.stopPropagation(); e.preventDefault(); tFire = on; }; b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); } btn('bC', api.cam); btn('bD', () => api.tod(-1)); btn('bG', () => showMenu(true));
  btn('mW', () => { const l = new URL(location.href); l.searchParams.delete('w'); l.searchParams.delete('nohint'); location.href = l.href; });
  btn('hGo', () => showHelp(false)); btn('mGo', () => showMenu(false)); btn('mH', () => { showMenu(false); showHelp(true); });
  const hold = (id, v) => { const b = $(id); const set = (on) => (e) => { e.stopPropagation(); e.preventDefault(); inp.holdY = on ? v : 0; b.classList.toggle('down', on); if (on) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } }; b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); };
  inp.holdY = 0; hold('bUp', 1); hold('bDn', -1);
  const seg = (id, fn) => { $(id).addEventListener('click', (e) => { const v = e.target.dataset && e.target.dataset.v; if (v !== undefined) { fn(v); syncMenu(); } }); };
  seg('mQ', (v) => api.quality(v)); seg('mD', (v) => api.tod(+v)); seg('mN', (v) => api.snow(+v)); seg('mR', (v) => api.drs(+v)); seg('mB', (v) => api.debug(+v));
  for (const m of ['help', 'menu']) $(m).addEventListener('pointerdown', (e) => { if (e.target === $(m)) { showHelp(false); showMenu(false); } });
  function syncMenu() {
    const s = api.state();
    const mark = (id, v) => { for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(v)); };
    mark('mQ', s.quality); mark('mD', s.tod); mark('mN', s.snow ? 1 : 0); mark('mR', s.drs ? 1 : 0); mark('mB', s.debug ? 1 : 0);
    $('mI').textContent = s.info;
  }

  // ---- gamepad (standard mapping: DualShock/DualSense over Bluetooth) ----
  // Only polled while a pad is connected; buttons are edge-detected through a preallocated array.
  let padN = 0; const pb = new Uint8Array(20);
  addEventListener('gamepadconnected', () => { padN++; });
  addEventListener('gamepaddisconnected', () => { padN = Math.max(0, padN - 1); });
  const dz = (v) => { const a = Math.abs(v); return a < 0.15 ? 0 : Math.sign(v) * (a - 0.15) / 0.85; };
  let gTh = 0, gSt = 0, gX = 0, gZ = 0, gY = 0, gFast = false, gFire = false, gMg = false, gSight = false;
  const pollPad = () => {
    gTh = gSt = gX = gZ = gY = 0; gFast = gFire = gMg = gSight = false;
    if (!padN || !navigator.getGamepads) return;
    const gl = navigator.getGamepads();
    let g = null; for (let i = 0; i < gl.length; i++) if (gl[i] && gl[i].connected) { g = gl[i]; break; }
    if (!g) return;
    const b = g.buttons, ax = g.axes, n = Math.min(b.length, 16);
    const press = (i) => { const d = i < n && b[i].pressed; const e = d && !pb[i]; pb[i] = d ? 1 : 0; return e; };
    const bv = (i) => (i < n ? b[i].value : 0);
    if (modalOpen()) { if (press(0) || press(1) || press(9)) { showHelp(false); showMenu(false); } for (let i = 0; i < n; i++) pb[i] = b[i].pressed ? 1 : 0; return; }
    if (press(1)) api.smoke(); if (press(2)) api.ammo(-1); if (press(3)) api.cam();
    if (press(4)) api.fly(); if (press(9)) showMenu(true); if (press(8)) api.debug();
    if (press(12)) api.snow(); if (press(15)) api.tod((api.state().tod + 1) & 3); if (press(14)) api.tod((api.state().tod + 3) & 3);
    const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0), tr = api.isFly() ? bv(7) - bv(6) : 0;
    gFire = bv(7) > 0.5; gSight = bv(6) > 0.5; gMg = bv(0) > 0.5;
    gTh = Math.max(-1, Math.min(1, -ly)); gSt = -lx; gX = lx; gZ = -ly; gY = tr; gFast = bv(5) > 0.5;
    inp.lookX += rx * 9; inp.lookY += ry * 9;
  };

  // ---- per-frame poll (no allocation) ----
  let lSpd = -1, lC = -1, lR = -1;
  U.poll = (fly) => {
    pollPad();
    const k = (c) => (keys.has(c) ? 1 : 0);
    const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), r = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    let jxx = jx, jyy = jy; const jl = Math.hypot(jxx, jyy);
    if (jl < 0.14) { jxx = 0; jyy = 0; } else { const g = (jl - 0.14) / 0.86 / jl; jxx *= g; jyy *= g; }
    if (fly) { inp.mvZ = f - jyy + gZ; inp.mvX = r + jxx + gX; inp.mvY = k('KeyE') - k('KeyQ') + inp.holdY + gY; inp.th = 0; inp.st = 0; }
    else { inp.th = Math.max(-1, Math.min(1, f - jyy + gTh)); inp.st = Math.max(-1, Math.min(1, -r - jxx * 1.15 + gSt)); inp.mvX = inp.mvZ = inp.mvY = 0; }
    inp.fast = gFast || keys.has('ShiftLeft') || keys.has('ShiftRight');
    inp.fire = !fly && (mFire || tFire || gFire || keys.has('Enter')); inp.mg = !fly && (gMg || keys.has('Space')); inp.sight = !fly && (mSight || gSight);
  };
  U.hud = (kmh, camMode, range) => {
    if (kmh !== lSpd) { lSpd = kmh; $('spd').textContent = SPD[kmh] || '199'; }
    if (range !== lR) { lR = range; $('rng').textContent = RNG[range / 10] || '4000+ m'; }
    if (camMode !== lC) { lC = camMode; $('sC').textContent = CAMN[camMode]; document.body.classList.toggle('flying', camMode === 3); }
  };
  // rare game-state updates (ammo, hull, wave): only called when something changes
  U.set = (id, text, cls) => { const e = $(id); e.textContent = text; if (cls !== undefined) e.className = cls; };
  U.show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
  // end-of-game card (knocked out / victory); `cont` lets the player close it and keep going
  let overCont = false;
  U.over = (title, text, cont) => { overCont = !!cont; $('over').classList.toggle('show', !!title); if (title) { $('ovT').textContent = title; $('ovP').textContent = text; if (document.pointerLockElement) document.exitPointerLock(); } };
  $('ovGo').addEventListener('click', () => api.restart());
  $('over').addEventListener('pointerdown', (e) => { if (e.target === $('over') && overCont) U.over(null); });
  U.setDebug = (on) => { U.dbgOn = on; $('dbg').style.display = on ? 'block' : 'none'; };
  U.dbgText = (t) => { $('dbg').textContent = t; };
  let seen = false; try { seen = !!localStorage.getItem('hint1'); } catch (e) { /* ignore */ }
  U.firstRun = () => { if (!seen) showHelp(true); };
  return U;
}
