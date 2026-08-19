// --- Jeep Wrangler (TJ, two-door) ---
// 12.95ft x 5.56ft on a 7.78ft wheelbase, 1997-2006. Two subtypes, 50/50 and
// recorded in v.subtype the way the van's work/passenger split is: 'hardtop'
// with the top and doors on (5.9ft tall), and 'open' with both off -- tub sides
// dipping at the door openings, the sport bar and the seats showing, 5.45ft to
// the top of the windscreen frame. On top of that, a third of them sit an
// honest half-foot higher on 35s: the lift kit, in v.lifted. That is ride
// height and tire size only -- the body itself never changes shape, so it stays
// inside what the user asked for ("Wranglers can optionally ride higher").
//
// The construction is the classic Jeep face done as three slabs: a narrow hood
// between flat-topped fenders, with the grille as the hood slab's own front
// face -- and a full-width tub behind the cowl whose top face gets the pickup
// bed treatment (a dark quad floating just above it) when the top is off.

// No sales-by-colour book exists for the TJ; weighted by what the classifieds
// and the forums show, which is black and silver out front, then the greens,
// reds and blues the brochures pushed, and the yellow everyone remembers.
const WRANGLER_COLORS = [
    [17, { h: 0,   s: 0,  l: 12 }],   // black
    [13, { h: 210, s: 6,  l: 72 }],   // bright silver
    [12, { h: 150, s: 35, l: 22 }],   // forest green
    [11, { h: 358, s: 68, l: 42 }],   // flame red
    [9,  { h: 40,  s: 4,  l: 92 }],   // stone white
    [8,  { h: 42,  s: 28, l: 60 }],   // desert sand
    [7,  { h: 220, s: 60, l: 35 }],   // intense blue
    [6,  { h: 52,  s: 85, l: 55 }],   // solar yellow
    [6,  { h: 210, s: 5,  l: 45 }],   // graphite
    [5,  { h: 225, s: 45, l: 25 }],   // patriot blue
];

const WRANGLER_TOP_COLOR = 'hsl(210, 4%, 22%)';    // hard tops were almost all black
const WRANGLER_TRIM_DARK = 'hsl(210, 5%, 16%)';    // bumpers, sport bar, flares
const WRANGLER_SEAT_COLOR = 'hsl(210, 6%, 32%)';
const WRANGLER_INTERIOR = 'hsl(30, 6%, 24%)';      // same idea as a pickup's bed liner

function generateWrangler() {
    const c = pickWeighted(WRANGLER_COLORS);
    const color = hsl(c.h, c.s, c.l);
    const open = Math.random() < 0.5;
    const lifted = Math.random() < 1 / 3;

    const length = 12.95, width = 5.56;
    const hl = length / 2, hw = width / 2;
    const tubHw = 2.6;                 // the flares take the last bit of width
    const G = lifted ? 0.5 : 0;        // the lift: everything above the tires rises
    const frontAxleX = 4.08, rearAxleX = frontAxleX - 7.78;   // 93.4in wheelbase

    const railZ = 3.05 + G;            // the tub rail
    const cowlZ = 2.95 + G;
    const wsTopX = 1.55, wsTopZ = 5.45 + G;
    const height = (open ? 5.45 : 5.9) + G;

    // The tub, cowl to tailgate. With the doors off its top edge dips to the
    // sill through the door opening; with them on it runs level.
    const tubTop = open ? [
        { x: -6.05, z: railZ },
        { x: -2.7, z: railZ },
        { x: -2.5, z: 2.55 + G },
        { x: 1.9,  z: 2.55 + G },
        { x: 2.1,  z: cowlZ },
    ] : [
        { x: -6.05, z: railZ },
        { x: 2.1,  z: cowlZ },
    ];
    const body = makeExtrudedProfile([
        { x: -6.05, z: 1.0 + G },
        { x: 2.1,   z: 1.0 + G },
        ...tubTop.slice().reverse(),
    ], -tubHw, tubHw, color);

    // The hood between the fenders, its front face doubling as the grille
    // panel, and the flat fender tops outboard with the wheels open under them.
    body.push(...makeExtrudedProfile([
        { x: 2.1, z: 1.3 + G },
        { x: 6.2, z: 1.3 + G },
        { x: 6.2, z: 2.82 + G },
        { x: 2.1, z: cowlZ },
    ], -1.85, 1.85, color));
    for (const side of [-1, 1]) {
        const [y0, y1] = side < 0 ? [-hw, -1.85] : [1.85, hw];
        body.push(...makeExtrudedProfile([
            { x: 3.0, z: 2.18 + G },
            { x: 6.2, z: 2.18 + G },
            { x: 6.2, z: 2.45 + G },
            { x: 3.0, z: 2.45 + G },
        ], y0, y1, color));
        // The rear flares on the tub, standing just proud of it.
        const [fy0, fy1] = side < 0 ? [-hw, -tubHw] : [tubHw, hw];
        body.push(...makeExtrudedProfile([
            { x: -4.9,  z: 2.15 + G },
            { x: -2.55, z: 2.15 + G },
            { x: -2.55, z: 2.48 + G },
            { x: -4.9,  z: 2.48 + G },
        ], fy0, fy1, WRANGLER_TRIM_DARK));
    }

    // The windscreen frame: a thin raked slab standing on the cowl, there on
    // every Jeep however much else has been taken off.
    body.push(...makeExtrudedProfile([
        { x: 2.05, z: cowlZ },
        { x: 2.3,  z: cowlZ },
        { x: wsTopX + 0.25, z: wsTopZ },
        { x: wsTopX, z: wsTopZ },
    ], -2.35, 2.35, color));

    // Steel front bumper, the spare on the tailgate, and the rear bumper.
    body.push(...makeRectangularPrism(6.2, -2.5, 1.15 + G, 0.27, 5.0, 0.45, WRANGLER_TRIM_DARK));
    body.push(...makeRectangularPrism(-6.3, -2.4, 1.05 + G, 0.25, 4.8, 0.45, WRANGLER_TRIM_DARK));
    body.push(...makeRectangularPrism(-6.45, -1.15, 2.0 + G, 0.4, 2.3, 2.3, TIRE_COLOR));

    if (open) {
        // The interior, seen over the dipped sides: a dark floor floating just
        // above the tub's top face (the pickup-bed trick, `depthBias` and all --
        // floating it is not enough, since height does not enter the depth sort),
        // the sport bar with its rear braces, and two seats.
        body.push({ pts: [
            { x: -5.8, y: -2.3, z: railZ + 0.06 },
            { x:  1.9, y: -2.3, z: railZ + 0.06 },
            { x:  1.9, y:  2.3, z: railZ + 0.06 },
            { x: -5.8, y:  2.3, z: railZ + 0.06 },
        ], color: WRANGLER_INTERIOR, depthBias: 0.25 });
        for (const side of [-1, 1]) {
            body.push(...makeRectangularPrism(-1.2, side * 1.9 - 0.09, railZ,
                0.18, 0.18, 1.8, WRANGLER_TRIM_DARK));
            // The braces run down to the tub rail: side-view slabs, since a
            // prism cannot lean.
            body.push(...makeExtrudedProfile([
                { x: -3.55, z: railZ + 0.1 },
                { x: -1.15, z: 4.6 + G },
                { x: -1.15, z: 4.82 + G },
                { x: -3.55, z: railZ + 0.32 },
            ], side * 1.9 - 0.09, side * 1.9 + 0.09, WRANGLER_TRIM_DARK));
            // A seat: base and backrest.
            body.push(...makeRectangularPrism(-0.35, side * 1.15 - 0.7, railZ,
                1.35, 1.4, 0.55, WRANGLER_SEAT_COLOR));
            body.push(...makeRectangularPrism(-0.8, side * 1.15 - 0.7, railZ,
                0.45, 1.4, 1.5, WRANGLER_SEAT_COLOR));
        }
        body.push(...makeRectangularPrism(-1.2, -1.9, 4.65 + G, 0.18, 3.8, 0.18, WRANGLER_TRIM_DARK));
    } else {
        // The hard top, one dark box from the windscreen frame to the tailgate.
        body.push(...makeExtrudedProfile([
            { x: -6.0, z: railZ - 0.03 },
            { x: 1.9,  z: railZ - 0.03 },
            { x: wsTopX, z: wsTopZ },
            { x: 1.1,  z: 5.9 + G },
            { x: -5.6, z: 5.9 + G },
            { x: -6.0, z: 5.35 + G },
        ], -2.5, 2.5, WRANGLER_TOP_COLOR));
    }

    // The face. Trim on the grille panel: a slot pattern too fine to model, so
    // five dark slots, the headlights outboard of them, and the little amber
    // markers on the fender fronts. All face +x, so bottom edges walk +y.
    const trim = [];
    const grilleX = 6.2 + 0.04;
    for (let i = -2; i <= 2; i++) {
        trim.push({ pts: [
            { x: grilleX, y: i * 0.5 - 0.1, z: 1.62 + G },
            { x: grilleX, y: i * 0.5 + 0.1, z: 1.62 + G },
            { x: grilleX, y: i * 0.5 + 0.1, z: 2.6 + G },
            { x: grilleX, y: i * 0.5 - 0.1, z: 2.6 + G },
        ], color: hsl(c.h, c.s, Math.max(0, c.l - 16)) });
    }
    for (const side of [-1, 1]) {
        trim.push(makeDiscX(grilleX + 0.03, side * 1.42, 2.28 + G, 0.28, 1, 'hsl(50, 15%, 82%)'));
        trim.push(makeDiscX(6.2 + 0.04, side * 2.2, 2.32 + G, 0.14, 1, 'hsl(35, 90%, 55%)'));
    }

    // Glass: the windscreen always; door and quarter panes plus the tailgate
    // window only when the top is on.
    const glass = [];
    glass.push({ pts: [
        { x: 2.12, y: -2.1, z: cowlZ + 0.05 },
        { x: 2.12, y:  2.1, z: cowlZ + 0.05 },
        { x: wsTopX + 0.07, y:  2.1, z: wsTopZ - 0.12 },
        { x: wsTopX + 0.07, y: -2.1, z: wsTopZ - 0.12 },
    ].map(p => ({ x: p.x + 0.035, y: p.y, z: p.z + 0.016 })), color: GLASS_COLOR });
    if (open) {
        glass.push({ pts: [
            { x: 2.03, y:  2.1, z: cowlZ + 0.05 },
            { x: 2.03, y: -2.1, z: cowlZ + 0.05 },
            { x: wsTopX - 0.02, y: -2.1, z: wsTopZ - 0.12 },
            { x: wsTopX - 0.02, y:  2.1, z: wsTopZ - 0.12 },
        ].map(p => ({ x: p.x - 0.035, y: p.y, z: p.z })), color: GLASS_COLOR });
    }
    if (!open) {
        for (const side of [-1, 1]) {
            const y = (2.5 + 0.03) * side;
            const door = [
                { x: -0.3, y, z: 3.35 + G },
                { x:  1.75, y, z: 3.3 + G },
                { x:  1.28, y, z: 5.3 + G },
                { x: -0.3, y, z: 5.35 + G },
            ];
            const quarter = [
                { x: -5.5, y, z: 3.4 + G },
                { x: -0.75, y, z: 3.37 + G },
                { x: -0.75, y, z: 5.35 + G },
                { x: -5.5, y, z: 5.3 + G },
            ];
            glass.push({ pts: side > 0 ? door.reverse() : door, color: GLASS_COLOR });
            glass.push({ pts: side > 0 ? quarter.reverse() : quarter, color: GLASS_COLOR });
        }
        glass.push({ pts: [
            { x: -6.04, y:  1.95, z: 3.75 + G },
            { x: -6.04, y: -1.95, z: 3.75 + G },
            { x: -6.04, y: -1.95, z: 5.25 + G },
            { x: -6.04, y:  1.95, z: 5.25 + G },
        ], color: GLASS_COLOR });
    }

    // 31s stock, 35s on a lift; the track is wide and the tires poke past the
    // flares a little, which is half the look.
    const radius = lifted ? 1.46 : 1.29;
    const wheelPolys = makeWheel(radius, 0.85);
    const wheels = [];
    for (const [x, steers] of [[frontAxleX, true], [rearAxleX, false]]) {
        for (const side of [-1, 1]) {
            wheels.push({ x, y: 2.2 * side, steers, polys: wheelPolys });
        }
    }

    return {
        type: 'wrangler', subtype: open ? 'open' : 'hardtop', lifted,
        width, length, height, color,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, color),
    };
}

registerVehicle('wrangler', { generate: generateWrangler, weight: 0.35 });
