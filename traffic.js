// --- Traffic: the other cars on the road, and the drivers inside them ---------
// (all units feet, seconds, radians)
//
// A car in traffic used to *be* a position on a street, with world coordinates
// derived from it. Now the car's world pose -- cx, cy, angle, speed, all plain
// Numbers, so sub-foot precision comes free -- is the truth, and the street is
// only the driver's *intention*: the lane centerline they are trying to hold and
// the route they mean to take. Nothing snaps a car to the road any more; if it is
// on the road, its driver put it there, and the worst drivers sometimes don't.
//
//   { vehicle, driver, perf, cx, cy, angle, speed, steer,   -- the car
//     street, dir, pos, lane, next, ...              -- what the driver intends
//
// dir is +1 for a car travelling from the street's (x1,y1) end toward (x2,y2) and
// -1 for the other way; pos is arc-length from whichever end that car entered at,
// kept as the projection of the car's true position onto the centerline (a cheap
// Newton step per frame, exact on straights and near-exact on our gentle arcs),
// so it runs 0 -> length and none of the arithmetic branches on direction.
//
// The driver is a handful of old-fashioned control loops, deliberately not
// anything cleverer:
//
//  - Steering is one PID on cross-track error, the car's signed distance from
//    its lane centerline. The derivative term is taken analytically -- de/dt is
//    exactly speed * sin(heading error) -- which is what keeps the loop stable
//    through a 90-degree turn, where the raw error is small but pointing the
//    wrong way is everything. Path curvature is fed forward, so on a curve the
//    PID only ever corrects mistakes rather than fighting the geometry. The
//    integral term is what trims out a long arc's residual pull.
//  - Speed is a proportional loop chasing a target that is the *minimum* of
//    everything the driver can see coming: their own cruising preference, the
//    comfortable speed for the arc they are on, slowing in time for a turn or a
//    stop sign ahead (a sqrt(2*a*d) approach curve, so speed stays up until the
//    stop is genuinely near -- nobody parks 80ft short of the sign), and a
//    crosstalk clamp that slows anyone far out of their lane, which is both the
//    "having trouble on this curve" case and what stops a drunk swerving at 50.
//  - Following is a PD loop on the gap to the car ahead (P on distance error, D
//    on closing speed), fed measurements a beat late -- each driver has a
//    reaction time, and reads the gap as it was that long ago -- which is where
//    stop-and-go waves come from: each car in a queue moves off a beat after the
//    one ahead, exactly like the real thing. The player's car is just another
//    car to this loop.
//
// Every gain, preference and delay is rolled per driver (makeDriver), so the
// fleet has personalities: cruise speeds from a rare 20mph dawdle to a rare
// 60mph tear, tight and sloppy followers, quick and slow reactors. Steering
// quality hangs off one skill number that sets the loop's damping ratio -- the
// visible spectrum from rock-steady to visibly drunk is underdamping plus a
// slow random wander in where the driver thinks lane-center is. The big
// vehicles get a skill floor: whoever is driving the bus, it is not the drunk.
//
// Stop signs read from the node's own signage (signs.js): an approach with a
// sign gets the sqrt approach curve to a stop line just short of the box, a
// beat of dwell once stopped, and then -- there being no cross-traffic logic
// yet -- the driver simply goes. Cars on conflicting paths pass through each
// other, by choice; the one collision drivers do react to is the head-on, an
// oncoming car (or the player) more than a foot over the centerline, which gets
// braking, a swerve toward the curb, and a honk. Honks also fire on any
// near-max braking, and are drawn as decorative red text by drawHonks.
//
// cx, cy are named the way a lot names its centre on purpose: traffic is sorted
// and drawn in the same depth pass as the buildings (see drawLots), so a car on
// the far side of a block goes behind that block's houses instead of being
// painted over them.

const TRAFFIC_MAX_PER_STREET = 12;
// How far from the player traffic exists at all. Well over a screen's width at any
// useful zoom, so a car you saw and want to chase is still being simulated after it
// leaves the view -- turn around and it is where it should be, not where it was.
const TRAFFIC_RADIUS = 1500;
const TRAFFIC_SPAWN_GAP = 8;   // ft of clear road between bumpers when a block is populated

const MPH = 5280 / 3600;                     // one mph, in ft/s
const TRAFFIC_LOOKAHEAD = 200;               // ft: how far a driver watches the car ahead
const STOP_LINE_BACK = HALF_INTERSECTION + 3;  // ft short of the node centre a stop is made
const EVADE_BIAS = 2.5;                      // ft of swerve toward the curb, dodging a head-on
const HEAVY_LENGTH = 24;                     // ft: longer than this gets the skill floor

const traffic = [];
let simT = 0;   // traffic's own clock, for reaction delays and honk lifetimes

// Where traffic lives: the player, or on a page with no car (streetTest), the
// camera. Spawning needs it before the first update runs, hence the setter.
let trafficFocusX = 0, trafficFocusY = 0;
function setTrafficFocus(x, y) { trafficFocusX = x; trafficFocusY = y; }

function resetTraffic() { traffic.length = 0; honks.length = 0; }

const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;
// Wrap to (-pi, pi]: every heading comparison goes through this, so a car
// pointing 350 degrees from its path reads as 10 degrees the other way.
function wrapA(a) { a = normA(a); return a > Math.PI ? a - TWO_PI : a; }

// --- The road as the driver sees it ------------------------------------------

// A street's length along its centreline: the chord, or the real arc. Cached on
// the street, which never changes shape once built.
function streetLength(s) {
    if (s.len === undefined) {
        s.len = s.curve
            ? s.curve.r * normA(s.curve.ccw ? s.curve.arcS - s.curve.arcE : s.curve.arcE - s.curve.arcS)
            : Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    }
    return s.len;
}

// Right-hand traffic: the lane centre sits a quarter of the roadway's width to the
// right of the centreline, which on a 20-24ft street puts a 6ft car about a foot
// clear of both the yellow line and the kerb, and a 8.5ft bus just inside them.
const laneOffset = s => s.props.width / 4;

// The centreline at arc-length pos from this car's own entry end: point, tangent
// heading in the direction of travel, and signed curvature (positive = the path
// bends to the right of travel -- multiplied by speed it is exactly the turn rate
// that holds the arc, which is the steering loop's feedforward). Negative pos and
// pos past the end extrapolate the line or arc, which is what lets a car steer
// for a lane it hasn't reached yet (see the handoff in driveCar).
function pathRefAt(s, dir, pos) {
    const u = dir > 0 ? pos : streetLength(s) - pos;
    if (s.curve) {
        const { cx, cy, r, arcS, ccw } = s.curve;
        const way = ccw ? -1 : 1;              // which way the arc angle runs from x1 to x2
        const th = arcS + way * (u / r);
        let h = th + way * Math.PI / 2, curv = way / r;
        if (dir < 0) { h += Math.PI; curv = -curv; }
        return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th), h, curv };
    }
    let h = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const x = s.x1 + Math.cos(h) * u, y = s.y1 + Math.sin(h) * u;
    if (dir < 0) h += Math.PI;
    return { x, y, h, curv: 0 };
}

// Drop the car exactly onto its lane, pointing along it: how a car is born.
// After this the pose is never derived again -- the driver keeps it, or doesn't.
function placeCarPose(c) {
    const p = pathRefAt(c.street, c.dir, c.pos);
    // "Right of travel" is the local +y axis of a frame rotated by h -- the same
    // side of the street a sidewalk calls its right (see drawStraightSW).
    c.cx = p.x - c.lane * Math.sin(p.h);
    c.cy = p.y + c.lane * Math.cos(p.h);
    c.angle = p.h;
}

// --- The driver --------------------------------------------------------------

// One personality, rolled at spawn. Everything the loops below tune by is here,
// so "a bad driver" is a set of numbers, not a code path.
function makeDriver(v) {
    const r = Math.random();
    let skill = 1 - r * r;   // skewed toward good: ~10% of drivers land under 0.2
    const heavy = vehicleLength(v) > HEAVY_LENGTH;
    if (heavy) skill = 0.5 + skill * 0.5;   // whoever drives the bus, it isn't the drunk

    // Preferred open-road speed: triangular around 35mph, rare tails at 20 and
    // 60, the heavies capped where a loaded truck actually cruises in town.
    let mph = clamp(35 + (Math.random() + Math.random() - 1) * 25, 20, 60);
    if (heavy) mph = Math.min(mph, 45);

    // Steering gains, parameterized by damping ratio so skill maps directly onto
    // how the car visibly behaves: zeta near 1.3 tracks like it's on rails, zeta
    // near 0.3 weaves down the block. (Analysis of the loop: with u = -Kp*e -
    // Kd*de/dt, the error obeys e'' + Kd*v*e' + Kp*v*e = 0 -- gains are picked
    // for a ~1.5 rad/s natural frequency at city speed and the driver's zeta.)
    const Kp = 0.05 + Math.random() * 0.07;
    const zeta = 0.3 + skill;
    const VREF = 40;   // ft/s the damping is tuned at; faster is naturally sloppier
    return {
        skill,
        cruise: mph * MPH,
        Kp, Kd: 2 * zeta * Math.sqrt(Kp * VREF) / VREF,
        Ki: 0.002 + (1 - skill) * 0.012,
        wanderAmp: (1 - skill) * 1.6,          // ft: how far "lane centre" drifts in their head
        Kv: 0.6 + Math.random() * 0.5,         // accel per ft/s of speed error
        Kf: 0.3 + Math.random() * 0.4,         // accel per ft of following-gap error
        Kdf: 0.9 + Math.random() * 0.7,        // accel per ft/s of closing speed
        headway: 0.8 + Math.random() * 1.4,    // s of preferred gap to the car ahead...
        minGap: 5 + Math.random() * 5,         // ...plus this many ft standing still
        reactT: 0.15 + (1 - skill) * 0.45 + Math.random() * 0.1,   // s behind reality
        aComf: 6 + skill * 3 + Math.random(),  // ft/s^2 of braking they plan around
        pause: 0.4 + Math.random() * 1.1,      // s of dwell at a stop sign
    };
}

// --- Route intentions --------------------------------------------------------

// Which street a car takes out of an intersection: any of them except the one it
// arrived on, which is all "no U-turns" means. A dead end is the one place there is
// no other choice, and turning round there is better than driving into the grass.
// Picked without building an array -- this runs for every car that reaches a node.
function pickExit(node, from) {
    let seen = 0, pick = null;
    for (const slot of SLOTS) {
        const s = node.streets[slot];
        if (!s || s === from) continue;
        if (Math.random() * ++seen < 1) pick = s;   // reservoir sample of one
    }
    return pick || from;
}

// Which way round a street runs, seen from the node the car is standing at.
const dirFromNode = (s, node) =>
    (Math.abs(s.x1 - node.x) < 1 && Math.abs(s.y1 - node.y) < 1) ? 1 : -1;

// Decide, on entering a street, everything about leaving it: which exit, and --
// when the exit is an actual turn -- the exact corner to drive. The corner is a
// fillet arc tangent to both lane centrelines, so the steering loop follows it
// with the same small-error tracking it uses everywhere else; asking the loop to
// jump straight from one street's lane to the other's turns every right turn
// into a wide J-swing, because at the handoff the new lane's nearest point is
// already past the node and the raw cross-track error points the wrong way.
// The arc *is* the "smoothly changing centreline input" -- e stays small all
// the way round the corner. Deciding here, on entry, is also what lets the
// speed loop start easing off half a block early instead of braking at the
// kerb. Re-run once per street, never per frame.
function planExit(c) {
    const s = c.street;
    const node = getNode(c.dir > 0 ? s.x2 : s.x1, c.dir > 0 ? s.y2 : s.y1);
    c.endNode = node || null;
    c.next = null;
    c.turnPlan = null;
    c.waitT = 0;
    c.stopDone = false;
    if (!node) return;   // half-built map edge; the car is culled when it gets there
    const street = pickExit(node, s);
    const dir = street === s ? -c.dir : dirFromNode(street, node);
    c.next = { street, dir };
    c.turnPlan = makeTurnPlan(c, s, street, dir);
}

// The corner arc for one car's chosen exit, or null for straight-enough-through.
// Geometry: the incoming and outgoing lane centrelines (their end tangents; near
// the node an arc street is straight enough) meet at a corner point C. A circle
// of radius r tangent to both touches them t = r*tan(|turn|/2) short of C, so
// picking the arc's reach picks r: sharp turns get tight slow arcs starting at
// the box edge, gentle ones fast sweeping arcs. Left turns come out wider than
// rights and cross the middle of the box, exactly as they should, with nothing
// choosing that -- it falls out of which side of the road each lane is on.
function makeTurnPlan(c, s, next, ndir) {
    const len = streetLength(s);
    const inR = pathRefAt(s, c.dir, len);
    const outR = pathRefAt(next, ndir, 0);
    const delta = wrapA(outR.h - inR.h);
    const abs = Math.abs(delta);
    if (abs < 0.26) return null;   // continuing through: the lane PID handles it alone

    // Lane centre points where the streets meet the node
    const lout = laneOffset(next);
    const Ax = inR.x - c.lane * Math.sin(inR.h), Ay = inR.y + c.lane * Math.cos(inR.h);
    const Bx = outR.x - lout * Math.sin(outR.h), By = outR.y + lout * Math.cos(outR.h);
    // Comfortable lateral g on the corner, by driver; radius then sets the speed
    const aLat = 7 + c.driver.skill * 3;

    // Full steering lock is a turn radius of 20 / MAX_TURN_RATE ft (the rate cap
    // scales with speed below 20 ft/s, so the radius floor doesn't) -- an arc
    // tighter than that can't be tracked by anyone, only orbited.
    const R_MIN = 20 / MAX_TURN_RATE + 1.5;
    const d1x = Math.cos(inR.h), d1y = Math.sin(inR.h);
    let O, r, sweep, thS, sweepAng, posS;
    if (abs > 2.6) {
        // Dead-end U-turn: half a circle to the left, tangent to my own lane at
        // its end. The road is a whisker narrower than the circle, so drivers
        // swing just past the far lane and get reeled back in -- which is what
        // turning around at a dead end looks like anyway.
        r = Math.max(R_MIN, Math.hypot(Ax - Bx, Ay - By) / 2);
        O = { x: Ax + d1y * r, y: Ay - d1x * r };   // centre to my left
        sweep = -1;
        thS = Math.atan2(Ay - O.y, Ax - O.x);
        sweepAng = Math.PI;
        posS = len;
    } else {
        const d2x = Math.cos(outR.h), d2y = Math.sin(outR.h);
        // Corner point: A + sC*d1 is on the outgoing lane line
        const sC = ((Bx - Ax) * d2y - (By - Ay) * d2x) / (d1x * d2y - d1y * d2x);
        const half = Math.tan(abs / 2);
        r = clamp(11 / half, R_MIN, 60);   // reach ~11ft short of the corner...
        const t = r * half;                // ...unless the radius clamps first
        const Sx = Ax + (sC - t) * d1x, Sy = Ay + (sC - t) * d1y;
        sweep = delta > 0 ? 1 : -1;        // +1 curls right (heading increasing)
        O = sweep > 0 ? { x: Sx - d1y * r, y: Sy + d1x * r }
                      : { x: Sx + d1y * r, y: Sy - d1x * r };
        thS = Math.atan2(Sy - O.y, Sx - O.x);
        sweepAng = abs;
        posS = clamp(len + sC - t, len - 45, len - 1);
    }
    return { O, r, sweep, thS, sweepAng, posS,
             vTurn: Math.max(6, Math.sqrt(aLat * r)) };
}

// Advance c onto the street planExit picked, seeding pos with the projection of
// the car's true position onto the new centreline (negative or past-the-end pos
// both fine -- pathRefAt extrapolates, and the per-frame Newton step keeps it
// true from here on).
function switchStreet(c) {
    c.street = c.next.street;
    c.dir = c.next.dir;
    c.lane = laneOffset(c.street);
    const nr = pathRefAt(c.street, c.dir, 0);
    c.pos = (c.cx - nr.x) * Math.cos(nr.h) + (c.cy - nr.y) * Math.sin(nr.h);
    c.turn = null;
    planExit(c);
}

// Does this car's approach to its end node face a stop sign right now? Read
// fresh each frame off the node's own signage rather than cached, because a
// node re-decides its signs whenever a street attaches (see updateNodeSigns).
function stopSignAhead(c) {
    const n = c.endNode;
    if (!n || !n.signs || c.stopDone) return false;
    for (const slot of SLOTS) if (n.streets[slot] === c.street) return !!n.signs[slot];
    return false;
}

// --- Watching the road: leaders and head-ons ---------------------------------

// One pass over traffic (and the player) per car per frame: the nearest car
// ahead in my lane to follow, and any oncoming car over the centreline to dodge.
// O(n^2) over the ~dozens of cars near the player, which is nothing.
//
// Writes into `sense` rather than allocating: { gap, lead, oncoming } where gap
// is bumper-to-bumper ft to the leader, lead is its speed along my direction,
// oncoming is distance to a head-on threat or Infinity.
const sense = { gap: 0, lead: 0, oncoming: 0 };
function senseRoad(c, player, arcRem) {
    const len = streetLength(c.street);
    // My distance to the next street's start: what's left of this one, or of the
    // corner arc I'm on. A turning car's pos is frozen at the arc's start, which
    // makes a follower's gap to it read slightly short -- the safe direction.
    const toNext = c.turn ? arcRem : len - c.pos;
    let bestGap = Infinity, bestLead = 0, oncoming = Infinity;

    for (const o of traffic) {
        if (o === c) continue;
        let ahead = null;
        if (o.street === c.street && !c.turn) {
            if (o.dir === c.dir) ahead = o.pos - c.pos;
            else {
                // Oncoming, same street: over the yellow line by a foot into my
                // half (their frame's left is my half of the road), and ahead of
                // me within reaction range, is a head-on developing.
                const d = (len - o.pos) - c.pos;
                if (d > 0 && d < 150 && o.centerOff < -1) oncoming = Math.min(oncoming, d);
                continue;
            }
        } else if (c.next && o.street === c.next.street && o.dir === c.next.dir && !o.turn) {
            // A leader that has already crossed the node I'm heading for
            ahead = toNext + o.pos;
        }
        if (ahead === null || ahead <= 0 || ahead > TRAFFIC_LOOKAHEAD) continue;
        const gap = ahead - c.hl - o.hl;
        if (gap < bestGap) { bestGap = gap; bestLead = o.speed; }
    }

    // The player is not on a street, so it is watched geometrically: position in
    // my own driving frame (lx ahead, ly to my right) plus relative heading.
    if (player) {
        const dx = player.x - c.cx, dy = player.y - c.cy;
        const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
        const cosH = Math.cos(player.angle - c.angle);
        if (lx > 0 && lx < TRAFFIC_LOOKAHEAD && Math.abs(ly) < 4.5 && cosH > 0.5) {
            // Ahead of me, in my lane, going my way: a leader like any other
            const gap = lx - c.hl - 9;
            if (gap < bestGap) { bestGap = gap; bestLead = player.speed * cosH; }
        } else if (lx > 0 && lx < 150 && Math.abs(ly) < 5.5 && cosH < -0.5) {
            // Coming at me in my lane
            oncoming = Math.min(oncoming, lx);
        }
    }

    sense.gap = bestGap; sense.lead = bestLead; sense.oncoming = oncoming;
}

// --- Driving -----------------------------------------------------------------

// One car, one frame. Returns false when the car has driven somewhere it can
// never come back from (an unbuilt map edge, or hopelessly far off the road)
// and should be forgotten.
function driveCar(c, dt, player) {
    const drv = c.driver;

    // --- Which piece of path am I following: my lane, or a corner arc? A
    // planned turn begins when the car reaches the arc's start -- unless a stop
    // sign is still owed there, in which case the stop happens first and the
    // corner waits for it.
    if (!c.turn) {
        if (c.turnPlan && c.pos >= c.turnPlan.posS && c.waitT <= 0 && !stopSignAhead(c)) {
            c.turn = c.turnPlan;
        } else if (!c.turnPlan && c.pos > streetLength(c.street)) {
            if (!c.next) return false;   // drove off the built map
            switchStreet(c);             // continuing straight through the node
        }
    }

    let e, he, curv, arcRem = 0;
    if (c.turn) {
        // On the corner: the reference is the radial projection onto the arc,
        // so e is simply how far off the radius the car sits, and the
        // feedforward is the arc's own curvature. Rolling past the arc's far
        // end is what lands the car on its new street.
        const T = c.turn;
        const dx = c.cx - T.O.x, dy = c.cy - T.O.y;
        const swept = T.sweep * wrapA(Math.atan2(dy, dx) - T.thS);
        if (swept >= T.sweepAng - 0.04) switchStreet(c);
        else {
            arcRem = (T.sweepAng - Math.max(0, swept)) * T.r;
            he = wrapA(c.angle - (Math.atan2(dy, dx) + T.sweep * Math.PI / 2));
            e = T.sweep * (T.r - Math.hypot(dx, dy));
            curv = T.sweep / T.r;
            c.centerOff = c.lane + e;   // near enough for others' yellow-line checks
        }
    }
    if (!c.turn) {
        // In my lane: pos is kept as the true arc-length foot of the car on the
        // centreline by a Newton step -- advance it by the along-track component
        // of our offset from the current reference, then re-read the reference
        // there -- so e is purely lateral.
        let ref = pathRefAt(c.street, c.dir, c.pos);
        c.pos += (c.cx - ref.x) * Math.cos(ref.h) + (c.cy - ref.y) * Math.sin(ref.h);
        ref = pathRefAt(c.street, c.dir, c.pos);
        // Signed offset from the road's centreline, +ve toward my side. Kept on
        // the car because oncoming drivers read it for yellow-line crossings.
        c.centerOff = -(c.cx - ref.x) * Math.sin(ref.h) + (c.cy - ref.y) * Math.cos(ref.h);
        he = wrapA(c.angle - ref.h);
        e = c.centerOff - c.lane;
        curv = ref.curv;
    }
    const len = streetLength(c.street);
    if (Math.abs(e) > 80) return false;   // hopelessly lost; quietly forgotten

    // What everyone else is doing
    senseRoad(c, player, arcRem);

    // Head-on developing: swerve for the curb, and if it is genuinely close,
    // brake hard. The swerve is a bias on where lane-centre *is*, so the same
    // steering loop handles the dodge and the recovery.
    let evadeTarget = 0, emergency = Infinity;
    if (sense.oncoming < Infinity) {
        evadeTarget = EVADE_BIAS;
        const closing = c.speed + 1;   // near enough: both parties are closing
        if (sense.oncoming / closing < 2.5) emergency = -drv.aComf - (c.perf.brakeDecel - drv.aComf) *
            clamp(1 - sense.oncoming / closing / 2.5, 0, 1);
        honk(c);
    }
    c.evade += (evadeTarget - c.evade) * Math.min(1, dt * 3);

    // --- Speed: chase the lowest of everything the driver can see coming ---
    let vT = drv.cruise;
    // Comfortable lateral g on the path I'm riding: a curving street, or the
    // corner arc itself (whose vTurn is this same number, precomputed).
    if (c.turn) vT = Math.min(vT, c.turn.vTurn);
    else if (curv) vT = Math.min(vT, Math.sqrt((drv.aComf + 2) / Math.abs(curv)));
    // Approaching a planned slow-down -- the corner at the end of this block, or
    // a stop line -- braking follows the *required* deceleration, (vGoal^2 -
    // v^2) / 2d, once that reaches comfort level. Chasing the sqrt speed
    // profile through the proportional loop instead always lags it (a moving
    // target is never caught, only followed), and a corner entered 15 over is a
    // corner exited through the far hedge. Braking on the requirement is exact:
    // it engages at just the distance where comfortable braking has to start,
    // holds ~aComf all the way down, and nobody halts way back from anything.
    let aPlan = Infinity;
    if (c.turnPlan && !c.turn && c.speed > c.turnPlan.vTurn) {
        const d = Math.max(0.5, c.turnPlan.posS - c.pos);
        const vG = c.turnPlan.vTurn;
        vT = Math.min(vT, Math.sqrt(vG * vG + 2 * drv.aComf * d));
        const need = (vG * vG - c.speed * c.speed) / (2 * d);
        if (need < -0.85 * drv.aComf) aPlan = need;
    }
    // A stop sign on my approach: the same treatment with a goal of zero at the
    // stop line. Once stopped, dwell a beat, then (no cross-traffic logic yet,
    // by choice) just go.
    if (c.waitT > 0) {
        c.waitT -= dt;
        if (c.waitT <= 0) c.stopDone = true;
        vT = 0;
    } else if (!c.turn && stopSignAhead(c)) {
        const d = Math.max(0.5, len - STOP_LINE_BACK - c.pos);
        vT = Math.min(vT, Math.sqrt(2 * drv.aComf * Math.max(0, d - 0.5)));
        const need = -c.speed * c.speed / (2 * d);
        if (need < -0.85 * drv.aComf) aPlan = Math.min(aPlan, need);
        if (d < 3.5 && c.speed < 1) c.waitT = drv.pause;
    }
    // Crosstalk from the steering loop: far out of lane or pointing well off the
    // road -- fighting a curve, recovering a swerve, or just drunk -- is not the
    // moment for speed.
    if (Math.abs(e) > 1.5) vT = Math.min(vT, Math.max(10, 50 - 9 * Math.abs(e)));
    if (Math.abs(he) > 0.4) vT = Math.min(vT, 18);

    let acc = drv.Kv * (vT - c.speed);

    // --- Following: PD on the gap to the car ahead, read reactT late ---
    if (sense.gap < Infinity) {
        c.gapBuf.push({ t: simT, gap: sense.gap, dv: sense.lead - c.speed });
        while (c.gapBuf.length > 1 && c.gapBuf[0].t < simT - drv.reactT) c.gapBuf.shift();
        const seen = c.gapBuf[0];
        const want = drv.minGap + drv.headway * c.speed;
        acc = Math.min(acc, drv.Kf * (seen.gap - want) + drv.Kdf * seen.dv);
    } else if (c.gapBuf.length) c.gapBuf.length = 0;

    acc = Math.min(acc, aPlan, emergency);
    // Analog feet, but this car's actual engine and brakes: the same per-type
    // curve and limits the player's pedals get (vehicles/performance.js).
    acc = clamp(acc, -c.perf.brakeDecel, curveAccel(c.speed, c.perf.accelK));
    if (acc < -0.92 * c.perf.brakeDecel) honk(c);   // near-max braking is honk-worthy

    // --- Steering: PID on cross-track error from (biased) lane centre ---
    // The wander term is a slow Ornstein-Uhlenbeck drift in where this driver
    // believes lane-centre is: zero for the skilled, a couple of feet for the
    // drunk, and the thing that makes their weave organic instead of periodic.
    c.wander += -0.5 * c.wander * dt + (Math.random() * 2 - 1) * drv.wanderAmp * Math.sqrt(dt);
    const eU = clamp(e - c.evade + c.wander, -15, 15);
    const iLim = 0.25 / drv.Ki;
    c.ei = clamp(c.ei + eU * dt, -iLim, iLim);
    const eDot = c.speed * Math.sin(he);   // analytic de/dt: doubles as heading damping
    let u = c.speed * curv - (drv.Kp * eU + drv.Ki * c.ei + drv.Kd * eDot);
    // Same steering authority the player has: full lock is a turn rate that
    // scales away below 20 ft/s, so nobody pivots in place.
    const uMax = MAX_TURN_RATE * Math.min(c.speed / 20, 1);
    u = clamp(u, -uMax, uMax);
    c.steer = clamp(u / Math.max(uMax, 0.3), -1, 1);   // and the front wheels show it

    // --- Integrate. The model is exactly the player's: heading and speed move
    // the car, nothing else does. ---
    c.angle = normA(c.angle + u * dt);
    c.speed = Math.max(0, c.speed + acc * dt);
    c.cx += Math.cos(c.angle) * c.speed * dt;
    c.cy += Math.sin(c.angle) * c.speed * dt;
    return true;
}

// --- Honks -------------------------------------------------------------------

// The hook, kept deliberately simple: a honk is a point in the world and a birth
// time, drawn as red text that rises and fades. Position is snapshotted rather
// than following the car -- a honking car is braking, it won't be far.
const honks = [];
const HONK_LIFE = 1.1;    // s on screen
function honk(c) {
    if (simT < c.honkOk) return;
    c.honkOk = simT + 2.5 + Math.random() * 2.5;   // one leaning-on-it per moment of drama
    honks.push({ x: c.cx, y: c.cy, t: simT });
}

// Screen-space, after everything else has drawn (see drawScene): a honk is heard
// over a house, not hidden behind one.
function drawHonks(camX, camY) {
    for (let i = honks.length - 1; i >= 0; i--) {
        const h = honks[i], age = simT - h.t;
        if (age > HONK_LIFE) continue;   // culled by the next updateTraffic
        if (PX_PER_FT < HOUSES_MIN_ZOOM) continue;   // no cars on screen, no honks either
        const [sx, sy] = project(h.x, h.y, 9 + age * 8, camX, camY);
        if (sx < -80 || sx > canvas.width + 80 || sy < -40 || sy > canvas.height + 40) continue;
        ctx.save();
        ctx.globalAlpha = clamp(2.5 * (HONK_LIFE - age), 0, 1);
        ctx.font = `bold ${clamp(9 * PX_PER_FT, 11, 26) | 0}px "Comic Sans MS", "Comic Neue", cursive`;
        ctx.fillStyle = '#e32';
        ctx.textAlign = 'center';
        ctx.translate(sx, sy);
        ctx.rotate((((h.x * 7 + h.y * 13) % 10) / 10 - 0.5) * 0.35);   // a little cockeyed
        ctx.fillText('HONK!', 0, 0);
        ctx.restore();
    }
}

// --- Populating a new block --------------------------------------------------

// Drop one lane's worth of cars along a block at random without any two of them
// touching. Sorting the offsets and then pushing each car past the ones before it
// by their own lengths plus a gap is exact: the tightest arrangement the shuffle
// can produce is bumper-to-bumper-plus-one-gap, and every arrangement that keeps
// the gap is still reachable. Cars that don't fit on the block are simply not born.
function placeLane(s, vehicles, dir, len) {
    const lane = laneOffset(s);
    let needed = 0, n = 0;
    const lengths = [];
    for (const v of vehicles) {
        const l = vehicleLength(v);
        if (needed + l + TRAFFIC_SPAWN_GAP > len) break;   // the block is full
        needed += l + TRAFFIC_SPAWN_GAP;
        lengths.push(l);
        n++;
    }
    if (n === 0) return;

    const offs = [];
    for (let i = 0; i < n; i++) offs.push(Math.random() * (len - needed));
    offs.sort((a, b) => a - b);

    let run = 0;
    for (let i = 0; i < n; i++) {
        const driver = makeDriver(vehicles[i]);
        const c = {
            vehicle: vehicles[i], driver, perf: vehiclePerf(vehicles[i]),
            street: s, dir, lane,
            pos: offs[i] + run + lengths[i] / 2,
            hl: lengths[i] / 2,
            cx: 0, cy: 0, angle: 0, steer: 0,
            // Born rolling at something sensible; the speed loop takes it from here
            speed: Math.min(driver.cruise, 40) * (0.8 + Math.random() * 0.2),
            centerOff: lane, ei: 0, wander: 0, evade: 0, turn: null,
            gapBuf: [], waitT: 0, stopDone: false, honkOk: 0,
        };
        placeCarPose(c);
        planExit(c);
        // Born mid-block, maybe mid-approach: never faster than the corner or
        // stop line already ahead can be comfortably braked for -- a car dropped
        // at cruise speed 20ft before a 90-degree turn cannot make it, and blows
        // through the intersection sideways trying.
        if (c.turnPlan) c.speed = Math.min(c.speed, Math.sqrt(
            c.turnPlan.vTurn * c.turnPlan.vTurn + 2 * driver.aComf * Math.max(0, c.turnPlan.posS - c.pos)));
        if (stopSignAhead(c)) c.speed = Math.min(c.speed, Math.sqrt(
            2 * driver.aComf * Math.max(0, len - STOP_LINE_BACK - c.pos)));
        traffic.push(c);
        run += lengths[i] + TRAFFIC_SPAWN_GAP;
    }
}

// Every new block gets its traffic once, as it is built -- the same moment its lots
// are laid out (see pushStreet). The mix of body styles is the fleet's, so the odds
// of meeting a Countach out here are the odds of having been given one to drive.
function spawnStreetTraffic(s) {
    if (typeof generateRandomVehicle !== 'function') return;   // page with no vehicles loaded

    // A car built further than TRAFFIC_RADIUS from the focus would be deleted on
    // the very next update, so building one is pure waste. Driving rejects nothing
    // here -- a street is born within a few feet of the car that triggered it --
    // but growCity() builds a whole city at once, from wherever in it it likes.
    const b = s.bounds;
    if (b.mxx + TRAFFIC_RADIUS < trafficFocusX || b.mnx - TRAFFIC_RADIUS > trafficFocusX ||
        b.mxy + TRAFFIC_RADIUS < trafficFocusY || b.mny - TRAFFIC_RADIUS > trafficFocusY) return;

    const n = Math.floor(Math.random() * (TRAFFIC_MAX_PER_STREET + 1));
    if (n === 0) return;

    // Split by direction first so each lane can be packed on its own: two cars
    // going opposite ways are in different lanes and cannot be in each other's way.
    const up = [], down = [];
    for (let i = 0; i < n; i++) (Math.random() < 0.5 ? up : down).push(generateRandomVehicle());
    const len = streetLength(s);
    placeLane(s, up, 1, len);
    placeLane(s, down, -1, len);
}

// --- Simulation and drawing --------------------------------------------------

// Everything within TRAFFIC_RADIUS drives, on screen or not; everything past it is
// deleted outright. Iterating backwards means a car can be dropped by swapping the
// last one into its place, with no shuffling and no second pass. `player`, if
// given, joins the drivers' world: they follow it, brake for it, dodge it.
function updateTraffic(px, py, dt, player) {
    setTrafficFocus(px, py);
    if (dt <= 0) return;
    simT += dt;
    // Expired honks go here, not in drawHonks: a page that never draws (or a
    // headless run) must not accumulate them forever.
    while (honks.length && simT - honks[0].t > HONK_LIFE) honks.shift();
    const r2 = TRAFFIC_RADIUS * TRAFFIC_RADIUS;
    for (let i = traffic.length - 1; i >= 0; i--) {
        const c = traffic[i];
        const alive = driveCar(c, dt, player);
        const dx = c.cx - px, dy = c.cy - py;
        if (alive && dx * dx + dy * dy <= r2) continue;
        traffic[i] = traffic[traffic.length - 1];
        traffic.pop();
    }
}

// Hand the cars in view to the buildings' depth pass, which sorts and draws them
// together (see drawLots).
function collectTraffic(out, vl, vr, vt, vb) {
    // A car is about as many pixels as a house is, so it drops out with them --
    // below this only the skyline is left, and there are no cars in a skyline.
    if (PX_PER_FT < HOUSES_MIN_ZOOM) return;
    for (const c of traffic) {
        if (c.cx < vl || c.cx > vr || c.cy < vt || c.cy > vb) continue;
        out.push(c);
    }
}

// Shared by traffic and the player -- both are just { vehicle, cx, cy, angle,
// steer } to this point. Traffic's steer is its PID's own wheel angle now, so
// the front wheels of a turning car visibly turn.
function drawGroundVehicle(c, camX, camY) {
    drawVehicle(c.vehicle, c.cx, c.cy, c.angle, c.steer || 0, camX, camY);
}
