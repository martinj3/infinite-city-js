// --- SUV ---
// The most common thing on an American road, a little ahead of the sedan, so it
// registers the heaviest weight in the fleet. Like the van it is one size axis
// rather than three independent draws -- compact crossover (Sorento) at one end,
// full-size (Suburban) at the other -- see specOnSizeAxis() in vehicleUtils.js.
//
// What makes it an SUV and not a van, given both are a tall box on wheels, comes
// down to four things, and they are all in the numbers below:
//
//   a real bonnet     20-25% of the length in front of the windscreen, against a
//                     van's 13-20%, and it barely drops -- an SUV's nose is a
//                     blunt slab, a minivan's slopes away
//   it rides high     the sill sits 1.30-1.70ft up on bigger wheels, where a van
//                     is 1.05-1.45ft on car-sized ones. That gap is most of what
//                     you actually see from above
//   shallower glass   the beltline is 54-58% of the way up, so a bit over 40% of
//                     the body is window; a van is nearer half. High door, low
//                     roof reads as truck
//   the top end is lower  6.5ft at most, where a full-size van reaches 7ft. Only
//                     the top end: a compact crossover and a minivan really are
//                     the same height for their length, so the small ends overlap
//
// Everything else is the shared chassis; makeCarLike() in vehicleUtils.js documents
// every field. Glass is left at the default single pane per flank, which merges the
// rear side windows into one strip -- the same reason the passenger van does.

// Read big-end-first where the field runs the other way to size.
const SUV_RANGES = {
    length: [15.5, 19.0],        // compact crossover to Suburban
    width: [6.2, 6.9],
    height: [5.6, 6.5],          // lower than a van of the same length
    clearance: [1.30, 1.70],     // the ride height, and the main tell
    beltFrac: [0.54, 0.58],
    hoodFrac: [0.25, 0.20],      // long for the class, but a smaller share of a big body
    hoodDrop: [0.30, 0.12],      // blunter as it gets bigger
    windscreenRake: [0.50, 0.35],
    wheelRadius: [1.20, 1.50],
    tireWidth: [0.75, 0.95],
};

const SUV_FIXED = {
    rearFrac: [0.03, 0.08],      // the tailgate is very nearly the end of the body
    rearDrop: [0, 0.10],
    backlightRake: [0.10, 0.30],
    minRoofFrac: 0.30,
    cabinInset: [0.25, 0.45],    // more shoulder than a van, less than a car
    frontOverhang: [0.14, 0.19],
    rearOverhang: [0.13, 0.18],
    wheelInset: [0.08, 0.20],
};

function generateSUV() {
    return makeCarLike('suv', Object.assign({}, SUV_FIXED, specOnSizeAxis(SUV_RANGES)));
}

registerVehicle('suv', { generate: generateSUV, weight: 3.4 });
