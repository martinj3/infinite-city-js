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
`?touch=1` forces them on to try them on a desktop, `?touch=0` off. The steering
slider has a small dead zone at its centre (`STEER_DEAD_ZONE`), rescaled so full
lock is still reachable at the ends of the track -- without it a thumb held near
"straight ahead" reads as a faint drift, because a fingertip is wide next to the
track.

With no real DOM every entry point turns into a no-op, which is what keeps
`tools/render.js` working.

## Buildings

`buildings/` works the way `vehicles/` does: `buildingUtils.js` holds what every
type shares -- the registry (`registerBuilding` / `generateBuilding`), the roofs,
`generatePrismWindows()`, the weighted palette pick, and the lot-fitting helpers --
and one file per type holds the rest: `houses.js`, `offices.js`, `churches.js`,
`skyscrapers.js`. A type registers itself
under the name of the `LOT_TYPE` it builds for (see `lots.js`), so a new kind of
building is a new file plus a script tag, and `lots.js` never learns its name.
Everything is generated in lot-local feet: x along the street, y away from it, so
y = 0 is the street edge and a prism's "north" face is its front.

Low-rise offices are the commercial half of a street: a main prism on the
building line, up to two wings, one to six storeys. What separates one from a
house is only three things, but they are the three you notice -- a flat roof, wide
banded glazing instead of punched openings (`OFFICE_WINDOWS` overriding
`generatePrismWindows`' house defaults), and a sign. Storey count is capped by the
floor plate, about one storey per 1200 sq ft, so a six-storey block needs most of
a full lot and a small footprint stays a shopfront; a wing is never taller than
what it hangs off. Wings may stand ahead of the building line as well as beside
and behind, which is what gives the sign a way to be blocked, and a pavilion that
stands there takes the entrance with it -- the door has to go in *that* prism's
own details, because a nearer sibling drawable is drawn after the main block and
would paint over a door left behind on it.

`makeFlatRoof()` is the flat-roof type, and it is a parapet, not a lid: the walls
are built the full height (floors plus parapet) and it adds the deck inside them
along with the parapet's *inward* faces. Those inner faces are the whole trick.
The two walls facing away from the camera have their outer faces culled, so
without an inner face there the deck's far edge would have nothing above it and
you would see straight through the building. The ordering needs no help: the deck
sorts at the prism's centroid and every visible wall sorts nearer than that, so
the near parapet paints over the deck's near edge exactly as it should, while a
far inner face lands wholly above the deck edge it shares and can never be
covered by it. The parapet has no thickness, which at this size is nothing
(a real one is a pixel or two), and that is what keeps it to four extra polys.

Rooftop plant hangs off the prism's *details* child rather than sitting in with
the walls, for the reason a truck's frame rails go in `v.under`: the deck is one
polygon sorting at the middle of the roof, so a unit at the far end sorts before
it and gets painted over. A child drawable is always drawn after its parent's own
polys, which is the fix.

### Skyscrapers

`skyscrapers.js` is the downtown tower: 15 to 30 storeys on a square lot, which at
9-13ft a floor (double that for a lobby, two times in five) is 150 to 400ft of
building before whatever it wears on top. The lot type declares a square, but its
depth is trimmed to the right of way and its width comes from the block's plan, so
the generator takes the *smaller* of the two as its square and stands on the lot
line -- a downtown tower has no front garden, and the setback is only whatever
slack is left over.

A tower is three decisions taken in that order, and the order is what stops them
producing a chimera. An **era** fixes the palette, how the glass is arranged, and
which silhouettes and crowns are possible at all -- limestone comes with vertical
piers, setbacks and a stepped crown; blue-green curtain wall comes with a taper and
a spire; neither can end up wearing the other's hat. A **style** turns the square
and the floor count into a stack of stages. A **crown** finishes the top. Adding a
skyline that reads as a *city* rather than as a bag of shapes is mostly this: the
correlations are in the era table, not in each style.

Under the styles everything is shared, and that is the point of the file. A stage
is a list of footprint rings lofted together (`makeLoft`, drawUtils.js), roofed
with `makeRingRoof`, then glazed and ribbed by walking those same rings. So a plain
box, a twisting octagon, a stack of flaring modules and a bundle of square tubes
are all built and glazed by the same four functions; a style only ever decides what
the footprint is at a given height. Rings are always wound the way `makeWalls`
wants -- outside on the right walking one point to the next -- so `edgeOut()` gives
every wall its outward normal and everything hangs off that.

Plans that no rectangle can express come from `traceCellOutline()`: mark cells on a
grid and it walks the boundary edges (each emitted in that same winding, so
chaining them start-to-end is one pass) and merges the collinear runs. That is what
the Willis Tower's staircase of surviving tubes is, and the cross plan, without
hand-writing a corner. It also means those plans have re-entrant corners, and a
re-entrant corner is genuinely see-through from a raised view -- a notch open on
the diagonal has no far wall, so you look through it to the deck below and the sky.
That is correct and it is not a sorting bug; the walls facing into such a notch are
backfaces from the only direction that could see them.

Glazing is one polygon per wall per floor or per bay, which is the whole reason
thirty storeys is affordable, and the three arrangements are the three eras. A
**ribbon** per floor on a solid wall is the post-war curtain wall; the same thing
inverted -- a solid **spandrel** band per floor on a wall that is otherwise glass --
is the contemporary all-glass tower; vertical **strips** between piers is every
tower built before either existed. On a leaning or twisting wall the bands are laid
on `ringAt(z)`, the footprint where the wall actually is at that height, and the
strips are placed by *fraction* along each edge, so both lean with it.

The vertical ridges are `makeRibs()`, and they buy the grid: a rib crossing a
floor-wide ribbon window cuts it into panes without a single pane being drawn. Each
is three faces, not four -- the fourth lies flat against the wall pointing into it,
so it is a backface at every camera angle and there is no angle from which it could
be seen. Only the parapet the tower actually ends on gets the teeth above it; a
spike at every setback turns the silhouette to gravel. They are capped at six a
wall and kept off stages under three floors, because ribs are what a Deco tower
costs: unthinned they were more polygons than the rest of the building put
together.

Everything else is the small stuff that makes it read. A mast is two lofted stages,
a short flare off the base and a long thin run to the point, because a single cone
reads as a traffic bollard. The Chrysler crown is tiers whose radius falls away on
a circle while their height climbs it, with the triangular window in each face --
that one detail is what makes it recognisable three blocks off. Pinnacles stand
from the *deck*, not the parapet top, so the parapet hides their feet and they grow
out of the building instead of balancing on it. And every tower gets a plinth (a
darker course standing proud at the foot, grown from the stage's own ring about its
centroid so it fits any plan) and a lobby band in darker glass -- without them a
tower looks pushed into the ground and its ground floor looks like more of the same.

### Seeing past the tall ones

A building on the near side of a street stands between the camera and the road,
and once it is more than a couple of storeys it hides the street you are driving
on. `drawLots` paints such a building at `BUILDING_FADE_ALPHA` instead. Nothing in
this is per-type: `buildLot` measures every building the same way, with
`drawableTop()`, so a new building type is covered the day it is written.

`lotHidesStreet()` is the rule, and it is three tests, each ruling out a different
way of being harmless. It is tall enough to reach over a road at all
(`BUILDING_FADE_MIN_HEIGHT`, measured once at generation and kept as `lot.tall`).
It is on the near side -- the down-screen component of "away from the street" is
positive, so the building is painted over its own roadway rather than away from
it. And its street runs far enough from vertical on screen (`BUILDING_FADE_MIN_SKEW`):
a road heading straight up the screen has its buildings stacked to the left and
right of it, never across it, however tall they are. Because the vertical squash
pulls every heading toward the horizontal, that last one is a much tighter
tolerance in the world than it looks -- about ten degrees either side of the one
heading that projects straight up.

All of it is screen geometry, so it turns on the view rotation and not on where
the player is, which is what lets `streetTest.html` show the identical effect (T
toggles it, `?fade=0` starts it off). The two directions it needs are baked into
the lot at placement: `lot.nx, lot.ny` is "away from the street", read straight off
the `rotAngle` the lot was rotated by, and the street's own direction is at right
angles to that. Curves need no special case.

Swept a full turn over every tall lot in a 500-street city, each one fades across
exactly one contiguous arc -- there is no heading at which it chatters -- and
never on the far side, and never while its street runs up the screen.

Two things the see-through pass gets right by accident and shouldn't be
"fixed": the building's far walls show through its near ones, which is what makes
it read as a ghost rather than as flat paint, and `ctx.save()` inside
`drawPanelText` preserves `globalAlpha`, so a faded office's sign fades with it.

### Height and the cull

Height reaches further across the screen than any footprint does, and only one
way, so `drawLots` has two rules that exist purely because a tower is not a house.

A building's top is drawn `PX_PER_FT * top` pixels above its base -- which is
exactly where the *ground* point `top / Y_SCALE` feet up-screen of it lands. So a
street is extended toward the camera by that much and not away from it, which is
half the reach a pad in every direction would have cost, and only blocks with
something tall on them pay for it at all (`s.tallest`, the tallest `lot.top` on the
block, measured once when its lots are generated). Without it a 400ft tower pops in
as its base crosses the bottom edge, several hundred feet after it should have
appeared.

And below `HOUSES_MIN_ZOOM`, where a house is two pixels and is dropped, a tower is
still a hundred pixels of skyline. The bar is `SKYLINE_MIN_PX` of *building*, so
each type drops out on its own as you zoom out -- houses first, then offices, then
churches, and the tallest towers last at `SKYLINE_MIN_ZOOM`. Measured on a
400-street city this costs about 11k polygons a frame at the far end, which is less
than the same city already draws at `zoom 0.8`, so it is not a new peak.

A sign is a board across the second storey of the front wall, on half the
buildings that can have one (two storeys, nothing standing in front), and it is
the same lettering machinery a box truck's flank uses -- `makeFrontPanel()` for
the board and again for the name on it, the name standing a whisker prouder so it
sorts after. The second-storey glass behind it is dropped, which is what
`generatePrismWindows`' per-exclusion `floor` is for; everything else that
excludes a window is a door, and doors are on the ground floor.

## Vehicles

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
classics rarer still.

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
go (`spec.roofCovered`, above). And
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

### Performance

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

## Traffic

`traffic.js` is the other cars, each with a driver at the wheel. The car's world
pose -- `cx, cy, angle, speed`, plain Numbers, so sub-foot precision comes free
-- is the truth now, integrated exactly the way the player's is: heading and
speed move the car and nothing snaps it to the road. The street the car is on is
only its driver's *intention*: the lane centreline they are trying to hold and
the route they mean to take. `pos` is kept as the true arc-length projection of
the car onto that centreline by a cheap per-frame Newton step (advance by the
along-track component of the offset from the current reference, re-read the
reference there), measured from whichever end the car entered at so it runs 0 to
length and nothing branches on direction; `dir` is +1 travelling from `(x1,y1)`
toward `(x2,y2)`.

The driver is deliberately nothing cleverer than a few old-fashioned control
loops, each with its constants rolled per driver (`makeDriver`) so the fleet has
personalities:

- **Steering** is one PID on cross-track error `e`, the signed feet between the
  car and its lane centreline. The derivative is taken analytically -- de/dt is
  exactly `speed * sin(heading error)` -- which doubles as heading damping and is
  what keeps the loop stable when e is small but the car points the wrong way.
  Path curvature is fed forward (`speed * curv` is exactly the turn rate that
  holds the arc), so the PID only ever corrects mistakes, and the integral term
  trims the residual pull of a long curve. Steering authority is the player's
  own: `MAX_TURN_RATE`, scaled away below 20 ft/s, and the command lands in
  `c.steer` so the front wheels visibly turn. Skill maps onto the loop's damping
  ratio (`zeta = 0.3 + skill`): the visibly drunk driver is an underdamped one,
  plus a slow Ornstein-Uhlenbeck wander in where they believe lane-centre is.
  Skill is skewed good, and anything longer than `HEAVY_LENGTH` gets a floor --
  whoever is driving the bus, it is not the drunk. A driver far out of their lane
  also slows down (the steering-to-speed crosstalk), which is both "having
  trouble on this curve" and what stops a drunk swerving at 50.
- **Speed** chases the minimum of everything the driver can see coming: their
  own cruise preference (triangular around 35mph, rare tails at 20 and 60,
  heavies capped at 45), comfortable lateral g on the arc they are riding, and
  planned slow-downs ahead. Approaches to a corner or a stop line brake on the
  *required* deceleration, `(vGoal^2 - v^2)/2d`, once it reaches comfort level
  -- chasing the sqrt speed profile through the proportional loop instead always
  lags it, and a corner entered 15 over is exited through the far hedge; braking
  on the requirement engages at exactly the right distance, holds ~`aComf` all
  the way down, and nobody halts 80ft short of anything. The command is finally
  clamped to the vehicle's own performance envelope (`curveAccel` and
  `brakeDecel`, vehicles/performance.js): analog feet, real engine and brakes,
  so traffic's Countach genuinely out-accelerates traffic's cement truck.
- **Following** is a PD loop on the gap to the car ahead (P on distance against
  `minGap + headway * speed`, D on closing speed), fed measurements a beat late:
  each driver has a reaction time and reads the gap as it was that long ago
  (a per-car ring of timestamped samples). The delay is where stop-and-go waves
  come from -- a queue moves off one driver at a time, not all at once. The
  player's car is sensed geometrically (it is on no street) and joins this loop
  as just another leader: traffic follows you, brakes behind you, queues behind
  you when you park in a lane.

Routes are decided early: `planExit` runs once on entering a street and picks
the exit (`pickExit`, still "any street but the one I came in on", U-turns only
at dead ends) *and* the exact corner to drive -- a fillet arc tangent to both
lane centrelines (`makeTurnPlan`). The arc is the whole trick of intersections:
asking the steering loop to jump straight from one street's lane to the next's
turns every right turn into a wide J-swing, because at the handoff the new
lane's nearest point is already past the node and the raw error points the
wrong way. On the arc the reference is the radial projection onto the circle,
tracked by the same PID with the same feedforward, so e stays small all the way
round; sharp corners get tight slow arcs (never under full-lock radius,
`R_MIN`), gentle ones fast sweeping arcs, lefts come out wider than rights and
cross the middle of the box with nothing choosing that, and a dead-end U-turn
is half a circle to the left that swings a whisker wide and gets reeled back
in. Deciding at entry is also what lets the speed loop ease off half a block
before the corner. Rolling past the arc's far end lands the car on its new
street (`switchStreet`), pos seeded by projection.

There is one stop line and one way of holding at it, and only the reason for
being there differs -- which is what keeps right of way from becoming a second
control loop. A signed approach (see Signs) always takes the
required-deceleration treatment down to a line just short of the box, dwells a
beat once stopped (`pause`), and then goes when the intersection is actually
theirs. An unsigned one -- the through street of a two-way, or an uncontrolled
crossing -- runs the same machinery but only holds if somebody is coming, which
is what makes yielding cost nothing on an empty road. Queues at a sign discharge
one reaction time apart, which is the waves mechanism again.

The line is where a car's *nose* stops, so how far back its centre keeps is its
own length (`stopDist`): a bus stopping where a hatchback does has its front axle
in the middle of the junction, and reads to everybody else as a vehicle standing
in the box. Past the line the driver is committed, and has to be -- a car
released into a box and re-blocked a moment later stops dead in the middle of it,
where no rule about who goes first can help, because the thing in the way is a
car that was in the right. The same reasoning is why the required deceleration is
capped rather than computed once the line is under the wheels: `-v^2/2d` has no
finite answer at d = 0, and the proportional loop alone only decays that last
foot of speed asymptotically, so the car creeps into the junction for ever.

### Whose turn it is

`boxClear(c)` is the whole of it, and it only ever *reads*. No reservations, no
queues, no state on the node -- nothing that has to be cleaned up when the radius
cull deletes a car mid-junction. It walks the cars at this node, drops everyone
whose path cannot cross this one, and of those left waits on whoever outranks it.

Whether two movements conflict is pure geometry, worth doing exactly rather than
with a table of cases. Number the arms 0-3 the way the slots already run (fwd,
right, back, left, each a quarter turn), and give each arm two points on a ring:
its entry lane at 2k, its exit lane at 2k+1 -- right-hand traffic is what orders
them, since a car coming in hugs the arm's clockwise side and one going out the
other. A movement from arm a to arm b is then exactly the chord (2a, 2b+1), and
two movements cross iff their chords cross, which is iff exactly one endpoint of
one lies on the arc between the other's. Eight lines, and every case falls out
without anyone writing it down: opposing straights clear each other, opposing
lefts pass left-to-left, a right turn ignores cross traffic from its right, a
left yields to the oncoming straight. Two movements ending on the same arm are a
merge into one lane -- a conflict too, and the one case the chords cannot see.

Precedence (`yieldsTo`) is antisymmetric by construction, so of any two cars
exactly one gives way: the road without the signs rules and never tests itself
against the road that has them; at a four-way the first to have *stopped* goes
first (`stoppedAt`); a left turn gives way to whatever is coming the other way
whoever got there first, because it is crossing their path rather than sharing
it; and in a dead heat, the car on the right. Two things sit above all of it,
being about space rather than precedence: never enter a box somebody is standing
in (whoever is in the wrong), and never enter one there is no room to leave --
without that second rule a queue simply extends through the junction and locks it
solid, every car in it genuinely in the right.

Two traps that cost a while to find, both worth not re-introducing. The arrival
comparison must measure both cars with the *same* formula: judge yourself by the
launch model (`myBoxWindow`, a real `v^2 = u^2 + 2ad` on your own engine, which
is why a loaded cement truck waits for a gap a Countach would not) and the other
fellow by a constant speed, and the two of you can each conclude the other got
there first -- which is not a slow junction but a frozen one. And a vehicle
longer than the box is not a point on a lane path while it is in there; it is a
wall across the junction, its tail sweeping ground no lane-to-lane chord accounts
for, so while one is in the box it conflicts with everybody.

Whatever the rules, patience ends it: held at a line too long (7-15s, per driver)
and the car creeps out anyway. That is realistic, and it bounds every bug in the
priority logic to a moment's oddity rather than a frozen junction. It is
load-bearing for exactly one case the rules cannot break on their own -- four
cars tied at a four-way, each giving way to the next one round. Three cannot form
that ring, because one of them has no car on their right.

The player is given no priority test at all, only geometry: anything closing on
the box, or sitting in it, is a reason to wait, whatever the signs say. Never
assume the player follows a rule. The two exceptions are both about not waiting
for someone who is not coming -- a player stopped short of the box, and one
following along behind on the same approach, which is the following loop's
business rather than this one's.

Cars still pass through each other when two do go at once; that is the accepted
failure mode, now rare rather than constant. Measured over 90s of a 400-street
city, overlapping cars in a junction fell by about 70% against the same city
before any of this (31/42/52 events on three seeds against 112/176/175), stop
compliance held at 99%, and cost went from about 2.0 to 2.2ms an update at ~180
cars. Routes are re-picked once on the way in (`REPLAN_DIST`), which is not
cosmetic: a block's traffic is created inside `pushStreet`, a line before the new
street is registered at its own far node, and that node grows its other arms
later still, so a route chosen at spawn can only be a U-turn -- a half circle
across the whole box, arriving at what is by then a four-way. That one fix was
worth more than half the overlap reduction.

The one conflict drivers react to outside a junction is the head-on: an oncoming
car on the same street more than a foot over the centreline (`centerOff`, kept
on every car for exactly this check), or the player pointed at them in their
lane. The response is a bias on where lane-centre *is* (`EVADE_BIAS`, so the
same steering loop handles dodge and recovery), emergency braking scaled by
time-to-collision, and a honk.

What comes next -- multi-lane roads, lane changing and merging, turn signals --
is planned in `trafficPlan.txt`, whose intersection half is what the above
implements.

Honks are the decorative hook, deliberately unpolished: any evasion, and any
braking near the vehicle's maximum, pushes `{x, y, t}` into `honks` (per-car
cooldown), and `drawHonks` -- called by `drawScene` after everything else --
draws rising, fading, slightly cockeyed red "HONK!" text in Comic Sans over the
spot. Expired honks are culled in `updateTraffic`, not the draw pass, so a page
that never draws doesn't accumulate them.

Cars are born mid-block already rolling, and never faster than the corner or
stop line already ahead of them can be comfortably braked for -- a car dropped
at cruise speed 20ft before a 90-degree turn cannot make it, and blows through
the intersection sideways trying. A car that ends up hopelessly far off the
road (80ft of cross-track, a lost drunk) or runs off the edge of the built map
is quietly forgotten.

Measured over 60 simulated seconds of a 400-street city: good drivers hold
lane to a mean 0.2ft on straights and curves and 0.4ft through corner arcs; the
worst hold about 1ft with excursions to 10; 0.07% of car-frames are off the
pavement entirely (the drunks, briefly); every stop-sign stop lands within
2.4ft of the line; no NaN ever reaches a pose. The whole update is ~1.3ms at
135 live cars, dominated by the O(n^2) sensing pass, which is fine at the
counts `TRAFFIC_RADIUS` allows.

Cars are seeded onto a block as it is built, from `pushStreet`, the same moment
and the same way its lots are -- but unlike the lots they do not stay: a block's
own cars have driven off it within the minute. The mix of body styles is
`generateRandomVehicle()`, so the odds of meeting a Countach out there are the
odds of having been given one to drive. Each direction is packed separately, since
two cars going opposite ways are in different lanes and cannot be in each other's
way; within a lane, sorting the random offsets and then pushing each car past the
ones before it by their own lengths plus a gap spaces them exactly, and the
tightest arrangement the shuffle can reach is still one clear gap.

Everything within `TRAFFIC_RADIUS` (1500ft) of the player is simulated whether it
is on screen or not, and everything past it is deleted outright -- which is what
lets you turn around and chase a car you saw, because it is still where it should
be rather than where it was. Spawning is gated on the same radius, since a car
built further away would be deleted on the very next update; driving never
rejects anything (a street is born a few feet from the car that triggered it),
but `growCity()` builds a whole city at once from wherever in it it likes.

Note what this does *not* have: nothing ever repopulates a block. Spawning is tied
to a street being created, deletion to a distance, so an area you sit in drains --
parked, a typical 38 cars falls to 14 in two minutes and 5 in five. Driving hides
it, because you are always meeting new streets.

Traffic joins the buildings' depth pass (`drawLots`) rather than getting one of
its own, so a car on the far side of a block goes behind that block's houses
instead of being painted over them; its position fields are named `cx, cy` for
exactly that reason, so both kinds of thing sort through the same line. The
player's car sorts through that same line too -- `drawScene` takes an optional
`player`, and `drawLots` pushes it into the same `visible` array as the traffic
and the lots, as a plain `{ vehicle, cx, cy, angle, steer }` -- so a house you
drive past, or another car crossing in front of you, hides it exactly as it would
hide anything else standing there. Traffic sets `steer` too now -- its PID's own
wheel angle -- so every car's front wheels turn (`drawGroundVehicle` still falls
back to 0 for anything that doesn't set it). Cars drop out at `HOUSES_MIN_ZOOM`, with the
houses: below that only the skyline is left, and there are no cars in a skyline.

Adding traffic changed what a given `?seed` builds. Spawning draws from
`Math.random()`, so the stream every later street reads has moved; the city is
still deterministic, just not the same city an old screenshot shows. Suppress
`spawnStreetTraffic` and the pixels match the pre-traffic build exactly.

## Signs

`signs.js` is the first of what will be more than one kind of sign; for now it is
only stop signs. Traffic obeys them: a driver approaching a node reads its
signage for their own arrival slot (`stopSignAhead`, traffic.js) and genuinely
stops at it. The player remains free to run every one.

A node -- not a street -- owns its own signage, the same way it will one day own
a traffic light: `updateNodeSigns(node)` decides, once, how the intersection
controls itself, and rebuilds `node.signs` from whichever of its streets are
actually connected right now. It runs every time a street attaches there,
including a second, third or fourth one long after the node first looked
resolved (`resolveNode` re-opens previously-false directions once a later street
picks a node as its target), so there is no fixed moment at which "this
intersection's final shape" is knowable -- the simplest correct thing is to
throw the old signs away and rebuild from the current connections every time,
rather than try to patch one in.

A node with nothing yet on its cross axis (`left` and `right` both absent) isn't
a real intersection -- it's a plain block boundary on a through street -- so it
gets no signs and no decision is made yet. The first time a cross street
actually attaches, `pickIntersectionControl()` rolls the node's control once and
it stays that way for good, whatever it gains later. `fwd`/`back` stands for the
through street and `left`/`right` for whatever crosses it, which is usually true
since `fwd` continues roughly the heading `back` arrived on. A **two-way** stop
(`SIGN_TWO_WAY_PROB`, 60%) signs only the `left`/`right` slots that are actually
connected, so the through street never stops; a **four-way** (28%) signs every
connected slot; **none** (`SIGN_NONE_PROB`, 12%) signs nothing at all -- a real,
if slightly risky, uncontrolled crossing. `streetEndHeading(s, dir)` gives the
tangent heading a car arriving there is travelling on, and `arrivalDirAt` works
out which direction that is for a given street and node, so a curved street's
sign still stands square to the road it actually meets rather than to the chord
between its ends; `placeStopSign` then sets it back from the node along
`-heading` by `SIGN_SETBACK` (just short of the intersection box) and out to the
right of travel by half the road width plus `SIGN_SIDE_OFFSET` -- the same
right-of-travel side `traffic.js`'s own lane offset uses -- so it reads face-on
to that one approach and to no other.

The sign is built once, in local feet, with +x the direction of the traffic it
faces -- the same convention a vehicle is modelled in -- so the whole assembly is
just `rotatePolys` then `translatePolys` into place, the same two calls that bake
a building into the world. `makePole` (drawUtils.js) is the reusable post
underneath it: a real four-walled box, not a single poly or a bare pair of
crossed panels. One poly vanishes from behind; two single-sided panels 90 degrees
apart still leave a gap between them, since each covers only 180 degrees of
azimuth and two 180s set 90 apart span just 270 -- so it takes a genuine box, four
walls in two perpendicular pairs, to always have one actually facing the camera,
at the same four-poly cost either way. Reusable for anything else that is just a
post at some height and thickness.

The face is an octagon (`makeDiscX`, moved into drawUtils.js from vehicleUtils.js
in the same change, since it was already generic geometry with nothing vehicle-
specific about it): red toward the approach it serves, "STOP" lettered on a
whisker-proud panel over it exactly the way a shop sign's lettering sits over its
own board (`makeFrontPanel`, buildingUtils.js), plus a second, plain grey disc
facing the other way -- a one-sided face is a vanishing act from the wrong side,
the same lesson a windscreen with nothing behind it already taught.

Signs get their own small cull in `drawLots`, over the nodes directly rather than
riding the street loop the lots use -- the same way `drawScene` culls nodes
separately from streets for the intersection squares, since a sign belongs to
the intersection and not to any one of the streets meeting it.

The sign and its lettering drop out on two different mechanisms, which is what
gives the two-stage falloff the request asked for. The sign as a whole disappears
below `SIGN_MIN_ZOOM` (a 2.75ft sign is 3px there), checked once per `drawLots`
call rather than per sign. The lettering needs no cutoff of its own: it is the
same `TEXT_MIN_PX` machinery every other panel in the game already uses, and a
stop sign's word is so much smaller than a shop sign's that it drops out on its
own, well before the octagon does -- at the default driving zoom most signs on
screen show as a red shape with no legible word, and only the ones closest to
face-on read at all, exactly the "they don't look that big from inside the car"
the request asked for. Slowing down or zooming in resolves it. Adds 73-193
polygons a frame at typical zooms, out of several thousand.

## Testing

`streetTest.html` is the fastest way to check street generation: it grows a whole
city up front (no car, camera flies around) via the same `initMap()`/`generate()`
path the driving game uses. `?seed=123` makes it deterministic, and `S` saves a PNG.
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