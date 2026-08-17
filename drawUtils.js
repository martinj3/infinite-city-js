// --- Generic 3D drawing utilities (all units in feet) ---
// Geometry and drawable-tree helpers with nothing building-specific about them,
// so other things placed in the world (vehicles, trees, street furniture) can
// reuse them. Renderer-agnostic: drawing is done through callbacks supplied by
// the caller (see render3d.js).
//
// A Drawable is a tree: { polys: [...], children: [Drawable...] }
// A poly is { pts: [{x,y,z}, ...], color: string }

// CSS hsl() color string, with the components clamped to legal ranges so callers
// can jitter a palette entry without worrying about running off either end.
function hsl(h, s, l) {
    return `hsl(${Math.round(h)}, ${Math.round(Math.max(0, Math.min(100, s)))}%, ${Math.round(Math.max(0, Math.min(100, l)))}%)`;
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

// A faceted surface of revolution around a line parallel to the x axis: a drum, a
// tank, a barrel. `stations` are cross-sections in increasing-x order, each
// { x, z, r } -- the centre of that section and its radius -- so a varying r gives
// the taper and a varying z lets the whole axis tilt. `sides` is how many facets
// make up the circumference; 8 reads as round at vehicle scale.
//
// `color` is one colour for the whole surface, or a function of the ring index
// (0 spans stations[0]-stations[1]) for a band of another colour partway along.
//
// Both ends are capped. The caps default to the surface colour, but can be given
// their own -- a dark cap is how a drum gets an open mouth without interior faces
// (which would be backfaces, culled, leaving a hole to see through). capLo is the
// cap at stations[0], facing -x; capHi faces +x. Winding matches
// makeRectangularPrism, so culling and lighting treat the facets like any wall.
function makeLatheX(stations, sides, color, capLo, capHi) {
    const ringColor = typeof color === 'function' ? color : () => color;
    capLo = capLo || ringColor(0);
    capHi = capHi || ringColor(stations.length - 2);
    const ring = s => {
        const pts = [];
        for (let j = 0; j < sides; j++) {
            const a = (j / sides) * Math.PI * 2;
            pts.push({ x: s.x, y: s.r * Math.sin(a), z: s.z + s.r * Math.cos(a) });
        }
        return pts;
    };
    const rings = stations.map(ring);
    const faces = [];
    faces.push({ pts: rings[0].slice(), color: capLo });
    faces.push({ pts: rings[rings.length - 1].slice().reverse(), color: capHi });
    for (let i = 0; i + 1 < rings.length; i++) {
        for (let j = 0; j < sides; j++) {
            const k = (j + 1) % sides;
            faces.push({ pts: [rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]]
                .map(p => ({ x: p.x, y: p.y, z: p.z })), color: ringColor(i) });
        }
    }
    return faces;
}

// Side walls of an extruded footprint: one quad per edge of pts, from z0 up by h.
// pts run in the same winding order makeRectangularPrism's footprint does
// ((0,0) -> (w,0) -> (w,l) -> (0,l)), i.e. with the outside on the right walking
// A -> B. closeLoop=false leaves the last-to-first edge open, for a shape whose
// open side butts against another wall. No top or bottom faces.
function makeWalls(pts, z0, h, color, closeLoop = true) {
    const faces = [];
    const n = closeLoop ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        faces.push({ pts: [
            { x: a.x, y: a.y, z: z0 },
            { x: b.x, y: b.y, z: z0 },
            { x: b.x, y: b.y, z: z0 + h },
            { x: a.x, y: a.y, z: z0 + h },
        ], color });
    }
    return faces;
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

// Translate all polygon vertices in-place in the x/y plane.
function translatePolys(polys, dx, dy) {
    for (const poly of polys) {
        for (const p of poly.pts) { p.x += dx; p.y += dy; }
    }
}

// Recursively translate all polys in a drawable tree. Used to bake a drawable
// generated in local coordinates into world coordinates.
function translateDrawable(drawable, dx, dy) {
    translatePolys(drawable.polys, dx, dy);
    for (const child of drawable.children) {
        translateDrawable(child, dx, dy);
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

// Depth is linear in the points, so the average of the per-poly depths equals
// the depth of one averaged point -- which is computed once and cached on the
// drawable, instead of re-walking every poly (a church's worth of windows)
// every frame. Safe because trees are baked into place before they are first
// drawn and never move again.
function avgDrawableDepth(drawable, ox, oy, depthFn) {
    if (drawable.polys.length === 0) return -Infinity;
    if (!drawable._depthPoly) {
        let x = 0, y = 0;
        for (const poly of drawable.polys) {
            let px = 0, py = 0;
            for (const p of poly.pts) { px += p.x; py += p.y; }
            x += px / poly.pts.length;
            y += py / poly.pts.length;
        }
        const n = drawable.polys.length;
        drawable._depthPoly = { pts: [{ x: x / n, y: y / n, z: 0 }] };
    }
    return depthFn(drawable._depthPoly, ox, oy);
}
