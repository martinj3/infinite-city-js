// --- Generic 3D drawing utilities (all units in feet) ---
// Geometry and drawable-tree helpers with nothing building-specific about them,
// so other things placed in the world (vehicles, trees, street furniture) can
// reuse them. Renderer-agnostic: drawing is done through callbacks supplied by
// the caller (see render3d.js).
//
// A Drawable is a tree: { polys: [...], children: [Drawable...] }
// A poly is { pts: [{x,y,z}, ...], color: string }

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
