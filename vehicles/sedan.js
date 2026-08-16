// --- Sedan ---
// The shape itself -- lower body, cabin, glass, wheels -- is makeCarLike() in
// vehicleUtils.js, shared with every other car-like type. All a sedan is, is this
// table of proportions; every field is documented there.
//
// The numbers below are roughly a real mid-size saloon's. The two that matter most
// to whether it reads as a sedan rather than a truck are rearFrac and minRoofFrac:
// the boot has to be clearly shorter than the bonnet, and the flat part of the roof
// has to be long enough to sit two rows of seats under.

const SEDAN_SPEC = {
    width: [5, 7],
    length: [13, 17],
    height: [4.2, 4.9],
    clearance: [0.95, 1.30],
    beltFrac: [0.55, 0.63],

    // Bonnet a little longer than the boot, leaving 44-56% of the car for the
    // cabin -- on a 16-footer that is a bit over 7ft of passenger compartment,
    // which is what two rows of seats actually need.
    hoodFrac: [0.26, 0.32],
    rearFrac: [0.18, 0.24],
    hoodDrop: [0, 0.45],
    rearDrop: [0, 0.28],

    windscreenRake: [0.55, 0.95],
    backlightRake: [0.50, 0.90],
    // Above rearFrac, so the flat roof is always longer than the boot -- which is
    // the difference between a saloon and something with a load bed.
    minRoofFrac: 0.26,

    cabinInset: [0.35, 0.6],
    wheelRadius: [1.0, 1.25],   // ~25in tyres
    tireWidth: [0.6, 0.8],
    frontOverhang: [0.14, 0.19],
    rearOverhang: [0.13, 0.18],
    wheelInset: [0.1, 0.25],
};

function generateSedan() {
    return makeCarLike('sedan', SEDAN_SPEC);
}

registerVehicle('sedan', { generate: generateSedan, weight: 3 });
