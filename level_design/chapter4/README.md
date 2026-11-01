# Chapter 4 — Underground Tunnel · Visual-to-repo handoff v1.2

**Status:** approved standalone visual *reference* ready for Codex integration; not a claim that all backend stage/event content exists. This handoff was assembled from playable v1.1, with event labels restored in reference v1.2. No repository files have been modified by this package.

## Source-of-truth order

1. **Paintings:** `art/chapter4_L0_approved.png`, `art/chapter4_Lminus1_tunnel_v11.png` (each exactly 1672 × 941)
2. **Gameplay walkability:** `collision/chapter4_L0_walkable.png`, `collision/chapter4_Lminus1_walkable.png` (same world frame; white walkable, black blocked)
3. **Interaction placements and traversal:** `data/chapter4.map.json` (13 event/zone location records; 10 reversible connectors)
4. **Lighting:** `data/chapter4.lighting.json` (v1.1 monotonic-compositing canvas fog; no dark bubbles)
5. **Visual/behavior reference:** `reference/Chapter4_Reference_Playtest_v12.html` (standalone self-contained QA preview; **event labels shown by default**) and `svg/chapter4_anchor_overlay.svg` (pure vector world-space annotations, **not collision**)

Do not source collision from the old v0.2 SVG `draft-walkable-footprint`. It predates the painted-mask corrections. The integration should use these exact PNGs and layer names, not regenerate artwork by tracing from screenshots.

## Essential controls and spatial rules

- Production QA correction (2026-10-29): ground contact uses the cat's paw ellipse (10 px half-width, 3 px depth), with bounded corner sliding. The old 10 px circular body footprint produced false walls along the narrow bridge rails and painted pavement corners. Approved PNG artwork and mask pixels are unchanged. The lower waterfall's Space link now joins the visible banks at (330,430) and (520,470), instead of placing its start in the waterfall. Random zones have no signs; entry scenery has no E marker, and completed events show a check mark without an E action. Nearby traversal markers always identify the actual key.
- Follow-up surface registration lives in `data/chapter4.surfaces.json`: the lower east wooden bridge has a continuous bank/deck approach, while water north of it stays blocked. The tank's lower-right shortcut is blocked. C enters a separate raised stone-ledge surface at (548,444); movement there is restricted to the stone top (with a narrower paw footprint), and C at the original landing returns to the lower approach. Artwork and original raster files remain unchanged.
- All raised ridge edges are blocked on the ground mask, including the tank's extended arm. The south ridge is a second independent surface: west C connects (920,690) to the stone top at (940,626); the east C connects the ridge at (1175,735) with the lower paved walkway at (1175,785). Both are reversible. Ordinary movement stays on the ridge until a C descent is used, and ground movement cannot bypass that climb.
- Additional marked C exits: the tank ridge's eastern end (820,464) descends to the road at (820,525); the western ledge by Momo's old mark (430,700) descends to the lower road at (390,765). Both support climbing back up. The western ledge uses its own bounded raised surface, with the clear pavement below registered as ground. Descent prompts follow the upper/lower endpoint, rather than inferring direction from screen coordinates.
- Water between the central bridge decks is blocked while the deck at (900,480) remains walkable. The northern gap between (955,190) and (1130,196) requires Space; ordinary movement cannot cross it. Raised surfaces use a 28 px corner lookahead so held cardinal input follows the west ledge's stepped bend without opening its boundary. Ground corner lookahead remains 12 px.

- WASD / arrows: move; E: inspect fixed event; F: underground stairs E1/E2; C: climb onto a walkable ridge/platform; Space: contextual bidirectional jump.
- M: event label display toggle (reference defaults ON); V: collision debug; G: **automatic battle trigger**, not an inspection prompt.
- Jump and climb are valid in **both directions** and must end on the corresponding layer's walkable mask. The long wooden bridge needs ordinary walking; no redundant Space jump.
- Each layer has its own artwork, mask and lamp sources but shares world size and camera coordinate system. L−1 visual is darker. The lighting must smoothly reveal scenery around the cat without the old black-circle artifact.

## Authored story / battle

- `tunnel_false_kitten_trap` (D): mandatory inspect, unlocks lower access.
- `tunnel_valve_three` (F as narrative marker): mandatory E inspect after D. The F **key** still controls stairs.
- `tunnel_exit_boss` (G area): enters the `tunnel_boss` battle only after both mandatory objectives. Battle win comes from the official battle flow, **never from the reference HTML's QA success button**.
- The three L0 and one L−1 random zones are placement candidates. Their selection must be delegated to current server-owned zone/event logic, with authored encounters taking priority.
- Optional labels: `独行侠的旧记号`, `壁灯巡逻图`, `应急灯闸`. Their backing event definitions and active contracts must be checked in the current repository; the static prototype does not prove those event cards exist.

## Changes since v1.1

- **Event labels restored** on the main exploration canvas by default, rendered after lighting so they remain readable; M toggles them.
- Display and runtime use the same event positions. E2, R2, and R3 anchors were synchronized; R3 was shifted to valid walkable ground by the southern stair. The standalone map now also shows L−1's R4 design marker in the correct layer.
- Preserved the approved artwork, collision masks, darkness radii/opacity, lamp positions, battle-state preview, controls, and connectors. The production renderer uses a source-over darkness gradient plus screen-blended lamp glow: the handoff's `destination-out` composite erased the map artwork and exposed the page backdrop. Event labels render above lighting; duplicate E1/E2/G marker labels were removed where the F stair markers and G trigger already identify them.

## Known limitations / integration dependencies

- v1.1 HTML has local state and a test-only simulated battle success; production must dispatch through the game's existing controller/backend. The `tunnel_boss` stage was **absent** from the provided Oct 28 repository snapshot; Codex must check current main before assuming it exists.
- The L−1 artwork is the selected generated prototype and the collision was refined against it, but isolated art/collision discrepancies may still be found in formal gameplay QA. The L0 third-flood-valve interaction is near (867,743), while the painted red wheel is near (865,692); do not silently move the interaction before story/interaction owner review.
- The reference HTML is deliberately a **single-file QA artifact**; use native asset imports and structured data for production. All per-layer masks are raster, not the outdated SVG path.
- The starter HTML has an ordinary QA collision editor, a teleport menu, dev-only interactions, and a fake battle-win button. These are *not* production features.

## Files

| Path | Description |
|---|---|
| `reference/Chapter4_Reference_Playtest_v12.html` | Standalone browser reference, labels visible, v1.1 light retained |
| `art/*.png` | Two complete full-resolution paintings |
| `collision/*.png` | Two embedded walkable masks extracted from accepted v1.1 HTML |
| `data/chapter4.map.json` | Canonical event, zone, connector and story positions |
| `data/chapter4.lighting.json` | Lamp positions, darkness and cat-visibility radii |
| `svg/chapter4_anchor_overlay.svg` | Independent vector annotation layer for React/SVG |
| `handoff/ACCEPTANCE.md` | Exact review and test checklist |
| `CODEX_PROMPT.md` | Single ready-to-copy integration instruction |
| `data/integrity_manifest.json` | SHA-256 file integrity checks |

## Registered collision update (2026-10-31)

The reviewed L0/L-1 pavement trace is now exported into the production grayscale collision masks. The three raised ridge surfaces and all earlier deliberate blocks remain intact. The lower east bridge approach keeps the approved width correction without opening the water north of it. A reversible C connects the west ridge east end `(730,744)` to the adjacent paved road `(780,720)`. Existing event positions and portal anchors are unchanged. Production F access still requires the false-kitten investigation; failed key attempts now give visible feedback. The isolated review tool is under `tools/map-review/chapter4/`. Approved artwork is unchanged.
# Event icons and valve approach

The six fixed interactions now use cached pixel props and floating labels. Unfinished mandatory names stay visible on their floor; optional names fade with proximity. Random encounter zones remain unmarked. Nearby E interactions take priority over crossing labels.

The approved north C, west ridge C and valve-side Space anchors are separated from the third valve's 56px interaction circle. Their canonical coordinates are shared by marker drawing and traversal. Raised landings, collision masks, deliberate blockers, event outcomes and prerequisite flags are unchanged. The standalone review is `tools/map-review/chapter4-events`.

The final L0 exit has a visible metal grate at x=1608 across the deck. Its collision boundary and the existing battle trigger share `chapter4.map.json` data: the cat stops inside the trigger instead of reaching the map edge, including while prerequisites are missing or a battle request is pending. Victory continues to the authored rescue narrative and then home; Chapter 5 starts from the greenhouse with the existing three-clue requirement.
