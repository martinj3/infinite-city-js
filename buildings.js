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
    [8,  25,  35, 40],   // chocolate brown
    [7,  30,  30, 50],   // warm brown
    [6,  20,  40, 35],   // dark brown
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
    const v = [
        {x: ox,     y: oy,     z: oz},       // 0: bottom-SW
        {x: ox + w, y: oy,     z: oz},       // 1: bottom-SE
        {x: ox + w, y: oy + l, z: oz},       // 2: bottom-NE
        {x: ox,     y: oy + l, z: oz},       // 3: bottom-NW
        {x: ox,     y: oy,     z: oz + h},   // 4: top-SW
        {x: ox + w, y: oy,     z: oz + h},   // 5: top-SE
        {x: ox + w, y: oy + l, z: oz + h},   // 6: top-NE
        {x: ox,     y: oy + l, z: oz + h},   // 7: top-NW
    ];

    const faces = [];
    if (includeTop) {
        faces.push({ pts: [v[4], v[5], v[6], v[7]], color });
    }
    faces.push(
        // North face (y=oy, facing -y)
        { pts: [v[0], v[1], v[5], v[4]], color },
        // South face (y=oy+l, facing +y)
        { pts: [v[2], v[3], v[7], v[6]], color },
        // West face (x=ox, facing -x)
        { pts: [v[3], v[0], v[4], v[7]], color },
        // East face (x=ox+w, facing +x)
        { pts: [v[1], v[2], v[6], v[5]], color },
    );
    return faces;
}

const ROOF_COLOR = 'hsl(20, 30%, 35%)';

// Creates a gable roof on top of a rectangular prism.
// ox, oy, oz: origin of the prism; w, l, h: prism dimensions.
// lengthwise: if true, ridge runs along X; if false, ridge runs along Y.
// houseColor: color for gable-end triangles; roof slopes are brown.
function makeGableRoof(ox, oy, oz, w, l, h, lengthwise, houseColor) {
    const topZ = oz + h;

    if (lengthwise) {
        // Ridge runs along X axis (width), gable ends on west and east
        const gableH = (0.25 + Math.random() * 0.35) * l;
        const r0 = {x: ox,     y: oy + l / 2, z: topZ + gableH};
        const r1 = {x: ox + w, y: oy + l / 2, z: topZ + gableH};
        const v4 = {x: ox,     y: oy,         z: topZ};
        const v5 = {x: ox + w, y: oy,         z: topZ};
        const v6 = {x: ox + w, y: oy + l,     z: topZ};
        const v7 = {x: ox,     y: oy + l,     z: topZ};

        return [
            // North slope (facing -y)
            { pts: [v4, v5, r1, r0], color: ROOF_COLOR },
            // South slope (facing +y)
            { pts: [v6, v7, r0, r1], color: ROOF_COLOR },
            // West gable end (facing -x)
            { pts: [v7, v4, r0], color: houseColor },
            // East gable end (facing +x)
            { pts: [v5, v6, r1], color: houseColor },
        ];
    } else {
        // Ridge runs along Y axis (length), gable ends on north and south
        const gableH = (0.25 + Math.random() * 0.35) * w;
        const r0 = {x: ox + w / 2, y: oy,     z: topZ + gableH};
        const r1 = {x: ox + w / 2, y: oy + l, z: topZ + gableH};
        const v4 = {x: ox,         y: oy,     z: topZ};
        const v5 = {x: ox + w,     y: oy,     z: topZ};
        const v6 = {x: ox + w,     y: oy + l, z: topZ};
        const v7 = {x: ox,         y: oy + l, z: topZ};

        return [
            // West slope (facing -x)
            { pts: [v7, v4, r0, r1], color: ROOF_COLOR },
            // East slope (facing +x)
            { pts: [v5, v6, r1, r0], color: ROOF_COLOR },
            // South gable end (y=oy, facing -y)
            { pts: [v4, v5, r0], color: houseColor },
            // North gable end (y=oy+l, facing +y)
            { pts: [v6, v7, r1], color: houseColor },
        ];
    }
}

// Creates a hip roof on top of a rectangular prism.
// All four faces are sloped (roof-colored). The ridge is inset from each end
// so that the hip slope matches the main slope pitch. If the prism is square
// (or the cross-dimension >= the along-dimension), it becomes a pyramid.
function makeHipRoof(ox, oy, oz, w, l, h, lengthwise, houseColor) {
    const topZ = oz + h;
    const v4 = {x: ox,     y: oy,     z: topZ};
    const v5 = {x: ox + w, y: oy,     z: topZ};
    const v6 = {x: ox + w, y: oy + l, z: topZ};
    const v7 = {x: ox,     y: oy + l, z: topZ};

    if (lengthwise) {
        // Ridge runs along X, cross-dimension is l, inset = l/2
        const roofH = (0.25 + Math.random() * 0.35) * l;
        const inset = l / 2;
        if (w <= l) {
            // Pyramid — ridge collapses to a point
            const peak = {x: ox + w / 2, y: oy + l / 2, z: topZ + roofH};
            return [
                { pts: [v4, v5, peak], color: ROOF_COLOR },   // North
                { pts: [v6, v7, peak], color: ROOF_COLOR },   // South
                { pts: [v7, v4, peak], color: ROOF_COLOR },   // West
                { pts: [v5, v6, peak], color: ROOF_COLOR },   // East
            ];
        }
        const r0 = {x: ox + inset,     y: oy + l / 2, z: topZ + roofH};
        const r1 = {x: ox + w - inset, y: oy + l / 2, z: topZ + roofH};
        return [
            // North slope (facing -y)
            { pts: [v4, v5, r1, r0], color: ROOF_COLOR },
            // South slope (facing +y)
            { pts: [v6, v7, r0, r1], color: ROOF_COLOR },
            // West hip triangle (facing -x)
            { pts: [v7, v4, r0], color: ROOF_COLOR },
            // East hip triangle (facing +x)
            { pts: [v5, v6, r1], color: ROOF_COLOR },
        ];
    } else {
        // Ridge runs along Y, cross-dimension is w, inset = w/2
        const roofH = (0.25 + Math.random() * 0.35) * w;
        const inset = w / 2;
        if (l <= w) {
            // Pyramid
            const peak = {x: ox + w / 2, y: oy + l / 2, z: topZ + roofH};
            return [
                { pts: [v4, v5, peak], color: ROOF_COLOR },
                { pts: [v6, v7, peak], color: ROOF_COLOR },
                { pts: [v7, v4, peak], color: ROOF_COLOR },
                { pts: [v5, v6, peak], color: ROOF_COLOR },
            ];
        }
        const r0 = {x: ox + w / 2, y: oy + inset,     z: topZ + roofH};
        const r1 = {x: ox + w / 2, y: oy + l - inset, z: topZ + roofH};
        return [
            // West slope (facing -x)
            { pts: [v7, v4, r0, r1], color: ROOF_COLOR },
            // East slope (facing +x)
            { pts: [v5, v6, r1, r0], color: ROOF_COLOR },
            // South hip triangle (facing -y)
            { pts: [v4, v5, r0], color: ROOF_COLOR },
            // North hip triangle (facing +y)
            { pts: [v6, v7, r1], color: ROOF_COLOR },
        ];
    }
}

// Rotate all polygon vertices in-place around (cx, cy) in the x/y plane by angle (radians).
// Uses a Set to avoid rotating shared vertex objects more than once.
function rotatePolys(polys, angle, cx, cy) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const visited = new Set();
    for (const poly of polys) {
        for (const p of poly.pts) {
            if (visited.has(p)) continue;
            visited.add(p);
            const dx = p.x - cx;
            const dy = p.y - cy;
            p.x = cx + dx * cos - dy * sin;
            p.y = cy + dx * sin + dy * cos;
        }
    }
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
// Returns a Drawable: { polys: [ {pts, color}, ... ] }
function generateHouse(facingAngle = 0) {
    const color = pickHouseColor();
    const lengthwise = Math.random() < 0.5;
    const useHipRoof = Math.random() < 0.5;
    const addRoof = useHipRoof ? makeHipRoof : makeGableRoof;

    const numPrisms = 1 + Math.floor(Math.random() * 3); // 1-3
    const polys = [];
    const bounds = []; // track prism bounds for overlap checks

    // Main prism
    const w1 = 20 + Math.random() * 20;  // 20-40ft
    const l1 = 25 + Math.random() * 20;  // 25-45ft
    const h1 = 8.5 + Math.random() * 1;  // ~9ft
    polys.push(...makeRectangularPrism(0, 0, 0, w1, l1, h1, color, false));
    polys.push(...addRoof(0, 0, 0, w1, l1, h1, lengthwise, color));
    bounds.push({ x: 0, y: 0, z: 0, w: w1, l: l1, h: h1 });

    // Front door on the north face (y=0, facing -y) of the main prism
    const doorW = 3 + Math.random() * 2;    // 3-5ft
    const doorH = 7 + Math.random() * 2;    // 7-9ft
    const doorX = (w1 - doorW) / 2;         // centered on main prism
    const eps = 0.05;
    polys.push({
        pts: [
            {x: doorX,         y: -eps, z: 0},
            {x: doorX + doorW, y: -eps, z: 0},
            {x: doorX + doorW, y: -eps, z: doorH},
            {x: doorX,         y: -eps, z: doorH},
        ],
        color: ROOF_COLOR,
        zBias: 0.01,
    });

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
                polys.push(...makeRectangularPrism(ox, oy, 0, w, l, h, color, false));
                polys.push(...addRoof(ox, oy, 0, w, l, h, lengthwise, color));
                bounds.push(candidate);
                break;
            }
        }
    }

    // Rotate all geometry around the center of the main prism
    if (facingAngle !== 0) {
        rotatePolys(polys, facingAngle, w1 / 2, l1 / 2);
    }

    return { polys };
}
