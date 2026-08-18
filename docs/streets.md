# Streets

`streets.js` grows the city outward from `initMap()`'s two seed nodes,
one intersection at a time, and never anywhere else: `generate(px, py)` runs
every frame over every node (comparing squared distances, since `hypot` is
slow enough to matter once a long drive has built thousands of them) and
resolves any node within `GENERATE_DIST` (30ft) that still has an unrolled
slot -- `resolveNode` rolls each of `fwd`/`left`/`right` into a real street or
a dead end, `back` always being pre-set by whichever street created the node.
`growCity(maxStreets)` is the same call in a loop, repeatedly picking the
unresolved node nearest the origin, for building a whole city up front rather
than one drive at a time (`streetTest.html`, `tools/render.js`).
`growCityRandom(count)` is the same loop with one thing changed: it picks the
unresolved node at *random* on every visit rather than always the nearest one,
which is what `game.js` calls (ten visits) right after `initMap()` so
driving.html's first frame is a handful of scattered blocks around the seed
street rather than a single lonely segment -- nearest-first would instead grow
one dense patch outward in whatever direction happened to resolve first.

A node the player is standing at gets resolved this way regardless of which
way they came from or are headed, which is what used to make every
intersection a surprise: nothing about the block ahead existed until the
player was within 30ft of its far end. `generate` now also resolves one hop
further -- for every node it just found within range, it walks that node's
own `streets` (already set, whether they were just rolled this frame or
resolved on some earlier pass) and resolves whichever far end isn't resolved
yet (`farNode`, using the same endpoint tolerance test `arrivalDirAt` in
signs.js uses). So the moment a player reaches an intersection, every street
leaving it -- including whichever one they are about to drive down -- already
has real streets, lots and signs at its own far end, not a stub, which is
what lets a driver see a block ahead of themselves: whether the next corner
lets them go straight or turn, and whether anything is coming. It stops at
one hop on purpose -- the newly-resolved far nodes are not chased further --
so the amount of city held ready ahead of the player stays exactly one block,
however fast they're going, rather than snowballing into an ever-growing
lookahead radius that would cost more every frame the longer a drive runs.

## Street names

Every street segment gets a name, purely cosmetic, stamped on in `pushStreet`
(`s.name = randomStreetName()`) alongside everything else generated once per
segment. It's a fresh pick each time rather than a name tracked per logical
street through every node it grows from, which is deliberate, not a shortcut:
a real street changes names crossing a town line too, and a driver crossing a
dozen intersections in one straight run is more interesting with the odd name
change than without one. `streetNames.js` holds the list -- about 200 entries,
one flat array (`STREET_NAMES`) rather than picked category-by-category, since
a real town's naming doesn't cluster that way either -- spanning ordinary
American suburb names (Maple Street, Elm Court), a few genuinely famous ones
(Fifth Avenue, Bourbon Street), the entire Monopoly board, a set of UK and
Canadian names, a few from elsewhere in the English-speaking world, a run of
cutesy ones (Happy Hollow, Firefly Trail), and a batch that are just jokes
(Speed Bump Street, Backseat Driver Boulevard). `randomStreetName()` is one
line: pick an index. The file loads before `streets.js` on both pages that use
it (`driving.html`, `streetTest.html`); `pushStreet` calls it through the same
`typeof randomStreetName === 'function'` guard the lots/traffic hooks already
use, so a page that loads `streets.js` without it still works, just with every
`s.name` left `null`.

`currentStreetAt(px, py)`, alongside `distToStreetPath` since it's built on
it, answers "which street is this point on" for the driving game's street-name
sign (`drawing.js`, below) -- the one thing the player's car needs that
traffic's cars get for free by actually living on a street (`pos`/`dir`, see
Traffic in `docs/traffic.md`). It isn't: `player` carries only `x, y, angle`, sensed geometrically
the same way traffic senses it as another vehicle to react to. Called once a
frame, so every street's already-computed `bounds` bbox is checked first --
cheap arithmetic -- before `distToStreetPath` is bothered with the real
distance, and only the closest street within `CURRENT_STREET_TOLERANCE` (25ft,
generous next to the ~20-24ft `MIN_STREET_WIDTH`/`MAX_STREET_WIDTH` range, so
drifting onto the shoulder doesn't read as leaving the street) is returned --
`null` off the edge of anything, which is what makes the sign disappear
gracefully while cutting across a lot instead of naming whatever street
happens to be nearest.
