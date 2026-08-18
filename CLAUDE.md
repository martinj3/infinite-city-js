# infinite-city-js

For this project, please add any prompts I send you to prompts.txt.

If I'm talking to you from the Claude mobile app (not desktop), always push each
change directly to origin main, rather than opening a PR -- that's how I load the
GitHub Pages site on my phone to test it.

## Documentation

This codebase documentation has been split into separate files under `docs/`, organized by subsystem. **Read only what's relevant to your task** — no need to load the entire reference on every change:

- **`docs/controls.md`** — UI controls, camera toolbar, HUD layout, mobile vs desktop defaults, intro animation
- **`docs/streets.md`** — street generation, procedural city growth, street naming
- **`docs/buildings.md`** — building types (houses, offices, churches, skyscrapers), lot rendering, opacity/culling
- **`docs/vehicles.md`** — vehicle types and variants, detail thresholds, model construction, performance curves
- **`docs/traffic.md`** — AI drivers, routing, intersection logic, collision avoidance
- **`docs/signs.md`** — stop signs, rendering, white borders, zoom cutoffs
- **`docs/testing.md`** — headless rendering harness, test pages for buildings and vehicles
