// --- Ferrari Enzo ---
// 15.4ft x 6.68ft x 3.76ft on an 8.7ft wheelbase, 399 built, 2002-04. Fixed
// shape, and this time the colour weights are nearly a census: the production
// run is documented, and it was overwhelmingly Rosso Corsa.
//
// What the Enzo's shape is about is the F1 nose: a narrow raised cone running
// down the centre of the front, with the fenders standing as separate pontoons
// either side of it. That is body-and-wings again, more literally than any of
// the other classics -- the central slab really is narrow, and carries the cone,
// the teardrop canopy and the tail spine, while the pontoon fenders and the
// rear haunches ride outboard with the radiator dips between.

const ENZO_COLORS = [
    [70, { h: 2,   s: 90, l: 44 }],   // rosso corsa
    [15, { h: 0,   s: 0,  l: 10 }],   // nero
    [8,  { h: 50,  s: 95, l: 55 }],   // giallo modena
    [4,  { h: 210, s: 6,  l: 74 }],   // argento nurburgring
    [3,  { h: 210, s: 8,  l: 50 }],   // grigio silverstone
];

const ENZO_DARK = 'hsl(220, 8%, 13%)';
const ENZO_EXHAUST = 'hsl(210, 6%, 68%)';
const ENZO_TAIL_RED = 'hsl(352, 70%, 34%)';

function generateEnzo() {
    const c = pickWeighted(ENZO_COLORS);
    const color = hsl(c.h, c.s, c.l);

    const length = 15.43, width = 6.68, height = 3.76;
    const hl = length / 2, hw = width / 2, bodyHw = 2.1;
    const frontAxleX = 4.11, rearAxleX = frontAxleX - 8.69;   // 104.3in wheelbase

    // The centre: the nose cone rising from a point, the deeply raked screen
    // flowing over the canopy crown, the taper down to the engine deck, and the
    // high square-cut tail. Counter-clockwise from the rear floor.
    const body = makeExtrudedProfile([
        { x: -7.3,  z: 0.5 },
        { x: 7.5,   z: 0.5 },
        { x: hl,    z: 0.7 },
        { x: 7.55,  z: 1.2 },
        { x: 5.2,   z: 1.72 },    // up the cone
        { x: 2.7,   z: 2.15 },    // cowl
        { x: 0.6,   z: 3.45 },    // windscreen top
        { x: -0.6,  z: height },  // canopy crown
        { x: -2.6,  z: 2.95 },    // taper behind the cabin
        { x: -4.4,  z: 2.7 },
        { x: -7.5,  z: 2.75 },    // the deck rises a touch: the tail ridge
        { x: -hl,   z: 2.7 },
        { x: -hl,   z: 0.8 },
    ], -bodyHw, bodyHw, color);

    // The pontoons. The fronts sweep up from beside the nose point and crest
    // over the axle; the rear haunches run all the way out to the tail, which
    // is full width and nearly as tall as the deck.
    for (const side of [-1, 1]) {
        const [y0, y1] = side < 0 ? [-hw, -bodyHw] : [bodyHw, hw];
        body.push(...makeExtrudedProfile([
            { x: 2.5,  z: 1.0 },
            { x: 7.35, z: 1.0 },
            { x: 7.5,  z: 1.4 },
            { x: 6.3,  z: 1.98 },
            { x: 4.6,  z: 2.24 },
            { x: 3.4,  z: 2.12 },
            { x: 2.8,  z: 1.5 },
        ], y0, y1, color));
        body.push(...makeExtrudedProfile([
            { x: -7.55, z: 1.0 },
            { x: -1.6,  z: 1.0 },
            { x: -2.0,  z: 1.9 },
            { x: -3.2,  z: 2.55 },
            { x: -4.9,  z: 2.68 },
            { x: -6.9,  z: 2.62 },
            { x: -7.55, z: 2.4 },
        ], y0, y1, color));
    }

    // Trim. The radiator mouths are the dips beside the cone: one dark quad on
    // each pontoon's front face. The side intakes slash the flank ahead of the
    // rear wheel. The tail gets its four round lights, the full-width diffuser,
    // and the twin exhausts centred high in it (the depth sort orders coplanar
    // polys by average z -- see polyDepth -- so high is what keeps them on top).
    const trim = [];
    for (const side of [-1, 1]) {
        const yc = side * (bodyHw + (hw - bodyHw) / 2);
        // Faces +x like the nose it sits on, so the bottom edge walks +y.
        trim.push({ pts: [
            { x: 7.49, y: yc - 0.55, z: 1.06 },
            { x: 7.49, y: yc + 0.55, z: 1.06 },
            { x: 7.56, y: yc + 0.5,  z: 1.34 },
            { x: 7.56, y: yc - 0.5,  z: 1.34 },
        ], color: ENZO_DARK });
    }
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.04) * side;
        const pts = [
            { x: -2.45, y, z: 1.25 },
            { x: -1.15, y, z: 1.0 },
            { x: -1.15, y, z: 1.75 },
            { x: -2.45, y, z: 2.0 },
        ];
        trim.push({ pts: side > 0 ? pts.reverse() : pts, color: ENZO_DARK });
    }
    for (const side of [-1, 1]) {
        trim.push(makeDiscX(-hl - 0.04, side * 1.5, 2.3, 0.24, -1, ENZO_TAIL_RED));
        trim.push(makeDiscX(-hl - 0.04, side * 2.25, 2.3, 0.24, -1, ENZO_TAIL_RED));
    }
    trim.push({ pts: [
        { x: -hl - 0.03, y:  2.6, z: 0.55 },
        { x: -hl - 0.03, y: -2.6, z: 0.55 },
        { x: -hl - 0.03, y: -2.6, z: 1.15 },
        { x: -hl - 0.03, y:  2.6, z: 1.15 },
    ], color: ENZO_DARK });
    for (const side of [-1, 1]) {
        trim.push({ pts: [
            { x: -hl - 0.07, y: side * 0.5 + 0.28, z: 0.85 },
            { x: -hl - 0.07, y: side * 0.5 - 0.28, z: 0.85 },
            { x: -hl - 0.07, y: side * 0.5 - 0.28, z: 1.15 },
            { x: -hl - 0.07, y: side * 0.5 + 0.28, z: 1.15 },
        ], color: ENZO_EXHAUST });
    }

    // Glass: the wraparound screen, the little teardrop door panes, and the
    // small window down the canopy's rear slope. All walk their bottom edge
    // first, the way makeCarLike's do.
    const glass = [];
    glass.push({ pts: [
        { x: 2.6,  y: -1.85, z: 2.2 },
        { x: 2.6,  y:  1.85, z: 2.2 },
        { x: 0.66, y:  1.85, z: 3.4 },
        { x: 0.66, y: -1.85, z: 3.4 },
    ].map(p => ({ x: p.x + 0.03, y: p.y, z: p.z + 0.033 })), color: GLASS_COLOR });
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.03) * side;
        const pts = [
            { x: -1.7, y, z: 2.55 },
            { x:  2.0, y, z: 2.3 },
            { x:  0.55, y, z: 3.35 },
            { x: -0.7, y, z: 3.5 },
        ];
        glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }
    glass.push({ pts: [
        { x: -2.35, y:  1.35, z: 3.05 },
        { x: -2.35, y: -1.35, z: 3.05 },
        { x: -1.0,  y: -1.35, z: 3.6 },
        { x: -1.0,  y:  1.35, z: 3.6 },
    ].map(p => ({ x: p.x - 0.02, y: p.y, z: p.z + 0.035 })), color: GLASS_COLOR });

    const frontPolys = makeWheel(1.1, 0.75);
    const rearPolys = makeWheel(1.1, 0.95);
    const wheels = [];
    for (const side of [-1, 1]) {
        wheels.push({ x: frontAxleX, y: 2.55 * side, steers: true, polys: frontPolys });
        wheels.push({ x: rearAxleX, y: 2.5 * side, steers: false, polys: rearPolys });
    }

    return {
        type: 'enzo',
        width, length, height, color,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, color),
    };
}

registerVehicle('enzo', { generate: generateEnzo, weight: 0.05 });
