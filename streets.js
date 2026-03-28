// --- Map data ---
const nodes = new Map(); // key "x,y" -> { x, y, ori, roads:{fwd,right,back,left} }
const streets = [];      // { x1,y1,x2,y2, curve:null|{cx,cy,r,arcS,arcE,ccw}, bounds }

function nkey(x, y) { return `${Math.round(x)},${Math.round(y)}`; }
function getNode(x, y) { return nodes.get(nkey(x, y)); }

function addNode(x, y, ori) {
    const k = nkey(x, y);
    if (nodes.has(k)) return nodes.get(k);
    const n = {
        x: Math.round(x), y: Math.round(y),
        ori: normA(ori),
        roads: { fwd: null, right: null, back: null, left: null }
    };
    nodes.set(k, n);
    return n;
}

function blockLen() {
    return Math.random() < 0.2 ? Math.round(200 + Math.random() * 500) : DEFAULT_BLOCK_LEN;
}

function pushStreet(x1, y1, x2, y2, curve) {
    const s = { x1, y1, x2, y2, curve };
    if (curve) {
        const b = arcBounds(curve);
        s.bounds = { mnx: b.mnx - HALF_STREET, mxx: b.mxx + HALF_STREET,
                     mny: b.mny - HALF_STREET, mxy: b.mxy + HALF_STREET };
    } else {
        s.bounds = {
            mnx: Math.min(x1, x2) - HALF_STREET, mxx: Math.max(x1, x2) + HALF_STREET,
            mny: Math.min(y1, y2) - HALF_STREET, mxy: Math.max(y1, y2) + HALF_STREET
        };
    }
    streets.push(s);
}

// --- Conflict detection ---
function ptInRotRect(px, py, cx, cy, hl, hw, angle) {
    const dx = px - cx, dy = py - cy;
    const c = Math.cos(-angle), s = Math.sin(-angle);
    return Math.abs(dx * c - dy * s) < hl && Math.abs(dx * s + dy * c) < hw;
}

function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (dx-cx)*(ay-cy) - (dy-cy)*(ax-cx);
    const d2 = (dx-cx)*(by-cy) - (dy-cy)*(bx-cx);
    const d3 = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax);
    const d4 = (bx-ax)*(dy-ay) - (by-ay)*(dx-ax);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        const den = (bx-ax)*(dy-cy) - (by-ay)*(dx-cx);
        if (Math.abs(den) < 1e-10) return null;
        const t = ((cx-ax)*(dy-cy) - (cy-ay)*(dx-cx)) / den;
        return { x: ax + t * (bx-ax), y: ay + t * (by-ay) };
    }
    return null;
}

function checkConflict(ax, ay, bx, by) {
    for (const s of streets) {
        // Skip streets connected to our starting intersection
        if (Math.hypot(ax - s.x1, ay - s.y1) < 1 || Math.hypot(ax - s.x2, ay - s.y2) < 1) continue;

        if (s.curve) {
            // Simplified bounding box of curve endpoints + ROW padding
            const mnx = Math.min(s.x1, s.x2) - RIGHT_OF_WAY;
            const mxx = Math.max(s.x1, s.x2) + RIGHT_OF_WAY;
            const mny = Math.min(s.y1, s.y2) - RIGHT_OF_WAY;
            const mxy = Math.max(s.y1, s.y2) + RIGHT_OF_WAY;
            if (bx > mnx && bx < mxx && by > mny && by < mxy) return true;
        } else {
            // Right-of-way: rotated rectangle along existing street
            const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
            const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
            if (ptInRotRect(bx, by, mx, my, len / 2 - HALF_STREET, RIGHT_OF_WAY, a)) return true;

            // Crossing check: new chord vs existing straight
            const cr = segsCross(ax, ay, bx, by, s.x1, s.y1, s.x2, s.y2);
            if (cr && !getNode(cr.x, cr.y)) return true;
        }
    }
    return false;
}

// --- Generation ---
function tryAddRoad(node, slot, nx, ny, endH, curve) {
    if (checkConflict(node.x, node.y, nx, ny)) return false;

    let target = null, tooClose = false;
    for (const [, other] of nodes) {
        if (other.x === node.x && other.y === node.y) continue;
        const d = Math.hypot(other.x - nx, other.y - ny);
        if (d < 1) {
            const arr = normA(endH + Math.PI);
            const ms = findSlot(other.ori, arr);
            if (ms && other.roads[ms] === null) { target = other; }
            else return false;
            break;
        }
        if (d < PROXIMITY_THRESHOLD) { tooClose = true; break; }
    }
    if (tooClose) return false;

    if (!target) {
        target = addNode(nx, ny, endH);
        target.roads.back = true;
    } else {
        const arr = normA(endH + Math.PI);
        target.roads[findSlot(target.ori, arr)] = true;
    }

    node.roads[slot] = true;
    pushStreet(node.x, node.y, target.x, target.y, curve);

    // If target is now fully resolved, re-open false directions for future generation
    if (!Object.values(target.roads).some(v => v === null)) {
        for (const d of GEN_SLOTS) {
            if (target.roads[d] === false) target.roads[d] = null;
        }
    }
    return true;
}

function tryStraight(node, slot, heading) {
    const len = blockLen();
    const nx = Math.round(node.x + Math.cos(heading) * len);
    const ny = Math.round(node.y + Math.sin(heading) * len);
    return tryAddRoad(node, slot, nx, ny, heading, null);
}

function tryCurve(node, slot, heading) {
    const turn = CURVE_ANGLES[Math.floor(Math.random() * CURVE_ANGLES.length)];
    const r = CURVE_RADII[Math.floor(Math.random() * CURVE_RADII.length)];
    const right = Math.random() < 0.5;
    const { ex, ey, eh, cx, cy, arcS, arcE, ccw } = calcCurve(node.x, node.y, heading, turn, r, right);
    return tryAddRoad(node, slot, Math.round(ex), Math.round(ey), eh,
        { cx, cy, r, arcS, arcE, ccw });
}

function resolveNode(node) {
    for (const slot of GEN_SLOTS) {
        if (node.roads[slot] !== null) continue;
        const prob = slot === 'fwd' ? 0.8 : 0.6;
        if (Math.random() >= prob) { node.roads[slot] = false; continue; }

        const heading = slotAngle(node.ori, slot);
        let ok = false;
        if (Math.random() < CURVE_PROB) ok = tryCurve(node, slot, heading);
        if (!ok) ok = tryStraight(node, slot, heading);
        if (!ok) node.roads[slot] = false;
    }
}

function generate(px, py) {
    for (const [, node] of nodes) {
        if (Math.hypot(node.x - px, node.y - py) < GENERATE_DIST) {
            if (SLOTS.some(s => node.roads[s] === null)) resolveNode(node);
        }
    }
}
