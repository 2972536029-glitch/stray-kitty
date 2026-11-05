# Opening scene artwork

City settings for the title, four-beat introduction and Miao Miao's original home.
The early story has not reached the greenhouse. Keep these locations within the
residential city: apartment blocks, domestic windows, wet paving and streetlamps.

These environment plates were made with the built-in image generation tool on
2026-11-05, then integrated as local game assets. The matching `.prompt.txt`
files preserve the final edit prompts. No external model API runner is required.

- `city-skyline-night.png`: panoramic city night, keeping the native cat trio,
  title and menu centered over a quiet middle, as in the original opening.
- `rainy-alley.png`: introduction beats three/four, center ground reserved for the native cat.
- `apartment-afternoon.png`: introduction beats one/two and the original-home dialogue scene.

All plates use matching fine pixel clusters, stepped edges and amber/teal lighting.
No characters, dialogue text, buttons, blanket or food bowl are baked into them.
Keep native cat sprites and interactive UI independent of the environment art.

The original-home canvas is still 800 by 480 logical pixels. Its plate is drawn
with a centered cover transform and image smoothing disabled. The original cat
at (265,350), blanket at (267,348), food bowl at (335,352) and speaker anchor at
(265,298) retain their registration. Load this image only when that scene is
used; do not eagerly download it in other chapters.

Visual changes are scoped through `opening-scenes.css`. Map geometry, collision,
story IDs, saves, battle rules and existing title action callbacks stay unchanged.
