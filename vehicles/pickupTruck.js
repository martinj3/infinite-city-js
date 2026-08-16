// --- Pickup truck ---
// The same chassis as a sedan (makeCarLike() in vehicleUtils.js, where every field
// below is documented) with the proportions pushed the other way: a much longer
// rear deck, a cab short enough to be one row of seats, taller glass and bigger
// wheels riding higher off the road.
//
// `bed` is the one thing here a sedan does not have: it lays an open floor into
// that rear deck, so it reads as a bed rather than an enormous boot.

const PICKUP_SPEC = {
    width: [5.8, 7],
    length: [15, 19],
    height: [5.1, 5.9],
    clearance: [1.35, 1.75],     // sits noticeably higher than a car
    beltFrac: [0.55, 0.62],      // also the height of the bed rails

    // The bed takes about twice the share of the length a sedan's boot does, which
    // leaves 22-35% for the cab -- a single row of seats.
    hoodFrac: [0.27, 0.32],
    rearFrac: [0.38, 0.46],
    hoodDrop: [0, 0.30],
    rearDrop: [0, 0.12],         // the rails stay near enough level

    // A near-upright rear window, the way the back of a cab actually is.
    windscreenRake: [0.45, 0.75],
    backlightRake: [0.15, 0.35],
    minRoofFrac: 0.14,

    cabinInset: [0.25, 0.5],
    wheelRadius: [1.2, 1.45],    // ~30in tyres
    tireWidth: [0.75, 0.95],
    frontOverhang: [0.14, 0.19],
    rearOverhang: [0.10, 0.15],
    wheelInset: [0.08, 0.20],

    bed: true,
    bedRail: [0.35, 0.55],
};

function generatePickupTruck() {
    return makeCarLike('pickupTruck', PICKUP_SPEC);
}

registerVehicle('pickupTruck', { generate: generatePickupTruck, weight: 2 });
