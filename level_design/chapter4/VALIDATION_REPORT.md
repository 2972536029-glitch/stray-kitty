# Chapter 4 v1.2 handoff — focused verification

**Source:** v1.1 standalone HTML accepted for visual style; v1.2 changes label visibility and synchronizes a few annotation anchors. No repository changes were performed.

## Passed

- `node --check` on extracted v1.2 inline script: passed.
- Embedded reference HTML loaded and initialized in headless Chromium: passed, no JavaScript page errors.
- World-coordinate art and collision image sizes: both layers 1672 × 941.
- Restored event-label group is visible **by default**, located **above** the darkness overlay in SVG stacking order. M toggles labels off/on.
- Event label layer filtering: L−1 R4 appears only on L−1; L0 markers are hidden on L−1.
- E1 and E2 F connectors: successful two-way tests and correct per-floor landing coordinates.
- All 8 connectors' 16 stored endpoints meet the source preview's full cat-footprint validity condition at source pixel positions. These checks do not prove that each connector animation or longer path will work after React migration.
- Random zone R3 adjusted to `(1290,654)`, walkable with the full cat footprint. R2 `(1372,182)` and E2 `(1278,548)` are synchronized in the v1.2 model and reference.
- G gating: after D and valve inspection, walking into G started the local battle preview; no page errors. QA victory remains local-only and must not be brought into production.
- `svg/chapter4_anchor_overlay.svg`: XML parsing passed.
- Integration archive: ZIP CRC test passed.

## Not certified

- Production server-backed stage `tunnel_boss`: absent from the provided October 28 repository snapshot; current main must be checked.
- Optional tunnel fixed-event content and zone backend event pools: verify in current repository; no new cards are claimed.
- The third-flood-valve visual red wheel may be around `(865,692)` while the authored interaction anchor remains at `(867,743)`; requires final visual/narrative review.
- Complete wall-by-wall traversal and all collision passages after integration; test within current React runtime and collect screenshots from its final code state.
- Wall-occluded light rays: not implemented; v1.1 uses smooth gradient visibility and fixed lamp pockets.

## Preview-specific behavior

The standalone HTML has a collision brush and teleport shortcuts, and its battle dialog has a QA-only mock victory. They are deliberately excluded from the production acceptance requirements.
