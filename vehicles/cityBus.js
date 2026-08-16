// --- City / charter bus ---
// Almost a plain rectangular prism: the nose and tail fractions are turned right
// down, so makeCarLike()'s "cabin" stops being a greenhouse on a car and becomes
// the whole windowed body sitting on a shallow skirt. See vehicleUtils.js for what
// every field means.
//
// Real numbers: a US transit bus is 8.5ft wide and a shade over 10ft tall almost
// regardless of length, so those barely vary -- what varies is how long it is.

const CITY_BUS_SPEC = {
    width: [8.0, 8.6],
    length: [25, 35],
    height: [9.9, 10.9],
    clearance: [0.9, 1.2],
    beltFrac: [0.33, 0.40],      // the window line, about 3.7ft up

    // Just enough nose and tail to keep the ends from being dead flat.
    hoodFrac: [0.015, 0.04],
    rearFrac: [0.015, 0.04],
    hoodDrop: [0, 0.20],
    rearDrop: [0, 0.12],

    // The body is 6-7ft tall above the window line, so the rake multiplier that
    // gives a car a raked screen would fold this one in half. These are small.
    windscreenRake: [0.05, 0.20],
    backlightRake: [0.03, 0.14],
    minRoofFrac: 0.70,

    cabinInset: [0.0, 0.08],     // the body is essentially as wide as the skirt
    wheelRadius: [1.6, 1.8],     // ~42in
    tireWidth: [0.9, 1.1],
    frontOverhang: [0.07, 0.11],
    rearOverhang: [0.20, 0.28],  // the back axle sits well forward of the tail
    wheelInset: [0.05, 0.15],

    bayFt: [3.2, 4.1],           // a window roughly every 3.5ft down each flank
};

function generateCityBus() {
    return makeCarLike('cityBus', CITY_BUS_SPEC);
}

registerVehicle('cityBus', { generate: generateCityBus, weight: 0.5 });
