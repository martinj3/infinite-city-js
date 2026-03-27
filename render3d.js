// --- 3D isometric rendering utilities ---
// Requires: constants.js (PX_PER_FT, COS_V, SIN_V, Y_SCALE), lighting.js (computeNormal, applyLighting)
// Requires globals: canvas, ctx

// Project a 3D world point to 2D screen coordinates.
// Height (z) goes straight up on screen, independent of the isometric rotation.
function project(wx, wy, wz, camX, camY) {
    const dx = (wx - camX) * PX_PER_FT;
    const dy = (wy - camY) * PX_PER_FT;
    const rx = dx * COS_V - dy * SIN_V;
    const ry = dx * SIN_V + dy * COS_V;
    return [
        rx + canvas.width / 2,
        ry * Y_SCALE - wz * PX_PER_FT + canvas.height / 2
    ];
}

// Compute depth value for a single polygon (for sorting).
function polyDepth(poly, ox, oy, camX, camY) {
    const sp = poly.pts.map(p => project(p.x + ox, p.y + oy, p.z, camX, camY));
    const avgScreenY = sp.reduce((s, p) => s + p[1], 0) / sp.length;
    const avgZ = poly.pts.reduce((s, p) => s + p.z, 0) / poly.pts.length;
    return avgScreenY + 2 * avgZ * PX_PER_FT;
}

// Project, backface-cull, depth-sort, and draw a batch of polygons.
function projectAndDraw(polys, ox, oy, camX, camY) {
    const projected = [];
    for (const poly of polys) {
        const sp = poly.pts.map(p => project(p.x + ox, p.y + oy, p.z, camX, camY));

        // Backface culling: skip if screen-space cross product <= 0
        const cross = (sp[1][0] - sp[0][0]) * (sp[2][1] - sp[0][1])
                    - (sp[1][1] - sp[0][1]) * (sp[2][0] - sp[0][0]);
        if (cross <= 0) continue;

        const normal = computeNormal(poly.pts);
        const litColor = applyLighting(poly.color, normal);
        const avgScreenY = sp.reduce((s, p) => s + p[1], 0) / sp.length;
        const avgZ = poly.pts.reduce((s, p) => s + p.z, 0) / poly.pts.length;
        const depth = avgScreenY + 2 * avgZ * PX_PER_FT;
        projected.push({ sp, color: litColor, depth });
    }

    projected.sort((a, b) => a.depth - b.depth);

    for (const { sp, color } of projected) {
        ctx.beginPath();
        ctx.moveTo(sp[0][0], sp[0][1]);
        for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
