For this project, infinite-city-js, please add any prompts I send you to prompts.txt

## Testing

`streetTest.html` is the fastest way to check street generation: it grows a whole
city up front (no car, camera flies around) via the same `initMap()`/`generate()`
path the driving game uses. `?seed=123` makes it deterministic, and `S` saves a PNG.

Agents without a browser can test headlessly with Node. Load `constants.js`,
`streets.js`, `drawing.js` (and optionally `game.js` or `streetTest.js`) into a `vm`
context with a stub `document`/`canvas`, then call `initMap()`, `growCity(n)` and
`drawScene(x, y)`. Two complementary techniques:

- **Look at it.** Give the sandbox a software canvas that implements enough of the
  2D context to rasterize into a PNG, then read the image. Layout and geometry bugs
  (sidewalk corner joins, for one) are far easier to see than to assert. Beware that
  a naive rasterizer drops sub-pixel-thin features, so don't trust it on hairlines.
- **Count the calls.** Give the sandbox a Proxy context that tallies `fillRect`/`fill`
  or throws on non-finite arguments. Better than pixels for "does every street draw
  exactly two sidewalk bands" and "does any NaN reach the canvas".