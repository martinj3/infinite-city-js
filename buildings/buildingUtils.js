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

// A random number in [lo, hi). Building code is mostly ranges rolled per building.
function frand(lo, hi) {
    return lo + Math.random() * (hi - lo);
}

// Pick from a [weight, h, s, l] palette, keeping the components so shades of the
// same material -- a parapet's inner face, a roof deck, a rib -- can be stepped
// off it. `jitter` is the full width of the random spread on each component, so
// two buildings that drew the same entry are still not the same colour.
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

// Pick a value from [weight, value] pairs. Weights need not sum to anything.
function weightedPick(entries) {
    let r = Math.random() * entries.reduce((s, e) => s + e[0], 0);
    for (const [wt, v] of entries) { r -= wt; if (r <= 0) return v; }
    return entries[entries.length - 1][1];
}

// A pyramidal spire over a rectangular base, apex centered. Fresh vertex
// objects per face (no sharing), same as makeRectangularPrism.
function makeSpire(ox, oy, z0, w, l, h, color) {
    const p = (x, y, z) => ({ x, y, z });
    const cx = [ox, ox + w, ox + w, ox], cy = [oy, oy, oy + l, oy + l];
    const faces = [];
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        faces.push({ pts: [p(cx[i], cy[i], z0), p(cx[j], cy[j], z0), p(ox + w / 2, oy + l / 2, z0 + h)], color });
    }
    return faces;
}

// The outline of a set of cells on a grid, as a footprint ring for makeWalls or
// makeLoft. `mask` is a cols x rows array of booleans in column-major order
// (mask[i * rows + j] is the cell at column i, row j); cells are cw by cl feet,
// and the ring comes back in feet from the grid's corner.
//
// This is how a plan gets a shape no rectangle has -- the cross, the L, the
// staircase of a bundled tube tower -- without hand-writing its corners. Every
// boundary edge (one whose neighbour is empty) is emitted in the winding makeWalls
// wants, so walking them start-to-end chains the outline in one pass; collinear
// runs are then merged, because two walls in a line are one wall. Assumes the
// filled cells form one blob with no holes, which every plan here does.
function traceCellOutline(mask, cols, rows, cw, cl) {
    const on = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && mask[i * rows + j];
    const key = p => `${p.x},${p.y}`;
    const edges = new Map();
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            if (!on(i, j)) continue;
            const x0 = i * cw, x1 = x0 + cw, y0 = j * cl, y1 = y0 + cl;
            // The outside is on the right walking a -> b, as makeWalls requires.
            if (!on(i, j - 1)) edges.set(key({ x: x0, y: y0 }), [{ x: x0, y: y0 }, { x: x1, y: y0 }]);
            if (!on(i + 1, j)) edges.set(key({ x: x1, y: y0 }), [{ x: x1, y: y0 }, { x: x1, y: y1 }]);
            if (!on(i, j + 1)) edges.set(key({ x: x1, y: y1 }), [{ x: x1, y: y1 }, { x: x0, y: y1 }]);
            if (!on(i - 1, j)) edges.set(key({ x: x0, y: y1 }), [{ x: x0, y: y1 }, { x: x0, y: y0 }]);
        }
    }
    if (edges.size === 0) return [];
    const start = edges.values().next().value[0];
    const ring = [];
    let at = start;
    do {
        const e = edges.get(key(at));
        if (!e) break;
        ring.push(e[0]);
        at = e[1];
    } while (key(at) !== key(start) && ring.length <= edges.size);

    // Drop any point its two neighbours run straight through.
    const out = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[(i - 1 + ring.length) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
        if ((b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x)) out.push(b);
    }
    return out;
}

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

// The flat roof of a commercial building: a deck at the top of the floors with a
// parapet standing above it, which is how nearly every office block, store and
// warehouse ends. The walls are built the full height -- floors plus parapet --
// and this adds the deck inside them, plus the parapet's inward faces.
//
// The parapet has no thickness (a real one is under a foot, which is a pixel or
// two here), so it is those inward faces alone that make it read as a wall
// standing around a sunken deck. They earn their place: the two walls facing away
// from the camera have their outer faces culled, and without an inner face there
// the deck's far edge would have nothing above it and you would see through the
// building. The ordering works out on its own -- the deck sorts at the prism's
// centroid, every visible wall sorts nearer than that, so the near parapet paints
// over the deck's near edge exactly as it should, while a far inner face lands
// wholly above the deck edge it shares and can never be covered by it.
// The general form: any footprint ring, wound the way makeWalls wants it, so a
// tower's octagon or a bundled tube's staircase gets its roof from the same code
// a rectangle does.
function makeRingRoof(pts, deckZ, parapet, deckColor, innerColor) {
    const z1 = deckZ + parapet;
    const polys = [{ pts: pts.map(p => ({ x: p.x, y: p.y, z: deckZ })), color: deckColor }];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        // Wound backwards along the edge, which is what turns the wall inward.
        polys.push({ pts: [
            { x: b.x, y: b.y, z: deckZ }, { x: a.x, y: a.y, z: deckZ },
            { x: a.x, y: a.y, z: z1 },    { x: b.x, y: b.y, z: z1 },
        ], color: innerColor });
    }
    return polys;
}

function makeFlatRoof(ox, oy, deckZ, w, l, parapet, deckColor, innerColor) {
    return makeRingRoof([{ x: ox, y: oy }, { x: ox + w, y: oy },
                         { x: ox + w, y: oy + l }, { x: ox, y: oy + l }],
                        deckZ, parapet, deckColor, innerColor);
}

// A panel on the street-facing (north) wall of a prism, at y, spanning x0..x1 and
// z0..z1: a shop sign, or the lettering on one. Wound top-left, top-right,
// bottom-right, bottom-left as a reader standing in the street sees it, which is
// both the front-facing winding (so it culls with the wall it lies on) and what
// drawPanelText needs in order to letter it (see render3d.js). Facing that wall a
// reader has +x on their left, so the quad starts at the high end of x -- get it
// backwards and the winding reverses and the panel simply culls away.
function makeFrontPanel(x0, x1, y, z0, z1, color, text) {
    const p = (x, z) => ({ x, y, z });
    return { pts: [p(x1, z1), p(x0, z1), p(x0, z0), p(x1, z0)], color, text };
}

// Generate window polys for all 4 walls of a prism.
// exclusions: per-wall array of {start, end} zones to avoid (e.g. door), each
// taking out the windows of one storey -- `floor`, defaulting to the ground floor,
// which is where nearly every such feature is. An office's sign band is the
// exception: it hangs across the second storey, so the glass behind it goes.
// floors, storeyHeight: how many rows of windows, and how far apart. A wall is laid
// out once and repeated up the prism, so the windows of each storey line up.
// opts overrides the shape of the glazing, in feet: `top` and `height` are the
// head height above the storey's own floor and the pane height, `width` the range
// of pane widths, `gap` the space between panes and `margin` the clear edge at
// each end. The defaults are a house's; an office asks for wider, taller panes
// closer together, which is most of what tells the two apart at a glance.
// Returns array of polygon objects.
function generatePrismWindows(ox, oy, w, l, exclusions, floors = 1, storeyHeight = 0, opts = {}) {
    const { top = [7, 8], height = [3, 5], width = [3, 8], gap = 4, margin = 2 } = opts;
    const p = (x, y, z) => ({x, y, z});
    const eps = 0.05;
    const winTop = top[0] + Math.random() * (top[1] - top[0]);        // uniform per prism
    const winH = height[0] + Math.random() * (height[1] - height[0]); // uniform per prism
    const winBottom = winTop - winH;
    const stdW = width[0] + Math.random() * (width[1] - width[0]);    // standard pane width

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
        while (pos + width[0] <= wall.hi - margin) {
            let winW = stdW;
            if (Math.random() < 0.25) {
                winW = Math.max(width[0], Math.min(width[1], stdW + (Math.random() - 0.5) * 4));
            }
            if (pos + winW > wall.hi - margin) break;
            spans.push([pos, pos + winW]);
            pos += winW + gap;
        }

        for (let f = 0; f < floors; f++) {
            const z0 = f * storeyHeight + winBottom, z1 = f * storeyHeight + winTop;
            for (const [a, b] of spans) {
                // A door, or a sign, stands where a window would have been
                if (wall.excl.some(e => (e.floor || 0) === f && a < e.end && b > e.start)) continue;
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
