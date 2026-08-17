// --- Draw helpers ---
function drawStraight(s) {
    const hw = s.props.width / 2;
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    ctx.save();
    ctx.translate(mx * PX_PER_FT, my * PX_PER_FT);
    ctx.rotate(a);
    const hl = (len / 2 + HALF_INTERSECTION) * PX_PER_FT;
    const hwPx = hw * PX_PER_FT;
    ctx.fillStyle = s.props.color;
    ctx.fillRect(-hl, -hwPx, hl * 2, hwPx * 2);
    ctx.restore();
}

function drawCurve(s) {
    const hw = s.props.width / 2;
    const { cx, cy, r, arcS, arcE, ccw } = s.curve;
    const pcx = cx * PX_PER_FT, pcy = cy * PX_PER_FT;
    const outerR = (r + hw) * PX_PER_FT;
    const innerR = (r - hw) * PX_PER_FT;

    // Road surface
    ctx.beginPath();
    ctx.arc(pcx, pcy, outerR, arcS, arcE, ccw);
    ctx.arc(pcx, pcy, innerR, arcE, arcS, !ccw);
    ctx.closePath();
    ctx.fillStyle = s.props.color;
    ctx.fill();
}

// --- Sidewalks ---
// A sidewalk on one side of a street runs until it reaches the near (curb-side) edge
// of the crossing street's sidewalk on that side; the node then fills the corner
// square between the two. Nothing crossing on that side means no trim at all, so the
// sidewalk runs straight through (T-intersections, dead ends).
// Does street s carry a sidewalk on the side facing the given world direction?
function swOnSide(s, worldAngle) {
    const sw = s.props.sidewalk;
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1); // chord is close enough for our arcs
    return Math.cos(worldAngle - a - Math.PI / 2) > 0 ? sw.right : sw.left;
}

// awayAngle: direction our street leaves the node. sideAngle: which side our band is on.
function crossTrim(x, y, awayAngle, sideAngle) {
    const n = getNode(x, y);
    if (!n) return HALF_INTERSECTION;
    const slot = findSlot(n.ori, sideAngle);
    const cross = slot ? n.streets[slot] : null;
    if (!cross) return 0;
    // Stop at the crossing sidewalk's curb edge, or at its roadway if it has no sidewalk here
    return swOnSide(cross, awayAngle) ? cross.props.sidewalk.inner : cross.props.width / 2;
}

function drawStraightSW(s) {
    const sw = s.props.sidewalk;
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    ctx.save();
    ctx.translate(mx * PX_PER_FT, my * PX_PER_FT);
    ctx.rotate(a);
    ctx.fillStyle = sw.color;
    for (const side of [1, -1]) { // +1 = local +y (right) side, -1 = local -y (left) side
        if (!(side > 0 ? sw.right : sw.left)) continue;
        const sideAngle = a + side * Math.PI / 2;
        const t1 = crossTrim(s.x1, s.y1, a, sideAngle);
        const t2 = crossTrim(s.x2, s.y2, a + Math.PI, sideAngle);
        if (t1 + t2 >= len) continue;
        const y = side > 0 ? sw.inner : -sw.outer;
        ctx.fillRect((-len / 2 + t1) * PX_PER_FT, y * PX_PER_FT,
            (len - t1 - t2) * PX_PER_FT, sw.width * PX_PER_FT);
    }
    ctx.restore();
}

function drawCurveSW(s) {
    const sw = s.props.sidewalk;
    const { cx, cy, r, arcS, arcE, ccw } = s.curve;
    const pcx = cx * PX_PER_FT, pcy = cy * PX_PER_FT;
    // Tangent headings at the two ends (arc angles lead/lag the heading by 90 deg)
    const q = ccw ? -Math.PI / 2 : Math.PI / 2;
    const h1 = arcS + q, h2 = arcE + q;
    ctx.fillStyle = sw.color;
    for (const side of [1, -1]) { // +1 = outside of the curve, -1 = inside
        // Outside of the curve is to the left of travel for a right-hand bend, and vice versa
        const sideSign = ccw ? side : -side;
        if (!(sideSign > 0 ? sw.right : sw.left)) continue;
        const t1 = crossTrim(s.x1, s.y1, h1, h1 + sideSign * Math.PI / 2) / r;
        const t2 = crossTrim(s.x2, s.y2, h2 + Math.PI, h2 + sideSign * Math.PI / 2) / r;
        const sweep = normA(ccw ? arcS - arcE : arcE - arcS);
        if (t1 + t2 >= sweep) continue;
        const ds = ccw ? arcS - t1 : arcS + t1;
        const de = ccw ? arcE + t2 : arcE - t2;
        const lo = Math.max(0, r + side * (side > 0 ? sw.inner : sw.outer));
        const hi = Math.max(0, r + side * (side > 0 ? sw.outer : sw.inner));
        ctx.beginPath();
        ctx.arc(pcx, pcy, hi * PX_PER_FT, ds, de, ccw);
        ctx.arc(pcx, pcy, lo * PX_PER_FT, de, ds, !ccw);
        ctx.closePath();
        ctx.fill();
    }
}

// Local-frame unit direction of each slot at a node (x = fwd, y = right)
const SLOT_VEC = { fwd: [1, 0], right: [0, 1], back: [-1, 0], left: [0, -1] };
const SLOT_CORNERS = [['fwd', 'right'], ['right', 'back'], ['back', 'left'], ['left', 'fwd']];

// The corner pieces joining the sidewalks of the streets that meet here. Each corner
// spans the crossing street's sidewalk band along one axis and this street's along the
// other, so both strips butt into it.
function drawNodeSW(n) {
    let drew = false;
    for (const [sa, sb] of SLOT_CORNERS) {
        const a = n.streets[sa], b = n.streets[sb];
        if (!a || !b) continue;
        // Only join if both streets actually have a sidewalk facing this corner
        if (!swOnSide(a, slotAngle(n.ori, sb)) || !swOnSide(b, slotAngle(n.ori, sa))) continue;
        if (!drew) {
            ctx.save();
            ctx.translate(n.x * PX_PER_FT, n.y * PX_PER_FT);
            ctx.rotate(n.ori);
            drew = true;
        }
        const swA = a.props.sidewalk, swB = b.props.sidewalk;
        const ua = SLOT_VEC[sa], ub = SLOT_VEC[sb];
        const p1x = swB.inner * ua[0] + swA.inner * ub[0], p1y = swB.inner * ua[1] + swA.inner * ub[1];
        const p2x = swB.outer * ua[0] + swA.outer * ub[0], p2y = swB.outer * ua[1] + swA.outer * ub[1];
        ctx.fillStyle = swA.color;
        ctx.fillRect(Math.min(p1x, p2x) * PX_PER_FT, Math.min(p1y, p2y) * PX_PER_FT,
            Math.abs(p2x - p1x) * PX_PER_FT, Math.abs(p2y - p1y) * PX_PER_FT);
    }
    if (drew) ctx.restore();
}

function drawStraightCL(s) {
    if (!s.props.hasYellowLines) return;
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo((s.x1 + ca * HALF_INTERSECTION) * PX_PER_FT, (s.y1 + sa * HALF_INTERSECTION) * PX_PER_FT);
    ctx.lineTo((s.x2 - ca * HALF_INTERSECTION) * PX_PER_FT, (s.y2 - sa * HALF_INTERSECTION) * PX_PER_FT);
    ctx.stroke();
}

function drawCurveCL(s) {
    if (!s.props.hasYellowLines) return;
    const { cx, cy, r, arcS, arcE, ccw } = s.curve;
    const off = HALF_INTERSECTION / r;
    const ds = ccw ? arcS - off : arcS + off;
    const de = ccw ? arcE + off : arcE - off;
    ctx.beginPath();
    ctx.arc(cx * PX_PER_FT, cy * PX_PER_FT, r * PX_PER_FT, ds, de, ccw);
    ctx.stroke();
}

function drawStraightWL(s) {
    if (!s.props.hasWhiteLines) return;
    const hw = s.props.width / 2 - 1; // 1ft inset from edge
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const ca = Math.cos(a), sa = Math.sin(a);
    const perp_x = -sa * hw, perp_y = ca * hw;
    // Start/end pulled in by HALF_INTERSECTION to avoid drawing in intersections
    const sx = s.x1 + ca * HALF_INTERSECTION, sy = s.y1 + sa * HALF_INTERSECTION;
    const ex = s.x2 - ca * HALF_INTERSECTION, ey = s.y2 - sa * HALF_INTERSECTION;
    ctx.beginPath();
    ctx.moveTo((sx + perp_x) * PX_PER_FT, (sy + perp_y) * PX_PER_FT);
    ctx.lineTo((ex + perp_x) * PX_PER_FT, (ey + perp_y) * PX_PER_FT);
    ctx.moveTo((sx - perp_x) * PX_PER_FT, (sy - perp_y) * PX_PER_FT);
    ctx.lineTo((ex - perp_x) * PX_PER_FT, (ey - perp_y) * PX_PER_FT);
    ctx.stroke();
}

function drawCurveWL(s) {
    if (!s.props.hasWhiteLines) return;
    const hw = s.props.width / 2 - 1; // 1ft inset from edge
    const { cx, cy, r, arcS, arcE, ccw } = s.curve;
    const off = HALF_INTERSECTION / r;
    const ds = ccw ? arcS - off : arcS + off;
    const de = ccw ? arcE + off : arcE - off;
    ctx.beginPath();
    ctx.arc(cx * PX_PER_FT, cy * PX_PER_FT, (r + hw) * PX_PER_FT, ds, de, ccw);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx * PX_PER_FT, cy * PX_PER_FT, (r - hw) * PX_PER_FT, ds, de, ccw);
    ctx.stroke();
}

// Set up the rotated isometric camera (VIEW_ANGLE, Y_SCALE from constants.js).
// Leaves the transform on the stack -- callers must ctx.restore().
function applyCamera(camX, camY) {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(1, Y_SCALE);
    ctx.rotate(VIEW_ANGLE);
    ctx.translate(-camX * PX_PER_FT, -camY * PX_PER_FT);
}

// --- Main draw ---
// The world as seen from (camX, camY): grass, streets, intersections, sidewalks,
// markings. No car and no HUD, so any page can use it (see streetTest.html).
function drawScene(camX, camY) {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2d8a2e';
    ctx.fillRect(0, 0, W, H);

    const diagFt = Math.hypot(W, H) / PX_PER_FT / 2 + 200;
    const vl = camX - diagFt, vr = camX + diagFt;
    const vt = camY - diagFt, vb = camY + diagFt;

    applyCamera(camX, camY);

    // Cull once: every pass below walks only what is actually on screen, which
    // on a long-driven map is a sliver of the thousands of streets built.
    const visStreets = [], visNodes = [];
    for (const s of streets) {
        const b = s.bounds;
        if (b.mxx < vl || b.mnx > vr || b.mxy < vt || b.mny > vb) continue;
        visStreets.push(s);
    }
    for (const n of nodes.values()) {
        if (n.x < vl || n.x > vr || n.y < vt || n.y > vb) continue;
        visNodes.push(n);
    }

    // 1) Road surfaces + edge lines
    for (const s of visStreets) s.curve ? drawCurve(s) : drawStraight(s);

    // 2) Intersection squares (fixed size to accommodate all street widths)
    for (const n of visNodes) {
        ctx.save();
        ctx.fillStyle = n.color || '#666';
        ctx.translate(n.x * PX_PER_FT, n.y * PX_PER_FT);
        ctx.rotate(n.ori);
        const hs = HALF_INTERSECTION * PX_PER_FT;
        ctx.fillRect(-hs, -hs, hs * 2, hs * 2);
        ctx.restore();
    }

    // 3) Sidewalks (strips along each street, plus corner joins at intersections)
    for (const s of visStreets) s.curve ? drawCurveSW(s) : drawStraightSW(s);
    for (const n of visNodes) drawNodeSW(n);

    if (PX_PER_FT >= MARKINGS_MIN_ZOOM) {
        // 4) Center lane markings
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 1;
        ctx.setLineDash([10 * PX_PER_FT, 10 * PX_PER_FT]);
        for (const s of visStreets) s.curve ? drawCurveCL(s) : drawStraightCL(s);
        ctx.setLineDash([]);

        // 5) White edge lines (solid, 1ft inset from street edges)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        for (const s of visStreets) s.curve ? drawCurveWL(s) : drawStraightWL(s);
    }

    ctx.restore();

    // 6) Buildings on their lots. These are 3D and project themselves, so they are
    // drawn in screen space once the ground layers are done.
    if (typeof drawLots === 'function') drawLots(camX, camY, vl, vr, vt, vb);
}

// The driving game: the world, plus the car and its HUD.
function draw() {
    const W = canvas.width, H = canvas.height;
    drawScene(player.x, player.y);

    // Player's car. Like the buildings it is 3D and projects itself, so it goes on
    // in screen space after the ground layers rather than under the 2D camera.
    drawVehicle(player.vehicle, player.x, player.y, player.angle, player.steer,
                player.x, player.y);

    // HUD
    const mph = Math.abs(player.speed * 3600 / 5280);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, 140, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${mph.toFixed(0)} mph`, 16, 32);
    ctx.font = '13px monospace';
    ctx.fillText(`Streets: ${streets.length}`, 16, 52);

    // Nothing to tell someone with no keyboard, and it would sit under the pedals
    if (instructionAlpha > 0 && !touchDrive.shown) {
        ctx.globalAlpha = instructionAlpha;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W / 2 - 200, H - 80, 400, 50);
        ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Arrows: drive  Q/E: rotate  R/F: tilt', W / 2, H - 50);
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
}
