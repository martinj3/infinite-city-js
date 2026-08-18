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
    const factor = e.deltaY < 0 ? ZOOM_WHEEL : 1 / ZOOM_WHEEL;
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, PX_PER_FT * factor));
}, { passive: false });

// Touch: pinch to zoom, and the on-screen wheel and pedals. There is no
// drag-to-scroll here -- the camera is already following the car.
initPanZoom({ pan: false });
initDriveControls();

// --- Player ---
// steer is kept on the player because the car is drawn from it too: the front
// wheels turn to match whatever is steering the car.
const player = { x: 200, y: 0, angle: 0, speed: 0, steer: 0, vehicle: generateRandomVehicle() };
// Resolved from the vehicle's type (see vehicles/performance.js) whenever the
// player's car changes -- at spawn, and again from the picker below.
player.perf = vehiclePerf(player.vehicle);

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
.gm-veh { right: 62px; }
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
    // one slot to its left, so the two toolbars read as one family.
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

// --- Update ---
function update(dt) {
    // Keys and the touch controls feed the same three inputs. Steering is analog:
    // a key is simply the slider pushed all the way over.
    const gas = keys['ArrowUp'] || touchDrive.gas;
    const brake = keys['ArrowDown'] || touchDrive.brake;
    let steer = (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0);
    if (steer === 0) steer = touchDrive.steer * TOUCH_STEER_GAIN;
    player.steer = Math.max(-1, Math.min(1, steer));

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
    player.angle += MAX_TURN_RATE * tf * steer * dt;

    player.x += Math.cos(player.angle) * player.speed * dt;
    player.y += Math.sin(player.angle) * player.speed * dt;

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

    // Traffic first, so the streets generate() is about to create are populated
    // around where the player is now rather than where they were last frame.
    // The player goes along too: drivers follow it, brake for it, and swerve
    // around it exactly as they do for each other.
    updateTraffic(player.x, player.y, dt, player);
    generate(player.x, player.y);
}

// --- Game loop ---
let lastTime = performance.now(), elapsed = 0, instructionAlpha = 1;
function loop(t) {
    const dt = Math.min((t - lastTime) / 1000, 0.05);
    lastTime = t; elapsed += dt;
    if (elapsed > 4) instructionAlpha = Math.max(0, instructionAlpha - dt);
    update(dt);
    draw();
    requestAnimationFrame(loop);
}
initMap();
requestAnimationFrame(loop);
