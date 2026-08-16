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
// and may declare a `weight`, how common it is meant to be on the road relative to
// the other types. This mirrors the building registry in
// buildings/buildingUtils.js, and for the same reason: these are plain global
// scripts, so a bare generate() per file would collide. A new body style is added
// by writing its file and loading it.
const VEHICLE_TYPES = {};

function registerVehicle(name, impl) {
    VEHICLE_TYPES[name] = Object.assign({ weight: 1 }, impl);
}

function generateVehicle(name) {
    const type = VEHICLE_TYPES[name];
    if (!type) throw new Error(`no vehicle type registered as "${name}" -- is its script loaded?`);
    return type.generate();
}

// Pick a body style at random, in proportion to the registered weights. Traffic
// will want this too, which is why the mix lives here rather than in the game.
function randomVehicleType() {
    const names = Object.keys(VEHICLE_TYPES);
    if (!names.length) throw new Error('no vehicle types registered -- are their scripts loaded?');
    let total = 0;
    for (const n of names) total += VEHICLE_TYPES[n].weight;
    let r = Math.random() * total;
    for (const n of names) {
        r -= VEHICLE_TYPES[n].weight;
        if (r <= 0) return n;
    }
    return names[names.length - 1];
}

function generateRandomVehicle() {
    return generateVehicle(randomVehicleType());
}

// --- Level of detail ---------------------------------------------------------
// A car is only about 15ft long, an order of magnitude smaller than a house, so
// its parts hit sub-pixel sizes at zoom levels where buildings are still fine.
// Thresholds are in pixels per foot, the same units as PX_PER_FT.
const VEHICLE_SOLID_MIN_ZOOM = 0.9;    // under this the whole car is one flat rectangle
const VEHICLE_WHEELS_MIN_ZOOM = 1.6;   // a wheel is ~2ft across: under this it is 3px
const VEHICLE_ROOF_MIN_ZOOM = 2.5;     // things bolted to the roof, like a light bar
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

// Some types do not draw from the general fleet: a school bus is yellow, a police
// car is one of three liveries. Those pass their own table of the same shape.
function pickColorFrom(palette) {
    const total = palette.reduce((s, c) => s + c[0], 0);
    let r = Math.random() * total;
    for (const [weight, h, s, l] of palette) {
        r -= weight;
        if (r <= 0) {
            // A small jitter so two white cars are not pixel-identical
            return hsl(h + (Math.random() - 0.5) * 8,
                       s + (Math.random() - 0.5) * 6,
                       l + (Math.random() - 0.5) * 8);
        }
    }
    const last = palette[palette.length - 1];
    return hsl(last[1], last[2], last[3]);
}

function pickVehicleColor() {
    return pickColorFrom(VEHICLE_COLORS);
}

const TIRE_COLOR = 'hsl(0, 0%, 13%)';
const GLASS_COLOR = 'hsl(205, 22%, 38%)';
const BED_LINER_COLOR = 'hsl(30, 6%, 24%)';   // the open floor of a pickup bed

const vehRand = ([lo, hi]) => lo + Math.random() * (hi - lo);

// Some families are one size axis rather than a set of independent dimensions: a
// van runs from a compact minivan to a full-size eight-seater and an SUV from a
// Sorento to a Suburban, and a 19ft van that is 5.5ft tall is not a vehicle anyone
// has seen. So a type can pick one point `t` on that axis and read every field off
// it -- pass the ranges written small-end-first, or the other way round for a field
// that shrinks as the vehicle grows, and get back spec entries to merge with the
// fixed ones.
//
// The jitter is applied to `t`, not to the value it produces, so a field can wander
// off the axis without ever leaving the range it declares -- no clamping needed.
function specOnSizeAxis(ranges, jitter = 0.18) {
    const t = Math.random();
    const out = {};
    for (const field in ranges) {
        const [lo, hi] = ranges[field];
        const u = Math.min(1, Math.max(0, t + (Math.random() - 0.5) * 2 * jitter));
        const v = lo + (hi - lo) * u;
        out[field] = [v, v];
    }
    return out;
}

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

// --- The car-like chassis ----------------------------------------------------
// Sedans, pickups and (later) wagons and vans are the same animal in different
// proportions: a full-width lower body whose top edge slopes down over the nose
// and the tail, a narrower cabin sitting on it with raked glass front and back,
// and four wheels. So the shape lives here once and a body style is a table of
// proportions -- see sedan.js for the smallest possible example.
//
// Every field is a [lo, hi] range in feet, or a fraction of the overall length or
// height where noted. `bed` turns the rear deck into an open pickup bed.
//
//   width, length        overall, bumper to bumper and kerb to kerb
//   height               overall, ground to roof
//   clearance            the sill: the underside of the body, not the axle. At
//                        roughly half wheel height it leaves the bottom of each
//                        tyre showing below the door, which is what makes the
//                        front wheels visibly turn
//   beltFrac             the beltline (top of the lower body, where the glass
//                        starts) as a fraction of overall height
//   hoodFrac, rearFrac   how much of the length the nose and tail take, measured
//                        from the bumper to where the cabin starts. What is left
//                        between them is the cabin, so these two set how much room
//                        there is for seats
//   hoodDrop, rearDrop   how far the top edge of the lower body falls at each end:
//                        0 is a flat, boxy hood or boot lid, the top of the range
//                        a pronounced wedge
//   windscreenRake,      how far the glass leans in, as multiples of the cabin's
//   backlightRake        own height -- that ratio is the rake angle, so it stays
//                        sane on a tall body and a low one alike. 0.5 is about 27
//                        degrees off vertical, 0.9 about 42
//   minRoofFrac          fraction of the length that must stay flat roof, however
//                        the rakes come out (a number, not a range)
//   cabinInset           how far the cabin sits inboard of the flanks
//   wheelRadius, tireWidth
//   frontOverhang,       bumper to axle, as a fraction of length
//   rearOverhang
//   wheelInset           how far the tyres tuck inside the flanks
//   bed, bedRail         open bed on the rear deck, and how wide its rails are
//   palette              a colour table of its own, instead of the general fleet
//   sideGlass, bayFt     which part of each flank is glazed and how finely it is
//                        divided into windows (see below)
//   frontGlass,          false to leave that end unglazed
//   rearGlass
//
// A bus is this same chassis with the nose and tail fractions turned right down,
// which leaves a box; the "cabin" becomes the whole windowed body above the skirt.
function makeCarLike(type, spec) {
    const color = pickColorFrom(spec.palette || VEHICLE_COLORS);
    const width = vehRand(spec.width);
    const length = vehRand(spec.length);
    const roofZ = vehRand(spec.height);
    const groundZ = vehRand(spec.clearance);
    const beltZ = roofZ * vehRand(spec.beltFrac);

    const hl = length / 2, hw = width / 2;
    const cabinFront = hl - length * vehRand(spec.hoodFrac);
    const cabinRear = -hl + length * vehRand(spec.rearFrac);
    const hoodDrop = vehRand(spec.hoodDrop);
    const rearDrop = vehRand(spec.rearDrop);

    // The lower body, seen from the side and swept across the full width. Read
    // counter-clockwise: along the floor to the nose, up the front bumper, back
    // over the hood and the rear deck, then down the tail.
    const body = makeExtrudedProfile([
        { x: -hl,         z: groundZ },
        { x:  hl,         z: groundZ },
        { x:  hl,         z: beltZ - hoodDrop },
        { x:  cabinFront, z: beltZ },
        { x:  cabinRear,  z: beltZ },
        { x: -hl,         z: beltZ - rearDrop },
    ], -hw, hw, color);

    // The cabin. Its rake is clamped so the two slopes can never cross and leave
    // the roof inside out, and so that a real roof is always left between them --
    // otherwise a short cabin with steep glass comes out as a fastback wedge.
    const cabinLen = cabinFront - cabinRear;
    const cabinH = roofZ - beltZ;
    const maxRake = Math.max(0, cabinLen - length * spec.minRoofFrac);
    let wsRake = cabinH * vehRand(spec.windscreenRake);
    let blRake = cabinH * vehRand(spec.backlightRake);
    const rakeTotal = wsRake + blRake;
    if (rakeTotal > maxRake) {
        const shrink = maxRake / rakeTotal;
        wsRake *= shrink;
        blRake *= shrink;
    }
    const roofFront = cabinFront - wsRake;
    const roofRear = cabinRear + blRake;

    const cabinHw = Math.max(0.5, hw - vehRand(spec.cabinInset));
    body.push(...makeExtrudedProfile([
        { x: cabinRear,  z: beltZ },
        { x: cabinFront, z: beltZ },
        { x: roofFront,  z: roofZ },
        { x: roofRear,   z: roofZ },
    ], -cabinHw, cabinHw, color));

    // A pickup bed: the floor of it, inset from the rails, lying on the rear deck.
    // It is one dark quad rather than a real box because a box would need interior
    // walls, and the far one of those is a backface -- it would be culled, leaving
    // a hole to see through. It goes in the body batch, not a pass of its own, so
    // that depth sorting still hides it behind the cab from the front.
    if (spec.bed) {
        const rail = vehRand(spec.bedRail);
        const deckZ = x => beltZ - rearDrop * (cabinRear - x) / (cabinRear + hl);
        const xBack = -hl + rail, xFront = cabinRear - rail;
        const yw = Math.max(0.3, hw - rail);
        const lift = 0.06;   // clear of the deck it sits on, so it sorts in front
        body.push({ pts: [
            { x: xBack,  y: -yw, z: deckZ(xBack) + lift },
            { x: xFront, y: -yw, z: deckZ(xFront) + lift },
            { x: xFront, y:  yw, z: deckZ(xFront) + lift },
            { x: xBack,  y:  yw, z: deckZ(xBack) + lift },
        ], color: BED_LINER_COLOR });
    }

    // Glass, drawn only when zoomed in far enough to see it (VEHICLE_GLASS_MIN_ZOOM).
    // Each pane is the piece of cabin face it covers, shrunk to leave a pillar of
    // body colour around it and pushed a hair outward so it lands in front of that
    // face -- so the gaps between panes come for free, from the shrinking.
    const eps = 0.03;
    const glass = [];
    const pane = (pts, nx, ny, nz) => glass.push({
        pts: insetQuad(pts, 0.18).map(p => ({ x: p.x + nx * eps, y: p.y + ny * eps, z: p.z + nz * eps })),
        color: GLASS_COLOR,
    });

    // Windscreen and backlight: the sloping end faces of the cabin. The outward
    // normal of a raked edge (dx, dz) is (dz, -dx), normalised.
    const faceNormal = (ax, az, bx, bz) => {
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        return [dz / len, -dx / len];
    };
    if (spec.frontGlass !== false) {
        const [wsNx, wsNz] = faceNormal(cabinFront, beltZ, roofFront, roofZ);
        pane([
            { x: cabinFront, y: -cabinHw, z: beltZ },
            { x: cabinFront, y:  cabinHw, z: beltZ },
            { x: roofFront,  y:  cabinHw, z: roofZ },
            { x: roofFront,  y: -cabinHw, z: roofZ },
        ], wsNx, 0, wsNz);
    }

    // A van's rear is a roll-up door, so it gets no backlight.
    if (spec.rearGlass !== false) {
        const [blNx, blNz] = faceNormal(roofRear, roofZ, cabinRear, beltZ);
        pane([
            { x: cabinRear, y:  cabinHw, z: beltZ },
            { x: cabinRear, y: -cabinHw, z: beltZ },
            { x: roofRear,  y: -cabinHw, z: roofZ },
            { x: roofRear,  y:  cabinHw, z: roofZ },
        ], blNx, 0, blNz);
    }

    // Side glass. `sideGlass` is [from, to] as fractions of the cabin measured back
    // from its front edge, and `bayFt` the rough width of one window: a car leaves
    // both defaulted and gets a single pane down each flank (no B-pillar -- at this
    // size it would be a sub-pixel line), a bus asks for a bay every few feet, and a
    // van glazes only the front fifth, which is all the cab it has.
    //
    // The flank is a trapezoid, since the roof is shorter than the beltline, so a
    // bay is cut along a parameter running from the back of the cabin to the front
    // rather than by x alone.
    const [gFrom, gTo] = spec.sideGlass || [0, 1];
    const bays = spec.bayFt
        ? Math.max(1, Math.round((gTo - gFrom) * cabinLen / vehRand(spec.bayFt)))
        : 1;
    const botX = t => cabinRear + t * cabinLen;
    const topX = t => roofRear + t * (roofFront - roofRear);

    // The flanks are mirror images, so the right-hand one has to be wound the other
    // way round or its outward normal points into the car -- which leaves it facing
    // the same way as the left window: both would be drawn from one side of the car
    // and neither from the other.
    for (const side of [-1, 1]) {
        for (let i = 0; i < bays; i++) {
            const t0 = 1 - (gFrom + ((i + 1) / bays) * (gTo - gFrom));
            const t1 = 1 - (gFrom + (i / bays) * (gTo - gFrom));
            const pts = [
                { x: botX(t0), y: cabinHw * side, z: beltZ },
                { x: botX(t1), y: cabinHw * side, z: beltZ },
                { x: topX(t1), y: cabinHw * side, z: roofZ },
                { x: topX(t0), y: cabinHw * side, z: roofZ },
            ];
            pane(side > 0 ? pts.reverse() : pts, 0, side, 0);
        }
    }

    // Wheels. The fronts steer; the rears never do.
    const radius = vehRand(spec.wheelRadius);
    const tireW = vehRand(spec.tireWidth);
    const axleY = Math.max(0.4, hw - vehRand(spec.wheelInset) - tireW / 2);
    const frontX = hl - length * vehRand(spec.frontOverhang);
    const rearX = -hl + length * vehRand(spec.rearOverhang);
    const wheelPolys = makeWheel(radius, tireW);
    const wheels = [];
    for (const [x, steers] of [[frontX, true], [rearX, false]]) {
        for (const side of [-1, 1]) {
            wheels.push({ x, y: axleY * side, steers, polys: wheelPolys });
        }
    }

    return {
        type,
        width, length, height: roofZ, color,
        body, glass, wheels,
        flat: makeVehicleFootprint(width, length, color),
        // Where the chassis ended up, so a type can bolt something to it without
        // re-deriving the numbers -- see policeCar.js and its light bar.
        frame: { hl, hw, groundZ, beltZ, roofZ, cabinFront, cabinRear, roofFront, roofRear, cabinHw },
    };
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
// The parts go down in separate passes -- wheels, body, roof fittings, glass -- for
// the same reason buildings hang their windows off a child drawable: depth sorting
// compares whole polygons, so it cannot resolve a small poly that lies inside a big
// one. The wheels are tucked within the body's footprint, so painting them first
// lets the body cover everything but the tread showing below the sill, which is
// exactly what should be visible; glass goes on last so it lands on the panel it
// belongs to. Anything in v.roof is above every part of the body by construction,
// so painting it after the body is always right.
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

    if (v.roof && PX_PER_FT >= VEHICLE_ROOF_MIN_ZOOM) {
        for (const p of v.roof) _emit(p, cos, sin, 0, 0);
        flush();
    }

    if (PX_PER_FT >= VEHICLE_GLASS_MIN_ZOOM) {
        for (const p of v.glass) _emit(p, cos, sin, 0, 0);
        flush();
    }
}
