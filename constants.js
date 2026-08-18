// --- Constants ---
// 22 rather than the original 19: traffic now actually steers to hold its lane
// (see traffic.js), and the extra couple feet of lane is the difference between a
// bus's ordinary wobble staying inside the paint and clipping the centerline.
const MIN_STREET_WIDTH = 22;
const MAX_STREET_WIDTH = 26;
const INTERSECTION_SIZE = MAX_STREET_WIDTH; // fixed size to accommodate widest streets
const HALF_INTERSECTION = INTERSECTION_SIZE / 2;
const DEFAULT_BLOCK_LEN = 500;
let PX_PER_FT = 2;
// Driving's own intro sequence (game.js) eases the view in to one of these from
// INTRO_ZOOM_START, below, and resetCamera() (controls.js) falls back to the
// same choice. A phone's screen has much less room to read the road in, so its
// default sits further out than desktop's closer-in one; pxPerFtDefault()
// (controls.js) is what actually picks between them, off the same coarse-
// pointer test every other mobile-vs-desktop HUD choice already uses.
const PX_PER_FT_DEFAULT_MOBILE = 2.2;
const PX_PER_FT_DEFAULT_DESKTOP = 3.0;
const PX_PER_FT_MIN = 0.1;
const PX_PER_FT_MAX = 20;
const ZOOM_SPEED = 1.5; // per second (multiplier) for held keys
const ZOOM_WHEEL = 1.1; // per wheel tick
// Below this zoom the 1px lane markings would be wider than the roads themselves,
// so they are skipped and only the road surfaces are drawn
const MARKINGS_MIN_ZOOM = 0.5;
// How far around the player (each axis, a square not a circle -- see generate(),
// streets.js) to keep intersections resolved, and how often to bother checking.
// Once every couple of seconds is plenty: the radius is generous next to how far
// a car can travel between checks, so nothing outruns it at any real driving speed.
const GENERATE_RADIUS = 500;
const GENERATE_INTERVAL_FRAMES = 50;
const PROXIMITY_THRESHOLD = 50;
// The "right of way" is the space on each side of a street reserved for sidewalks, buildings, houses, etc. At intersections, this will naturally overlap for the intersecting streets.  
// It's measured from the centerline of the street, I believe?  RIGHT_OF_WAY is for one side, so 2*RIGHT_OF_WAY for the whole street with buildings on both sides.  
const RIGHT_OF_WAY = 150;
// Two streets that don't meet at an intersection must not have overlapping rights
// of way: each owns RIGHT_OF_WAY to either side, so their centerlines have to stay
// twice that apart. Keeping the two corridors disjoint is what lets a lot check
// only the streets at its own two intersections -- anything else is too far away
// to reach it, however deep the lot (see lots.js).
const MIN_STREET_SEPARATION = 2 * RIGHT_OF_WAY;
// Spacing of sample points when testing a proposed street's path against the
// right of way of existing streets
const CONFLICT_SAMPLE_STEP = 50;
const TWO_PI = Math.PI * 2;

// --- Sidewalks (live inside the right of way, alongside each street) ---
const MIN_SIDEWALK_WIDTH = 3;
const MAX_SIDEWALK_WIDTH = 6;
const MIN_SIDEWALK_GAP = 0; // ft of space between road edge and sidewalk (0 happens in real life)
const MAX_SIDEWALK_GAP = 7;
const SIDEWALK_CONTRAST = 12; // min grey-level difference from the parent street's color
// Which sides of a street get a sidewalk: 60% both, 20% none, 10% right only, 10% left only
const SIDEWALK_BOTH_PROB = 0.6;
const SIDEWALK_NONE_PROB = 0.2;

// --- Isometric view ---
const VIEW_ANGLE_DEFAULT = -Math.PI / 4;
// A phone screen is much taller than it is wide, so the driving game starts
// rotated further round than desktop's default -- the seed street reads at
// roughly 60 degrees off horizontal instead of 45 -- trading some of the width
// a landscape monitor has to spare for a longer look at the road ahead on a
// portrait screen. viewAngleDefault() (controls.js) is what actually picks
// between the two, off the same coarse-pointer test every other mobile-vs-
// desktop default already uses; every other reference to VIEW_ANGLE_DEFAULT
// (non-driving camera pages, resetCamera()'s fallback) goes through it too.
const VIEW_ANGLE_DEFAULT_MOBILE = -Math.PI / 3;
let VIEW_ANGLE = VIEW_ANGLE_DEFAULT;
let Y_SCALE = 0.5;
const Y_SCALE_DEFAULT = 0.5;
const Y_SCALE_MIN = 0.25;
const Y_SCALE_MAX = 0.75;
const TILT_SPEED = 0.4; // per second when holding R/F
const ROTATE_SPEED = 1.2; // radians per second when holding Q/E

// Driving game only: how far down-left of dead-centre the camera pins the
// player's car (see game.js's "car draw offset" section) -- a fraction of the
// canvas's own width/height rather than a flat pixel count, so it holds
// steady across window sizes. CAM_OFFSET_X/Y are the live pixel values
// game.js recomputes from these every frame; applyCamera (drawing.js) adds
// them to the usual dead-centre translate, and left at 0 they make it a
// no-op, which is what keeps every non-driving page (streetTest.js, the
// building/vehicle grids) drawing exactly as it always has.
const CAR_OFFSET_X_FRAC = 0.16;
const CAR_OFFSET_Y_FRAC = 0.12;
let CAM_OFFSET_X = 0;
let CAM_OFFSET_Y = 0;

// Driving game only: half-width of the "camera follows the car" dead zone (see
// game.js) -- how far the car's own heading can drift from the camera's current
// facing, on screen, before the view starts rotating to keep up with it.
const CAMERA_FOLLOW_DEAD_ZONE = 25 * Math.PI / 180;

// Driving game only: the startup flourish (game.js) -- one full camera turn
// around the parked car while tilt oscillates and settles and zoom eases in.
// Kept here rather than entirely inside game.js because controls.js's shared CSS
// (the UI fade-in) and the on-canvas HUD (drawing.js) both need to agree with
// game.js on the same timing rather than each guessing a duration.
const INTRO_DURATION = 4;       // seconds: length of the flourish; input stays locked out until it ends
const INTRO_UI_DELAY = 1;       // further seconds of stillness before the UI starts fading in
const UI_FADE_DURATION = 1;     // seconds the UI (panels and HUD) take to fade in once they start
const INTRO_ZOOM_START = 1.0;   // PX_PER_FT at the start of the intro -- wider than either default above
const INTRO_TILT_CYCLES = 2.5;  // tilt oscillations during the intro before it settles on Y_SCALE_DEFAULT

// Driving game only: the analog speedometer (drawing.js), bottom right of the
// canvas HUD. The needle sweeps 270 degrees -- from bottom-left, up over the
// top, to bottom-right -- which is the standard automotive gauge layout, so it
// reads as a real instrument rather than an arbitrary dial.
const SPEEDO_MAX_MPH = 80;
const SPEEDO_SWEEP_START = Math.PI * 0.75; // 135deg: bottom-left, the 0mph end
const SPEEDO_SWEEP = Math.PI * 1.5;        // 270deg total sweep, through the top
const SPEEDO_TICK_STEP = 5;                // a tick every 5mph
const SPEEDO_LABEL_STEP = 20;              // text labels only at 20/40/60
const SPEEDO_RADIUS_DESKTOP = 52;
const SPEEDO_RADIUS_TOUCH = 36;            // smaller on phones -- screen real estate is tighter

// Driving game only: the current-street sign (drawing.js), bottom left, styled
// after a real US street-name blade sign. Larger on desktop, smaller on a
// touch device, the same reasoning as the speedometer above.
const STREET_SIGN_FONT_DESKTOP = 19;
const STREET_SIGN_FONT_TOUCH = 13;

// Live-computed from current VIEW_ANGLE (changes when user rotates)
function getCosV() { return Math.cos(VIEW_ANGLE); }
function getSinV() { return Math.sin(VIEW_ANGLE); }

const MAX_SPEED = 150;
const REVERSE_MAX = 30;
const DRAG = 3;   // coast-down when neither pedal is held; uniform across vehicles
// Acceleration and braking are per-vehicle, not global -- see vehicles/performance.js
const MAX_TURN_RATE = 3;
// The touch slider reports the same -1..1 range a held arrow key does, but a
// thumb pushed to the edge of a small on-screen track doesn't feel as sharp as
// a key doing the same job, so it gets a gain the keyboard doesn't.
const TOUCH_STEER_GAIN = 1.5;

// --- Seeing past tall buildings ---
// A building on the near side of a street stands between the camera and the road,
// and once it is more than a couple of storeys it hides the very street you are
// driving on. Such a building is painted see-through instead (see lotHidesStreet).
// 35ft rather than the 30 you might guess from storey heights, because what is
// measured is the top of the building and a house's is the tip of its roof. Over a
// whole city: 30ft ghosts one house in nine -- ordinary two-storey ones whose gable
// happens to peak past it, so two houses that look alike get drawn differently --
// while taking in no more offices (a two-storey office tops out around 30 either
// way). 35ft ghosts one house in thirty, and those really are the tallest on the
// block. Every church is over 45ft whatever you pick.
const BUILDING_FADE_MIN_HEIGHT = 35;
const BUILDING_FADE_ALPHA = 0.25;
// How far from vertical the street has to run on screen before its near side is
// in the way at all. Measured as |sin| of the angle between the street's screen
// direction and straight up: at zero the road runs up the screen and its
// buildings stand to either side of it, hiding nothing. Because the view is
// squashed vertically, this is a much smaller angle in the world than it looks --
// about ten degrees off the one heading that projects straight up the screen.
const BUILDING_FADE_MIN_SKEW = 0.35;

const STREET_CONTINUE_STRAIGHT_PROB = 0.9;
const INTERSECTION_HAS_LEFT_RIGHT_PROB = 0.83;

const CURVE_PROB = 0.23;
const CURVE_ANGLES = [30, 45, 60, 90].map(d => d * Math.PI / 180);
const CURVE_RADII = [DEFAULT_BLOCK_LEN];
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
