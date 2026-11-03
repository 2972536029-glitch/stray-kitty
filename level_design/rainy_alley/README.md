# Rainy Alley — Canonical Integration Source Pack

Keep everything in this package **read-only** until visually reviewed against the live game. Do not replace the scene with the standalone JS demonstration. Do not regenerate the image.

- `source/rainy_alley_v09.svg` / `source/geometry.json`: locked SVG/graybox route, gate, navigation geometry in 1188 × 726 coordinates.
- `source/level_objects.json`: fixed interactions, fish pickup proposal, 3 event zones and contextual exit placeholder.
- `art/rainy_alley_background.png`: the unchanged user-provided high-resolution 1672 × 941 render from the accepted v1.2.1 registration package.
- Production uses the [user-approved cleaned runtime derivative](../../web/src/modules/rainyAlley/assets/README.md), which removes the six signboards and the small entrance cat figure. The original art and this package's source hashes remain unchanged.
- `reference/events_alley_branch_v13.json` and `reference/story_alley_branch.json`: **read-only reference** for IDs/text; the real game catalog and latest teammate branches must remain authoritative.
- `reference/preview_v09.js`: standalone simulation logic for spatial semantics; do not copy its mock state, dice, rewards or battle simulation into production.

Runtime contract: ONE world-coordinate transform between SVG (1188×726) and PNG (1672×941). The SVG is the authoritative collision/interaction layer, PNG visual only, original cat sprite is retained. Never maintain a second independently edited collision mask. Verify choke, squeeze, fish route and visible boundaries before removing old code.

Random zones: west/central/east once per chapter, backend single 55%-initial roll, existing events v1.3 only, no second `REPORT_MOVE` RNG for alley. Fish: +1 food is **proposed**; server must grant once and persist a claim flag, no client-only reward. Crate: mandatory boss gate until proper Chapter 1 rescue clear; tutorial L00 is separate. Exit: placeholder only.

To keep production assets separate from reference data, the integration step may copy from this package into the project's preferred runtime bundle paths, but source bytes must remain unchanged. Do NOT import the reference events JSON as new cards.
