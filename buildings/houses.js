// --- House generation (all units in feet) ---
// The parts shared with every other kind of building (roofs, windows, lot fitting)
// live in buildingUtils.js; this file is only what makes a house a house.

// Weighted house color palette — realistic American residential colors.
// Each entry: [weight, h, s, l]
const HOUSE_COLORS = [
    // Whites and off-whites (very common)
    [15, 40,  10, 92],   // warm white
    [12, 30,   8, 88],   // antique white
    [10, 50,   5, 85],   // cool white
    // Beiges and tans (very common)
    [14, 35,  30, 72],   // beige
    [12, 38,  25, 65],   // tan
    [10, 33,  35, 60],   // warm sand
    // Grays (common)
    [10, 210, 5,  60],   // medium gray
    [8,  200, 8,  72],   // light gray
    [6,  220, 6,  45],   // charcoal gray
    // Browns (fairly common)
    [6,  25,  35, 40],   // chocolate brown
    [5,  30,  30, 50],   // warm brown
    [4,  20,  40, 35],   // dark brown
    // Blues (fairly common)
    [6,  210, 30, 55],   // slate blue
    [5,  205, 40, 65],   // light blue
    [4,  215, 35, 40],   // navy/dark blue
    // Dark red / brick (less common)
    [5,  5,   45, 38],   // brick red
    [4,  0,   40, 32],   // deep red
    // Light yellow / cream (less common)
    [5,  48,  50, 78],   // pale yellow
    [4,  45,  45, 70],   // cream
    // Dark green (rare)
    [2,  150, 30, 32],   // forest green
    [2,  140, 25, 38],   // sage green
    // Pink (rare)
    [1,  340, 30, 70],   // dusty rose
    [1,  350, 25, 65],   // muted pink
];

// Precompute cumulative weights for weighted random selection
const HOUSE_COLOR_TOTAL = HOUSE_COLORS.reduce((s, c) => s + c[0], 0);

function pickHouseColor() {
    let r = Math.random() * HOUSE_COLOR_TOTAL;
    for (const [weight, h, s, l] of HOUSE_COLORS) {
        r -= weight;
        if (r <= 0) {
            // Small random adjustment for variety
            return hsl(
                h + (Math.random() - 0.5) * 10,
                s + (Math.random() - 0.5) * 10,
                l + (Math.random() - 0.5) * 8
            );
        }
    }
    const last = HOUSE_COLORS[HOUSE_COLORS.length - 1];
    return hsl(last[1], last[2], last[3]);
}

// Main prism size, as a fraction of its lot, with a hard floor in feet.
// On a 70x70 lot this gives roughly 20-60ft of street frontage by 20-50ft deep.
const HOUSE_MIN_DIM = 20;
const HOUSE_WIDTH_FRAC = [0.28, 0.85];  // along the street
const HOUSE_DEPTH_FRAC = [0.28, 0.71];  // away from the street

// A hip roof rises from all four walls at once, so its peak grows with the whole
// footprint: on a big house that is a pyramid of Giza, not a roof. Past this size
// a house gets a gable, whose ridge only has to span the shorter way across.
const HIP_ROOF_MAX_DIM = 50;

// How many storeys a house has: index 0 is one storey, index 1 is two, and so on.
// Most houses are single storey.
const HOUSE_FLOOR_WEIGHTS = [0.60, 0.37, 0.03];
const HOUSE_STOREY_HEIGHT = [8.5, 9.5];  // ft, rolled once per house so floors line up

// Pick a storey count, never more than max. Capping renormalizes the weights over
// what is left, so a wing under a two-storey main prism is still twice as likely
// to be one storey as two -- the same shape of preference, just cut short.
function pickFloors(max = HOUSE_FLOOR_WEIGHTS.length) {
    max = Math.max(1, Math.min(max, HOUSE_FLOOR_WEIGHTS.length));
    let total = 0;
    for (let i = 0; i < max; i++) total += HOUSE_FLOOR_WEIGHTS[i];
    let r = Math.random() * total;
    for (let i = 0; i < max; i++) {
        r -= HOUSE_FLOOR_WEIGHTS[i];
        if (r <= 0) return i + 1;
    }
    return max;
}

// Generate a random house made of 1-3 rectangular prisms, one to three storeys
// tall (see HOUSE_FLOOR_WEIGHTS), placed within a lot.
// This is the house implementation of the building interface (see buildingUtils.js):
// lot is { width, depth, setback }, and the house comes back in lot-local
// coordinates -- x runs 0..width along the street, y runs 0..depth away from it,
// so y=0 is the street-facing edge and the front door faces -y. Whoever owns the
// lot rotates and translates it into the world.
// setback: distance from the street edge of the lot to the front of the house;
// usually the same for every house along a given street.
// Returns a Drawable tree: { polys, children: [child Drawables...] }
// The root has no polys; children are the main prism and wings.
// Details (doors) are grandchildren of their prism.
function generateHouse({ width: lotWidth = 70, depth: lotDepth = 70, setback: setbackDist = 20 } = {}) {
    const color = pickHouseColor();
    // One storey height for the whole house, so a wing's floors and windows line
    // up with the main prism's instead of sitting a few inches off.
    const storeyH = HOUSE_STOREY_HEIGHT[0] + Math.random() * (HOUSE_STOREY_HEIGHT[1] - HOUSE_STOREY_HEIGHT[0]);

    const numPrisms = 1 + Math.floor(Math.random() * 3); // 1-3
    const children = [];
    const bounds = []; // track prism bounds for overlap checks

    // Main prism: centered along the lot width, its front face at the setback
    const w1 = lotFraction(lotWidth, HOUSE_WIDTH_FRAC, lotWidth, HOUSE_MIN_DIM);
    const l1 = lotFraction(lotDepth, HOUSE_DEPTH_FRAC, Math.max(0, lotDepth - setbackDist), HOUSE_MIN_DIM);
    const floors1 = pickFloors();
    const h1 = storeyH * floors1;

    // Roof style depends on how big the main prism turned out, so it is chosen
    // here rather than up front. Both roofs are built by spanning one axis and
    // sloping toward the other, and their height scales with the distance they
    // span, so a gable always runs its ridge the long way: gable ends go on the
    // shorter pair of walls, keeping the triangles low. Wings copy both choices,
    // so a house has one roof style and one ridge direction throughout.
    const useHipRoof = w1 <= HIP_ROOF_MAX_DIM && l1 <= HIP_ROOF_MAX_DIM && Math.random() < 0.5;
    const lengthwise = useHipRoof ? Math.random() < 0.5 : l1 <= w1;
    const addRoof = useHipRoof ? makeHipRoof : makeGableRoof;
    const x1 = (lotWidth - w1) / 2;
    const y1 = setbackDist;
    const mainPolys = [
        ...makeRectangularPrism(x1, y1, 0, w1, l1, h1, color, false),
        ...addRoof(x1, y1, 0, w1, l1, h1, lengthwise, color),
    ];
    bounds.push({ x: x1, y: y1, z: 0, w: w1, l: l1, h: h1 });

    // Front door on the north face (facing -y, toward the street) of the main prism
    const doorW = 3 + Math.random() * 2;    // 3-5ft
    const doorH = 7 + Math.random() * 2;    // 7-9ft
    const doorX = x1 + (w1 - doorW) / 2;    // centered on main prism
    const eps = 0.05;
    const doorPoly = {
        pts: [
            {x: doorX,         y: y1 - eps, z: 0},
            {x: doorX + doorW, y: y1 - eps, z: 0},
            {x: doorX + doorW, y: y1 - eps, z: doorH},
            {x: doorX,         y: y1 - eps, z: doorH},
        ],
        color: ROOF_COLOR,
    };

    // Windows for the main prism (door is an exclusion on the north wall)
    const mainWindows = generatePrismWindows(x1, y1, w1, l1, {
        north: [{ start: doorX - 1, end: doorX + doorW + 1 }],
    }, floors1, storeyH);

    const mainDetails = { polys: [doorPoly, ...mainWindows], children: [] };
    children.push({ polys: mainPolys, children: [mainDetails] });

    // Additional wing prisms, attached to a random side of the main prism
    // (not north — that's the front door side)
    for (let i = 1; i < numPrisms; i++) {
        const w = 12 + Math.random() * 15;   // 12-27ft
        const l = 12 + Math.random() * 15;
        // A wing may be shorter than the house it hangs off, never taller
        const wingFloors = pickFloors(floors1);
        const h = storeyH * wingFloors;

        // Try up to 8 random placements to find one that fits the lot without overlap
        for (let attempt = 0; attempt < 8; attempt++) {
            const side = Math.floor(Math.random() * 3); // 0-2: east, west, south
            let ox, oy;
            switch (side) {
                case 0: // East side
                    ox = x1 + w1;
                    oy = y1 + Math.random() * Math.max(0, l1 - l);
                    break;
                case 1: // West side
                    ox = x1 - w;
                    oy = y1 + Math.random() * Math.max(0, l1 - l);
                    break;
                case 2: // South side
                    ox = x1 + Math.random() * Math.max(0, w1 - w);
                    oy = y1 + l1;
                    break;
            }

            const candidate = { x: ox, y: oy, z: 0, w, l, h };
            if (!prismInLot(candidate, lotWidth, lotDepth)) continue;
            if (!bounds.some(b => prismsOverlap(b, candidate))) {
                const wingPolys = [
                    ...makeRectangularPrism(ox, oy, 0, w, l, h, color, false),
                    ...addRoof(ox, oy, 0, w, l, h, lengthwise, color),
                ];
                const wingWindows = generatePrismWindows(ox, oy, w, l, {}, wingFloors, storeyH);
                const wingDetails = { polys: wingWindows, children: [] };
                children.push({ polys: wingPolys, children: [wingDetails] });
                bounds.push(candidate);
                break;
            }
        }
    }

    return { polys: [], children };
}

registerBuilding('house', { generate: generateHouse });
