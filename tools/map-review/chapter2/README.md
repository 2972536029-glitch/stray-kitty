# Chapter 2 map trace preview

This standalone review tool compares the existing Night Market walkability with a manually traced candidate on L0, L1 and L-1. The reviewed tracing and crate visuals are now integrated into the production Night Market module on this branch. The approved PNGs, events, C/F anchors, progression and saves are unchanged; the review tool itself remains isolated. No game API or browser storage is used.

## Run locally

From the repository root, install the normal project dependencies with `npm ci`. Python 3 with Pillow and NumPy is also required (`python -m pip install Pillow numpy`). Then run:

```powershell
node tools/map-review/chapter2/prepare.mjs
node tools/map-review/chapter2/server.mjs
```

Preparation reads the current runtime geometry and generates the ignored JSON masks and landing audit. The server binds only to `127.0.0.1:5190`; it has no API proxy. Set `PYTHON` if the Python executable has another name.

- Full preview: http://127.0.0.1:5190/
- Southern cargo curbs: http://127.0.0.1:5190/?focus=south-curb
- L0 paved junction: http://127.0.0.1:5190/?focus=junction
- Widened L1 northwest roof: http://127.0.0.1:5190/?focus=nw-roof
- North street above the information stalls: http://127.0.0.1:5190/?focus=north-curb
- Striped-awning island curb: http://127.0.0.1:5190/?focus=island-curb
- Planted-block bend: http://127.0.0.1:5190/?focus=island-bend
- Both restored stall obstacles: http://127.0.0.1:5190/?focus=stalls

## Candidate behavior

`build-trace.py` defines the outlines and writes the inspectable `trace-profile.json`, 2px raw masks and centre-safe masks eroded by the existing 10px collision radius. Yellow shows the combined pavement outline, without internal seams between overlapping shapes. Cyan shows legal cat-centre positions. Difference mode shows old-only positions in red and candidate-only positions in green; these are review differences, not automatically proven errors.

The L0 southern curve and junction follow the visible curbs. The L1 northwest connector is wide enough to walk straight north from the right side of the C landing. The southern cargo obstacle and north gate are visible using the existing warehouse crate sprite at map pixel density, with ambient shading and contact shadows. Source artwork is reused without editing the image files.

The approved L0 follow-up restores two solid footprints beneath the existing information-stall row and striped-awning island. These are ground footprints rather than silhouettes of overhanging art: the northern passage permits rightward travel and the island's western edge permits walking close to its curb. The northern street and planted-block bend also follow the visible road edges more closely. Both the game and review tool apply these solids in addition to the traced surface. Roof/underground masks, existing cargo and battle barriers, and C/F anchors are retained.

The preview retains the original cargo and battle obstacles and reuses the C/F transition controller, animation timing, portal identities and victory gate. Candidate endpoints snap locally to legal ground within 48px; the actual game coordinates are unchanged. The local walking model uses swept steps and axis sliding. It is a review model, not an integrated gameplay replacement.

WASD/arrows move; C/F traverse; Shift-click places the cat; wheel zooms and right-drag pans. Toggle outlines, anchors and opacity, or hold Tab to hide the diagnostic overlays. Alt-click adds a temporary note; export notes or a screenshot explicitly. The victory switch affects only the preview.

## Verification and limits

Focused checks passed for L0 bend traversal in both directions, the southern C crossing, and straight-up keyboard movement from the right side of the L1 northwest landing. Earlier baseline checks covered four C/F journeys, the north exit gate and floor rendering. The floor mask hashes confirmed that the L1 widening did not change L0 or L-1. Browser checks reported no page errors or game API calls; standalone TypeScript checking passed.

For a fresh geometry connectivity and source integrity audit, run `python -X utf8 tools/map-review/chapter2/verify-preview.py`. This checks landmark reachability with the retained gates and records artwork/spatial/transition hashes in ignored `proof.json`. It is not a full chapter playthrough.

L-1 still needs manual review. This branch contains the Chapter 2 preview and runtime integration. `export-runtime.py` exports compact run-length encoded collision data to `specs/night-market/night_market_traced_mask.json`; the game loads it synchronously, so no gameplay API or asynchronous image-loading dependency is added. The existing building, cargo and battle guards still apply, and the scene now renders the approved crate painter. Nearby stale saved positions can recover to traced pavement within 48px, while obstacle recovery remains tightly bounded. Generated masks, screenshots, local proofs and Vite caches are ignored. Chapter 1 changes stay on their own branches.
