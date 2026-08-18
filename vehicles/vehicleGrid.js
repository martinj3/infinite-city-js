// --- Vehicle grid test harness (vehicles.html) ---
// One block of cars per registered vehicle type, so every body style is on screen
// at once and the random variation within a style is easy to judge against it.
// Cars all face the same way (+x, nose to the right before the view is rotated) so
// their proportions line up for comparison; steering angle sweeps from full left on
// the first column to full right on the last, which puts the front wheels through
// their whole range without touching the bodywork.
//
// This is the vehicle answer to buildings/houses.html, and takes the same keys.
//
// URL parameters (all optional):
//   ?seed=123      deterministic grid -- the same seed always builds the same cars
//   ?n=6           cars per side of each block (default 6, so 6x6)
//   ?type=sedan    only this body style, instead of a block for each
//   ?zoom=1        initial pixels per foot (default: fit everything on screen)
//   ?angle=-45     initial view rotation, in degrees
//   ?tilt=0.5      initial vertical squash (0.25 - 0.75)
//
// Keys: arrows/WASD pan, +/- zoom, Q/E rotate, R/F tilt, 0 refit,
//       G regenerate (new seed), P save a PNG screenshot, H toggle the HUD.

const canvas = document.getElementById('veh-canvas');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener('resize', resize);

// --- Parameters ---
const params = new URLSearchParams(location.search);
const numParam = (k, dflt) => {
    const v = parseFloat(params.get(k));
    return Number.isFinite(v) ? v : dflt;
};

const GRID_N = Math.max(1, Math.min(12, Math.round(numParam('n', 6))));
const CELL_X = 42;          // ft between one vehicle and the next along its own length
const CELL_Y = 15;          // ft between one row and the next -- both sized for a 35ft bus
const BLOCK_GAP = 40;       // ft of empty ground between one body style and the next
const CAM_SPEED = 400;      // feet per second at default zoom

const types = params.has('type')
    ? [params.get('type')].filter(t => VEHICLE_TYPES[t])
    : Object.keys(VEHICLE_TYPES);

VIEW_ANGLE = numParam('angle', VIEW_ANGLE * 180 / Math.PI) * Math.PI / 180;
Y_SCALE = Math.max(Y_SCALE_MIN, Math.min(Y_SCALE_MAX, numParam('tilt', Y_SCALE)));
const zoomGiven = params.has('zoom');
if (zoomGiven) PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, numParam('zoom', 1)));

const PAD_COLOR = 'hsl(0, 0%, 40%)';       // asphalt, so a white car still reads
const PAD_MARGIN = 6;                       // ft of pad around the outermost cars

// --- Seeded RNG (same trick as streetTest.js and lotGrid.js) ---
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
const blockH = (GRID_N - 1) * CELL_Y;
const blockW = (GRID_N - 1) * CELL_X;

// The pad under a block is a cell bigger than the block itself in each direction --
// half a cell of margin on every side -- so the pitch from one block to the next has
// to clear the pad, not just the outermost vehicle.
const PAD_W = blockW + CELL_X + PAD_MARGIN * 2;
const PAD_H = blockH + CELL_Y + PAD_MARGIN * 2;
const PITCH_X = PAD_W + BLOCK_GAP;
const PITCH_Y = PAD_H + BLOCK_GAP;

// A row of blocks is much wider than it is deep, so with more than a couple of body
// styles a single column or a single row wastes most of the screen. Pick whichever
// arrangement comes out closest to square in world space.
const BLOCK_COLS = (() => {
    let best = 1, bestScore = Infinity;
    for (let cols = 1; cols <= types.length; cols++) {
        const rows = Math.ceil(types.length / cols);
        const score = Math.abs(Math.log((cols * PITCH_X) / (rows * PITCH_Y)));
        if (score < bestScore) { bestScore = score; best = cols; }
    }
    return best;
})();

let cars = [];
let blocks = [];
let stats = { ms: 0 };

// A flat rectangle on the ground, wound so it faces up (see makeRectangularPrism)
function groundRect(x, y, w, d, color) {
    return { pts: [{x, y, z: 0}, {x: x + w, y, z: 0}, {x: x + w, y: y + d, z: 0}, {x, y: y + d, z: 0}], color };
}

function build() {
    Math.random = seed === null ? sysRandom : mulberry32(seed);
    const t0 = performance.now();
    cars = [];
    blocks = [];
    types.forEach((type, b) => {
        const baseX = (b % BLOCK_COLS) * PITCH_X;
        const baseY = Math.floor(b / BLOCK_COLS) * PITCH_Y;
        for (let row = 0; row < GRID_N; row++) {
            for (let col = 0; col < GRID_N; col++) {
                cars.push({
                    v: generateVehicle(type),
                    x: baseX + col * CELL_X,
                    y: baseY + row * CELL_Y,
                    // Full lock left on the first column through full lock right on
                    // the last, so every column shows a different steering angle.
                    steer: GRID_N === 1 ? 0 : (col / (GRID_N - 1)) * 2 - 1,
                });
            }
        }
        blocks.push({ type, baseX, baseY });
    });
    stats.ms = performance.now() - t0;
    Math.random = sysRandom;
}

function regenerate() {
    seed = (sysRandom() * 0x7FFFFFFF) | 0;   // a fresh but still reportable seed
    build();
}

// --- Camera ---
let camX = 0, camY = 0;

function gridBounds() {
    const lastX = Math.max(0, ...blocks.map(b => b.baseX));
    const lastY = Math.max(0, ...blocks.map(b => b.baseY));
    return {
        mnx: -CELL_X / 2 - PAD_MARGIN, mxx: lastX + blockW + CELL_X / 2 + PAD_MARGIN,
        mny: -CELL_Y / 2 - PAD_MARGIN, mxy: lastY + blockH + CELL_Y / 2 + PAD_MARGIN,
    };
}

function fitToGrid() {
    const { mnx, mxx, mny, mxy } = gridBounds();
    camX = (mnx + mxx) / 2; camY = (mny + mxy) / 2;

    const cos = getCosV(), sin = getSinV();
    let sx = 0, sy = 0;
    for (const [x, y] of [[mnx, mny], [mxx, mny], [mnx, mxy], [mxx, mxy]]) {
        const dx = x - camX, dy = y - camY;
        sx = Math.max(sx, Math.abs(dx * cos - dy * sin));
        sy = Math.max(sy, Math.abs((dx * sin + dy * cos) * Y_SCALE));
    }
    const fit = 0.95 * Math.min(canvas.width / 2 / sx, canvas.height / 2 / sy);
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, fit));
}

// --- Input ---
const keys = {};
addEventListener('keydown', e => {
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
    if (!keys[e.key]) {
        if (e.key === 'g' || e.key === 'G') regenerate();
        if (e.key === 'p' || e.key === 'P') saveScreenshot();
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

// Drag to scroll (mouse or one finger), pinch to zoom; "reset view" refits, as 0 does.
initPanZoom({
    onPan: (dx, dy) => { camX += dx; camY += dy; },
    onReset: fitToGrid,
});

function saveScreenshot() {
    canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vehicles-seed${seed === null ? 'random' : seed}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

function update(dt) {
    // Arrow keys (or WASD) move in world space, accounting for the isometric
    // rotation so that pressing "up" moves the camera visually upward on screen
    const cos = getCosV(), sin = getSinV();
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w'] || keys['W'])    { dx -= sin; dy -= cos; }
    if (keys['ArrowDown'] || keys['s'] || keys['S'])  { dx += sin; dy += cos; }
    if (keys['ArrowLeft'] || keys['a'] || keys['A'])  { dx -= cos; dy += sin; }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) { dx += cos; dy -= sin; }
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const speed = CAM_SPEED * pxPerFtDefault() / PX_PER_FT;
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

    // One pad per block, all flat on the ground, so they can go down in one batch
    // before anything standing on them.
    projectAndDraw(blocks.map(b => groundRect(
        b.baseX - CELL_X / 2 - PAD_MARGIN, b.baseY - CELL_Y / 2 - PAD_MARGIN,
        PAD_W, PAD_H, PAD_COLOR)), 0, 0, camX, camY);

    // Far to near by projected screen Y: each car is drawn as a unit, so anything
    // in front of another has to go down after it.
    const sorted = cars.slice().sort((a, b) =>
        project(a.x, a.y, 0, camX, camY)[1] - project(b.x, b.y, 0, camX, camY)[1]);
    for (const car of sorted) drawVehicle(car.v, car.x, car.y, 0, car.steer, camX, camY);

    // Block labels, in screen space -- they are page furniture, not part of a model
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    for (const b of blocks) {
        const [sx, sy] = project(b.baseX + blockW / 2, b.baseY - CELL_Y / 2 - PAD_MARGIN, 0, camX, camY);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(b.type, sx, sy - 6);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.type, sx, sy - 6);
    }
    ctx.textAlign = 'left';
}

let showHud = true;
const syncHudToggle = initHudToggle(() => showHud, v => { showHud = v; });
const HUD_TOP = 60;   // clears the toggle button pinned over this same corner

function drawHud() {
    if (!showHud) return;
    const size = v => `${v.length.toFixed(1)}x${v.width.toFixed(1)}x${v.height.toFixed(1)}ft`;
    const lines = [
        `${blocks.length} body style${blocks.length === 1 ? '' : 's'}, ${GRID_N}x${GRID_N} of each = ${cars.length} vehicles`,
        ...blocks.map(b => {
            const of = cars.filter(c => c.v.type === b.type);
            const l = of.map(c => c.v.length);
            return `${b.type.padEnd(12)} ${Math.min(...l).toFixed(1)}-${Math.max(...l).toFixed(1)}ft long   e.g. ${size(of[0].v)}`;
        }),
        'steering sweeps full left to full right, left column to right',
        `seed ${seed === null ? '(random)' : seed}   built in ${stats.ms.toFixed(1)}ms`,
        `zoom ${PX_PER_FT.toFixed(2)} px/ft   rot ${(normA(VIEW_ANGLE) * 180 / Math.PI).toFixed(0)}deg   tilt ${Y_SCALE.toFixed(2)}`,
        '',
        'arrows/WASD pan   +/- zoom   Q/E rotate   R/F tilt   0 fit',
        'G regen   P screenshot   H hide'
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, HUD_TOP, 460, 18 * lines.length + 14);
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
if (!zoomGiven) fitToGrid();
else { const b = gridBounds(); camX = (b.mnx + b.mxx) / 2; camY = (b.mny + b.mxy) / 2; }
requestAnimationFrame(loop);
