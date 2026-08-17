// --- Church generation (all units in feet) ---
// A church is a tall gabled nave dressed up with some combination of towers,
// side aisles, a transept, and an apse. The styles that come out of the mix:
//
//   center    one steeple front and center, the nave behind it (white-clapboard
//             New England, or brick gothic when the palette says so)
//   side      one tower at a front corner, the facade beside it
//   twin      two matching bell towers flanking the front
//   twin-off  two towers that don't quite match -- one shorter, or capped
//             differently
//   cathedral twin west-front towers plus aisles, and usually a clerestory,
//             transept, and apse; a grand plan squeezed onto a town lot
//
// A "mission" variant (side or center tower only) swaps in low terracotta
// roofs and a plainly capped campanile.
//
// Windows are taller than a house's and rounded at the top; big fronts get a
// rose window high in the gable. Everything is sized off the lot and off ranges
// rolled per church, so no two look quite alike.

// Wall palettes: [weight, h, s, l]
const CHURCH_WALLS = [
    [24, 40, 10, 91],   // white clapboard
    [12, 45, 25, 82],   // cream
    [13, 38, 30, 68],   // buff sandstone
    [12, 45, 12, 74],   // limestone
    [10, 210, 6, 62],   // gray stone
    [7, 215, 8, 46],    // dark granite
    [14, 8, 42, 42],    // red brick
    [5, 4, 38, 33],     // dark brick
];

const CHURCH_ROOFS = [
    [30, 215, 12, 30],  // slate
    [22, 220, 6, 23],   // charcoal shingle
    [16, 210, 4, 42],   // weathered gray
    [14, 18, 30, 26],   // dark brown
    [10, 165, 30, 45],  // copper patina
    [8, 160, 20, 28],   // dark green
];

const MISSION_WALLS = [
    [40, 40, 14, 90],   // white stucco
    [35, 33, 32, 74],   // tan
    [25, 10, 44, 46],   // brick
];

const ARCH_SEGS = 6;    // segments approximating the half circle atop a window

function weightedPick(entries) {
    let r = Math.random() * entries.reduce((s, e) => s + e[0], 0);
    for (const [wt, v] of entries) { r -= wt; if (r <= 0) return v; }
    return entries[entries.length - 1][1];
}

// Pick from a [weight, h, s, l] palette, with a little jitter for variety.
function pickChurchColor(palette) {
    let r = Math.random() * palette.reduce((sum, e) => sum + e[0], 0);
    let e = palette[palette.length - 1];
    for (const c of palette) { r -= c[0]; if (r <= 0) { e = c; break; } }
    return {
        h: e[1] + (Math.random() - 0.5) * 10,
        s: e[2] + (Math.random() - 0.5) * 8,
        l: e[3] + (Math.random() - 0.5) * 6,
    };
}

// A wall surface to hang details on: at(u, z) maps a distance u along the wall
// (left to right as seen from outside) and a height z to a world point floated
// just off the surface. Endpoints go in the same winding order the wall's own
// quad uses, so details inherit its facing. at.len is the wall's length and
// at.u(x, y) maps a world point back to its u along the wall.
function wallSurface(x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const eps = 0.07;
    const at = (u, z) => ({ x: x0 + ux * u + uy * eps, y: y0 + uy * u - ux * eps, z });
    at.len = len;
    at.u = (x, y) => (x - x0) * ux + (y - y0) * uy;
    return at;
}

// The stretch of wall between two world points, as a [u0, u1] range windows
// should stay out of (a transept arm, a tower leaning on this wall).
function skipRange(at, xa, ya, xb, yb) {
    const a = at.u(xa, ya), b = at.u(xb, yb);
    return [Math.min(a, b), Math.max(a, b)];
}

// One window (or door) with a rounded top: a rectangle up to the arch spring
// line, then a half circle.
function archedPoly(at, u0, u1, sill, top, color) {
    const r = (u1 - u0) / 2, uc = (u0 + u1) / 2;
    const spring = Math.max(sill, top - r);
    const pts = [at(u0, sill), at(u1, sill)];
    for (let i = 0; i <= ARCH_SEGS; i++) {
        const th = (Math.PI * i) / ARCH_SEGS;
        pts.push(at(uc + r * Math.cos(th), spring + r * Math.sin(th)));
    }
    return { pts, color };
}

// A round window (rose window, oculus) centered at (uc, zc) on a wall surface.
function circlePoly(at, uc, zc, r, color, segs = 12) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
        const th = (2 * Math.PI * i) / segs;
        pts.push(at(uc + r * Math.cos(th), zc + r * Math.sin(th)));
    }
    return { pts, color };
}

// A row of identical arched windows spread evenly along a wall, skipping any
// that fall in a skip range. Returns [] when the wall is too short or the
// window band too thin.
function archedRow(at, sill, top, w, spacing, color, skip = []) {
    const polys = [];
    const n = Math.floor((at.len - 4) / spacing);
    if (n < 1 || top - sill < 2.5) return polys;
    const step = at.len / n;
    for (let i = 0; i < n; i++) {
        const c = step * (i + 0.5);
        if (skip.some(([a, b]) => c - w / 2 < b && c + w / 2 > a)) continue;
        polys.push(archedPoly(at, c - w / 2, c + w / 2, sill, top, color));
    }
    return polys;
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

// A simple latin cross: post and arm, thin prisms with the arm facing the street.
function makeCross(cx, cy, z0, h, color) {
    const t = 0.5;
    return [
        ...makeRectangularPrism(cx - t / 2, cy - t / 2, z0, t, t, h, color),
        ...makeRectangularPrism(cx - h * 0.3, cy - t / 2, z0 + h * 0.6, h * 0.6, t, t * 1.5, color),
    ];
}

// One tower, as its own drawable: shaft, belfry openings near the top of every
// face, and a top -- a spire, a flat parapet (with pinnacles), or a low mission
// cap. t: { x, y, w, h, top: 'spire'|'flat'|'cap', spireH, portal, windows,
// twinBelfry, pinnacles, cross, clock, pal }. Towers are square: w is both
// footprint dimensions.
function makeTower(t) {
    const pal = t.pal;
    const polys = [...makeRectangularPrism(t.x, t.y, 0, t.w, t.w, t.h, pal.wall, false)];
    const details = [];

    if (t.top === 'spire') {
        const f = 0.8;  // eave flare beyond the shaft
        polys.push(...makeSpire(t.x - f, t.y - f, t.h, t.w + 2 * f, t.w + 2 * f, t.spireH, pal.spire));
        if (t.cross) polys.push(...makeCross(t.x + t.w / 2, t.y + t.w / 2, t.h + t.spireH - 0.3, frand(4, 6), pal.cross));
    } else {
        // Cornice slab overhanging the shaft, then either a shallow mission cap
        // or a flat parapet with corner pinnacles.
        const o = 0.8;
        polys.push(...makeRectangularPrism(t.x - o, t.y - o, t.h, t.w + 2 * o, t.w + 2 * o, 1.6, pal.trim, true));
        if (t.top === 'cap') {
            polys.push(...makeSpire(t.x - o, t.y - o, t.h + 1.6, t.w + 2 * o, t.w + 2 * o, t.w * 0.45, pal.spire));
            if (t.cross) polys.push(...makeCross(t.x + t.w / 2, t.y + t.w / 2, t.h + 1.6 + (t.w + 2 * o) * 0.45 - 0.3, frand(3.5, 5), pal.cross));
        } else if (t.pinnacles) {
            for (const [px, py] of [[t.x, t.y], [t.x + t.w, t.y], [t.x + t.w, t.y + t.w], [t.x, t.y + t.w]]) {
                const s = 1.7;
                polys.push(...makeRectangularPrism(px - s / 2, py - s / 2, t.h + 1.6, s, s, 4.2, pal.wall, false));
                polys.push(...makeSpire(px - s / 2 - 0.2, py - s / 2 - 0.2, t.h + 5.8, s + 0.4, s + 0.4, 3.2, pal.spire));
            }
        }
    }

    // Wall surfaces in prism winding order: north, east, south, west
    const faces = [
        wallSurface(t.x, t.y, t.x + t.w, t.y),
        wallSurface(t.x + t.w, t.y, t.x + t.w, t.y + t.w),
        wallSurface(t.x + t.w, t.y + t.w, t.x, t.y + t.w),
        wallSurface(t.x, t.y + t.w, t.x, t.y),
    ];

    const belTop = t.h - 2, belH = frand(6, 9);
    for (const at of faces) {
        if (t.twinBelfry) {
            const w = t.w * 0.2;
            for (const c of [t.w * 0.32, t.w * 0.68]) {
                details.push(archedPoly(at, c - w / 2, c + w / 2, belTop - belH, belTop, pal.louver));
            }
        } else {
            const w = t.w * 0.34;
            details.push(archedPoly(at, (t.w - w) / 2, (t.w + w) / 2, belTop - belH, belTop, pal.louver));
        }
        if (t.clock) {
            const r = t.w * 0.17, cz = belTop - belH - frand(4, 6);
            if (cz - r > (t.portal ? t.portal.top + 2 : 14)) {
                details.push(circlePoly(at, t.w / 2, cz, r, pal.clock, 10));
            }
        }
    }

    // Street face: the portal, and a slim window or two up the shaft
    if (t.portal) {
        details.push(archedPoly(faces[0], (t.w - t.portal.w) / 2, (t.w + t.portal.w) / 2, 0, t.portal.top, pal.door));
    }
    for (let i = 0; i < t.windows; i++) {
        const wz = t.h * (0.38 + 0.2 * i), w = frand(2.2, 3);
        const sill = wz - frand(5, 7);
        if (sill < (t.portal ? t.portal.top + 1.5 : 4) || wz > belTop - belH - 1.5) continue;
        details.push(archedPoly(faces[0], (t.w - w) / 2, (t.w + w) / 2, sill, wz, pal.glass));
    }

    return { polys, children: [{ polys: details, children: [] }] };
}

// Generate a random church for a lot (see the file comment for the shapes).
// Same building interface as houses: lot-local coordinates, y=0 the street edge,
// returns a Drawable whose children are the structural masses -- towers, nave,
// aisles, transept arms, apse -- each with its windows as a grandchild.
function generateChurch({ width: lotWidth = 100, depth: lotDepth = 110, setback: setbackDist = 15 } = {}) {
    const availW = lotWidth - 6;                 // keep 3ft clear of each side line
    const availD = lotDepth - setbackDist - 3;
    const frontY = setbackDist;

    let style = weightedPick([
        [30, 'center'], [21, 'side'], [13, 'twin'], [10, 'twin-off'], [26, 'cathedral'],
    ]);
    if (style === 'cathedral' && (availW < 82 || availD < 85)) {
        // Not enough lot for the grand plan; fall back to a humbler front
        style = weightedPick([[4, 'twin'], [3, 'twin-off'], [5, 'center'], [4, 'side']]);
    }
    const twin = style === 'twin' || style === 'twin-off' || style === 'cathedral';
    const cathedral = style === 'cathedral';
    const mission = !twin && Math.random() < 0.18;

    // Palette, rolled once per church
    const wallC = pickChurchColor(mission ? MISSION_WALLS : CHURCH_WALLS);
    const roofC = mission ? { h: frand(10, 18), s: 55, l: 46 } : pickChurchColor(CHURCH_ROOFS);
    const spireC = !mission && Math.random() < 0.15 ? { h: 165, s: 30, l: 46 } : roofC;
    const pal = {
        wall: hsl(wallC.h, wallC.s, wallC.l),
        roof: hsl(roofC.h, roofC.s, roofC.l),
        spire: hsl(spireC.h, spireC.s, spireC.l),
        trim: hsl(wallC.h, wallC.s * 0.5, Math.min(90, wallC.l + 12)),
        glass: hsl(frand(220, 262), frand(42, 62), frand(55, 68)),
        louver: hsl(frand(212, 228), 7, frand(23, 31)),
        door: Math.random() < 0.25 ? hsl(frand(-4, 8), 55, 33) : hsl(frand(14, 24), 38, 22),
        clock: hsl(46, 35, 88),
        cross: hsl(45, 30, 55),
    };

    // Plan: aisles flank the nave; the clerestory is the band of high windows
    // an aisled nave gets when it rises well above the aisle roofs.
    const aisled = cathedral || (!mission && availW >= 76 && Math.random() < (twin ? 0.45 : 0.28));
    const clerestory = aisled && Math.random() < 0.72;

    let towerW = twin ? frand(11, 15) : style === 'side' ? frand(11, 16) : frand(12, 18);
    let naveW, aisleW = 0;
    if (aisled) {
        aisleW = frand(9, 14);
        const sideTake = twin ? 2 * Math.max(towerW - aisleW, 0) : style === 'side' ? towerW : 0;
        naveW = Math.min(frand(26, 36), availW - 2 * aisleW - sideTake);
        towerW = Math.min(towerW, aisleW + 4);   // twin towers ride the aisle strips
    } else {
        const sideTake = twin ? 2 * towerW : style === 'side' ? towerW : 0;
        naveW = Math.min(frand(28, 44), availW - sideTake);
    }
    naveW = Math.max(20, naveW);
    const towerD = towerW;

    // A lone side tower makes the front asymmetric; shift the whole composition
    // half a tower over so nave-plus-tower stays centered inside the lot.
    const sideDir = style === 'side' ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const cx = lotWidth / 2 - sideDir * towerW / 2;

    // The front: a center tower stands proud of the facade; other fronts sit on
    // the building line, or nearly so.
    const naveY = style === 'center' ? frontY + towerD
        : frontY + (Math.random() < 0.5 ? 0 : frand(1, 4));

    let naveL = availD - (naveY - frontY);
    naveW = Math.min(naveW, naveL / 1.15);       // keep the nave longer than wide

    // Something at the back: a polygonal apse, a squared-off chancel, or nothing
    let apse = cathedral
        ? weightedPick([[7, 'polygon'], [3, 'chancel']])
        : weightedPick([[4, 'polygon'], [3, 'chancel'], [3, 'none']]);
    if (mission && apse === 'polygon') apse = 'chancel';
    const apseW = naveW * frand(0.55, 0.75);
    let apseL = apse === 'polygon' ? apseW * 0.42 : apse === 'chancel' ? frand(12, 20) : 0;
    if (naveL - apseL < 1.15 * naveW) { apse = 'none'; apseL = 0; }
    naveL = Math.min(naveL - apseL, 2.8 * naveW);
    const naveX = cx - naveW / 2;
    const naveBackY = naveY + naveL;

    // Heights
    const shedRise = Math.min(3.5, aisleW * 0.3);  // aisle roofs lean on the nave
    let aisleH = 0, naveH;
    if (aisled) {
        aisleH = frand(11, 15);
        naveH = aisleH + shedRise + (clerestory ? frand(6.5, 9.5) : frand(2, 4));
    } else {
        naveH = frand(17, 25);
    }
    if (cathedral) naveH += 2;
    const naveRise = naveW * (mission ? frand(0.16, 0.24) : frand(0.42, 0.62));
    const ridgeZ = naveH + naveRise;

    // Towers
    const towers = [];
    const topPick = mission ? 'cap'
        : Math.random() < (cathedral ? 0.4 : twin ? 0.6 : 0.85) ? 'spire' : 'flat';
    function towerSpec(x, hScale, topStyle) {
        const t = {
            x, y: frontY, w: towerW,
            h: Math.max(naveH + 8, ridgeZ + frand(6, 16)) * hScale,
            top: topStyle, pal,
            spireH: towerW * frand(1.3, 2.1),
            twinBelfry: Math.random() < (cathedral ? 0.75 : 0.35),
            pinnacles: Math.random() < 0.75,
            cross: Math.random() < 0.8,
            clock: false, windows: 0, portal: null,
        };
        if (t.top === 'spire') t.h = Math.min(t.h, 96 - t.spireH);
        return t;
    }

    if (style === 'center') {
        const t = towerSpec(cx - towerW / 2, 1, topPick);
        t.portal = { w: towerW * frand(0.42, 0.55), top: frand(9, 12) };
        t.windows = Math.random() < 0.7 ? 1 : 2;
        t.clock = !mission && Math.random() < 0.35;
        towers.push(t);
    } else if (style === 'side') {
        const outerEdge = cx + sideDir * (naveW / 2 + aisleW);
        const t = towerSpec(sideDir < 0 ? outerEdge - towerW : outerEdge, 1, topPick);
        t.windows = Math.random() < 0.6 ? 1 : 0;
        t.clock = Math.random() < 0.3;
        towers.push(t);
    } else {
        const tl = towerSpec(cx - naveW / 2 - towerW, 1, topPick);
        let tr;
        if (style === 'twin-off') {
            // The pair that doesn't quite match: shorter, and maybe topped differently
            const otherTop = topPick === 'spire' ? 'flat' : 'spire';
            tr = towerSpec(cx + naveW / 2, frand(0.72, 0.9), Math.random() < 0.5 ? topPick : otherTop);
        } else {
            tr = towerSpec(cx + naveW / 2, 1, tl.top);
            tr.h = tl.h; tr.spireH = tl.spireH;
            tr.twinBelfry = tl.twinBelfry; tr.pinnacles = tl.pinnacles; tr.cross = tl.cross;
        }
        if (cathedral) {
            for (const t of [tl, tr]) t.portal = { w: towerW * 0.4, top: frand(8, 10) };
        }
        towers.push(tl, tr);
    }

    const parts = towers.map(makeTower);

    // Transept: a full-height cross arm to each side, toward the back
    let transept = null;
    const outerHalfW = naveW / 2 + aisleW;
    const armAvail = availW / 2 - outerHalfW - (style === 'side' ? towerW / 2 : 0);
    if (!mission && armAvail >= 7 && naveL >= 55 && Math.random() < (cathedral ? 0.7 : 0.4)) {
        const armLen = Math.min(frand(9, 16), armAvail);
        const armD = Math.min(frand(16, 24), naveL * 0.3);
        let y1 = Math.min(naveY + naveL * frand(0.6, 0.72) + armD / 2, naveBackY - 4);
        transept = { armLen, armD, y0: y1 - armD, y1 };
    }
    const armRise = transept ? Math.min(naveRise, transept.armD * 1.2) : 0;

    // Nave: the body of the church. Windows go high above the aisle roofs when
    // there is a clerestory, or all the way along the walls when there are no
    // aisles; an aisled nave without a clerestory keeps a blank strip instead.
    const naveWinW = frand(2.6, 4);
    const naveSpacing = frand(7.5, 11);
    const naveSill = aisled ? aisleH + shedRise + 1.2 : frand(4.5, 6.5);
    const naveTop = aisled ? naveH - 1.2 : naveH * frand(0.74, 0.85);
    const naveSideDetails = [];
    if (!aisled || clerestory) {
        for (const dir of [-1, 1]) {
            const wx = dir < 0 ? naveX : naveX + naveW;
            const at = dir < 0
                ? wallSurface(wx, naveBackY, wx, naveY)
                : wallSurface(wx, naveY, wx, naveBackY);
            const skip = [];
            if (transept) skip.push(skipRange(at, wx, transept.y0 - 1, wx, transept.y1 + 1));
            if (twin || (style === 'side' && dir === sideDir)) {
                skip.push(skipRange(at, wx, frontY - 1, wx, frontY + towerD + 1));
            }
            naveSideDetails.push(...archedRow(at, naveSill, naveTop, naveWinW, naveSpacing, pal.glass, skip));
        }
    }

    // The facade: portal, then a rose window or a grand arch riding up into the
    // gable -- unless a center tower is standing in front of it all.
    const facade = wallSurface(naveX, naveY, naveX + naveW, naveY);
    const facadeDetails = [];
    if (style !== 'center') {
        const pw = naveW * (cathedral ? frand(0.24, 0.3) : frand(0.16, 0.24));
        const ptop = cathedral ? frand(12, 15) : frand(10, 13);
        facadeDetails.push(archedPoly(facade, (naveW - pw) / 2, (naveW + pw) / 2, 0, ptop, pal.door));
        if (cathedral || Math.random() < 0.45) {
            const r = Math.min(naveW * 0.15, naveRise * 0.3);
            if (r > 1.5) facadeDetails.push(circlePoly(facade, naveW / 2, naveH + naveRise * 0.22, r, pal.glass));
        } else {
            const gw = naveW * frand(0.2, 0.28);
            facadeDetails.push(archedPoly(facade, (naveW - gw) / 2, (naveW + gw) / 2, ptop + 2.5, naveH + naveRise * frand(0.15, 0.3), pal.glass));
        }
        if (cathedral && Math.random() < 0.6) {
            // Blind arcade band between the portal and the rose
            const n = 5, w = 1.6, span = n * 2.6;
            for (let i = 0; i < n; i++) {
                const c = naveW / 2 + (i - (n - 1) / 2) * (span / n);
                facadeDetails.push(archedPoly(facade, c - w / 2, c + w / 2, ptop + 1.5, ptop + 5, pal.louver));
            }
        }
        if (naveW >= 34 && !cathedral) {
            for (const fu of [naveW * 0.18, naveW * 0.82]) {
                facadeDetails.push(archedPoly(facade, fu - 1.5, fu + 1.5, 5, Math.min(naveH * 0.7, ptop + 4), pal.glass));
            }
        }
    } else {
        // Center tower: windows on the two exposed strips of facade beside it
        const strip = (naveW - towerW) / 2;
        if (strip >= 7) {
            const wtop = naveH * frand(0.6, 0.75);
            for (const fu of [strip / 2, naveW - strip / 2]) {
                facadeDetails.push(archedPoly(facade, fu - 1.6, fu + 1.6, 5, wtop, pal.glass));
            }
        }
    }

    const naveChild = {
        polys: [
            ...makeRectangularPrism(naveX, naveY, 0, naveW, naveL, naveH, pal.wall, false),
            ...makeGableRoof(naveX, naveY, 0, naveW, naveL, naveH, false, pal.wall, pal.roof, naveRise),
        ],
        children: [{ polys: [...facadeDetails, ...naveSideDetails], children: [] }],
    };
    if (style !== 'center' && !mission && Math.random() < 0.5) {
        naveChild.polys.push(...makeCross(cx, naveY + 0.4, ridgeZ - 0.5, frand(3.5, 5), pal.cross));
    }
    parts.push(naveChild);

    // Aisles: low strips leaning on the nave, split where a transept arm crosses
    if (aisled) {
        const aisleFrontY = twin ? frontY + towerD : naveY;
        const aisleSill = frand(3.5, 5), aisleTop = aisleH * frand(0.72, 0.82);
        const aisleWinW = frand(2.4, 3.4), aisleSpacing = frand(7, 10);
        const p = (x, y, z) => ({ x, y, z });
        for (const dir of [-1, 1]) {
            const ax = dir < 0 ? naveX - aisleW : naveX + naveW;
            const inX = dir < 0 ? ax + aisleW : ax;      // edge against the nave
            const outX = dir < 0 ? ax : ax + aisleW;
            const segs = transept
                ? [[aisleFrontY, transept.y0], [transept.y1, naveBackY]]
                : [[aisleFrontY, naveBackY]];
            for (const [y0, y1] of segs) {
                if (y1 - y0 < 6) continue;
                const polys = [...makeRectangularPrism(ax, y0, 0, aisleW, y1 - y0, aisleH, pal.wall, false)];
                // Shed roof leaning on the nave wall
                polys.push(dir < 0
                    ? { pts: [p(outX, y1, aisleH), p(outX, y0, aisleH), p(inX, y0, aisleH + shedRise), p(inX, y1, aisleH + shedRise)], color: pal.roof }
                    : { pts: [p(outX, y0, aisleH), p(outX, y1, aisleH), p(inX, y1, aisleH + shedRise), p(inX, y0, aisleH + shedRise)], color: pal.roof });
                // Triangles closing the shed's exposed ends
                if (!transept || y0 !== transept.y1) {
                    polys.push(dir < 0
                        ? { pts: [p(outX, y0, aisleH), p(inX, y0, aisleH), p(inX, y0, aisleH + shedRise)], color: pal.wall }
                        : { pts: [p(inX, y0, aisleH), p(outX, y0, aisleH), p(inX, y0, aisleH + shedRise)], color: pal.wall });
                }
                if (!transept || y1 !== transept.y0) {
                    polys.push(dir < 0
                        ? { pts: [p(inX, y1, aisleH), p(outX, y1, aisleH), p(inX, y1, aisleH + shedRise)], color: pal.wall }
                        : { pts: [p(outX, y1, aisleH), p(inX, y1, aisleH), p(inX, y1, aisleH + shedRise)], color: pal.wall });
                }

                const at = dir < 0
                    ? wallSurface(outX, y1, outX, y0)
                    : wallSurface(outX, y0, outX, y1);
                const skip = [];
                if (style === 'side' && dir === sideDir) {
                    skip.push(skipRange(at, outX, frontY - 1, outX, frontY + towerD + 1));
                }
                const details = archedRow(at, aisleSill, aisleTop, aisleWinW, aisleSpacing, pal.glass, skip);
                if (y0 === aisleFrontY && !twin) {
                    const nf = wallSurface(ax, y0, ax + aisleW, y0);
                    details.push(archedPoly(nf, aisleW / 2 - 1.3, aisleW / 2 + 1.3, 4, aisleH * 0.75, pal.glass));
                }
                parts.push({ polys, children: [{ polys: details, children: [] }] });
            }
        }
    }

    // Transept arms, gabled to the same ridge height as the nave
    if (transept) {
        for (const dir of [-1, 1]) {
            const w = transept.armLen + aisleW;   // nave wall out past the aisle
            const wx = dir < 0 ? naveX - w : naveX + naveW;
            const polys = [
                ...makeRectangularPrism(wx, transept.y0, 0, w, transept.armD, naveH, pal.wall, false),
                ...makeGableRoof(wx, transept.y0, 0, w, transept.armD, naveH, true, pal.wall, pal.roof, armRise),
            ];
            const endFace = dir < 0
                ? wallSurface(wx, transept.y1, wx, transept.y0)
                : wallSurface(wx + w, transept.y0, wx + w, transept.y1);
            const details = [];
            if (cathedral && Math.random() < 0.7) {
                details.push(circlePoly(endFace, transept.armD / 2, naveH * 0.7, Math.min(transept.armD * 0.2, naveH * 0.16), pal.glass));
                details.push(...archedRow(endFace, 4, naveH * 0.45, 2.6, 6, pal.glass));
            } else {
                const gw = Math.min(6, transept.armD * 0.3);
                details.push(archedPoly(endFace, (transept.armD - gw) / 2, (transept.armD + gw) / 2, 5, naveH + armRise * 0.3, pal.glass));
            }
            // A window on the street side of the arm, clear of the aisle strip
            const frontFace = wallSurface(wx, transept.y0, wx + w, transept.y0);
            const skip = aisleW > 0
                ? [dir < 0 ? [transept.armLen, w] : [0, aisleW]]
                : [];
            details.push(...archedRow(frontFace, 5, naveH * 0.6, 2.6, 9, pal.glass, skip));
            parts.push({ polys, children: [{ polys: details, children: [] }] });
        }
    }

    // The back: polygonal apse (half-octagon with a faceted roof fan) or chancel
    if (apse === 'polygon') {
        const aw = apseW, ch = aw * 0.22, dSide = apseL * 0.45;
        const y0 = naveBackY, yb = naveBackY + apseL;
        const apseH = naveH * frand(0.55, 0.7);
        const pts = [
            { x: cx + aw / 2, y: y0 }, { x: cx + aw / 2, y: y0 + dSide },
            { x: cx + ch, y: yb }, { x: cx - ch, y: yb },
            { x: cx - aw / 2, y: y0 + dSide }, { x: cx - aw / 2, y: y0 },
        ];
        const polys = makeWalls(pts, 0, apseH, pal.wall, false);
        const apex = { x: cx, y: y0 + apseL * 0.45, z: apseH + Math.min(aw * 0.3, naveRise * 0.6) };
        for (let i = 0; i < 5; i++) {
            const a = pts[i], b = pts[i + 1];
            polys.push({ pts: [
                { x: a.x, y: a.y, z: apseH }, { x: b.x, y: b.y, z: apseH },
                { x: apex.x, y: apex.y, z: apex.z },
            ], color: pal.roof });
        }
        // Closing slope against the nave, for views from behind
        polys.push({ pts: [
            { x: cx - aw / 2, y: y0, z: apseH }, { x: cx + aw / 2, y: y0, z: apseH },
            { x: apex.x, y: apex.y, z: apex.z },
        ], color: pal.roof });
        const details = [];
        for (const i of [1, 2, 3]) {
            const a = pts[i], b = pts[i + 1];
            const at = wallSurface(a.x, a.y, b.x, b.y);
            if (at.len < 5) continue;
            details.push(archedPoly(at, at.len / 2 - 1.3, at.len / 2 + 1.3, 3.5, apseH * 0.8, pal.glass));
        }
        parts.push({ polys, children: [{ polys: details, children: [] }] });
    } else if (apse === 'chancel') {
        const cw = naveW * frand(0.6, 0.75), chH = naveH * frand(0.65, 0.8);
        const chX = cx - cw / 2;
        const polys = [
            ...makeRectangularPrism(chX, naveBackY, 0, cw, apseL, chH, pal.wall, false),
            ...makeGableRoof(chX, naveBackY, 0, cw, apseL, chH, false, pal.wall, pal.roof, Math.min(cw * 0.45, naveRise * 0.8)),
        ];
        const details = [];
        // Triple lancet on the back wall, the middle one taller
        const backAt = wallSurface(chX + cw, naveBackY + apseL, chX, naveBackY + apseL);
        for (const k of [-1, 0, 1]) {
            const c = cw / 2 + k * cw * 0.2;
            details.push(archedPoly(backAt, c - 1.2, c + 1.2, 4, chH * (k === 0 ? 0.85 : 0.72), pal.glass));
        }
        for (const dir of [-1, 1]) {
            const wx = dir < 0 ? chX : chX + cw;
            const at = dir < 0
                ? wallSurface(wx, naveBackY + apseL, wx, naveBackY)
                : wallSurface(wx, naveBackY, wx, naveBackY + apseL);
            details.push(...archedRow(at, 4, chH * 0.7, 2.4, 8, pal.glass));
        }
        parts.push({ polys, children: [{ polys: details, children: [] }] });
    }

    const root = { polys: [], children: parts };
    root.churchStyle = style;   // for tests and debugging; nothing draws this
    return root;
}

registerBuilding('church', { generate: generateChurch });
