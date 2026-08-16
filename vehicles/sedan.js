// --- Sedan generation (all units in feet) ---
// The parts shared with every other kind of vehicle -- the palette, wheels, the
// level-of-detail rules -- live in vehicleUtils.js; this file is only what makes a
// sedan a sedan.
//
// A sedan is two extruded side profiles: a full-width lower body whose top edge
// slopes down over the hood and the boot, and a narrower cabin sitting on it whose
// front and rear edges are raked like a windscreen and a backlight. Four box wheels
// hang off the corners. That is about forty polygons all told, most of them culled
// from any one angle, so a street full of these stays cheap.

const SEDAN_WIDTH = [5, 7];         // overall, kerb to kerb
const SEDAN_LENGTH = [13, 17];      // overall, bumper to bumper
const SEDAN_ROOF = [4.2, 4.9];      // overall height
// The underside of the body -- the sill, not the axle. It sits at roughly half
// wheel height, which is what leaves the bottom half of each tyre showing below the
// door on a real car, and is what makes the front wheels visibly turn here.
const SEDAN_CLEARANCE = [0.95, 1.30];

// The beltline -- the top of the lower body, where the glass starts -- as a
// fraction of overall height. Above it is cabin, below it is door.
const SEDAN_BELT_FRAC = [0.58, 0.68];

// How much of the length each end takes, measured from the bumper to where the
// cabin starts. What is left between them is the cabin.
const SEDAN_HOOD_FRAC = [0.30, 0.38];
const SEDAN_BOOT_FRAC = [0.24, 0.30];

// How far the top edge of the lower body drops at each end: 0 is a flat, boxy
// hood or boot lid, the top of the range is a pronounced wedge.
const SEDAN_HOOD_DROP = [0, 0.45];
const SEDAN_BOOT_DROP = [0, 0.35];

// How far the windscreen and backlight lean in, as multiples of the cabin's own
// height -- that ratio is the rake angle, so it stays sane on a tall car and a low
// one alike. 0.5 is about 27 degrees off vertical, 0.9 about 42.
const SEDAN_WINDSCREEN_RAKE = [0.50, 0.85];
const SEDAN_BACKLIGHT_RAKE = [0.45, 0.90];
const SEDAN_MIN_ROOF = 0.10;        // fraction of length that must stay flat roof

const SEDAN_CABIN_INSET = [0.35, 0.6];   // how far the cabin sits inboard of the flanks
const SEDAN_WHEEL_RADIUS = [1.0, 1.25];  // ~25in tyres
const SEDAN_TIRE_WIDTH = [0.6, 0.8];
const SEDAN_FRONT_OVERHANG = [0.14, 0.19];  // bumper to front axle, fraction of length
const SEDAN_REAR_OVERHANG = [0.13, 0.18];
const SEDAN_WHEEL_INSET = [0.1, 0.25];      // how far the tyres tuck inside the flanks

function generateSedan() {
    const color = pickVehicleColor();
    const width = vehRand(SEDAN_WIDTH);
    const length = vehRand(SEDAN_LENGTH);
    const roofZ = vehRand(SEDAN_ROOF);
    const groundZ = vehRand(SEDAN_CLEARANCE);
    const beltZ = roofZ * vehRand(SEDAN_BELT_FRAC);

    const hl = length / 2, hw = width / 2;
    const cabinFront = hl - length * vehRand(SEDAN_HOOD_FRAC);
    const cabinRear = -hl + length * vehRand(SEDAN_BOOT_FRAC);
    const hoodDrop = vehRand(SEDAN_HOOD_DROP);
    const bootDrop = vehRand(SEDAN_BOOT_DROP);

    // The lower body, seen from the side and swept across the full width. Read
    // counter-clockwise: along the floor to the nose, up the front bumper, back
    // over the hood and boot lid, then down the tail.
    const body = makeExtrudedProfile([
        { x: -hl,        z: groundZ },
        { x:  hl,        z: groundZ },
        { x:  hl,        z: beltZ - hoodDrop },
        { x:  cabinFront, z: beltZ },
        { x:  cabinRear,  z: beltZ },
        { x: -hl,        z: beltZ - bootDrop },
    ], -hw, hw, color);

    // The cabin. Its rake is clamped so the two slopes can never cross and leave
    // the roof inside out -- on a short car with a steep windscreen they otherwise
    // would.
    const cabinLen = cabinFront - cabinRear;
    const cabinH = roofZ - beltZ;
    const maxRake = Math.max(0, cabinLen - length * SEDAN_MIN_ROOF);
    let wsRake = cabinH * vehRand(SEDAN_WINDSCREEN_RAKE);
    let blRake = cabinH * vehRand(SEDAN_BACKLIGHT_RAKE);
    const rakeTotal = wsRake + blRake;
    if (rakeTotal > maxRake) {
        const shrink = maxRake / rakeTotal;
        wsRake *= shrink;
        blRake *= shrink;
    }
    const roofFront = cabinFront - wsRake;
    const roofRear = cabinRear + blRake;

    const cabinHw = Math.max(0.5, hw - vehRand(SEDAN_CABIN_INSET));
    const cabinProfile = [
        { x: cabinRear,  z: beltZ },
        { x: cabinFront, z: beltZ },
        { x: roofFront,  z: roofZ },
        { x: roofRear,   z: roofZ },
    ];
    body.push(...makeExtrudedProfile(cabinProfile, -cabinHw, cabinHw, color));

    // Glass, drawn only when zoomed in far enough to see it (VEHICLE_GLASS_MIN_ZOOM).
    // Each pane is the cabin face it covers, shrunk to leave a pillar of body colour
    // around it and pushed a hair outward so it lands in front of that face.
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
    const [wsNx, wsNz] = faceNormal(cabinFront, beltZ, roofFront, roofZ);
    pane([
        { x: cabinFront, y: -cabinHw, z: beltZ },
        { x: cabinFront, y:  cabinHw, z: beltZ },
        { x: roofFront,  y:  cabinHw, z: roofZ },
        { x: roofFront,  y: -cabinHw, z: roofZ },
    ], wsNx, 0, wsNz);

    const [blNx, blNz] = faceNormal(roofRear, roofZ, cabinRear, beltZ);
    pane([
        { x: cabinRear, y:  cabinHw, z: beltZ },
        { x: cabinRear, y: -cabinHw, z: beltZ },
        { x: roofRear,  y: -cabinHw, z: roofZ },
        { x: roofRear,  y:  cabinHw, z: roofZ },
    ], blNx, 0, blNz);

    // Side windows, one down each flank of the cabin
    for (const side of [-1, 1]) {
        pane([
            { x: cabinRear,  y: cabinHw * side, z: beltZ },
            { x: cabinFront, y: cabinHw * side, z: beltZ },
            { x: roofFront,  y: cabinHw * side, z: roofZ },
            { x: roofRear,   y: cabinHw * side, z: roofZ },
        ], 0, side, 0);
    }

    // Wheels. The fronts steer; the rears never do.
    const radius = vehRand(SEDAN_WHEEL_RADIUS);
    const tireW = vehRand(SEDAN_TIRE_WIDTH);
    const axleY = Math.max(0.4, hw - vehRand(SEDAN_WHEEL_INSET) - tireW / 2);
    const frontX = hl - length * vehRand(SEDAN_FRONT_OVERHANG);
    const rearX = -hl + length * vehRand(SEDAN_REAR_OVERHANG);
    const wheelPolys = makeWheel(radius, tireW);
    const wheels = [];
    for (const [x, steers] of [[frontX, true], [rearX, false]]) {
        for (const side of [-1, 1]) {
            wheels.push({ x, y: axleY * side, steers, polys: wheelPolys });
        }
    }

    return {
        type: 'sedan',
        width, length, height: roofZ, color,
        body, glass, wheels,
        flat: makeVehicleFootprint(width, length, color),
    };
}

registerVehicle('sedan', { generate: generateSedan });
