// --- Van ---
// One type covering the whole family, from a compact minivan (Caravan, Odyssey) to
// a full-size eight-seater (the old Econoline): the small end is no wider than a
// sedan and only a little taller, the big end is longer, taller and slightly wider,
// and even that stays well under a delivery van. So the size is not three
// independent draws: it is one point on the minivan-to-Econoline axis, which is
// what specOnSizeAxis() in vehicleUtils.js is for.
//
// The proportions that go with that axis ride along: a minivan has a sloping,
// dropped nose and a steeply raked windscreen, an Econoline a stubby flat one and
// glass that is nearly upright. Those ranges are written big-end-first below where
// they run the other way to size.
//
// Two subtypes, differing only in glass and paint:
//
//   passenger  windows all round and the general fleet colours. The rear side
//              windows are one long strip rather than a pane per row of seats --
//              at this scale the pillars between them would be sub-pixel, so they
//              would cost polygons and show nothing
//   work       no side glass behind the cab and no back window, and almost always
//              white -- the panel van a plumber drives
//
// Everything else -- lower body, cabin, wheels -- is makeCarLike() in
// vehicleUtils.js, where every spec field is documented.

// A work van is white far more often than the fleet at large; the rest are the
// greys a leasing company buys.
const WORK_VAN_COLORS = [
    [70, 0, 0, 93],   // white
    [12, 0, 0, 72],   // silver
    [10, 210, 4, 45], // grey
    [8,  0, 0, 16],   // black
];

const WORK_VAN_SHARE = 0.3;   // the less common subtype

const VAN_SIZE_JITTER = 0.18;   // how far one dimension may stray off the size axis

// Read big-end-first where the field runs the other way to size.
const VAN_RANGES = {
    length: [16.0, 19.5],
    width: [6.0, 7.0],           // the small end is a sedan's width, the big end barely over
    height: [5.4, 7.0],          // still two-thirds of a delivery van
    clearance: [1.05, 1.45],
    beltFrac: [0.52, 0.47],      // the taller it is, the lower the window line sits on it
    hoodFrac: [0.20, 0.13],      // a minivan's bonnet is short; a full-size van's is a stub
    hoodDrop: [0.60, 0.20],
    windscreenRake: [0.70, 0.25],
    wheelRadius: [1.05, 1.30],
    tireWidth: [0.70, 0.88],
};

// Fields with no relation to how big the van is, so they stay plain ranges.
const VAN_FIXED = {
    rearFrac: [0.02, 0.06],      // the back is very nearly the end of the cabin
    rearDrop: [0, 0.10],
    backlightRake: [0.04, 0.18],
    minRoofFrac: 0.35,
    cabinInset: [0.15, 0.32],    // slab-sided compared with a car
    frontOverhang: [0.13, 0.18],
    rearOverhang: [0.12, 0.17],
    wheelInset: [0.08, 0.20],
};

function generateVan() {
    const spec = Object.assign({}, VAN_FIXED, specOnSizeAxis(VAN_RANGES, VAN_SIZE_JITTER));

    const work = Math.random() < WORK_VAN_SHARE;
    if (work) {
        spec.palette = WORK_VAN_COLORS;
        spec.sideGlass = [0, 0.22];   // the cab doors, and blank panel behind them
        spec.rearGlass = false;
    }

    const van = makeCarLike('van', spec);
    van.subtype = work ? 'work' : 'passenger';
    return van;
}

registerVehicle('van', { generate: generateVan, weight: 1.5 });
