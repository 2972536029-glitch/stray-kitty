# Chapter 5 warehouse — L0 registration review

**Draft for manual art/alignment review. L1 is provisional.** This is an offline art assembly, not a production map integration or a new gameplay controller.

## Review

Open `review/warehouse_L0_review.html` in a browser, or serve this directory with `python -m http.server 5185` and visit `/review/warehouse_L0_review.html`. Art/Graybox, collision/anchor, hardware and provisional L1 guide toggles share the same 1672 × 941 origin. Native 100% exposes the original pixels. Random-zone circles and numbered rectangles are QA overlays only.

- `art/warehouse_L0_ground.png`: corrected and masked approved ground.
- `art/warehouse_L0_props.png`: transparent 38-obstacle layer.
- `art/warehouse_L0_initial_hardware.png`: separate unlit lamps, closed shutter and gates.
- `art/warehouse_L0_composite.png`: ground + props + initial hardware for review.
- `review/warehouse_L0_collision_overlay.png` and `warehouse_L0_geometry_overlay.svg`: raster and editable spatial comparison; keep the SVG beside its relative art image.
- `review/warehouse_L0_asset_placement_manifest.json`: all 38 original IDs, unchanged collision rectangles, independent draw bounds, bottom-center anchors, natural dimensions, scalar transforms, rotations and decisions.
- `review/warehouse_L0_placement_audit.md`: all 38 placements with v02 distortion ratios. Source and placement contact sheets are in the same directory.
- `review/warehouse_L1_support_review.png` / `warehouse_L1_support_audit.json`: six authored L1 regions over L0, for support planning only.

## Sources and authority

`source/v07/warehouse_geometry_v07.json` and the L0/L1 SVGs are immutable copies from the supplied Part A package. The full gameplay contract is copied into the placement manifest for comparison. World size, cat radius 13, solids, climbs C1/C2, interactions, random zones, lights, gates, event pools, visual outcomes and story contract are unchanged. The supplied prototype/generator files are preserved as references; this pipeline does not run or modify them. Redundant original preview PNGs are omitted.

`art/source/` preserves the approved ground, full-scene style reference and atlas from Part B. Clean transparent crops and four initial-state hardware sprites are reused from the supplied previous assembly; its placed sprites are not used. `reference/placement_manifest_v02.json` is diagnostic only. The supplied L1 study and its README remain under `reference/`, explicitly provisional. `source_lock.json` records SHA-256 and byte length for all 44 original inputs.

Ground texture remains at native scale. The exact SVG floor paths supply the alpha mask. Old perimeter/void bands and the southeast raster wall remnant are repaired locally by translating nearby approved floor pixels; native wall trim is tiled along the authored perimeter. Recipe coordinates for texture repair do not define gameplay geometry. Alpha/perimeter mismatch is zero pixels; texture seams still require visual review.

Every obstacle uses one uniform affine scale with nearest-neighbor sampling. Six documented variants join native sprite strips, removing repeated tiers rather than squeezing a tall image. Draw bounds are conservatively inside each authored solid footprint. Collision bounds and art bounds remain separate; no collision rectangle was resized to match an image. Three lamps are unlit; no light pools or event-outcome state changes are baked into the static ground.

## Regenerate and validate

From the repository root (or extracted ZIP root), with Python 3.10+:

```sh
python -m pip install -r level_design/chapter5/tools/requirements.txt
python scripts/register-warehouse-l0.py
python scripts/register-warehouse-l0.py --verify --package
```

The second command regenerates deterministic art, manifests, overlays, contact sheets, review HTML and `review/validation_report.json`. The third validates existing exports and creates `output/chapter5/Chapter5_Warehouse_L0_Registration_Review.zip`, including sources and the registration script, then runs ZIP CRC integrity checks. The ZIP is a delivery artifact, not a redundant committed binary.

Actual focused checks passed: 44 source hashes, JSON/XML parsing, 38 unique matching IDs/rectangles, single-scalar transforms with no non-uniform exceptions, all full-frame exports 1672 × 941, prop transparency, zero prop pixels outside the solid-footprint union, exact SVG floor alpha, six unchanged L1 regions and full gameplay-contract equality. `node scripts/architecture.mjs --check` and `git diff --check` are the relevant repository checks.

The full staged whitespace check reports two pre-existing trailing spaces in the supplied `source/v07/build_warehouse.py` (lines 131/140). That locked reference is preserved byte-for-byte; the staged check excluding that one immutable input passes. No authored registration file has whitespace errors.

Local Chromium art-viewer smoke check passed: all six images decoded, 1672 × 941 canvas, native-size toggle, Art/Graybox, collision, L1 guide and hardware toggles; zero page/request errors. A first Vite-based harness served the repository SPA instead of the offline document; the successful check used an isolated static HTTP server, which was closed afterward. This was **not gameplay traversal**. No application/backend, battle or full chapter tests were run for this art-only change.

## Pending review and limitations

- L0 needs manual approval of obstacle readability, neighboring pixel density, local floor repair seams and passage clarity. The small `east_spare_forklift` (scale 0.295) and `west_overturned_pallets` (0.448) are explicitly flagged scale outliers.
- Existing overlapping solid footprints remain as authored; overlay numbers and the placement table expose them. The combined prop PNG has no player occlusion behavior; later Canvas integration must render appropriate depth separately.
- L1 is not finalized. `lookout_platform` has zero L0 solid-footprint overlap; `east_catwalk` about 7.8% and `c2_landing` about 3.4%. Other regions also have partial support. These measurements flag review areas, not structural proof. Shelf tops, bridge members and supports must be resolved after L0 approval without moving the authored paths, climbs or events. The transparent guide is QA, not final elevated artwork.
- Runtime lighting, saved event-outcome visuals, collision traversal and chapter progression remain outside this milestone. Review the actual composite and collision overlay before marking the Draft MR ready; CI cannot approve art.
