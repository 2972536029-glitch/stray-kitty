# Chapter 4 pavement alignment preview

This first review pass traces the approved L0 and L-1 pavement, bridge decks, water edges and large obstacles in an isolated tool. It removes clear ground-mask spill onto walls/water and restores painted ground omitted by the old lower-floor mask. Manual review is still required. The reviewed masks and the ledge-end C descent are now integrated into the production Chapter 4 module on this branch; this tool itself still makes no game or save changes.

The three existing raised ridges remain separate, byte-identical surfaces entered/exited only through C. Existing F story locks, Space jumps, movement speed, corner steering and the actual `TunnelWalkableMask` movement implementation are reused. Ground retains the production 10px half-width / 3px depth paw ellipse; raised ridges retain 4px / 3px. No body-circle erosion is introduced.

Earlier deliberate QA blocks are mandatory: the tank shortcut, all C-only ridge boundaries, the central water between decks, the northern Space gap and the water north of the lower bridge. The generator retains `chapter4.surfaces.json` blocked polygons and its explicit walkable exceptions in the original runtime priority order, preserving the previously repaired lower bridge approach and western road. These gameplay restrictions are not mismatch areas to be opened during tracing.

## Run

Install the normal project dependencies with `npm ci`, and Python 3 with Pillow and NumPy (`python -m pip install Pillow numpy`). From this branch's repository root:

```powershell
node tools/map-review/chapter4/prepare.mjs
node tools/map-review/chapter4/server.mjs
```

- Overview: http://127.0.0.1:5191/
- Western L0 pavement: http://127.0.0.1:5191/?focus=west
- Central L0 bridge: http://127.0.0.1:5191/?focus=bridges
- Lower corridor: http://127.0.0.1:5191/?focus=lower
- Raised tank ledge: http://127.0.0.1:5191/?focus=ledge
- New west-ledge end descent: http://127.0.0.1:5191/?focus=west-end
- Widened lower bridge approach: http://127.0.0.1:5191/?focus=lower-bridge
- F stair walking test: http://127.0.0.1:5191/?focus=stairs

The server binds to localhost only, with no API proxy. Generated masks, screenshots and audit output are ignored. Set `PYTHON` if the Python executable has another name. Preparation reads the approved raster masks and pure runtime geometry; the proposed polygons live in `trace-profile.json`.

## Review

Select a surface and compare current/candidate/difference modes. Cyan shows allowed paw-centre positions, yellow shows the raw floor/footprint margin, and purple marks raised ridges excluded from ordinary ground. Red differences are old-only positions; green differences are candidate additions. Those colors identify places to inspect, not independently proven errors.

WASD/arrows walk, C climbs, F changes floors, and Space jumps. The walking preview starts with local F access enabled; uncheck the story toggle to inspect its lock. The actual game's story requirement is unchanged. Checkbox changes return keyboard focus to the map, and unavailable traversal attempts show a visible message. Fixed events retain their map signs; random zones have no markers. E only reports the nearest fixed interaction and never settles an event or battle. Scroll to zoom, right-drag to pan, Shift-click to place the cat, or Alt-click to add a temporary review note. Notes persist only when explicitly exported. Labels use the existing proximity/opacity rules. Tab hides the diagnostic overlays.

The candidate adds a reversible C at the eastern end of the west ridge: stone `(730,744)` to pavement `(780,720)`. Its review definition is retained in `preview-portals.json`; it is now included in the production portal data, while all earlier portal coordinates remain unchanged. The lower eastern bridge approach has a small flared floor correction and an 8px adjustment to the adjacent crate footprint. The crate remains solid, and the deliberately blocked water north of the deck remains closed.

All previous authored coordinates are unchanged; the reviewed end-of-ledge C is the one additional connection. The preview can snap a candidate landing to legal ground within 48px and reports the distance. In this first pass all twenty traversal ends are valid at their exact positions except the southern ridge ground endpoint, which needs a 1px preview adjustment. This does not modify the game anchor.

## Basic verification

- Standalone TypeScript check passed.
- Browser walking, C climb/descent, F locked/unlocked behavior and the lower Space jump passed, with no page errors, game API requests or local-storage writes.
- Water and raised-edge samples remain blocked from ordinary ground.
- Connectivity with C/F/Space links reaches every fixed interaction and traversal endpoint when local F access is unlocked. This is a mask audit, not a complete chapter playthrough.
- Original artwork, lighting, movement implementation and navigation-helper hashes are checked, along with exact runtime/preview mask equality, by `python -X utf8 tools/map-review/chapter4/verify-preview.py`.

Changes remain on `fix/chapter4-walkability-trace`. Review narrow corners, large prop outlines, both banks of every bridge and each raised ridge before merging the runtime integration. Event resolution, battles, darkness and saves are outside this tool. Regenerate the architecture index after staging new directories if this preview is later committed.

Runtime integration: `export-runtime.py` writes the two grayscale collision PNGs and refreshes their integrity metadata. It never edits the approved artwork. The permanent guard composition is baked using the same integer-pixel convention as the runtime, so all five active surface masks match this preview exactly. The production F story requirement remains active, with visible feedback for locked or out-of-range attempts; only this walking tool enables F by default.
