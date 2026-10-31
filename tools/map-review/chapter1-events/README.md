# Chapter 1 event-object review

Run `node tools/map-review/chapter1-events/server.mjs` from this worktree, then open http://127.0.0.1:5195/. Type check with `node node_modules/typescript/bin/tsc -p tools/map-review/chapter1-events/tsconfig.json`.

The approved appearance is now integrated into `IntegratedRainyAlley`. Seven fixed objects use the shared `eventProps.ts` pixel atlas: mint puddle, coral tin/fish, pale kitten box, lilac poster/blanket and mint claw scores. Props display at 1.4 scale; the atlas stays 280 x 40 pixels (44,800 RGBA bytes), without new image downloads. The cream dog, mint collar and deeper outlines retain the existing dog animation. Source PNGs are unchanged.

The original rounded floating labels fade in on approach, before E becomes available, and fade out on departure. Icons remain visible; the next main objective retains its label until completed. Labels reuse bounded canvas caches. Random zones have no signs.

The preview reuses the production prop atlas, dog painter, squeeze painter and collision data. Its controls remain isolated from the API and browser storage: WASD/arrows move, E previews feedback, C crosses authored crates and S traverses the squeeze. Wheel zooms and right-drag pans; hold Tab for the unchanged PNG. Location buttons reposition the review cat. The all-names checkbox compares always-visible text; the step-back button reviews fading. The game-renderer button compares the current integrated marker drawing.

Direct locations:
- `?focus=alley_dog_friend_point`: high-contrast animated dog.
- `?focus=alley_blanket_stack`: label approach/fade.
- `?focus=alley_crate`: kitten box before rescue.
- `?focus=alley_poster`: poster after rescue.
- `?focus=squeeze`: approved stone passage, nearby S prompt and compressed-cat animation.

Squeeze release now finishes beyond the narrow mouth, leaving clearance for lateral movement at the upper exit. Existing walls, cargo, C endpoints, floor outlines and random zones are retained. Tests cover both traversal directions and lateral release, alongside the existing interaction and zone rules.

Chinese lettering baked into the approved background PNG remains visible. This update changes the runtime markers, without retouching that source artwork.

The branch includes the earlier Chapter 1 interaction-panel/random-check fixes from !90 and squeeze/C-marker work from !91, resolved against the current HomeHub UI. Event IDs, radii, event content, server rules, rewards and save schemas are unchanged. Other chapters remain on separate branches.
