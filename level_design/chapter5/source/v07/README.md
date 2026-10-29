# Chapter 5 — Abandoned Warehouse Graybox v07

**Status:** Standalone spatial prototype and outcome-visualization study. Not production integrated.

## Files

- `warehouse_playtest_v07.html` — standalone HTML (WASD movement; E interact; C climb; L darkness; visual-state preview controls).
- `warehouse_L0_graybox_v07.svg`, `warehouse_L1_graybox_v07.svg` — editable geometry and planned markers, in the same 1672×941 world coordinates.
- `warehouse_L0_preview_v07.png`, `warehouse_L1_preview_v07.png` — visual previews of these SVGs.
- `warehouse_geometry_v07.json` — map bounds, obstacles, L1 walkable platforms, climbs, fixed event anchors, random-zone centers, lighting controls, and visual-outcome mappings.
- `warehouse_visual_outcomes_v07.svg` — non-collidable world-space decorative outcomes keyed to existing event flags.
- `build_warehouse.py`, `make_visual_outcomes.py`, `make_playtest.py` — reproducible generators.
- `validation_v07.json` — focused geometry check results.

## Changes since v06: only two random-zone placements

- **R2 (Western shelving):** moved from `(349,381)` to `(266,404)` so its random-encounter ring no longer overlays the **C1 climb** marker. C1 remains `(320,343)` and works as before.
- **R1 (Lower storage):** moved from `(445,757)` to `(657,765)`, the open cross-aisle by the cat in the user's second screenshot.
- **R3, R4:** unchanged.
- Obstacles, world extent, both floors, all permanent interaction anchors, L0/L1 climbing, lamps, boss chokepoint, random-card pool, random-zone probability/attempt cap, and event rewards: **unchanged**.

The exact trigger areas are invisible in gameplay unless the debugging toggle for zones is enabled. Random zones are one-attempt opportunities, not guaranteed story/event content.

## How environmental outcome visuals are rendered

Currently `warehouse_visual_outcomes_v07.svg` contains separate **small world-anchored decoration groups** toggled by existing backend-controlled flags. The decorations have `pointer-events="none"` and do not change collision. No full-map texture replacement is needed.

For eventual pixel-art integration:

1. Keep one approved **L0 background** PNG and one matching transparent **L1 elevated artwork** PNG, both sharing the authoritative world coordinates.
2. Create only the small **transparent stateful prop artwork** needed when silhouettes change: supply post built/unfinished, L1 lookout post/partial/wet state, and recovered/marked/cached lamp crate. Reuse base props and minimal decals for less substantial changes.
3. Render each prop at a **fixed map anchor** in world coordinates when a corresponding existing saved event flag is present. Overlay lighting gradients separately; do not bake all possible light states into new full-frame PNGs.
4. Preserve the existing source-of-truth event flags; do not add new events, duplicate outcomes, modify rewards, or change event trigger types.
5. A random `box_haul_event` can occur in any eligible zone. The prototype's `supply_post_built` decoration remains illustrated at a **fixed loading-bay staging anchor** `(445,757)` independent of the R1 encounter-zone center, as in v06. The final placement must be agreed before asset production; without storing an actual origin, the prop cannot reliably appear where the random card occurred.

### Existing outcome groups already previewable

- Supply-post flags: `supply_post_built`, `supply_post_paused`.
- Lookout flags: `watch_post_set`, `watch_post_one_route`, `watch_post_wet`, `lookout_surveyed`, `lookout_partial`, `lookout_recce`.
- Hanging-crate flags: `light_crate_found`, `light_crate_dinged`, `finale_light_stashed`, `light_crate_stashed`, `light_stash_rough`.
- Boss victory uses the existing battle-success state to display the opened corridor.

The standalone preview panel is **visual QA only** and does not resolve event cards or award rewards.

## Verification

- Both floors remain connected for a 26-world-unit-diameter cat.
- Two climb anchors are accessible with lighting gates off.
- All random-zone center checkpoints are valid with lighting gates off.
- R2's chance ring is separated from the C1 marker.
- The mandatory boss passage remains gated before the bunker exit.
- The previously repaired southeastern lamp passage retains 40-world-unit clearance on its dedicated test route.
- Geometry and JS syntax checks pass. No production/browser end-to-end test is claimed.
