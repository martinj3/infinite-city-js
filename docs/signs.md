# Signs

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
the same lesson a windscreen with nothing behind it already taught. A real
octagon stands on a flat edge top and bottom, not a vertex, which is half a
segment's rotation off `makeDiscX`'s own default phase (a vertex at the top --
fine for the badges and taillights that are its other callers, where round
reads as round either way): `SIGN_FACE_PHASE` (`Math.PI / sides`) is passed to
both discs to square them up.

The front face also carries a thin white border, real stop signs have one --
`front.stroke`, a color `projectAndDraw` (render3d.js) checks after its
ordinary fill and, if set, traces with a genuine `ctx.stroke()` at
`lineWidth = 1`: always exactly one device pixel regardless of zoom or camera
angle, since a stroke's width isn't a world size projected down the way a
poly's own thickness would be. Reusing the disc's own fill path rather than
building a second, slightly larger red-and-white poly pair is both cheaper and
free of the z-fighting a stacked near-coplanar pair would risk. It carries an
optional `strokeMinZoom` too, so a border can drop out on its own schedule
rather than outliving whatever it was meant to frame -- the stop sign sets it
to `TEXT_MIN_PX / (2 * hh)` (`hh` the STOP panel's own half-height), which is
exactly the zoom below which that panel's screen height falls under
`drawPanelText`'s legibility floor at *every* viewing angle, not just the
face-on-only cutoff `drawPanelText` applies on its own (the panel's height in
screen pixels is angle-independent -- its top and bottom differ only in world
z, which maps straight to screen y whatever the camera rotation is -- so this
one term of that same test is a plain zoom threshold with nothing further to
compute at draw time). Below it the word could never be read regardless of
angle, so the border comes down with it instead of circling a blank sign.

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
the request asked for. Slowing down or zooming in resolves it. The white border
rides the lettering's own zoom half of that cutoff (see above), so it disappears
alongside the word rather than lingering as a blank white ring at any zoom the
octagon itself still clears. Adds 73-193 polygons a frame at typical zooms, out
of several thousand.
