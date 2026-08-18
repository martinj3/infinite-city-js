// --- Canvas setup ---
// Both `let`, not `const`: renderVehicleThumb briefly points render3d.js's
// project()/projectAndDraw() at an offscreen canvas by reassigning these, since
// that is the only handle those functions read (see renderVehicleThumb below).
let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener('resize', resize);

// --- Input ---
const keys = {};
addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) e.preventDefault(); keys[e.key] = true; });
addEventListener('keyup', e => { keys[e.key] = false; });
addEventListener('wheel', e => {
    e.preventDefault();
    if (inputLocked) return;
    const factor = e.deltaY < 0 ? ZOOM_WHEEL : 1 / ZOOM_WHEEL;
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, PX_PER_FT * factor));
}, { passive: false });

// Touch: pinch to zoom, and the on-screen wheel and pedals. There is no
// drag-to-scroll here -- the camera is already following the car.
initPanZoom({ pan: false });
initDriveControls();

// --- Player ---
// Built here, before growCityRandom below, so the seed street already exists to
// spawn the player onto.
const seedStreet = initMap();
// Frame counter for the periodic generate() sweep -- see update() below. Starts
// at the interval itself so the first frame generates immediately rather than
// waiting a couple of seconds for the counter to catch up.
let genFrame = GENERATE_INTERVAL_FRAMES;

// steer is kept on the player because the car is drawn from it too: the front
// wheels turn to match whatever is steering the car.
// Picked as a type name rather than through generateRandomVehicle() so the intro
// sequence below can display it -- a generated vehicle carries no name of its
// own to read back (see vehicles/vehicleUtils.js).
const playerVehicleType = randomVehicleType();
// Spawn centered in the lane, not straddling the yellow line: the same offset
// traffic places itself with (laneOffset/placeCarPose, traffic.js), for a car
// travelling the seed street's own heading (0, due east).
const player = { x: 200, y: laneOffset(seedStreet), angle: 0, speed: 0, steer: 0, vehicle: generateVehicle(playerVehicleType) };
// Resolved from the vehicle's type (see vehicles/performance.js) whenever the
// player's car changes -- at spawn, and again from the picker below.
player.perf = vehiclePerf(player.vehicle);

// A phone's screen wants more of the view turned toward the road ahead than
// a desktop monitor does -- see VIEW_ANGLE_DEFAULT_MOBILE, constants.js. Set
// here, before the intro flourish below captures its own starting angle, so
// the sweep starts and settles on whichever default this device gets.
VIEW_ANGLE = viewAngleDefault();

// --- Vehicle picker ---
// A dropdown next to the camera toolbar for switching the player's own car
// mid-drive. Position and speed carry over untouched -- only vehicle and perf
// change -- so swapping into something slower doesn't teleport or stall the car,
// it just now has a slower car's physics under it.
//
// A registered type with weight 0 (craneTruck, semiTruck -- see
// registerPlaceholderVehicle in vehicleUtils.js) has no body style of its own and
// draws as a plain sedan; offering it here would be a sedan wearing someone
// else's name tag, so it's left out exactly the way traffic already leaves it out.
const VEHICLE_DISPLAY_NAMES = { suv: 'SUV', vwBeetle: 'VW Beetle', vwMinibus: 'VW Minibus' };
function vehicleDisplayName(type) {
    return VEHICLE_DISPLAY_NAMES[type] ||
        type.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// A static preview of one vehicle type, drawn with render3d.js's own
// project()/projectAndDraw() -- the same pixel-pushing code the live game uses,
// so a preview can never drift from what driving the car actually looks like --
// by briefly pointing their canvas/ctx at an offscreen canvas instead of the
// game's. Synchronous and self-contained: nothing else runs between the swap and
// the restore, so there is no frame in which the wrong canvas is "live".
function renderVehicleThumb(type, w, h) {
    const thumb = document.createElement('canvas');
    thumb.width = w; thumb.height = h;
    const thumbCtx = thumb.getContext('2d');

    const savedCanvas = canvas, savedCtx = ctx, savedZoom = PX_PER_FT,
          savedAngle = VIEW_ANGLE, savedScale = Y_SCALE;
    canvas = thumb; ctx = thumbCtx;
    VIEW_ANGLE = VIEW_ANGLE_DEFAULT; Y_SCALE = Y_SCALE_DEFAULT;

    const v = generateVehicle(type);
    // Fit the car's own bounding box to the thumbnail -- the same corner-sweep
    // vehicles/vehicleGrid.js's fitToGrid uses, but per-point rather than
    // per-axis, since project() folds height straight into screen Y (no Y_SCALE
    // on that term) while the footprint's contribution is scaled by it; only
    // walking actual corners gets both right at once.
    const cos = getCosV(), sin = getSinV();
    const hl = v.length / 2, hw = v.width / 2;
    let sx = 0, sy = 0;
    for (const x of [-hl, hl]) for (const y of [-hw, hw]) for (const z of [0, v.height]) {
        sx = Math.max(sx, Math.abs(x * cos - y * sin));
        sy = Math.max(sy, Math.abs((x * sin + y * cos) * Y_SCALE - z));
    }
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX,
        0.8 * Math.min(w / 2 / sx, h / 2 / sy)));

    thumbCtx.fillStyle = 'hsl(0, 0%, 40%)';
    thumbCtx.fillRect(0, 0, w, h);
    // A thumbnail's own fitted zoom is often well under the wheels/roof/glass
    // thresholds (vehicles/vehicleUtils.js) for anything bus- or truck-sized, so
    // without this a fire truck or school bus preview would be a bare box with
    // no wheels and no light bar. Full detail regardless of PX_PER_FT.
    VEHICLE_FORCE_FULL_DETAIL = true;
    drawVehicle(v, 0, 0, 0, 0, 0, 0);
    VEHICLE_FORCE_FULL_DETAIL = false;

    canvas = savedCanvas; ctx = savedCtx; PX_PER_FT = savedZoom;
    VIEW_ANGLE = savedAngle; Y_SCALE = savedScale;
    return thumb;
}

const VEH_PICKER_CSS = `
/* Driving only: the camera toolbar (controls.js) and this picker both carry
   .ic-cam, and controls.js's own stylesheet pins that to the top right by
   default -- fine on the test pages, but the top right here is where an
   oncoming car or a turn the player is about to take needs to be read at a
   glance, so nothing should sit over it. Moved to the top left instead, which
   this page has spare: this override only ever loads on driving.html, so no
   other page's layout changes. The picker keeps its "one slot over from the
   camera toggle" spot, just mirrored to the other side of it. */
.ic-cam { left: 10px; right: auto; align-items: flex-start; }
.gm-veh { left: 62px; right: auto; }
.gm-veh-panel { max-height: 70vh; overflow-y: auto; align-items: stretch; }
.gm-veh-row { display: flex; align-items: center; gap: 8px; padding: 6px;
    border-radius: 6px; cursor: pointer; color: #fff; white-space: nowrap; }
.gm-veh-row:hover, .gm-veh-row:active { background: rgba(255,255,255,0.16); }
.gm-veh-row canvas { border-radius: 4px; flex: none; }
.gm-follow-row { cursor: pointer; }
.gm-follow-row input { width: 20px; height: 20px; }
.gm-follow-label { width: auto; text-align: left; }
`;

function buildVehiclePicker() {
    if (!CONTROLS_DOM) return;
    const style = document.createElement('style');
    style.textContent = VEH_PICKER_CSS;
    document.head.appendChild(style);

    const THUMB_W = 52, THUMB_H = 36;
    const types = Object.keys(VEHICLE_TYPES).filter(t => VEHICLE_TYPES[t].weight > 0).sort(
        (a, b) => vehicleDisplayName(a).localeCompare(vehicleDisplayName(b)));

    // Mirrors controls.js's own camera toolbar (ic-cam / ic-cam-panel / ic-btn),
    // one slot over from it (see VEH_PICKER_CSS above), so the two toolbars
    // read as one family.
    const wrap = ctlEl('div', 'ic-cam gm-veh', document.body);
    const panel = ctlEl('div', 'ic-cam-panel gm-veh-panel ic-hidden', wrap);

    for (const type of types) {
        const row = ctlEl('div', 'gm-veh-row', panel);
        row.appendChild(renderVehicleThumb(type, THUMB_W, THUMB_H));
        ctlEl('span', '', row, vehicleDisplayName(type));
        row.addEventListener('click', () => {
            player.vehicle = generateVehicle(type);
            player.perf = vehiclePerf(player.vehicle);
            panel.classList.add('ic-hidden');
            toggle.classList.remove('ic-held');
        });
    }

    const toggle = ctlEl('button', 'ic-btn ic-cam-toggle', wrap, '🚗');
    toggle.title = 'Switch cars';
    toggle.setAttribute('aria-label', 'Switch cars');
    toggle.addEventListener('click', () => {
        panel.classList.toggle('ic-hidden');
        toggle.classList.toggle('ic-held', !panel.classList.contains('ic-hidden'));
    });
}
buildVehiclePicker();

// --- Camera follow ---
// Rotates the view to keep the car's own heading roughly put on screen as it
// turns, with a dead zone so ordinary steering wander doesn't tug the camera
// around -- only a sustained turn past the zone's edge pulls the view with it,
// and it keeps pulling for as long as the car keeps turning.
//
// followAnchor is the on-screen heading (player.angle + VIEW_ANGLE) the car is
// free to drift CAMERA_FOLLOW_DEAD_ZONE either side of before the camera starts
// compensating. Q/E and the camera toolbar's rotate buttons (controls.js) move
// VIEW_ANGLE exactly as they always did -- direct and instant, so they keep
// feeling the way they always have -- but now also carry followAnchor along by
// the same amount (cameraRotateHook, below), which is what makes them "set the
// target": each manual nudge redefines where the dead zone is centred, and every
// frame's automatic correction is seeking to hold the car within that zone,
// whichever way it last got there.
let cameraFollow = true;
let followAnchor = normA(player.angle + VIEW_ANGLE);

function angleDiff(a, b) {
    const d = normA(a - b);
    return d > Math.PI ? d - TWO_PI : d;
}

// Re-anchors to the car's current screen heading, so flipping the option on
// never causes a jump -- whatever VIEW_ANGLE drifted to while it was off (or
// before the page even loaded) simply becomes the new centre of the dead zone.
function setCameraFollow(on) {
    cameraFollow = on;
    followAnchor = normA(player.angle + VIEW_ANGLE);
}

cameraRotateHook = delta => {
    VIEW_ANGLE = normA(VIEW_ANGLE + delta);
    followAnchor = normA(followAnchor + delta);
};

function buildCameraFollowToggle() {
    if (!CONTROLS_DOM || !cameraPanelEl) return;
    const row = ctlEl('label', 'ic-row gm-follow-row', cameraPanelEl);
    const box = ctlEl('input', '', row);
    box.type = 'checkbox';
    box.checked = cameraFollow;
    ctlEl('span', 'ic-label gm-follow-label', row, 'follow car');
    box.addEventListener('change', () => setCameraFollow(box.checked));
}
buildCameraFollowToggle();

// --- Car draw offset ---
// Draws the car left of, and below, dead centre rather than at it: a driver
// gets far more use out of a longer look at what's coming up than out of the
// space behind the car, which is mostly what sat in the room this claims. On
// by default, on both mobile and desktop, with a checkbox in the camera panel
// (next to "follow car") to go back to dead centre.
//
// Done by moving the *camera* in world space, not by nudging anything in
// screen space. That matters: the ground and street markings are drawn through
// the ctx transform applyCamera sets up (drawing.js), but vehicles and
// buildings are drawn through render3d.js's project(), which computes screen
// coordinates itself from canvas.width/2 and never sees that transform at all.
// Offsetting one of those two paths moves the streets out from under the cars
// -- far enough, at the driving zoom, to put every car a couple of lanes over.
// Offsetting the camera instead is a single number both paths already read, so
// they cannot disagree, and every existing camera consumer (the cull box, the
// depth sort, drawHonks) stays correct for free.
//
// viewCamX/viewCamY are that camera: the world point sitting at true screen
// centre, which is the car's own position shifted by however many feet put the
// car where we want it on screen instead. dragToCamDelta (controls.js) is
// already exactly that conversion -- screen pixels to the feet of camera
// movement that slide the world by them -- so it does the unprojection,
// rotation and Y_SCALE squash included.
let carOffsetEnabled = true;
let viewCamX = player.x, viewCamY = player.y;

// Recomputed every frame, and deliberately at the end of update(): VIEW_ANGLE,
// Y_SCALE and PX_PER_FT all still move earlier in the same frame (the intro
// flourish, camera-follow, the zoom/rotate/tilt keys), and all three feed the
// unprojection below. Recomputing after they settle is what keeps the car
// pinned to one spot on screen through a rotation instead of drifting during
// it -- the camera swings around the car, so rotation is still about the car.
// The canvas can resize under us too (a phone rotating), and driveBarHeight()
// only becomes non-zero once the pedal bar exists, so neither is cached.
function updateViewCam() {
    if (!carOffsetEnabled) { viewCamX = player.x; viewCamY = player.y; return; }
    const W = canvas.width, H = canvas.height;
    const offX = -CAR_OFFSET_X_FRAC * W;
    let offY = CAR_OFFSET_Y_FRAC * H;
    // Pushing the car down the screen is exactly what would tuck it under the
    // pedal bar and the street-name sign, both anchored to the bottom edge on
    // a touch device -- driveBarHeight() (drawing.js) is the bar's own measured
    // height, and the rest covers the sign sitting level with it just above.
    // Desktop has neither, so the plain fraction always stands there.
    if (touchDrive.shown) {
        const clearance = driveBarHeight() + STREET_SIGN_FONT_TOUCH + 24;
        offY = Math.min(offY, Math.max(0, H / 2 - clearance));
    }
    const [dx, dy] = dragToCamDelta(offX, offY);
    viewCamX = player.x + dx;
    viewCamY = player.y + dy;
}

function buildCarOffsetToggle() {
    if (!CONTROLS_DOM || !cameraPanelEl) return;
    const row = ctlEl('label', 'ic-row gm-follow-row', cameraPanelEl);
    const box = ctlEl('input', '', row);
    box.type = 'checkbox';
    box.checked = carOffsetEnabled;
    ctlEl('span', 'ic-label gm-follow-label', row, 'shift car view');
    box.addEventListener('change', () => { carOffsetEnabled = box.checked; });
}
buildCarOffsetToggle();

// --- Driving control settings panel ---
// A second toolbar, one slot right of the vehicle picker (see "Keeping the top
// right clear", docs/controls.md), for the handful of steering-feel constants
// (constants.js) that are worth tuning live rather than guessing at: mobile's
// steering widget (slider vs. two digital buttons), the slider's own width and
// dead zone, and the digital fine-steering ramp that also applies to keyboard
// steering. Every row shows the value it is currently set to, so a value that
// feels right can be read straight off the panel and reported back as a new
// default rather than rediscovered by trial and error next time.
const SETTINGS_CSS = `
.gm-settings { left: 114px; right: auto; }
.gm-settings-panel { width: 220px; align-items: stretch; }
.gm-set-row { display: flex; align-items: center; gap: 8px; }
.gm-set-row .ic-label { width: 72px; flex: none; }
.gm-set-row input[type=range] { flex: 1 1 auto; min-width: 0; }
.gm-set-val { min-width: 38px; text-align: right; color: #fff; font-size: 12px;
    font-variant-numeric: tabular-nums; }
`;

// label/min/max/step operate on whatever integer-ish range makes a smooth drag;
// get/set convert to and from the real value the constant is stored in, so a
// constant that lives in fractions (0..1) or seconds still gets a slider with
// sane step sizes instead of dragging across 0.01-wide floats.
function settingsRangeRow(panel, label, min, max, step, get, set, fmt) {
    const row = ctlEl('div', 'ic-row gm-set-row', panel);
    ctlEl('span', 'ic-label', row, label);
    const input = ctlEl('input', '', row);
    input.type = 'range'; input.min = min; input.max = max; input.step = step;
    input.value = get();
    const val = ctlEl('span', 'gm-set-val', row, fmt(get()));
    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        set(v);
        val.textContent = fmt(v);
    });
}

function buildSettingsPanel() {
    if (!CONTROLS_DOM) return;
    const style = document.createElement('style');
    style.textContent = SETTINGS_CSS;
    document.head.appendChild(style);

    const wrap = ctlEl('div', 'ic-cam gm-settings', document.body);
    const panel = ctlEl('div', 'ic-cam-panel gm-settings-panel ic-hidden', wrap);

    const analogRow = ctlEl('label', 'ic-row gm-follow-row', panel);
    const analogBox = ctlEl('input', '', analogRow);
    analogBox.type = 'checkbox';
    analogBox.checked = ANALOG_STEERING_ENABLED;
    ctlEl('span', 'ic-label gm-follow-label', analogRow, 'analog steering');
    analogBox.addEventListener('change', () => setAnalogSteering(analogBox.checked));

    settingsRangeRow(panel, 'steer width', 20, 60, 1,
        () => Math.round(STEER_WIDTH_FRAC * 100), v => setSteerWidthFrac(v / 100), v => v + '%');
    settingsRangeRow(panel, 'deadzone', 0, 20, 1,
        () => Math.round(STEER_DEAD_ZONE * 100), v => setSteerDeadZone(v / 100), v => v + '%');
    settingsRangeRow(panel, 'ramp time', 0, 100, 5,
        () => Math.round(STEER_HALF_RATE_DURATION * 100), v => { STEER_HALF_RATE_DURATION = v / 100; }, v => (v / 100).toFixed(2) + 's');
    settingsRangeRow(panel, 'ramp rate', 10, 100, 5,
        () => Math.round(STEER_HALF_RATE_FACTOR * 100), v => { STEER_HALF_RATE_FACTOR = v / 100; }, v => v + '%');
    settingsRangeRow(panel, 'UI earlier', 0, 100, 5,
        () => Math.round(UI_DELAY_MOBILE_EARLIER * 100), v => { UI_DELAY_MOBILE_EARLIER = v / 100; }, v => (v / 100).toFixed(2) + 's');

    const toggle = ctlEl('button', 'ic-btn ic-cam-toggle', wrap, '⚙');
    toggle.title = 'Driving control settings';
    toggle.setAttribute('aria-label', 'Driving control settings');
    toggle.addEventListener('click', () => {
        panel.classList.toggle('ic-hidden');
        toggle.classList.toggle('ic-held', !panel.classList.contains('ic-hidden'));
    });
}
buildSettingsPanel();

// --- Intro sequence ---
// A four-second flourish on load: the camera does one full turn around the
// parked car while the tilt oscillates and settles, and the zoom eases in from
// a wider establishing view to the driving default (see constants.js). Driving
// input, keyboard shortcuts, and touch gestures are locked out for those same
// four seconds (inputLocked, declared in controls.js and checked there and by
// the wheel handler above and the block below), and every UI panel stays
// hidden a further second after that -- body.ic-intro, added below and removed
// once the reveal timer runs out, fades them in via the CSS transition already
// declared on .ic-cam/.ic-drive in controls.js -- so nothing competes with the
// flourish or gets tapped by accident while the car is still being introduced.
if (CONTROLS_DOM) document.body.classList.add('ic-intro');
inputLocked = true;
// Tall buildings the player would otherwise be driving past see-through (see
// lotHidesStreet in lots.js) draw at full opacity for the same span the UI
// stays hidden: the camera is sweeping every direction during the flourish, so
// a building fading in and out as it crosses "in the way" would be one more
// thing competing for attention. Snapped back on (not faded) the instant the
// UI reappears, in update() below, rather than eased -- the fade-in of the UI
// itself is already the transition the eye is following at that moment.
buildingFade = false;
let introSettled = false;   // true once the flourish has hit its exact rest values
let uiRevealed = false;     // true once body.ic-intro has been removed
let uiAlpha = 0;            // 0..1, read by drawing.js to fade in the on-canvas HUD
const introStartAngle = VIEW_ANGLE;
// Captured once rather than re-read every frame: pxPerFtDefault() itself never
// changes mid-session (see its own comment, controls.js).
const introTargetZoom = pxPerFtDefault();

// Vehicle name banner, pulsing gray/white for the length of the flourish. A
// DOM overlay rather than a canvas draw so the pulse is just a CSS animation;
// positioned toward the top rather than centered, since dead center is exactly
// where the parked car itself is drawn.
const INTRO_TEXT_CSS = `
.gm-intro-text { position: fixed; top: 14%; left: 0; right: 0; text-align: center;
    font: 700 clamp(26px, 5vw, 52px) system-ui, sans-serif; letter-spacing: 0.5px;
    pointer-events: none; z-index: 20; transition: opacity 0.4s ease;
    text-shadow: 0 2px 12px rgba(0,0,0,0.4); animation: gm-pulse 1.2s ease-in-out infinite; }
@keyframes gm-pulse {
    0%, 100% { color: rgba(150,150,150,0.55); }
    50% { color: rgba(255,255,255,0.9); }
}
`;
let introTextEl = null;
if (CONTROLS_DOM) {
    const style = document.createElement('style');
    style.textContent = INTRO_TEXT_CSS;
    document.head.appendChild(style);
    introTextEl = ctlEl('div', 'gm-intro-text', document.body, vehicleDisplayName(playerVehicleType) + '!');
}

function updateIntroCamera() {
    const t = Math.min(1, elapsed / INTRO_DURATION);
    VIEW_ANGLE = normA(introStartAngle + t * TWO_PI);

    const ez = 1 - Math.pow(1 - t, 3); // ease-out: reaches the new default without overshoot
    PX_PER_FT = INTRO_ZOOM_START + (introTargetZoom - INTRO_ZOOM_START) * ez;

    // Amplitude decays to exactly 0 by t=1, so the seesaw always lands dead on
    // Y_SCALE_DEFAULT rather than wherever the sine happened to be.
    const decay = (1 - t) * (1 - t);
    Y_SCALE = Y_SCALE_DEFAULT + Math.sin(t * TWO_PI * INTRO_TILT_CYCLES) * (Y_SCALE_MAX - Y_SCALE_DEFAULT) * 0.8 * decay;
}

// Snaps every value the flourish was easing toward onto its exact rest state --
// the ease and the decaying oscillation both approach but never guarantee exact
// equality by t=1 -- and hands manual control back cleanly: VIEW_ANGLE resolves
// to the same heading the rest of the game already expects (not "start + 2*PI"
// left unreduced), and followAnchor is recentred on it so camera-follow doesn't
// read the flourish's spin as a sustained turn and immediately fight to correct it.
function finishIntroCamera() {
    VIEW_ANGLE = normA(introStartAngle);
    Y_SCALE = Y_SCALE_DEFAULT;
    PX_PER_FT = introTargetZoom;
    followAnchor = normA(player.angle + VIEW_ANGLE);
    inputLocked = false;
    if (introTextEl) {
        introTextEl.style.opacity = '0';
        setTimeout(() => introTextEl.remove(), 400);
    }
}

// Tracks how long the current digital steering direction (a held key, arrows or
// WASD, or the on-screen left/right buttons -- never the analog slider) has been
// held, so update() below can halve the turn rate for the first
// STEER_HALF_RATE_DURATION seconds of it -- see constants.js.
let digitalSteerSign = 0, digitalSteerHoldTime = 0;

// --- Update ---
function update(dt) {
    // Keys and the touch controls feed the same three inputs. Steering is analog
    // only from the slider; arrows/WASD and the on-screen left/right buttons are
    // digital, simply the slider pushed all the way over. Locked out for the
    // length of the intro flourish, above.
    if (!inputLocked) {
        const gas = keys['ArrowUp'] || keys['w'] || keys['W'] || touchDrive.gas;
        const brake = keys['ArrowDown'] || keys['s'] || keys['S'] || touchDrive.brake;
        const digitalRight = keys['ArrowRight'] || keys['d'] || keys['D'] || touchDrive.steerRight;
        const digitalLeft = keys['ArrowLeft'] || keys['a'] || keys['A'] || touchDrive.steerLeft;
        const digitalSteer = (digitalRight ? 1 : 0) - (digitalLeft ? 1 : 0);
        let steer = digitalSteer;
        if (steer === 0) steer = touchDrive.steer * TOUCH_STEER_GAIN;
        player.steer = Math.max(-1, Math.min(1, steer));

        // Fine-steering ramp: a direction newly held (or one just switched from
        // the other side) turns at STEER_HALF_RATE_FACTOR of the normal rate for
        // STEER_HALF_RATE_DURATION seconds, so a quick tap nudges the car gently
        // instead of snapping straight to full rate. Never applies to the analog
        // slider, which already has continuous fine control of its own.
        if (digitalSteer !== 0) {
            if (digitalSteer !== digitalSteerSign) { digitalSteerSign = digitalSteer; digitalSteerHoldTime = 0; }
            else digitalSteerHoldTime += dt;
        } else { digitalSteerSign = 0; digitalSteerHoldTime = 0; }
        const steerRateScale = (digitalSteer !== 0 && digitalSteerHoldTime < STEER_HALF_RATE_DURATION)
            ? STEER_HALF_RATE_FACTOR : 1;

        if (gas) player.speed += curveAccel(player.speed, player.perf.accelK) * dt;
        if (brake) {
            if (player.speed > 0) { player.speed -= player.perf.brakeDecel * dt; if (player.speed < 0) player.speed = 0; }
            else player.speed -= curveAccel(player.speed, player.perf.accelK) * 0.5 * dt;
        }
        if (!gas && !brake) {
            if (player.speed > 0) player.speed = Math.max(0, player.speed - DRAG * dt);
            else if (player.speed < 0) player.speed = Math.min(0, player.speed + DRAG * dt);
        }
        player.speed = Math.max(-REVERSE_MAX, Math.min(MAX_SPEED, player.speed));

        const tf = Math.min(Math.abs(player.speed) / 20, 1);
        player.angle += MAX_TURN_RATE * tf * steer * dt * steerRateScale;
    }

    player.x += Math.cos(player.angle) * player.speed * dt;
    player.y += Math.sin(player.angle) * player.speed * dt;

    if (elapsed < INTRO_DURATION) {
        updateIntroCamera();
    } else {
        if (!introSettled) { finishIntroCamera(); introSettled = true; }

        if (keys['='] || keys['+']) PX_PER_FT = Math.min(PX_PER_FT_MAX, PX_PER_FT * Math.pow(ZOOM_SPEED, dt));
        if (keys['-'] || keys['_']) PX_PER_FT = Math.max(PX_PER_FT_MIN, PX_PER_FT / Math.pow(ZOOM_SPEED, dt));

        // View rotation (Q/E keys)
        if (keys['q'] || keys['Q']) rotateView(-ROTATE_SPEED * dt);
        if (keys['e'] || keys['E']) rotateView(ROTATE_SPEED * dt);

        // Camera follow: once the car's on-screen heading strays past the dead
        // zone, rotate the view by exactly the excess, every frame, so it keeps
        // pace with a sustained turn without ever fully re-centring (which reads as
        // sluggish, always a beat behind) or snapping dead ahead (which reads as
        // twitchy on every little correction).
        if (cameraFollow) {
            const diff = angleDiff(normA(player.angle + VIEW_ANGLE), followAnchor);
            if (diff > CAMERA_FOLLOW_DEAD_ZONE) VIEW_ANGLE = normA(VIEW_ANGLE - (diff - CAMERA_FOLLOW_DEAD_ZONE));
            else if (diff < -CAMERA_FOLLOW_DEAD_ZONE) VIEW_ANGLE = normA(VIEW_ANGLE - (diff + CAMERA_FOLLOW_DEAD_ZONE));
        }

        // View tilt (R/F keys)
        if (keys['r'] || keys['R']) Y_SCALE = Math.min(Y_SCALE_MAX, Y_SCALE + TILT_SPEED * dt);
        if (keys['f'] || keys['F']) Y_SCALE = Math.max(Y_SCALE_MIN, Y_SCALE - TILT_SPEED * dt);
    }

    // Drives both the DOM panels' fade-in (removing body.ic-intro lets their own
    // CSS transition run) and the on-canvas HUD's fade-in (drawing.js reads
    // uiAlpha directly, since a canvas fill has no transition of its own).
    // introUIDelay() (controls.js) is shorter on mobile -- see constants.js.
    uiAlpha = Math.max(0, Math.min(1, (elapsed - INTRO_DURATION - introUIDelay()) / UI_FADE_DURATION));
    if (!uiRevealed && uiAlpha > 0) {
        if (CONTROLS_DOM) document.body.classList.remove('ic-intro');
        uiRevealed = true;
        buildingFade = true;
    }

    // Traffic first, so the streets generate() is about to create are populated
    // around where the player is now rather than where they were last frame.
    // The player goes along too: drivers follow it, brake for it, and swerve
    // around it exactly as they do for each other.
    updateTraffic(player.x, player.y, dt, player);
    // generate() now scans every node in the map (see streets.js), so it only
    // runs once every GENERATE_INTERVAL_FRAMES frames rather than every one --
    // genFrame starts at the interval itself so the very first frame still
    // generates immediately, same as it always has.
    if (++genFrame >= GENERATE_INTERVAL_FRAMES) { genFrame = 0; generate(player.x, player.y); }

    // Last, once the car has moved and the view angle, tilt and zoom above have
    // all settled for this frame -- every one of them feeds it. See its own
    // comment above.
    updateViewCam();
}

// --- Game loop ---
// instructionAlpha starts at 0 rather than 1 now: the "Arrows: drive..." hint
// would be actively misleading shown atop a locked-out intro, so it waits for
// the same reveal moment as the rest of the UI (elapsed passing
// INTRO_DURATION + INTRO_UI_DELAY, tracked by uiAlpha in update()) before
// fading in over about a second, then fades back out a few seconds later
// exactly as it always did.
let lastTime = performance.now(), elapsed = 0, instructionAlpha = 0;
function loop(t) {
    const dt = Math.min((t - lastTime) / 1000, 0.05);
    lastTime = t; elapsed += dt;
    const uiRevealTime = INTRO_DURATION + introUIDelay();
    if (elapsed > uiRevealTime) instructionAlpha = Math.min(1, instructionAlpha + dt);
    if (elapsed > uiRevealTime + 4) instructionAlpha = Math.max(0, instructionAlpha - dt);
    update(dt);
    draw();
    requestAnimationFrame(loop);
}
// A little more than the bare seed street for a first impression: visit ten
// more unresolved intersections, picked at random (growCityRandom, streets.js)
// rather than nearest-origin, so the small extra neighborhood this builds reads
// as scattered blocks around the seed rather than one corridor in one direction.
growCityRandom(10);
requestAnimationFrame(loop);
