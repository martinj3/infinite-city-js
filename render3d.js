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

// Lettering painted onto a quad -- a company name down a truck's box. The
// projection is affine, so the quad's four screen corners *are* the transform
// from the panel's own space to the canvas, exactly, at any camera angle: no
// perspective to approximate and nothing to re-derive per letter. The panel is
// PANEL_EM units tall and PANEL_EM * aspect wide, aspect being its real
// width/height in feet, so letters keep their proportions however the view
// squashes the face they sit on.
//
// sp is the projected quad wound as the reader sees it -- top-left, top-right,
// bottom-right, bottom-left -- which is also a front-facing winding, so the far
// flank's lettering culls along with its face (see makeFlankText).
const PANEL_EM = 100;

// Letters smaller than this on screen are a smudge, not a word, so the panel is
// left blank instead. This is the zoom cutoff for every kind of lettering, and it
// is the *letters* that are measured, not the panel: a long name shrunk to fit a
// narrow panel drops out sooner than a short one on the same panel, which is
// exactly when each stops being readable. The panel's width is held to the same
// bar, which is also what disposes of a face turned exactly edge-on: it projects
// to a sliver a rounding error wide, and lettering it is a transform with no
// inverse for no pixels.
const TEXT_MIN_PX = 5;

function drawPanelText(sp, str, color, aspect) {
    const tl = sp[0], tr = sp[1], bl = sp[3];
    const wide = PANEL_EM * aspect;
    const ux = tr[0] - tl[0], uy = tr[1] - tl[1];   // along the line of text
    const vx = bl[0] - tl[0], vy = bl[1] - tl[1];   // down it
    const down = Math.hypot(vx, vy);
    // How far the panel reaches across, measured square to that: a face turned
    // edge-on still projects to a line of some length, and it is this that goes
    // to zero, not the length of either edge.
    const across = Math.abs(ux * vy - uy * vx) / (down || 1);

    ctx.save();
    ctx.font = `bold ${PANEL_EM}px sans-serif`;
    // Shrink a long name to the panel's width; a short one is drawn at the
    // panel's full height.
    const w = ctx.measureText(str).width;
    const em = w > wide ? Math.max(1, Math.floor(PANEL_EM * wide / w)) : PANEL_EM;
    // The transform scales panel units by the panel's own projected size, so this
    // is the em the letters actually land at, in device pixels.
    if (em * down < TEXT_MIN_PX * PANEL_EM || across < TEXT_MIN_PX) {
        ctx.restore();
        return;
    }
    ctx.setTransform(ux / wide, uy / wide, vx / PANEL_EM, vy / PANEL_EM, tl[0], tl[1]);
    if (em !== PANEL_EM) ctx.font = `bold ${em}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, wide / 2, PANEL_EM / 2);
    ctx.restore();
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Project, backface-cull, depth-sort, and draw a batch of polygons.
// The sort is stable (spec-guaranteed), so exact depth ties keep their batch
// order: a detail pushed after the face it decorates still paints over it.
//
// A poly carrying `text` is lettered rather than filled, but is otherwise an
// ordinary poly: it culls, sorts and takes the light like the panel it lies on.
//
// staticLit: the polys are baked -- they never move or change color (buildings)
// -- so each one's lit color is computed once and kept on the poly. Lighting is
// world-space, so camera rotation cannot invalidate it. Vehicle polys rotate
// every frame, changing their normals, so they must not pass this.
function projectAndDraw(polys, ox, oy, camX, camY, staticLit = false) {
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

        const litColor = staticLit
            ? poly._lit || (poly._lit = applyLighting(poly.color, computeNormal(pts)))
            : applyLighting(poly.color, computeNormal(pts));
        projected.push({ sp, color: litColor, depth: depth / n, text: poly.text,
                         aspect: poly.text ? dist3(pts[0], pts[1]) / dist3(pts[0], pts[3]) : 0 });
    }

    projected.sort((a, b) => a.depth - b.depth);

    for (const { sp, color, text, aspect } of projected) {
        if (text) { drawPanelText(sp, text, color, aspect); continue; }
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
