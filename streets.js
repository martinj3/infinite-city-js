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
        roads: { fwd: null, right: null, back: null, left: null },
        // The street object in each slot, so sidewalks can be joined at this intersection
        streets: { fwd: null, right: null, back: null, left: null }
    };
    nodes.set(k, n);
    return n;
}

function blockLen() {
    return Math.random() < 0.15 ? Math.round(200 + Math.random() * 500) : DEFAULT_BLOCK_LEN;
}

// --- Street properties ---
function randomGreyValue(base, spread, min, max) {
    return Math.max(min, Math.min(max, base + Math.floor(Math.random() * spread - spread / 2)));
}
function greyColor(v) { return `rgb(${v},${v},${v})`; }

function randomStreetGrey() { return randomGreyValue(102, 30, 70, 130); } // ~#666
function randomStreetColor() { return greyColor(randomStreetGrey()); }

function generateSidewalkProps(streetWidth, streetGrey) {
    const width = MIN_SIDEWALK_WIDTH + Math.random() * (MAX_SIDEWALK_WIDTH - MIN_SIDEWALK_WIDTH);
    const gap = MIN_SIDEWALK_GAP + Math.random() * (MAX_SIDEWALK_GAP - MIN_SIDEWALK_GAP);
    // Same family of greys as streets, biased lighter (concrete vs asphalt), and always
    // kept a step apart from the parent street so it still reads as separate at gap 0.
    let grey = randomGreyValue(130, 40, 105, 160);
    if (Math.abs(grey - streetGrey) < SIDEWALK_CONTRAST) grey = streetGrey + SIDEWALK_CONTRAST;
    // Sides are relative to the street's own direction (x1 -> x2): right = local +y
    const r = Math.random();
    const both = r < SIDEWALK_BOTH_PROB;
    const none = !both && r < SIDEWALK_BOTH_PROB + SIDEWALK_NONE_PROB;
    const rightOnly = !both && !none && r < SIDEWALK_BOTH_PROB + SIDEWALK_NONE_PROB + (1 - SIDEWALK_BOTH_PROB - SIDEWALK_NONE_PROB) / 2;
    return {
        width, gap,
        right: both || rightOnly,
        left: both || (!none && !rightOnly),
        color: greyColor(grey),
        inner: streetWidth / 2 + gap,         // ft from centerline to near (curb) edge
        outer: streetWidth / 2 + gap + width  // ft from centerline to far edge
    };
}

function generateStreetProps() {
    const hasYellowLines = Math.random() < 0.7;
    const width = Math.round(MIN_STREET_WIDTH + Math.random() * (MAX_STREET_WIDTH - MIN_STREET_WIDTH));
    const grey = randomStreetGrey();
    return {
        width,
        color: greyColor(grey),
        hasYellowLines,
        hasWhiteLines: hasYellowLines && Math.random() < 0.6,
        sidewalk: generateSidewalkProps(width, grey)
    };
}

function propagateProps(sourceProps, slot) {
    // fwd: 20% re-roll, left/right: 40% re-roll
    const rerollChance = slot === 'fwd' ? 0.2 : 0.4;
    if (!sourceProps || Math.random() < rerollChance) return generateStreetProps();
    return {
        width: sourceProps.width, color: sourceProps.color,
        hasYellowLines: sourceProps.hasYellowLines, hasWhiteLines: sourceProps.hasWhiteLines,
        sidewalk: sourceProps.sidewalk
    };
}

function findSourceStreet(node) {
    // The street that created this node sits in its back slot; merged nodes may
    // hold it elsewhere, so fall back to any connected street.
    if (node.streets.back) return node.streets.back;
    for (const slot of SLOTS) if (node.streets[slot]) return node.streets[slot];
    return null;
}

function pushStreet(x1, y1, x2, y2, curve, props) {
    props = props || generateStreetProps();
    const sw = props.sidewalk;
    const hw = Math.max(props.width / 2, (sw.left || sw.right) ? sw.outer : 0); // cull bounds include sidewalks
    const s = { x1, y1, x2, y2, curve, props };
    if (curve) {
        const b = arcBounds(curve);
        s.bounds = {
            mnx: b.mnx - hw, mxx: b.mxx + hw,
            mny: b.mny - hw, mxy: b.mxy + hw
        };
    } else {
        s.bounds = {
            mnx: Math.min(x1, x2) - hw, mxx: Math.max(x1, x2) + hw,
            mny: Math.min(y1, y2) - hw, mxy: Math.max(y1, y2) + hw
        };
    }
    streets.push(s);
    // Lots (and their buildings) are generated once, here, and persist on the street.
    // Optional so pages and test harnesses can load streets.js without lots.js.
    if (typeof generateStreetLots === 'function') generateStreetLots(s);
    return s;
}

// --- Conflict detection ---
// Distance from a point to a street's centerline (segment, or the true arc).
function distToStreetPath(px, py, s) {
    if (s.curve) {
        const { cx, cy, r, arcS, arcE, ccw } = s.curve;
        const dx = px - cx, dy = py - cy;
        if (angleInArc(Math.atan2(dy, dx), arcS, arcE, ccw)) {
            return Math.abs(Math.hypot(dx, dy) - r);
        }
        return Math.min(Math.hypot(px - s.x1, py - s.y1), Math.hypot(px - s.x2, py - s.y2));
    }
    const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
    const t = Math.max(0, Math.min(1, ((px - s.x1) * vx + (py - s.y1) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (s.x1 + t * vx), py - (s.y1 + t * vy));
}

// Points along a proposed street's path -- the chord a->b, or the real arc when
// curving -- spaced at most CONFLICT_SAMPLE_STEP apart.
function samplePath(ax, ay, bx, by, curve) {
    const pts = [];
    if (curve) {
        const { cx, cy, r, arcS, arcE, ccw } = curve;
        const sweep = normA(ccw ? arcS - arcE : arcE - arcS);
        const steps = Math.max(2, Math.ceil(sweep * r / CONFLICT_SAMPLE_STEP));
        for (let i = 0; i <= steps; i++) {
            const a = arcS + (ccw ? -1 : 1) * (sweep * i / steps);
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
    } else {
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / CONFLICT_SAMPLE_STEP));
        for (let i = 0; i <= steps; i++) {
            pts.push([ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps]);
        }
    }
    return pts;
}

// Reject a proposed street if any point of its path lies within
// MIN_STREET_SEPARATION of a street it would not share an intersection with, so
// that the two rights of way stay disjoint. Streets meeting either end of
// the proposal are exempt -- connecting to them is the point -- and conflicts
// around those shared intersections are resolved at lot-placement time.
// This is the one global geometric gate: because it holds, everything downstream
// (lots, buildings) only ever needs to look at the streets meeting its own two
// intersections, never at the whole map.
function checkConflict(ax, ay, bx, by, curve) {
    const samples = samplePath(ax, ay, bx, by, curve);
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const [x, y] of samples) {
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    for (const s of streets) {
        // Skip neighbors: streets sharing either endpoint of the proposal
        if (Math.hypot(ax - s.x1, ay - s.y1) < 1 || Math.hypot(ax - s.x2, ay - s.y2) < 1 ||
            Math.hypot(bx - s.x1, by - s.y1) < 1 || Math.hypot(bx - s.x2, by - s.y2) < 1) continue;

        // Cheap reject: street bounds vs the path's bbox, padded by the separation
        const b = s.bounds;
        if (b.mxx + MIN_STREET_SEPARATION < mnx || b.mnx - MIN_STREET_SEPARATION > mxx ||
            b.mxy + MIN_STREET_SEPARATION < mny || b.mny - MIN_STREET_SEPARATION > mxy) continue;

        for (const [px, py] of samples) {
            if (distToStreetPath(px, py, s) < MIN_STREET_SEPARATION) return true;
        }
    }
    return false;
}

// --- Generation ---
function tryAddRoad(node, slot, nx, ny, endH, curve, props) {
    if (checkConflict(node.x, node.y, nx, ny, curve)) return false;

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

    let targetSlot = 'back';
    if (!target) {
        target = addNode(nx, ny, endH);
        target.roads.back = true;
        target.color = props.color;
    } else {
        const arr = normA(endH + Math.PI);
        targetSlot = findSlot(target.ori, arr);
        target.roads[targetSlot] = true;
        if (!target.color) target.color = props.color;
    }

    node.roads[slot] = true;
    const street = pushStreet(node.x, node.y, target.x, target.y, curve, props);
    node.streets[slot] = street;
    if (targetSlot) target.streets[targetSlot] = street;

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
        const prob = slot === 'fwd' ? 0.87 : 0.8;
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

// --- Map lifecycle ---
function nodeUnresolved(n) { return SLOTS.some(s => n.roads[s] === null); }

function resetMap() {
    nodes.clear();
    streets.length = 0;
}

// Seed the map: two intersections joined by one east-west street.
function initMap() {
    const props = generateStreetProps();
    const a = addNode(0, 0, 0);   // orientation = east
    const b = addNode(400, 0, 0);
    a.roads.fwd = true;  a.roads.back = false;
    b.roads.back = true;
    a.color = props.color;
    b.color = props.color;
    const s = pushStreet(0, 0, 400, 0, null, props);
    a.streets.fwd = s;
    b.streets.back = s;
}

// Grow the map by repeatedly visiting the unresolved intersection nearest the
// origin, exactly as driving through one does, until the street cap is reached or
// nothing is left unresolved. Returns the number of intersections visited.
function growCity(maxStreets) {
    let visited = 0;
    while (streets.length < maxStreets) {
        let best = null, bd = Infinity;
        for (const [, n] of nodes) {
            if (!nodeUnresolved(n)) continue;
            const d = Math.hypot(n.x, n.y);
            if (d < bd) { bd = d; best = n; }
        }
        if (!best) break;
        generate(best.x, best.y); // same path the car triggers when it drives through
        visited++;
    }
    return visited;
}
