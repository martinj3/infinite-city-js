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
`generateRandomVehicle`), the palette, the wheels, `makeCarLike()`,
`makeTruck()` and `drawVehicle()` -- and one file per body style holds the rest:
`sedan.js`, `pickupTruck.js`, `suv.js`, `van.js`, `policeCar.js`, `cityBus.js`,
`schoolBus.js`, `deliveryVan.js`, `fireTruck.js`, `trashTruck.js`,
`cementTruck.js`, `vwBeetle.js`, `vwMinibus.js`, `corvette.js`, `countach.js`,
`enzo.js`, `wrangler.js`, `mustang.js`.
The player gets one at random, weighted by the `weight` each type registers, so
SUVs and cars are the common case, buses and work trucks the rare ones, and the
classics rarer still.

Three more are registered but have no body style yet -- `craneTruck.js`,
`boxTruck.js`, `semiTruck.js` -- each a one-liner calling
`registerPlaceholderVehicle(name)`, which draws it as a sedan at weight 0.
`r -= 0` in `randomVehicleType()` can never cross zero on its own, so a weight-0
type can only come up once every real type is exhausted, which never happens: no
special case anywhere has to know a placeholder is one.

Models are built in vehicle-local feet: **+x forward, +y the car's right, z up**,
origin on the ground at the centre of the footprint. `drawVehicle()` rotates and
places them, so a model never knows where it is; that is what will let the same
code draw traffic later.

Every type is the same shape in different proportions -- a full-width lower body, a
narrower cabin on top, four box wheels, 37-50 polys -- so that shape is
`makeCarLike(type, spec)` in vehicleUtils.js and a body style file is little more
than a table of ranges. `makeExtrudedProfile()` is what gives a sloping hood or a
raked windscreen without special cases; they are just edges of the profile.

Turn `hoodFrac` and `rearFrac` right down and the same code makes a box: that is
the city bus, whose "cabin" is the whole windowed body above the skirt. Turn the
bonnet back up and it is a school bus; shorten the body and it is a delivery van.
What separates a sedan from a pickup is mostly `rearFrac` against `minRoofFrac`: a
sedan's boot is always shorter than its bonnet and always shorter than its flat
roof, a pickup's bed is longer than both. `spec.bed` lays one dark quad into the
rear deck for the bed floor -- a real box would need interior walls, and the far
one of those is a backface, so it would be culled and leave a hole to see through.

A spec is normally a fixed table, but nothing says it has to be: `van.js` and
`suv.js` build their own per vehicle with `specOnSizeAxis()`. Each runs from a
compact to a full-size version of itself, and those dimensions are not independent
-- a 19ft van that is 5.5ft tall is not a vehicle anyone has seen -- so one `t`
picks a point on that axis and every size field is read off it. The jitter is
applied to `t`, not to the value it produces, so a dimension can never leave the
range it declares. Proportions that go with size ride along by being written
big-end-first (a minivan's raked windscreen against an Econoline's upright one).

The van's two subtypes differ only in glass and paint: a work van gets `sideGlass`
cut to the cab, `rearGlass: false` and a mostly-white palette, and records which it
is in `v.subtype`. What tells an SUV from a van, both being a tall box, is ride
height above all -- 1.30-1.70ft of sill on bigger wheels against 1.05-1.45ft --
then a bonnet a quarter to three-tenths of the length, sitting up at the window
line rather than sloping away below it, and a beltline high enough that under 40%
of the body is glass where a van is nearer half. The extra bonnet comes out of the
cabin, not the overall length. Height is *not* a
tell at the small end: a compact crossover and a minivan are the same height for
their length, and only the top of the axis diverges.

Glass is per-flank, and `spec.sideGlass` (a [from, to] pair measured back from the
front of the cabin) with `spec.bayFt` says which part of it is glazed and how
finely: a car takes the default single pane per flank (no B-pillar -- at this size
it would be a sub-pixel line), a bus asks for a bay every few feet, a van glazes
only the front fifth, which is all the cab it has. Gaps between panes come for
free, from the same inset that leaves a pillar around a car's window. Leaving the
default is also what merges a passenger van's rear side windows into one strip:
the pillars between them would be sub-pixel, so a pane per row of seats would cost
polygons and show nothing.

The right-hand flank is wound in reverse: mirroring a polygon flips its normal, so
without that both faces point the same way and you get two windows from one side of
the vehicle and none from the other.

`spec.palette` overrides the fleet colours -- school bus yellow, police liveries.
Anything a type bolts to the roof goes in `v.roof` (the police light bar so far),
drawn as its own pass after the body: a roof fitting is above every part of the
body by construction, so painting it last is always right. `makeCarLike()` returns
the chassis dimensions it derived in `v.frame` so a type can place such a thing
without re-deriving them.

The three work trucks are not car-likes: `makeTruck()` builds what they share -- a
cab (cab-over or conventional, recorded in `v.cab`), a heavy bumper, dark frame
rails, and a steering front axle ahead of a rear group that can be a tandem pair --
and each file bolts its apparatus on behind: the fire engine its compartment body,
racked ladder and light bar, the rear loader its extruded hopper-and-tailgate
silhouette, the mixer its drum, a tilted `makeLatheX()` (drawUtils.js) whose dark
rear cap is the mouth -- interior faces would be culled backfaces, so an open end
is painted, not modelled. The drum's belly band is one lathe ring in the cab's
colour, a whisker proud of the surface. Flank details that lie on a body face --
roll-up doors, stripes, ribs -- go in `v.trim`, a pass drawn right after the body,
because depth sorting cannot resolve a small quad inside a big face; `v.roof`
stays reserved for things above the whole vehicle (the trash truck's beacon rides
the body's top edge, not the cab, for exactly that reason -- its body stands taller
than its cab, which is also why a truck's glass joins the body batch instead of
the always-on-top glass pass: the body would show through it from behind).

The classics -- the Beetle, the splitscreen Minibus, `corvette.js`
holding both a C3 and a C7 behind one registered type (picked 50/50, recorded in
`v.subtype` like the van's), and the second batch below -- are real cars, not
families: every dimension is
the published one and nothing about the shape is random. Only the paint varies,
via `pickWeighted()`, which unlike `pickColorFrom()` adds no jitter, from each
car's factory palette weighted by real popularity (the C7's straight from
production counts). What the Beetle and both Corvettes are about is body-and-
wings: a narrow central profile carrying the greenhouse, and separate fender
extrusions riding outboard -- the Beetle's arches under its headlights, the C3's
peaks above its own hood line, which is the whole coke-bottle front view. The
bus is two stacked extrusions split at the beltline, one per colour of its
two-tone, and the nose V is a trim triangle with the roundel discs
(`makeDiscX()`) on it. Two lessons those details taught: the depth sort orders polys by their
ground-footprint centroid alone (`polyDepth()` in render3d.js -- height doesn't
count, or a tall far thing paints over a near low one), so a detail that must
paint over another stands a little *prouder of its face* (the roundel prouder
than the V, the C7's exhaust prouder than its diffuser) -- an outward push is
toward the camera exactly when that face is visible, and an exact tie keeps
batch order, later-pushed on top, since the sort is stable. Keep any single
face's footprint short where something overhangs its ends: one flank polygon
spanning most of a truck sorts as mid-truck and paints over the drum hanging
past it, which is why `makeTruck()` builds its frame rails in segments. And
a custom glass pane must walk its bottom edge first, the way `makeCarLike()`'s
do; wound from the top edge its normal points into the car, and the pane shows
through from the wrong side instead of its own.

The second batch of classics runs on the same rules. The Countach (QV wide
body, always with the V wing) and the Enzo are body-and-wings again -- the
Countach's flares are flat-topped trapezoids, drawn with a ruler like the real
ones, and the Enzo's central slab really is narrow because it is the F1 nose
cone, with the pontoon fenders and the radiator dips beside it. The Mustang
fastback is slab-sided, so its split is centre-and-shoulders instead:
full-length shoulder slabs carry the level beltline and the quarter kick, and
the fastback recess runs between them. The Wrangler TJ is the one with option
axes: `v.subtype` is 'hardtop' or 'open' 50/50 (top and doors off shows the
sport bar, the seats, and a tub whose top edge dips through the door opening,
with a dark interior quad floating on the tub top -- the pickup-bed trick), and
a third of them set `v.lifted`, which raises every body z by half a foot on
bigger wheels and changes nothing else. Its grille is the hood slab's own front
face, wearing trim slots. One more winding lesson from that build: a standing
windscreen with nothing behind it needs a second, rear-facing pane, or from
behind it reads as a painted metal plate -- one-sided glass is only ever enough
when some body face closes the view through it. And the Enzo's colour table is
nearly a census where the Countach's and the Wrangler's are estimates: 399
documented Enzos against no production-by-colour book at all for the other two
-- prefer real counts (Mustang's 1965 books, the C7's) whenever they exist.

Detail is chosen by `PX_PER_FT` alone (`VEHICLE_SOLID_MIN_ZOOM`,
`VEHICLE_WHEELS_MIN_ZOOM`, `VEHICLE_ROOF_MIN_ZOOM`, `VEHICLE_GLASS_MIN_ZOOM`), down
to a single flat rectangle of the right size and colour when zoomed way out. Wheels,
body, trim, roof fittings and glass are painted as separate passes, because depth
sorting compares whole polygons and cannot resolve the wheels tucked inside the body
-- the same reason buildings hang their windows off a child drawable.

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