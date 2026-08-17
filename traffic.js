// --- Traffic: the other cars on the road (all units in feet) ---
//
// A car in traffic is not a thing standing at a place, the way a building is. It is
// a position *on a street*: which street, how far along it, and which of the two
// ways it is pointing. World coordinates are derived from that every frame and are
// never stored as the truth, which is what keeps a car on the road through a curve
// without any steering, and what makes an intersection a single assignment.
//
//   { vehicle, street, dir, pos, lane, cx, cy, angle }
//
// dir is +1 for a car travelling from the street's (x1,y1) end toward (x2,y2) and
// -1 for the other way; pos is measured from whichever end that car started at, so
// it always runs 0 -> length and the arithmetic never has to branch on direction.
//
// cx, cy is the car's position in the world, and it is named the way a lot names
// its centre on purpose: traffic is sorted and drawn in the same depth pass as the
// buildings (see drawLots), so a car on the far side of a block goes behind that
// block's houses instead of being painted over them.

const TRAFFIC_MAX_PER_STREET = 12;
const TRAFFIC_SPEED = 25 * 5280 / 3600;   // a flat 25mph, in ft/s: no acceleration anywhere
// How far from the player traffic exists at all. Well over a screen's width at any
// useful zoom, so a car you saw and want to chase is still being simulated after it
// leaves the view -- turn around and it is where it should be, not where it was.
const TRAFFIC_RADIUS = 1500;
const TRAFFIC_SPAWN_GAP = 8;   // ft of clear road between bumpers when a block is populated

const traffic = [];

// Where traffic lives: the player, or on a page with no car (streetTest), the
// camera. Spawning needs it before the first update runs, hence the setter.
let trafficFocusX = 0, trafficFocusY = 0;
function setTrafficFocus(x, y) { trafficFocusX = x; trafficFocusY = y; }

function resetTraffic() { traffic.length = 0; }

// --- Riding a street ---------------------------------------------------------

// A street's length along its centreline: the chord, or the real arc. Cached on
// the street, which never changes shape once built.
function streetLength(s) {
    if (s.len === undefined) {
        s.len = s.curve
            ? s.curve.r * normA(s.curve.ccw ? s.curve.arcS - s.curve.arcE : s.curve.arcE - s.curve.arcS)
            : Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    }
    return s.len;
}

// Right-hand traffic: the lane centre sits a quarter of the roadway's width to the
// right of the centreline, which on an 18-24ft street puts a 6ft car about a foot
// clear of both the yellow line and the kerb, and a 8.5ft bus just inside them.
const laneOffset = s => s.props.width / 4;

// Put the car in the world. The centreline point comes from the street -- a lerp
// along the chord, or the point at that angle round the arc -- and the lane offset
// is then applied square to the direction of travel. On an arc that offset is
// radial, so a curve needs no special case: the car simply rides a circle of a
// slightly different radius.
function updateCarPose(c) {
    const s = c.street;
    // Distance from the street's own (x1,y1) end, whichever way this car is going
    const u = c.dir > 0 ? c.pos : streetLength(s) - c.pos;
    let x, y, h;
    if (s.curve) {
        const { cx, cy, r, arcS, ccw } = s.curve;
        const way = ccw ? -1 : 1;              // which way the arc angle runs from x1 to x2
        const th = arcS + way * (u / r);
        x = cx + r * Math.cos(th);
        y = cy + r * Math.sin(th);
        h = th + way * Math.PI / 2;
    } else {
        h = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        x = s.x1 + Math.cos(h) * u;
        y = s.y1 + Math.sin(h) * u;
    }
    if (c.dir < 0) h += Math.PI;
    // "Right of travel" is the local +y axis of a frame rotated by h -- the same
    // side of the street a sidewalk calls its right (see drawStraightSW).
    c.cx = x - c.lane * Math.sin(h);
    c.cy = y + c.lane * Math.cos(h);
    c.angle = h;
}

// Which street a car takes out of an intersection: any of them except the one it
// arrived on, which is all "no U-turns" means. A dead end is the one place there is
// no other choice, and turning round there is better than driving into the grass.
// Picked without building an array -- this runs for every car that reaches a node.
function pickExit(node, from) {
    let seen = 0, pick = null;
    for (const slot of SLOTS) {
        const s = node.streets[slot];
        if (!s || s === from) continue;
        if (Math.random() * ++seen < 1) pick = s;   // reservoir sample of one
    }
    return pick || from;
}

// Which way round a street runs, seen from the node the car is standing at.
const dirFromNode = (s, node) =>
    (Math.abs(s.x1 - node.x) < 1 && Math.abs(s.y1 - node.y) < 1) ? 1 : -1;

// Move a car along, crossing into the next street when it runs out of this one.
// Nothing slows down: not for the turn, not for the car in front, not for the
// intersection, which the car is simply through the far side of on the same frame.
// Returns false if the car has nowhere to go and should be forgotten.
function advanceCar(c, dt) {
    c.pos += TRAFFIC_SPEED * dt;
    let len = streetLength(c.street);
    while (c.pos > len) {
        // The node this street ends at, in this car's direction of travel
        const node = getNode(c.dir > 0 ? c.street.x2 : c.street.x1,
                             c.dir > 0 ? c.street.y2 : c.street.y1);
        if (!node) return false;
        const next = pickExit(node, c.street);
        c.pos -= len;
        c.street = next;
        c.dir = dirFromNode(next, node);
        c.lane = laneOffset(next);
        len = streetLength(next);
    }
    return true;
}

// --- Populating a new block --------------------------------------------------

// Drop one lane's worth of cars along a block at random without any two of them
// touching. Sorting the offsets and then pushing each car past the ones before it
// by their own lengths plus a gap is exact: the tightest arrangement the shuffle
// can produce is bumper-to-bumper-plus-one-gap, and every arrangement that keeps
// the gap is still reachable. Cars that don't fit on the block are simply not born.
function placeLane(s, vehicles, dir, len) {
    const lane = laneOffset(s);
    let needed = 0, n = 0;
    const lengths = [];
    for (const v of vehicles) {
        const l = vehicleLength(v);
        if (needed + l + TRAFFIC_SPAWN_GAP > len) break;   // the block is full
        needed += l + TRAFFIC_SPAWN_GAP;
        lengths.push(l);
        n++;
    }
    if (n === 0) return;

    const offs = [];
    for (let i = 0; i < n; i++) offs.push(Math.random() * (len - needed));
    offs.sort((a, b) => a - b);

    let run = 0;
    for (let i = 0; i < n; i++) {
        const c = {
            vehicle: vehicles[i], street: s, dir, lane,
            pos: offs[i] + run + lengths[i] / 2,
            cx: 0, cy: 0, angle: 0,
        };
        updateCarPose(c);
        traffic.push(c);
        run += lengths[i] + TRAFFIC_SPAWN_GAP;
    }
}

// Every new block gets its traffic once, as it is built -- the same moment its lots
// are laid out (see pushStreet). The mix of body styles is the fleet's, so the odds
// of meeting a Countach out here are the odds of having been given one to drive.
function spawnStreetTraffic(s) {
    if (typeof generateRandomVehicle !== 'function') return;   // page with no vehicles loaded

    // A car built further than TRAFFIC_RADIUS from the focus would be deleted on
    // the very next update, so building one is pure waste. Driving rejects nothing
    // here -- a street is born within a few feet of the car that triggered it --
    // but growCity() builds a whole city at once, from wherever in it it likes.
    const b = s.bounds;
    if (b.mxx + TRAFFIC_RADIUS < trafficFocusX || b.mnx - TRAFFIC_RADIUS > trafficFocusX ||
        b.mxy + TRAFFIC_RADIUS < trafficFocusY || b.mny - TRAFFIC_RADIUS > trafficFocusY) return;

    const n = Math.floor(Math.random() * (TRAFFIC_MAX_PER_STREET + 1));
    if (n === 0) return;

    // Split by direction first so each lane can be packed on its own: two cars
    // going opposite ways are in different lanes and cannot be in each other's way.
    const up = [], down = [];
    for (let i = 0; i < n; i++) (Math.random() < 0.5 ? up : down).push(generateRandomVehicle());
    const len = streetLength(s);
    placeLane(s, up, 1, len);
    placeLane(s, down, -1, len);
}

// --- Simulation and drawing --------------------------------------------------

// Everything within TRAFFIC_RADIUS moves, on screen or not; everything past it is
// deleted outright. Iterating backwards means a car can be dropped by swapping the
// last one into its place, with no shuffling and no second pass.
function updateTraffic(px, py, dt) {
    setTrafficFocus(px, py);
    const r2 = TRAFFIC_RADIUS * TRAFFIC_RADIUS;
    for (let i = traffic.length - 1; i >= 0; i--) {
        const c = traffic[i];
        const alive = advanceCar(c, dt);
        if (alive) updateCarPose(c);
        const dx = c.cx - px, dy = c.cy - py;
        if (alive && dx * dx + dy * dy <= r2) continue;
        traffic[i] = traffic[traffic.length - 1];
        traffic.pop();
    }
}

// Hand the cars in view to the buildings' depth pass, which sorts and draws them
// together (see drawLots). The player's car does not go in: it is drawn last and
// on top of everything, because losing sight of your own car behind a house you
// are driving past is worse than the occlusion being right.
function collectTraffic(out, vl, vr, vt, vb) {
    // A car is about as many pixels as a house is, so it drops out with them --
    // below this only the skyline is left, and there are no cars in a skyline.
    if (PX_PER_FT < HOUSES_MIN_ZOOM) return;
    for (const c of traffic) {
        if (c.cx < vl || c.cx > vr || c.cy < vt || c.cy > vb) continue;
        out.push(c);
    }
}

// Nothing in traffic steers: a car crosses an intersection already pointing the
// new way, so its front wheels are always straight.
// Shared by traffic and the player -- both are just { vehicle, cx, cy, angle } to
// this point. Traffic never sets steer (it never turns its wheels visibly), so it
// falls back to 0; the player's does.
function drawGroundVehicle(c, camX, camY) {
    drawVehicle(c.vehicle, c.cx, c.cy, c.angle, c.steer || 0, camX, camY);
}
