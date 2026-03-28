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

// --- Street properties ---
function randomStreetColor() {
    // Base grey with random shading variation
    const base = 102; // ~#666
    const vary = Math.floor(Math.random() * 30 - 15); // -15 to +14
    const v = Math.max(70, Math.min(130, base + vary));
    return `rgb(${v},${v},${v})`;
}

function generateStreetProps() {
    const hasYellowLines = Math.random() < 0.7;
    return {
        width: Math.round(MIN_STREET_WIDTH + Math.random() * (MAX_STREET_WIDTH - MIN_STREET_WIDTH)),
        color: randomStreetColor(),
        hasYellowLines,
        hasWhiteLines: hasYellowLines && Math.random() < 0.7
    };
}

function propagateProps(sourceProps, slot) {
    // fwd: 20% re-roll, left/right: 40% re-roll
    const rerollChance = slot === 'fwd' ? 0.2 : 0.4;
    if (!sourceProps || Math.random() < rerollChance) return generateStreetProps();
    return { width: sourceProps.width, color: sourceProps.color,
             hasYellowLines: sourceProps.hasYellowLines, hasWhiteLines: sourceProps.hasWhiteLines };
}

function findSourceStreet(node) {
    // Find the street that connects to this node's back slot
    for (const s of streets) {
        if ((Math.hypot(node.x - s.x1, node.y - s.y1) < 1) ||
            (Math.hypot(node.x - s.x2, node.y - s.y2) < 1)) {
            return s;
        }
    }
    return null;
}

function pushStreet(x1, y1, x2, y2, curve, props) {
    props = props || generateStreetProps();
    const hw = props.width / 2;
    const s = { x1, y1, x2, y2, curve, props };
    if (curve) {
        const b = arcBounds(curve);
        s.bounds = { mnx: b.mnx - hw, mxx: b.mxx + hw,
                     mny: b.mny - hw, mxy: b.mxy + hw };
    } else {
        s.bounds = {
            mnx: Math.min(x1, x2) - hw, mxx: Math.max(x1, x2) + hw,
            mny: Math.min(y1, y2) - hw, mxy: Math.max(y1, y2) + hw
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
            if (ptInRotRect(bx, by, mx, my, len / 2 - HALF_INTERSECTION, RIGHT_OF_WAY, a)) return true;

            // Crossing check: new chord vs existing straight
            const cr = segsCross(ax, ay, bx, by, s.x1, s.y1, s.x2, s.y2);
            if (cr && !getNode(cr.x, cr.y)) return true;
        }
    }
    return false;
}

// --- Generation ---
function tryAddRoad(node, slot, nx, ny, endH, curve, props) {
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
        target.color = props.color;
    } else {
        const arr = normA(endH + Math.PI);
        target.roads[findSlot(target.ori, arr)] = true;
        if (!target.color) target.color = props.color;
    }

    node.roads[slot] = true;
    pushStreet(node.x, node.y, target.x, target.y, curve, props);

    // If target is now fully resolved, re-open false directions for future generation
    if (!Object.values(target.roads).some(v => v === null)) {
        for (const d of GEN_SLOTS) {
            if (target.roads[d] === false) target.roads[d] = null;
        }
    }
    return true;
}

function tryStraight(node, slot, heading, props) {
    const len = blockLen();
    const nx = Math.round(node.x + Math.cos(heading) * len);
    const ny = Math.round(node.y + Math.sin(heading) * len);
    return tryAddRoad(node, slot, nx, ny, heading, null, props);
}

function tryCurve(node, slot, heading, props) {
    const turn = CURVE_ANGLES[Math.floor(Math.random() * CURVE_ANGLES.length)];
    const r = CURVE_RADII[Math.floor(Math.random() * CURVE_RADII.length)];
    const right = Math.random() < 0.5;
    const { ex, ey, eh, cx, cy, arcS, arcE, ccw } = calcCurve(node.x, node.y, heading, turn, r, right);
    return tryAddRoad(node, slot, Math.round(ex), Math.round(ey), eh,
        { cx, cy, r, arcS, arcE, ccw }, props);
}

function resolveNode(node) {
    const sourceStreet = findSourceStreet(node);
    const sourceProps = sourceStreet ? sourceStreet.props : null;
    if (!node.color && sourceProps) node.color = sourceProps.color;

    for (const slot of GEN_SLOTS) {
        if (node.roads[slot] !== null) continue;
        const prob = slot === 'fwd' ? 0.8 : 0.6;
        if (Math.random() >= prob) { node.roads[slot] = false; continue; }

        const props = propagateProps(sourceProps, slot);
        const heading = slotAngle(node.ori, slot);
        let ok = false;
        if (Math.random() < CURVE_PROB) ok = tryCurve(node, slot, heading, props);
        if (!ok) ok = tryStraight(node, slot, heading, props);
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
