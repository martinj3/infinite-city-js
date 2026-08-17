// --- Lots along streets, and the buildings on them (all units in feet) ---
//
// A lot is a rectangle beside a street: `width` runs along the street and `depth`
// runs away from it, starting at the outer edge of the sidewalk (or the road edge
// where that side has no sidewalk). Width and setback are properties of the street
// segment -- every lot of the same type on a segment shares them, so the block has
// one building line -- while depth varies lot to lot.
//
// Buildings are generated in lot-local coordinates (x along the street, y away from
// it, y = 0 at the lot's street edge, which is the side the front door faces) and
// then rotated and translated into world space, so drawing needs no per-lot transform.
//
// Lots are generated once, when their street is created, and hang off the street
// object -- so driving down the same block twice shows the same houses. What
// exists is canon: nothing is ever demolished, new construction works around it.

// Lot types, with the share of lots each one gets. More civic types (police
// stations, schools) can be added here with their own size ranges. Each name is
// also the name of a registered building type (see buildings/buildingUtils.js):
// the matching buildings/<name>s.js is what knows how to put something on the lot.
const LOT_TYPES = {
    house: {
        prob: 0.95,
        width: [40, 90],    // along the street
        depth: [45, 70],    // away from the street
        setback: [0, 25],   // street edge of the lot to the front of the building
    },
    church: {
        prob: 0.05,
        width: [70, 120],
        depth: [90, 130],
        setback: [0, 25],   // same building line as the houses on the block
    },
};

// The type used wherever a bigger one won't fit: it must be the narrowest, so
// that failing to fit it means nothing at all fits.
const DEFAULT_LOT_TYPE = 'house';
const MAX_LOT_DEPTH = Math.max(...Object.values(LOT_TYPES).map(t => t.depth[1]));

// Pick a lot type by its declared probability.
function pickLotType() {
    let r = Math.random();
    for (const name in LOT_TYPES) {
        r -= LOT_TYPES[name].prob;
        if (r <= 0) return name;
    }
    return DEFAULT_LOT_TYPE;
}

// One plan per lot type per street segment: every lot of a given type on a
// segment shares a frontage and a setback, so a block keeps one building line
// even where a church interrupts the row of houses. Depth still varies lot to lot.
function makeLotPlan() {
    const plan = {};
    for (const name in LOT_TYPES) {
        plan[name] = {
            type: name,
            width: rangeRand(LOT_TYPES[name].width),
            setback: rangeRand(LOT_TYPES[name].setback),
        };
    }
    return plan;
}

// Lots start this far from an intersection node: room for the widest possible
// strip (half roadway + gap + sidewalk) of a street that may connect there LATER.
// Nothing is ever demolished, so corners must leave space for streets that don't
// exist yet; all streets at a node meet at right angles, so this is sufficient.
const LOT_CORNER_CLEAR = MAX_STREET_WIDTH / 2 + MAX_SIDEWALK_GAP + MAX_SIDEWALK_WIDTH;

// How much of a not-yet-built street to reserve at an intersection. Past this the
// street may have curved out of its strip anyway, and no lot of ours reaches so far.
const FUTURE_STREET_LEN = 200;

const CURVE_LOT_GAP = 15;   // ft of slack between lots on a curve, in place of real fitting
const BLOCKER_ARC_STEP = 40; // ft of arc per street-blocker rect on a curve
const LOT_TOUCH_EPS = 0.05; // rectangles closer than this to touching are not "overlapping"
const HOUSES_MIN_ZOOM = 0.6; // below this houses are sub-pixel; skip them entirely

const rangeRand = ([lo, hi]) => lo + Math.random() * (hi - lo);

// --- Collision ---------------------------------------------------------------
// streets.js enforces the right of way: a street's path never comes within
// RIGHT_OF_WAY (150ft) of a street it doesn't meet at an intersection, and lots
// are kept inside that reserve (see lotDepth). So the only collisions possible are
// local to a street's two intersections, with the streets that meet it there:
// their reserved strips, and any lots they placed
// first (whoever placed first keeps the spot). No global index needed.

// Separating-axis test between two rotated rectangles. Each lot's axes are its
// width direction u and the perpendicular; projections use |.| so signs don't matter.
// Rectangles that merely touch (neighbouring lots on a block, a lot against its own
// street's strip) meet exactly, so real penetration is required before they count as
// overlapping -- otherwise floating-point noise rejects perfectly good placements.
function lotsOverlap(a, b) {
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const axes = [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]];
    for (const [ax, ay] of axes) {
        const ra = a.hw * Math.abs(a.ux * ax + a.uy * ay) + a.hd * Math.abs(-a.uy * ax + a.ux * ay);
        const rb = b.hw * Math.abs(b.ux * ax + b.uy * ay) + b.hd * Math.abs(-b.uy * ax + b.ux * ay);
        if (Math.abs(dx * ax + dy * ay) >= ra + rb - LOT_TOUCH_EPS) return false; // separating axis
    }
    return true;
}

// --- Placement ---------------------------------------------------------------

// A lot's depth, kept inside the street's right of way: that reserve is what makes
// checking only this segment's own intersections sufficient. Houses are nowhere
// near the limit; only the deepest churches on the widest streets get trimmed,
// by a few feet at most.
function lotDepth(spec, front) {
    return Math.min(rangeRand(spec.depth), RIGHT_OF_WAY - front);
}

// How far from the street centerline the lots start on this side: the outer edge
// of the sidewalk, or the edge of the roadway where this side has no sidewalk.
// side: +1 = right of travel (x1 -> x2), -1 = left.
function lotFrontOffset(s, side) {
    const sw = s.props.sidewalk;
    return (side > 0 ? sw.right : sw.left) ? sw.outer : s.props.width / 2;
}

// Build the drawable for a lot and bake it into world coordinates.
// rotAngle maps lot-local +x onto the street direction, which puts lot-local +y
// (and so the building's back) on the far side from the street.
function buildLot(lot, rotAngle) {
    const drawable = generateBuilding(lot.type, lot);
    rotateDrawable(drawable, rotAngle, lot.width / 2, lot.depth / 2);
    translateDrawable(drawable, lot.cx - lot.width / 2, lot.cy - lot.depth / 2);
    return drawable;
}

// The strip a street reserves for itself on each side: centerline out to where its
// lots begin (the sidewalk edge). Used as obstacles when a street meeting it at an
// intersection places lots, so those lots stay off this street's roadway even where
// it placed no lot of its own. A curve is covered by a run of short tangent rects
// rather than its chord, which would cut the corner badly.
function streetBlockers(s) {
    const out = [];
    if (s.curve) {
        const { cx: ccx, cy: ccy, r, arcS, arcE, ccw } = s.curve;
        const dir = ccw ? -1 : 1;
        const sweep = normA(ccw ? arcS - arcE : arcE - arcS);
        const steps = Math.max(1, Math.ceil(sweep * r / BLOCKER_ARC_STEP));
        const dTheta = sweep / steps;
        for (const side of [1, -1]) {
            const front = lotFrontOffset(s, side);
            const rc = r + (ccw ? side : -side) * front / 2;
            for (let i = 0; i < steps; i++) {
                const theta = arcS + dir * (i + 0.5) * dTheta;
                const tangent = theta + dir * Math.PI / 2;
                out.push({
                    cx: ccx + rc * Math.cos(theta), cy: ccy + rc * Math.sin(theta),
                    ux: Math.cos(tangent), uy: Math.sin(tangent),
                    hw: Math.abs(rc) * dTheta / 2, hd: front / 2,
                });
            }
        }
    } else {
        const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        // Extends past both nodes so the intersection square itself stays clear
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + INTERSECTION_SIZE;
        const ux = Math.cos(a), uy = Math.sin(a);
        const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
        for (const side of [1, -1]) {
            const front = lotFrontOffset(s, side);
            out.push({
                cx: mx - uy * side * front / 2, cy: my + ux * side * front / 2,
                ux, uy, hw: len / 2, hd: front / 2,
            });
        }
    }
    return out;
}

// A street may still connect to any unfilled slot of a node LATER, and by then
// these lots are canon and cannot be moved -- so reserve the strip such a street
// would need now. Only its roadway and sidewalks are reserved; its lots will have
// to work around whatever is already standing here.
function futureStreetBlockers(n) {
    const out = [];
    for (const slot of SLOTS) {
        // roads[slot] is set true the moment a street claims the slot, before its
        // lots are generated, so this also skips the street being placed right now.
        if (n.roads[slot] === true) continue;
        const a = slotAngle(n.ori, slot);
        const ux = Math.cos(a), uy = Math.sin(a);
        out.push({
            cx: n.x + ux * FUTURE_STREET_LEN / 2, cy: n.y + uy * FUTURE_STREET_LEN / 2,
            ux, uy, hw: FUTURE_STREET_LEN / 2, hd: LOT_CORNER_CLEAR,
        });
    }
    return out;
}

// Everything a lot on street s could collide with: the reserved strips of the
// streets meeting s at either end, the lots those streets already placed, and the
// strips held open for streets that may yet join at those two intersections.
function lotObstacles(s) {
    const obstacles = [];
    const seen = new Set([s]);
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        const n = getNode(x, y);
        if (!n) continue;
        for (const slot of SLOTS) {
            const t = n.streets[slot];
            if (!t || seen.has(t)) continue;
            seen.add(t);
            for (const b of streetBlockers(t)) obstacles.push(b);
            if (t.lots) obstacles.push(...t.lots);
        }
        for (const b of futureStreetBlockers(n)) obstacles.push(b);
    }
    return obstacles;
}

function tryPlaceLot(street, plan, depth, cx, cy, ux, uy, rotAngle, obstacles) {
    const lot = {
        type: plan.type, width: plan.width, depth, setback: plan.setback,
        cx, cy, ux, uy, hw: plan.width / 2, hd: depth / 2,
    };
    // Lots already on this street count too: they tile exactly on a straight block,
    // but around a curve the fixed CURVE_LOT_GAP is only an estimate of the room a
    // deep lot needs, so occasionally one has to be turned down.
    if (obstacles.some(o => lotsOverlap(lot, o))) return false;
    if (street.lots.some(o => lotsOverlap(lot, o))) return false;
    lot.house = buildLot(lot, rotAngle);
    street.lots.push(lot);
    return true;
}

function placeStraightLots(s, side, plan, obstacles) {
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const ux = Math.cos(a), uy = Math.sin(a);
    const nx = -uy * side, ny = ux * side;   // outward normal on this side
    const front = lotFrontOffset(s, side);
    const rotAngle = side > 0 ? a : a + Math.PI;

    // Start clear of the corner at each end; lots tile along the block
    const fallback = plan[DEFAULT_LOT_TYPE];
    const end = len - LOT_CORNER_CLEAR;
    for (let t = LOT_CORNER_CLEAR; t + fallback.width <= end; ) {
        // A wide lot type that doesn't fit in what's left of the block gives way
        // to the default type -- how most churches get turned down.
        let p = plan[pickLotType()];
        if (t + p.width > end) p = fallback;

        const depth = lotDepth(LOT_TYPES[p.type], front);
        const along = t + p.width / 2, out = front + depth / 2;
        tryPlaceLot(s, p, depth,
            s.x1 + ux * along + nx * out,
            s.y1 + uy * along + ny * out,
            ux, uy, rotAngle, obstacles);
        t += p.width;
    }
}

// Curved streets get rectangular lots spaced around the arc with a fixed gap
// between them, rather than anything that truly follows the curve. Slight overlap
// on tight bends is accepted.
function placeCurveLots(s, side, plan, obstacles) {
    const { cx: ccx, cy: ccy, r, arcS, arcE, ccw } = s.curve;
    const dir = ccw ? -1 : 1;                 // direction of travel around the circle
    const radial = ccw ? side : -side;        // outward-from-street radial direction
    const front = lotFrontOffset(s, side);
    const rFront = r + radial * front;
    if (rFront < 1) return;

    const sweep = normA(ccw ? arcS - arcE : arcE - arcS);
    const clear = LOT_CORNER_CLEAR / r;
    const end = sweep - clear;
    const arcStep = p => (p.width + CURVE_LOT_GAP) / rFront;   // frontage as an angle

    const fallback = plan[DEFAULT_LOT_TYPE];
    for (let off = clear; off + arcStep(fallback) <= end; ) {
        let p = plan[pickLotType()];
        if (off + arcStep(p) > end) p = fallback;   // too wide for what's left
        const step = arcStep(p);

        const theta = arcS + dir * (off + step / 2);
        const tangent = theta + dir * Math.PI / 2;
        const depth = lotDepth(LOT_TYPES[p.type], front);
        const rc = r + radial * (front + depth / 2);
        tryPlaceLot(s, p, depth,
            ccx + rc * Math.cos(theta),
            ccy + rc * Math.sin(theta),
            Math.cos(tangent), Math.sin(tangent),
            side > 0 ? tangent : tangent + Math.PI, obstacles);
        off += step;
    }
}

// Called for every street as it is created (see pushStreet). Lots persist on the
// street object, so a block generates its buildings exactly once.
function generateStreetLots(s) {
    const plan = makeLotPlan();
    s.lotPlan = plan;
    s.lots = [];
    const obstacles = lotObstacles(s);
    for (const side of [1, -1]) {
        s.curve ? placeCurveLots(s, side, plan, obstacles) : placeStraightLots(s, side, plan, obstacles);
    }
}

// --- Drawing -----------------------------------------------------------------

// Draw every visible building, far-to-near. Called by drawScene() after the ground
// layers; buildings are 3D and project themselves, so this runs in screen space.
function drawLots(camX, camY, vl, vr, vt, vb) {
    if (PX_PER_FT < HOUSES_MIN_ZOOM) return;

    // Lots sit outside the street's own bounds, so pad the cull generously
    const pad = MAX_LOT_DEPTH + RIGHT_OF_WAY / 4;
    const visible = [];
    for (const s of streets) {
        if (!s.lots || s.lots.length === 0) continue;
        const b = s.bounds;
        if (b.mxx + pad < vl || b.mnx - pad > vr || b.mxy + pad < vt || b.mny - pad > vb) continue;
        for (const lot of s.lots) visible.push(lot);
    }
    if (visible.length === 0) return;

    // Sort by projected screen Y of the lot center (far-to-near)
    for (const lot of visible) lot.screenY = project(lot.cx, lot.cy, 0, camX, camY)[1];
    visible.sort((a, b) => a.screenY - b.screenY);

    const pAndD = (polys, ox, oy) => projectAndDraw(polys, ox, oy, camX, camY, true);
    const pDepth = (poly, ox, oy) => polyDepth(poly, ox, oy, camX, camY);
    for (const lot of visible) drawDrawableTree(lot.house, 0, 0, pAndD, pDepth);
}
