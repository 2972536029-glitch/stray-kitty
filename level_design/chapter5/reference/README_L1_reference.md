# Chapter 5 — L1 shelf-top overlay (v01)

L1 is an **image with a transparent background**, not a complete second warehouse map. It contains only the six authored rectangular shelf/crate-top surfaces in `warehouse_geometry_v07.json` and retains the authored C1/C2 positions.

- `Chapter5_Warehouse_L1_ShelfTop_Transparent.png` — transparent 1672 × 941 image for compositing above L0 when on L1.
- `Chapter5_Warehouse_L0_plus_L1_Preview.png` — visual registration preview over the most recently selected L0 background; *not* the actual game L0 asset.
- `Chapter5_Warehouse_L1_Geometry_Check.png` — verification outlines, original climbs and fixed event anchors (not production art).
- `L1_ShelfTop_Placement_Manifest.json` — the geometry and material assignment.

No stairs, permanent lights, random events or additional gameplay geometry are baked into the L1 overlay. The original L0 is unchanged.

**Important limitation:** the recently selected L0 background is a separately generated illustration. Exact pixel dimensions match v07, but several underlying L0 stacks do not fully match the v07 elevated route's support footprints. This overlay is aligned to the v07 geometry, not proof of visually supported shelf-top traversal in the L0 image. Verify support/occlusion and consider local art edits before locking L1 as final. The generated material treatment and exposed edges are a visual first pass.
