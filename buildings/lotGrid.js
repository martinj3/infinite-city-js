// --- Lot grid test harness (shared by houses.html and churches.html) ---
// Puts one building of a single type on every lot size that type is ever asked
// for: lot width grows along one axis, lot depth along the other, so opposite
// corners of the grid hold the smallest and the largest lot possible. Everything
// in between is what street generation will actually hand the generator.
//
// The page sets GRID_TYPE (a name in LOT_TYPES) before loading this file. The
// size ranges are read from lots.js, so this page follows those without knowing
// any numbers of its own.
//
// URL parameters (all optional):
//   ?seed=123      deterministic grid -- the same seed always builds the same buildings
//   ?step=2        feet between one lot size and the next (default 2)
//   ?setback=10    fixed setback for every lot; default is random per lot, as on a street
//   ?zoom=1        initial pixels per foot (default: fit the whole grid on screen)
//   ?angle=-45     initial view rotation, in degrees
//   ?tilt=0.5      initial vertical squash (0.25 - 0.75)
//
// Keys: arrows pan, +/- zoom, Q/E rotate, R/F tilt, 0 refit the grid,
//       G regenerate (new seed), S save a PNG screenshot, H toggle the HUD.

const canvas = document.getElementById('bldg-canvas');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener('resize', resize);

const spec = LOT_TYPES[GRID_TYPE];

// --- Parameters ---
const params = new URLSearchParams(location.search);
const numParam = (k, dflt) => {
    const v = parseFloat(params.get(k));
    return Number.isFinite(v) ? v : dflt;
};

const SIZE_STEP = Math.max(1, numParam('step', 2));  // ft between adjacent lot sizes
const LOT_GAP = 20;         // ft of empty space between neighbouring lots in the grid
const FRONT_STRIP = 6;      // ft of "sidewalk" drawn in front of each lot, to show which way it faces
const CAM_SPEED = 400;      // feet per second at default zoom

VIEW_ANGLE = numParam('angle', VIEW_ANGLE * 180 / Math.PI) * Math.PI / 180;
Y_SCALE = Math.max(Y_SCALE_MIN, Math.min(Y_SCALE_MAX, numParam('tilt', Y_SCALE)));
const zoomGiven = params.has('zoom');
if (zoomGiven) PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, numParam('zoom', 1)));

const LOT_PAD_COLOR = 'hsl(95, 30%, 40%)';    // the lot itself: mown grass, darker than the field
const FRONT_STRIP_COLOR = 'hsl(0, 0%, 72%)';  // stands in for the sidewalk the lot starts at

// --- Seeded RNG (same trick as streetTest.js) ---
function mulberry32(a) {
    return function () {
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const sysRandom = Math.random;
let seed = params.has('seed') ? (numParam('seed', 0) | 0) : null;

// --- Build ---
// Every size from lo to hi, always including both ends however the step divides.
function sizeSteps([lo, hi], step) {
    const out = [];
    for (let v = lo; v < hi; v += step) out.push(v);
    out.push(hi);
    return out;
}

const widths = sizeSteps(spec.width, SIZE_STEP);
const depths = sizeSteps(spec.depth, SIZE_STEP);
const cellW = spec.width[1] + LOT_GAP;
const cellD = spec.depth[1] + LOT_GAP + FRONT_STRIP;

let lots = [];
let stats = { ms: 0 };

// A flat rectangle on the ground, wound so it faces up (see makeRectangularPrism)
function groundRect(x, y, w, d, color) {
    return { pts: [{x, y, z: 0}, {x: x + w, y, z: 0}, {x: x + w, y: y + d, z: 0}, {x, y: y + d, z: 0}], color };
}

function build() {
    Math.random = seed === null ? sysRandom : mulberry32(seed);
    const t0 = performance.now();
    lots = [];
    depths.forEach((depth, row) => {
        widths.forEach((width, col) => {
            const setback = params.has('setback')
                ? Math.max(0, Math.min(depth, numParam('setback', 0)))
                : spec.setback[0] + Math.random() * (spec.setback[1] - spec.setback[0]);
            const lot = { type: GRID_TYPE, width, depth, setback };
            // The lot pad and its front strip are part of the test page, not of the
            // building, so they go on the root and the building hangs off it.
            lot.drawable = {
                polys: [
                    groundRect(0, 0, width, depth, LOT_PAD_COLOR),
                    groundRect(0, -FRONT_STRIP, width, FRONT_STRIP, FRONT_STRIP_COLOR),
                ],
                children: [generateBuilding(GRID_TYPE, lot)],
            };
            lot.ox = col * cellW;
            lot.oy = row * cellD;
            lots.push(lot);
        });
    });
    stats.ms = performance.now() - t0;
    // The tallest building in the grid, which the fit has to leave room for --
    // height goes straight up the screen and owes nothing to the lot's footprint,
    // and a tower is ten times the height of the house this page was written for.
    stats.top = lots.reduce((m, lot) => Math.max(m, drawableTop(lot.drawable)), 0);
    Math.random = sysRandom;
}

function regenerate() {
    seed = (sysRandom() * 0x7FFFFFFF) | 0;   // a fresh but still reportable seed
    build();
}

// --- Camera ---
let camX = 0, camY = 0;

function fitToGrid() {
    const mnx = 0, mxx = (widths.length - 1) * cellW + spec.width[1];
    const mny = -FRONT_STRIP, mxy = (depths.length - 1) * cellD + spec.depth[1];
    camX = (mnx + mxx) / 2; camY = (mny + mxy) / 2;

    const cos = getCosV(), sin = getSinV();
    let sx = 0, sy = 0;
    for (const [x, y] of [[mnx, mny], [mxx, mny], [mnx, mxy], [mxx, mxy]]) {
        const dx = x - camX, dy = y - camY;
        sx = Math.max(sx, Math.abs(dx * cos - dy * sin));
        sy = Math.max(sy, Math.abs((dx * sin + dy * cos) * Y_SCALE));
    }
    // Buildings only ever stick out of the top, so the vertical span is the
    // ground's both ways plus their height once, and the camera slides down-screen
    // by half of that to put the surplus back in the middle.
    const fit = 0.95 * Math.min(canvas.width / 2 / sx, canvas.height / (2 * sy + stats.top));
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, fit));
    const drop = stats.top / (2 * Y_SCALE);
    camX -= drop * sin; camY -= drop * cos;
}

// --- Input ---
const keys = {};
addEventListener('keydown', e => {
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
    if (!keys[e.key]) {
        if (e.key === 'g' || e.key === 'G') regenerate();
        if (e.key === 's' || e.key === 'S') saveScreenshot();
        if (e.key === 'h' || e.key === 'H') { showHud = !showHud; syncHudToggle(); }
        if (e.key === '0') fitToGrid();
    }
    keys[e.key] = true;
});
addEventListener('keyup', e => { keys[e.key] = false; });
addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_WHEEL : 1 / ZOOM_WHEEL;
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, PX_PER_FT * factor));
}, { passive: false });

// Drag to scroll (mouse or one finger), pinch to zoom. "Reset view" refits the
// whole grid, which is the useful thing here and matches the 0 key.
initPanZoom({
    onPan: (dx, dy) => { camX += dx; camY += dy; },
    onReset: fitToGrid,
});

function saveScreenshot() {
    canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${GRID_TYPE}-lots-seed${seed === null ? 'random' : seed}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

function update(dt) {
    // Arrow keys move in world space, accounting for the isometric rotation
    // so that pressing "up" moves the camera visually upward on screen
    const cos = getCosV(), sin = getSinV();
    let dx = 0, dy = 0;
    if (keys['ArrowUp'])    { dx -= sin; dy -= cos; }
    if (keys['ArrowDown'])  { dx += sin; dy += cos; }
    if (keys['ArrowLeft'])  { dx -= cos; dy += sin; }
    if (keys['ArrowRight']) { dx += cos; dy -= sin; }
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        // Pan at a constant screen speed, so it stays usable at any zoom
        const speed = CAM_SPEED * PX_PER_FT_DEFAULT / PX_PER_FT;
        camX += (dx / len) * speed * dt;
        camY += (dy / len) * speed * dt;
    }

    if (keys['='] || keys['+']) PX_PER_FT = Math.min(PX_PER_FT_MAX, PX_PER_FT * Math.pow(ZOOM_SPEED, dt));
    if (keys['-'] || keys['_']) PX_PER_FT = Math.max(PX_PER_FT_MIN, PX_PER_FT / Math.pow(ZOOM_SPEED, dt));

    if (keys['q'] || keys['Q']) VIEW_ANGLE -= ROTATE_SPEED * dt;
    if (keys['e'] || keys['E']) VIEW_ANGLE += ROTATE_SPEED * dt;

    if (keys['r'] || keys['R']) Y_SCALE = Math.min(Y_SCALE_MAX, Y_SCALE + TILT_SPEED * dt);
    if (keys['f'] || keys['F']) Y_SCALE = Math.max(Y_SCALE_MIN, Y_SCALE - TILT_SPEED * dt);
}

// --- Drawing ---
function render() {
    ctx.fillStyle = '#2d8a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pAndD = (polys, ox, oy) => projectAndDraw(polys, ox, oy, camX, camY, true);
    const pDepth = (poly, ox, oy) => polyDepth(poly, ox, oy, camX, camY);

    // Far-to-near by the projected screen Y of each lot's origin
    const sorted = lots.slice().sort((a, b) =>
        project(a.ox, a.oy, 0, camX, camY)[1] - project(b.ox, b.oy, 0, camX, camY)[1]);
    for (const lot of sorted) drawDrawableTree(lot.drawable, lot.ox, lot.oy, pAndD, pDepth);
}

let showHud = true;
const syncHudToggle = initHudToggle(() => showHud, v => { showHud = v; });
const HUD_TOP = 60;   // clears the toggle button pinned over this same corner

function drawHud() {
    if (!showHud) return;
    const lines = [
        `${GRID_TYPE} lots: ${widths.length} widths x ${depths.length} depths = ${lots.length}`,
        `width  ${spec.width[0]}-${spec.width[1]}ft along the street (left to right)`,
        `depth  ${spec.depth[0]}-${spec.depth[1]}ft back from it (near to far)`,
        `setback ${params.has('setback') ? numParam('setback', 0) + 'ft (fixed)' : spec.setback[0] + '-' + spec.setback[1] + 'ft (random per lot)'}`,
        `seed ${seed === null ? '(random)' : seed}   built in ${stats.ms.toFixed(0)}ms`,
        `zoom ${PX_PER_FT.toFixed(2)} px/ft   rot ${(normA(VIEW_ANGLE) * 180 / Math.PI).toFixed(0)}deg   tilt ${Y_SCALE.toFixed(2)}`,
        '',
        'arrows pan   +/- zoom   Q/E rotate   R/F tilt   0 fit',
        'G regen   S screenshot   H hide'
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, HUD_TOP, 400, 18 * lines.length + 14);
    ctx.fillStyle = '#fff';
    ctx.font = '13px monospace';
    lines.forEach((l, i) => ctx.fillText(l, 18, HUD_TOP + 22 + i * 18));
}

// --- Loop ---
let lastTime = 0;
function loop(time) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    update(dt);
    render();
    drawHud();
    requestAnimationFrame(loop);
}

build();
if (!zoomGiven) fitToGrid(); else { camX = (widths.length - 1) * cellW / 2; camY = (depths.length - 1) * cellD / 2; }
requestAnimationFrame(loop);
