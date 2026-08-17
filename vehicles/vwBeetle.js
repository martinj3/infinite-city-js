// --- Classic VW Beetle (Type 1) ---
// A real car, not a family: 13.4ft x 5.05ft x 4.95ft on a 7.9ft wheelbase, the
// same numbers every air-cooled Beetle shared for forty years, so unlike the
// generic types nothing about the shape is random -- only the paint, drawn from
// the factory palette weighted the way the real ones sold.
//
// What makes a Beetle a Beetle is that the body and the wings are separate
// pieces: a narrow pontoon whose roof falls in one unbroken curve from the
// windscreen to the tail, and four bolted-on fenders standing clear of it with
// the running boards slung between them. So that is how it is built -- the
// central body is one extruded side profile, and each fender is its own little
// extrusion riding outboard, which also gives the correct look head-on: a domed
// cabin between two round wings.

// The factory palette leaned pastel for most of the run. Ruby and coral reds,
// the light blues and greens, and ivory/beige are the classics; black anchored
// the early years.
const BEETLE_COLORS = [
    [16, { h: 6,   s: 62, l: 42 }],   // ruby red
    [14, { h: 205, s: 38, l: 68 }],   // pastel blue
    [14, { h: 48,  s: 28, l: 87 }],   // ivory / lotus white
    [10, { h: 40,  s: 26, l: 70 }],   // sand / kalahari beige
    [10, { h: 115, s: 20, l: 64 }],   // pastel green
    [8,  { h: 215, s: 42, l: 44 }],   // marina / fjord blue
    [6,  { h: 50,  s: 72, l: 58 }],   // saturn yellow
    [6,  { h: 14,  s: 60, l: 54 }],   // coral red
    [5,  { h: 0,   s: 0,  l: 15 }],   // black
    [5,  { h: 172, s: 32, l: 55 }],   // turquoise / java green
];

const BEETLE_CHROME = 'hsl(210, 8%, 78%)';
const BEETLE_BOARD_COLOR = 'hsl(0, 0%, 16%)';    // running boards: always black rubber

function generateVwBeetle() {
    const c = pickWeighted(BEETLE_COLORS);
    const color = hsl(c.h, c.s, c.l);

    const length = 13.4, width = 5.05, height = 4.95;
    const hl = length / 2;                 // bumper to bumper
    const noseX = 6.45, tailX = -6.35;     // the body shell; bumpers take the rest
    const bodyHw = 2.0;                    // the pontoon between the fenders
    const hw = width / 2;                  // out to the fender faces
    const axleX = 7.875 / 2;               // 94.5in wheelbase, symmetric under the shell

    // The pontoon in side view: the low bonnet falling away to the blunt nose
    // (the wings crest above it -- that is where the car's face lives), the
    // nearly upright windscreen, and then the one long curve -- roof, rear
    // window, engine lid -- that lands at the tail. Read counter-clockwise
    // from the rear floor.
    const body = makeExtrudedProfile([
        { x: tailX + 0.3,  z: 0.9 },
        { x: noseX - 0.3,  z: 0.9 },
        { x: noseX,        z: 1.3 },
        { x: noseX - 0.13, z: 1.75 },
        { x: 4.5,          z: 2.3 },
        { x: 2.2,          z: 2.7 },     // cowl: windscreen base
        { x: 1.45,         z: 4.45 },    // windscreen top
        { x: 0.5,          z: 4.9 },
        { x: -0.85,        z: height },  // the crown of the roof
        { x: -2.3,         z: 4.2 },
        { x: -3.7,         z: 3.2 },     // the rear window rides this edge
        { x: -5.0,         z: 2.2 },
        { x: tailX,        z: 1.4 },
    ], -bodyHw, bodyHw, color);

    // The wings: an arch over each wheel, swept over the outboard strip the
    // pontoon leaves free. The fronts carry the headlights; the rears are a
    // little shorter. Same body colour -- two-tone wings were an aftermarket
    // thing, not a factory one.
    const fenderBand = [1.58, hw];
    const fenderArch = (cx, span, peak) => [
        { x: cx - span,       z: 1.05 },
        { x: cx + span,       z: 1.05 },
        { x: cx + span * 0.8, z: 1.8 },
        { x: cx + span * 0.45, z: peak - 0.15 },
        { x: cx,              z: peak },
        { x: cx - span * 0.5, z: peak - 0.2 },
        { x: cx - span * 0.82, z: 1.7 },
    ];
    for (const side of [-1, 1]) {
        const [y0, y1] = side < 0 ? [-fenderBand[1], -fenderBand[0]] : [fenderBand[0], fenderBand[1]];
        body.push(...makeExtrudedProfile(fenderArch(axleX, 1.6, 2.5), y0, y1, color));
        body.push(...makeExtrudedProfile(fenderArch(-axleX, 1.55, 2.35), y0, y1, color));
        // The running board slung between them, and a headlight up on the front wing
        body.push(...makeRectangularPrism(-axleX + 1.55, side < 0 ? -2.42 : 1.98, 1.0,
            axleX - 1.6 - (-axleX + 1.55), 0.44, 0.18, BEETLE_BOARD_COLOR));
        body.push(...makeRectangularPrism(axleX + 0.45, side * 2.0 - 0.19, 2.3,
            0.42, 0.38, 0.36, BEETLE_CHROME));
    }

    // Chrome blade bumpers, front and rear, standing off the shell.
    body.push(...makeRectangularPrism(noseX + 0.02, -2.1, 1.35, hl - noseX, 4.2, 0.38, BEETLE_CHROME));
    body.push(...makeRectangularPrism(-hl, -2.1, 1.35, -tailX - hl + 0.02, 4.2, 0.38, BEETLE_CHROME));

    // Glass. The windscreen is flat and quite upright; each flank gets one pane
    // following the roof curve (door and quarter glass merged -- the B-pillar
    // would be sub-pixel); the rear window is a small pane lying on the fastback.
    const glass = [];
    glass.push({ pts: [
        { x: 2.1, y: -1.6, z: 2.9 },
        { x: 2.1, y:  1.6, z: 2.9 },
        { x: 1.5, y:  1.6, z: 4.28 },
        { x: 1.5, y: -1.6, z: 4.28 },
    ].map(p => ({ x: p.x + 0.037, y: p.y, z: p.z + 0.016 })), color: GLASS_COLOR });
    for (const side of [-1, 1]) {
        const y = (bodyHw + 0.03) * side;
        const pts = [
            { x:  1.95, y, z: 2.98 },
            { x:  1.55, y, z: 4.28 },
            { x:  0.5,  y, z: 4.75 },
            { x: -0.85, y, z: 4.78 },
            { x: -2.45, y, z: 2.98 },
        ];
        glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }
    glass.push({ pts: [
        { x: -3.28, y:  1.05, z: 3.5 },
        { x: -3.28, y: -1.05, z: 3.5 },
        { x: -2.58, y: -1.05, z: 4.0 },
        { x: -2.58, y:  1.05, z: 4.0 },
    ].map(p => ({ x: p.x - 0.023, y: p.y, z: p.z + 0.033 })), color: GLASS_COLOR });

    // 15in wheels on a narrow track, centred under the wings.
    const wheelPolys = makeWheel(1.0, 0.5);
    const wheels = [];
    for (const [x, steers] of [[axleX, true], [-axleX, false]]) {
        for (const side of [-1, 1]) {
            wheels.push({ x, y: 2.02 * side, steers, polys: wheelPolys });
        }
    }

    return {
        type: 'vwBeetle',
        width, length, height, color,
        body, glass, wheels,
        flat: makeVehicleFootprint(width, length, color),
    };
}

registerVehicle('vwBeetle', { generate: generateVwBeetle, weight: 0.1 });
