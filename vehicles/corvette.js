// --- Corvette (C3 and C7) ---
// One registered type, two real cars, the way van.js hides two subtypes behind
// one name: half the draws are a 1968-82 C3 (15.2ft x 5.75ft x 4.0ft on a 8.2ft
// wheelbase), half a 2014-19 C7 (14.7ft x 6.16ft x 4.05ft on 8.9ft). Which one
// came up is recorded in v.subtype. Both are fixed shapes -- only the paint is
// random, weighted by each generation's real production counts.
//
// Both generations are built the same way, and the same way as the Beetle: a
// central slab carrying the greenhouse, plus separate fender slabs riding
// outboard -- which is exactly what a Corvette's shape is about. On the C3 the
// bulges peak *above* the central hood line, so head-on you get the dip between
// the wings that makes it a coke-bottle; on the C7 they are the shoulder line.
// The pop-up (C3) and fixed-lens (C7) headlights leave both noses smooth, which
// saves the detail budget for the tails.

// 1979 was the C3's biggest year and the one with a published colour breakdown;
// weighted straight from those unit counts (in thousands).
const CORVETTE_C3_COLORS = [
    [10.5, { h: 0,   s: 0,  l: 12 }],   // black
    [8.7,  { h: 0,   s: 0,  l: 90 }],   // classic white
    [7.3,  { h: 210, s: 6,  l: 72 }],   // silver
    [6.7,  { h: 355, s: 70, l: 42 }],   // red
    [5.7,  { h: 220, s: 45, l: 30 }],   // dark blue
    [4.1,  { h: 25,  s: 40, l: 26 }],   // dark brown
    [3.2,  { h: 210, s: 40, l: 65 }],   // light blue
    [3.0,  { h: 40,  s: 30, l: 74 }],   // light beige
    [2.4,  { h: 150, s: 35, l: 25 }],   // dark green
    [2.4,  { h: 52,  s: 80, l: 55 }],   // yellow
];

// The C7's full-run production counts (in thousands): white, black and Torch
// Red are more than half of every C7 built.
const CORVETTE_C7_COLORS = [
    [35.9, { h: 40,  s: 5,  l: 92 }],   // arctic white
    [31.1, { h: 0,   s: 0,  l: 10 }],   // black
    [29.8, { h: 2,   s: 85, l: 45 }],   // torch red
    [11.0, { h: 210, s: 8,  l: 75 }],   // blade silver
    [10.2, { h: 210, s: 10, l: 45 }],   // shark gray
    [9.9,  { h: 200, s: 55, l: 45 }],   // laguna blue
    [4.0,  { h: 53,  s: 90, l: 55 }],   // velocity yellow
    [2.0,  { h: 25,  s: 90, l: 52 }],   // sebring orange
];

const CORVETTE_TAIL_RED = 'hsl(350, 65%, 26%)';
const CORVETTE_DARK_TRIM = 'hsl(220, 8%, 14%)';
const CORVETTE_EXHAUST = 'hsl(210, 6%, 70%)';

// Shared: the four fender slabs, one arch profile per wheel swept over the
// outboard band the central slab leaves free, mirrored like the Beetle's wings.
function corvetteFenders(front, rear, y0, y1, color) {
    const out = [];
    for (const side of [-1, 1]) {
        const [a, b] = side < 0 ? [-y1, -y0] : [y0, y1];
        out.push(...makeExtrudedProfile(front, a, b, color));
        out.push(...makeExtrudedProfile(rear, a, b, color));
    }
    return out;
}

function generateCorvetteC3() {
    const c = pickWeighted(CORVETTE_C3_COLORS);
    const color = hsl(c.h, c.s, c.l);

    const length = 15.2, width = 5.75, height = 4.0;
    const hl = length / 2, hw = width / 2, bodyHw = 2.4;
    const frontAxleX = 3.77, rearAxleX = frontAxleX - 8.17;   // 98in wheelbase

    // The centre: shark nose low and thin, the hood rising to a cowl the
    // fenders overtop, a small fast greenhouse set far back, the near-vertical
    // sugar-scoop backlight, and the long tail run out to a kamm face.
    const body = makeExtrudedProfile([
        { x: -hl + 0.25, z: 0.75 },
        { x: hl - 0.3,   z: 0.75 },
        { x: hl,         z: 1.0 },
        { x: hl,         z: 1.5 },
        { x: 5.2,        z: 1.95 },
        { x: 1.7,        z: 2.5 },     // cowl
        { x: 0.2,        z: 3.98 },    // windscreen top
        { x: -1.55,      z: height },
        { x: -2.15,      z: 3.05 },    // the scoop: backlight nearly upright
        { x: -3.1,       z: 2.95 },
        { x: -hl,        z: 2.6 },
        { x: -hl,        z: 1.05 },
    ], -bodyHw, bodyHw, color);

    // The wings peak above the hood line -- that dip is the whole front view.
    body.push(...corvetteFenders([
        { x: 1.95, z: 1.2 },
        { x: 6.2,  z: 1.2 },
        { x: 6.3,  z: 1.9 },
        { x: 5.3,  z: 2.42 },
        { x: 4.0,  z: 2.52 },
        { x: 2.8,  z: 2.35 },
        { x: 2.15, z: 1.8 },
    ], [
        { x: -6.7,  z: 1.2 },
        { x: -2.5,  z: 1.2 },
        { x: -2.85, z: 1.95 },
        { x: -3.7,  z: 2.5 },
        { x: -5.1,  z: 2.55 },
        { x: -6.2,  z: 2.25 },
        { x: -6.6,  z: 1.75 },
    ], bodyHw, hw, color));

    // The big-block stinger: a raised spine down the hood, a shade darker.
    body.push(...makeExtrudedProfile([
        { x: 2.2, z: 2.44 },
        { x: 5.0, z: 2.0 },
        { x: 5.0, z: 2.08 },
        { x: 2.2, z: 2.52 },
    ], -0.4, 0.4, hsl(c.h, c.s, Math.max(0, c.l - 6))));

    // Four round taillights sunk in the kamm face, and the twin gill louvres
    // behind the front wheels, in a deeper shade of the paint rather than
    // black. Trim: they lie on body faces.
    const trim = [];
    for (const side of [-1, 1]) {
        trim.push(makeDiscX(-hl - 0.04, side * 0.95, 1.9, 0.28, -1, CORVETTE_TAIL_RED));
        trim.push(makeDiscX(-hl - 0.04, side * 1.65, 1.9, 0.28, -1, CORVETTE_TAIL_RED));
    }
    const gillShade = hsl(c.h, c.s, Math.max(0, c.l - 14));
    trim.push(...makeFlankQuads(1.25, 1.45, 1.5, 2.2, bodyHw, gillShade));
    trim.push(...makeFlankQuads(1.65, 1.85, 1.5, 2.2, bodyHw, gillShade));

    // Glass: the fast windscreen, one pane per flank pinched by the buttresses,
    // and the backlight down in the scoop.
    const glass = [];
    glass.push({ pts: [
        { x: 1.7, y: -1.95, z: 2.5 },
        { x: 1.7, y:  1.95, z: 2.5 },
        { x: 0.2, y:  1.95, z: 3.98 },
        { x: 0.2, y: -1.95, z: 3.98 },
    ].map(p => ({ x: p.x + 0.028, y: p.y, z: p.z + 0.028 })), color: GLASS_COLOR });
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.03) * side;
        const pts = [
            { x: -2.0, y, z: 3.1 },
            { x:  1.5, y, z: 2.62 },
            { x:  0.3, y, z: 3.88 },
            { x: -1.45, y, z: 3.9 },
        ];
        glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }
    glass.push({ pts: [
        { x: -2.07, y:  1.5, z: 3.18 },
        { x: -2.07, y: -1.5, z: 3.18 },
        { x: -1.67, y: -1.5, z: 3.85 },
        { x: -1.67, y:  1.5, z: 3.85 },
    ].map(p => ({ x: p.x - 0.034, y: p.y, z: p.z + 0.021 })), color: GLASS_COLOR });

    const wheelPolys = makeWheel(1.05, 0.7);
    const wheels = [];
    for (const [x, steers] of [[frontAxleX, true], [rearAxleX, false]]) {
        for (const side of [-1, 1]) wheels.push({ x, y: 2.35 * side, steers, polys: wheelPolys });
    }

    return {
        type: 'corvette', subtype: 'c3',
        width, length, height, color,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, color),
    };
}

function generateCorvetteC7() {
    const c = pickWeighted(CORVETTE_C7_COLORS);
    const color = hsl(c.h, c.s, c.l);

    const length = 14.74, width = 6.16, height = 4.05;
    const hl = length / 2, hw = width / 2, bodyHw = 2.55;
    const frontAxleX = 4.21, rearAxleX = frontAxleX - 8.9;   // 106.7in wheelbase

    // The centre: a blade nose over a splitter lip, the long wedge hood, glass
    // flowing over the cabin into the fastback, and a little upkick of spoiler
    // at the kamm tail.
    const body = makeExtrudedProfile([
        { x: -hl + 0.25, z: 0.62 },
        { x: hl - 0.3,   z: 0.62 },
        { x: hl,         z: 0.9 },
        { x: hl,         z: 1.5 },
        { x: 4.3,        z: 2.3 },
        { x: 1.3,        z: 2.62 },    // cowl
        { x: -0.55,      z: 3.98 },    // windscreen top
        { x: -1.75,      z: height },
        { x: -3.7,       z: 3.05 },    // fastback base
        { x: -4.4,       z: 2.95 },
        { x: -7.15,      z: 2.78 },
        { x: -hl,        z: 2.85 },    // the spoiler lip kicks back up
        { x: -hl,        z: 1.05 },
    ], -bodyHw, bodyHw, color);

    // Front wings and the big rear haunches: the C7's shoulders.
    body.push(...corvetteFenders([
        { x: 2.3,  z: 1.15 },
        { x: 6.35, z: 1.15 },
        { x: 6.45, z: 2.0 },
        { x: 5.5,  z: 2.55 },
        { x: 4.2,  z: 2.62 },
        { x: 3.0,  z: 2.4 },
        { x: 2.5,  z: 1.8 },
    ], [
        { x: -6.85, z: 1.15 },
        { x: -2.3,  z: 1.15 },
        { x: -2.7,  z: 2.1 },
        { x: -3.6,  z: 2.75 },
        { x: -4.9,  z: 2.85 },
        { x: -6.1,  z: 2.5 },
        { x: -6.7,  z: 1.9 },
    ], bodyHw, hw, color));

    // Trim: the hood vent, the intake scoops ahead of the rear wheels -- both
    // in a deeper shade of the paint, the way they read on the real car -- four
    // squared taillights, and the diffuser with its centre exhaust cluster.
    const trim = [];
    const shade = hsl(c.h, c.s, Math.max(0, c.l - 14));
    const hoodZ = x => 1.5 + (2.3 - 1.5) * (x - hl) / (4.3 - hl);
    trim.push({ pts: [
        { x: 4.8, y: -0.55, z: hoodZ(4.8) + 0.05 },
        { x: 5.8, y: -0.55, z: hoodZ(5.8) + 0.05 },
        { x: 5.8, y:  0.55, z: hoodZ(5.8) + 0.05 },
        { x: 4.8, y:  0.55, z: hoodZ(4.8) + 0.05 },
    ], color: shade });
    // The scoop is a slash, rising as it runs back into the haunch.
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.04) * side;
        const pts = [
            { x: -1.35, y, z: 1.45 },
            { x: -2.2,  y, z: 1.75 },
            { x: -2.2,  y, z: 2.45 },
            { x: -1.35, y, z: 2.15 },
        ];
        trim.push({ pts: side < 0 ? pts.reverse() : pts, color: shade });
    }
    for (const side of [-1, 1]) {
        for (const yy of [1.05, 1.75]) {
            trim.push({ pts: [
                { x: -hl - 0.04, y: side * yy + 0.25, z: 1.9 },
                { x: -hl - 0.04, y: side * yy - 0.25, z: 1.9 },
                { x: -hl - 0.04, y: side * yy - 0.25, z: 2.25 },
                { x: -hl - 0.04, y: side * yy + 0.25, z: 2.25 },
            ], color: CORVETTE_TAIL_RED });
        }
    }
    trim.push({ pts: [
        { x: -hl - 0.03, y:  2.4, z: 0.7 },
        { x: -hl - 0.03, y: -2.4, z: 0.7 },
        { x: -hl - 0.03, y: -2.4, z: 1.1 },
        { x: -hl - 0.03, y:  2.4, z: 1.1 },
    ], color: CORVETTE_DARK_TRIM });
    // Centred a little high in the diffuser: the depth sort orders coplanar
    // polys by average z (see polyDepth), so this is what keeps the exhaust
    // painted over it from every heading.
    trim.push({ pts: [
        { x: -hl - 0.07, y:  0.55, z: 0.78 },
        { x: -hl - 0.07, y: -0.55, z: 0.78 },
        { x: -hl - 0.07, y: -0.55, z: 1.1 },
        { x: -hl - 0.07, y:  0.55, z: 1.1 },
    ], color: CORVETTE_EXHAUST });

    // Glass: windscreen, flanks with the kicked-up rear edge, and the big
    // fastback window.
    const glass = [];
    glass.push({ pts: [
        { x: 1.3,   y: -2.1, z: 2.62 },
        { x: 1.3,   y:  2.1, z: 2.62 },
        { x: -0.55, y:  2.1, z: 3.98 },
        { x: -0.55, y: -2.1, z: 3.98 },
    ].map(p => ({ x: p.x + 0.024, y: p.y, z: p.z + 0.032 })), color: GLASS_COLOR });
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.03) * side;
        const pts = [
            { x: -3.3,  y, z: 3.15 },
            { x:  1.1,  y, z: 2.72 },
            { x: -0.45, y, z: 3.86 },
            { x: -1.8,  y, z: 3.92 },
        ];
        glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }
    glass.push({ pts: [
        { x: -3.6, y:  1.9, z: 3.1 },
        { x: -3.6, y: -1.9, z: 3.1 },
        { x: -1.9, y: -1.9, z: 3.98 },
        { x: -1.9, y:  1.9, z: 3.98 },
    ].map(p => ({ x: p.x - 0.018, y: p.y, z: p.z + 0.036 })), color: GLASS_COLOR });

    const wheelPolys = makeWheel(1.1, 0.85);
    const wheels = [];
    for (const [x, steers] of [[frontAxleX, true], [rearAxleX, false]]) {
        for (const side of [-1, 1]) wheels.push({ x, y: 2.55 * side, steers, polys: wheelPolys });
    }

    return {
        type: 'corvette', subtype: 'c7',
        width, length, height, color,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, color),
    };
}

function generateCorvette() {
    return Math.random() < 0.5 ? generateCorvetteC3() : generateCorvetteC7();
}

registerVehicle('corvette', { generate: generateCorvette, weight: 0.12 });
