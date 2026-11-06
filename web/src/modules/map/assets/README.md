# Chapter background delivery assets

These lossless WebP files decode to the same RGBA pixels and dimensions as the
approved PNGs. Sources, registration, collision masks and gameplay are unchanged.
The PNGs remain available as runtime fallbacks.

Rebuild with `python scripts/prepare-map-backgrounds.py` (Pillow with WebP support).
The script verifies every decoded pixel, including transparent pixels.

| Background | PNG bytes | WebP bytes |
| --- | ---: | ---: |
| Rainy alley | 2,282,424 | 1,868,436 |
| Market L0 | 2,711,084 | 2,177,274 |
| Market L1 | 1,924,324 | 1,357,554 |
| Market lower floor | 1,874,571 | 1,421,498 |
| Tunnel L0 | 2,522,346 | 1,925,222 |
| Tunnel lower floor | 2,029,120 | 1,517,700 |
| Greenhouse | 2,749,227 | 2,221,228 |

`map/artwork.ts` caches decoded images for the lifetime of the page. Chapters
1, 2 and 4 restore early warming of all their backgrounds and floors, including
while the title/prologue is visible. The selected entry floor loads first;
the remaining classic maps warm at low priority after it is decoded, avoiding
competition on a slow connection. Direct warehouse entry/review
keeps Chapter 5's isolated loading path and starts none of those downloads.

Classic scenes hold movement, interactions and foreground rendering until the
current floor is decoded. A failed PNG fallback shows a retry action. No chapter
image is downloaded merely by importing the module. The shared preview caches
the content-hashed delivery images across visits; unhashed PNG sources keep
their existing validation policy.

## Sharper Chapter 2 and Chapter 4 artwork

These conservative restorations were generated with built-in imagegen on 2026-11-06, following the Chapter 1 comparison. They are approximately source resolution, not 2× masters. The original PNGs and their existing lossless WebPs remain intact. The rendering destinations stay at the original 1672 × 941 map coordinates, including the two restorations returned one pixel narrower.

Only the active floor requests its enhancement, at low priority, after the original is playable. It replaces the original only after decoding. Failed enhancements leave the original playable; decoded images are reused on floor reentry. Chapter 5 has no enhancement or resolution change.

| Floor | Source PNG | Delivered WebP | Actual pixels | Bytes | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Market L0 | `web/public/assets/night-market/night_market_L0_streets_1672x941.png` | `night_market_L0_streets_1672x941.enhanced-v1.lossless.webp` | 1671 × 941 | 2,183,680 | `3407af09a461c9a7742d8c592b43185386500c27c9dec25806f8283f4718a4c1` |
| Market L1 | `web/public/assets/night-market/night_market_L1_rooftops_1672x941.png` | `night_market_L1_rooftops_1672x941.enhanced-v1.lossless.webp` | 1672 × 941 | 1,759,376 | `a112f4c9be9836b3a2aabd0efe2004d4b303f4f218e640937464986f8b124e84` |
| Market Lm1 | `web/public/assets/night-market/night_market_Lminus1_tunnel_1672x941.png` | `night_market_Lminus1_tunnel_1672x941.enhanced-v1.lossless.webp` | 1671 × 941 | 1,402,858 | `067c24d761e0198e5975e746a184a8651b82886610a5d48a389e8ed2cc273796` |
| Tunnel L0 | `level_design/chapter4/art/chapter4_L0_approved.png` | `chapter4_L0_approved.enhanced-v1.lossless.webp` | 1672 × 941 | 2,012,030 | `a76514cb57352023ecf808983830ffb4ae8410fcc69c08ffdf9366e0da3489ed` |
| Tunnel Lm1 | `level_design/chapter4/art/chapter4_Lminus1_tunnel_v11.png` | `chapter4_Lminus1_tunnel_v11.enhanced-v1.lossless.webp` | 1672 × 941 | 1,614,938 | `97822f0b2c662dff6f59fff82a20a975c3147a1d2e3338ff40c45244b47fc68e` |

The generated PNG-to-WebP conversion was verified against decoded RGBA bytes. Collision masks, authored navigation, portals, props and camera scale are unchanged. Camera origin alignment is shared with the label projection.

Prompt used once per floor, with the corresponding floor key substituted:

> Conservative sharpness restoration EDIT of the attached existing game collision map (<floor key>). Preserve the full exact framing, aspect ratio, 1672 x 941 dimensions, and all proportional object positions. Improve only crisp pixel-art edge definition and small texture detail: paving, masonry, roof tiles, railings, pipes, water and existing lights. Keep every walkable path, wall, bridge, ladder, stair, exit, platform, channel, building silhouette and empty dark area spatially unchanged. Preserve the source palette and exact lighting distribution, including intentionally dark/desaturated areas on the rooftop layer; do not brighten or recolor them. No new objects, characters, labels, signage, text, UI, borders, glow, fog, cropping, camera change or redesign. Avoid sharpening halos. Opaque background. Match the faithful sharpening approach used for an existing pixel-art game background, not a new scene.
