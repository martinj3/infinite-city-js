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

// --- Main draw ---
function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2d8a2e';
    ctx.fillRect(0, 0, W, H);

    // Rotated camera: isometric view (VIEW_ANGLE, Y_SCALE from constants.js)
    const diagFt = Math.hypot(W, H) / PX_PER_FT / 2 + 200;
    const vl = player.x - diagFt, vr = player.x + diagFt;
    const vt = player.y - diagFt, vb = player.y + diagFt;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, Y_SCALE);
    ctx.rotate(VIEW_ANGLE);
    ctx.translate(-player.x * PX_PER_FT, -player.y * PX_PER_FT);

    // 1) Road surfaces + edge lines
    for (const s of streets) {
        const b = s.bounds;
        if (b.mxx < vl || b.mnx > vr || b.mxy < vt || b.mny > vb) continue;
        s.curve ? drawCurve(s) : drawStraight(s);
    }

    // 2) Intersection squares (fixed size to accommodate all street widths)
    for (const [, n] of nodes) {
        if (n.x < vl || n.x > vr || n.y < vt || n.y > vb) continue;
        ctx.save();
        ctx.fillStyle = n.color || '#666';
        ctx.translate(n.x * PX_PER_FT, n.y * PX_PER_FT);
        ctx.rotate(n.ori);
        const hs = HALF_INTERSECTION * PX_PER_FT;
        ctx.fillRect(-hs, -hs, hs * 2, hs * 2);
        ctx.restore();
    }

    // 3) Center lane markings
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.setLineDash([10 * PX_PER_FT, 10 * PX_PER_FT]);
    for (const s of streets) {
        const b = s.bounds;
        if (b.mxx < vl || b.mnx > vr || b.mxy < vt || b.mny > vb) continue;
        s.curve ? drawCurveCL(s) : drawStraightCL(s);
    }
    ctx.setLineDash([]);

    // 4) White edge lines (solid, 1ft inset from street edges)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    for (const s of streets) {
        const b = s.bounds;
        if (b.mxx < vl || b.mnx > vr || b.mxy < vt || b.mny > vb) continue;
        s.curve ? drawCurveWL(s) : drawStraightWL(s);
    }

    // 5) Player
    const px = player.x * PX_PER_FT, py = player.y * PX_PER_FT;
    const hl = (CAR_LENGTH / 2) * PX_PER_FT, hw = (CAR_WIDTH / 2) * PX_PER_FT;
    const notch = (CAR_LENGTH / 4) * PX_PER_FT;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(hl, 0); ctx.lineTo(-hl, -hw); ctx.lineTo(-notch, 0); ctx.lineTo(-hl, hw);
    ctx.closePath();
    ctx.fillStyle = '#e33'; ctx.fill();
    ctx.strokeStyle = '#a00'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    ctx.restore();

    // HUD
    const mph = Math.abs(player.speed * 3600 / 5280);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, 140, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${mph.toFixed(0)} mph`, 16, 32);
    ctx.font = '13px monospace';
    ctx.fillText(`Streets: ${streets.length}`, 16, 52);

    if (instructionAlpha > 0) {
        ctx.globalAlpha = instructionAlpha;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W / 2 - 200, H - 80, 400, 50);
        ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Arrows: drive  Q/E: rotate  R/F: tilt', W / 2, H - 50);
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
}
