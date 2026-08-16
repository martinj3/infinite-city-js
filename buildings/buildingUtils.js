// --- Shared building parts (all units in feet) ---
// Pieces every kind of building is made of -- roofs, windows, lot fitting -- with
// nothing specific to houses, churches, or any other single building type. Purely
// generic geometry (prisms, drawable trees) lives one level up in drawUtils.js.
//
// Buildings are generated in lot-local coordinates: x runs 0..lotWidth along the
// street, y runs 0..lotDepth away from it, so y = 0 is the street-facing edge and
// the "north" face of a prism is its front.

// --- Building type registry --------------------------------------------------
// Every building type implements one method:
//
//     generate(lot) -> Drawable, in lot-local coordinates
//
// where lot is at least { width, depth, setback } in feet. Each type's file
// registers itself under the name of the LOT_TYPE it builds for, so lots.js can
// put up whatever a lot calls for without naming any particular building file --
// and a new type is added by writing its file and loading it, nothing else.
// (These are plain global scripts, so a bare global generate() in each file would
// collide; the registry is what gives every type the same method name.)
const BUILDING_TYPES = {};

function registerBuilding(name, impl) {
    BUILDING_TYPES[name] = impl;
}

function generateBuilding(name, lot) {
    const type = BUILDING_TYPES[name];
    if (!type) throw new Error(`no building type registered as "${name}" -- is its script loaded?`);
    return type.generate(lot);
}

const ROOF_COLOR = 'hsl(20, 30%, 35%)';
const WINDOW_COLOR = 'hsl(210, 50%, 75%)';

// Creates a gable roof on top of a rectangular prism.
// ox, oy, oz: origin of the prism; w, l, h: prism dimensions.
// lengthwise: if true, ridge runs along X; if false, ridge runs along Y.
// wallColor: color for gable-end triangles; roof slopes are roofColor.
// rise: ridge height above the walls in feet; default is a random modest pitch.
function makeGableRoof(ox, oy, oz, w, l, h, lengthwise, wallColor, roofColor = ROOF_COLOR, rise = null) {
    const p = (x, y, z) => ({x, y, z});
    const topZ = oz + h;

    if (lengthwise) {
        // Ridge runs along X axis (width), gable ends on west and east
        const gableH = rise !== null ? rise : (0.2 + Math.random() * 0.2) * l;
        const ry = oy + l / 2, rz = topZ + gableH;
        return [
            { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(ox+w,ry,rz), p(ox,ry,rz)], color: roofColor },
            { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(ox,ry,rz), p(ox+w,ry,rz)], color: roofColor },
            { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(ox,ry,rz)], color: wallColor },
            { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(ox+w,ry,rz)], color: wallColor },
        ];
    } else {
        // Ridge runs along Y axis (length), gable ends on north and south
        const gableH = rise !== null ? rise : (0.2 + Math.random() * 0.2) * w;
        const rx = ox + w / 2, rz = topZ + gableH;
        return [
            { pts: [p(ox,oy+l,topZ), p(ox,oy,topZ), p(rx,oy,rz), p(rx,oy+l,rz)], color: roofColor },
            { pts: [p(ox+w,oy,topZ), p(ox+w,oy+l,topZ), p(rx,oy+l,rz), p(rx,oy,rz)], color: roofColor },
            { pts: [p(ox,oy,topZ), p(ox+w,oy,topZ), p(rx,oy,rz)], color: wallColor },
            { pts: [p(ox+w,oy+l,topZ), p(ox,oy+l,topZ), p(rx,oy+l,rz)], color: wallColor },
        ];
    }
}

// Creates a hip roof on top of a rectangular prism.
// All four faces are sloped (roof-colored). The ridge is inset from each end
// so that the hip slope matches the main slope pitch. If the prism is square
// (or the cross-dimension >= the along-dimension), it becomes a pyramid.
function makeHipRoof(ox, oy, oz, w, l, h, lengthwise, wallColor) {
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
// exclusions: per-wall array of {start, end} zones to avoid (e.g. door). These are
// ground-floor features, so they only take out the windows on the bottom storey.
// floors, storeyHeight: how many rows of windows, and how far apart. A wall is laid
// out once and repeated up the prism, so the windows of each storey line up.
// Returns array of polygon objects.
function generatePrismWindows(ox, oy, w, l, exclusions, floors = 1, storeyHeight = 0) {
    const p = (x, y, z) => ({x, y, z});
    const eps = 0.05;
    const winTop = 7 + Math.random();            // 7-8ft above its own floor (uniform per prism)
    const winH = 3 + Math.random() * 2;          // 3-5ft (uniform per prism)
    const winBottom = winTop - winH;
    const stdW = 3 + Math.random() * 5;          // 3-8ft standard width
    const gap = 4;                                // space between windows
    const margin = 2;                             // min distance from wall edge

    const walls = [
        { lo: ox, hi: ox + w, excl: exclusions.north || [],
          poly: (a, b, z0, z1) => ({ pts: [p(a,oy-eps,z0), p(b,oy-eps,z0), p(b,oy-eps,z1), p(a,oy-eps,z1)], color: WINDOW_COLOR }) },
        { lo: ox, hi: ox + w, excl: exclusions.south || [],
          poly: (a, b, z0, z1) => ({ pts: [p(b,oy+l+eps,z0), p(a,oy+l+eps,z0), p(a,oy+l+eps,z1), p(b,oy+l+eps,z1)], color: WINDOW_COLOR }) },
        { lo: oy, hi: oy + l, excl: exclusions.west || [],
          poly: (a, b, z0, z1) => ({ pts: [p(ox-eps,b,z0), p(ox-eps,a,z0), p(ox-eps,a,z1), p(ox-eps,b,z1)], color: WINDOW_COLOR }) },
        { lo: oy, hi: oy + l, excl: exclusions.east || [],
          poly: (a, b, z0, z1) => ({ pts: [p(ox+w+eps,a,z0), p(ox+w+eps,b,z0), p(ox+w+eps,b,z1), p(ox+w+eps,a,z1)], color: WINDOW_COLOR }) },
    ];

    const polys = [];
    for (const wall of walls) {
        // Where the windows go, decided once for the whole wall
        const spans = [];
        let pos = wall.lo + margin;
        while (pos + 3 <= wall.hi - margin) {
            let winW = stdW;
            if (Math.random() < 0.25) {
                winW = Math.max(3, Math.min(8, stdW + (Math.random() - 0.5) * 4));
            }
            if (pos + winW > wall.hi - margin) break;
            spans.push([pos, pos + winW]);
            pos += winW + gap;
        }

        for (let f = 0; f < floors; f++) {
            const z0 = f * storeyHeight + winBottom, z1 = f * storeyHeight + winTop;
            for (const [a, b] of spans) {
                // A door on the ground floor stands where a window would have been
                if (f === 0 && wall.excl.some(e => a < e.end && b > e.start)) continue;
                polys.push(wall.poly(a, b, z0, z1));
            }
        }
    }
    return polys;
}

// A building dimension expressed as a fraction of its lot, with a hard floor in
// feet and a hard ceiling (the space actually available on the lot).
function lotFraction(lotDim, [minFrac, maxFrac], limit, minDim) {
    const size = lotDim * (minFrac + Math.random() * (maxFrac - minFrac));
    return Math.min(limit, Math.max(minDim, size));
}

// Is this prism entirely inside the lot footprint?
function prismInLot(p, lotWidth, lotDepth) {
    const eps = 0.1;
    return p.x >= -eps && p.y >= -eps &&
           p.x + p.w <= lotWidth + eps && p.y + p.l <= lotDepth + eps;
}
