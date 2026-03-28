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

// Creates a rectangular prism at position (ox, oy, oz) with dimensions w x l x h.
// color is a single CSS color string. All faces get the same color;
// shading/lighting will be applied at draw time.
// Each face: { pts: [{x,y,z}, ...], color: string }
function makeRectangularPrism(ox, oy, oz, w, l, h, color, includeTop = true) {
    // Each face gets its own vertex objects (no sharing) so transforms are safe.
    const p = (x, y, z) => ({x, y, z});
    const faces = [];
    if (includeTop) {
        faces.push({ pts: [p(ox,oy,oz+h), p(ox+w,oy,oz+h), p(ox+w,oy+l,oz+h), p(ox,oy+l,oz+h)], color });
    }
    faces.push(
        // North face (y=oy, facing -y)
        { pts: [p(ox,oy,oz), p(ox+w,oy,oz), p(ox+w,oy,oz+h), p(ox,oy,oz+h)], color },
        // South face (y=oy+l, facing +y)
        { pts: [p(ox+w,oy+l,oz), p(ox,oy+l,oz), p(ox,oy+l,oz+h), p(ox+w,oy+l,oz+h)], color },
        // West face (x=ox, facing -x)
        { pts: [p(ox,oy+l,oz), p(ox,oy,oz), p(ox,oy,oz+h), p(ox,oy+l,oz+h)], color },
        // East face (x=ox+w, facing +x)
        { pts: [p(ox+w,oy,oz), p(ox+w,oy+l,oz), p(ox+w,oy+l,oz+h), p(ox+w,oy,oz+h)], color },
    );
    return faces;
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

// Rotate all polygon vertices in-place around (cx, cy) in the x/y plane by angle (radians).
function rotatePolys(polys, angle, cx, cy) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const poly of polys) {
        for (const p of poly.pts) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            p.x = cx + dx * cos - dy * sin;
            p.y = cy + dx * sin + dy * cos;
        }
    }
}

// Recursively rotate all polys in a drawable tree.
function rotateDrawable(drawable, angle, cx, cy) {
    rotatePolys(drawable.polys, angle, cx, cy);
    for (const child of drawable.children) {
        rotateDrawable(child, angle, cx, cy);
    }
}

// Draw a drawable tree recursively: own polys first, then children sorted
// by depth (far-to-near), each drawn completely before the next.
// projectAndDrawFn(polys, ox, oy): renderer-provided function to project,
// backface-cull, depth-sort, and draw a batch of polys.
// depthFn(poly, ox, oy): renderer-provided function returning a poly's depth.
function drawDrawableTree(drawable, ox, oy, projectAndDrawFn, depthFn) {
    projectAndDrawFn(drawable.polys, ox, oy);

    if (drawable.children.length > 0) {
        // Sort children by average depth of their own polys (far-to-near)
        const sorted = drawable.children.slice().sort((a, b) => {
            const da = avgDrawableDepth(a, ox, oy, depthFn);
            const db = avgDrawableDepth(b, ox, oy, depthFn);
            return da - db;
        });
        for (const child of sorted) {
            drawDrawableTree(child, ox, oy, projectAndDrawFn, depthFn);
        }
    }
}

function avgDrawableDepth(drawable, ox, oy, depthFn) {
    if (drawable.polys.length === 0) return -Infinity;
    let sum = 0;
    for (const poly of drawable.polys) {
        sum += depthFn(poly, ox, oy);
    }
    return sum / drawable.polys.length;
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

// Check if two axis-aligned rectangular prisms overlap (interiors intersect).
// Each prism: { x, y, z, w, l, h }
// Touching along a face/edge is allowed; only interior overlap is rejected.
function prismsOverlap(a, b) {
    const eps = 0.1;
    return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps &&
           a.y < b.y + b.l - eps && b.y < a.y + a.l - eps &&
           a.z < b.z + b.h - eps && b.z < a.z + a.h - eps;
}

// Generate a random house made of 1-3 rectangular prisms.
// facingAngle: rotation in radians applied to all geometry (0 = front faces -y).
// Returns a Drawable tree: { polys, children: [child Drawables...] }
// The root has no polys; children are the main prism and wings.
// Details (doors) are grandchildren of their prism.
function generateHouse(facingAngle = 0) {
    const color = pickHouseColor();
    const lengthwise = Math.random() < 0.5;
    const useHipRoof = Math.random() < 0.5;
    const addRoof = useHipRoof ? makeHipRoof : makeGableRoof;

    const numPrisms = 1 + Math.floor(Math.random() * 3); // 1-3
    const children = [];
    const bounds = []; // track prism bounds for overlap checks

    // Main prism
    const w1 = 20 + Math.random() * 20;  // 20-40ft
    const l1 = 25 + Math.random() * 20;  // 25-45ft
    const h1 = 8.5 + Math.random() * 1;  // ~9ft
    const mainPolys = [
        ...makeRectangularPrism(0, 0, 0, w1, l1, h1, color, false),
        ...addRoof(0, 0, 0, w1, l1, h1, lengthwise, color),
    ];
    bounds.push({ x: 0, y: 0, z: 0, w: w1, l: l1, h: h1 });

    // Front door on the north face (y=0, facing -y) of the main prism
    const doorW = 3 + Math.random() * 2;    // 3-5ft
    const doorH = 7 + Math.random() * 2;    // 7-9ft
    const doorX = (w1 - doorW) / 2;         // centered on main prism
    const eps = 0.05;
    const doorPoly = {
        pts: [
            {x: doorX,         y: -eps, z: 0},
            {x: doorX + doorW, y: -eps, z: 0},
            {x: doorX + doorW, y: -eps, z: doorH},
            {x: doorX,         y: -eps, z: doorH},
        ],
        color: ROOF_COLOR,
    };

    // Windows for the main prism (door is an exclusion on the north wall)
    const mainWindows = generatePrismWindows(0, 0, w1, l1, {
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

        // Try up to 8 random placements to find one without overlap
        for (let attempt = 0; attempt < 8; attempt++) {
            const side = Math.floor(Math.random() * 3); // 0-2: east, west, south
            let ox, oy;
            switch (side) {
                case 0: // East side
                    ox = w1;
                    oy = Math.random() * Math.max(0, l1 - l);
                    break;
                case 1: // West side
                    ox = -w;
                    oy = Math.random() * Math.max(0, l1 - l);
                    break;
                case 2: // South side
                    ox = Math.random() * Math.max(0, w1 - w);
                    oy = l1;
                    break;
            }

            const candidate = { x: ox, y: oy, z: 0, w, l, h };
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

    // Rotate all geometry around the center of the main prism
    if (facingAngle !== 0) {
        rotateDrawable(house, facingAngle, w1 / 2, l1 / 2);
    }

    return house;
}
