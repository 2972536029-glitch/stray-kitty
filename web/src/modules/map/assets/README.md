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
