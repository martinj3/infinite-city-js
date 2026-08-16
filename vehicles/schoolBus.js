// --- School bus ---
// A city bus with an engine hood in front of the body, which is exactly what
// makeCarLike()'s hoodFrac and hoodDrop already are: the top of the lower body
// falls away ahead of the windscreen, leaving the bonnet a real school bus has.
// See vehicleUtils.js for what every field means.
//
// The short end of the length range is a small-district minibus, the long end a
// full 84-seater.

// School bus yellow is a legally specified colour, so this one hardly varies --
// only enough that a line of them parked outside a school is not one flat slab.
const SCHOOL_BUS_COLORS = [
    [1, 45, 92, 53],
];

const SCHOOL_BUS_SPEC = {
    palette: SCHOOL_BUS_COLORS,
    width: [7.8, 8.4],
    length: [20, 35],
    height: [9.4, 10.4],
    clearance: [1.2, 1.6],       // sits higher than a transit bus
    beltFrac: [0.40, 0.47],      // window line, and the top of the bonnet

    hoodFrac: [0.13, 0.20],
    rearFrac: [0.015, 0.035],
    hoodDrop: [0.45, 0.95],      // the bonnet drops below the window line
    rearDrop: [0, 0.10],

    windscreenRake: [0.05, 0.16],
    backlightRake: [0.02, 0.10],
    minRoofFrac: 0.60,

    cabinInset: [0.0, 0.10],
    wheelRadius: [1.5, 1.75],
    tireWidth: [0.85, 1.05],
    frontOverhang: [0.18, 0.23],  // the front axle sits under the bonnet
    rearOverhang: [0.14, 0.20],
    wheelInset: [0.05, 0.15],

    bayFt: [2.6, 3.2],            // school bus windows are narrower than a transit bus's
};

function generateSchoolBus() {
    return makeCarLike('schoolBus', SCHOOL_BUS_SPEC);
}

registerVehicle('schoolBus', { generate: generateSchoolBus, weight: 0.4 });
