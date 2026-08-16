For this project, infinite-city-js, please add any prompts I send you to prompts.txt

If I'm talking to you from the Claude mobile app (not desktop), always push each
change directly to origin main, rather than opening a PR -- that's how I load the
GitHub Pages site on my phone to test it.

## Controls

`controls.js` holds the pointer and touch UI every page shares: drag to scroll,
pinch to zoom, the camera toolbar in the top right corner, and the driving game's
on-screen steering slider and pedals. It is loaded right after `constants.js` and
drives the same globals the keyboard does (`PX_PER_FT`, `VIEW_ANGLE`, `Y_SCALE`),
so drawing code never has to know it exists. A page opts in by calling
`initPanZoom({ onPan, onReset })`; the driving game passes `pan: false` because its
camera already follows the car. The pedals appear only on a coarse pointer --
`?touch=1` forces them on to try them on a desktop, `?touch=0` off.

With no real DOM every entry point turns into a no-op, which is what keeps
`tools/render.js` working.

## Vehicles

`vehicles/` mirrors `buildings/`: `vehicleUtils.js` holds what every vehicle type
shares -- the type registry (`registerVehicle` / `generateVehicle` /
`generateRandomVehicle`), the palette, the wheels, `makeCarLike()` and
`drawVehicle()` -- and one file per body style holds the rest. `sedan.js` and
`pickupTruck.js` so far; the player gets one at random, weighted by the `weight`
each type registers.

Models are built in vehicle-local feet: **+x forward, +y the car's right, z up**,
origin on the ground at the centre of the footprint. `drawVehicle()` rotates and
places them, so a model never knows where it is; that is what will let the same
code draw traffic later.

Every type so far is the same shape in different proportions -- a full-width lower
body, a narrower cabin, four box wheels, ~38 polys -- so that shape is
`makeCarLike(type, spec)` in vehicleUtils.js and a body style file is little more
than a table of ranges. `makeExtrudedProfile()` is what gives a sloping hood or a
raked windscreen without special cases; they are just edges of the profile.

What separates a sedan from a pickup is mostly `rearFrac` against `minRoofFrac`: a
sedan's boot is always shorter than its bonnet and always shorter than its flat
roof, a pickup's bed is longer than both. `spec.bed` lays one dark quad into the
rear deck for the bed floor -- a real box would need interior walls, and the far
one of those is a backface, so it would be culled and leave a hole to see through.

Both flanks' side windows are one pane each (no B-pillar at this size), and the
right-hand one is wound in reverse: mirroring a polygon flips its normal, so
without that both faces point the same way and you get two windows from one side of
the car and none from the other.

Detail is chosen by `PX_PER_FT` alone (`VEHICLE_SOLID_MIN_ZOOM`,
`VEHICLE_WHEELS_MIN_ZOOM`, `VEHICLE_GLASS_MIN_ZOOM`), down to a single flat
rectangle of the right size and colour when zoomed way out. Wheels, body and glass
are painted as three separate passes, because depth sorting compares whole polygons
and cannot resolve the wheels tucked inside the body -- the same reason buildings
hang their windows off a child drawable.

## Testing

`streetTest.html` is the fastest way to check street generation: it grows a whole
city up front (no car, camera flies around) via the same `initMap()`/`generate()`
path the driving game uses. `?seed=123` makes it deterministic, and `S` saves a PNG.

Agents without a browser can test headlessly with `tools/render.js`, which runs the
real page scripts in a Node `vm` with a stub DOM. No dependencies, no build step.
Two complementary techniques, both provided by that file:

- **Look at it.** `node tools/render.js out.png "?seed=42&streets=500"` paints the
  frame with a software canvas and writes a real PNG, so an agent can read the image
  and see the result. Layout and geometry bugs (sidewalk corner joins, for one) are
  far easier to see than to assert. The rasterizer has no antialiasing and drops
  sub-pixel-thin features, so don't trust it on hairlines -- verify those by counting.
- **Count the calls.** `probeCtx(cb)` returns a context that draws nothing and reports
  every call, for assertions pixels answer badly: "does every street draw exactly two
  sidewalk bands", "does any NaN reach the canvas". Pass it to `renderPage({ ctx })`.

`renderPage({ search, width, height, scripts })` is also exported for custom harnesses;
it returns `{ ctx, sandbox, run }`, where `run('expr')` evaluates inside the page, e.g.
`run('initMap(); growCity(500)')`. A `scripts` entry may be `{ code }` instead of a
filename, standing in for an inline `<script>` tag.

Buildings have their own pages, one per type: `buildings/houses.html` and
`buildings/churches.html` lay out one building on every lot size that type is ever
asked for (lot width across, depth back), so the extremes are always on screen. Both
are `buildings/lotGrid.js` with a different `GRID_TYPE`, and take `?seed`, `?step`,
`?setback`, `?zoom`. Loading them headlessly needs the inline `{ code: "const
GRID_TYPE = 'house';" }` script before `lotGrid.js`.

`vehicles/vehicles.html` is the same idea for vehicles: a 6x6 block of every
registered type, all facing the same way so proportions line up, with the steering
angle sweeping full left to full right across the columns. `?seed`, `?n`, `?type`,
`?zoom`, `?angle`, `?tilt`, and the same keys as the building pages. It loads
headlessly with no inline script -- `vehicles/vehicleGrid.js` finds its own canvas.