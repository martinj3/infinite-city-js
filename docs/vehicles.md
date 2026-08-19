# Vehicles

`vehicles/` mirrors `buildings/`: `vehicleUtils.js` holds what every vehicle type
shares -- the type registry (`registerVehicle` / `generateVehicle` /
`generateRandomVehicle`), the palette, the wheels, `makeCarLike()`,
`makeTruck()` and `drawVehicle()` -- and one file per body style holds the rest:
`sedan.js`, `pickupTruck.js`, `suv.js`, `van.js`, `policeCar.js`, `cityBus.js`,
`schoolBus.js`, `deliveryVan.js`, `fireTruck.js`, `trashTruck.js`,
`cementTruck.js`, `boxTruck.js`, `vwBeetle.js`, `vwMinibus.js`, `corvette.js`,
`countach.js`, `enzo.js`, `wrangler.js`, `mustang.js`.
The player gets one at random, weighted by the `weight` each type registers, so
SUVs and cars are the common case, buses and work trucks the rare ones, and the
classics rarer still -- and can swap it for any other registered type mid-drive
from the switcher `game.js` builds next to the camera toolbar (see `docs/controls.md`):
one dropdown row per type, sorted by display name, each carrying a small live
thumbnail (`renderVehicleThumb`) rendered with `drawVehicle()` itself, so a
preview can never drift from what driving the car actually looks like. The trick
is that `render3d.js`'s `project()`/`projectAndDraw()` read `canvas`/`ctx` as
plain globals rather than taking them as arguments -- so `game.js` declares both
`let` instead of `const` and the thumbnail renderer briefly points them at an
offscreen canvas, draws one vehicle, and points them back, all synchronously
within one call, so there is never a frame in which the wrong canvas is "live".
A placeholder type (`registerPlaceholderVehicle`, weight 0) is left out of the
list the same way it's left out of the player's random spawn and of traffic --
it would just be a sedan wearing someone else's name tag. Switching carries the
car's position and speed over untouched and only replaces `vehicle` and `perf`,
so stepping into something slower doesn't teleport or stall the car, it just now
has a slower car's physics under it.

Two more are registered but have no body style yet -- `craneTruck.js` and
`semiTruck.js` -- each a one-liner calling
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

The four work trucks are not car-likes: `makeTruck()` builds what they share -- a
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

The frame rails go in `v.under`, painted with the wheels *before* the body, for
the reason the wheels are: a rail is tucked inside the body's footprint, so only
what hangs below the sill -- or shows through a gap in the apparatus, as the
mixer's deck does -- is meant to be seen. Sorted against the body instead, a rail
near the tail outranks a long body flank (whose footprint centroid sits
mid-truck) and paints a bar across it.

The box truck is that chassis under one plain body, so what it is really about is
what a plain body carries. Its signature is the fairing sweeping the roof forward
over the cab, and that has a rule attached: `spec.roofCovered` tells `makeTruck()`
to leave the cab's roof face out, because two horizontal faces sharing a footprint
tie in ground depth to within a rounding error at every heading and flicker
against each other as the camera turns. Dropping the covered one is only safe
because the fairing is a convex wedge sitting flat on the roof and overhanging it
at both ends, so its silhouette contains the roof's from every direction and there
is nothing left to see through. Its cab takes the ordinary fleet palette (a box
truck's cab is as likely to be any colour a sedan is); the body is white far more
often than anything else, and occasionally is simply painted to match the cab.

Half of them carry a company name down both flanks. Lettering is a poly like any
other -- it culls, sorts and takes the light with the panel it lies on -- but
carries `text`, and `projectAndDraw` hands it to `drawPanelText` instead of
filling it. Because the projection is affine, the quad's four screen corners *are*
the transform from the panel's own space to the canvas, exactly, at any camera
angle: no perspective to approximate and nothing to re-derive per letter. Build
one with `makeFlankText()`, whose pts are wound in *reading* order (top-left,
top-right, bottom-right, bottom-left as the reader sees them) -- which happens to
be the same front-facing winding, so the far side's name culls with its own flank.
A viewer sees the nose on their left from one flank and on their right from the
other, so the two sides read in opposite directions along x, and the same name
starts at opposite ends of the truck, exactly as painted lettering does on a real
one. Lettering has a zoom cutoff of its own, in `drawPanelText`: it is the
*letters* that are measured against `TEXT_MIN_PX`, not the panel, so a long name
shrunk to fit a narrow box drops out sooner than a short one on the same box --
which is exactly when each stops being readable rather than a smudge. The same
check on the panel's width square to its own baseline is what disposes of a face
turned exactly edge-on: it still projects to a line of some length, so neither
edge goes to zero, but the area between them does, and lettering it would be a
transform with no inverse drawn for no pixels.
Names are kept to about twenty characters: one line is as wide as the box, so
a name twice as long is drawn half as tall and stops looking like signwriting.

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
spanning most of a truck sorts as mid-truck and paints over what hangs past it,
which is why `makeTruck()` builds its frame rails in segments -- and when the
two things simply share a footprint, no push helps and the covered face has to
go (`spec.roofCovered`, above).

A detail lying on a *horizontal* face has nowhere to push: the direction it wants
is straight up, and height is exactly what the depth sort ignores. A pickup's bed
floor and the deck it lies on are concentric, so their depths came out equal to the
last bit and the rounding error that broke the tie changed with the camera -- the
bed blinked in and out as the truck drove past, and it had been doing it since the
bed was built. Lifting it clear does nothing for that; what settles it is
`depthBias`, feet added to a poly's own sort depth (a quarter of a foot: past any
rounding, nowhere near the couple of feet that separate the bed from the cab in
front of it, which still has to hide it in a head-on view). The Wrangler's interior
floor is the same construct and carries the same bias. `_emit()` copies it into the
scratch poly with everything else, and it must -- those objects are reused, so a
field left unwritten is last frame's value on some unrelated poly.

And
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

`VEHICLE_FORCE_FULL_DETAIL` bypasses every threshold above at once, for exactly
one caller: `renderVehicleThumb` (game.js), fitting a vehicle into a ~50px
dropdown thumbnail lands on whatever `PX_PER_FT` its own bounding box needs, which
for anything bus- or truck-sized is routinely under `VEHICLE_SOLID_MIN_ZOOM`
itself -- a fire truck or school bus previewed at its natural fitted zoom was a
flat rectangle, no wheels, no light bar, nothing recognizable. Set for the one
`drawVehicle()` call the thumbnail needs and unset immediately after, the same
save/restore-around-one-call shape as the canvas/ctx swap next to it.

## Performance

`vehicles/performance.js` gives every car acceleration and braking that vary by
what is being driven: the player reads these limits through on/off pedals, and
traffic's drivers through analog feet (`vehiclePerf` is memoized per
type:subtype, because the calibration below is a search -- fine run once for the
player, ruinous re-run for every car a block spawns). Every type shares one
acceleration curve shape -- flat near a stop
(`PERF_REFERENCE_ACCEL` below `PERF_LOW_SPEED`, roughly traction-limited) then
falling as `1/speed` above it, the constant-power region a real engine is in once
it's past peak torque, which is what makes 0-20mph always come quicker than an
equal stretch at highway speed. A type doesn't get its own curve, only a scalar
that stretches this one until its simulated 0-60 time matches a road-test figure
for its class (`VEHICLE_PERF`, `13/9/8/6.5/5/4/3` seconds for trucks-and-buses,
vans-and-pickups, sedans-and-SUVs, the police interceptor, the C3 Corvette, the
Countach, and the Enzo/C7 respectively) -- so tuning a type is picking one number,
not shaping a curve by hand. `PERF_MAX_ACCEL` caps the curve at a peak no vehicle
may cross however short its target time is; without it, scaling the curve for a
3-second hypercar would imply a standing-start g-force no tire could put down.
Because the cap makes the curve's own 0-60 time have no closed form, each type's
scalar is found once at load by bisection (`accelScaleFor`) rather than by
division, searching for the `k` whose simulated time matches the target --
still exactly one scalar per type, just found by search instead of arithmetic.

Braking isn't power-limited the way accelerating is -- a brake can put its full
force down at any speed short of lockup -- so it's one flat deceleration
(`brakeG`, a fraction of g) rather than a curve, and every type's braking figure
sits above its own peak acceleration, sports cars by the widest margin: a
Corvette or Enzo can pull over 1g under braking, well past the ~1.09g
(`PERF_MAX_ACCEL`) ceiling their acceleration is capped at, where a loaded cement
truck's brakes clear its own weak 0.45g launch by a much smaller margin.
The C3 and C7 Corvette are one registered type with two performance tiers, keyed
as `corvette:c3`/`corvette:c7` in `VEHICLE_PERF_SUBTYPE` off `v.subtype` the same
way `corvette.js` itself picks a body.
