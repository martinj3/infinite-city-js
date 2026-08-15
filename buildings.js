// --- Building generation (all units in feet) ---

function hsl(h, s, l) {
    return `hsl(${Math.round(h)}, ${Math.round(Math.max(0, Math.min(100, s)))}%, ${Math.round(Math.max(0, Math.min(100, l)))}%)`;
}

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

const ROOF_COLOR = 'hsl(20, 30%, 35%)';
const WINDOW_COLOR = 'hsl(210, 50%, 75%)';

// Creates a gable roof on top of a rectangular prism.
// ox, oy, oz: origin of the prism; w, l, h: prism dimensions.
// lengthwise: if true, ridge runs along X; if false, ridge runs along Y.
// houseColor: color for gable-end triangles; roof slopes are brown.
function makeGableRoof(ox, oy, oz, w, l, h, lengthwise, houseColor) {
    const p = (x, y, z) => ({x, y, z});
    const topZ = oz + h;

    if (lengthwise) {
        // Ridge runs along X axis (width), gable ends on west and east
        const gableH = (0.2 + Math.random() * 0.2) * l;
        const ry = oy + l / 2, rz = topZ + gableH;
        return [
            { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(ox+w,ry,rz), p(ox,ry,rz)], color: ROOF_COLOR },
            { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(ox,ry,rz), p(ox+w,ry,rz)], color: ROOF_COLOR },
            { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(ox,ry,rz)], color: houseColor },
            { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(ox+w,ry,rz)], color: houseColor },
        ];
    } else {
        // Ridge runs along Y axis (length), gable ends on north and south
        const gableH = (0.2 + Math.random() * 0.2) * w;
        const rx = ox + w / 2, rz = topZ + gableH;
        return [
            { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(rx,oy,rz), p(rx,oy+l,rz)], color: ROOF_COLOR },
            { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(rx,oy+l,rz), p(rx,oy,rz)], color: ROOF_COLOR },
            { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(rx,oy,rz)], color: houseColor },
            { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(rx,oy+l,rz)], color: houseColor },
        ];
    }
}

// Creates a hip roof on top of a rectangular prism.
// All four faces are sloped (roof-colored). The ridge is inset from each end
// so that the hip slope matches the main slope pitch. If the prism is square
// (or the cross-dimension >= the along-dimension), it becomes a pyramid.
function makeHipRoof(ox, oy, oz, w, l, h, lengthwise, houseColor) {
    const p = (x, y, z) => ({x, y, z});
    const topZ = oz + h;

    if (lengthwise) {
        const roofH = (0.25 + Math.random() * 0.25) * l;
        const inset = l / 2;
        const ry = oy + l / 2, rz = topZ + roofH;
        if (w <= l) {
            // Pyramid
            return [
                { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(ox+w/2,ry,rz)], color: ROOF_COLOR },
                { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(ox+w/2,ry,rz)], color: ROOF_COLOR },
                { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(ox+w/2,ry,rz)], color: ROOF_COLOR },
                { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(ox+w/2,ry,rz)], color: ROOF_COLOR },
            ];
        }
        return [
            { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(ox+w-inset,ry,rz), p(ox+inset,ry,rz)], color: ROOF_COLOR },
            { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(ox+inset,ry,rz), p(ox+w-inset,ry,rz)], color: ROOF_COLOR },
            { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(ox+inset,ry,rz)], color: ROOF_COLOR },
            { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(ox+w-inset,ry,rz)], color: ROOF_COLOR },
        ];
    } else {
        const roofH = (0.25 + Math.random() * 0.25) * w;
        const inset = w / 2;
        const rx = ox + w / 2, rz = topZ + roofH;
        if (l <= w) {
            // Pyramid
            return [
                { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(rx,oy+l/2,rz)], color: ROOF_COLOR },
                { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(rx,oy+l/2,rz)], color: ROOF_COLOR },
                { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(rx,oy+l/2,rz)], color: ROOF_COLOR },
                { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(rx,oy+l/2,rz)], color: ROOF_COLOR },
            ];
        }
        return [
            { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(rx,oy+inset,rz), p(rx,oy+l-inset,rz)], color: ROOF_COLOR },
            { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(rx,oy+l-inset,rz), p(rx,oy+inset,rz)], color: ROOF_COLOR },
            { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(rx,oy+inset,rz)], color: ROOF_COLOR },
            { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(rx,oy+l-inset,rz)], color: ROOF_COLOR },
        ];
    }
}

// Generate window polys for all 4 walls of a prism.
// exclusions: per-wall array of {start, end} zones to avoid (e.g. door).
// Returns array of polygon objects.
function generatePrismWindows(ox, oy, w, l, exclusions) {
    const p = (x, y, z) => ({x, y, z});
    const eps = 0.05;
    const winTop = 7 + Math.random();            // 7-8ft (uniform per prism)
    const winH = 3 + Math.random() * 2;          // 3-5ft (uniform per prism)
    const winBottom = winTop - winH;
    const stdW = 3 + Math.random() * 5;          // 3-8ft standard width
    const gap = 4;                                // space between windows
    const margin = 2;                             // min distance from wall edge

    const walls = [
        { lo: ox, hi: ox + w, excl: exclusions.north || [],
          poly: (a, b) => ({ pts: [p(a,oy-eps,winBottom), p(b,oy-eps,winBottom), p(b,oy-eps,winTop), p(a,oy-eps,winTop)], color: WINDOW_COLOR }) },
        { lo: ox, hi: ox + w, excl: exclusions.south || [],
          poly: (a, b) => ({ pts: [p(b,oy+l+eps,winBottom), p(a,oy+l+eps,winBottom), p(a,oy+l+eps,winTop), p(b,oy+l+eps,winTop)], color: WINDOW_COLOR }) },
        { lo: oy, hi: oy + l, excl: exclusions.west || [],
          poly: (a, b) => ({ pts: [p(ox-eps,b,winBottom), p(ox-eps,a,winBottom), p(ox-eps,a,winTop), p(ox-eps,b,winTop)], color: WINDOW_COLOR }) },
        { lo: oy, hi: oy + l, excl: exclusions.east || [],
          poly: (a, b) => ({ pts: [p(ox+w+eps,a,winBottom), p(ox+w+eps,b,winBottom), p(ox+w+eps,b,winTop), p(ox+w+eps,a,winTop)], color: WINDOW_COLOR }) },
    ];

    const polys = [];
    for (const wall of walls) {
        let pos = wall.lo + margin;
        while (pos + 3 <= wall.hi - margin) {
            let winW = stdW;
            if (Math.random() < 0.25) {
                winW = Math.max(3, Math.min(8, stdW + (Math.random() - 0.5) * 4));
            }
            if (pos + winW > wall.hi - margin) break;

            const blocked = wall.excl.find(e => pos < e.end && pos + winW > e.start);
            if (blocked) {
                pos = blocked.end + gap;
                continue;
            }

            polys.push(wall.poly(pos, pos + winW));
            pos += winW + gap;
        }
    }
    return polys;
}

// Main prism size, as a fraction of its lot, with a hard floor in feet.
// On a 70x70 lot this gives roughly 20-60ft of street frontage by 20-50ft deep.
const HOUSE_MIN_DIM = 20;
const HOUSE_WIDTH_FRAC = [0.28, 0.85];  // along the street
const HOUSE_DEPTH_FRAC = [0.28, 0.71];  // away from the street

function lotFraction(lotDim, [minFrac, maxFrac], limit) {
    const size = lotDim * (minFrac + Math.random() * (maxFrac - minFrac));
    return Math.min(limit, Math.max(HOUSE_MIN_DIM, size));
}

// Is this prism entirely inside the lot footprint?
function prismInLot(p, lotWidth, lotDepth) {
    const eps = 0.1;
    return p.x >= -eps && p.y >= -eps &&
           p.x + p.w <= lotWidth + eps && p.y + p.l <= lotDepth + eps;
}

// Generate a random house made of 1-3 rectangular prisms, placed within a lot.
// Lot coordinates: x runs 0..lotWidth along the street, y runs 0..lotDepth away
// from it, so y=0 is the street-facing edge of the lot.
// setbackDist: distance from the street edge of the lot to the front of the house;
// usually the same for every house along a given street.
// facingAngle: rotation in radians applied to all geometry, about the lot center
// (0 = the street lies toward -y).
// Returns a Drawable tree: { polys, children: [child Drawables...] }
// The root has no polys; children are the main prism and wings.
// Details (doors) are grandchildren of their prism.
function generateHouse(facingAngle = 0, lotWidth = 70, lotDepth = 70, setbackDist = 20) {
    const color = pickHouseColor();
    const lengthwise = Math.random() < 0.5;
    const useHipRoof = Math.random() < 0.5;
    const addRoof = useHipRoof ? makeHipRoof : makeGableRoof;

    const numPrisms = 1 + Math.floor(Math.random() * 3); // 1-3
    const children = [];
    const bounds = []; // track prism bounds for overlap checks

    // Main prism: centered along the lot width, its front face at the setback
    const w1 = lotFraction(lotWidth, HOUSE_WIDTH_FRAC, lotWidth);
    const l1 = lotFraction(lotDepth, HOUSE_DEPTH_FRAC, Math.max(0, lotDepth - setbackDist));
    const h1 = 8.5 + Math.random() * 1;  // ~9ft
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
    });

    const mainDetails = { polys: [doorPoly, ...mainWindows], children: [] };
    children.push({ polys: mainPolys, children: [mainDetails] });

    // Additional wing prisms, attached to a random side of the main prism
    // (not north — that's the front door side)
    for (let i = 1; i < numPrisms; i++) {
        const w = 12 + Math.random() * 15;   // 12-27ft
        const l = 12 + Math.random() * 15;
        const h = 8.5 + Math.random() * 1;

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
                const wingWindows = generatePrismWindows(ox, oy, w, l, {});
                const wingDetails = { polys: wingWindows, children: [] };
                children.push({ polys: wingPolys, children: [wingDetails] });
                bounds.push(candidate);
                break;
            }
        }
    }

    const house = { polys: [], children };

    // Rotate all geometry around the center of the lot, so the lot itself stays put
    if (facingAngle !== 0) {
        rotateDrawable(house, facingAngle, lotWidth / 2, lotDepth / 2);
    }

    return house;
}
