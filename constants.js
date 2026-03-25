// --- Constants ---
const STREET_WIDTH = 20;
const HALF_STREET = STREET_WIDTH / 2;
const DEFAULT_BLOCK_LEN = 400;
const PX_PER_FT = 2;
const GENERATE_DIST = 30;
const PROXIMITY_THRESHOLD = 50;
const RIGHT_OF_WAY = 170;
const TWO_PI = Math.PI * 2;

const MAX_SPEED = 150;
const REVERSE_MAX = 30;
const ACCEL = 40;
const BRAKE = 60;
const DRAG = 3;
const MAX_TURN_RATE = 3;
const CAR_LENGTH = 12;
const CAR_WIDTH = 7;

const CURVE_PROB = 0.4;
const CURVE_ANGLES = [30, 45, 60, 90].map(d => d * Math.PI / 180);
const CURVE_RADII = [DEFAULT_BLOCK_LEN, DEFAULT_BLOCK_LEN * 2];
const ANGLE_TOL = 0.02; // ~1 degree

// --- Angle helpers ---
function normA(a) { a %= TWO_PI; return a < 0 ? a + TWO_PI : a; }
function anglesEq(a, b) {
    let d = Math.abs(normA(a) - normA(b));
    if (d > Math.PI) d = TWO_PI - d;
    return d < ANGLE_TOL;
}

// Slot system: fwd = continuation direction, back = source, left/right = sides
const SLOT_OFF = { fwd: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
const OPP_SLOT = { fwd: 'back', back: 'fwd', left: 'right', right: 'left' };
const SLOTS = ['fwd', 'right', 'back', 'left'];
const GEN_SLOTS = ['fwd', 'left', 'right']; // back is always pre-set

function slotAngle(ori, slot) { return normA(ori + SLOT_OFF[slot]); }
function findSlot(ori, angle) {
    const a = normA(angle);
    for (const s of SLOTS) if (anglesEq(slotAngle(ori, s), a)) return s;
    return null;
}

// --- Arc math ---
function calcCurve(x, y, heading, turn, r, right) {
    let cx, cy, eh, ex, ey, arcS, arcE, ccw;
    if (right) {
        cx = x - r * Math.sin(heading);
        cy = y + r * Math.cos(heading);
        eh = heading + turn;
        ex = cx + r * Math.sin(eh);
        ey = cy - r * Math.cos(eh);
        arcS = heading - Math.PI / 2;
        arcE = eh - Math.PI / 2;
        ccw = false;
    } else {
        cx = x + r * Math.sin(heading);
        cy = y - r * Math.cos(heading);
        eh = heading - turn;
        ex = cx - r * Math.sin(eh);
        ey = cy + r * Math.cos(eh);
        arcS = heading + Math.PI / 2;
        arcE = eh + Math.PI / 2;
        ccw = true;
    }
    return { ex, ey, eh: normA(eh), cx, cy, arcS, arcE, ccw };
}

function angleInArc(a, s, e, ccw) {
    a = normA(a); s = normA(s); e = normA(e);
    if (!ccw) return s <= e ? (a >= s && a <= e) : (a >= s || a <= e);
    return s >= e ? (a <= s && a >= e) : (a <= s || a >= e);
}

function arcBounds(c) {
    const { cx, cy, r, arcS, arcE, ccw } = c;
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    const add = a => {
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
    };
    add(arcS); add(arcE);
    for (const ca of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2])
        if (angleInArc(ca, arcS, arcE, ccw)) add(ca);
    return { mnx, mxx, mny, mxy };
}
