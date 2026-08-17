// --- Player vehicle performance (feet, seconds; ft/s^2 for acceleration) -----
//
// Every vehicle type shares one acceleration curve shape -- strong from a stop,
// tapering off as speed climbs, the way a real engine's usable force falls once
// it is past peak torque and making roughly constant power instead (force ~
// power / speed). That is what makes 0-20mph always come quicker than an equal
// stretch higher up. A type does not get its own curve: it gets one scalar that
// stretches this shared curve until its simulated 0-60 time lands on the number
// road tests report for that class of vehicle, so tuning a type is picking a
// single number -- its 0-60 time -- not shaping a curve by hand.
//
// This only ever drives the player's own car (see game.js); traffic still moves
// at a flat TRAFFIC_SPEED (traffic.js) regardless of what it is simulating.

const G_FT_S2 = 32.174;            // one g, in ft/s^2
const PERF_LOW_SPEED = 22;         // ft/s (~15mph): accel is flat below this
const PERF_REFERENCE_ACCEL = 11;   // ft/s^2 below PERF_LOW_SPEED, at scale k=1
// A ceiling no vehicle's curve may cross however short its target 0-60 is --
// without it, scaling the curve for a 3-second hypercar implies a standing-start
// g-force no tire could put down. ~1.09g is a generous but not absurd peak for a
// sports car on sticky tires; slower types never get close to it, since their
// scale never pushes PERF_REFERENCE_ACCEL this high in the first place.
const PERF_MAX_ACCEL = 35;         // ft/s^2

// The shared curve, unscaled and uncapped: flat near a stop (traction-limited),
// then falling as 1/speed above PERF_LOW_SPEED (constant-power).
function baseAccel(speedFtS) {
    const v = Math.abs(speedFtS);
    return v < PERF_LOW_SPEED ? PERF_REFERENCE_ACCEL
                               : PERF_REFERENCE_ACCEL * PERF_LOW_SPEED / v;
}

function curveAccel(speedFtS, k) {
    return Math.min(PERF_MAX_ACCEL, baseAccel(speedFtS) * k);
}

// Time for the scaled, capped curve to reach a given speed, by direct simulation
// -- the cap means the curve has no closed form, and this only ever needs to run
// once per type, at load, to calibrate against it.
function simulateTimeTo(speedFtS, k) {
    let v = 0, t = 0;
    const dt = 0.02;
    while (v < speedFtS) { v += curveAccel(v, k) * dt; t += dt; }
    return t;
}

const MPH_TO_FTS = 5280 / 3600;
const SPEED_60MPH = 60 * MPH_TO_FTS;   // 88 ft/s

// A type's accel scale, found by bisection so its simulated 0-60 time matches a
// target: simulateTimeTo is monotonically non-increasing in k (more scale is
// never slower), so the search always converges. The cap makes this a search
// rather than a division, but the result is still exactly one scalar per type
// stretching one shared curve.
function accelScaleFor(target0to60) {
    let lo = 0.05, hi = 60;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (simulateTimeTo(SPEED_60MPH, mid) > target0to60) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// One entry per registered type (or "type:subtype" where a subtype's performance
// differs -- the C3 and C7 Corvette are the only case). accel0to60 is seconds,
// road-test figures rounded to the nearest class; brakeG is peak braking
// deceleration as a fraction of g. Braking is not power-limited the way
// accelerating is -- a brake can put its full force down at any speed until the
// tires let go -- so it is one flat number rather than a curve, and every type
// here brakes harder than its own peak acceleration, sports cars most of all.
const VEHICLE_PERF = {
    sedan:        { accel0to60: 8,    brakeG: 0.80 },
    suv:          { accel0to60: 8,    brakeG: 0.78 },
    policeCar:    { accel0to60: 6.5,  brakeG: 0.95 },   // Interceptor-tuned
    mustang:      { accel0to60: 8,    brakeG: 0.85 },
    wrangler:     { accel0to60: 9,    brakeG: 0.75 },
    pickupTruck:  { accel0to60: 9,    brakeG: 0.72 },
    van:          { accel0to60: 9,    brakeG: 0.70 },
    deliveryVan:  { accel0to60: 9,    brakeG: 0.68 },
    vwBeetle:     { accel0to60: 18,   brakeG: 0.55 },   // aircooled, drum brakes
    vwMinibus:    { accel0to60: 26,   brakeG: 0.45 },   // same engine, a lot more van
    cityBus:      { accel0to60: 13,   brakeG: 0.55 },
    schoolBus:    { accel0to60: 13,   brakeG: 0.55 },
    fireTruck:    { accel0to60: 13,   brakeG: 0.60 },
    trashTruck:   { accel0to60: 13,   brakeG: 0.55 },
    cementTruck:  { accel0to60: 13,   brakeG: 0.50 },
    boxTruck:     { accel0to60: 13,   brakeG: 0.58 },
    semiTruck:    { accel0to60: 13,   brakeG: 0.50 },
    craneTruck:   { accel0to60: 13,   brakeG: 0.50 },
    countach:     { accel0to60: 4,    brakeG: 1.20 },
    enzo:         { accel0to60: 3,    brakeG: 1.30 },
};
const VEHICLE_PERF_SUBTYPE = {
    'corvette:c3': { accel0to60: 5,   brakeG: 1.15 },
    'corvette:c7': { accel0to60: 3,   brakeG: 1.25 },
};
const DEFAULT_VEHICLE_PERF = { accel0to60: 8, brakeG: 0.80 };   // an ordinary sedan

// The scale and brake figure for one generated vehicle, resolved once (see
// game.js) rather than every frame.
function vehiclePerf(v) {
    const spec = (v.subtype && VEHICLE_PERF_SUBTYPE[`${v.type}:${v.subtype}`])
        || VEHICLE_PERF[v.type] || DEFAULT_VEHICLE_PERF;
    return { accelK: accelScaleFor(spec.accel0to60), brakeDecel: spec.brakeG * G_FT_S2 };
}
