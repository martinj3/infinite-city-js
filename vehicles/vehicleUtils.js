// --- Shared vehicle parts (all units in feet) ---
// The pieces every kind of vehicle is made of: the type registry, the palette, the
// level-of-detail rules, wheels, and the draw entry point. Nothing here knows what
// a sedan is. Generic geometry (prisms, drawable trees) lives one level up in
// drawUtils.js.
//
// Vehicles are generated in vehicle-local coordinates: +x is forward (the nose),
// +y is the car's right, z is up, and the origin sits on the ground at the centre
// of the footprint. A model never knows where in the world it is -- drawVehicle()
// rotates it by its heading and places it, which is what lets one model be reused
// for the player and (later) for every car in traffic.

// --- Type registry -----------------------------------------------------------
// Every vehicle type implements one method:
//
//     generate() -> vehicle, in vehicle-local coordinates
//
// mirroring the building registry in buildings/buildingUtils.js, and for the same
// reason: these are plain global scripts, so a bare generate() per file would
// collide. A new body style is added by writing its file and loading it.
const VEHICLE_TYPES = {};

function registerVehicle(name, impl) {
    VEHICLE_TYPES[name] = impl;
}

function generateVehicle(name) {
    const type = VEHICLE_TYPES[name];
    if (!type) throw new Error(`no vehicle type registered as "${name}" -- is its script loaded?`);
    return type.generate();
}

// --- Level of detail ---------------------------------------------------------
// A car is only about 15ft long, an order of magnitude smaller than a house, so
// its parts hit sub-pixel sizes at zoom levels where buildings are still fine.
// Thresholds are in pixels per foot, the same units as PX_PER_FT.
const VEHICLE_SOLID_MIN_ZOOM = 0.9;    // under this the whole car is one flat rectangle
const VEHICLE_WHEELS_MIN_ZOOM = 1.6;   // a wheel is ~2ft across: under this it is 3px
const VEHICLE_GLASS_MIN_ZOOM = 4;      // windows are the first detail worth dropping

// How far the front wheels turn at full lock, in radians (~29 degrees).
const WHEEL_MAX_STEER = 0.5;

// --- Palette -----------------------------------------------------------------
// Weighted roughly like the real car fleet, which is overwhelmingly white, black,
// grey and silver; colour is the exception, not the rule. Each entry: [weight, h, s, l]
const VEHICLE_COLORS = [
    [26, 0,   0,  92],   // white
    [20, 0,   0,  14],   // black
    [16, 210, 4,  45],   // grey
    [13, 210, 6,  72],   // silver
    [7,  215, 45, 40],   // blue
    [6,  355, 55, 40],   // red
    [3,  0,   0,  30],   // dark grey
    [2,  25,  30, 32],   // brown
    [2,  150, 30, 30],   // dark green
    [1,  45,  70, 50],   // gold / tan
    [1,  20,  85, 50],   // orange
];

const VEHICLE_COLOR_TOTAL = VEHICLE_COLORS.reduce((s, c) => s + c[0], 0);

function pickVehicleColor() {
    let r = Math.random() * VEHICLE_COLOR_TOTAL;
    for (const [weight, h, s, l] of VEHICLE_COLORS) {
        r -= weight;
        if (r <= 0) {
            // A small jitter so two white cars are not pixel-identical
            return hsl(h + (Math.random() - 0.5) * 8,
                       s + (Math.random() - 0.5) * 6,
                       l + (Math.random() - 0.5) * 8);
        }
    }
    const last = VEHICLE_COLORS[VEHICLE_COLORS.length - 1];
    return hsl(last[1], last[2], last[3]);
}

const TIRE_COLOR = 'hsl(0, 0%, 13%)';
const GLASS_COLOR = 'hsl(205, 22%, 38%)';

const vehRand = ([lo, hi]) => lo + Math.random() * (hi - lo);

// --- Geometry ----------------------------------------------------------------

// Extrude a side-view profile across the car's width. The profile is a closed
// polygon in the x-z plane (side view), listed counter-clockwise with x to the
// right and z up; it is swept from y0 to y1. This is how a body gets a sloping
// hood or a raked windscreen without any special cases: those are just edges of
// the profile.
//
// Winding follows makeRectangularPrism, so the renderer's backface culling and
// lighting treat these faces exactly like a building's.
function makeExtrudedProfile(profile, y0, y1, color) {
    const n = profile.length;
    const faces = [];

    // Cap at y0 faces -y, so it takes the profile in the order given; the cap at
    // y1 faces +y and takes it reversed.
    faces.push({ pts: profile.map(p => ({ x: p.x, y: y0, z: p.z })), color });
    faces.push({ pts: profile.slice().reverse().map(p => ({ x: p.x, y: y1, z: p.z })), color });

    // One quad per profile edge, wound so its normal points away from the body
    for (let i = 0; i < n; i++) {
        const a = profile[i], b = profile[(i + 1) % n];
        faces.push({ pts: [
            { x: b.x, y: y0, z: b.z },
            { x: a.x, y: y0, z: a.z },
            { x: a.x, y: y1, z: a.z },
            { x: b.x, y: y1, z: b.z },
        ], color });
    }
    return faces;
}

// A wheel: a simple box, which reads as a square from the side and a diamond once
// the view is rotated. Built centred on its own axis in x and y so that steering
// can rotate it about that axis, and sitting on the ground in z.
function makeWheel(radius, tireWidth, color = TIRE_COLOR) {
    return makeRectangularPrism(-radius, -tireWidth / 2, 0, radius * 2, tireWidth, radius * 2, color);
}

// The whole vehicle as one flat rectangle of its overall size and colour, for zoom
// levels where the real model would be a smudge a few pixels across. Every vehicle
// type gets this for free.
function makeVehicleFootprint(width, length, color) {
    const hl = length / 2, hw = width / 2, z = 0.05;   // just off the road surface
    return [{ pts: [
        { x: -hl, y: -hw, z },
        { x:  hl, y: -hw, z },
        { x:  hl, y:  hw, z },
        { x: -hl, y:  hw, z },
    ], color }];
}

// Inset a quad toward its own centre, for a detail poly (a window) that has to sit
// within the face it decorates rather than exactly on its edges.
function insetQuad(pts, frac) {
    const c = pts.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4, z: a.z + p.z / 4 }),
                         { x: 0, y: 0, z: 0 });
    return pts.map(p => ({
        x: c.x + (p.x - c.x) * (1 - frac),
        y: c.y + (p.y - c.y) * (1 - frac),
        z: c.z + (p.z - c.z) * (1 - frac),
    }));
}

// --- Drawing -----------------------------------------------------------------
// A vehicle moves and steers every frame, so unlike a building its polys cannot be
// baked into world coordinates once and left alone. They are rotated fresh each
// frame into this scratch pool, which is reused so that a car -- and later a street
// full of traffic -- does not allocate a new set of points sixty times a second.
const _vehScratch = [];
let _vehCount = 0;

function _emit(src, cos, sin, dx, dy) {
    let d = _vehScratch[_vehCount];
    if (!d) d = _vehScratch[_vehCount] = { pts: [], color: '' };
    _vehCount++;
    d.color = src.color;
    const sp = src.pts, dp = d.pts;
    dp.length = sp.length;
    for (let i = 0; i < sp.length; i++) {
        const p = sp[i];
        let q = dp[i];
        if (!q) q = dp[i] = { x: 0, y: 0, z: 0 };
        q.x = dx + p.x * cos - p.y * sin;
        q.y = dy + p.x * sin + p.y * cos;
        q.z = p.z;
    }
}

// Draw a vehicle at a world position, facing `heading`, with its front wheels
// turned by `steer` (-1 full left .. +1 full right, the same signal that steers the
// car itself). Which parts get drawn is decided by PX_PER_FT alone, so a caller
// never has to think about zoom.
//
// The parts go down in three passes -- wheels, body, glass -- for the same reason
// buildings hang their windows off a child drawable: depth sorting compares whole
// polygons, so it cannot resolve a small poly that lies inside a big one. The
// wheels are tucked within the body's footprint, so painting them first lets the
// body cover everything but the tread showing below the sill, which is exactly
// what should be visible; glass goes on last so it lands on the panel it belongs to.
function drawVehicle(v, wx, wy, heading, steer, camX, camY) {
    const cos = Math.cos(heading), sin = Math.sin(heading);

    const flush = () => {
        if (_vehCount) projectAndDraw(_vehScratch.slice(0, _vehCount), wx, wy, camX, camY);
        _vehCount = 0;
    };
    _vehCount = 0;

    if (PX_PER_FT < VEHICLE_SOLID_MIN_ZOOM) {
        for (const p of v.flat) _emit(p, cos, sin, 0, 0);
        return flush();
    }

    if (PX_PER_FT >= VEHICLE_WHEELS_MIN_ZOOM) {
        const lock = Math.max(-1, Math.min(1, steer || 0)) * WHEEL_MAX_STEER;
        for (const wheel of v.wheels) {
            // A steered wheel turns about its own axis, so its points rotate by
            // heading + lock while its hub is placed by heading alone.
            const a = wheel.steers ? heading + lock : heading;
            const wc = Math.cos(a), ws = Math.sin(a);
            const hubX = wheel.x * cos - wheel.y * sin;
            const hubY = wheel.x * sin + wheel.y * cos;
            for (const p of wheel.polys) _emit(p, wc, ws, hubX, hubY);
        }
        flush();
    }

    for (const p of v.body) _emit(p, cos, sin, 0, 0);
    flush();

    if (PX_PER_FT >= VEHICLE_GLASS_MIN_ZOOM) {
        for (const p of v.glass) _emit(p, cos, sin, 0, 0);
        flush();
    }
}
