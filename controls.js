// --- Shared pointer / touch UI for every page in the project ---
// Loaded by driving.html and by all the test pages, so the same gestures and the
// same camera toolbar work everywhere. Everything here drives the globals the
// keyboard already drives (PX_PER_FT, VIEW_ANGLE, Y_SCALE from constants.js), so
// no drawing code has to know these controls exist.
//
//   drag to scroll   one finger, or the mouse held down, pans the camera. Same
//                    code path for both -- they are just pointer events. Pages
//                    that follow something of their own (the driving game follows
//                    the car) pass pan: false and keep only the zoom.
//   pinch to zoom     two fingers. The wheel handlers each page already has are
//                    left alone; this is the touch equivalent.
//   camera toolbar   a button in the top right corner that opens rotate, tilt and
//                    zoom buttons: the Q/E, R/F and +/- keys, for screens that
//                    have no keyboard. Shown on desktop too.
//   driving controls a steering slider and gas/brake pedals along the bottom,
//                    on touch screens only. ?touch=1 forces them on so they can
//                    be tried on a desktop, ?touch=0 forces them off.
//
// With no real DOM (the headless harness in tools/render.js) every entry point
// below turns into a no-op and the page still runs, so the render tests are
// unaffected by any of this.

// A real browser DOM, as opposed to the stub the headless renderer supplies.
const CONTROLS_DOM = typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    !!document.body && typeof document.body.appendChild === 'function';

// Read by game.js and drawing.js. Kept outside the DOM guard so the driving game
// can read it unconditionally, whether or not the pedals were ever built. `shown`
// says the on-screen controls are up, which is also how the HUD knows to drop its
// keyboard hint on a device that has no keys to press.
const touchDrive = { steer: 0, gas: false, brake: false, shown: false };

// Set true by game.js during the driving game's own startup intro (see game.js)
// to shut out drag/pinch gestures on the canvas for the same span keyboard input
// is locked out. Every other page leaves this false forever, so gestures work
// everywhere else exactly as before.
let inputLocked = false;

function controlsParam(k) {
    if (typeof location === 'undefined' || typeof URLSearchParams !== 'function') return null;
    return new URLSearchParams(location.search || '').get(k);
}

// Touch controls are for phones and tablets: a coarse pointer is the honest test
// (a laptop with a touchscreen still has a mouse and a keyboard, and gets the
// keys instead). ?touch= overrides it either way.
function wantsTouchControls() {
    const forced = controlsParam('touch');
    if (forced !== null) return forced !== '0' && forced !== 'false';
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true;
    return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

// The mobile/desktop default zoom (constants.js), picked live off the same test
// as the touch controls themselves rather than cached, so it stays right even if
// wantsTouchControls()'s answer could change (it can't mid-session in practice,
// but nothing here should assume that).
function pxPerFtDefault() {
    return wantsTouchControls() ? PX_PER_FT_DEFAULT_MOBILE : PX_PER_FT_DEFAULT_DESKTOP;
}

// Same pattern, for VIEW_ANGLE_DEFAULT/_MOBILE (constants.js) -- see the
// comment there for why mobile starts rotated further round.
function viewAngleDefault() {
    return wantsTouchControls() ? VIEW_ANGLE_DEFAULT_MOBILE : VIEW_ANGLE_DEFAULT;
}

function setZoom(v) {
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, v));
}

// Screen pixels -> feet the camera must move for the ground to follow the finger.
// This undoes the rotation and vertical squash that render3d.js's project()
// applies, then negates: moving the camera left slides the world right.
function dragToCamDelta(sdx, sdy) {
    const cos = getCosV(), sin = getSinV();
    const a = sdx / PX_PER_FT;
    const b = sdy / (PX_PER_FT * Y_SCALE);
    return [-(a * cos + b * sin), -(b * cos - a * sin)];
}

// Capturing the pointer is what lets a drag carry on past the edge of the element
// it started in. It is never essential, though, and it throws outright if the
// browser has already forgotten the pointer -- so a failure here must not be
// allowed to abandon the gesture that was starting.
function capturePointer(el, id) {
    if (!el.setPointerCapture) return;
    try { el.setPointerCapture(id); } catch (e) { /* keep going uncaptured */ }
}

// --- Element helpers ---
function ctlEl(tag, cls, parent, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
}

// Buttons that repeat while held, like the keys they stand in for. Each one adds
// a per-frame function to `heldActions` for as long as the pointer is down.
const heldActions = new Set();

function holdButton(parent, label, title, action) {
    const b = ctlEl('button', 'ic-btn', parent, label);
    b.title = title;
    b.setAttribute('aria-label', title);
    const start = e => {
        e.preventDefault();
        capturePointer(b, e.pointerId);
        heldActions.add(action);
        b.classList.add('ic-held');
    };
    const stop = () => { heldActions.delete(action); b.classList.remove('ic-held'); };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
}

// --- Camera toolbar (all pages) ---
// The page may hand initPanZoom an onReset of its own -- the test pages refit the
// whole scene, which is more useful there than restoring the default zoom.
let cameraResetHook = null;

// Likewise for rotation: the driving game's camera-follow option (game.js) wants
// Q/E and these same rotate buttons to steer its own "desired heading" target
// instead of VIEW_ANGLE directly, so its dead-zone logic and the buttons are
// pushing on the same thing rather than fighting each other. Every other page
// leaves this unset and gets the plain, direct rotation it always had.
let cameraRotateHook = null;

function rotateView(delta) {
    if (cameraRotateHook) cameraRotateHook(delta);
    else VIEW_ANGLE = normA(VIEW_ANGLE + delta);
}

function resetCamera() {
    VIEW_ANGLE = viewAngleDefault();
    Y_SCALE = Y_SCALE_DEFAULT;
    if (cameraResetHook) cameraResetHook();
    else PX_PER_FT = pxPerFtDefault();
}

// Set once buildCameraToolbar runs, so a page loaded after controls.js (the
// driving game's own game.js, in particular) can still add rows to the same
// panel -- e.g. the camera-follow checkbox -- without controls.js having to know
// any page-specific thing exists.
let cameraPanelEl = null;

function buildCameraToolbar() {
    const wrap = ctlEl('div', 'ic-cam', document.body);
    const panel = ctlEl('div', 'ic-cam-panel ic-hidden', wrap);
    cameraPanelEl = panel;

    const row = (label) => {
        const r = ctlEl('div', 'ic-row', panel);
        ctlEl('span', 'ic-label', r, label);
        return r;
    };

    const rot = row('rotate');
    holdButton(rot, '↺', 'Rotate view left (Q)', dt => rotateView(-ROTATE_SPEED * dt));
    holdButton(rot, '↻', 'Rotate view right (E)', dt => rotateView(ROTATE_SPEED * dt));

    const tilt = row('tilt');
    holdButton(tilt, '▲', 'Tilt view down toward overhead (R)',
        dt => { Y_SCALE = Math.min(Y_SCALE_MAX, Y_SCALE + TILT_SPEED * dt); });
    holdButton(tilt, '▼', 'Tilt view toward ground level (F)',
        dt => { Y_SCALE = Math.max(Y_SCALE_MIN, Y_SCALE - TILT_SPEED * dt); });

    const zoom = row('zoom');
    holdButton(zoom, '+', 'Zoom in (+)', dt => setZoom(PX_PER_FT * Math.pow(ZOOM_SPEED, dt)));
    holdButton(zoom, '−', 'Zoom out (-)', dt => setZoom(PX_PER_FT / Math.pow(ZOOM_SPEED, dt)));

    const resetRow = ctlEl('div', 'ic-row', panel);
    const reset = ctlEl('button', 'ic-btn ic-wide', resetRow, 'reset view');
    reset.addEventListener('click', resetCamera);

    // The opener sits above the panel so it stays put as the panel opens/closes.
    const toggle = ctlEl('button', 'ic-btn ic-cam-toggle', wrap, '📷');
    toggle.title = 'Camera controls';
    toggle.setAttribute('aria-label', 'Camera controls');
    toggle.addEventListener('click', () => {
        panel.classList.toggle('ic-hidden');
        toggle.classList.toggle('ic-held', !panel.classList.contains('ic-hidden'));
    });
}

// --- HUD toggle (debug/test pages) ---
// The on-canvas debug info these pages draw (streetTest.js, buildings/lotGrid.js,
// vehicles/vehicleGrid.js) has no DOM of its own to click, and on a phone -- where
// it takes up the most relative screen space and there is no H key to press -- is
// exactly where it's most in the way. One floating button, mirroring the camera
// toggle on the opposite corner, that flips whatever boolean the page already uses
// for the H key; the page's own drawHud() decides what "hidden" looks like, this
// only calls set(). Returns a sync() the caller's own H-key handler should call
// too, so the button's glyph still matches after a keyboard toggle.
function initHudToggle(get, set) {
    if (!CONTROLS_DOM) return () => {};
    const btn = ctlEl('button', 'ic-btn ic-hud-toggle', document.body, '');
    btn.title = 'Toggle debug info (H)';
    btn.setAttribute('aria-label', 'Toggle debug info');
    const sync = () => { btn.textContent = get() ? '✕' : 'ℹ'; };
    btn.addEventListener('click', () => { set(!get()); sync(); });
    sync();
    return sync;
}

// --- Drag to scroll / pinch to zoom ---
// Pointer events cover mouse and touch with one set of handlers, which is the
// whole reason drag-to-scroll works on the desktop for free.
function initPanZoom(opts) {
    opts = opts || {};
    if (opts.onReset) cameraResetHook = opts.onReset;
    if (!CONTROLS_DOM) return;

    const canvasEl = opts.canvas || document.querySelector('canvas');
    if (!canvasEl) return;
    const canPan = opts.pan !== false && typeof opts.onPan === 'function';

    // Without this the browser claims the gestures for scrolling and its own zoom.
    canvasEl.style.touchAction = 'none';

    const pts = new Map();   // pointerId -> last client position
    let pinchDist = 0;

    const twoPointers = () => {
        const it = pts.values();
        return [it.next().value, it.next().value];
    };
    const spread = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    canvasEl.addEventListener('pointerdown', e => {
        // Mouse: left button only, so a right-drag can still reach the browser.
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        capturePointer(canvasEl, e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
            const [a, b] = twoPointers();
            pinchDist = spread(a, b);
        }
    });

    canvasEl.addEventListener('pointermove', e => {
        const prev = pts.get(e.pointerId);
        if (!prev) return;
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        prev.x = e.clientX; prev.y = e.clientY;
        if (inputLocked) return;

        if (pts.size >= 2) {
            const [a, b] = twoPointers();
            const dist = spread(a, b);
            // Both fingers report their own move, so each contributes half the pan.
            if (pinchDist > 0 && dist > 0) setZoom(PX_PER_FT * (dist / pinchDist));
            pinchDist = dist;
            if (canPan) {
                const [cx, cy] = dragToCamDelta(dx / 2, dy / 2);
                opts.onPan(cx, cy);
            }
        } else if (canPan) {
            const [cx, cy] = dragToCamDelta(dx, dy);
            opts.onPan(cx, cy);
        }
    });

    const release = e => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinchDist = 0;
    };
    canvasEl.addEventListener('pointerup', release);
    canvasEl.addEventListener('pointercancel', release);
    canvasEl.addEventListener('contextmenu', e => e.preventDefault());
}

// --- Driving controls (touch screens) ---
// Steering slider on the left half, gas and brake on the right half. The slider
// springs back to centre on release, the way a wheel does, so letting go stops
// the turn instead of leaving it locked over.
function initDriveControls() {
    if (!CONTROLS_DOM || !wantsTouchControls()) return;

    const bar = ctlEl('div', 'ic-drive', document.body);
    bar.addEventListener('contextmenu', e => e.preventDefault());

    const steer = ctlEl('div', 'ic-steer', bar);
    const track = ctlEl('div', 'ic-steer-track', steer);
    ctlEl('div', 'ic-steer-centre', track);
    const thumb = ctlEl('div', 'ic-steer-thumb', track);
    ctlEl('div', 'ic-steer-label', steer, 'steer');

    // A thumb held near centre reads as dead straight rather than a faint drift --
    // a fingertip is wide next to the track, and a wide vehicle has no business
    // wandering from a touch that was aiming for "straight ahead". Rescaled so the
    // ends of the track still reach full lock rather than losing that last bit of
    // range to the dead zone.
    const STEER_DEAD_ZONE = 0.08;
    const setSteer = v => {
        v = Math.max(-1, Math.min(1, v));
        v = Math.abs(v) < STEER_DEAD_ZONE ? 0
            : Math.sign(v) * (Math.abs(v) - STEER_DEAD_ZONE) / (1 - STEER_DEAD_ZONE);
        touchDrive.steer = v;
        thumb.style.left = (50 + touchDrive.steer * 50) + '%';
    };
    setSteer(0);

    // Measured live: the track's width changes when the phone is rotated.
    const steerFromX = clientX => {
        const r = track.getBoundingClientRect();
        const usable = Math.max(1, r.width - thumb.offsetWidth);
        const x = clientX - r.left - thumb.offsetWidth / 2;
        return (x / usable) * 2 - 1;
    };

    let steerId = null;
    steer.addEventListener('pointerdown', e => {
        e.preventDefault();
        steerId = e.pointerId;
        capturePointer(steer, e.pointerId);
        setSteer(steerFromX(e.clientX));
    });
    steer.addEventListener('pointermove', e => {
        if (e.pointerId !== steerId) return;
        setSteer(steerFromX(e.clientX));
    });
    const dropSteer = e => {
        if (e.pointerId !== steerId) return;
        steerId = null;
        setSteer(0);
    };
    steer.addEventListener('pointerup', dropSteer);
    steer.addEventListener('pointercancel', dropSteer);

    const pedals = ctlEl('div', 'ic-pedals', bar);
    const pedal = (cls, label, key) => {
        const b = ctlEl('button', 'ic-pedal ' + cls, pedals, label);
        const down = e => {
            e.preventDefault();
            capturePointer(b, e.pointerId);
            touchDrive[key] = true;
            b.classList.add('ic-held');
        };
        const up = () => { touchDrive[key] = false; b.classList.remove('ic-held'); };
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        return b;
    };
    pedal('ic-brake', 'BRAKE', 'brake');
    pedal('ic-gas', 'GAS', 'gas');

    touchDrive.shown = true;
}

// --- Styles ---
// Injected from here so that adding controls.js to a page is the only change a
// page needs; nothing in the markup has to know about any of this.
const CONTROLS_CSS = `
/* Driving game only (see game.js): body.ic-intro hides every UI panel for the
   startup flourish, then this same class coming off is what fades them back in
   -- the transition is declared unconditionally so it's armed before the class
   is ever toggled, but it only ever fires on pages that add ic-intro at all. */
.ic-cam, .ic-drive { transition: opacity ${UI_FADE_DURATION}s ease; }
body.ic-intro .ic-cam, body.ic-intro .ic-drive { opacity: 0; pointer-events: none; }
.ic-cam { position: fixed; top: 10px; right: 10px; z-index: 10;
    display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 6px;
    font: 13px system-ui, sans-serif; }
/* Opaque, not translucent: on a phone this panel lands on top of the test
   pages' HUD, which is drawn on the canvas underneath it. */
.ic-cam-panel { background: rgba(12,12,12,0.94); border-radius: 8px; padding: 8px;
    display: flex; flex-direction: column; gap: 6px; }
.ic-hidden { display: none; }
.ic-row { display: flex; align-items: center; gap: 6px; }
.ic-label { color: #fff; width: 46px; text-align: right; opacity: 0.85; }
.ic-btn { min-width: 44px; height: 44px; padding: 0 10px;
    background: rgba(255,255,255,0.16); color: #fff;
    border: 1px solid rgba(255,255,255,0.35); border-radius: 8px;
    font: 18px/1 system-ui, sans-serif; cursor: pointer;
    touch-action: none; user-select: none; -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent; }
.ic-btn.ic-held { background: rgba(255,255,255,0.45); }
.ic-wide { width: 100%; font-size: 14px; }
.ic-cam-toggle { background: rgba(12,12,12,0.94); }
.ic-hud-toggle { position: fixed; top: 10px; left: 10px; z-index: 10;
    background: rgba(12,12,12,0.94); }

.ic-drive { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
    display: flex; gap: 10px; padding: 10px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    background: rgba(0,0,0,0.45);
    font: 15px system-ui, sans-serif; user-select: none; -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent; }
.ic-steer { flex: 1 1 50%; display: flex; flex-direction: column; justify-content: center;
    gap: 6px; touch-action: none; }
.ic-steer-track { position: relative; height: 62px; border-radius: 31px;
    background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35); }
.ic-steer-centre { position: absolute; left: 50%; top: 8px; bottom: 8px; width: 2px;
    margin-left: -1px; background: rgba(255,255,255,0.4); }
.ic-steer-thumb { position: absolute; top: 4px; width: 52px; height: 52px;
    margin-left: -26px; border-radius: 26px; background: rgba(255,255,255,0.85); }
.ic-steer-label { color: #fff; text-align: center; opacity: 0.8; font-size: 12px; }
.ic-pedals { flex: 1 1 50%; display: flex; gap: 10px; }
.ic-pedal { flex: 1 1 50%; min-height: 84px; color: #fff;
    border: 1px solid rgba(255,255,255,0.35); border-radius: 10px;
    font: bold 15px system-ui, sans-serif; cursor: pointer;
    touch-action: none; -webkit-tap-highlight-color: transparent; }
.ic-gas { background: rgba(70,190,90,0.55); }
.ic-brake { background: rgba(210,70,70,0.55); }
.ic-pedal.ic-held { filter: brightness(1.6); }
`;

if (CONTROLS_DOM) {
    const style = document.createElement('style');
    style.textContent = CONTROLS_CSS;
    document.head.appendChild(style);
    buildCameraToolbar();

    let heldLast = 0;
    requestAnimationFrame(function heldLoop(t) {
        const dt = heldLast ? Math.min((t - heldLast) / 1000, 0.05) : 0;
        heldLast = t;
        for (const action of heldActions) action(dt);
        requestAnimationFrame(heldLoop);
    });
}
