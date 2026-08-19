# Buildings

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

## Skyscrapers

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
The plinth is closed with a *ledge* -- the strip between the wall and its own outer
face -- and not a cap over the whole footprint, which is the same lesson as the
rooftop plant read backwards. A horizontal polygon spanning the plan projects up the
screen by half the footprint's depth, and details paint after the walls of the stage
they belong to, so a cap at ankle height went straight over the near wall: the grey
slab that used to swallow the bottom several storeys. A wall standing on the plinth
hid everything of that cap except the ledge anyway.

Stages stack, so they are *nested* -- each hangs off the details of the one below,
and a shaft is one chain rather than a row of siblings. Siblings are painted in
depth order, and two stages of a shaft share a centre, so their depths differed only
by where the polygons happened to average out and the order flipped as the camera
turned. What that showed was a setback deck painted after the tier standing on it,
lying across the bottom of it: a grey band that appeared and vanished as you
rotated. Nested, the order is the one construction guarantees -- a stage is above
every part of the stage below, so it is nearer, so it always paints after, the same
argument the crown already rested on. Separate shafts stay siblings, being genuinely
side by side and wanting the depth sort.

## Seeing past the tall ones

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

## Height and the cull

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
