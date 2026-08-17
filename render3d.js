// --- 3D isometric rendering utilities ---
// Requires: constants.js (PX_PER_FT, getCosV, getSinV, Y_SCALE), lighting.js (computeNormal, applyLighting)
// Requires globals: canvas, ctx

// Project a 3D world point to 2D screen coordinates.
// Height (z) goes straight up on screen, independent of the isometric rotation.
function project(wx, wy, wz, camX, camY) {
    const dx = (wx - camX) * PX_PER_FT;
    const dy = (wy - camY) * PX_PER_FT;
    const cosV = getCosV(), sinV = getSinV();
    const rx = dx * cosV - dy * sinV;
    const ry = dx * sinV + dy * cosV;
    return [
        rx + canvas.width / 2,
        ry * Y_SCALE - wz * PX_PER_FT + canvas.height / 2
    ];
}

// Depth value for painter's-algorithm sorting: the polygon's footprint projected
// flat onto the ground, ignoring height entirely -- the average of the rotated
// forward (down-screen) coordinate. In this projection a view ray only ever moves
// AWAY along the ground as it climbs, so ground depth alone is occlusion order:
// paint from the top of the screen downward. Height must NOT contribute, or a
// tall far tower outsorts a near low roof (the old church/wing bug). Coplanar
// stacked details (grilles, badges, taillights) order by their small outward
// pushes, which move them toward the camera whenever their face is visible.
// Units are feet of ground depth; only the ordering matters.
function polyDepth(poly, ox, oy, camX, camY) {
    const cosV = getCosV(), sinV = getSinV();
    const wx = ox - camX, wy = oy - camY;
    let d = 0;
    for (const p of poly.pts) d += (p.x + wx) * sinV + (p.y + wy) * cosV;
    return d / poly.pts.length;
}

// Project, backface-cull, depth-sort, and draw a batch of polygons.
// The sort is stable (spec-guaranteed), so exact depth ties keep their batch
// order: a detail pushed after the face it decorates still paints over it.
function projectAndDraw(polys, ox, oy, camX, camY) {
    const cosV = getCosV(), sinV = getSinV();
    const halfW = canvas.width / 2, halfH = canvas.height / 2;
    const oxc = ox - camX, oyc = oy - camY;

    const projected = [];
    for (const poly of polys) {
        const pts = poly.pts, n = pts.length;
        const sp = new Array(n);
        let depth = 0;
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const dx = (p.x + oxc) * PX_PER_FT;
            const dy = (p.y + oyc) * PX_PER_FT;
            const ry = dx * sinV + dy * cosV;
            sp[i] = [dx * cosV - dy * sinV + halfW,
                     ry * Y_SCALE - p.z * PX_PER_FT + halfH];
            depth += ry;
        }

        // Backface culling: skip if screen-space cross product <= 0
        const cross = (sp[1][0] - sp[0][0]) * (sp[2][1] - sp[0][1])
                    - (sp[1][1] - sp[0][1]) * (sp[2][0] - sp[0][0]);
        if (cross <= 0) continue;

        const normal = computeNormal(pts);
        const litColor = applyLighting(poly.color, normal);
        projected.push({ sp, color: litColor, depth: depth / n });
    }

    projected.sort((a, b) => a.depth - b.depth);

    for (const { sp, color } of projected) {
        ctx.beginPath();
        ctx.moveTo(sp[0][0], sp[0][1]);
        for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        //ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        //ctx.lineWidth = 1;
        //ctx.stroke();
    }
}
