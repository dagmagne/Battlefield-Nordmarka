// Input (keyboard, mouse, touch) and DOM UI. All state lives in `inp`; nothing here allocates per frame.
const $ = (id) => document.getElementById(id);
export const inp = { th: 0, st: 0, lookX: 0, lookY: 0, yawR: 0, zoom: 0, mvX: 0, mvZ: 0, mvY: 0, fast: false, locked: false, drag: false, fire: false, mg: false, aa: false, sight: false };
const keys = new Set();
const SPD = []; for (let i = 0; i < 200; i++) SPD.push(String(i));
const CAMN = ['CMDR', 'SIGHT', '', 'FLY', 'DRONE'];
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
    if (c === 'Tab' && !e.repeat) api.bigMap();
    if (c === 'Space' || c === 'Tab') e.preventDefault();
    else if (c === 'KeyT') api.tod(-1);
    else if (c === 'KeyC') api.cam();
    else if (c === 'KeyV') api.thermal();
    else if (c === 'KeyN') api.snow();
    else if (c === 'KeyM') api.sound();
    else if (c === 'KeyU') api.music();
    else if (c === 'KeyG') api.smoke();
    else if (c === 'KeyX') api.drone();
    else if (c === 'KeyZ') api.droneType();
    else if (c === 'KeyB') api.arty();
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
  let mFire = false, mSight = false, tFire = false, tMg = false, tAA = false;
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
    if (inp.locked) { inp.lookX += e.movementX; inp.lookY += e.movementY; if (e.pointerType === 'mouse') { mFire = (e.buttons & 1) !== 0; mSight = (e.buttons & 2) !== 0; } return; }
    const s = slot(e.pointerId); if (s < 0) return;
    const dx = e.clientX - px[s], dy = e.clientY - py[s]; px[s] = e.clientX; py[s] = e.clientY;
    if (prole[s] === 1) {
      let vx = e.clientX - jx0, vy = e.clientY - jy0; const l = Math.hypot(vx, vy);
      if (l > JR) { vx *= JR / l; vy *= JR / l; }
      jx = vx / JR; jy = vy / JR; knob.style.transform = `translate(${vx}px,${vy}px)`;
    } else if (looks() >= 2) { const d = pinchDist(); if (pinch > 0 && d > 0) inp.zoom += Math.log(pinch / d) * 1.6; pinch = d; }
    else { inp.lookX += dx; inp.lookY += dy; }
  });
  // a second mouse button pressed while the first is held (RMB sight + LMB fire) sends no pointerdown/pointerup, only mousedown/mouseup
  for (const ev of ['mousedown', 'mouseup']) addEventListener(ev, (e) => { if (inp.locked) { const d = ev === 'mousedown'; if (e.button === 0) mFire = d; else if (e.button === 2) mSight = d; } });
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

  // ---- the large map: a click or tap on the minimap opens it, one on the large map closes it ----
  for (const id of ['map', 'bmap']) { const m = $(id); m.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); }); m.addEventListener('click', (e) => { e.stopPropagation(); api.bigMap(id === 'map'); }); }
  // ---- buttons ----
  const btn = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); b.blur(); }); };
  btn('bS', () => api.ammo(-1)); btn('bK', api.smoke); btn('bX', api.drone); btn('bY', () => api.droneType()); btn('bR', api.drone); btn('bA', api.arty); btn('bA2', api.arty);
  // hold buttons: FIRE (tank), BOOM (drone) and the coax MG
  const holdBtn = (id, fn) => { const b = $(id), set = (on) => (e) => { e.stopPropagation(); e.preventDefault(); fn(on); b.classList.toggle('down', on); if (on) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } }; b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); };
  holdBtn('bT', (on) => { tFire = on; }); holdBtn('bB', (on) => { tFire = on; }); holdBtn('bM', (on) => { tMg = on; }); btn('bC', api.cam); btn('bD', () => api.tod(-1)); btn('bG', () => showMenu(true)); btn('bMu', () => api.music());
  // fullscreen (touch only): Android and iPad support it for the page; iPhone Safari does not, so the button stays hidden there
  // (on iPhone the way to full screen is Add to Home Screen). On Android the screen is also locked to landscape.
  { const de = document.documentElement, req = de.requestFullscreen || de.webkitRequestFullscreen, b = $('bFs');
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) b.classList.add('ok');
    btn('bFs', () => {
      if (fsEl()) { const x = document.exitFullscreen || document.webkitExitFullscreen; if (x) x.call(document); return; }
      try { const p = req.call(de, { navigationUI: 'hide' });
        if (p && p.then) p.then(() => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } }, () => toast('Fullscreen not available'));
      } catch (e) { toast('Fullscreen not available'); }
    });
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => b.classList.toggle('on', !!fsEl())); }
  btn('mW', () => { const l = new URL(location.href); l.searchParams.delete('w'); l.searchParams.delete('nohint'); location.href = l.href; });
  btn('hGo', () => showHelp(false)); btn('mGo', () => showMenu(false)); btn('mH', () => { showMenu(false); showHelp(true); });
  const hold = (id, v) => { const b = $(id); const set = (on) => (e) => { e.stopPropagation(); e.preventDefault(); inp.holdY = on ? v : 0; b.classList.toggle('down', on); if (on) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } }; b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); };
  inp.holdY = 0; hold('bUp', 1); hold('bDn', -1);
  const seg = (id, fn) => { $(id).addEventListener('click', (e) => { const v = e.target.dataset && e.target.dataset.v; if (v !== undefined) { fn(v); syncMenu(); } }); };
  seg('mQ', (v) => api.quality(v)); seg('mD', (v) => api.tod(+v)); seg('mN', (v) => api.snow(+v)); seg('mS', (v) => api.sound(+v)); seg('mU', (v) => api.music(+v)); seg('mR', (v) => api.drs(+v)); seg('mF', (v) => api.trees(v)); seg('mB', (v) => api.debug(+v)); seg('mV', (v) => api.vib(+v));
  for (const m of ['help', 'menu']) $(m).addEventListener('pointerdown', (e) => { if (e.target === $(m)) { showHelp(false); showMenu(false); } });
  function syncMenu() {
    const s = api.state();
    const mark = (id, v) => { for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(v)); };
    mark('mQ', s.quality); mark('mD', s.tod); mark('mN', s.snow ? 1 : 0); mark('mS', s.sound ? 1 : 0); mark('mU', s.music ? 1 : 0); mark('mR', s.drs ? 1 : 0); mark('mF', s.trees); mark('mB', s.debug ? 1 : 0); mark('mV', s.vib);
    $('mI').textContent = s.info;
  }

  // ---- gamepad (standard mapping: DualShock/DualSense over Bluetooth) ----
  // Only polled while a pad is connected; buttons are edge-detected through a preallocated array.
  let padN = 0; const pb = new Uint8Array(20);
  addEventListener('gamepadconnected', () => { padN++; });
  addEventListener('gamepaddisconnected', () => { padN = Math.max(0, padN - 1); });
  const PADT = [2, 4, 10, 12, 13, 14, 15]; // buttons only the tank uses
  const dz = (v) => { const a = Math.abs(v); return a < 0.15 ? 0 : Math.sign(v) * (a - 0.15) / 0.85; };
  let gTh = 0, gSt = 0, gX = 0, gZ = 0, gY = 0, gFire = false, gMg = false, gAA = false, gSight = false;
  // Hold to confirm (pad only): ✕ drone and ○ artillery fire after a 1 s hold. The ring round the crosshair fills by a CSS
  // animation that starts when #hold is shown, so nothing is written to the DOM while it fills.
  const HOLD_MS = 1000; let hK = 0, hT = 0;
  const holdStart = (k, text) => { hK = k; hT = performance.now(); $('holdT').textContent = text; $('hold').classList.add('show'); };
  const holdEnd = () => { if (hK) { hK = 0; $('hold').classList.remove('show'); } };
  const pollPad = (fly) => {
    gTh = gSt = gX = gZ = gY = 0; gFire = gMg = gAA = gSight = false; inp.yawR = 0;
    U.pad = null; if (!padN || !navigator.getGamepads) { holdEnd(); return; }
    const gl = navigator.getGamepads();
    let g = null; for (let i = 0; i < gl.length; i++) if (gl[i] && gl[i].connected) { g = gl[i]; break; }
    U.pad = g; if (!g) { holdEnd(); return; }
    const b = g.buttons, ax = g.axes, n = Math.min(b.length, 16);
    const down = (i) => i < n && b[i].pressed;
    const press = (i) => { const d = down(i); const e = d && !pb[i]; pb[i] = d ? 1 : 0; return e; };
    const bv = (i) => (i < n ? b[i].value : 0);
    const sync = () => { for (let i = 0; i < n; i++) pb[i] = b[i].pressed ? 1 : 0; };
    if (modalOpen()) { holdEnd(); if (press(0) || press(1) || press(9)) { showHelp(false); showMenu(false); } sync(); return; }
    if ($('over').classList.contains('show')) { holdEnd(); if (press(0)) api.restart(); else if (press(1) && overCont) U.over(null); sync(); return; } // end card: ✕ restart, ○ keep playing (after a victory)
    // ✕ drone / ○ artillery: start on the press, cancel on release, fire after HOLD_MS
    if (press(0)) { const l = api.droneLabel(); if (l) holdStart(1, 'HOLD ✕ · ' + l); else api.drone(); } // '' = no hold needed (skip the blast view, or nothing to launch: the toast says why)
    if (press(1)) holdStart(2, 'HOLD ○ · FIRE MISSION');
    if (hK && !down(hK === 1 ? 0 : 1)) holdEnd();
    else if (hK && performance.now() - hT >= HOLD_MS) { const k = hK; holdEnd(); if (k === 1) api.drone(); else api.arty(); }
    if (press(3)) api.thermal(); if (press(8)) api.bigMap(); if (press(9)) showMenu(true);
    const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
    gFire = bv(7) > 0.5;
    if (fly) { // drone, DJI Mode 2 (yaw is a rate with momentum, see main.js): left stick height and yaw, right stick forward/back and sideways, L1/L2 tilt the gimbal (the FPV's nose)
      gY = -ly; gZ = -ry; gX = rx; inp.yawR = lx; inp.lookY += (bv(6) - bv(4)) * 7;
      for (let j = 0; j < PADT.length; j++) pb[PADT[j]] = down(PADT[j]) ? 1 : 0; // tank-only buttons: track them so a press in flight does not fire on return
      return;
    }
    if (press(4)) api.smoke(); if (press(2)) api.ammo(-1); if (press(10)) api.cam();
    if (press(12)) inp.zoom -= 0.35; if (press(13)) inp.zoom += 0.35; // sight magnification (commander view: camera distance)
    if (press(14)) api.droneType(-2); if (press(15)) api.droneType(-1);
    gSight = bv(6) > 0.5; gMg = bv(5) > 0.5; gAA = bv(11) > 0.5;
    gTh = Math.max(-1, Math.min(1, -ly)); gSt = -lx;
    inp.lookX += rx * 9; inp.lookY += ry * 9;
  };

  // ---- per-frame poll (no allocation) ----
  let lSpd = -1, lC = -1, lR = -1, lPad = false;
  U.poll = (fly) => { // 0 tank, 1 free-fly camera, 2 drone
    pollPad(fly);
    if ((U.pad !== null) !== lPad) { lPad = U.pad !== null; document.body.classList.toggle('pad', lPad); } // hint bar: pad or keyboard (rare)
    const k = (c) => (keys.has(c) ? 1 : 0);
    const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), r = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    let jxx = jx, jyy = jy; const jl = Math.hypot(jxx, jyy);
    if (jl < 0.14) { jxx = 0; jyy = 0; } else { const g = (jl - 0.14) / 0.86 / jl; jxx *= g; jyy *= g; }
    if (fly) { inp.mvZ = f - jyy + gZ; inp.mvX = r + jxx + gX; inp.mvY = k('KeyE') - k('KeyQ') + inp.holdY + gY; inp.th = 0; inp.st = 0;
      if (fly === 2) inp.mvY = Math.max(-1, Math.min(1, inp.mvY + k('Space') - k('ShiftLeft') - k('ShiftRight'))); }
    else { inp.th = Math.max(-1, Math.min(1, f - jyy + gTh)); inp.st = Math.max(-1, Math.min(1, -r - jxx * 1.15 + gSt)); inp.mvX = inp.mvZ = inp.mvY = 0; }
    inp.fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
    inp.fire = fly !== 1 && (mFire || tFire || gFire || keys.has('Enter')); inp.mg = !fly && (gMg || tMg || keys.has('Space')); inp.aa = !fly && (gAA || tAA || keys.has('KeyQ')); inp.sight = !fly && (mSight || gSight);
  };
  U.hud = (kmh, camMode, range) => {
    if (kmh !== lSpd) { lSpd = kmh; $('spd').textContent = SPD[kmh] || '199'; }
    if (range !== lR) { lR = range; $('rng').textContent = RNG[range / 10] || '4000+ m'; }
    if (camMode !== lC) { lC = camMode; $('sC').textContent = CAMN[camMode]; document.body.classList.toggle('flying', camMode === 3); document.body.classList.toggle('droning', camMode === 4); tFire = false; $('joyhint').textContent = camMode >= 3 ? 'FLY' : 'DRIVE'; }
  };
  // rare game-state updates (ammo, hull, wave): only called when something changes
  U.set = (id, text, cls) => { const e = $(id); e.textContent = text; if (cls !== undefined) e.className = cls; };
  U.show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
  // drone buttons (rare): the DRONE button names the selected type; in flight the action button reads BOOM (FPV), DROP (bomber) or is hidden (recon)
  U.droneUI = (name, flying) => { $('bXl').textContent = name; $('bBl').textContent = flying === 1 ? 'DROP' : 'BOOM'; $('bB').style.visibility = flying === 2 ? 'hidden' : ''; };
  // end-of-game card (knocked out / victory); `cont` lets the player close it and keep going
  let overCont = false;
  U.over = (title, text, cont) => { overCont = !!cont; $('over').classList.toggle('show', !!title); if (title) { $('ovT').textContent = title; $('ovP').textContent = text; if (document.pointerLockElement) document.exitPointerLock(); } };
  $('ovGo').addEventListener('click', () => api.restart());
  $('over').addEventListener('pointerdown', (e) => { if (e.target === $('over') && overCont) U.over(null); });
  U.setDebug = (on) => { U.dbgOn = on; $('dbg').style.display = on ? 'block' : 'none'; };
  U.dbgText = (t) => { $('dbg').textContent = t; };
  let seen = false; try { seen = !!localStorage.getItem('hint1'); } catch (e) { /* ignore */ }
  U.modalOpen = modalOpen; U.pad = null;
  U.firstRun = () => { if (!seen) showHelp(true); };
  return U;
}
