// --- Radar minimap (driving.html only) ---------------------------------------
// A circular radar in the top left of the canvas HUD, under the camera, car and
// settings toolbars: the streets around the player as thin grey lines, traffic as
// coloured dots, the landmarks worth steering by (towers and churches) as small
// squares, and the player's own car as an arrow at dead centre.
//
// Up is north by default, and that is the whole point of it rather than an
// oversight. The main view already rotates -- with Q/E, with the camera-follow
// option, and through the whole startup flourish -- so a minimap that rotated
// too would leave a player with nothing on screen that holds still, and no way
// to tell "I came from over there" from "the camera swung round". Fixing the map
// to north gives the compass back. A player who would rather have the usual
// game-radar behaviour can lock it to the car with the "map locks to car"
// checkbox in the camera panel, or by tapping the map itself.
//
// It draws on the game canvas, like the speedometer and the street sign, rather
// than being a DOM element of its own: it is a HUD instrument, it fades in with
// uiAlpha alongside the rest of the HUD, and the whole thing is a couple of
// hundred draw calls a frame.
//
// The cost is kept down in two places, both of which matter once a city has
// grown to a few thousand streets:
//
//   - streets and landmarks don't move, so the culled lists are cached and only
//     rebuilt once the player has driven MINIMAP_CACHE_MOVE feet from wherever
//     they were last built (or the map itself has grown). Between rebuilds the
//     per-frame work is proportional to what is actually on the radar, not to
//     the size of the city.
//   - the cached streets are grouped by colour at rebuild time, so a frame is
//     one path and one stroke per distinct pavement grey -- a handful -- rather
//     than one per street.
//
// Traffic is the one thing that has to be walked every frame, since it is the
// one thing that moves; `traffic` only ever holds the cars near the player
// (TRAFFIC_RADIUS, traffic.js), so that is dozens of entries, not thousands.

// The lot types big enough to navigate by. Houses and low-rise offices are the
// texture of a block, not landmarks in it, and drawing every one of them would
// bury the streets under a solid mass of squares.
const MINIMAP_LANDMARK_TYPES = { tower: true, church: true };

// A radar looks straight down, so every colour it borrows off a building or a
// car is lit by a straight-up normal -- the same applyLighting the 3D view uses
// for a roof, which keeps the dot on the map recognisably the same colour as the
// car it stands for instead of the flat unlit value no face is ever drawn in.
const MINIMAP_UP = { x: 0, y: 0, z: 1 };

const MINIMAP_FACE = '#0d1410';          // ground inside the dial: darker than any pavement
const MINIMAP_RING = 'rgba(255,255,255,0.10)';
const MINIMAP_NORTH = '#ff5a3c';         // the red north tip every compass has

let minimapLocked = MINIMAP_LOCK_HEADING_DEFAULT;

// Cached cull. `count` is streets.length: the city only ever grows, so a change
// in it is exactly "new streets exist that this cache never saw".
const minimapCache = {
    x: Infinity, y: Infinity, count: -1, range: 0,
    byColor: new Map(),   // pavement colour -> the streets drawn in it
    landmarks: [],
};

function minimapRadius() { return touchDrive.shown ? MINIMAP_RADIUS_TOUCH : MINIMAP_RADIUS_DESKTOP; }
function minimapRange() { return touchDrive.shown ? MINIMAP_RANGE_TOUCH : MINIMAP_RANGE_DESKTOP; }

// The colour a building reads as from above. Taken off the building's own
// drawable rather than declared per type, so a new landmark type needs nothing
// here: the first polygon in tree order is a wall of the main mass for every
// type in buildings/ (a tower's root holds no polys of its own, hence the
// recursion). Cached on the lot -- a building is generated once and never
// changes colour.
function firstPolyColor(d) {
    if (!d) return null;
    if (d.polys && d.polys.length) return d.polys[0].color;
    if (d.children) {
        for (const c of d.children) {
            const col = firstPolyColor(c);
            if (col) return col;
        }
    }
    return null;
}

function landmarkColor(lot) {
    if (lot.mapColor === undefined) {
        lot.mapColor = applyLighting(firstPolyColor(lot.house) || 'hsl(0, 0%, 60%)', MINIMAP_UP);
    }
    return lot.mapColor;
}

// Same idea for a car, cached on the vehicle: a car keeps its vehicle object for
// as long as it exists, so this is one string build per car per lifetime rather
// than one per car per frame.
function vehicleMapColor(v) {
    if (v._mapColor === undefined) v._mapColor = applyLighting(v.color, MINIMAP_UP);
    return v._mapColor;
}

function refreshMinimapCache(px, py, range) {
    // Padded by exactly the distance that will trigger the next rebuild, so a
    // street cannot cross the rim between one rebuild and the next without
    // having been collected first.
    const R = range + MINIMAP_CACHE_MOVE;
    minimapCache.x = px; minimapCache.y = py;
    minimapCache.count = streets.length; minimapCache.range = range;

    const byColor = minimapCache.byColor;
    byColor.clear();
    const marks = minimapCache.landmarks;
    marks.length = 0;

    for (const s of streets) {
        const b = s.bounds;
        if (b.mxx < px - R || b.mnx > px + R || b.mxy < py - R || b.mny > py + R) continue;
        let list = byColor.get(s.props.color);
        if (!list) byColor.set(s.props.color, list = []);
        list.push(s);
        if (!s.lots) continue;
        // Per lot, not per street: a long block reaches well past the rim at one
        // end while its near end is under the player.
        for (const lot of s.lots) {
            if (!MINIMAP_LANDMARK_TYPES[lot.type]) continue;
            if (lot.cx < px - R || lot.cx > px + R || lot.cy < py - R || lot.cy > py + R) continue;
            marks.push(lot);
        }
    }
}

// The arrow at the centre. Drawn pointing up and rotated by the car's heading:
// in north-up mode that is the heading itself, and in locked mode the frame it
// is drawn in has already been counter-rotated by the same amount, so the one
// expression leaves it pointing dead up without a second code path.
function drawMinimapArrow(r, color) {
    const a = r * 0.13;
    ctx.beginPath();
    ctx.moveTo(0, -a);
    ctx.lineTo(a * 0.62, a * 0.72);
    ctx.lineTo(0, a * 0.36);
    ctx.lineTo(-a * 0.62, a * 0.72);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    // A dark outline, because the car's own colour is as likely to be black as
    // white and the face behind it is dark: without it half the cars in the game
    // have an invisible arrow.
    ctx.lineWidth = Math.max(1, r * 0.018);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
}

// The compass marks around the rim: a tick at each cardinal point, the north one
// a filled triangle in the same red the speedometer's needle uses. `rot` is the
// map's own rotation, so in north-up mode these sit still and in locked mode
// they swing round the rim as the car turns -- which is the whole reason the
// lock is survivable at all.
function drawMinimapCompass(r, rot) {
    for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 2 + rot;
        const ca = Math.cos(a), sa = Math.sin(a);
        if (i === 0) {
            // North: a triangle pointing out at the rim, with the letter upright
            // beside it. Upright, not rotated with the map -- a compass rose can
            // afford to turn its letters over, a 9px glyph cannot.
            const tip = r * 0.98, base = r * 0.86, half = r * 0.055;
            ctx.beginPath();
            ctx.moveTo(ca * tip, sa * tip);
            ctx.lineTo(ca * base - sa * half, sa * base + ca * half);
            ctx.lineTo(ca * base + sa * half, sa * base - ca * half);
            ctx.closePath();
            ctx.fillStyle = MINIMAP_NORTH;
            ctx.fill();
            ctx.font = `bold ${Math.max(9, Math.round(r * 0.15))}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText('N', ca * r * 0.71, sa * r * 0.71);
        } else {
            ctx.beginPath();
            ctx.moveTo(ca * r * 0.99, sa * r * 0.99);
            ctx.lineTo(ca * r * 0.86, sa * r * 0.86);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = Math.max(1, r * 0.025);
            ctx.stroke();
        }
    }
}

// Draw the radar. (px, py) is the player's own position -- not the camera's,
// which sits off to one side (see "Car draw offset", game.js): the arrow is the
// car, and it belongs at the centre of its own map. `heading` is player.angle.
function drawMinimap(px, py, heading, carColor) {
    const r = minimapRadius(), range = minimapRange();
    if (Math.abs(px - minimapCache.x) > MINIMAP_CACHE_MOVE ||
        Math.abs(py - minimapCache.y) > MINIMAP_CACHE_MOVE ||
        streets.length !== minimapCache.count || range !== minimapCache.range) {
        refreshMinimapCache(px, py, range);
    }

    const cx = MINIMAP_LEFT + r, cy = MINIMAP_TOP + r;
    const scale = r / range;                 // screen px per world ft
    // Locked: rotate so the car's heading points up. (cos a, sin a) has to land
    // on (0, -1), which is a rotation of -a - PI/2.
    const rot = minimapLocked ? -heading - Math.PI / 2 : 0;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.fillStyle = MINIMAP_FACE;
    ctx.fill();
    ctx.clip();

    // Everything inside this block is drawn in world feet: the transform is the
    // map's own rotation and scale, so a street is its two real endpoints and a
    // curve is its real arc -- no per-item projection, and ctx.arc does the
    // curves for free. Widths meant to be a fixed number of screen pixels are
    // divided by the scale to survive it.
    ctx.save();
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-px, -py);

    ctx.lineWidth = (touchDrive.shown ? MINIMAP_STREET_PX_TOUCH : MINIMAP_STREET_PX_DESKTOP) / scale;
    ctx.lineCap = 'round';
    for (const [color, list] of minimapCache.byColor) {
        ctx.beginPath();
        for (const s of list) {
            if (s.curve) {
                const c = s.curve;
                // moveTo the arc's own start first: without it the path draws a
                // chord from wherever the previous street ended.
                ctx.moveTo(c.cx + c.r * Math.cos(c.arcS), c.cy + c.r * Math.sin(c.arcS));
                ctx.arc(c.cx, c.cy, c.r, c.arcS, c.arcE, c.ccw);
            } else {
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
            }
        }
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    const lh = MINIMAP_LANDMARK_PX / scale / 2;
    for (const lot of minimapCache.landmarks) {
        ctx.fillStyle = landmarkColor(lot);
        ctx.fillRect(lot.cx - lh, lot.cy - lh, lh * 2, lh * 2);
    }

    // The only per-frame walk in here. A square test, not a circular one: the
    // clip already disposes of the corners, and this is the cheaper of the two.
    if (typeof traffic !== 'undefined') {
        const ch = MINIMAP_CAR_PX / scale / 2;
        for (const c of traffic) {
            if (c.cx < px - range || c.cx > px + range || c.cy < py - range || c.cy > py + range) continue;
            ctx.fillStyle = vehicleMapColor(c.vehicle);
            ctx.fillRect(c.cx - ch, c.cy - ch, ch * 2, ch * 2);
        }
    }
    ctx.restore();

    // Range ring at half scale, and the compass, both still inside the clip so
    // neither can spill over the bezel.
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, TWO_PI);
    ctx.strokeStyle = MINIMAP_RING;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawMinimapCompass(r, rot);

    ctx.save();
    ctx.rotate(rot + heading + Math.PI / 2);
    drawMinimapArrow(r, carColor);
    ctx.restore();

    ctx.restore();

    // The bezel goes on outside the clip, so its full width shows rather than
    // the inner half of it.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(12,12,12,0.94)';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// Is a click on the dial? Used to toggle the lock by tapping the map, which is
// the one control here a phone can reach without opening a panel.
function minimapHit(x, y) {
    const r = minimapRadius();
    return Math.hypot(x - (MINIMAP_LEFT + r), y - (MINIMAP_TOP + r)) <= r;
}

function setMinimapLocked(on) {
    minimapLocked = on;
    if (minimapLockBox) minimapLockBox.checked = on;
}

// The checkbox lives in the camera panel next to "follow car" and "shift car
// view" (game.js), which is where every other view option already is. Kept in
// step with the tap-the-map path above, so the two can't disagree.
let minimapLockBox = null;
function buildMinimapToggle() {
    if (!CONTROLS_DOM || !cameraPanelEl) return;
    const row = ctlEl('label', 'ic-row gm-follow-row', cameraPanelEl);
    minimapLockBox = ctlEl('input', '', row);
    minimapLockBox.type = 'checkbox';
    minimapLockBox.checked = minimapLocked;
    ctlEl('span', 'ic-label gm-follow-label', row, 'map locks to car');
    minimapLockBox.addEventListener('change', () => setMinimapLocked(minimapLockBox.checked));
}

if (CONTROLS_DOM) {
    buildMinimapToggle();
    // uiAlpha gates it for the same reason it gates the drawn map: while the
    // intro flourish is running there is nothing there to tap.
    canvas.addEventListener('click', e => {
        if (uiAlpha <= 0) return;
        if (minimapHit(e.clientX, e.clientY)) setMinimapLocked(!minimapLocked);
    });
}
