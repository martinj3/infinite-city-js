// --- Low-rise office generation (all units in feet) ---
// The one to six storey building that fills most of a commercial street: a
// professional building, a medical arts block, a strip of suites, an office
// plaza. Shaped like a house -- a main prism on the building line with up to two
// wings hung off it -- and different in the three ways that actually read at a
// glance: it is flat-roofed with a parapet, its glazing runs in wide bands
// instead of punched openings, and its second storey often carries a sign.
//
// The parts shared with houses and churches (windows, flat roofs, lot fitting)
// live in buildingUtils.js; this file is only what makes an office an office.

// Weighted wall palette: [weight, h, s, l]. Commercial buildings are mostly
// masonry and precast in the colours those come in, which is a narrower and
// duller range than a house's paint -- there is no such thing as a pink office
// park -- with a bronze-and-glass minority that is the whole look of the era
// these buildings mostly date from.
const OFFICE_COLORS = [
    // Precast, stucco and light masonry (the bulk of them)
    [16, 38,  18, 80],   // beige precast
    [13, 40,  25, 71],   // tan stucco
    [11, 45,  10, 86],   // off-white
    [10, 35,  28, 63],   // buff sandstone
    // Concrete and grey masonry
    [12, 210,  4, 68],   // light grey concrete
    [9,  205,  6, 55],   // medium grey
    [5,  215,  7, 40],   // charcoal concrete
    // Brick, the other half of every low-rise main street
    [11, 8,   38, 44],   // red brick
    [7,  18,  30, 38],   // brown brick
    [5,  15,  35, 55],   // light brick
    // Bronze and blue-grey glass curtain wall
    [5,  205, 14, 46],   // blue-grey
    [4,  30,  22, 32],   // dark bronze
    // Muted colour, occasionally
    [3,  150, 14, 45],   // sage
    [3,  20,  40, 48],   // terracotta
];

// The sign board itself: dark and saturated, because the lettering on it is
// white and this is what makes it legible at a distance. Distinctness from the
// wall is enforced separately (see pickSignColor).
const SIGN_COLORS = [
    [10, 218, 45, 28],   // navy
    [8,  355, 50, 33],   // deep red
    [6,  150, 40, 24],   // forest green
    [6,  0,    0, 20],   // near-black
    [5,  190, 45, 27],   // teal
    [4,  345, 40, 26],   // burgundy
    [4,  265, 30, 32],   // aubergine
    [3,  30,  55, 34],   // dark bronze
];

const SIGN_INK = 'hsl(45, 25%, 94%)';

// The names on those signs: the tenants and the buildings themselves. A sign is
// one line across the front of the building, so a name twice as long is drawn
// half as tall -- these are kept to about twenty characters for the same reason
// a moving company's is (see vehicles/boxTruck.js).
const OFFICE_NAMES = [
    'Ridgeline Financial', 'Halstead & Marks', 'Vantage Point Plaza',
    'Kestrel Insurance', 'Bayside Dental', 'Northgate Professional',
    'Ellis Park Offices', 'Summit Title Company', 'Whitfield Associates',
    'Cobblestone Commons', 'Arbor Lane Suites', 'Delmar Business Park',
    'Pinecrest Realty', 'Lantern Square', 'Hawthorne Legal Group',
    'Stonebridge Center', 'Quill & Ledger', 'Fairmount Optical',
    'Crescent Tax Service', 'Beacon Hill Offices', 'Talbot Orthodontics',
    'Windermere Partners', 'Grant Street Plaza', 'Ironside Engineering',
    'Maple Court Center', 'Ashford Accounting', 'Sable Creek Clinic',
    'The Wexler Building', 'Nightingale Health', 'Parkview Chiropractic',
    'Copperfield Suites', 'Linden Row Offices', 'Harlow Design Group',
    'Meridian Title', 'Foxglove Veterinary', 'Sterling Court',
    'Abbott & Reyes', 'Cedar Point Plaza', 'Brayton Medical Arts',
    'Union Row Center', 'Larkspur Wellness', 'Thornton Surveying',
    'Piedmont Staffing', 'The Chandler Group', 'Oakhaven Offices',
    'Sandpiper Travel', 'Kingsley Architects', 'Verdant Landscaping',
    'Bellweather Bank', 'Anchor Point Realty',
];

// Main prism size, as a fraction of its lot. Offices cover far more of their lot
// than houses do: there is no back yard to leave, only parking, and that goes to
// the side or behind.
const OFFICE_MIN_DIM = 28;
const OFFICE_SIZE_FRAC = [0.40, 0.95];

const OFFICE_STOREY_HEIGHT = [11, 13];   // ft, rolled once per building
const OFFICE_PARAPET = [2.0, 3.5];       // how far the wall stands above the deck

// How many storeys, from one up to six. Cut short by what the footprint can
// carry (see maxOfficeFloors), with the weights renormalized over what is left --
// the same trick pickFloors uses for a house's wings.
const OFFICE_FLOOR_WEIGHTS = [0.28, 0.28, 0.18, 0.12, 0.08, 0.06];

// A tall building on a small footprint is a tower, not a low-rise, so the storey
// count is capped by the floor plate: roughly one storey per 1200 sq ft, which
// lets a 60x70 block reach three and only a full-lot footprint reach six.
function maxOfficeFloors(w, l) {
    return Math.max(1, Math.min(OFFICE_FLOOR_WEIGHTS.length, Math.round(w * l / 1200)));
}

function pickOfficeFloors(max) {
    max = Math.max(1, Math.min(max, OFFICE_FLOOR_WEIGHTS.length));
    let total = 0;
    for (let i = 0; i < max; i++) total += OFFICE_FLOOR_WEIGHTS[i];
    let r = Math.random() * total;
    for (let i = 0; i < max; i++) {
        r -= OFFICE_FLOOR_WEIGHTS[i];
        if (r <= 0) return i + 1;
    }
    return max;
}

// Pick from a [weight, h, s, l] palette, keeping the components so shades of the
// same paint (the parapet's inner face, the roof deck) can be stepped off it.
function pickPaletteColor(palette, jitter = [10, 10, 8]) {
    let r = Math.random() * palette.reduce((sum, e) => sum + e[0], 0);
    let e = palette[palette.length - 1];
    for (const c of palette) { r -= c[0]; if (r <= 0) { e = c; break; } }
    return {
        h: e[1] + (Math.random() - 0.5) * jitter[0],
        s: e[2] + (Math.random() - 0.5) * jitter[1],
        l: e[3] + (Math.random() - 0.5) * jitter[2],
    };
}

// A sign has to be legible against the wall it is bolted to as well as against
// its own lettering, and the palettes overlap at the dark end -- a navy sign on a
// bronze wall is a sign nobody can see. Rerolling is enough: the walls that
// collide are a small minority of the table.
function pickSignColor(wall) {
    for (let i = 0; i < 6; i++) {
        const c = pickPaletteColor(SIGN_COLORS, [12, 10, 6]);
        if (Math.abs(c.l - wall.l) > 16) return c;
    }
    return { h: 0, s: 0, l: 20 };
}

// Office glazing: wide panes with a narrow pier between them, set high in a tall
// storey. Punched three-foot openings are what makes a house look like a house.
const OFFICE_WINDOWS = { top: [9, 10.2], height: [5.5, 7], width: [8, 15], gap: 3, margin: 3.5 };

// Rooftop plant, which is most of what there is to see on a flat roof from up
// here. Kept as a detail child of the prism so it always paints after the deck:
// the deck is one polygon sorting at the middle of the roof, so a unit at the far
// end would otherwise be painted over by it.
function makeRoofUnits(ox, oy, deckZ, w, l, color) {
    const polys = [];
    const margin = 4;
    if (w < 2 * margin + 8 || l < 2 * margin + 6) return polys;
    const n = Math.max(1, Math.min(3, Math.round(w * l / 3000)));
    const placed = [];
    for (let i = 0; i < n; i++) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const uw = frand(6, Math.min(14, w - 2 * margin));
            const ul = frand(5, Math.min(10, l - 2 * margin));
            const box = {
                x: ox + margin + Math.random() * (w - 2 * margin - uw), w: uw,
                y: oy + margin + Math.random() * (l - 2 * margin - ul), l: ul,
                z: deckZ, h: frand(3, 5),
            };
            if (placed.some(b => prismsOverlap(b, box))) continue;
            polys.push(...makeRectangularPrism(box.x, box.y, box.z, box.w, box.l, box.h, color));
            placed.push(box);
            break;
        }
    }
    return polys;
}

// Generate a low-rise office: a main prism plus up to two wings, one to six
// storeys, flat-roofed, on a lot 70-150ft wide and 70-130ft deep.
// This is the office implementation of the building interface (see
// buildingUtils.js): lot is { width, depth, setback } and the building comes back
// in lot-local coordinates, x along the street and y away from it, so y = 0 is
// the street edge and the front faces -y.
// Returns a Drawable tree: { polys, children: [...] }, one child per prism, each
// with its glass, doors, signage and rooftop plant as a child of its own.
function generateOffice({ width: lotWidth = 100, depth: lotDepth = 100, setback: setbackDist = 15 } = {}) {
    const pal = pickPaletteColor(OFFICE_COLORS);
    const color = hsl(pal.h, pal.s, pal.l);
    // The parapet's inner face is the same wall in its own shade, and the deck is
    // the grey of a membrane or gravel roof whatever the walls are made of.
    const inner = hsl(pal.h, pal.s, pal.l - 10);
    const deckColor = hsl(205, 5, frand(34, 46));
    const unitColor = hsl(205, 4, frand(48, 60));
    const storeyH = frand(...OFFICE_STOREY_HEIGHT);
    const parapet = frand(...OFFICE_PARAPET);

    const children = [];
    const bounds = [];

    // Main prism: centred along the lot width, its front on the building line
    const w1 = lotFraction(lotWidth, OFFICE_SIZE_FRAC, lotWidth, OFFICE_MIN_DIM);
    const l1 = lotFraction(lotDepth, OFFICE_SIZE_FRAC, Math.max(0, lotDepth - setbackDist), OFFICE_MIN_DIM);
    const floors1 = pickOfficeFloors(maxOfficeFloors(w1, l1));
    const deck1 = storeyH * floors1;
    const x1 = (lotWidth - w1) / 2;
    const y1 = setbackDist;
    const mainPolys = [
        ...makeRectangularPrism(x1, y1, 0, w1, l1, deck1 + parapet, color, false),
        ...makeFlatRoof(x1, y1, deck1, w1, l1, parapet, deckColor, inner),
    ];
    bounds.push({ x: x1, y: y1, z: 0, w: w1, l: l1, h: deck1 + parapet, floors: floors1 });

    // Wings, on any side including the street front -- an entrance pavilion or a
    // showroom wing does stand ahead of the building line, and one that does is
    // what can cost this office its sign. A wing is never taller than the block it
    // hangs off, and only fits if the lot has the room.
    const wings = [];
    const numPrisms = 1 + Math.floor(Math.random() * 3);
    for (let i = 1; i < numPrisms; i++) {
        const w = Math.max(16, w1 * frand(0.25, 0.60));
        const l = Math.max(16, l1 * frand(0.30, 0.70));
        const floors = pickOfficeFloors(Math.min(floors1, maxOfficeFloors(w, l)));
        const h = storeyH * floors;

        for (let attempt = 0; attempt < 8; attempt++) {
            // South and the two flanks are where a wing usually goes; the front
            // is the rarer case, and needs a deep enough setback to stand in.
            const r = Math.random();
            let ox, oy;
            if (r < 0.35) {                       // south, out the back
                ox = x1 + Math.random() * Math.max(0, w1 - w);
                oy = y1 + l1;
            } else if (r < 0.60) {                // east flank
                ox = x1 + w1;
                oy = y1 + Math.random() * Math.max(0, l1 - l);
            } else if (r < 0.85) {                // west flank
                ox = x1 - w;
                oy = y1 + Math.random() * Math.max(0, l1 - l);
            } else {                              // ahead of the building line
                ox = x1 + Math.random() * Math.max(0, w1 - w);
                oy = y1 - l;
            }

            const candidate = { x: ox, y: oy, z: 0, w, l, h: h + parapet, floors };
            if (!prismInLot(candidate, lotWidth, lotDepth)) continue;
            if (bounds.some(b => prismsOverlap(b, candidate))) continue;
            const polys = [
                ...makeRectangularPrism(ox, oy, 0, w, l, h + parapet, color, false),
                ...makeFlatRoof(ox, oy, h, w, l, parapet, deckColor, inner),
            ];
            candidate.details = [
                ...generatePrismWindows(ox, oy, w, l, {}, floors, storeyH, OFFICE_WINDOWS),
                ...makeRoofUnits(ox, oy, h, w, l, unitColor),
            ];
            children.push({ polys, children: [{ polys: candidate.details, children: [] }] });
            bounds.push(candidate);
            wings.push(candidate);
            break;
        }
    }

    // The sign: a board across the second storey of the front wall, which is where
    // a building this size puts its name. It needs a second storey to sit on and a
    // clear view of the street, and gets one half the time it can have both.
    const eps = 0.05;
    const signW = w1 * frand(0.55, 0.85);
    const signX0 = x1 + (w1 - signW) / 2, signX1 = signX0 + signW;
    const signZ0 = storeyH * frand(1.22, 1.30);
    const signZ1 = storeyH * frand(1.78, 1.86);
    const blockedFront = wings.some(b => b.y < y1 - 0.1 && b.h > signZ0 &&
                                         b.x < signX1 && b.x + b.w > signX0);
    const hasSign = floors1 >= 2 && !blockedFront && Math.random() < 0.5;

    const frontDetails = [];
    if (hasSign) {
        const sign = pickSignColor(pal);
        frontDetails.push(makeFrontPanel(signX0, signX1, y1 - 2 * eps, signZ0, signZ1,
            hsl(sign.h, sign.s, sign.l)));
        // The lettering stands a whisker prouder of the board than the board does
        // of the wall, so it sorts after it however the camera turns -- an outward
        // push is toward the camera exactly when the face is visible.
        const pad = signW * 0.04, band = (signZ1 - signZ0) * 0.18;
        frontDetails.push(makeFrontPanel(signX0 + pad, signX1 - pad, y1 - 3 * eps,
            signZ0 + band, signZ1 - band, SIGN_INK,
            OFFICE_NAMES[Math.floor(Math.random() * OFFICE_NAMES.length)]));
    }

    // The entrance, on the front of whichever prism actually faces the street
    // there: a wing standing ahead of the building line takes the door with it.
    const doorW = frand(7, 11), doorH = frand(8.5, 10);
    let doorX = x1 + (w1 - doorW) / 2, doorY = y1;
    const pavilion = wings.find(b => b.y < y1 - 0.1 &&
                                     b.x < doorX + doorW && b.x + b.w > doorX);
    if (pavilion) {
        doorX = pavilion.x + (pavilion.w - doorW) / 2;
        doorY = pavilion.y;
    }
    // The door belongs to the prism it stands on, not to the main block: a
    // pavilion is a sibling drawable, drawn after the main prism because it is
    // nearer, so a door left behind on the main prism's details would be painted
    // over by the very wing that carries it.
    const entrance = pavilion ? pavilion.details : frontDetails;
    const canopyL = frand(3.5, 5);
    entrance.push({ pts: [
        { x: doorX,         y: doorY - eps, z: 0 },
        { x: doorX + doorW, y: doorY - eps, z: 0 },
        { x: doorX + doorW, y: doorY - eps, z: doorH },
        { x: doorX,         y: doorY - eps, z: doorH },
    ], color: hsl(205, 30, 40) });
    // A canopy over it, standing out from the wall. Its footprint is ahead of the
    // wall's, so it sorts after whichever face it hangs on and paints over it.
    entrance.push(...makeRectangularPrism(doorX - 1.5, doorY - canopyL, doorH,
        doorW + 3, canopyL, 0.7, inner));

    const mainDetails = [
        ...generatePrismWindows(x1, y1, w1, l1, {
            north: [
                ...(pavilion ? [] : [{ start: doorX - 1, end: doorX + doorW + 1 }]),
                ...(hasSign ? [{ start: signX0 - 1, end: signX1 + 1, floor: 1 }] : []),
            ],
        }, floors1, storeyH, OFFICE_WINDOWS),
        ...makeRoofUnits(x1, y1, deck1, w1, l1, unitColor),
    ];
    children.unshift({ polys: mainPolys, children: [{ polys: [...mainDetails, ...frontDetails], children: [] }] });

    return { polys: [], children };
}

registerBuilding('office', { generate: generateOffice });
