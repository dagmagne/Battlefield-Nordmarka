// Input (keyboard, mouse, touch) and DOM UI. All state lives in `inp`; nothing here allocates per frame.
const $ = (id) => document.getElementById(id);
export const inp = { th: 0, st: 0, lookX: 0, lookY: 0, zoom: 0, mvX: 0, mvZ: 0, mvY: 0, fast: false, locked: false, drag: false };
const keys = new Set();
const SPD = []; for (let i = 0; i < 200; i++) SPD.push(String(i));
const CAMN = ['CHASE', 'CAB', 'ORBIT', 'FLY'];

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
    if (c === 'Space') { api.tiller(); e.preventDefault(); }
    else if (c === 'KeyT') api.setter();
    else if (c === 'KeyC') api.cam();
    else if (c === 'KeyF') api.fly();
    else if (c === 'KeyN') api.snow();
    else if (c === 'KeyX') api.turbo();
    else if (c === 'KeyH') showHelp(true);
    else if (c === 'Escape') showMenu(true);
    else if (c === 'Backquote') api.debug();
    else if (c >= 'Digit1' && c <= 'Digit4') api.tod(+c[5] - 1);
    if (c.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ---- pointers ----
  const MAXP = 8, pid = new Int32Array(MAXP).fill(-1), prole = new Uint8Array(MAXP), px = new Float32Array(MAXP), py = new Float32Array(MAXP);
  let joyId = -1, jx0 = 0, jy0 = 0, jx = 0, jy = 0, pinch = 0, tapN = 0, tapT = 0, tapMax = 0;
  const joy = $('joy'), knob = joy.firstChild, JR = 58;
  const slot = (id) => { for (let i = 0; i < MAXP; i++) if (pid[i] === id) return i; return -1; };
  const looks = () => { let n = 0; for (let i = 0; i < MAXP; i++) if (pid[i] >= 0 && prole[i] === 2) n++; return n; };
  const pinchDist = () => { let a = -1, b = -1; for (let i = 0; i < MAXP; i++) if (pid[i] >= 0 && prole[i] === 2) { if (a < 0) a = i; else if (b < 0) b = i; } return b < 0 ? 0 : Math.hypot(px[a] - px[b], py[a] - py[b]); };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      if (api.isFly() && !inp.locked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
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
    const s = slot(e.pointerId); if (s < 0) return;
    if (prole[s] === 1) { joyId = -1; jx = jy = 0; joy.style.display = 'none'; $('joyhint').style.opacity = 1; }
    pid[s] = -1; pinch = 0; inp.drag = looks() > 0;
    if (e.pointerType !== 'mouse') { tapN = Math.max(0, tapN - 1); if (tapN === 0 && tapMax === 3 && performance.now() - tapT < 500) api.debug(); if (tapN === 0) tapMax = 0; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { inp.zoom += e.deltaY * 0.0015; e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { inp.locked = document.pointerLockElement === canvas; });
  for (const ev of ['contextmenu', 'gesturestart', 'gesturechange', 'dblclick', 'selectstart']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.card')) e.preventDefault(); }, { passive: false });

  // ---- buttons ----
  const btn = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); b.blur(); }); };
  btn('bT', api.tiller); btn('bS', api.setter); btn('bC', api.cam); btn('bD', () => api.tod(-1)); btn('bG', () => showMenu(true));
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

  // ---- per-frame poll (no allocation) ----
  let lSpd = -1, lT = -1, lS = -1, lC = -1;
  U.poll = (fly) => {
    const k = (c) => (keys.has(c) ? 1 : 0);
    const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), r = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    let jxx = jx, jyy = jy; const jl = Math.hypot(jxx, jyy);
    if (jl < 0.14) { jxx = 0; jyy = 0; } else { const g = (jl - 0.14) / 0.86 / jl; jxx *= g; jyy *= g; }
    if (fly) { inp.mvZ = f - jyy; inp.mvX = r + jxx; inp.mvY = k('KeyE') - k('KeyQ') + inp.holdY; inp.th = 0; inp.st = 0; }
    else { inp.th = Math.max(-1, Math.min(1, f - jyy)); inp.st = Math.max(-1, Math.min(1, -r - jxx * 1.15)); inp.mvX = inp.mvZ = inp.mvY = 0; }
    inp.fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
  };
  U.hud = (kmh, till, set, camMode) => {
    if (kmh !== lSpd) { lSpd = kmh; $('spd').textContent = SPD[kmh] || '199'; }
    if (till !== lT) { lT = till; $('sT').classList.toggle('on', !!till); $('bT').classList.toggle('on', !!till); }
    if (set !== lS) { lS = set; $('sS').classList.toggle('on', !!set); $('bS').classList.toggle('on', !!set); }
    if (camMode !== lC) { lC = camMode; $('sC').textContent = CAMN[camMode]; document.body.classList.toggle('flying', camMode === 3); }
  };
  U.setDebug = (on) => { U.dbgOn = on; $('dbg').style.display = on ? 'block' : 'none'; };
  U.dbgText = (t) => { $('dbg').textContent = t; };
  let seen = false; try { seen = !!localStorage.getItem('hint1'); } catch (e) { /* ignore */ }
  U.firstRun = () => { if (!seen) showHelp(true); };
  return U;
}
