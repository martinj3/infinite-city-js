# Streets

`streets.js` grows the city outward from `initMap()`'s two seed nodes, and
`generate(px, py)` (game.js) is what decides which intersections exist yet.
It's a plain sweep: every node in the map is tested against a `GENERATE_RADIUS`
(500ft) square centered on the player -- `Math.abs(node.x - px) > GENERATE_RADIUS`,
same for y, no `hypot` and no squared distance either, just two `abs` and two
comparisons -- and whatever falls inside and still has an unrolled slot gets
`resolveNode`'d, which rolls each of `fwd`/`left`/`right` into a real street or
a dead end (`back` is always pre-set by whichever street created the node).
A square rather than a circle is deliberately the cheaper, slightly-too-generous
shape: the difference only shows up in the corners, where it resolves a few
intersections a bit before a true 500ft radius would have, which is invisible
in play. Because this scan is a flat cost regardless of how close the player is
to anything, it doesn't run every frame -- only every `GENERATE_INTERVAL_FRAMES`
(50) frames, about once a second or two, called from `update()` in game.js. The
radius is generous next to how far a car can travel in that span, so nothing
outruns it at any real driving speed, and there's no need to special-case "the
block right ahead" the way a tighter, more-frequent trigger once did: a 500ft
sweep already reaches a couple of blocks past the player in every direction,
so whatever the next corner offers -- straight, turn, or dead end, and any
traffic already on it -- is generated well before the player arrives, without
requiring them to actually reach an intersection to trigger it (which used to
misfire if they drifted even slightly off the paved street).

`growCity(maxStreets)` is the same per-node resolution in a loop, repeatedly
picking the unresolved node nearest the origin, for building a whole city up
front rather than one drive at a time (`streetTest.html`, `tools/render.js`).
`growCityRandom(count)` is the same loop with one thing changed: it picks the
unresolved node at *random* on every visit rather than always the nearest one,
which is what `game.js` calls (ten visits) right after `initMap()` so
driving.html's first frame is a handful of scattered blocks around the seed
street rather than a single lonely segment -- nearest-first would instead grow
one dense patch outward in whatever direction happened to resolve first.

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
