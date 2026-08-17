// --- Garbage truck ---
// A rear loader on makeTruck()'s chassis (vehicleUtils.js, where every spec field
// is documented): a tall collection body that stands over the cab, stepping down
// at the back to the hopper, whose tailgate leans out over the rear sill -- the
// whole silhouette is one extruded side profile. Ribs down the flanks and a
// recessed packer panel on the tailgate are shades of the body colour, which is
// why this type picks its paint as components rather than a finished string.
//
// Mostly cab-over, the way fleets have gone; one in four still has a bonnet.

// Muted fleet colours first, but blue and green are not unusual these days.
const TRASH_TRUCK_COLORS = [
    [24, 0,   0,  86],   // white
    [14, 210, 5,  64],   // silver
    [12, 210, 6,  44],   // grey
    [14, 150, 35, 28],   // dark green
    [12, 215, 45, 38],   // blue
    [8,  0,   0,  28],   // dark grey
    [8,  355, 55, 40],   // red
    [8,  30,  75, 48],   // orange
];

const TRASH_BEACON_COLOR = 'hsl(38, 90%, 55%)';

const TRASH_TRUCK_RANGES = {
    length: [22, 31],
    width: [7.8, 8.4],
    cabRoof: [8.6, 9.4],
    bodyTop: [10.0, 11.0],
    wheelRadius: [1.55, 1.75],
};

const TRASH_TRUCK_FIXED = {
    clearance: [1.3, 1.6],
    chassisZ: [2.8, 3.2],
    hoodLen: [5.0, 6.2],
    hoodDrop: [0.3, 0.7],
    cabInset: [0.05, 0.15],
    tireWidth: [0.85, 1.0],
    rearAxle: [6.0, 8.0],
    tandemGap: [3.7, 4.3],
    wheelInset: [0.05, 0.15],
};

function generateTrashTruck() {
    const spec = Object.assign({}, TRASH_TRUCK_FIXED, specOnSizeAxis(TRASH_TRUCK_RANGES, 0.12));
    spec.cabOver = Math.random() < 0.75;
    spec.cabLen = spec.cabOver ? [6.8, 8.0] : [5.2, 6.2];
    // A cab-over's glass drops nearly to the bumper; a conventional's stops at
    // the cowl, well above its bonnet.
    spec.belt = spec.cabOver ? [4.5, 5.1] : [5.3, 5.9];
    spec.wsRake = spec.cabOver ? [0.35, 0.7] : [0.7, 1.1];
    spec.frontAxle = spec.cabOver ? [3.2, 4.2] : [4.6, 5.6];
    spec.tandem = true;
    const paint = pickColorComponentsFrom(TRASH_TRUCK_COLORS);
    spec.color = hsl(paint.h, paint.s, paint.l);
    const v = makeTruck('trashTruck', spec);
    v.cab = spec.cabOver ? 'cabOver' : 'conventional';
    const f = v.frame;

    // The collection body in side view: up the front wall, back along the top,
    // the chamfer down to the hopper, then the tailgate leaning out and down to
    // the rear sill. Read counter-clockwise from the sill.
    const topZ = vehRand(spec.bodyTop);
    const hopperZ = topZ * vehRand([0.64, 0.72]);
    const bodyFrontX = f.cabBackX - 0.6;
    const rearX = -f.hl + 0.15;
    const chamfX = rearX + (bodyFrontX - rearX) * vehRand([0.30, 0.38]);
    const hopperX = rearX + vehRand([1.6, 2.2]);
    v.body.push(...makeExtrudedProfile([
        { x: rearX,            z: f.chassisZ },
        { x: bodyFrontX,       z: f.chassisZ },
        { x: bodyFrontX,       z: topZ - 0.9 },   // the front top corner is rounded off
        { x: bodyFrontX - 1.3, z: topZ },
        { x: chamfX,           z: topZ },
        { x: hopperX,          z: hopperZ },
    ], -f.hw, f.hw, v.color));
    v.height = topZ;

    // The riding step across the back, under the sill.
    v.body.push(...makeRectangularPrism(-f.hl - 0.3, -f.hw * 0.85, f.clearance,
        0.6, f.hw * 1.7, 0.5, TRUCK_FRAME_COLOR));

    // Flank ribs along the main box, a step darker than the paint, over a sill
    // channel running the box's whole length.
    const ribColor = hsl(paint.h, paint.s, paint.l - 9);
    const ribs = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < ribs; i++) {
        const x = chamfX + (bodyFrontX - 0.8 - chamfX) * (i + 0.5) / ribs;
        v.trim.push(...makeFlankQuads(x - 0.16, x + 0.16,
            f.chassisZ + 1.0, topZ - 0.5, f.hw, ribColor));
    }
    v.trim.push(...makeFlankQuads(rearX + 0.55, bodyFrontX - 0.3,
        f.chassisZ + 0.15, f.chassisZ + 0.8, f.hw, ribColor));

    // The packer panel recessed into the tailgate: an inset quad on the sloped
    // rear face, wound and pushed out the same way that face is.
    const shade = hsl(paint.h, paint.s, paint.l - 6);
    const gDx = rearX - hopperX, gDz = f.chassisZ - hopperZ;
    const gLen = Math.hypot(gDx, gDz);
    const gNx = gDz / gLen, gNz = -gDx / gLen;
    const at = t => ({ x: hopperX + gDx * t, z: hopperZ + gDz * t });
    const g0 = at(0.15), g1 = at(0.8), gHw = f.hw - 0.7;
    v.trim.push({ pts: [
        { x: g1.x, y: -gHw, z: g1.z },
        { x: g0.x, y: -gHw, z: g0.z },
        { x: g0.x, y:  gHw, z: g0.z },
        { x: g1.x, y:  gHw, z: g1.z },
    ].map(p => ({ x: p.x + gNx * 0.05, y: p.y, z: p.z + gNz * 0.05 })), color: shade });

    // An amber beacon on the body's front top edge -- the body is the tallest
    // thing on the truck, so up there the roof pass is legitimately above all.
    v.roof.push(...makeRectangularPrism(bodyFrontX - 1.3, -0.5, topZ, 0.55, 1.0, 0.35,
        TRASH_BEACON_COLOR));

    return v;
}

registerVehicle('trashTruck', { generate: generateTrashTruck, weight: 0.35 });
