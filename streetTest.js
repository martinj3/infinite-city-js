// --- Street generation test harness ---
// Loads the same constants/streets/drawing code as the driving game, but with no car:
// it grows a whole city up front, then lets you fly the camera over it.
//
// URL parameters (all optional):
//   ?streets=500   how many streets to generate up front (default 500)
//   ?seed=123      deterministic city -- the same seed always builds the same map
//   ?zoom=2        initial pixels per foot (default: fit the whole city on screen)
//   ?angle=-45     initial view rotation, in degrees
//   ?tilt=0.5      initial vertical squash (0.25 - 0.75)
//   ?x=0&y=0       initial camera position, in feet (default: center of the city)
//
// Keys: arrows pan, +/- zoom, Q/E rotate, R/F tilt, 0 refit the whole city,
//       G regenerate (new seed), space grow +100 streets, S save a PNG screenshot,
//       H toggle the HUD.

const canvas = document.getElementById('game');
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

const MAX_STREETS = Math.max(1, numParam('streets', 500));
const GROW_STEP = 100;      // streets added per press of space
const CAM_SPEED = 400;      // feet per second at default zoom

let camX = numParam('x', 0), camY = numParam('y', 0);
VIEW_ANGLE = numParam('angle', VIEW_ANGLE * 180 / Math.PI) * Math.PI / 180;
Y_SCALE = Math.max(Y_SCALE_MIN, Math.min(Y_SCALE_MAX, numParam('tilt', Y_SCALE)));
// Without an explicit zoom the view is fitted to the whole city once it is built
const zoomGiven = params.has('zoom');
if (zoomGiven) PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, numParam('zoom', 1)));

// --- Seeded RNG ---
// The street code calls Math.random() everywhere, so a seeded city just means
// swapping Math.random for a deterministic generator before building.
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
let stats = { visited: 0, ms: 0 };

function build() {
    Math.random = seed === null ? sysRandom : mulberry32(seed);
    resetMap();
    const t0 = performance.now();
    initMap();
    stats.visited = growCity(MAX_STREETS);
    stats.ms = performance.now() - t0;
}

function grow(extra) {
    const t0 = performance.now();
    stats.visited += growCity(streets.length + extra);
    stats.ms = performance.now() - t0;
}

function regenerate() {
    seed = (sysRandom() * 0x7FFFFFFF) | 0; // a fresh but still reportable seed
    build();
}

// Center on the whole city and pick the zoom that just fits it on screen, taking
// the current rotation and tilt into account.
function fitToCity() {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const s of streets) {
        const b = s.bounds;
        if (b.mnx < mnx) mnx = b.mnx;
        if (b.mxx > mxx) mxx = b.mxx;
        if (b.mny < mny) mny = b.mny;
        if (b.mxy > mxy) mxy = b.mxy;
    }
    if (!Number.isFinite(mnx)) return;
    camX = (mnx + mxx) / 2; camY = (mny + mxy) / 2;

    // Project the corners at 1 px/ft to see how much screen the city needs
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

function countUnresolved() {
    let n = 0;
    for (const [, node] of nodes) if (nodeUnresolved(node)) n++;
    return n;
}

// --- Input ---
const keys = {};
addEventListener('keydown', e => {
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
    if (!keys[e.key]) {
        if (e.key === 'g' || e.key === 'G') regenerate();
        if (e.key === ' ') grow(GROW_STEP);
        if (e.key === 's' || e.key === 'S') saveScreenshot();
        if (e.key === 'h' || e.key === 'H') showHud = !showHud;
        if (e.key === '0') fitToCity();
    }
    keys[e.key] = true;
});
addEventListener('keyup', e => { keys[e.key] = false; });
addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_WHEEL : 1 / ZOOM_WHEEL;
    PX_PER_FT = Math.max(PX_PER_FT_MIN, Math.min(PX_PER_FT_MAX, PX_PER_FT * factor));
}, { passive: false });

function saveScreenshot() {
    canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `streets-seed${seed === null ? 'random' : seed}-${streets.length}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

// --- Update ---
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

    // View rotation (Q/E keys)
    if (keys['q'] || keys['Q']) VIEW_ANGLE -= ROTATE_SPEED * dt;
    if (keys['e'] || keys['E']) VIEW_ANGLE += ROTATE_SPEED * dt;

    // View tilt (R/F keys)
    if (keys['r'] || keys['R']) Y_SCALE = Math.min(Y_SCALE_MAX, Y_SCALE + TILT_SPEED * dt);
    if (keys['f'] || keys['F']) Y_SCALE = Math.max(Y_SCALE_MIN, Y_SCALE - TILT_SPEED * dt);
}

// --- HUD ---
let showHud = true;

function drawHud() {
    if (!showHud) return;
    let lots = 0;
    for (const s of streets) lots += s.lots ? s.lots.length : 0;
    const lines = [
        `streets ${streets.length}   intersections ${nodes.size}`,
        `houses ${lots}${PX_PER_FT < HOUSES_MIN_ZOOM ? ' (hidden: zoom in)' : ''}`,
        `visited ${stats.visited}   unresolved ${countUnresolved()}`,
        `seed ${seed === null ? '(random)' : seed}   built in ${stats.ms.toFixed(0)}ms`,
        `zoom ${PX_PER_FT.toFixed(2)} px/ft   rot ${(normA(VIEW_ANGLE) * 180 / Math.PI).toFixed(0)}deg   tilt ${Y_SCALE.toFixed(2)}`,
        `cam ${camX.toFixed(0)}, ${camY.toFixed(0)} ft`,
        '',
        'arrows pan   +/- zoom   Q/E rotate   R/F tilt   0 fit',
        'G regen   space +100 streets   S screenshot   H hide'
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, 340, 18 * lines.length + 14);
    ctx.fillStyle = '#fff';
    ctx.font = '13px monospace';
    lines.forEach((l, i) => ctx.fillText(l, 18, 30 + i * 18));
}

// --- Loop ---
let lastTime = 0;
function loop(time) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    update(dt);
    drawScene(camX, camY);
    drawHud();
    requestAnimationFrame(loop);
}

build();
if (!zoomGiven) fitToCity();
if (params.has('x') || params.has('y')) { camX = numParam('x', 0); camY = numParam('y', 0); }
requestAnimationFrame(loop);
