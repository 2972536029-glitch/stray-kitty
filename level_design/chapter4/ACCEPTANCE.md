# Chapter 4 — integration acceptance and evidence

## Layers and geometry

- [ ] Keep the L0 and L−1 artwork at 1672 × 941; no stretching, crop, translation drift or mismatched SVG coordinates.
- [ ] Use raster collision masks, not stale draft footprint; check cat collider clearance with 10px radius (20px diameter).
- [ ] Walk both floors without stepping through painted walls, water, void, crate stacks, or pipe edges; preserve normal bridge movement.
- [ ] Verify E1/E2 F transitions in both directions and that player can walk away from each landing.
- [ ] Verify every C and Space connector in both directions, and that there is traversable surface after ridge/climb landings.

## UI / event labels

- [ ] Labels are visible on the **main playfield by default**, above the lighting layer. They are **not** sidebar-only or only visible in collision/debug mode.
- [ ] Show fixed/mandatory nodes, optional map points, random-zone label distinctions R1/R2/R3 and L−1 R4, two F stairs, and G trigger. Keep correct floor isolation.
- [ ] Use shared positions from `data/chapter4.map.json`; never use stale embedded static SVG positions for E2/R2/R3.
- [ ] Avoid duplicate G area label or duplicate E1/E2 label from overlapping UI layers. Maintain a working M toggle in prototype/QA.

## Story, events, battle

- [ ] D trap inspected before F stair transitions are enabled.
- [ ] E near third flood valve advances the authored objective only when D has been completed. The valve's story designation F is distinct from the F key.
- [ ] G triggers automatically by entering its zone after required objectives; reject duplicate/early activation; use production battle result for completion.
- [ ] Optional nodes use existing content if available; do not make up event cards or rewards.
- [ ] Random zone queries use current server-validated, idempotent selection mechanism; never interrupt a mandatory encounter.

## Atmosphere and performance

- [ ] Apply warm lamps + smooth player-centered darkness, with L−1 darker than L0.
- [ ] **No black bubbles, mask seams or circular occlusion artifacts.** Switch lamp sets on floor transitions.
- [ ] Make lighting independent of physics; no frame-by-frame reallocation of full-resolution image data if an efficient reuse path is available.
- [ ] Validate movement with normal keyboard, gamepad only if existing project supports it, and viewport follow/zoom without position drift.

## Final checks / evidence

- [ ] Typecheck/format, build, focused browser smoke. Include console errors, if any.
- [ ] Save L0 and L−1 screenshots with **event labels ON, lighting ON**.
- [ ] Capture at least one bidirectional F, C and Space crossing as concise evidence.
- [ ] Keep build state, running instance, and screenshots from **the same final code revision**.
- [ ] Update `docs/ARCHITECTURE.md` and level-design docs with the floor/lighting/event mapping, known provisional data and ownership.
- [ ] Provide one complete MR description and no automatic merge.
