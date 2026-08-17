// --- Signs: street furniture, currently just stop signs (all units in feet) ---
//
// A sign is generated once per street end, the moment the street itself is (see
// pushStreet in streets.js), and persists on it exactly the way a lot does: it is
// never regenerated and never moves, so driving past the same corner twice shows
// the same sign. Traffic ignores every sign here entirely -- this is only what
// the driver sees, never a rule anything actually drives by.
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

// The octagon: red toward the traffic it faces (local -x) with "STOP" lettered on
// a whisker-proud panel over it (the same lettering trick a shop sign uses over
// its own board, see makeFrontPanel in buildingUtils.js); a plain back facing +x,
// because a one-sided face is a vanishing act from the wrong side, not a back --
// see makeFlankText's note on a windscreen with nothing behind it.
function makeSignFace(z) {
    const r = SIGN_WIDTH / 2;
    const front = makeDiscX(0, 0, z, r, -1, SIGN_RED, 8);
    const hw = SIGN_WIDTH * 0.36, hh = SIGN_WIDTH * 0.30, eps = 0.03;
    const p = (y, zz) => ({ x: -eps, y, z: zz });
    const text = { pts: [p(-hw, z + hh), p(hw, z + hh), p(hw, z - hh), p(-hw, z - hh)],
                   color: '#f5f5f0', text: 'STOP' };
    return [front, text, makeDiscX(0, 0, z, r, 1, SIGN_BACK, 8)];
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

// Every street gets one sign per end, generated once here and kept on the street
// the way its lots are (see pushStreet) -- nothing is ever demolished.
function generateStreetSigns(s) {
    s.signs = [
        placeStopSign(s.x2, s.y2, streetEndHeading(s, 1), s.props.width),
        placeStopSign(s.x1, s.y1, streetEndHeading(s, -1), s.props.width),
    ];
}
