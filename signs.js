// --- Signs: street furniture, currently just stop signs (all units in feet) ---
//
// Signage is an intersection's decision, not a street's: it is the node
// (streets.js) that owns which of its own connecting streets stop and which
// don't, exactly the way it will one day own a traffic light instead. See
// updateNodeSigns for how and when a node decides.
//
// A sign never moves once placed, so driving past the same corner twice shows the
// same layout. Traffic obeys these now: a driver approaching a node checks its
// signage for their own arrival slot and comes to a genuine stop at it (see
// stopSignAhead in traffic.js) -- though the player is still free to run them.
// Which slots are signed is also what decides right of way at the node, so the
// two-way / four-way / none roll below is the difference between a through street
// that never stops and four cars taking turns (see boxClear, traffic.js).
//
// Built in local feet with +x the direction of the traffic it faces (the same
// convention a vehicle is modelled in, see vehicleUtils.js), so one shape can be
// rotated to any street heading and dropped in place with rotatePolys/
// translatePolys -- the same two calls that bake a building into the world.

const SIGN_POLE_HEIGHT = 6.5;   // ft, ground to the underside of the sign face
const SIGN_WIDTH = 2.75;        // ft, flat to flat -- a real 30in stop sign is
                                 // 2.5ft; very slightly bigger here, for readability
const SIGN_POLE_R = 0.15;       // ft
const SIGN_SETBACK = HALF_INTERSECTION + 4;  // ft short of the intersection box
const SIGN_SIDE_OFFSET = 3;     // ft beyond the road edge, into the verge
const SIGN_MIN_ZOOM = 1.1;      // a 2.75ft sign is 3px below this: drop the whole thing
const SIGN_RED = 'hsl(354, 75%, 40%)';
const SIGN_BACK = 'hsl(60, 3%, 55%)';   // the dull side a driver who passed it sees
const SIGN_WHITE = '#f5f5f0';           // the "STOP" lettering and the face's own border

// How a node controls itself, decided once (see updateNodeSigns): most
// intersections are a two-way stop (the through street, fwd/back, doesn't stop;
// the crossing one, left/right, does), fewer are a four-way, and a few are left
// uncontrolled entirely.
const SIGN_NONE_PROB = 0.12;
const SIGN_TWO_WAY_PROB = 0.6;   // four-way gets the remaining 0.28

// A regular octagon has a flat top and bottom edge, not a vertex there -- that's
// half a segment's rotation (PI / sides) off makeDiscX's own default phase, which
// puts a vertex at the top instead (fine for the badges and taillights that are
// its other callers, where a round shape reads as round either way).
const SIGN_FACE_PHASE = Math.PI / 8;

// The octagon: red toward the traffic it faces (local -x) with "STOP" lettered on
// a whisker-proud panel over it (the same lettering trick a shop sign uses over
// its own board, see makeFrontPanel in buildingUtils.js); a plain back facing +x,
// because a one-sided face is a vanishing act from the wrong side, not a back --
// see makeFlankText's note on a windscreen with nothing behind it.
//
// The front face also carries a white border -- real stop signs have one -- drawn
// as a genuine 1px stroke (see projectAndDraw, render3d.js) rather than a second,
// slightly larger red-and-white polygon pair, which is both cheaper and immune to
// the z-fighting a stacked pair of near-coplanar faces would risk. It shares the
// text's own fate rather than outliving it: TEXT_MIN_PX / (2 * hh) is exactly the
// zoom below which the "STOP" panel's screen height (angle-independent -- its top
// and bottom differ only in z, which maps straight to screen y regardless of view
// rotation) falls under drawPanelText's own floor at every angle, not just most.
// A border with no word inside it would look like a mistake, not a design choice.
function makeSignFace(z) {
    const r = SIGN_WIDTH / 2;
    const front = makeDiscX(0, 0, z, r, -1, SIGN_RED, 8, SIGN_FACE_PHASE);
    const hw = SIGN_WIDTH * 0.36, hh = SIGN_WIDTH * 0.30, eps = 0.03;
    front.stroke = SIGN_WHITE;
    front.strokeMinZoom = TEXT_MIN_PX / (2 * hh);
    const p = (y, zz) => ({ x: -eps, y, z: zz });
    const text = { pts: [p(-hw, z + hh), p(hw, z + hh), p(hw, z - hh), p(-hw, z - hh)],
                   color: SIGN_WHITE, text: 'STOP' };
    return [front, text, makeDiscX(0, 0, z, r, 1, SIGN_BACK, 8, SIGN_FACE_PHASE)];
}

function makeStopSign() {
    const faceZ = SIGN_POLE_HEIGHT + SIGN_WIDTH / 2;
    const polys = makePole(0, 0, 0, SIGN_POLE_HEIGHT, SIGN_POLE_R, 'hsl(0, 0%, 55%)');
    polys.push(...makeSignFace(faceZ));
    return { polys, children: [] };
}

// Tangent heading at one end of a street, as the direction of travel of a car
// arriving there. dir +1 arrives at (x2,y2), -1 at (x1,y1) -- the same convention
// traffic.js's dir uses, so a curved street's sign stands square to the road it
// actually meets rather than to the chord between its ends.
function streetEndHeading(s, dir) {
    if (!s.curve) {
        const h = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        return dir > 0 ? h : h + Math.PI;
    }
    const { arcS, arcE, ccw } = s.curve;
    const way = ccw ? -1 : 1;
    const h = (dir > 0 ? arcE : arcS) + way * Math.PI / 2;
    return dir > 0 ? h : h + Math.PI;
}

// One sign, standing at the kerb before the node a car travelling with heading h
// is about to reach: set back from the node along -h, and to the right of travel
// -- the same right-of-travel side traffic.js's lane offset uses -- so it reads
// face-on to that approach and to no other.
function placeStopSign(nodeX, nodeY, h, roadWidth) {
    const back = SIGN_SETBACK, right = roadWidth / 2 + SIGN_SIDE_OFFSET;
    const x = nodeX - Math.cos(h) * back - Math.sin(h) * right;
    const y = nodeY - Math.sin(h) * back + Math.cos(h) * right;
    const sign = makeStopSign();
    rotatePolys(sign.polys, h, 0, 0);
    translatePolys(sign.polys, x, y);
    return { house: sign, cx: x, cy: y };
}

// Direction of a car arriving at `node` by way of `s`: the opposite of departing
// from it, so a street whose (x1,y1) end sits at this node is arrived at from the
// far end, dir -1, and one whose (x2,y2) end does is arrived at dir +1.
function arrivalDirAt(s, node) {
    return (Math.abs(s.x1 - node.x) < 1 && Math.abs(s.y1 - node.y) < 1) ? -1 : 1;
}

function pickIntersectionControl() {
    const r = Math.random();
    if (r < SIGN_NONE_PROB) return 'none';
    if (r < SIGN_NONE_PROB + SIGN_TWO_WAY_PROB) return 'two-way';
    return 'four-way';
}

// Recomputes every sign at this node from its current connections, and (the
// first time it is worth the question) decides how this node controls itself.
//
// Called whenever a street attaches here -- including a second, third or fourth
// one long after the first, since a node can keep gaining connections well after
// it first looked resolved (see resolveNode's re-opening of previously-false
// directions). Signs are cheap, so the simplest correct thing is to throw the
// old set away and rebuild from scratch every time, rather than trying to patch
// one connection in -- which also means a node doesn't lock in "no signs" just
// because it happens to be a plain through-block when first visited.
//
// fwd/back is treated as the through street and left/right as the one crossing
// it -- they usually are, since fwd continues roughly the heading back arrived
// on -- so a two-way stop only signs the left/right slots, a four-way signs
// whichever of the four are actually connected, and an intersection with no
// street on the cross axis yet isn't a real intersection at all: nothing to
// control, and nothing decided until it becomes one.
function updateNodeSigns(node) {
    if (!node.streets.left && !node.streets.right) { node.signs = null; return; }
    if (!node.control) node.control = pickIntersectionControl();
    if (node.control === 'none') { node.signs = null; return; }

    const signs = {};
    for (const slot of SLOTS) {
        const street = node.streets[slot];
        if (!street) continue;
        if (node.control === 'two-way' && (slot === 'fwd' || slot === 'back')) continue;
        const dir = arrivalDirAt(street, node);
        signs[slot] = placeStopSign(node.x, node.y, streetEndHeading(street, dir), street.props.width);
    }
    node.signs = signs;
}
