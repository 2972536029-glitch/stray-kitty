# Chapter 5 event-icon preview

Run `node tools/map-review/chapter5-events/server.mjs` and open http://127.0.0.1:5201/ . The approved icons, labels, optional hint and low crates are integrated on `feat/chapter5-event-icons`, based on main 4249877. Production and preview share the renderer and canonical art-placement data. Collision footprints, lighting and progression rules remain unchanged.

The page runs the actual `WarehouseWalkMap` renderer, lighting, masks, C traversal, lamp-controlled gates and nearest-target selection. Candidate mode uses the shared event renderer; baseline mode restores the original signs and two rubble records. E locally toggles any of the three lamps or simulates an optional investigation. The progress selector simulates the existing battle-victory flag; it does not start combat or advance story. No API or save is used by this comparison page. The actual game keeps its existing service, event cards and random encounters.

Seven visible points use ten cached 44px sprite cells (including three pairs of lamp states), totaling 77,440 RGBA bytes. The palette and label style follow Chapters 1/2/4. Optional labels fade at 160–100 world pixels; the unfinished battle name stays visible on L0, then the unlocked rescue exit becomes the persistent objective. Completed investigations fade. C labels appear only for the actual active nearest connection, with the existing E/C priority and ranges preserved. The four random zones remain invisible.

The battle approach includes a local optional nudge about investigating the upper shelves while either fixed investigation remains incomplete. It does not gate battle and disappears once both are done or victory is selected. L1 object icons remain on their actual floor.

The two gray rubble blockers are replaced with the existing crate assets: a low single storage crate in the east passage and a wooden crate in the south passage. This distinguishes solid obstacles from traversable ground stones elsewhere. The sprites retain their native aspect ratios, and the foreground edges, collision rectangles, walking clearance and z-order stay unchanged. They reuse already loaded sprites, adding no image requests. Baseline mode restores the original rubble. Review buttons jump to both replacements. Random cards do not trigger in this isolated page; their existing pool remains in the game data and requires the actual game service for testing.

Links: `?focus=entry`, `spotlight`, `east`, `lookout`, `crate`, `boss`, `exit`, `C1` or `C2-top`. Add `lights=on` for a lit comparison and `progress=victory` for the unlocked exit. WASD/arrows walk, C climbs, E simulates local interactions, wheel zooms, Tab holds the original markers, and the baseline button keeps the old style visible.

Verification is limited to type checks, production build, content/architecture consistency and focused game checks for the changed presentation and its existing interactions. Commit and MR follow the user's request.
