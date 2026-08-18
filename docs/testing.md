# Testing

`streetTest.html` is the fastest way to check street generation: it grows a whole
city up front (no car, camera flies around) via the same `initMap()`/`generate()`
path the driving game uses. `?seed=123` makes it deterministic, and `P` saves a PNG.
Traffic runs here too, with the camera standing in for the player -- but the city is
grown before the camera has flown anywhere, so the cars are around wherever it
*started*: fly off and it thins out, and only `space` (build more streets) or `G`
(regenerate, around wherever you are now) puts new ones on the map.

Agents without a browser can test headlessly with `tools/render.js`, which runs the
real page scripts in a Node `vm` with a stub DOM. No dependencies, no build step.
`DEFAULT_SCRIPTS` is now read out of `streetTest.html`'s own script tags rather than
copied, so adding a file to that page is all it takes to reach the harness.
Two complementary techniques, both provided by that file:

- **Look at it.** `node tools/render.js out.png "?seed=42&streets=500"` paints the
  frame with a software canvas and writes a real PNG, so an agent can read the image
  and see the result. Layout and geometry bugs (sidewalk corner joins, for one) are
  far easier to see than to assert. The rasterizer has no antialiasing and drops
  sub-pixel-thin features, so don't trust it on hairlines -- verify those by counting.
  It draws no glyphs either, so a truck's lettering is a blank panel here; subclass
  `RasterCtx` with a `fillText` that blocks out each letter if you need to see where
  text lands. (Both test contexts answer `measureText` with a plausible width for
  the current font, so code that fits text to a box takes the branches it exists
  for instead of dividing by zero.)
- **Count the calls.** `probeCtx(cb)` returns a context that draws nothing and reports
  every call, for assertions pixels answer badly: "does every street draw exactly two
  sidewalk bands", "does any NaN reach the canvas", "does exactly one flank's name
  survive culling at every heading", "at what zoom does the lettering stop being
  drawn". Pass it to `renderPage({ ctx })`.

Neither test context draws glyphs, so whether lettering is legible -- the right
size, the right way round, readable against its background -- is the one thing
only a real browser answers. Chromium is pre-installed (see the environment notes)
and `playwright-core` drives it against a local static server in a dozen lines.

`renderPage({ search, width, height, scripts })` is also exported for custom harnesses;
it returns `{ ctx, sandbox, run }`, where `run('expr')` evaluates inside the page, e.g.
`run('initMap(); growCity(500)')`. A `scripts` entry may be `{ code }` instead of a
filename, standing in for an inline `<script>` tag.

Buildings have their own pages, one per type: `buildings/houses.html`,
`buildings/offices.html`, `buildings/churches.html` and `buildings/towers.html` lay
out one building on every lot size that type is ever asked for (lot width across,
depth back), so the extremes are always on screen. All four
are `buildings/lotGrid.js` with a different `GRID_TYPE`, and take `?seed`, `?step`,
`?setback`, `?zoom`. Loading them headlessly needs the inline `{ code: "const
GRID_TYPE = 'house';" }` script before `lotGrid.js`. Note that at the default
camera these pages show the *backs* of the buildings -- the lot's street edge is
the far one -- so `?angle=135` or so is what you want for a front door or a sign.
`?step` matters more than it used to: the tower grid's every cell is a skyscraper,
so `?step=20` is four of them and `?step=2` is a hundred and twenty. The fit leaves
room for the tallest building in the grid rather than for its footprint alone,
which is the only way a 400ft tower and a 25ft house can share a page.

`vehicles/vehicles.html` is the same idea for vehicles: a 6x6 block of every
registered type, all facing the same way so proportions line up, with the steering
angle sweeping full left to full right across the columns. `?seed`, `?n`, `?type`,
`?zoom`, `?angle`, `?tilt`, and the same keys as the building pages. It loads
headlessly with no inline script -- `vehicles/vehicleGrid.js` finds its own canvas.
