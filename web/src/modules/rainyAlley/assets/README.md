# Rainy Alley runtime background

`rainy-alley-background-clean.png` is the user-approved cleanup of the original Rainy Alley background, reviewed on 2026-11-03. It removes the six baked-in signboards and their frames (`积水`, `旧毛毯`, `爪痕`, `寻猫启事`, `进入`, `出口`) and the small white cat figure beside the entrance lamp. The missing-cat poster and claw marks remain.

The approved PNG is 1671 × 941 pixels. The Chapter 1 preview uses a display-density canvas and aligned camera origin while preserving the agreed 530 × 325 camera at default zoom 1. Artwork resolution must not change the field of view. The existing world registration, collision geometry, event positions, runtime labels, and crate names remain unchanged. Manual camera zoom remains available.

The locked original remains at `level_design/rainy_alley/art/rainy_alley_background.png`; its entry in `SOURCE_MANIFEST.json` still describes the original source, not this runtime derivative.

The sharper restoration was approved after an identical-camera comparison on 2026-11-06. The delivered asset is `../../map/assets/rainy-alley-background-clean.enhanced-v1.lossless.webp` (1670 × 941, 2,098,878 bytes). It is an AI restoration made with built-in imagegen, not a true 2× master. Its lossless encoding preserves the restored pixels. The original entry artwork loads first; the restoration downloads at low priority and replaces it only after decoding, without blocking movement. A failed enhancement leaves the original playable. The squeeze-passage facade sampling continues to use the original artwork and coordinates.

Restoration prompt: "High-resolution image restoration EDIT. The attached image is the exact game map and must remain spatially identical. Return an actual 3344 x 1888 pixel high-resolution raster, not a 1670 x 941 image. The previous restoration was sharper but was returned at the original resolution; this edit specifically needs twice the pixel dimensions. Preserve the complete map and every object location, route boundary, gate, narrow passage, wall, light, rain streak and building silhouette. Only improve fine detail and sharp pixel-art edge definition. No redesign, new objects, characters, captions, labels, borders or cropping. Preserve the original blue rainy night / warm gold palette. A conservative supersampled high-resolution restoration of this exact existing scene." The returned image remained 1670 × 941 and is documented at its actual resolution.

- Restored WebP SHA-256: `c639762061a40bdb9efc038dd9b45bb0708d71235e33bae2763e23850070e898`

- Original SHA-256: `4303914bac03a742bdcfe687aaf830218c235db62c8d6611511abf888d508113`
- Approved runtime SHA-256: `c82f28d6938d5e550555548edd5a7f25d83472ab0e4b741f80b04816111abab0`
