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
//                    be tried on a desktop, ?touch=0 forces them off. Turned
//                    sideways they split to the two edges with the city visible
//                    between them -- see "Turning the phone sideways" below.
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
const touchDrive = { steer: 0, gas: false, brake: false, shown: false, steerLeft: false, steerRight: false };

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

// A screen wider than it is tall. The orientation media query is the direct
// answer where there is one; comparing the viewport's own two dimensions is the
// same answer everywhere else, including the headless harness (tools/render.js),
// which supplies both and no matchMedia.
function isLandscape() {
    if (typeof matchMedia === 'function') return matchMedia('(orientation: landscape)').matches;
    return typeof innerWidth === 'number' && typeof innerHeight === 'number' && innerWidth > innerHeight;
}

// A phone or tablet held sideways -- the one condition any of the landscape
// handling below reacts to. Every landscape rule goes through this rather than
// through isLandscape() alone, which is what keeps all of it off desktop: a
// desktop monitor is landscape too, and nearly always has been. ?touch=1 forces
// the touch half true, so the whole landscape layout can still be looked at on
// a desktop by making the window wider than it is tall.
function touchLandscape() { return wantsTouchControls() && isLandscape(); }

// The mobile/desktop default zoom (constants.js), picked live off the same test
// as the touch controls themselves rather than cached, so it stays right even if
// wantsTouchControls()'s answer could change (it can't mid-session in practice,
// but nothing here should assume that).
function pxPerFtDefault() {
    return wantsTouchControls() ? PX_PER_FT_DEFAULT_MOBILE : PX_PER_FT_DEFAULT_DESKTOP;
}

// Same pattern, for VIEW_ANGLE_DEFAULT/_MOBILE/_MOBILE_LANDSCAPE (constants.js)
// -- see the comments there for why a phone starts rotated further round than a
// monitor, and why turning that phone sideways swings it back past both.
function viewAngleDefault() {
    if (!wantsTouchControls()) return VIEW_ANGLE_DEFAULT;
    return isLandscape() ? VIEW_ANGLE_DEFAULT_MOBILE_LANDSCAPE : VIEW_ANGLE_DEFAULT_MOBILE;
}

// Same pattern again, for INTRO_UI_DELAY/UI_DELAY_MOBILE_EARLIER (constants.js)
// -- driving.html's own startup flourish (game.js) reads this for how much
// longer to wait, after the flourish itself ends, before the UI starts fading in.
function introUIDelay() {
    return wantsTouchControls() ? Math.max(0, INTRO_UI_DELAY - UI_DELAY_MOBILE_EARLIER) : INTRO_UI_DELAY;
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

// --- Turning the phone sideways ---
// Landscape is a layout change and a camera change at once, and a phone can be
// turned at any moment, so neither can be settled at load. Everything that
// depends on it reads touchLandscape() live; all this has to do is re-apply the
// two things that are latched rather than read: the body class the landscape
// CSS keys off, and VIEW_ANGLE.
//
// The angle is carried by the difference between the old and new defaults
// rather than snapped to the new one, because by the time the phone is turned
// the player may well have rotated the view themselves (Q/E, the toolbar, or
// camera-follow tracking a turn) -- shifting by the delta re-aims the camera
// for the new shape of the screen while leaving whatever they had aimed at
// intact. It goes through rotateView rather than assigning VIEW_ANGLE so the
// driving game's camera-follow anchor comes along with it (cameraRotateHook,
// game.js); assigned directly, camera-follow would read the change as the car
// having swung out of its dead zone and spend the next moment steering it back.
let landscapeNow = touchLandscape();
let viewAngleBase = viewAngleDefault();

function applyLandscapeClass() {
    if (CONTROLS_DOM && document.body.classList) {
        document.body.classList.toggle('ic-landscape', touchLandscape());
    }
}

function syncOrientation() {
    if (touchLandscape() === landscapeNow) return;
    landscapeNow = !landscapeNow;
    applyLandscapeClass();
    applyDriveWidths();
    const base = viewAngleDefault();
    rotateView(base - viewAngleBase);
    viewAngleBase = base;
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
// Steering is either an analog slider or two digital left/right buttons, on the
// left of the bar; gas and brake, on the right, are always the two pedals.
// ANALOG_STEERING_ENABLED (constants.js, off by default) picks which steering
// widget shows -- both are built up front and toggled with ic-hidden, rather
// than one being built lazily, so the settings panel (game.js) can flip the
// checkbox live without having to construct or tear down any DOM. The slider
// springs back to centre on release, the way a wheel does; the buttons behave
// like a held keyboard key instead -- turn while held, stop the instant it's
// released -- which is the more forgiving of the two to hit accurately on a
// small screen, hence the default.
let steerSlotEl = null, steerAnalogEl = null, steerDigitalEl = null, pedalsEl = null;

// STEER_WIDTH_FRAC (constants.js) is a live setting, not a fixed layout, so it's
// applied as inline flex-basis (which wins over the CSS defaults below) rather
// than baked into the stylesheet -- called once at build time and again by the
// settings panel whenever the slider there moves.
function applyDriveWidths() {
    if (!steerSlotEl) return;
    const frac = Math.max(0, Math.min(1, STEER_WIDTH_FRAC));
    if (touchLandscape()) {
        // Sideways, the two clusters split to opposite edges with the road
        // visible between them, so they are sized in real pixels off the short
        // edge of the screen -- the width the same phone has when held upright
        // -- rather than as a fraction of the wide one. A control ends up the
        // size it is in portrait, and the extra width all becomes the gap
        // instead of stretching the pedals across half a screen.
        // Minus the bar's own 10px padding either side, which is exactly what
        // the percentages below resolve against in portrait; the padding the
        // landscape CSS adds around each cluster's backdrop sits outside the
        // basis (content-box), so it pads the panel without shrinking the
        // buttons in it.
        const inner = Math.max(0, Math.min(innerWidth, innerHeight) - 20);
        steerSlotEl.style.flex = `0 0 ${Math.round(inner * frac)}px`;
        pedalsEl.style.flex = `0 0 ${Math.round(inner * (1 - frac))}px`;
    } else {
        steerSlotEl.style.flex = `0 0 ${frac * 100}%`;
        pedalsEl.style.flex = `0 0 ${(1 - frac) * 100}%`;
    }
}
function setSteerWidthFrac(v) { STEER_WIDTH_FRAC = v; applyDriveWidths(); }
function setSteerDeadZone(v) { STEER_DEAD_ZONE = v; }

function syncSteerMode() {
    if (!steerAnalogEl) return;
    steerAnalogEl.classList.toggle('ic-hidden', !ANALOG_STEERING_ENABLED);
    steerDigitalEl.classList.toggle('ic-hidden', ANALOG_STEERING_ENABLED);
}
// Dropping whatever the previous widget had live is what keeps a stale full-lock
// slider value (or a button caught mid-press) from surviving a mode switch.
function setAnalogSteering(on) {
    ANALOG_STEERING_ENABLED = on;
    touchDrive.steer = 0; touchDrive.steerLeft = false; touchDrive.steerRight = false;
    syncSteerMode();
}

function initDriveControls() {
    if (!CONTROLS_DOM || !wantsTouchControls()) return;

    const bar = ctlEl('div', 'ic-drive', document.body);
    bar.addEventListener('contextmenu', e => e.preventDefault());

    steerSlotEl = ctlEl('div', 'ic-steer-slot', bar);

    // --- Analog slider ---
    const steer = ctlEl('div', 'ic-steer ic-hidden', steerSlotEl);
    steerAnalogEl = steer;
    const track = ctlEl('div', 'ic-steer-track', steer);
    ctlEl('div', 'ic-steer-centre', track);
    const thumb = ctlEl('div', 'ic-steer-thumb', track);
    ctlEl('div', 'ic-steer-label', steer, 'steer');

    // A thumb held near centre reads as dead straight rather than a faint drift --
    // a fingertip is wide next to the track, and a wide vehicle has no business
    // wandering from a touch that was aiming for "straight ahead". Rescaled so the
    // ends of the track still reach full lock rather than losing that last bit of
    // range to the dead zone. STEER_DEAD_ZONE (constants.js) is read live, not
    // captured, so the settings panel's slider takes effect on the next touch.
    const setSteer = v => {
        v = Math.max(-1, Math.min(1, v));
        const dz = Math.max(0, Math.min(0.9, STEER_DEAD_ZONE));
        v = Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
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

    // --- Digital left/right buttons (the default) ---
    const digital = ctlEl('div', 'ic-steer-digital ic-hidden', steerSlotEl);
    steerDigitalEl = digital;
    const steerBtn = (cls, label, key) => {
        const b = ctlEl('button', 'ic-steer-btn ' + cls, digital, label);
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
    steerBtn('ic-steer-left', '◀', 'steerLeft');
    steerBtn('ic-steer-right', '▶', 'steerRight');
    syncSteerMode();

    // --- Gas / brake ---
    pedalsEl = ctlEl('div', 'ic-pedals', bar);
    const pedal = (cls, label, key) => {
        const b = ctlEl('button', 'ic-pedal ' + cls, pedalsEl, label);
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

    applyDriveWidths();
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
.ic-steer-slot { flex: 1 1 38%; display: flex; flex-direction: column; justify-content: center;
    touch-action: none; }
.ic-steer { display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.ic-steer-track { position: relative; height: 62px; border-radius: 31px;
    background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35); }
.ic-steer-centre { position: absolute; left: 50%; top: 8px; bottom: 8px; width: 2px;
    margin-left: -1px; background: rgba(255,255,255,0.4); }
.ic-steer-thumb { position: absolute; top: 4px; width: 52px; height: 52px;
    margin-left: -26px; border-radius: 26px; background: rgba(255,255,255,0.85); }
.ic-steer-label { color: #fff; text-align: center; opacity: 0.8; font-size: 12px; }
.ic-steer-digital { display: flex; gap: 10px; height: 62px; }
.ic-steer-btn { flex: 1 1 50%; color: #fff; font: bold 24px system-ui, sans-serif;
    background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35);
    border-radius: 10px; touch-action: none; -webkit-tap-highlight-color: transparent; }
.ic-steer-btn.ic-held { background: rgba(255,255,255,0.45); }
/* Compound selectors, not a bare .ic-hidden re-declaration: .ic-steer and
   .ic-steer-digital each set their own display at the same specificity as
   plain .ic-hidden, and being the later rules in this same stylesheet they'd
   otherwise win regardless of which one also carries ic-hidden -- which is
   exactly what showed both steering widgets stacked at once instead of
   hiding whichever syncSteerMode() just turned off. Two classes beats one,
   so these two win no matter their position in the file. */
.ic-steer.ic-hidden, .ic-steer-digital.ic-hidden { display: none; }
.ic-pedals { flex: 1 1 62%; display: flex; gap: 10px; }
.ic-pedal { flex: 1 1 50%; min-height: 84px; color: #fff;
    border: 1px solid rgba(255,255,255,0.35); border-radius: 10px;
    font: bold 15px system-ui, sans-serif; cursor: pointer;
    touch-action: none; -webkit-tap-highlight-color: transparent; }

/* --- Landscape phones ---
   Turned sideways the screen is wide and short, so the two clusters split to
   the left and right edges at their portrait size (applyDriveWidths above) and
   the city shows through the gap between them, rather than the bar staying one
   solid band across the whole bottom of a screen that has little height to give
   away. The bar itself still spans the full width -- it is what holds the two
   clusters apart -- so it hands over both the things that would otherwise cover
   that gap: its background, and its pointer events, which each cluster takes
   back for the area it actually occupies. Without that second half, the gap
   would look like open road and still swallow every drag and pinch aimed at the
   canvas underneath it.
   The side insets pick up the safe area too: in landscape a notch is on one
   side rather than the top, and it lands on the steering. */
body.ic-landscape .ic-drive { background: none; pointer-events: none;
    justify-content: space-between; padding-top: 2px;
    padding-left: calc(10px + env(safe-area-inset-left, 0px));
    padding-right: calc(10px + env(safe-area-inset-right, 0px)); }
/* The padding here is what the bar's own top padding gives up above: each
   cluster's backdrop now needs its own breathing room, and doubling the two on
   the axis a sideways phone has least of would push the bar taller for nothing.
   Horizontally it is left alone -- see applyDriveWidths on why this padding
   lands outside the width a control is sized to, not inside it. */
body.ic-landscape .ic-steer-slot, body.ic-landscape .ic-pedals {
    pointer-events: auto; padding: 8px; border-radius: 16px;
    background: rgba(0,0,0,0.45); }

.ic-gas { background: rgba(70,190,90,0.55); }
.ic-brake { background: rgba(210,70,70,0.55); }
.ic-pedal.ic-held { filter: brightness(1.6); }
`;

if (CONTROLS_DOM) {
    const style = document.createElement('style');
    style.textContent = CONTROLS_CSS;
    document.head.appendChild(style);
    buildCameraToolbar();
    applyLandscapeClass();
    // orientationchange is the event this is about, but every browser that fires
    // it fires a resize alongside, and resize alone also catches a desktop
    // window dragged across the square with ?touch=1 on. syncOrientation itself
    // returns immediately unless the answer actually changed, so the ordinary
    // resize storm during a drag costs one comparison each.
    addEventListener('resize', syncOrientation);

    let heldLast = 0;
    requestAnimationFrame(function heldLoop(t) {
        const dt = heldLast ? Math.min((t - heldLast) / 1000, 0.05) : 0;
        heldLast = t;
        for (const action of heldActions) action(dt);
        requestAnimationFrame(heldLoop);
    });
}
