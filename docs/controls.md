# Controls

`controls.js` holds the pointer and touch UI every page shares: drag to scroll,
pinch to zoom, the camera toolbar in the top right corner, and the driving game's
on-screen steering slider and pedals. It is loaded right after `constants.js` and
drives the same globals the keyboard does (`PX_PER_FT`, `VIEW_ANGLE`, `Y_SCALE`),
so drawing code never has to know it exists. A page opts in by calling
`initPanZoom({ onPan, onReset })`; the driving game passes `pan: false` because its
camera already follows the car. The pedals appear only on a coarse pointer --
`?touch=1` forces them on to try them on a desktop, `?touch=0` off. The steering
slider has a small dead zone at its centre (`STEER_DEAD_ZONE`), rescaled so full
lock is still reachable at the ends of the track -- without it a thumb held near
"straight ahead" reads as a faint drift, because a fingertip is wide next to the
track.

With no real DOM every entry point turns into a no-op, which is what keeps
`tools/render.js` working.

Every page that pans the camera with the keyboard (the driving game, and the
three camera test harnesses below) accepts WASD alongside the arrow keys --
`keys['ArrowUp'] || keys['w'] || keys['W']`, and so on for the other three
directions, at every call site that used to check the arrow alone. The three
test harnesses (`streetTest.js`, `buildings/lotGrid.js`,
`vehicles/vehicleGrid.js`) each used to bind `S` to `saveScreenshot()`, which
would have collided with `S`-to-pan-down; all three now bind that to `P`
instead (and the on-canvas HUD hint and the file's own header comment say so).

The camera toolbar's opener-above-panel trick (`ic-cam` / `ic-cam-panel ic-hidden`
/ `ic-btn`, a button that toggles a sibling panel's hidden class) is reused by two
other floating controls, one on each side of the toolbar itself, so all three read
as one family without sharing any more code than the CSS:

- `initHudToggle(get, set)` is a small button pinned to the opposite corner
  (top left) of whichever page calls it -- `streetTest.js`, `buildings/lotGrid.js`
  and `vehicles/vehicleGrid.js` each already have a `showHud`/`drawHud()` pair
  behind the H key, and this is just a way to flip the same boolean from a
  touchscreen, where the on-canvas debug pane is proportionally biggest and there
  is no keyboard to press H on. It only calls `set()`; the page's own `drawHud()`
  still decides what "hidden" looks like. It returns a `sync()` the page's H-key
  handler calls too, so the button's glyph (`ℹ`/`✕`) still matches after a
  keyboard toggle. Each of the three pages nudges its debug pane's own draw
  origin down (`HUD_TOP`) so it starts clear of the button instead of under it.
- The driving game's own car-switcher (see below) sits one slot over from the
  camera toggle, built the same way but by `game.js` rather than `controls.js`,
  since it is driving-game-only. On `driving.html` specifically both toolbars
  live in the top left rather than controls.js's own top-right default -- see
  "Keeping the top right clear", below.

The camera panel itself gains one more row on the driving page only: a "follow
car" checkbox (on by default), added by `game.js` reaching into the already-built
panel through `cameraPanelEl` -- a reference `buildCameraToolbar()` stashes the
moment it builds the panel, precisely so a page loaded afterward can still add to
it without `controls.js` having to know any page-specific row exists. Checked, it
rotates the view to keep the car's own heading roughly put on screen as it turns,
with a dead zone (`CAMERA_FOLLOW_DEAD_ZONE`, 25 degrees) so ordinary steering
wander doesn't tug the camera around -- only a sustained turn past the zone's
edge pulls the view with it, and keeps pulling for as long as the car keeps
turning, which is what makes cornering read as a proper chase camera rather than
either a statue or a bloodhound. `followAnchor` is the on-screen heading the car
is free to drift the zone's width either side of before `update()`'s per-frame
check starts compensating, by exactly the excess, every frame -- never the whole
error, or a sustained turn would snap the view straight rather than smoothly
keeping pace with it.

Q/E and the toolbar's own rotate buttons still move `VIEW_ANGLE` directly and
instantly, exactly as they always did, through `rotateView()`
(`cameraRotateHook`, a hook in the same style as `cameraResetHook`, left `null`
on every page but this one). What changes is that the same nudge also carries
`followAnchor` along by the same amount, which is the "set the target" a manual
rotate now does: it redefines where the dead zone is centred without itself being
subject to it (a rotate button gated by the zone would sit dead for the first
quarter-second of every press, which reads as broken, not smoothed), and the
automatic check above keeps seeking to hold the car within whichever zone was
last set, however it got there. Flipping the checkbox off doesn't blank
`followAnchor` -- it stops being read at all until the checkbox comes back on, at
which point it is recomputed fresh from the car's current heading (`setCameraFollow`),
so turning the option on or off never itself causes a jump.

## Keeping the top right clear

Every other page is happy with `controls.js`'s own default -- camera toolbar
top right, `initHudToggle`'s debug button top left -- but driving is the one
page where that default actively works against the player: the top right of
the screen is exactly where a turn or an oncoming car most needs to be read at
a glance, so nothing should sit over it there. `game.js`'s `VEH_PICKER_CSS`
carries a small override, `.ic-cam { left: 10px; right: auto; ... }`, that
moves both the camera toolbar and the car-switcher (`.gm-veh`, one slot over
from it) to the top left instead. It's scoped by nothing more than which page
loads it -- `VEH_PICKER_CSS` only ever reaches the DOM from `game.js`, so this
never touches `streetTest.html` or the building/vehicle grid pages, which keep
`controls.js`'s stock layout (and its debug-button/HUD-pane pairing, which
depends on the button staying in the same corner the on-canvas pane starts
clear of -- see `initHudToggle` above). The debug button itself is simply
never built on `driving.html` at all (`initHudToggle` is only ever called by
the three debug pages), so there is nothing there to move in the first place.

The on-canvas HUD follows the same rule to the opposite corner: the
speedometer and streets counter (`drawing.js`) sit bottom right rather than
top left, so the whole driving HUD collects into the two corners furthest from
the one the player needs clearest -- instead of splitting across both top
corners the way the flat "NN mph" box used to. `driveBarHeight()` measures the
real `.ic-drive` pedal bar (via `getBoundingClientRect()`, which folds in
whatever safe-area inset a notched phone adds to the bar's own bottom padding)
so the HUD sits just clear of it on a touch device instead of drawing under it
where the bar covers it, and simply falls back to a small fixed margin when
there's no bar at all (`touchDrive.shown` false, including the whole headless
render harness, where it's always 0). Read once and cached: the bar's own
height never changes after `initDriveControls()` builds it.

The speedometer itself (`drawSpeedometer()`) is an analog dial rather than the
old flat number: a dark bezel, a 270-degree tick sweep (`SPEEDO_SWEEP_START`
to `+SPEEDO_SWEEP`, constants.js -- bottom left, up over the top, to bottom
right, the standard automotive layout) from 0 to `SPEEDO_MAX_MPH`, a tick
every `SPEEDO_TICK_STEP` (5mph) with the three interior multiples of
`SPEEDO_LABEL_STEP` (20/40/60) numbered -- 0 and 80 are the sweep's own ends
and don't need a label to read as empty and full -- a red arc over the last
12.5% of the sweep, and a needle. All of it is drawn in gauge-local pixels
around `(0,0)` as a fraction of the radius `r`, with placement left entirely
to a `ctx.translate` the caller does first, which is what lets the one
function serve both the larger desktop dial (`SPEEDO_RADIUS_DESKTOP`) and the
smaller one on a touch device (`SPEEDO_RADIUS_TOUCH`) without any of its own
math caring which. A digital reading of the exact mph sits in the dial's lower
third, the one part of the circle the 270-degree sweep never reaches into, so
it never competes with a tick or the needle for space.

The bottom-left corner carries the current street's name (`drawStreetSign()`),
level with the speedometer's own bottom edge (both sit on the same `streetsY`
line) so the two corners read as a matched pair rather than one HUD element
floating higher than the other. `currentStreetAt(player.x, player.y)` (see
"Street names" in `docs/streets.md`) supplies the name each frame; the sign simply doesn't
draw when it returns `null` -- cutting across a lot, say -- rather than
showing a stale or guessed one. Styled after a real US street-name blade sign
rather than a plain label, because the name itself is the fun part of this
feature and a flat text box would have undersold it: a green field
(`#0b5e3a`, deliberately not `drawScene`'s grass green, so the two are never
confused at a glance), a white border, white all-caps text, a fainter inner
keyline standing in for the reflective sheeting margin a real sign carries,
and a small bolt near each end where a blade sign would actually be
through-bolted to its mount. The corners are clipped rather than rounded
(`clippedRectPath()`, shared with the border and the keyline so both nest
around the same shape at different insets) -- diagonal cuts read as stamped
sheet metal, round ones read as a UI panel. Sized off `fontPx`
(`STREET_SIGN_FONT_DESKTOP`/`_TOUCH`) alone, the same one-function-two-sizes
trick the speedometer uses; unlike the speedometer, though, the sign doesn't
know its own width until it's measured the name, so it's anchored by its
left and bottom edges rather than a centre a caller could hand it up front.

## The radar minimap

`minimap.js` is a circular radar in the top left of the canvas HUD, under the
camera/car/settings toolbar buttons (`MINIMAP_TOP` is 64, clearing the 44px
buttons pinned at `top: 10px`). It is driving-only -- `driving.html` loads it
after `game.js`, since it reads that page's canvas and adds a row to the camera
panel `controls.js` built -- and `drawing.js` calls it from inside the same
`uiAlpha` block the speedometer and street sign live in, so it fades in with the
rest of the HUD and stays hidden through the startup flourish. On the canvas
rather than in the DOM, for the same reason as the other two: it is an
instrument, not a control.

Streets are their own pavement colour (a flat 2px on desktop, 1.4 on touch --
a street is really about 1.3px wide at this range, and drawn at its true width
it would be a dotted smudge), traffic is a dot in the car's own colour, towers
and churches are small squares, and the player is an arrow at dead centre in
their car's colour. Every borrowed colour is run through `applyLighting` with a
straight-up normal -- a radar looks down, so that is the roof's light -- which
keeps a dot recognisably the same colour as the car it stands for instead of the
flat unlit value nothing is ever drawn in. Building colours are taken off the
building's own drawable (first poly in tree order) rather than declared per
type, so adding a landmark type is one entry in `MINIMAP_LANDMARK_TYPES`.

**Up is north by default, and that is the point.** The main view already
rotates -- Q/E, camera-follow, the intro's full turn -- so a minimap that
rotated with it would leave nothing on screen holding still, and no way to tell
"I came from over there" from "the camera swung round". The "map locks to car"
checkbox in the camera panel (next to "follow car" and "shift car view") gives
back the usual game-radar behaviour, and tapping the map itself does the same,
which is the one control here a phone can reach without opening a panel;
`setMinimapLocked` is what both go through, so they can't disagree. Locked, the
map frame is rotated by `-heading - PI/2` and the compass marks ride round the
rim with it -- the red north tip becomes a real compass needle, which is what
makes the locked mode survivable at all. The player arrow is drawn pointing up
and rotated by the heading inside that same frame, so the two modes need no
second code path: in locked mode the frame's own counter-rotation cancels it.

Two things keep the cost down, both of which start to matter once a city is a
few thousand streets. Streets and landmarks don't move, so the culled lists are
cached and only rebuilt once the player has driven `MINIMAP_CACHE_MOVE` (60ft)
from where they were last built, or `streets.length` has changed -- the cull box
is padded by that same distance, so nothing can cross the rim between rebuilds
without having been collected first. And the cached streets are grouped by
colour at rebuild time, so a frame is one path and one stroke per distinct
pavement grey (about a dozen) rather than one per street. Traffic is the only
thing walked every frame, being the only thing that moves, and `traffic` only
ever holds the cars near the player anyway. Measured on a 900-street city with
170 cars: 0.065ms of JS a frame against `drawScene`'s 7.9ms, plus a 0.083ms
rebuild about every twentieth frame at speed.

Everything inside the dial is drawn in *world feet* -- the transform is the
map's own rotation and scale, so a straight street is its two real endpoints and
a curve is `ctx.arc` on its real arc, with no per-item projection at all. Widths
meant to be a fixed number of screen pixels are divided back out by the scale.
(`tools/render.js` gained a real `clip()` and a transform-aware `stroke()` width
so the headless harness can render this honestly.)

## Mobile vs desktop default zoom

The driving game's default `PX_PER_FT` is no longer one constant: a phone's
screen has far less room to read the road ahead in than a desktop monitor
does, so `PX_PER_FT_DEFAULT_MOBILE` (2.2) sits further out than
`PX_PER_FT_DEFAULT_DESKTOP` (3.0), both in `constants.js`. `pxPerFtDefault()`
(`controls.js`) is the one place that picks between them, off the exact same
`wantsTouchControls()` coarse-pointer test (and its `?touch=` override) every
other mobile-vs-desktop HUD choice already uses -- so a phone forced into
desktop mode with `?touch=0` gets the desktop default too, consistently with
everything else that test drives. Every caller that used to read the old flat
`PX_PER_FT_DEFAULT` now calls `pxPerFtDefault()` instead: `game.js`'s intro
flourish eases toward it (captured once, at load, as `introTargetZoom`, since
`initDriveControls()` -- and so `touchDrive.shown` -- already runs before
`introStartAngle` is even declared), `resetCamera()`'s no-hook fallback
(`controls.js`) snaps to it on double-click/tap, and the three non-driving
camera pages (`streetTest.js`, `buildings/lotGrid.js`,
`vehicles/vehicleGrid.js`) use it as the reference zoom their own keyboard pan
speed is scaled against -- unaffected in practice, since none of them show the
touch pedals `touchDrive.shown` would need, but `wantsTouchControls()` still
answers correctly for a phone visiting those pages directly.

## Mobile vs desktop default view angle and car position

Two more driving-only defaults split the same way as zoom above, both off the
same `wantsTouchControls()` test: `viewAngleDefault()` (`controls.js`) picks
`VIEW_ANGLE_DEFAULT_MOBILE` (-60 degrees) over the plain `VIEW_ANGLE_DEFAULT`
(-45 degrees, still what every non-driving camera page gets) because a phone's
portrait screen has much less width to spare than a desktop monitor's, and
turning the view further round trades some of that scarce width for a longer
look at the road ahead. `game.js` sets `VIEW_ANGLE` from it once, before the
startup intro (below) captures its own starting angle, and `resetCamera()`
(`controls.js`) reads it too, so double-tapping to reset lands back on
whichever default the device actually gets rather than always the desktop one.

Separately, the driving game draws the car left of and below dead centre rather
than at it, for the same reason: down trades the (mostly empty) space behind
the car for more of what's coming up ahead, and left does the same across the
width. On by default on both mobile and desktop, with a "shift car view"
checkbox in the camera panel next to "follow car" (`carOffsetEnabled`,
`buildCarOffsetToggle()` in `game.js`).

The way it's done is the part worth knowing, because the obvious way is a trap.
There are **two** paths from world coordinates to screen pixels, and they do not
share code: the ground, streets and markings are drawn through the `ctx`
transform `applyCamera` (`drawing.js`) sets up, while every vehicle and building
goes through `render3d.js`'s `project()`, which computes its own screen
coordinates from `canvas.width / 2` directly and never sees that transform at
all. Nudging the `applyCamera` translate -- the obvious "shift the view" move --
therefore slides the streets out from under the cars, by the full offset: at the
driving zoom that is tens of feet of world displacement, enough to leave every
car parked a couple of lanes off the road it is supposed to be driving on.

So the offset is applied to the **camera's own world position** instead, which
is one number both paths already read and so cannot desync. `game.js` keeps
`viewCamX`/`viewCamY` -- the world point sitting at true screen centre -- and
`draw()` hands those to `drawScene` in place of `player.x, player.y`. They are
the car's position shifted by however many feet put the car at the wanted spot
on screen, and `dragToCamDelta()` (`controls.js`) is already exactly that
conversion, screen pixels to camera feet, so it does the unprojection with the
rotation and the `Y_SCALE` squash folded in. Everything downstream that takes a
camera -- the cull box, the depth sort, `drawHonks` -- stays correct for free,
and no other page is touched, since nothing in the rendering path knows this
happens at all.

`updateViewCam()` recomputes it once a frame, deliberately at the *end* of
`update()`: `VIEW_ANGLE`, `Y_SCALE` and `PX_PER_FT` all still move earlier in
the same frame (the intro flourish, camera-follow, the zoom/rotate/tilt keys)
and all three feed the unprojection, so recomputing after they settle is what
holds the car on one exact pixel through a rotation instead of letting it drift
during one -- the camera swings around the car, which is what keeps rotation
about the car. The offset itself is a fraction of the canvas
(`CAR_OFFSET_X_FRAC`/`_Y_FRAC`, `constants.js`) rather than a pixel count so it
holds across window sizes, and on a touch device the downward half is capped
against `driveBarHeight()` (see below) plus the street sign's own height, so it
can never tuck the car under either -- both are anchored to the bottom edge,
exactly where "down" is headed.

## Full detail at the mobile default

`vehicles/vehicleUtils.js`'s level-of-detail thresholds used to drop roof
fittings and glass well above the old single default zoom
(`VEHICLE_ROOF_MIN_ZOOM` 2.5, `VEHICLE_GLASS_MIN_ZOOM` 4 against a 2.4
default) -- a light bar or a windshield a phone player driving at the default
zoom would never actually see. Both now sit at exactly 2.2, the mobile
default above, so every vehicle is fully detailed from the mobile default
zoom and up on both kinds of device; `VEHICLE_SOLID_MIN_ZOOM` (0.9) and
`VEHICLE_WHEELS_MIN_ZOOM` (1.6) already cleared that bar. Buildings need no
equivalent change: nothing in `buildings/` drops a window or any other detail
by zoom at all -- a building is either fully drawn (whatever its own zoom
cutoffs in `lots.js`, `HOUSES_MIN_ZOOM`/`SKYLINE_MIN_ZOOM`, are both well
under 2.2) or not drawn, never partially.

## Startup intro sequence

`driving.html` opens with a four-second flourish rather than dropping the
player straight into a static, one-street city: `game.js`'s `updateIntroCamera()`
sweeps `VIEW_ANGLE` through one full turn around the parked car (`introStartAngle`
`+ TWO_PI`, landing back on the same heading it started from), eases `PX_PER_FT`
in from a wider establishing shot (`INTRO_ZOOM_START`) to the driving default
(`introTargetZoom`, captured once from `pxPerFtDefault()` -- see "Mobile vs
desktop default zoom" above -- rather than re-read every frame, since it can't
change mid-session), and swings
`Y_SCALE` through a couple of decaying oscillations before settling dead on
`Y_SCALE_DEFAULT`. All three are driven off one shared `t = elapsed / INTRO_DURATION`,
which is what keeps them visibly part of one flourish rather than three
independent animations that happen to start together. The decay factor
(`(1-t)^2`) and the ease (`1 - (1-t)^3`) both approach, but never exactly reach,
their rest values by floating-point equality, so `finishIntroCamera()` snaps
every value to its exact default the moment `elapsed` crosses `INTRO_DURATION`
rather than trusting the animation to land there itself -- and it recentres
`followAnchor` on the just-settled `VIEW_ANGLE` at the same time, because
otherwise camera-follow (above) would read the flourish's own 360-degree sweep
as a sustained turn and spend the first frame after intro violently correcting
for it.

Every input path is locked out for those same four seconds: keyboard driving
and the zoom/rotate/tilt keys (gated by `inputLocked` inside `update()`'s own
branches), the mouse wheel, and pinch-to-zoom (`inputLocked`, declared in
`controls.js` so pages without `game.js` never set it and keep working exactly
as before). `inputLocked` flips false the instant `finishIntroCamera()` runs, at
`elapsed === INTRO_DURATION` -- one second before the UI itself reappears, so a
player who mashes a key right at the four-second mark is already driving before
they can see any controls to press.

The UI stays hidden a further second after that (`INTRO_UI_DELAY`, or less on
mobile -- `introUIDelay()`, below) and then fades in over `UI_FADE_DURATION`,
on two different mechanisms because half the UI is DOM and half is canvas. `document.body` carries an `ic-intro` class from
the moment `game.js` loads; `controls.js`'s shared CSS declares `opacity: 0;
pointer-events: none` on `.ic-cam`/`.ic-drive` under that class and an
unconditional `transition: opacity` on the same selectors, so the instant
`update()` removes the class the camera toolbar, vehicle picker, and touch
pedals all fade in together for free -- no per-page JS needed, and every other
page that never adds `ic-intro` is unaffected. The on-canvas HUD (mph, street
count, and the existing "Arrows: drive" hint in `drawing.js`) has no CSS to
lean on, so `update()` computes `uiAlpha` manually from the same `elapsed` and
`drawing.js` wraps that block in a matching `ctx.globalAlpha`. The pre-existing
"Arrows: drive" hint used to be visible from frame one and fade out around the
four-second mark on its own; `instructionAlpha` now starts at 0 and rides
`uiAlpha`'s reveal timing before fading back out a few seconds later, so it
never appears while the rest of the driving controls are still locked out and
invisible.

Throughout the four seconds, `game.js` shows the player which vehicle they were
randomly assigned -- `vehicleDisplayName(playerVehicleType) + '!'` in a `position:
fixed` banner pulsing grey to white via a plain CSS `@keyframes` animation
(`gm-pulse`), positioned at `top: 14%` rather than centred so it clears the car
itself, which `drawScene` puts roughly in the middle of the screen. The banner
is a DOM overlay rather than a canvas draw specifically so the pulse can be a
free-running CSS animation instead of something `update()` has to compute every
frame. `playerVehicleType` is picked via `randomVehicleType()` directly, rather
than through `generateRandomVehicle()` as before, because a generated vehicle
carries no name of its own for the banner to read back afterward.

Waiting through `INTRO_UI_DELAY` feels longer on a phone, where there's no
keyboard hint worth protecting from an early tap, so the driving controls
there appear `UI_DELAY_MOBILE_EARLIER` seconds sooner -- `introUIDelay()`
(`controls.js`) is the same `wantsTouchControls()`-gated pattern as
`pxPerFtDefault()`/`viewAngleDefault()` above, and both `update()`'s `uiAlpha`
calculation and `loop()`'s `uiRevealTime` read it instead of the flat
`INTRO_UI_DELAY`. `INTRO_DURATION` itself, and the flourish it drives, are
untouched -- only the further wait after it shrinks.

The camera sweeps every direction during the flourish, which would otherwise
make a tall building flicker in and out of `BUILDING_FADE_ALPHA` (see "Seeing
past tall ones" in `docs/buildings.md`) as it crossed in front of whatever street it's beside --
one more thing competing with the flourish for attention, and gone almost as
soon as it appeared. `game.js` sets the shared `buildingFade` flag (`lots.js`)
false for the same span the UI stays hidden, so every building draws solid
through the whole intro, and snaps it back true -- not eased -- in the same
`update()` branch that starts the UI's own fade-in, since that fade is already
the transition the eye is following at that moment.

## Mobile steering, WASD, and the driving settings panel

Keyboard driving accepts WASD alongside the arrow keys -- `update()`
(`game.js`) ORs `keys['w']/['W']` into the same gas check as `keys['ArrowUp']`,
and likewise for the other three -- and the on-canvas hint (`drawing.js`) says
"WASD/Arrows" rather than just "Arrows" to match. The `Q/E: rotate  R/F: tilt`
half of that same hint was already there; nothing needed adding for it.

Touch steering has two widgets sharing one slot in the drive bar, built
together by `initDriveControls()` (`controls.js`) and toggled with `ic-hidden`
rather than one being constructed lazily, so switching between them is instant
and never has to tear down or rebuild any DOM:

- **Digital left/right buttons** (`.ic-steer-digital`, the default) --
  `touchDrive.steerLeft`/`steerRight`, held down like a keyboard key, released
  back to centre the instant a finger lifts. Easier to hit accurately on a
  small screen than dragging a thumb to an exact spot on a slider, at the cost
  of the slider's continuous analog control.
- **The analog slider** (`.ic-steer`, as before) -- shown instead when
  `ANALOG_STEERING_ENABLED` (`constants.js`, off by default) is on.

`setAnalogSteering(on)` (`controls.js`) flips the flag, zeroes whatever the
previous widget had live (`touchDrive.steer`/`steerLeft`/`steerRight`) so a
stale full-lock value or a button caught mid-press can't survive the switch,
and re-syncs which widget is visible.

`update()` builds a `digitalSteer` value (`-1`/`0`/`1`) from arrows, WASD, and
the two on-screen buttons together -- whichever source is active, keyboard or
touch, they all feed the same digital input, and it takes priority over the
analog slider exactly as arrow keys always took priority over the old slider
alone (`steer = digitalSteer; if (steer === 0) steer = touchDrive.steer *
TOUCH_STEER_GAIN`).

**Fine-steering ramp.** Digital steering -- unlike the analog slider, which
already has continuous control of its own -- turns at `STEER_HALF_RATE_FACTOR`
of the normal rate for the first `STEER_HALF_RATE_DURATION` seconds a
direction is newly held, so a quick tap nudges the car gently instead of
snapping straight to full rate. `digitalSteerSign`/`digitalSteerHoldTime`
(`game.js`, module-level so they persist frame to frame) track how long the
*current* direction has been held: switching from left to right resets the
timer just as releasing and repressing the same direction would, since a
change of direction is exactly the moment fine control matters again. The
scale multiplies the turn-rate term directly
(`player.angle += MAX_TURN_RATE * tf * steer * dt * steerRateScale`) rather
than touching `player.steer`, which stays the plain -1..1 input the front
wheels' visual turn reads from -- the ramp slows how fast the car actually
turns, not how far the wheels appear to be cranked over.

**Layout.** `STEER_WIDTH_FRAC` (`constants.js`, default 0.38) is the fraction
of the drive bar's width the steering widget -- slider or buttons, whichever
is showing -- takes; gas and brake split the rest evenly as they always did,
simply by both being `flex: 1 1 50%` children of a pedals container that is
now `100% - STEER_WIDTH_FRAC` wide instead of a flat half. `applyDriveWidths()`
(`controls.js`) sets both as inline `flex-basis`, which wins over the
stylesheet's own (matching) defaults, so `setSteerWidthFrac(v)` can move the
split live without touching any CSS. `STEER_DEAD_ZONE` (default 0.08/3, a
third of the slider's old fixed dead zone) is read live by the slider's own
`setSteer()` on every move rather than captured once, so `setSteerDeadZone(v)`
takes effect on the very next touch.

**The settings panel** (`game.js`'s `buildSettingsPanel()`) is a second
toolbar one slot right of the vehicle picker -- `.gm-settings { left: 114px }`,
the same one-slot-over-from-the-last-one trick `VEH_PICKER_CSS` uses for the
picker itself (see "Keeping the top right clear" above) -- opened by a `⚙`
button. It holds the "analog steering" checkbox and a row per tunable constant
above (`settingsRangeRow()`, a small helper that wires a range input to a
getter/setter pair and a value readout). Every row shows the value it's
currently set to, converted to whatever unit is easiest to read (a percentage
for a fraction, seconds for a duration) rather than the raw stored number, so
a value that feels right while dragging the slider can be read straight off
the panel and reported back as a new default in `constants.js` -- these
settings are session-only, not persisted, by design: the panel is a tuning
tool, not a user preference.
