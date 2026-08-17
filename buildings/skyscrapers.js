// --- High-rise tower generation (all units in feet) ---
// The skyscraper: fifteen to thirty storeys on a square downtown lot, which at
// this scale is 150 to 400ft of building before whatever it wears on top.
//
// A tower is three decisions taken in order, and taking them in that order is
// what keeps them from producing a chimera. An ERA fixes the palette, the way
// the glass is arranged, and which silhouettes and crowns are possible at all --
// so limestone comes with vertical piers, setbacks and a stepped crown, while
// blue-green curtain wall comes with a taper and a spire, and neither can end up
// wearing the other's hat. A STYLE turns the square footprint and the floor
// count into a stack of STAGES. A CROWN finishes the top.
//
// Everything below a stage is shared: a stage is a list of footprint rings lofted
// together (drawUtils.js), roofed with makeRingRoof, and glazed and finned by
// walking those same rings. That is what lets a plain box, a twisting octagon and
// a bundle of square tubes all be built and glazed by the same four functions --
// a style only ever decides what the footprint is at a given height.

// ------------------------------------------------------------------- eras ---
// Wall and glass palettes are [weight, h, s, l]. Style, crown and glazing tables
// are [weight, name]. `fins` is how often a tower of the era wears vertical ribs.

const TOWER_ERAS = [
    {
        // 1920s-30s. Limestone, terracotta and brick, because the curtain wall
        // has not been invented yet -- so the glass is a minority of the wall and
        // the vertical pier between the windows is the whole design.
        weight: 30, name: 'deco',
        walls: [[12, 40, 20, 73], [9, 34, 26, 65], [8, 28, 8, 56], [7, 14, 30, 44], [6, 44, 20, 79]],
        glass: [[10, 205, 16, 42], [7, 32, 14, 38], [5, 200, 10, 50]],
        styles: [[30, 'setback'], [15, 'chamfer'], [12, 'cross'], [8, 'box'], [5, 'tapered']],
        crowns: [[22, 'stepped'], [17, 'dome'], [14, 'pyramid'], [13, 'spire'], [10, 'pinnacles'], [5, 'mast']],
        glazing: [[18, 'strip'], [6, 'ribbon']],
        fins: 0.8,
    },
    {
        // 1950s-80s. The tower is a box and says so: dark glass, bronze or black
        // spandrels, a flat top with the plant on it and an antenna if anything.
        weight: 36, name: 'modern',
        walls: [[12, 210, 6, 22], [10, 28, 18, 31], [9, 210, 4, 68], [8, 210, 5, 84], [7, 30, 5, 58]],
        glass: [[10, 30, 26, 40], [9, 175, 12, 33], [8, 208, 8, 42], [7, 205, 22, 57]],
        styles: [[30, 'box'], [16, 'bundled'], [12, 'chamfer'], [8, 'setback'], [6, 'cross']],
        crowns: [[26, 'mech'], [22, 'mast'], [16, 'parapet'], [14, 'twinmast'], [6, 'stepped']],
        glazing: [[14, 'ribbon'], [11, 'spandrel'], [5, 'strip']],
        fins: 0.35,
    },
    {
        // 1990s on. All glass, and the shape does the talking: the taper, the
        // twist, the stacked flares, the pair joined at the waist -- and a spire
        // that counts toward the height.
        weight: 34, name: 'contemporary',
        walls: [[11, 205, 8, 72], [10, 208, 14, 55], [9, 200, 5, 86], [7, 210, 8, 29], [6, 190, 10, 64]],
        glass: [[11, 190, 34, 54], [9, 180, 28, 47], [8, 205, 42, 61], [6, 186, 26, 66]],
        styles: [[20, 'tapered'], [16, 'twist'], [15, 'pagoda'], [14, 'twin'], [13, 'chamfer'], [12, 'box']],
        crowns: [[30, 'spire'], [22, 'mast'], [16, 'pinnacles'], [16, 'stepped'], [8, 'mech'], [8, 'parapet']],
        glazing: [[15, 'spandrel'], [12, 'ribbon'], [5, 'strip']],
        fins: 0.3,
    },
];

const TOWER_FLOORS = [15, 30];        // storeys, before the crown
const TOWER_STOREY = [9, 13];         // ft per storey, rolled once per tower
const TOWER_LOT_FRAC = [0.85, 0.98];  // how much of its square lot the building covers
const TOWER_LOBBY_PROB = 0.4;         // a double-height ground floor
const TOWER_PARAPET = [2.5, 4.5];

// How far the glass and the lettering-thin details float off the wall they lie
// on. Small enough to be invisible, large enough to sort ahead of it (an outward
// push is toward the camera exactly when the face it sits on is visible).
const GLASS_EPS = 0.12;

// -------------------------------------------------------------- footprints ---
// Every plan is centred on (cx, cy) and wound the way makeWalls wants it -- the
// outside on the right walking one point to the next -- so scaling a plan is
// scaling its half-size and nothing else has to change.

function sqPts(cx, cy, h) {
    return [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h },
            { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h }];
}

// The square with its corners cut off: the octagon a surprising number of towers
// really are, and the plan that makes a tapering shaft read as round-ish rather
// than as a wedge. Edges 0, 2, 4, 6 are the four main faces; the odd ones are the
// cuts, which are short and mostly go unglazed.
function chamPts(cx, cy, h, cut) {
    const a = h - cut;
    return [{ x: cx - a, y: cy - h }, { x: cx + a, y: cy - h },
            { x: cx + h, y: cy - a }, { x: cx + h, y: cy + a },
            { x: cx + a, y: cy + h }, { x: cx - a, y: cy + h },
            { x: cx - h, y: cy + a }, { x: cx - h, y: cy - a }];
}

// One WTC's plan, as a function of how far up it you are. Eight points: at t = 0
// four of them are the corners of a square and four are the midpoints of its
// sides; at t = 1 they have swapped jobs, so the top is a square turned 45
// degrees and every face in between is a long triangle. `r` is the top square's
// half-diagonal -- barely less than the base's half-width, which is why the real
// one looks like it hardly tapers at all and yet loses a third of its floor.
function twistPts(cx, cy, h, r, t) {
    const a = h + (r / 2 - h) * t;   // the diagonal points, collapsing to side midpoints
    const m = h + (r - h) * t;       // the side midpoints, opening out into corners
    return [{ x: cx - a, y: cy - a }, { x: cx, y: cy - m },
            { x: cx + a, y: cy - a }, { x: cx + m, y: cy },
            { x: cx + a, y: cy + a }, { x: cx, y: cy + m },
            { x: cx - a, y: cy + a }, { x: cx - m, y: cy }];
}

// A plan drawn on a grid of square cells: the bundled-tube tower, the cross. The
// mask is column-major, cols x rows (see traceCellOutline).
function cellPts(cx, cy, h, cols, rows, mask) {
    const cw = 2 * h / cols, cl = 2 * h / rows;
    const ring = traceCellOutline(mask, cols, rows, cw, cl);
    for (const p of ring) { p.x += cx - h; p.y += cy - h; }
    return ring;
}

const cells = (cols, rows, on) => {
    const m = new Array(cols * rows).fill(false);
    for (const [i, j] of on) m[i * rows + j] = true;
    return m;
};

const capPoly = (pts, z, color) => ({ pts: pts.map(p => ({ x: p.x, y: p.y, z })), color });

// The footprint partway up a stage. Rings are lofted in order, so this is where
// the wall actually is at height z -- which is what glass and ribs on a leaning
// wall have to be measured against rather than the wall at the bottom.
function ringAt(rings, z) {
    let i = 0;
    while (i + 2 < rings.length && z > rings[i + 1].z) i++;
    const a = rings[i], b = rings[i + 1];
    const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
    return a.pts.map((p, k) => ({ x: p.x + (b.pts[k].x - p.x) * t, y: p.y + (b.pts[k].y - p.y) * t }));
}

// A ring edge, with the direction along it and the outward normal -- "right of
// travel", which is the side makeWalls calls the outside.
function edgeOut(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { ux: dx / len, uy: dy / len, nx: dy / len, ny: -dx / len, len };
}

// A point u feet along an edge from its start, floated off the wall by `out`.
const slide = (a, e, u, z, out = GLASS_EPS) =>
    ({ x: a.x + e.ux * u + e.nx * out, y: a.y + e.uy * u + e.ny * out, z });

// ------------------------------------------------------------------ stages ---

// Rings for one stage: from the floor it starts on up to the parapet standing
// above the floor it ends on. shape(t) is the footprint at height fraction t, so
// a prism passes a constant and a taper interpolates -- `steps` is how many rings
// that takes, and a prism only ever needs one.
function stageRings(levelZ, f0, f1, parapet, shape, steps = 1) {
    const z0 = levelZ[f0], z1 = levelZ[f1] + parapet;
    const rings = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        rings.push({ z: z0 + (z1 - z0) * t, pts: shape(t) });
    }
    return rings;
}

const stage = (levelZ, f0, f1, parapet, shape, steps) =>
    ({ f0, f1, parapet, deckZ: levelZ[f1], rings: stageRings(levelZ, f0, f1, parapet, shape, steps) });

// A stage's structure: lofted walls, then the deck and parapet that close it.
// Intermediate stages want the parapet as much as the top one does -- it is the
// terrace wall around the setback above, and without its inward faces you would
// see through the gap between the deck's far edge and the next stage's far wall.
function stagePolys(st, pal) {
    const polys = [];
    for (let i = 0; i + 1 < st.rings.length; i++)
        polys.push(...makeLoft(st.rings[i], st.rings[i + 1], pal.wall));
    polys.push(...makeRingRoof(ringAt(st.rings, st.deckZ), st.deckZ, st.parapet, pal.deck, pal.inner));
    return polys;
}

// ----------------------------------------------------------------- glazing ---
// Three ways to arrange the glass, and they are the three eras. A ribbon per
// floor on a solid wall is the post-war curtain wall; the same thing inverted --
// a solid spandrel band per floor on a wall that is otherwise glass -- is the
// contemporary all-glass tower; vertical strips between piers is every tower
// built before either existed. All three cost one polygon per wall per floor or
// per bay, which is what makes thirty storeys affordable at all.

// Where the glazed bays fall on a wall of this length, as fractions of it -- so a
// leaning wall's bays lean with it instead of sliding off the end.
function bayFractions(len, bayW, pierW, margin) {
    const n = Math.floor((len - 2 * margin + pierW) / (bayW + pierW));
    if (n < 1) return [];
    const span = n * bayW + (n - 1) * pierW;
    const start = (len - span) / 2;
    const out = [];
    for (let k = 0; k < n; k++) {
        const u = start + k * (bayW + pierW);
        out.push([u / len, (u + bayW) / len]);
    }
    return out;
}

// A band running the full width of every wall, once per floor. `color` is the
// glass for a ribbon window and the spandrel for an all-glass wall; which one it
// is decides only where the band sits in the storey.
function bandGlass(rings, levels, color, sill, head, margin) {
    const polys = [];
    for (const lv of levels) {
        const zb = lv.z + sill, zt = lv.z + lv.h - head;
        if (zt - zb < 1) continue;
        const pb = ringAt(rings, zb), pt = ringAt(rings, zt);
        for (let i = 0; i < pb.length; i++) {
            const j = (i + 1) % pb.length;
            const eb = edgeOut(pb[i], pb[j]), et = edgeOut(pt[i], pt[j]);
            if (eb.len < 2 * margin + 3) continue;   // a chamfer cut: too narrow to glaze
            polys.push({ pts: [
                slide(pb[i], eb, margin, zb), slide(pb[i], eb, eb.len - margin, zb),
                slide(pt[i], et, et.len - margin * (et.len / eb.len), zt),
                slide(pt[i], et, margin * (et.len / eb.len), zt),
            ], color });
        }
    }
    return polys;
}

// Vertical strips of glass with a pier of wall between them, running a whole
// stage in one polygon each. The floors inside are not drawn and do not need to
// be: on a tower like this the pier is what you see from the street, which is the
// point of building it that way.
function stripGlass(rings, z0, z1, color, bayW, pierW, margin) {
    const polys = [];
    const pb = ringAt(rings, z0), pt = ringAt(rings, z1);
    for (let i = 0; i < pb.length; i++) {
        const j = (i + 1) % pb.length;
        const eb = edgeOut(pb[i], pb[j]), et = edgeOut(pt[i], pt[j]);
        for (const [f0, f1] of bayFractions(eb.len, bayW, pierW, margin)) {
            polys.push({ pts: [
                slide(pb[i], eb, f0 * eb.len, z0), slide(pb[i], eb, f1 * eb.len, z0),
                slide(pt[i], et, f1 * et.len, z1), slide(pt[i], et, f0 * et.len, z1),
            ], color });
        }
    }
    return polys;
}

// The lobby: one tall pane per wall, because the ground floor of a tower is
// glazed nearly wall to wall and its mullions are below the zoom that matters.
// An enormous bay width is what asks bayFractions for a single bay.
function lobbyGlass(rings, z0, z1, color, margin) {
    return stripGlass(rings, z0, z1, color, 1e6, 0, margin);
}

// A course of darker stone at the foot of the building, standing a little proud
// of the wall: what stops a tower looking as though it had been pushed into the
// ground, and what the lobby glazing starts above. Grown from the stage's own
// ring about its centroid, so it fits an octagon or a staircase as readily as a
// square without knowing which it is.
function makePlinth(rings, h, out, color, capColor) {
    const pts = ringAt(rings, 0);
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    const wide = shrinkPts(pts, 1 + out / r);
    return [...makeLoft({ z: 0, pts: wide }, { z: h, pts: wide }, color), capPoly(wide, h, capColor)];
}

// -------------------------------------------------------------------- ribs ---
// Vertical ridges standing proud of the wall. On a Deco tower they are the piers
// between the windows carried past the parapet as spikes, which is most of what
// makes such a building look like one; on a modern one they are mullions and
// stop at the roof. They cost five polygons each and buy the grid: a rib crossing
// a floor-wide ribbon window cuts it into panes without any pane being drawn.

// The cross-section of one rib at height z: a small rectangle sitting on the wall
// at fraction f along edge i and pushed out by d.
function ribPts(rings, z, i, f, hw, d) {
    const p = ringAt(rings, z);
    const a = p[i], b = p[(i + 1) % p.length];
    const e = edgeOut(a, b);
    const cx = a.x + e.ux * f * e.len, cy = a.y + e.uy * f * e.len;
    return [
        { x: cx - e.ux * hw, y: cy - e.uy * hw },
        { x: cx - e.ux * hw + e.nx * d, y: cy - e.uy * hw + e.ny * d },
        { x: cx + e.ux * hw + e.nx * d, y: cy + e.uy * hw + e.ny * d },
        { x: cx + e.ux * hw, y: cy + e.uy * hw },
    ];
}

const shrinkPts = (pts, f) => {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    return pts.map(p => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));
};

// Ribs up every wall of a stage, at the pier positions the glazing left for them.
// spike is how far each carries above the top, tapering to a point -- the row of
// stone teeth along a 1930s parapet.
//
// A rib is drawn with three faces, not four: the fourth lies flat against the
// wall it is bolted to, pointing into it, so it is a backface at every camera
// angle and there is no angle from which it could have been seen. The spike above
// the parapet keeps all four, having no wall behind it.
const RIBS_PER_WALL = 6;   // enough to read as a rhythm; more is thirty storeys of polygons

function makeRibs(rings, z0, z1, pal, opts) {
    const { bayW, pierW, margin, hw = 1.2, depth = 1.0, spike = 0 } = opts;
    const polys = [];
    const base = ringAt(rings, z0);
    for (let i = 0; i < base.length; i++) {
        const e = edgeOut(base[i], base[(i + 1) % base.length]);
        const bays = bayFractions(e.len, bayW, pierW, margin);
        if (bays.length === 0) continue;
        // One rib in each pier, including the two ends, so a corner reads as a
        // pilaster rather than as a wall that simply stops.
        const at = [bays[0][0] / 2];
        for (let k = 0; k + 1 < bays.length; k++) at.push((bays[k][1] + bays[k + 1][0]) / 2);
        at.push((bays[bays.length - 1][1] + 1) / 2);
        // Thin an over-fine rhythm rather than dropping its ends, so the corner
        // pilasters survive and what goes is out of the middle.
        const step = Math.ceil(at.length / RIBS_PER_WALL);

        for (let k = 0; k < at.length; k += step) {
            const f = k + step >= at.length ? at[at.length - 1] : at[k];
            const lo = ribPts(rings, z0, i, f, hw, depth);
            const hi = ribPts(rings, z1, i, f, hw, depth);
            polys.push(...makeLoft({ z: z0, pts: lo }, { z: z1, pts: hi }, pal.rib).slice(0, 3));
            if (spike > 0) {
                const tip = shrinkPts(hi, 0.25);
                polys.push(...makeLoft({ z: z1, pts: hi }, { z: z1 + spike, pts: tip }, pal.rib));
                polys.push(capPoly(tip, z1 + spike, pal.rib));
            } else {
                polys.push(capPoly(hi, z1, pal.rib));
            }
        }
    }
    return polys;
}

// ------------------------------------------------------------------ crowns ---
// What the tower wears on top, built on the roof deck of its last stage. The
// context c is { cx, cy, half, deckZ, topZ, cham, H }: the centre and half-size
// of that deck, the deck and parapet heights, whether the plan has cut corners,
// and the height of the building underneath -- which is what a spire is measured
// against, since a crown on a short tower has to be a short crown.

// A slender tapering needle in two stages: a short flare off the base and then a
// long thin run to the point. Drawn as a single cone it reads as a traffic
// bollard, and a spire that reads as a bollard is worse than no spire.
function makeMast(cx, cy, z0, h, base, color) {
    const ring = (s, z) => ({ z, pts: sqPts(cx, cy, s) });
    const knee = z0 + h * 0.18;
    return [
        ...makeLoft(ring(base, z0), ring(base * 0.55, knee), color),
        ...makeLoft(ring(base * 0.55, knee), ring(base * 0.05, z0 + h), color),
        capPoly(sqPts(cx, cy, base * 0.05), z0 + h, color),
    ];
}

// A stack of shrinking tiers. `profile(t)` gives the half-size at each step and
// `rise(t)` its height, which is all that separates a Deco wedding-cake finial
// from the swelling stacked arches of a Chrysler crown.
function makeTiers(c, n, pal, profile, rise, sunburst) {
    const polys = [];
    const cut = t => (c.cham ? t * 0.3 : 0);
    for (let i = 0; i < n; i++) {
        const s0 = profile(i / n), s1 = profile((i + 1) / n);
        const z0 = c.deckZ + rise(i / n), z1 = c.deckZ + rise((i + 1) / n);
        const pts = c.cham || sunburst ? chamPts(c.cx, c.cy, s0, s0 * 0.28) : sqPts(c.cx, c.cy, s0);
        polys.push(...makeLoft({ z: z0, pts }, { z: z1, pts }, pal.crown));
        polys.push(capPoly(pts, z1, pal.deck));
        // The triangular window in the face of each arch, which is the one detail
        // that makes a crown like this recognisable from three blocks away.
        if (sunburst && i < n - 2 && z1 - z0 > 3) {
            for (const e of [0, 2, 4, 6]) {
                const a = pts[e], b = pts[(e + 1) % pts.length];
                const eo = edgeOut(a, b);
                if (eo.len < 5) continue;
                polys.push({ pts: [
                    slide(a, eo, eo.len * 0.28, z0 + 0.8),
                    slide(a, eo, eo.len * 0.72, z0 + 0.8),
                    slide(a, eo, eo.len * 0.5, z1 - 0.4),
                ], color: pal.glass });
            }
        }
        if (s1 < 0.5) break;
    }
    return polys;
}

const TOWER_CROWNS = {
    parapet: () => [],

    // The plant room, which is the honest top of most towers: an inset box with
    // the cooling towers in it, and often the lift overrun stacked on that.
    mech(c, pal) {
        const polys = [];
        const s1 = c.half * frand(0.42, 0.6), h1 = frand(13, 22);
        polys.push(...makeRectangularPrism(c.cx - s1, c.cy - s1, c.deckZ, 2 * s1, 2 * s1, h1, pal.mech));
        if (Math.random() < 0.55) {
            const s2 = s1 * frand(0.35, 0.6), h2 = frand(7, 13);
            polys.push(...makeRectangularPrism(c.cx - s2, c.cy - s2, c.deckZ + h1, 2 * s2, 2 * s2, h2, pal.mech));
        }
        return polys;
    },

    mast(c, pal) {
        const polys = TOWER_CROWNS.mech(c, pal);
        const h = c.H * frand(0.1, 0.2);
        polys.push(...makeMast(c.cx, c.cy, c.deckZ + frand(12, 20), h, Math.max(1.1, c.half * 0.05), pal.trim));
        return polys;
    },

    // Two of them, off the diagonal: the pair on top of the Willis Tower, which
    // is the only reason anyone can tell which of its neighbours it is.
    twinmast(c, pal) {
        const polys = TOWER_CROWNS.mech(c, pal);
        const h = c.H * frand(0.12, 0.22), d = c.half * 0.55;
        const s = Math.sign(Math.random() - 0.5);
        for (const k of [-1, 1]) {
            polys.push(...makeMast(c.cx + k * d, c.cy + k * s * d, c.deckZ + frand(4, 8),
                h * frand(0.85, 1), Math.max(0.9, c.half * 0.04), pal.trim));
        }
        return polys;
    },

    // A drum standing on the roof carrying a needle: the mooring mast on the
    // Empire State, the spire that is a third of One World Trade.
    spire(c, pal) {
        const s = c.half * frand(0.3, 0.45), h = frand(10, 18);
        const pts = chamPts(c.cx, c.cy, s, s * 0.3);
        return [
            ...makeLoft({ z: c.deckZ, pts }, { z: c.deckZ + h, pts: shrinkPts(pts, 0.78) }, pal.crown),
            capPoly(shrinkPts(pts, 0.78), c.deckZ + h, pal.deck),
            ...makeMast(c.cx, c.cy, c.deckZ + h, c.H * frand(0.18, 0.32), Math.max(1.3, s * 0.22), pal.trim),
        ];
    },

    // The wedding cake finial: three or four tiers each a fifth smaller, then a
    // short mast, which is how nearly every 1930s tower stops.
    stepped(c, pal) {
        const n = 3 + Math.floor(Math.random() * 2);
        const shrink = frand(0.66, 0.78), start = frand(0.76, 0.9);
        const h = frand(6, 10);
        const polys = makeTiers(c, n, pal,
            t => c.half * start * Math.pow(shrink, t * n),
            t => t * n * h, false);
        const topS = c.half * start * Math.pow(shrink, n);
        polys.push(...makeMast(c.cx, c.cy, c.deckZ + n * h, c.H * frand(0.07, 0.15),
            Math.max(1.2, topS * 0.32), pal.trim));
        return polys;
    },

    // The Chrysler crown: tiers whose radius falls away on a circle while their
    // height climbs it, so the profile swells out and then closes -- with the
    // triangular windows in the faces and a needle out the top.
    dome(c, pal) {
        const n = 6, H = c.half * frand(1.4, 2.0);
        const polys = makeTiers(c, n, pal,
            t => c.half * 0.95 * Math.cos(t * Math.PI / 2 * 0.94),
            t => H * Math.sin(t * Math.PI / 2), true);
        polys.push(...makeMast(c.cx, c.cy, c.deckZ + H * 0.99, c.H * frand(0.14, 0.24),
            Math.max(0.9, c.half * 0.06), pal.trim));
        return polys;
    },

    // A pyramidal cap over the whole roof, which is what a tower did before it
    // learned to do anything else. A finial on it more often than not.
    pyramid(c, pal) {
        const polys = [];
        const o = c.half * 0.06, h = c.half * frand(0.7, 1.15);
        polys.push(...makeSpire(c.cx - c.half - o, c.cy - c.half - o, c.deckZ,
            2 * (c.half + o), 2 * (c.half + o), h, pal.crown));
        if (Math.random() < 0.7)
            polys.push(...makeMast(c.cx, c.cy, c.deckZ + h * 0.92, c.H * frand(0.05, 0.12), 1.4, pal.trim));
        return polys;
    },

    // Spikes at the corners around a taller one in the middle: the Gothic revival
    // answer, and near enough the top of a Petronas tower. They stand from the
    // deck rather than the parapet, so the parapet hides their feet and they read
    // as growing out of the building instead of balancing on it. Kept inside the
    // corner on a chamfered plan, where the corner itself has been cut away.
    pinnacles(c, pal) {
        const polys = [];
        const d = c.half * (c.cham ? 0.62 : 0.82);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            polys.push(...makeMast(c.cx + sx * d, c.cy + sy * d, c.deckZ,
                c.H * frand(0.07, 0.12), Math.max(0.9, c.half * 0.055), pal.crown));
        }
        const s = c.half * frand(0.26, 0.36), h = frand(7, 12);
        const pts = chamPts(c.cx, c.cy, s, s * 0.3);
        polys.push(...makeLoft({ z: c.deckZ, pts }, { z: c.deckZ + h, pts }, pal.crown));
        polys.push(capPoly(pts, c.deckZ + h, pal.deck));
        polys.push(...makeMast(c.cx, c.cy, c.deckZ + h, c.H * frand(0.13, 0.22), Math.max(1.2, s * 0.3), pal.trim));
        return polys;
    },
};

// ------------------------------------------------------------------ styles ---
// A style takes the tower's context and returns one or more shafts. A shaft is
// { stages, cx, cy, half, cham }: the stack of stages and where its crown goes.
// Everything else -- structure, glazing, ribs, crown -- is applied to whatever
// comes back, so a style is only ever a decision about footprint against height.
//
// t is { half, cx, cy, floors, levelZ, H, parapet }.

// Floor indices splitting `floors` storeys into stages in the given proportions.
function splitFloors(floors, shares) {
    const total = shares.reduce((s, v) => s + v, 0);
    const cuts = [0];
    let acc = 0;
    for (let i = 0; i < shares.length - 1; i++) {
        acc += shares[i] / total;
        cuts.push(Math.max(cuts[i] + 1, Math.min(floors - (shares.length - 1 - i), Math.round(acc * floors))));
    }
    cuts.push(floors);
    return cuts;
}

const TOWER_STYLES = {
    // The plain one: a prism, and where the lot allows it a podium a couple of
    // storeys high standing out to the lot line around its foot.
    box(t) {
        const podium = Math.random() < 0.45;
        const shaftHalf = t.half * (podium ? frand(0.86, 0.95) : 1);
        const stages = [];
        if (podium) {
            const pf = 1 + Math.floor(Math.random() * 3);
            stages.push(stage(t.levelZ, 0, Math.min(pf, t.floors - 2), 2,
                () => sqPts(t.cx, t.cy, t.half)));
        }
        const f0 = stages.length ? stages[0].f1 : 0;
        stages.push(stage(t.levelZ, f0, t.floors, t.parapet, () => sqPts(t.cx, t.cy, shaftHalf)));
        return [{ stages, cx: t.cx, cy: t.cy, half: shaftHalf, cham: false }];
    },

    // The 1916 zoning envelope: a bulky base to the lot line, a shaft, and two or
    // three setbacks stepping in toward whatever is on top. The proportions are
    // the ones that make it look like a tower rather than a staircase -- the shaft
    // is roughly half the floors and each setback takes a bite of about a sixth.
    setback(t) {
        const n = 3 + Math.floor(Math.random() * 3);       // stages, base included
        const shares = [frand(0.14, 0.24), frand(0.4, 0.55)];
        while (shares.length < n) shares.push(frand(0.09, 0.16));
        const cuts = splitFloors(t.floors, shares);
        const stages = [];
        let half = t.half;
        for (let i = 0; i + 1 < cuts.length; i++) {
            const h = half;
            stages.push(stage(t.levelZ, cuts[i], cuts[i + 1],
                i === cuts.length - 2 ? t.parapet : frand(2, 3.2),
                () => sqPts(t.cx, t.cy, h)));
            half *= i === 0 ? frand(0.86, 0.93) : frand(0.76, 0.87);
        }
        return [{ stages, cx: t.cx, cy: t.cy, half: stages[stages.length - 1].rings[0].pts[1].x - t.cx, cham: false }];
    },

    // An obelisk: one continuous lean from the lot line to a top two thirds the
    // size. Chamfered as often as not, which is what stops the lean reading as a
    // wedge from the corner.
    tapered(t) {
        const cham = Math.random() < 0.6;
        const topF = frand(0.58, 0.76);
        const cut = t.half * 0.16;
        const shape = f => cham ? chamPts(t.cx, t.cy, t.half * f, cut * f) : sqPts(t.cx, t.cy, t.half * f);
        const stages = [stage(t.levelZ, 0, t.floors, t.parapet,
            u => shape(1 + (topF - 1) * u), 4)];
        return [{ stages, cx: t.cx, cy: t.cy, half: t.half * topF, cham }];
    },

    // One World Trade: a square that becomes a square turned 45 degrees, through
    // an octagon at the waist. Four rings is enough -- the faces are flat
    // triangles in the real thing, and more rings only rounds off what should
    // stay a crease.
    twist(t) {
        const r = t.half * frand(0.98, 1.06);
        const stages = [stage(t.levelZ, 0, t.floors, t.parapet,
            u => twistPts(t.cx, t.cy, t.half, r, u), 4)];
        return [{ stages, cx: t.cx, cy: t.cy, half: r * 0.72, cham: true }];
    },

    // The Willis Tower: nine square tubes rising together, dropping away in pairs
    // and quartets until two are left. Each stage is the outline of whatever tubes
    // are still standing, so the walls come out as one staircase-shaped ring and
    // there are no interior faces to see through.
    bundled(t) {
        const all = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) all.push([i, j]);
        const plus = all.filter(([i, j]) => i === 1 || j === 1);
        const s = Math.random() < 0.5 ? 1 : -1;   // which diagonal sheds first
        const seven = all.filter(([i, j]) => !(i === 1 - s && j === 1 - s) && !(i === 1 + s && j === 1 + s));
        const pair = [[1, 1], Math.random() < 0.5 ? [1, 0] : [0, 1]];
        const masks = [all, seven, plus, pair];
        const cuts = splitFloors(t.floors, [0.42, 0.2, 0.22, 0.16]);
        const stages = [];
        for (let i = 0; i + 1 < cuts.length; i++) {
            const m = cells(3, 3, masks[i]);
            stages.push(stage(t.levelZ, cuts[i], cuts[i + 1],
                i === cuts.length - 2 ? t.parapet : frand(1.8, 2.8),
                () => cellPts(t.cx, t.cy, t.half, 3, 3, m)));
        }
        // The last two tubes are off centre, so the crown has to be too.
        const cw = 2 * t.half / 3;
        const cx = t.cx - t.half + cw * (pair[0][0] + pair[1][0] + 2) / 2;
        const cy = t.cy - t.half + cw * (pair[0][1] + pair[1][1] + 2) / 2;
        return [{ stages, cx, cy, half: cw * 0.5, cham: false }];
    },

    // Taipei 101: modules that flare outward as they rise, each one restarting
    // from the waist of the last, on a pedestal of a few full-width floors. The
    // lip at every joint is the whole silhouette.
    pagoda(t) {
        const base = 2 + Math.floor(Math.random() * 3);
        const mods = 4 + Math.floor(Math.random() * 3);
        const cuts = splitFloors(t.floors - base, new Array(mods).fill(1)).map(v => v + base);
        const core = t.half * frand(0.7, 0.8);
        const flare = frand(1.06, 1.16);
        const stages = [stage(t.levelZ, 0, base, 2.5, () => chamPts(t.cx, t.cy, t.half, t.half * 0.2))];
        for (let i = 0; i + 1 < cuts.length; i++) {
            stages.push(stage(t.levelZ, cuts[i], cuts[i + 1],
                i === cuts.length - 2 ? t.parapet : 1.6,
                u => chamPts(t.cx, t.cy, core * (0.86 + (flare - 0.86) * u),
                             core * 0.22 * (0.86 + (flare - 0.86) * u)), 2));
        }
        return [{ stages, cx: t.cx, cy: t.cy, half: core * flare, cham: true }];
    },

    // Petronas: two slender shafts on one plot, stepping in near the top, joined
    // at the waist by a bridge on a pair of struts.
    twin(t) {
        const gap = t.half * frand(0.16, 0.26);
        const half = (t.half - gap) / 2;
        const cuts = splitFloors(t.floors, [0.72, 0.16, 0.12]);
        const shafts = [];
        for (const k of [-1, 1]) {
            const cx = t.cx + k * (half + gap);
            const stages = [];
            let h = half;
            for (let i = 0; i + 1 < cuts.length; i++) {
                const hh = h;
                stages.push(stage(t.levelZ, cuts[i], cuts[i + 1],
                    i === cuts.length - 2 ? t.parapet : 2,
                    () => chamPts(cx, t.cy, hh, hh * 0.26)));
                h *= frand(0.78, 0.87);
            }
            shafts.push({ stages, cx, cy: t.cy, half: h / frand(0.78, 0.87), cham: true });
        }
        // Hung on the first shaft, at a floor level around the waist so it lands
        // on a slab rather than halfway up a pane.
        shafts[0].bridge = { f: Math.round(t.floors * frand(0.42, 0.56)), half, gap };
        return shafts;
    },

    // Cut the corners off and the tower reads as round from every angle, which is
    // why so many of them are built this way. One shallow setback near the top as
    // often as not.
    chamfer(t) {
        const cut = t.half * frand(0.2, 0.32);
        const two = Math.random() < 0.55;
        const cuts = two ? splitFloors(t.floors, [0.8, 0.2]) : [0, t.floors];
        const stages = [];
        let half = t.half;
        for (let i = 0; i + 1 < cuts.length; i++) {
            const h = half, c = cut * (half / t.half);
            stages.push(stage(t.levelZ, cuts[i], cuts[i + 1],
                i === cuts.length - 2 ? t.parapet : 2.4,
                () => chamPts(t.cx, t.cy, h, c)));
            half *= frand(0.8, 0.9);
        }
        return [{ stages, cx: t.cx, cy: t.cy, half, cham: true }];
    },

    // A cross-shaped plan losing its arms with height: the buttressed core, the
    // way a very tall building keeps its width where the wind is and gives it up
    // where it is not.
    cross(t) {
        const plus = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
        const bar = Math.random() < 0.5 ? [[1, 0], [1, 1], [1, 2]] : [[0, 1], [1, 1], [2, 1]];
        const masks = [plus, bar, [[1, 1]]];
        const cuts = splitFloors(t.floors, [0.52, 0.28, 0.2]);
        const stages = [];
        for (let i = 0; i + 1 < cuts.length; i++) {
            const m = cells(3, 3, masks[i]);
            stages.push(stage(t.levelZ, cuts[i], cuts[i + 1],
                i === cuts.length - 2 ? t.parapet : frand(2, 3),
                () => cellPts(t.cx, t.cy, t.half, 3, 3, m)));
        }
        return [{ stages, cx: t.cx, cy: t.cy, half: t.half / 3, cham: false }];
    },
};

// -------------------------------------------------------------- the tower ---

// The skybridge between a Petronas pair: a box across the gap on two struts
// running back down to the shafts. The struts are lofts rather than prisms
// because they lean, which is the only reason anyone believes the bridge.
function makeSkybridge(a, z, half, gap, pal) {
    const cx = a.cx + half + gap;      // midway between the two shafts
    // The clear span is twice the gap; the deck reaches past it into both shafts
    // so that it lands on something instead of stopping in mid air.
    const w = 2 * gap + half * 0.6, d = half * 0.5, h = 5.5;
    const polys = makeRectangularPrism(cx - w / 2, a.cy - d / 2, z, w, d, h, pal.trim);
    const drop = gap * 2.2, t = 1.1;
    for (const k of [-1, 1]) {
        polys.push(...makeLoft({ z: z - drop, pts: sqPts(cx + k * gap, a.cy, t) },
                               { z, pts: sqPts(cx, a.cy, t) }, pal.trim));
    }
    return polys;
}

// The front door: a dark opening and a canopy over it, on whichever wall of the
// bottom stage faces the street. The plan may be an octagon or a staircase, so
// the wall is found rather than assumed -- it is the one whose outward normal
// points furthest toward -y, which is where the street is.
function makeEntrance(rings, z0, doorH, pal) {
    const pts = ringAt(rings, z0 + 1);
    let best = -1, bestN = 0;
    for (let i = 0; i < pts.length; i++) {
        const e = edgeOut(pts[i], pts[(i + 1) % pts.length]);
        if (e.len > 12 && e.ny < bestN) { bestN = e.ny; best = i; }
    }
    if (best < 0) return [];
    const a = pts[best], e = edgeOut(a, pts[(best + 1) % pts.length]);
    const w = Math.min(e.len * 0.4, frand(14, 22));
    const u0 = (e.len - w) / 2, u1 = u0 + w;
    const eps = GLASS_EPS * 2;
    const polys = [{ pts: [
        slide(a, e, u0, z0, eps), slide(a, e, u1, z0, eps),
        slide(a, e, u1, z0 + doorH, eps), slide(a, e, u0, z0 + doorH, eps),
    ], color: pal.door }];
    // The canopy stands out from the wall, so its footprint is ahead of the
    // wall's and it sorts after whatever face it hangs on.
    const out = frand(5, 8), th = 0.9;
    const c0 = slide(a, e, u0 - 2, 0, 0), c1 = slide(a, e, u1 + 2, 0, 0);
    const canopy = [
        { x: c0.x, y: c0.y }, { x: c0.x + e.nx * out, y: c0.y + e.ny * out },
        { x: c1.x + e.nx * out, y: c1.y + e.ny * out }, { x: c1.x, y: c1.y },
    ];
    polys.push(...makeLoft({ z: z0 + doorH, pts: canopy }, { z: z0 + doorH + th, pts: canopy }, pal.trim));
    polys.push(capPoly(canopy, z0 + doorH + th, pal.trim));
    return polys;
}

// Generate a high-rise tower for a lot. Same building interface as the others
// (see buildingUtils.js): lot-local feet, y = 0 the street edge, and a Drawable
// back -- one child per stage, each carrying its glass, ribs and fittings as a
// child of its own so they always paint after the walls they lie on.
function generateTower({ width: lotWidth = 120, depth: lotDepth = 120, setback: setbackDist = 4 } = {}) {
    const era = weightedPick(TOWER_ERAS.map(e => [e.weight, e]));
    const style = weightedPick(era.styles);
    const glazing = weightedPick(era.glazing);

    // A spandrel tower is the same building inside out: the wall is glass and the
    // band at every floor is the solid one, so the two swap places. Everything
    // else -- ribs, crown, parapet -- follows the structure's colour, `solid`,
    // whichever of the two that turned out to be.
    const a = pickPaletteColor(era.walls, [8, 8, 6]);
    const b = pickPaletteColor(era.glass, [10, 10, 7]);
    const spandrel = glazing === 'spandrel';
    const wall = spandrel ? b : a, glassC = spandrel ? a : b, solid = a;
    const pal = {
        wall: hsl(wall.h, wall.s, wall.l),
        glass: hsl(glassC.h, glassC.s, glassC.l),
        inner: hsl(solid.h, solid.s, solid.l - 12),
        deck: hsl(205, 5, frand(32, 44)),
        mech: hsl(205, 4, frand(46, 60)),
        crown: hsl(solid.h, solid.s, solid.l + (solid.l < 50 ? 8 : -6)),
        rib: hsl(solid.h, solid.s * 0.9, solid.l + (solid.l < 50 ? 7 : -5)),
        trim: hsl(210, 5, solid.l < 50 ? 62 : 44),
        door: hsl(205, 22, 26),
        // The base course is a darker, greyer stone than the wall above it, and
        // the lobby glass is darker than the tower's -- deep, unlit and two
        // storeys tall, which is the whole reason a tower's ground floor reads as
        // a lobby rather than as more of the same.
        plinth: hsl(solid.h, solid.s * 0.6, Math.max(14, solid.l - 22)),
        lobby: hsl(glassC.h, glassC.s * 0.85, Math.max(16, glassC.l - 16)),
    };

    // The lot is square by declaration, but its depth is trimmed to the street's
    // right of way and its width comes from the block's plan, so the square the
    // tower actually gets is the smaller of the two. A downtown tower stands on
    // its lot line, so the setback is only whatever slack is left over.
    const side = Math.min(lotWidth, lotDepth);
    const foot = side * frand(...TOWER_LOT_FRAC);
    const half = foot / 2;
    const cx = lotWidth / 2;
    const cy = Math.min(setbackDist, Math.max(0, lotDepth - foot)) + half;

    const floors = TOWER_FLOORS[0] + Math.floor(Math.random() * (TOWER_FLOORS[1] - TOWER_FLOORS[0] + 1));
    const storeyH = frand(...TOWER_STOREY);
    const lobbyH = storeyH * (Math.random() < TOWER_LOBBY_PROB ? frand(1.8, 2.2) : frand(1.0, 1.3));
    const levelZ = [0];
    for (let i = 0; i < floors; i++) levelZ.push(levelZ[i] + (i === 0 ? lobbyH : storeyH));
    const H = levelZ[floors];
    const parapet = frand(...TOWER_PARAPET);

    const shafts = TOWER_STYLES[style]({ half, cx, cy, floors, levelZ, H, parapet });

    // Glazing geometry, rolled once so every stage of the tower matches.
    const bayW = frand(7, 12), pierW = frand(2.5, 5.5), margin = frand(2, 4);
    const sill = frand(2.2, 3.4), head = frand(1.2, 2.2);
    const ribs = Math.random() < era.fins;
    const spike = era.name === 'deco' && Math.random() < 0.7 ? frand(3, 7) : 0;

    const children = [];
    for (const shaft of shafts) {
        for (let si = 0; si < shaft.stages.length; si++) {
            const st = shaft.stages[si];
            const details = [];
            const z0 = st.rings[0].z;

            // Which floors this stage carries, and so where its bands go. The
            // ground floor is glazed as one tall pane instead, whatever the rest
            // of the tower does.
            const levels = [];
            for (let f = st.f0; f < st.f1; f++) {
                if (f === 0) continue;
                levels.push({ z: levelZ[f], h: levelZ[f + 1] - levelZ[f] });
            }
            if (glazing === 'strip') {
                const from = st.f0 === 0 ? levelZ[1] : z0 + sill;
                details.push(...stripGlass(st.rings, from, st.deckZ - head, pal.glass, bayW, pierW, margin));
            } else {
                details.push(...bandGlass(st.rings, levels, pal.glass, sill, head, margin));
            }
            if (st.f0 === 0) {
                const base = frand(2.2, 4);
                details.push(...makePlinth(st.rings, base, frand(0.6, 1.2), pal.plinth, pal.deck));
                details.push(...lobbyGlass(st.rings, base, lobbyH - frand(1.5, 2.5), pal.lobby, margin * 1.5));
                details.push(...makeEntrance(st.rings, base, Math.min(lobbyH - base - 2, frand(11, 16)), pal));
            }
            // Ribs are for a stage with some height to it. On a three-foot
            // setback tier they would be teeth on a kerb, and there are a lot of
            // such tiers on a wedding cake.
            if (ribs && st.f1 - st.f0 >= 3) {
                details.push(...makeRibs(st.rings, z0, st.deckZ + st.parapet, pal, {
                    bayW, pierW, margin, hw: pierW * 0.42, depth: frand(0.8, 1.4),
                    // Only the parapet the tower actually ends on gets the teeth:
                    // a spike at every setback turns the silhouette to gravel.
                    spike: si === shaft.stages.length - 1 ? spike : 0,
                }));
            }
            children.push({ polys: stagePolys(st, pal), children: [{ polys: details, children: [] }] });
        }

        const last = shaft.stages[shaft.stages.length - 1];
        const crown = weightedPick(era.crowns);
        const polys = TOWER_CROWNS[crown]({
            cx: shaft.cx, cy: shaft.cy, half: shaft.half, cham: shaft.cham,
            deckZ: last.deckZ, topZ: last.deckZ + last.parapet, H,
        }, pal);
        // The crown hangs off the top stage rather than standing beside it: it is
        // above every part of that stage by construction, so painting it after is
        // always right, and it is far too small to sort against a whole roof.
        if (polys.length) children[children.length - 1].children.push({ polys, children: [] });

        if (shaft.bridge) {
            const b = shaft.bridge;
            children.push({ polys: makeSkybridge(shaft, levelZ[b.f], b.half, b.gap, pal), children: [] });
        }
    }

    return { polys: [], children };
}

registerBuilding('tower', { generate: generateTower });
