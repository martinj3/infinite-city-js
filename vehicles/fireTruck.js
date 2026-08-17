// --- Fire engine ---
// A cab-over pumper on makeTruck()'s chassis (vehicleUtils.js, where every spec
// field is documented): the flat-nosed cab US engines all are now, and behind it
// the equipment body -- a slab of compartments with silver roll-up doors down each
// flank, a pump panel right behind the cab, a hose bed sunk into the rear deck,
// and the ground ladder racked on top. The light bar rides the cab roof, which the
// size axis keeps above the body, so it can use the roof pass legitimately; the
// ladder cannot (the cab stands taller), so it sorts per-poly in the body batch.
//
// One `t` on the size axis runs it from a 25ft engine to a 35ft rescue-pumper,
// which is also what decides whether the rear axle is a tandem pair.

// Three quarters shades of red, the rest the safety lime-yellow and orange some
// districts run.
const FIRE_TRUCK_COLORS = [
    [45, 357, 78, 40],   // fire engine red
    [30, 353, 84, 33],   // darker crimson
    [15, 62,  80, 55],   // safety lime-yellow
    [10, 27,  88, 50],   // orange
];

const FIRE_DOOR_COLOR = 'hsl(210, 6%, 74%)';     // roll-up compartment doors
const FIRE_PANEL_COLOR = 'hsl(220, 6%, 38%)';    // the pump panel's gauges and valves
const FIRE_STRIPE_COLOR = 'hsl(0, 0%, 92%)';
const FIRE_HOSE_COLOR = 'hsl(42, 16%, 40%)';     // folded hose in the bed
const FIRE_LADDER_COLOR = 'hsl(210, 8%, 76%)';
const FIRE_LIGHT_RED = 'hsl(357, 80%, 45%)';
const FIRE_LIGHT_WHITE = 'hsl(0, 0%, 90%)';

const FIRE_TRUCK_RANGES = {
    length: [25, 35],
    width: [7.9, 8.5],
    cabRoof: [8.8, 9.6],
    belt: [4.6, 5.2],
    bodyTop: [8.0, 8.9],
    wheelRadius: [1.55, 1.8],
};

const FIRE_TRUCK_FIXED = {
    clearance: [1.35, 1.65],
    chassisZ: [2.9, 3.3],
    cabLen: [7.0, 8.6],
    wsRake: [0.5, 1.0],
    cabInset: [0.06, 0.18],
    tireWidth: [0.85, 1.0],
    frontAxle: [3.2, 4.2],
    rearAxle: [5.5, 7.5],
    tandemGap: [3.8, 4.4],
    wheelInset: [0.05, 0.15],
    bumper: [0.8, 1.3],       // engines lead with a massive one
};

function generateFireTruck() {
    const spec = Object.assign({}, FIRE_TRUCK_FIXED, specOnSizeAxis(FIRE_TRUCK_RANGES, 0.12));
    spec.cabOver = true;
    spec.tandem = spec.length[0] > 30.5;
    spec.color = pickColorFrom(FIRE_TRUCK_COLORS);
    const v = makeTruck('fireTruck', spec);
    const f = v.frame;

    // The equipment body: full width, skirts low over the wheels, its top a little
    // below the cab roof.
    const bodyTop = vehRand(spec.bodyTop);
    const skirtZ = vehRand([1.8, 2.2]);
    const bodyFrontX = f.cabBackX - 0.5;
    const bodyRearX = -f.hl + 0.4;
    v.body.push(...makeRectangularPrism(bodyRearX, -f.hw, skirtZ,
        bodyFrontX - bodyRearX, f.hw * 2, bodyTop - skirtZ, v.color));

    // The hose bed: folded hose sunk into the rear half of the deck. One quad just
    // above the deck, the same trick as the pickup bed liner.
    const bedLen = (bodyFrontX - bodyRearX) * 0.45;
    v.body.push({ pts: [
        { x: bodyRearX + 0.5,          y: -(f.hw - 0.55), z: bodyTop + 0.05 },
        { x: bodyRearX + 0.5 + bedLen, y: -(f.hw - 0.55), z: bodyTop + 0.05 },
        { x: bodyRearX + 0.5 + bedLen, y:  (f.hw - 0.55), z: bodyTop + 0.05 },
        { x: bodyRearX + 0.5,          y:  (f.hw - 0.55), z: bodyTop + 0.05 },
    ], color: FIRE_HOSE_COLOR });

    // The tailboard: the rear step firefighters used to ride.
    v.body.push(...makeRectangularPrism(-f.hl - 0.35, -f.hw * 0.9, f.clearance - 0.1,
        0.7, f.hw * 1.8, 0.8, TRUCK_BUMPER_COLOR));

    // The ground ladder, racked on the body top: two silver rails and a few rungs.
    // Body batch, not roof: the cab stands taller, so from the front the ladder
    // must lose to it in the depth sort rather than be painted over it.
    const railX0 = bodyRearX + 0.8, railX1 = bodyFrontX - 0.6;
    for (const side of [-1, 1]) {
        v.body.push(...makeRectangularPrism(railX0, side * 1.05 - 0.07, bodyTop + 0.12,
            railX1 - railX0, 0.14, 0.16, FIRE_LADDER_COLOR));
    }
    const rungs = Math.round((railX1 - railX0) / 2.6);
    for (let i = 1; i <= rungs; i++) {
        const x = railX0 + (railX1 - railX0) * i / (rungs + 1);
        v.body.push({ pts: [
            { x, y: -1.05, z: bodyTop + 0.30 },
            { x: x + 0.2, y: -1.05, z: bodyTop + 0.30 },
            { x: x + 0.2, y: 1.05, z: bodyTop + 0.30 },
            { x, y: 1.05, z: bodyTop + 0.30 },
        ], color: FIRE_LADDER_COLOR });
    }

    // Flank detail. The pump panel sits right behind the cab; three roll-up doors
    // share the rest of the body; a white band runs above the doors and another
    // along the cab doors.
    v.trim.push(...makeFlankQuads(bodyFrontX - 2.4, bodyFrontX - 0.2,
        skirtZ + 0.3, bodyTop - 0.4, f.hw, FIRE_PANEL_COLOR));
    const doorX0 = bodyRearX + 0.6, doorX1 = bodyFrontX - 2.8;
    const doorW = (doorX1 - doorX0 - 2 * 0.35) / 3;
    for (let i = 0; i < 3; i++) {
        const x = doorX0 + i * (doorW + 0.35);
        v.trim.push(...makeFlankQuads(x, x + doorW,
            skirtZ + 0.35, bodyTop - 1.0, f.hw, FIRE_DOOR_COLOR));
    }
    v.trim.push(...makeFlankQuads(doorX0, doorX1,
        bodyTop - 0.7, bodyTop - 0.35, f.hw, FIRE_STRIPE_COLOR));
    v.trim.push(...makeFlankQuads(f.cabBackX + 0.3, f.hl - 0.5,
        f.beltZ - 1.9, f.beltZ - 1.2, f.cabHw, FIRE_STRIPE_COLOR));

    // The light bar across the cab roof, red and white halves like the police
    // car's red and blue ones.
    const barX = f.cabBackX + (f.hl - f.cabBackX) * 0.6;
    const barHw = f.cabHw * 0.65;
    v.roof.push(
        ...makeRectangularPrism(barX - 0.55, -barHw, f.cabRoofZ, 1.1, barHw, 0.32, FIRE_LIGHT_RED),
        ...makeRectangularPrism(barX - 0.55, 0, f.cabRoofZ, 1.1, barHw, 0.32, FIRE_LIGHT_WHITE));

    return v;
}

registerVehicle('fireTruck', { generate: generateFireTruck, weight: 0.3 });
