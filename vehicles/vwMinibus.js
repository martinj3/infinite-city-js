// --- Classic VW Minibus (Type 2 splitscreen) ---
// Like the Beetle it shares its 7.9ft wheelbase with, a real fixed vehicle:
// 14.1ft x 5.66ft x 6.33ft, one box, engine in the tail (which is why the rear
// overhang is the long one). Only the paint varies.
//
// Nearly every one wore a two-tone: an upper colour over a lower one, split at
// the beltline -- and on the nose the upper colour sweeps down in the V that is
// the whole identity of the front, around the big roundel. So the body is built
// as two stacked extrusions, one per colour, and the V is a trim triangle lying
// on the nose face (the beltline is horizontal everywhere else, so nothing else
// has to know). The split windscreen is two panes with a real gap.

// Factory two-tones, [weight, {lower, upper}], weighted the way the survivors
// and the sales lists lean: sealing-wax red over chestnut-to-cream is the
// iconic Samba scheme, the blues and greens the everyday ones. A single-colour
// bus was the rare fleet order, not the family one.
const MINIBUS_SCHEMES = [
    [18, { lower: { h: 8,   s: 62, l: 38 }, upper: { h: 45,  s: 42, l: 88 } }],  // sealing wax red / cream
    [14, { lower: { h: 186, s: 42, l: 42 }, upper: { h: 50,  s: 22, l: 91 } }],  // turquoise / blue white
    [12, { lower: { h: 25,  s: 72, l: 50 }, upper: { h: 45,  s: 45, l: 89 } }],  // orange / cream
    [12, { lower: { h: 214, s: 44, l: 44 }, upper: { h: 45,  s: 38, l: 89 } }],  // dove blue / cream
    [10, { lower: { h: 140, s: 28, l: 33 }, upper: { h: 48,  s: 30, l: 89 } }],  // velvet green / pearl white
    [7,  { lower: { h: 210, s: 8,  l: 55 }, upper: { h: 0,   s: 0,  l: 91 } }],  // mouse grey / white
    [7,  { lower: { h: 45,  s: 16, l: 87 }, upper: { h: 45,  s: 16, l: 87 } }],  // pastel white, solid
];

const MINIBUS_CHROME = 'hsl(210, 8%, 80%)';
const MINIBUS_BADGE_BLUE = 'hsl(215, 55%, 42%)';

function generateVwMinibus() {
    const scheme = pickWeighted(MINIBUS_SCHEMES);
    const lower = hsl(scheme.lower.h, scheme.lower.s, scheme.lower.l);
    const upper = hsl(scheme.upper.h, scheme.upper.s, scheme.upper.l);

    const length = 14.1, width = 5.66, height = 6.33;
    const hw = width / 2;
    const beltZ = 3.55;
    const noseX = 6.75, tailX = -6.8;    // the bumpers take what is left
    const hl = length / 2;

    // The box, cut at the beltline. The nose leans forward a whisker as it
    // rises, the windscreen leans back a whisker, and both roof corners are
    // rounded off; the tail is flat. Shared points land exactly on beltZ so the
    // two halves meet without a seam.
    const noseBeltX = 7.0;
    const body = makeExtrudedProfile([
        { x: tailX + 0.2, z: 1.0 },
        { x: noseX - 0.05, z: 1.0 },
        { x: noseX + 0.3,  z: 2.2 },
        { x: noseBeltX,    z: beltZ },
        { x: tailX,        z: beltZ },
        { x: tailX,        z: 1.35 },
    ], -hw, hw, lower);
    body.push(...makeExtrudedProfile([
        { x: noseBeltX, z: beltZ },
        { x: 6.93,      z: 5.3 },     // windscreen top
        { x: 6.2,       z: 6.15 },
        { x: 5.7,       z: height },
        { x: -6.35,     z: height },
        { x: -6.68,     z: 6.13 },
        { x: tailX,     z: 5.0 },
        { x: tailX,     z: beltZ },
    ], -hw, hw, upper));

    // Bumpers, painted cream-white on almost every bus.
    body.push(...makeRectangularPrism(noseX + 0.05, -2.35, 1.5, hl - noseX - 0.05, 4.7, 0.42, MINIBUS_CHROME));
    body.push(...makeRectangularPrism(-hl, -2.35, 1.5, hl + tailX - 0.05, 4.7, 0.42, MINIBUS_CHROME));

    // The nose. Everything here lies on the lower front face, which runs
    // (noseX+0.3, 2.2) up to (noseBeltX, beltZ). The V is the upper colour
    // dipping below the belt; the roundel sits in its upper field with the
    // headlights just outside its arms. The depth sort orders coplanar polys by
    // average z (see polyDepth), so each layer that must paint over another is
    // centred a little higher than it -- the roundel above the V's average, the
    // blue heart a hair above the white ring -- which the real bus's face
    // conveniently agrees with.
    const trim = [];
    const noseAt = z => noseX + 0.3 + (noseBeltX - noseX - 0.3) * (z - 2.2) / (beltZ - 2.2);
    trim.push({ pts: [
        { x: noseAt(2.45) + 0.05, y: 0,     z: 2.45 },
        { x: noseAt(beltZ) + 0.05, y: 2.6,  z: beltZ },
        { x: noseAt(beltZ) + 0.05, y: -2.6, z: beltZ },
    ], color: upper });
    trim.push(makeDiscX(noseAt(3.28) + 0.10, 0, 3.28, 0.5, 1, MINIBUS_CHROME));
    trim.push(makeDiscX(noseAt(3.28) + 0.15, 0, 3.31, 0.34, 1, MINIBUS_BADGE_BLUE));
    for (const side of [-1, 1]) {
        trim.push(makeDiscX(noseAt(3.15) + 0.10, side * 2.05, 3.15, 0.3, 1, MINIBUS_CHROME));
    }

    // The bright trim spear riding the two-tone seam down each flank.
    trim.push(...makeFlankQuads(-6.85, 6.1, beltZ - 0.06, beltZ + 0.06, hw, MINIBUS_CHROME));

    // The tail: engine hatch a shade darker than the paint, the cooling louvres
    // above it, and a small taillight out by each edge. All face -x, so they can
    // only ever be seen from behind.
    const hatchShade = hsl(scheme.lower.h, scheme.lower.s, Math.max(0, scheme.lower.l - 7));
    const tailQuad = (y0, y1, z0, z1, color) => ({ pts: [
        { x: tailX - 0.04, y: y1, z: z0 },
        { x: tailX - 0.04, y: y0, z: z0 },
        { x: tailX - 0.04, y: y0, z: z1 },
        { x: tailX - 0.04, y: y1, z: z1 },
    ], color });
    trim.push(tailQuad(-1.35, 1.35, 1.7, 3.05, hatchShade));
    for (let i = 0; i < 3; i++) {
        trim.push(tailQuad(-1.1, 1.1, 3.18 + i * 0.13, 3.26 + i * 0.13, hatchShade));
    }
    for (const side of [-1, 1]) {
        trim.push(makeDiscX(tailX - 0.05, side * 2.25, 3.3, 0.17, -1, 'hsl(355, 70%, 40%)'));
    }

    // Glass. The split windscreen is two panes on the upper nose face; each
    // flank gets four panes with real pillars between them (at bus size the
    // gaps are wide enough to survive projection); the rear window is small.
    const glass = [];
    const wsAt = z => noseBeltX + (6.93 - noseBeltX) * (z - beltZ) / (5.3 - beltZ);
    for (const side of [-1, 1]) {
        const y0 = side * 0.18, y1 = side * 2.45;
        const pts = [
            { x: wsAt(3.95) + 0.04, y: y0, z: 3.95 },
            { x: wsAt(3.95) + 0.04, y: y1, z: 3.95 },
            { x: wsAt(5.12) + 0.04, y: y1, z: 5.12 },
            { x: wsAt(5.12) + 0.04, y: y0, z: 5.12 },
        ];
        glass.push({ pts: side < 0 ? pts.reverse() : pts, color: GLASS_COLOR });
    }
    const paneX0 = 6.2, paneX1 = -5.4, panes = 4, gap = 0.3;
    const paneW = (paneX0 - paneX1 - gap * (panes - 1)) / panes;
    for (const side of [-1, 1]) {
        const y = (hw + 0.03) * side;
        for (let i = 0; i < panes; i++) {
            const x0 = paneX0 - i * (paneW + gap);
            const pts = [
                { x: x0 - paneW, y, z: 3.85 },
                { x: x0,         y, z: 3.85 },
                { x: x0,         y, z: 5.45 },
                { x: x0 - paneW, y, z: 5.45 },
            ];
            glass.push({ pts: side > 0 ? pts.reverse() : pts, color: GLASS_COLOR });
        }
    }
    glass.push({ pts: [
        { x: tailX - 0.03, y:  1.45, z: 4.05 },
        { x: tailX - 0.03, y: -1.45, z: 4.05 },
        { x: tailX - 0.03, y: -1.45, z: 4.85 },
        { x: tailX - 0.03, y:  1.45, z: 4.85 },
    ], color: GLASS_COLOR });

    // Small wheels pushed to the corners -- the front axle is right behind the
    // nose; the engine hangs the tail out past the rears.
    const frontAxleX = 4.55, rearAxleX = frontAxleX - 7.875;
    const wheelPolys = makeWheel(1.0, 0.5);
    const wheels = [];
    for (const [x, steers] of [[frontAxleX, true], [rearAxleX, false]]) {
        for (const side of [-1, 1]) {
            wheels.push({ x, y: 2.4 * side, steers, polys: wheelPolys });
        }
    }

    return {
        type: 'vwMinibus',
        width, length, height, color: lower,
        body, glass, wheels, trim,
        flat: makeVehicleFootprint(width, length, lower),
    };
}

registerVehicle('vwMinibus', { generate: generateVwMinibus, weight: 0.1 });
