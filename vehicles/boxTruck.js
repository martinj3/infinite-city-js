// --- Box truck ---
// The rental truck and the mover's straight truck: makeTruck()'s chassis
// (vehicleUtils.js, where every spec field is documented) carrying one plain
// rectangular body from the tail to just behind the cab, wider than the cab it
// sits behind, with the aero fairing carrying the roof forward over that cab --
// the silhouette that reads as "box truck" from a block away.
//
// Nothing here is a garbage truck's or a mixer's apparatus: the whole body is
// one extruded profile, and what makes it worth its own file is everything
// bolted to that plain box -- the roll-up door on the tail, the rub rail, the
// step under the sill, and the company name painted down the flanks.
//
// The cab takes the ordinary fleet palette, so a box truck's cab is as likely to
// be any colour a sedan is. The body is a different question: a rental fleet, a
// mover's van body and a body waiting for a wrap are all white, so white is most
// of the table and a matching cab colour is the occasional exception.

const BOX_BODY_COLORS = [
    [64, 0,   0,  91],   // white
    [10, 210, 5,  80],   // off-white
    [7,  210, 5,  58],   // grey
    [5,  215, 40, 34],   // blue
    [4,  355, 50, 38],   // red
    [3,  150, 30, 30],   // green
    [2,  45,  70, 52],   // yellow
    [2,  25,  60, 42],   // orange
];

// Lettering: strong and dark on a light body, plain white or gold on a dark one.
const BOX_INK_DARK = [
    [8, 220, 55, 28],    // navy
    [6, 355, 60, 36],    // red
    [4, 150, 45, 24],    // dark green
    [4, 0,   0,  18],    // near-black
    [2, 275, 40, 34],    // purple
];
const BOX_INK_LIGHT = [
    [4, 0,  0,  95],     // white
    [1, 45, 60, 74],     // pale gold
];

// Half of them carry a name; the rest are plain, which is what a rental truck
// between liveries or an owner-operator's body actually looks like. Nothing here
// is a real fleet -- they are the generic sort of name a small mover, van line or
// regional carrier gives itself.
// They are all about the same length on purpose: one line of lettering across a
// box is as wide as the box, so a name twice as long is drawn half as tall, and
// past about twenty-odd characters it stops looking like signwriting.
const BOX_TRUCK_NAMES = [
    'Meridian Van Lines', 'Cornerstone Movers', 'Blue Ridge Freight',
    'Harborline Logistics', 'Copper Creek Movers', 'Sentinel Van Lines',
    'Anchor Bay Moving', 'Redwood Relocation', 'Pioneer Van Lines',
    'Ironwood Trucking', 'Silver Birch Freight', 'Lakeshore Moving Co.',
    'Granite State Carriers', 'Falcon Ridge Delivery', 'Homestead Movers',
    'Trailhead Logistics', 'Beacon Street Storage', 'Northwind Van Lines',
    'Riverbend Freight', 'Kingfisher Couriers', 'Old Mill Moving Co.',
    'Cedar Hollow Transfer', 'Prairie Line Trucking', 'Sunward Self Storage',
    'Longshore Cartage', 'Tin Roof Movers', 'Stonegate Storage',
    'Brightline Delivery', 'Two Rivers Moving', 'Ambler & Sons Trucking',
];

const BOX_TRUCK_RANGES = {
    length: [21, 31],
    width: [7.5, 8.2],
    cabRoof: [7.6, 8.7],
    bodyTop: [10.2, 12.6],
    chassisZ: [3.25, 3.95],    // the deck: high enough that the body clears the tyres
    wheelRadius: [1.30, 1.60],
};

const BOX_TRUCK_FIXED = {
    // High enough that the exposed frame under the body reads as a rail rather
    // than a skirt: it is everything between here and the deck.
    clearance: [1.75, 2.15],
    hoodLen: [4.2, 5.4],
    hoodDrop: [0.35, 0.75],
    cabInset: [0.45, 0.85],    // the body overhangs the cab's flanks, as they do
    tireWidth: [0.75, 0.92],
    rearAxle: [5.0, 7.0],      // well forward of the tail: a long rear overhang
    wheelInset: [0.05, 0.15],
};

function generateBoxTruck() {
    const spec = Object.assign({}, BOX_TRUCK_FIXED, specOnSizeAxis(BOX_TRUCK_RANGES, 0.12));
    // Small box trucks are nearly all cab-over -- the Isuzu/Hino school -- and big
    // ones mostly conventional, a 26-footer on a medium-duty chassis cab. So the
    // cab rides the same size axis every dimension does: specOnSizeAxis has already
    // settled each field to one value, so the length reads back as the point on
    // that axis this truck landed on.
    const [lo, hi] = BOX_TRUCK_RANGES.length;
    const t = (spec.length[0] - lo) / (hi - lo);
    spec.cabOver = Math.random() < 0.85 - 0.6 * t;
    spec.cabLen = spec.cabOver ? [6.0, 7.0] : [4.6, 5.4];
    // A cab-over's glass drops nearly to the bumper; a conventional's stops at
    // the cowl, well above its bonnet.
    spec.belt = spec.cabOver ? [4.2, 4.8] : [4.9, 5.5];
    spec.wsRake = spec.cabOver ? [0.3, 0.6] : [0.6, 1.0];
    spec.frontAxle = spec.cabOver ? [3.0, 3.8] : [4.3, 5.3];
    spec.tandem = false;       // one rear axle on duals, not a tandem chassis
    // The fairing has to be settled before the cab is built: it sits flush on the
    // cab roof, and makeTruck leaves that roof face out when something covers it.
    spec.roofCovered = Math.random() < (spec.cabOver ? 0.5 : 0.9);
    const cab = pickColorComponentsFrom(VEHICLE_COLORS);
    spec.color = hsl(cab.h, cab.s, cab.l);
    const v = makeTruck('boxTruck', spec);
    v.cab = spec.cabOver ? 'cabOver' : 'conventional';
    const f = v.frame;

    // A fleet body is usually its own colour, but a truck painted as one piece is
    // common enough to be worth having. Kept as components either way, so the
    // door and the rub rail can be steps off the same paint.
    const box = Math.random() < 0.15 ? cab : pickColorComponentsFrom(BOX_BODY_COLORS);
    const boxColor = hsl(box.h, box.s, box.l);

    // The body in side view, read counter-clockwise from the bottom rear: along
    // the floor, up the front wall, then -- on most of them -- forward along the
    // underside of the fairing, up its little front face and back up its slope to
    // the roof, which runs to the tail. Without the fairing those three points
    // drop out and the profile is the plain rectangle it started as.
    //
    // The fairing is one convex wedge sitting flat on the cab roof and reaching
    // past it at both ends, which is what earns the missing roof face: from any
    // direction its silhouette contains the roof's, so the roof has nothing left
    // to show through.
    const boxTop = vehRand(spec.bodyTop);
    const rearX = -f.hl + 0.15;
    const frontX = f.cabBackX - vehRand([0.3, 0.7]);
    const profile = [
        { x: rearX,  z: f.chassisZ },
        { x: frontX, z: f.chassisZ },
    ];
    if (spec.roofCovered) {
        const tipX = f.roofFrontX + vehRand([0.1, 0.5]);
        profile.push({ x: frontX, z: f.cabRoofZ },
                     { x: tipX,   z: f.cabRoofZ },
                     { x: tipX,   z: f.cabRoofZ + vehRand([0.35, 0.7]) });
    }
    profile.push({ x: frontX, z: boxTop },
                 { x: rearX,  z: boxTop });
    v.body.push(...makeExtrudedProfile(profile, -f.hw, f.hw, boxColor));
    v.height = boxTop;

    // The step under the tail sill, which is the rear bumper as well.
    v.body.push(...makeRectangularPrism(rearX - 0.5, -f.hw * 0.82, f.chassisZ - 0.8,
        0.6, f.hw * 1.64, 0.5, TRUCK_FRAME_COLOR));

    // The roll-up door on the tail and the rub rail down each flank, both a step
    // off the body colour -- at this size a door's slats read as a shaded panel.
    const shade = hsl(box.h, box.s, box.l - 14);
    const doorHw = f.hw - 0.35, doorX = rearX - 0.05;
    v.trim.push({ pts: [
        { x: doorX, y:  doorHw, z: f.chassisZ + 0.25 },
        { x: doorX, y: -doorHw, z: f.chassisZ + 0.25 },
        { x: doorX, y: -doorHw, z: boxTop - 0.35 },
        { x: doorX, y:  doorHw, z: boxTop - 0.35 },
    ], color: shade });
    v.trim.push(...makeFlankQuads(rearX + 0.2, frontX - 0.2,
        f.chassisZ + 0.1, f.chassisZ + 0.45, f.hw, shade));

    // The name, across the upper half of each flank where a mover paints it.
    if (Math.random() < 0.5) {
        const boxH = boxTop - f.chassisZ;
        const pad = (frontX - rearX) * 0.06;
        v.trim.push(...makeFlankText(rearX + pad, frontX - pad,
            f.chassisZ + boxH * 0.40, f.chassisZ + boxH * 0.76, f.hw,
            BOX_TRUCK_NAMES[Math.floor(Math.random() * BOX_TRUCK_NAMES.length)],
            // Yellow sits at a lightness of about 50 and still wants dark
            // lettering, so the line between the two tables is well below halfway.
            pickColorFrom(box.l > 45 ? BOX_INK_DARK : BOX_INK_LIGHT)));
    }

    return v;
}

registerVehicle('boxTruck', { generate: generateBoxTruck, weight: 0.55 });
