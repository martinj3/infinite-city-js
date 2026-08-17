// --- Ford Mustang fastback (1965-66) ---
// 15.13ft x 5.68ft x 4.26ft on the Falcon's 9ft wheelbase -- the original
// fastback 2+2, fixed shape, only the paint random. The colour table is real:
// Ford's production books survive, and Wimbledon White led 1965 outright.
//
// Unlike the exotics this car is slab-sided, so the split is not body-and-wings
// but centre-and-shoulders: a central slab carries the nose, hood, greenhouse
// and the long fastback slope, while full-length shoulder slabs ride outboard
// with the level beltline that kicks up over the rear quarter. The fastback
// recess between the shoulders is what makes the rear view read right.

const MUSTANG_COLORS = [
    [14, { h: 45,  s: 10, l: 91 }],   // wimbledon white
    [12, { h: 357, s: 80, l: 40 }],   // rangoon / candyapple red
    [10, { h: 212, s: 55, l: 38 }],   // caspian blue
    [7,  { h: 210, s: 35, l: 70 }],   // silver blue
    [7,  { h: 0,   s: 0,  l: 10 }],   // raven black
    [6,  { h: 155, s: 30, l: 30 }],   // ivy green
    [6,  { h: 55,  s: 65, l: 70 }],   // springtime yellow
    [5,  { h: 12,  s: 80, l: 50 }],   // poppy red
    [5,  { h: 210, s: 6,  l: 60 }],   // silversmoke gray
    [4,  { h: 30,  s: 35, l: 45 }],   // prairie bronze
];

const MUSTANG_CHROME = 'hsl(210, 8%, 78%)';
const MUSTANG_DARK = 'hsl(220, 8%, 15%)';
const MUSTANG_TAIL_RED = 'hsl(355, 70%, 38%)';

function generateMustang() {
    const c = pickWeighted(MUSTANG_COLORS);
    const color = hsl(c.h, c.s, c.l);

    const length = 15.13, width = 5.68, height = 4.26;
    const hl = length / 2, hw = width / 2, bodyHw = 2.25;
    const frontAxleX = 4.77, rearAxleX = frontAxleX - 9.0;   // 108in wheelbase

    // The centre: long hood, upright screen for the era, short roof, and the
    // one long fastback line down to the tail lip. Counter-clockwise from the
    // rear floor.
    const body = makeExtrudedProfile([
        { x: -7.5,  z: 0.7 },
        { x: 7.5,   z: 0.7 },
        { x: hl,    z: 1.05 },
        { x: 7.5,   z: 2.05 },
        { x: 2.3,   z: 2.5 },     // cowl
        { x: 0.95,  z: 4.15 },    // windscreen top
        { x: -0.5,  z: height },  // roof
        { x: -4.9,  z: 2.8 },     // the fastback lands here
        { x: -6.9,  z: 2.76 },    // deck
        { x: -hl,   z: 2.8 },     // tail lip
        { x: -hl,   z: 0.95 },
    ], -bodyHw, bodyHw, color);

    // The shoulders: full-length slabs with the fender crown over the
    // headlight, the level door line, and the quarter-panel kick.
    for (const side of [-1, 1]) {
        const [y0, y1] = side < 0 ? [-hw, -bodyHw] : [bodyHw, hw];
        body.push(...makeExtrudedProfile([
            { x: -7.5, z: 0.7 },
            { x: 7.5,  z: 0.7 },
            { x: 7.5,  z: 2.05 },
            { x: 6.5,  z: 2.35 },
            { x: 4.0,  z: 2.42 },
            { x: 0.5,  z: 2.38 },
            { x: -2.6, z: 2.5 },
            { x: -3.3, z: 2.72 },  // the kick
            { x: -5.6, z: 2.78 },
            { x: -7.5, z: 2.8 },
        ], y0, y1, color));
    }

    // Chrome blade bumpers, the way the Beetle wears its.
    body.push(...makeRectangularPrism(7.44, -2.6, 1.0, hl - 7.44, 5.2, 0.32, MUSTANG_CHROME));
    body.push(...makeRectangularPrism(-hl, -2.6, 1.0, 0.13, 5.2, 0.32, MUSTANG_CHROME));

    // Trim. The dark grille between the headlights (the corral is sub-pixel; a
    // chrome sliver stands in for it), the side scallop swept back into the
    // C-scoop ahead of the rear wheel, and the tail: three-bar lights each
    // side of the chrome gas cap on the near-flat panel.
    const trim = [];
    trim.push({ pts: [
        { x: 7.53, y: -1.9, z: 1.35 },
        { x: 7.53, y:  1.9, z: 1.35 },
        { x: 7.53, y:  1.9, z: 1.95 },
        { x: 7.53, y: -1.9, z: 1.95 },
    ], color: MUSTANG_DARK });
    trim.push({ pts: [
        { x: 7.56, y: -0.35, z: 1.68 },
        { x: 7.56, y:  0.35, z: 1.68 },
        { x: 7.56, y:  0.35, z: 1.78 },
        { x: 7.56, y: -0.35, z: 1.78 },
    ], color: MUSTANG_CHROME });
    for (const side of [-1, 1]) {
        trim.push(makeDiscX(7.53, side * 2.5, 1.7, 0.26, 1, 'hsl(50, 15%, 82%)'));
    }
    const scallopShade = hsl(c.h, c.s, Math.max(0, c.l - 12));
    for (const side of [-1, 1]) {
        const y = (hw + 0.04) * side;
        const pts = [
            { x: -2.9, y, z: 1.55 },
            { x: -0.2, y, z: 1.9 },
            { x: -0.2, y, z: 2.1 },
            { x: -2.9, y, z: 2.1 },
        ];
        trim.push({ pts: side > 0 ? pts.reverse() : pts, color: scallopShade });
    }
    for (const side of [-1, 1]) {
        for (const bar of [1.05, 1.5, 1.95]) {
            trim.push({ pts: [
                { x: -hl - 0.04, y: side * bar + 0.16, z: 1.75 },
                { x: -hl - 0.04, y: side * bar - 0.16, z: 1.75 },
                { x: -hl - 0.04, y: side * bar - 0.16, z: 2.45 },
                { x: -hl - 0.04, y: side * bar + 0.16, z: 2.45 },
            ], color: MUSTANG_TAIL_RED });
        }
    }
    trim.push(makeDiscX(-hl - 0.05, 0, 2.1, 0.22, -1, MUSTANG_CHROME));

    // Glass: windscreen, the long tapering fastback side pane, and the rear
    // window lying on the slope (bottom edge first, as always).
    const glass = [];
    glass.push({ pts: [
        { x: 2.3,  y: -1.95, z: 2.5 },
        { x: 2.3,  y:  1.95, z: 2.5 },
        { x: 0.95, y:  1.95, z: 4.15 },
        { x: 0.95, y: -1.95, z: 4.15 },
    ].map(p => ({ x: p.x + 0.032, y: p.y, z: p.z + 0.026 })), color: GLASS_COLOR });
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.03) * side;
        const pts = [
            { x: -2.4, y, z: 2.72 },
            { x:  1.85, y, z: 2.62 },
            { x:  1.0,  y, z: 4.02 },
            { x: -0.45, y, z: 4.1 },
        ];
        glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }
    glass.push({ pts: [
        { x: -3.5,  y:  1.6, z: 3.27 },
        { x: -3.5,  y: -1.6, z: 3.27 },
        { x: -1.05, y: -1.6, z: 4.08 },
        { x: -1.05, y:  1.6, z: 4.08 },
    ].map(p => ({ x: p.x - 0.014, y: p.y, z: p.z + 0.04 })), color: GLASS_COLOR });

    const wheelPolys = makeWheel(1.0, 0.6);
    const wheels = [];
    for (const [x, steers] of [[frontAxleX, true], [rearAxleX, false]]) {
        for (const side of [-1, 1]) {
            wheels.push({ x, y: 2.35 * side, steers, polys: wheelPolys });
        }
    }

    return {
        type: 'mustang',
        width, length, height, color,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, color),
    };
}

registerVehicle('mustang', { generate: generateMustang, weight: 0.1 });
