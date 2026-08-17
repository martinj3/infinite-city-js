// --- Lamborghini Countach ---
// The 5000 QV-era wide body, the poster car: 13.6ft x 6.56ft x 3.51ft on an
// 8.2ft wheelbase, and nothing about the shape random -- only the paint. It is
// the lowest thing in the game by more than a foot of roof.
//
// The whole car is one straight line from the nose to the top of the
// windscreen -- hood and glass on the same plane, the "Italian Wedge" -- so the
// central slab's profile is really just that line, a short roof, and the long
// flat engine deck out to the kamm tail. What the wide body adds rides
// outboard: the trapezoid wheel-arch flares (angular on the real car, which
// suits this renderer perfectly), and the big intake boxes standing on the rear
// shoulders. The V wing on the tail is its own little slab on pylons.

// No production-by-colour book exists for the Countach; this is the enthusiast
// consensus -- red far in front, then white and black, the QV brochure's yellow,
// and the occasional silver, blue or period orange.
const COUNTACH_COLORS = [
    [40, { h: 355, s: 85, l: 45 }],   // rosso
    [22, { h: 40,  s: 6,  l: 92 }],   // bianco
    [14, { h: 0,   s: 0,  l: 10 }],   // nero
    [12, { h: 50,  s: 95, l: 55 }],   // giallo
    [5,  { h: 210, s: 8,  l: 74 }],   // argento
    [4,  { h: 225, s: 50, l: 30 }],   // blu
    [3,  { h: 24,  s: 90, l: 52 }],   // arancio -- the 70s survivor
];

const COUNTACH_DARK = 'hsl(220, 8%, 13%)';
const COUNTACH_EXHAUST = 'hsl(210, 6%, 68%)';

function generateCountach() {
    const c = pickWeighted(COUNTACH_COLORS);
    const color = hsl(c.h, c.s, c.l);

    const length = 13.58, width = 6.56, height = 3.51;
    const hl = length / 2, hw = width / 2, bodyHw = 2.62;
    const frontAxleX = 4.34, rearAxleX = frontAxleX - 8.2;   // 98.4in wheelbase

    // The centre. Read counter-clockwise from the rear floor: the shovel nose,
    // the one unbroken hood-and-windscreen line, a roof shorter than the doors,
    // the drop behind it, and the engine deck running out to the tail.
    const body = makeExtrudedProfile([
        { x: -6.55, z: 0.45 },
        { x: 6.6,   z: 0.45 },
        { x: hl,    z: 0.62 },
        { x: 6.72,  z: 1.05 },
        { x: 2.35,  z: 1.88 },    // cowl: the same line just keeps going
        { x: 0.55,  z: 3.35 },    // windscreen top
        { x: -0.9,  z: height },  // roof, brief as it is
        { x: -1.55, z: 2.72 },
        { x: -2.1,  z: 2.6 },
        { x: -5.9,  z: 2.38 },
        { x: -hl,   z: 2.32 },
        { x: -hl,   z: 0.8 },
    ], -bodyHw, bodyHw, color);

    // The flares: flat-topped trapezoids, not arcs -- Gandini drew them with a
    // ruler. The rears reach forward toward the door, the way the real haunch
    // does. Swept over the outboard band, mirrored per side.
    for (const side of [-1, 1]) {
        const [y0, y1] = side < 0 ? [-hw, -bodyHw] : [bodyHw, hw];
        body.push(...makeExtrudedProfile([
            { x: 2.95, z: 0.95 },
            { x: 5.75, z: 0.95 },
            { x: 5.6,  z: 1.58 },
            { x: 4.95, z: 1.74 },
            { x: 3.65, z: 1.74 },
            { x: 3.2,  z: 1.45 },
        ], y0, y1, color));
        body.push(...makeExtrudedProfile([
            { x: -5.5,  z: 0.95 },
            { x: -2.25, z: 0.95 },
            { x: -2.45, z: 1.78 },
            { x: -3.05, z: 2.06 },
            { x: -4.7,  z: 2.06 },
            { x: -5.2,  z: 1.6 },
        ], y0, y1, color));
        // The shoulder intake box standing behind the door, feeding the V12.
        body.push(...makeRectangularPrism(-2.3, side < 0 ? -3.05 : 2.0, 2.3,
            1.65, 1.05, 0.95, color));
    }

    // The V wing: a slanted slab spanning the tail on two pylons. Every QV
    // poster had one, so this one does too.
    body.push(...makeExtrudedProfile([
        { x: -6.6,  z: 3.0 },
        { x: -5.55, z: 3.18 },
        { x: -5.65, z: 3.34 },
        { x: -6.7,  z: 3.16 },
    ], -2.95, 2.95, COUNTACH_DARK));
    for (const side of [-1, 1]) {
        body.push(...makeRectangularPrism(-6.35, side * 2.0 - 0.14, 2.35, 0.5, 0.28, 0.72, COUNTACH_DARK));
    }

    // Trim, all lying on body faces. The NACA duct slashing the door, the
    // full-width louvred engine grille on the kamm face with the taillight
    // clusters over it and the exhausts below -- the exhausts a touch prouder
    // of the tail than the grille (-0.07 against -0.04), since the depth sort
    // orders polys by ground footprint (see polyDepth) and prouder of the face
    // is nearer the camera.
    const trim = [];
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.04) * side;
        const pts = [
            { x: -0.45, y, z: 1.15 },
            { x: 1.35,  y, z: 0.95 },
            { x: 1.35,  y, z: 1.4 },
            { x: -0.45, y, z: 1.72 },
        ];
        trim.push({ pts: side > 0 ? pts.reverse() : pts, color: COUNTACH_DARK });
    }
    trim.push({ pts: [
        { x: -hl - 0.04, y:  2.35, z: 1.15 },
        { x: -hl - 0.04, y: -2.35, z: 1.15 },
        { x: -hl - 0.04, y: -2.35, z: 1.95 },
        { x: -hl - 0.04, y:  2.35, z: 1.95 },
    ], color: COUNTACH_DARK });
    for (const side of [-1, 1]) {
        trim.push({ pts: [
            { x: -hl - 0.07, y: side * 1.85 + 0.42, z: 1.98 },
            { x: -hl - 0.07, y: side * 1.85 - 0.42, z: 1.98 },
            { x: -hl - 0.07, y: side * 1.85 - 0.42, z: 2.24 },
            { x: -hl - 0.07, y: side * 1.85 + 0.42, z: 2.24 },
        ], color: 'hsl(355, 70%, 38%)' });
    }
    for (const side of [-1, 1]) {
        trim.push({ pts: [
            { x: -hl - 0.07, y: side * 0.55 + 0.3, z: 1.35 },
            { x: -hl - 0.07, y: side * 0.55 - 0.3, z: 1.35 },
            { x: -hl - 0.07, y: side * 0.55 - 0.3, z: 1.58 },
            { x: -hl - 0.07, y: side * 0.55 + 0.3, z: 1.58 },
        ], color: COUNTACH_EXHAUST });
    }

    // Glass. The windscreen lies on the wedge line; the side windows are the
    // shallow trapezoids high on the door that make the belt look armoured.
    // Pop-up headlights stay down, so the nose needs none.
    const glass = [];
    glass.push({ pts: [
        { x: 2.25, y: -2.25, z: 1.93 },
        { x: 2.25, y:  2.25, z: 1.93 },
        { x: 0.62, y:  2.25, z: 3.28 },
        { x: 0.62, y: -2.25, z: 3.28 },
    ].map(p => ({ x: p.x + 0.026, y: p.y, z: p.z + 0.03 })), color: GLASS_COLOR });
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.03) * side;
        const pts = [
            { x: -1.35, y, z: 2.35 },
            { x:  1.7,  y, z: 2.15 },
            { x:  0.5,  y, z: 3.25 },
            { x: -0.95, y, z: 3.35 },
        ];
        glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }

    // Fat rear tyres, the era's 345s: the rear pair is its own wider wheel.
    const frontPolys = makeWheel(1.05, 0.72);
    const rearPolys = makeWheel(1.05, 0.95);
    const wheels = [];
    for (const side of [-1, 1]) {
        wheels.push({ x: frontAxleX, y: 2.5 * side, steers: true, polys: frontPolys });
        wheels.push({ x: rearAxleX, y: 2.42 * side, steers: false, polys: rearPolys });
    }

    return {
        type: 'countach',
        width, length, height, color,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, color),
    };
}

registerVehicle('countach', { generate: generateCountach, weight: 0.06 });
