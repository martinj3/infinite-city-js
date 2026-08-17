// --- Cement mixer ---
// makeTruck()'s chassis (vehicleUtils.js, where every spec field is documented)
// with the drum on the back: a lathed barrel (makeLatheX() in drawUtils.js)
// tilted up toward the rear, its mouth a dark end cap under the charge hopper,
// with the rear pedestal holding that up, a front pedestal under the nose, and
// fenders bridging the tandem wheels. The drum's belly carries a painted band,
// usually the cab's colour, the way ready-mix fleets mark their drums.
//
// The cab is anything a sedan could be; the drum stays white or grey. Unlike the
// other trucks this one is still usually conventional -- a US mixer keeps its
// bonnet -- with a chrome exhaust stack behind the cab when it has one.

const MIXER_DRUM_COLORS = [
    [60, 0,   0, 88],    // white
    [25, 210, 4, 72],    // light grey
    [15, 210, 5, 52],    // mid grey
];

const MIXER_STACK_COLOR = 'hsl(210, 8%, 72%)';
const MIXER_MOUTH_COLOR = 'hsl(220, 8%, 16%)';
const MIXER_IRON_COLOR = 'hsl(220, 6%, 30%)';    // pedestals and fenders

const CEMENT_TRUCK_RANGES = {
    length: [23, 32],
    width: [7.8, 8.4],
    cabRoof: [8.6, 9.4],
    wheelRadius: [1.6, 1.8],
    drumR: [2.45, 2.85],
};

const CEMENT_TRUCK_FIXED = {
    clearance: [1.4, 1.7],
    chassisZ: [3.0, 3.4],
    hoodLen: [5.4, 6.6],
    hoodDrop: [0.3, 0.7],
    cabInset: [0.05, 0.15],
    tireWidth: [0.85, 1.0],
    rearAxle: [5.5, 7.5],
    tandemGap: [3.7, 4.3],
    wheelInset: [0.05, 0.15],
    frameWFrac: 0.5,
};

function generateCementTruck() {
    const spec = Object.assign({}, CEMENT_TRUCK_FIXED, specOnSizeAxis(CEMENT_TRUCK_RANGES, 0.12));
    spec.cabOver = Math.random() < 0.4;
    spec.cabLen = spec.cabOver ? [6.6, 7.6] : [5.0, 6.0];
    // A cab-over's glass drops nearly to the bumper; a conventional's stops at
    // the cowl, well above its bonnet.
    spec.belt = spec.cabOver ? [4.6, 5.2] : [5.4, 6.0];
    spec.wsRake = spec.cabOver ? [0.35, 0.7] : [0.7, 1.1];
    spec.frontAxle = spec.cabOver ? [3.2, 4.2] : [4.8, 5.8];
    spec.tandem = true;
    spec.color = pickVehicleColor();
    const v = makeTruck('cementTruck', spec);
    v.cab = spec.cabOver ? 'cabOver' : 'conventional';
    const f = v.frame;

    // The drum, nose down over the frame and mouth up over the tail. Stations run
    // rear to front: mouth, the rear cone out to full radius, the belly (carrying
    // the band, a whisker proud so it can never lose the tie to its own drum),
    // then the long front taper to the nose.
    const drum = pickColorComponentsFrom(MIXER_DRUM_COLORS);
    const drumColor = hsl(drum.h, drum.s, drum.l);
    const bandColor = Math.random() < 0.65 ? v.color : hsl(drum.h, drum.s, drum.l - 24);
    const x0 = -f.hl + 1.3, x1 = f.cabBackX - 1.0, L = x1 - x0;
    const zr = vehRand([7.6, 8.4]), zf = vehRand([4.4, 4.9]);
    const rMax = Math.min(f.hw - 0.25, vehRand(spec.drumR));
    const axisZ = x => zr + (zf - zr) * (x - x0) / L;
    const st = (t, r) => ({ x: x0 + L * t, z: axisZ(x0 + L * t), r });
    const stations = [
        st(0, 1.25), st(0.16, rMax),
        st(0.40, rMax + 0.02), st(0.52, rMax + 0.02),
        st(0.60, rMax), st(0.86, rMax * 0.60), st(1, 0.95),
    ];
    v.body.push(...makeLatheX(stations, 8, i => i === 2 ? bandColor : drumColor,
        MIXER_MOUTH_COLOR, drumColor));
    v.height = Math.max(f.cabRoofZ, ...stations.map(s => s.z + s.r));

    // The charge hopper over the mouth, and the pedestals: the rear pair of posts
    // that carry it, and the front block the drum nose turns on. The hopper is a
    // couple of steps darker than the drum, or it vanishes against a white cab
    // standing beyond it.
    const hopperShade = hsl(drum.h, drum.s, drum.l - 12);
    v.body.push(...makeRectangularPrism(x0 - 0.6, -0.95, zr + 1.0, 1.9, 1.9, 1.2, hopperShade));
    for (const side of [-1, 1]) {
        v.body.push(...makeRectangularPrism(x0 - 0.4, side * 1.2 - 0.17, f.chassisZ,
            0.34, 0.34, zr + 1.0 - f.chassisZ, MIXER_IRON_COLOR));
    }
    v.body.push(...makeRectangularPrism(x1 - 0.8, -0.9, f.chassisZ,
        1.4, 1.8, zf - 0.4 - f.chassisZ, MIXER_IRON_COLOR));

    // Fenders bridging the tandem wheels.
    const fx0 = f.rearXs[0] - f.wheelRadius - 0.35;
    const fx1 = f.rearXs[f.rearXs.length - 1] + f.wheelRadius + 0.35;
    for (const side of [-1, 1]) {
        const y = side < 0 ? -f.hw : f.hw - 1.0;
        v.body.push(...makeRectangularPrism(fx0, y, f.wheelRadius * 2 + 0.3,
            fx1 - fx0, 1.0, 0.28, MIXER_IRON_COLOR));
    }

    // The chrome stack behind a conventional cab's corner.
    if (!spec.cabOver) {
        v.body.push(...makeRectangularPrism(f.cabBackX - 0.5, f.cabHw - 0.6, f.chassisZ,
            0.26, 0.26, f.cabRoofZ + 0.7 - f.chassisZ, MIXER_STACK_COLOR));
    }

    return v;
}

registerVehicle('cementTruck', { generate: generateCementTruck, weight: 0.3 });
