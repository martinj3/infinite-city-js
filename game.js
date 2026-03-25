// --- Canvas setup ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener('resize', resize);

// --- Input ---
const keys = {};
addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) e.preventDefault(); keys[e.key] = true; });
addEventListener('keyup', e => { keys[e.key] = false; });

// --- Player ---
const player = { x: 200, y: 0, angle: 0, speed: 0 };

// --- Init ---
function init() {
    const a = addNode(0, 0, 0);   // orientation = east
    const b = addNode(400, 0, 0);
    a.roads.fwd = true;  a.roads.back = false;
    b.roads.back = true;
    pushStreet(0, 0, 400, 0, null);
}

// --- Update ---
function update(dt) {
    if (keys['ArrowUp']) player.speed += ACCEL * dt;
    if (keys['ArrowDown']) {
        if (player.speed > 0) { player.speed -= BRAKE * dt; if (player.speed < 0) player.speed = 0; }
        else player.speed -= ACCEL * 0.5 * dt;
    }
    if (!keys['ArrowUp'] && !keys['ArrowDown']) {
        if (player.speed > 0) player.speed = Math.max(0, player.speed - DRAG * dt);
        else if (player.speed < 0) player.speed = Math.min(0, player.speed + DRAG * dt);
    }
    player.speed = Math.max(-REVERSE_MAX, Math.min(MAX_SPEED, player.speed));

    const tf = Math.min(Math.abs(player.speed) / 20, 1);
    if (keys['ArrowLeft'])  player.angle -= MAX_TURN_RATE * tf * dt;
    if (keys['ArrowRight']) player.angle += MAX_TURN_RATE * tf * dt;

    player.x += Math.cos(player.angle) * player.speed * dt;
    player.y += Math.sin(player.angle) * player.speed * dt;

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
init();
requestAnimationFrame(loop);
