# Exploration Maps — Level Design v0.1

> **2026-10-27 integration note:** This v0.1 document retains early proposals and historical examples. For implemented Rainy Alley behavior, use the locked `level_design/rainy_alley/` assets and the generated `docs/ARCHITECTURE.md` §4.1–4.7 (maintained in `docs/LEVEL-EXPLORATION-ARCHITECTURE.md`). Its older L00 assumptions and three-layer Night Market proposal are **not current implementation requirements**. Night Market elevation (fake height or L0/L1) and random-event system remain design decisions. Battle mechanics stay under the battle team; level design verifies entry and safe return.

**Project:** 小猫回家记：流浪猫王国 (*A Cat's Way Home: Stray Cat Kingdom*)  
**Status:** First design draft; the maps, APIs and coordinate examples are **proposals**, not implemented functionality  
**Owner:** Map / level design  
**Repository path:** `design/maps/LEVEL_DESIGN.md`  
**Reference image:** [Pixel-art visual direction](reference/visual-direction-v0.1.png)  
**Code baseline:** Supplied October 2026 repository snapshot; review pending event branches/MRs !7 and !8, `feat/events-v12`, and battle integration MR !14 before coding against shared contracts.

> This is one consolidated design and implementation reference. Narrative chapter text, battle-board rules, and AI-advisor logic remain in their owning modules. The current chapter-route UI/Canvas scene is an integration reference, **not** the final level geometry.

## 1. Scope and design goals

The map module owns **world-map presentation and spatial exploration levels**, including layout, traversal, scene rendering, interactions, discoveries, and the map-specific implementation needed to persist exploration. **Battle board geometry/rules and the AI advisor belong to the battle team**. Existing front-end UI (dialogue, event card, battle HUD) should be reused.

Visual baseline: [the approved pixel-art reference](reference/visual-direction-v0.1.png) is an **approved direction reference**, not a sprite sheet or playable SVG. Final exploration artwork uses obvious square pixels, reduced detail, nearest-neighbor scaling, and the existing muted blue-green, cream, ochre, and rust UI palette. Aim for flat 2D with a readable 3/4 top-down layout, not painterly isometric art or voxel geometry. Follow the existing game cat sprite for scale and personality.

The primary player experience is curiosity-driven traversal through spaces with **one clear critical route**, optional detours, environmental discoveries, and a light mix of fixed and server-triggered encounters. Not every prop, roof, or corridor needs a reward.

## 2. World map and progression

```text
Opening text → L00 prologue battle/tutorial → established main-story entry
                                                      |
                          [Rainy Alley] → [Night Market] → [Greenhouse Hub]
                               |               |               |
                          optional paths   three elevations  rest / storage
                                                               |
                                                      [Underground Tunnel]
                                                               |
                                                      [Abandoned Warehouse]
                                                               |
                                                 final rescue and story ending
```

This is **narrative progression**, not literal city geometry or a new story branch. Map locations come from `web/content/maps/maps.json`: `alley`, `market`, `greenhouse`, `tunnel`, `warehouse`. `prologue` and `finale` are story chapters, not necessarily standalone physical maps.

### Core location plan

| Location | Narrative function | Route structure | Persistence and revisit policy | Baseline danger |
|---|---|---|---|---|
| Rainy Alley | First free-exploration level, investigate rescue aftermath and clues | Guided entry, then 2–3 optional branches rejoining objective | Unique pickups and completed nodes stay resolved; revisit optional | 1 |
| Night Market | Gather supplies, rumors and clues | L0 streets + L1 awnings + L2 roofs; interconnected loops | Some optional routes may unlock via narrative/companions, if supported | 2 |
| Greenhouse | Recurring home base | Compact courtyard + interior areas | Safe; inventory, rest and decorative state persist | 0 |
| Underground Tunnel | Explore hidden routes | Branching passages, visible reconnection and limited sight | Mostly first-time exploration; revisit allowed | 3 |
| Abandoned Warehouse | Converging rescue approach | Multiple approaches joining at objective | Narrative changes persist | 3 |

**Revisiting:** Select already unlocked locations on the world map. Greenhouse is the frequent hub; no artificial requirement to revisit every past level. Travel costs no explicit action points or exploration HP. Optional travel encounter is a separate future feature, not implied by the existing `GO_EXPLORE` command.

**Greenhouse recovery:** Rest is free if exploration recovery is later introduced. Existing consumable supplies and battle inventory cannot be generated infinitely through resting. Preserve current home furniture/warehouse behavior.

**Timing targets (excluding story dialogue and combat):** Alley 5–7 minutes; Market 8–10; Greenhouse ~1–3 each visit; Tunnel 6–9; Warehouse 7–10. These are future full-scope pacing hypotheses, not commitments for the immediate demo.

## 3. Rainy Alley — first playable exploration level

**Map ID:** `alley`  
**Status:** First-pass design; coordinates below are spatial relationships, **not final world-unit placements**  
**Role:** First substantial free-exploration map after the revised L00 prologue sequence  
**Duration target:** 5–7 minutes on the full pass, excluding combat and lengthy dialogue  
**Existing danger level:** 1

### 3.1 Player objective and pacing

**Primary objective:** Follow the current story objective after the prologue, observe the alley, and discover the narrative clue and/or rescue location prescribed by the finalized flow. **Do not replay the L00 rescue** if it has already been resolved by the opening tutorial. The present `main` still treats `alley_crate` → `crate_event` → battle as the first rescue; resolving this clash is a required integration decision, not permission to write a new rescue plot.

Pacing sequence:
1. **Arrival / guided walk:** Learn movement through a short, legible alley section and encounter one safe inspection affordance.
2. **Opening up:** Reach a small junction with a central route and at least two optional detours.
3. **Discovery:** Optional blanket node / props; inspect scratch marks or a food container. Random travel events may occur according to backend rules.
4. **Convergence:** Reach the story objective; display distinct interactable silhouette and approach space.
5. **Payoff:** Trigger the existing authored event / narrative handoff, subject to the finalized L00 ordering.

### 3.2 Blockout — connectivity, not metric geometry

```text
                 TOP: old building / covered doorway
       +---------------- [A: blankets & stacked boxes] ---------+
       |                          event node                     |
ENTRY → G0 arrival → J junction --------------- G2 central lane → O objective / exit
       |                  |                                       |
       +----- [B: bins, puddles, scratch marks] ------+----------+
                            inspection / safe detour
                 BOTTOM: lamplight / sheltered side
```

Key spatial properties:
- Early entrance and visible destination create direction; branches provide optional rewards.
- Two detours should feel distinct: sheltered curiosity vs darker atmospheric exploration.
- Detours rejoin before the goal; avoid irreversible one-way routes in the tutorial region.
- Put at least one landmark at the junction and one at the final approach.
- Several prop clusters can contain **no interaction**; an uncluttered silhouette matters more than filling every square.
- Leave clear movement and input-prompt space around each required node; avoid stacking hotspots within the same interaction range.

### 3.3 Proposed objects and interactions

| Design ID | Object | Spatial placement | Trigger | Existing backing / condition | Persistence |
|---|---|---|---|---|---|
| `alley_entry` | Start / return spawn | Left entry | Area arrival | Map-specific local coordinate | Session checkpoint as needed |
| `alley_blanket_stack` | Moving-season old blanket | Upper optional path, beside building entrance | `INTERACT` | **Existing** `moving_blanket_event` (`node`) in events MR branch; add map interaction record | Completed node stays resolved |
| `alley_scratch_marks` | Claw scratches | Lower branch near wall | Local inspection | No authored event required initially | Optional remembered discovery |
| `alley_food_scraps_01` | Small fish/material cache | Near detour, away from mandatory entrance | Future pickup command | Use existing resource type; **no reward defined yet** | One-time |
| `alley_crate` | Cat's crate / rescue landmark | End of main route | `INTERACT` if appropriate | **Existing** map interaction ID + `crate_event`; L00 conflict must be reconciled | Story progress |
| `alley_poster` | Wet missing-cat poster | Main-route return/exit | Story-driven reveal | Existing fixed story, not random event | Flag/story state |

Random-event pool belongs to the server. For `alley` in the provided `feat/events-v12` snapshot, authored random events include `rats_grain_event`, `shadow_glimpse_event`, `feeder_bowl_event`, `trap_snap_event`, `moving_sack_event`, and conditional `wall_kitten_event`. **Do not place these as permanent fixed nodes** unless their trigger configuration changes.

### 3.4 Environment and art guidance

Reference: [visual-direction-v0.1.png](reference/visual-direction-v0.1.png). Preserve pixel readability: block-level architecture, 2–3 dominant surfaces per region, square puddle clusters, limited colors, warm lighting at navigational landmarks. The screenshot must be readable with UI/dialogue overlaid. Tall buildings are scenery/collision; the cat moves on a 2D ground plane. Keep each event prop on its own SVG layer or sprite, with a distinct interaction hit area.

**Prototype render/coordinate policy:** Use existing 800×480 logical viewport as compatibility baseline; a scrolling map may extend beyond that. Exact map width, player collider size and camera bounds must follow movement testing, not arbitrary art production. Use a zoomed nearest-neighbor pixel render or pre-rendered pixel sprites rather than complex anti-aliased SVG illustration.

### 3.5 Acceptance walkthrough

1. Enter after the **resolved** prologue handoff; do not unintentionally trigger a second tutorial battle.
2. Walk from spawn to the clear junction with no collision trapping.
3. Explore upper and lower detours; at least one has a nonmandatory inspection or existing node.
4. Approach `alley_blanket_stack`; prompt appears and `INTERACT` opens `moving_blanket_event` when eligible.
5. Travel enough to exercise `REPORT_MOVE`; eligible random events may appear; **absence of a random draw is not a test failure**.
6. Return from an event and continue where the player was, without duplicate rewards.
7. Complete the fixed narrative objective / valid battle transition; return location is correct.
8. Revisit; previously collected objects and completed nodes stay resolved.

### 3.6 Outstanding design constraints

- Existing `main` blocks all alley `INTERACT` commands after `alley_rescued`; this **must change** for optional post-rescue node access if intended.
- New pre-exploration L00 sequence can cause `alley_rescued` to be set before the first walk; story/battle state handoff needs a single owner and unique completion semantics.
- Final coordinates and collectible rewards depend on initial graybox and persistent collection command.

## 4. Night Market — three-elevation exploration

**Map ID:** `market`  
**Status:** Route and movement concept; not production geometry  
**Duration target:** 8–10 minutes in fuller exploration build  
**Existing danger level:** 2

### 4.1 Objective and identity

The night market is a dense, inhabited, food-scented environment where the cat gathers rumors and supplies on the way toward the greenhouse. Explore across street level, stalls/awnings, and rooftops. **Cat-like traversal** distinguishes this location: jumping, slipping between surfaces, climbing, looking down at activity, and finding a shortcut.

**Do not distribute a story event on every platform.** Traversal itself can be satisfying; concentrate meaningful nodes near recognizable landmarks.

### 4.2 Elevation graph

```text
L2 ROOFS:    [Roof A / optional lookout] ==== short rooftop leap === [Roof B / gated nook]
                 ^  climb                                               v down-jump
                 |                                                      |
L1 AWNINGS:   [Canopy A] ------- walkway / stall-top loop ---------- [Canopy B]
                  ^ climb                 | down-jump                    ^
                  |                       v                              |
L0 STREET: [Market entrance] -- [Main plaza] -- [Crow stall] -- [Pigeon stall] -- [back exit]
                                            \        \-- [small storeroom interior]
                                             \-- [Momo trail point near rear wall] (if story flag eligible)
```

The graph is an initial **circulation plan**. It does not promise that Rooftop B has a new quest or requires a particular companion; gated path content depends on authored flags and skill mechanics. Every critical story objective must remain reachable without optional rooftop ability unlocks unless the plot expressly demands them.

#### Elevation roles

| Elevation | Gameplay identity | Access and risk |
|---|---|---|
| L0 street | Primary interactions, stalls, clear route | Always traversable |
| L1 awnings | Frequent short jumps and side routes | Access through climbable props, forgiving jump landing |
| L2 roofs | Optional lookout and short path, low content density | Contextual climb; occasional jump with fall-to-lower-level recovery |

### 4.3 Movement and camera spike

Prototype only a tiny section: one street lane, one stall canopy, one roof, a ladder/crate stack, and two jumpable gaps.

- **Free short jump:** Space. Fixed-duration travel arc rendered visually; movement direction remains steerable within a small range. Landing is computed in the map plane against valid destination polygons.
- **Context climb:** E at a designated connection point, with brief noninteractive transition. Do not implement unrestricted realistic wall climbing.
- **Missed landing:** Fall to a legal lower platform or nearest safe checkpoint; no exploration HP penalty. Avoid long reset/loading animations.
- **Elevation state:** `layer: 0 | 1 | 2` plus `x,y`, with visual sprite offset/shadow so depth is unambiguous. Collision, event proximity and floor markers must honor layer.
- **Camera:** Follow with clamping, retain sight of intended landing area, and preserve safe UI margins.
- **Minimap:** World geometry is one map; on zoomed local map, choose layer visibility or semitransparent overlays. Fog discovery persists per region/layer.
- **Fall-through guard:** Opaque surface should never appear solid yet reject a visually plausible landing without feedback.

**Fallback:** If steerable free jumping is time-consuming or imprecise, preserve animations but resolve jump destinations using authored links, with a forgiving miss zone. This preserves cat-like movement without committing to a full platforming engine.

### 4.4 Node and event placement

| ID | Spatial role | Trigger | Existing event support |
|---|---|---|---|
| `market_crow_stall` | Ground-level commerce/rumor landmark | `INTERACT` | `crow_intel_event` |
| `market_pigeon_perch` | Distinct location on a loop | `INTERACT` | `pigeon_rumor_event` |
| `market_momo_trail` (proposed map interaction ID) | Back wall, narrow grate / green eyes clue | `INTERACT` | `momo_trail_event` in `feat/events-v12`; placement subject to story timing |
| `market_fish_scraps_01` | Accessible optional awning corner | Future pickup | Resource amount pending economy alignment |
| `market_notice` | Sign or worn poster | Local inspection | Nonrewarding atmosphere, no new story flag by default |

Random `market` events in the snapshot include `dark_meow_event`, `fish_thief_event`, and conditional `market_follower_event`. They are **server-generated during movement**, not permanent physical hotspots.

### 4.5 Spatial pacing

1. Entry establishes market scale and safe ground path; recognize a central plaza.
2. First rumor stall draws the player into the main loop.
3. An accessible crate/ladder introduces upward travel; the first upper route has a broad landing zone.
4. First optional elevated detour offers visual information or a modest collectible, then rejoins ground.
5. A second elevation link tests deliberate jumping; a failed jump falls to a safe position and does not restart the area.
6. Final story-gated exit follows existing narrative state; no new mandatory companion requirement introduced solely by this map.

### 4.6 Testable criteria

- Walk ground-loop continuously without blocked circulation or event spam.
- Reach L1 and L2; render cat in front/behind appropriate props; maintain consistent hitboxes.
- Demonstrate a valid jump and a visible, recoverable missed landing.
- Fixed nodes show the right event and do not overlap random-event popups.
- `REPORT_MOVE` counts genuine navigational distance, **not camera scrolling, idle frames, teleportation, or an authored climb transition twice**.
- Reenter from world map; finished nodes and pickups remain completed.

## 5. Other location concepts

### 5.1 Greenhouse — safe home base

- **Function:** Rest and organize supplies between story chapters, access preparation and existing home/furniture interactions, and choose the next unlocked destination.
- **Space:** Compact interior plus courtyard. Preserve existing furniture placement areas (`corner`, `window`, `courtyard`) and the current warehouse/consumables rules.
- **Safety:** No walking-triggered random danger (`dangerLevel: 0`). If exploration recovery is later added, resting may be free; it must not mint battle consumables or duplicate rewards.
- **Progression:** Environment may visibly change as the story advances, but no new upgrade or construction economy is implied.

### 5.2 Underground Tunnel — navigation under uncertainty

- **Function:** Hidden-route investigation and an atmosphere of limited visibility.
- **Route concept:** Branching passages and occasional reconnections, using lights, echoes and landmarks to prevent aimless wandering.
- **Interactions:** Define exact clues and event positions only after the chapter and event content is authored; do not invent new mandatory flags.
- **Danger:** Existing map rating is 3. The provided event branches do not yet establish a dedicated tunnel random pool.

### 5.3 Abandoned Warehouse — convergent rescue route

- **Function:** Investigate the final rescue location and reach a clearly staged objective.
- **Route concept:** Multiple approaches converge near central stacked crates or another story landmark, with side routes for inspection or rewards.
- **Visibility:** Tall shelves and crate stacks provide occlusion and visual guidance, with readable collision outlines.
- **Danger:** Existing map rating is 3; chapter-specific event placements remain pending authored narrative content.

### 5.4 Implementation boundary for later areas

Tunnel and warehouse are initially **route diagrams and grayboxes**, not commitments to finished pixel-art levels in the first demo. The Greenhouse is the recurring hub, whereas the other exploration locations are story-first and usually revisited only by choice.

## 6. Shared exploration and discovery rules

| Type | Example | Gameplay / persistence | Content owner |
|---|---|---|---|
| One-time resource pickup | Fish scraps / material / stamp | Collect once, record object ID, grant through server atomically | Map placement; existing economy rules authoritative |
| Narrative clue | Scratch marks, blanket, poster | Use authored event/flag if available, otherwise inspection-only text | Existing narrative and event definitions |
| Inspectable prop | Empty can, broken planter | Optional flavor text, no reward or server write unless required | Map module |
| Fixed event node | Rescue crate, moving blanket, market info stalls | Trigger existing `INTERACT` by stable interaction ID | Map placement + event service |
| Random encounter | Shadows, traps, cries, foraging | Trigger through `REPORT_MOVE` during travel, not permanent icons | Existing event service |
| Story-gated route | Hidden walkway | Only unlock where authored story flags actually support it; no mandatory invented companion skill | Narrative state and map geometry |

**Pickup respawn policy, first prototype:** Unique and ordinary physical pickups are one-time per saved journey. Replenishment can be added later at defined story milestones if the economy needs it; do not create a passive resource farming loop.

**Discovery map:** Use coarse `discoveryRegionId` areas for fog-of-war (persist discovered IDs), not pixel-by-pixel server writes. World map shows unlocked destinations; local map displays known surroundings and discovered markers without revealing unvisited secret paths.

### 6.1 Movement and presentation decisions

- Use React for input, HUD bridge and screen state, and SVG for authored scene geometry and hit areas. Use crisp, low-resolution pixel sprites with nearest-neighbor scaling; avoid anti-aliased, painterly SVG environments.
- Maintain a shared exploration movement controller across locations. First prototype uses ground-plane movement and simple obstacle collisions; Night Market additionally needs a discrete `layer: 0 | 1 | 2` elevation.
- Use **hybrid jumping**: controlled, short free jumps plus contextual climbs between authored connections. Missed jumps return the cat to a valid lower platform/checkpoint; no exploration HP penalty.
- Level navigation is a hybrid of one main scene and occasional small connected interiors; don't build rooms for a single inspectable object.
- Revisit unlocked maps through the world map without fixed action-point travel cost. Inter-region travel encounters are a later feature, not currently implied by movement reporting.

## 7. Technical architecture, APIs and observability

### 7.1 Current code boundaries (snapshot)

| Component | Existing implementation | Map action |
|---|---|---|
| React shell | `web/src/app/App.tsx`, `web/src/ui/GameScreen.tsx` | Mount exploration renderer behind existing HUD/dialogue; keep shared overlays |
| World route UI | `web/src/ui/WorldMap.tsx` | Preserve `GO_EXPLORE`/`GO_HOME` semantics, replace visual list after testing |
| Map content | `web/content/maps/maps.json` | Keep map IDs and `dangerLevel`; add fixed nodes by stable ID |
| Map types | `web/src/modules/map/types.ts` and `web/src/contracts/index.ts` | Extend only if shared state needs new fields |
| Exploration demo | `web/src/examples/demo/scene.ts` | Reference prior movement behavior but design new geometry and scene |
| API service | `server/internal/service/game.go` | Existing `INTERACT`, `REPORT_MOVE`, `GO_HOME`, `GO_EXPLORE` |
| Events (unmerged branches) | `feat/events-iteration-1`, `feat/events-iterations-23`, `feat/events-v12` | Reuse authored node/random triggers, `requiresFlags` and existing event outcomes |
| Combat (MR !14) | `feat/l00-main-integration` | Do not modify fixed board; preserve `START_BATTLE` / `COMPLETE_BATTLE` ownership |
| Save state | `GameState` with flags, inventory, currencies, events, placements | Add lightweight exploration persistence if needed, preserving compatibility |

### 7.2 API contract approach

Use existing commands first. Propose new commands only where the existing model cannot represent a persistent action safely:

- `INTERACT {interactionId}`: fixed node only, generated from map object ID and resolved by authoritative event system. Audit old `alley_rescued` guard to allow appropriate optional nodes.
- `REPORT_MOVE {distance}`: send validated travel distance periodically from exploration; avoid reporting world-map fast travel or fabricated distance. Preserve existing random-pool semantics.
- `GO_EXPLORE {mapId}` / `GO_HOME`: transition between unlocked locations and hub; server must validate map eligibility (current snapshot needs review) and map entry source.
- **Proposed only:** `COLLECT_MAP_OBJECT {objectId}` returns persisted state; server checks catalog ID, map, eligibility, already-collected and grants reward once. No direct inventory changes from a UI click.
- **Proposed only:** `DISCOVER_MAP_REGION {regionIds}` to record coarse fog discovery; batch updates and avoid hundreds of requests while walking. Could also be handled within existing state commands if an agreed design is cheaper.
- **Proposed only:** checkpoint/return location fields for event/battle and revisit. Player position should not be persisted every frame.

These are **draft interfaces**, not a statement that they already exist. Update `docs/openapi.json`, shared TS types, Go transport/service, data validation, and focused tests together if implemented. Keep request idempotency and `expectedRevision` behavior consistent with the main API.

### 7.3 Persistence choice

Do not create a second database service for maps. Start with the existing server-owned `GameState` and file repository, storing at most:

- `collectedObjectIds: string[]` (unique pickups)
- `discoveredRegionIds: string[]` (coarse fog)
- optional `mapCheckpoints: Record<mapId, position>` or a single return position if the game requires reentry

Use static map/prop/elevation definitions in version-controlled map content. The repository includes a MySQL migration draft storing `game_states.state_json`; no new normalized SQL table is required for the initial slice. Reconsider SQL indexing only when query/reporting requirements demand it.

### 7.4 Map data proposal (illustrative, not deployed)

```json
{
  "id": "alley",
  "worldSize": {"width": 1200, "height": 720},
  "viewport": {"width": 800, "height": 480},
  "layers": [{"id": "ground", "elevation": 0}],
  "discoveryRegions": [{"id": "alley-entry"}, {"id": "alley-upper"}, {"id": "alley-lower"}, {"id": "alley-goal"}],
  "objects": [
    {"id": "alley_blanket_stack", "kind": "event", "eventId": "moving_blanket_event", "layer": 0},
    {"id": "alley_scratch_marks", "kind": "inspect", "layer": 0}
  ]
}
```

This example intentionally omits positions, collision polygons and rewards until the blockout is approved. Do **not** paste this directly into `web/content/maps/maps.json` without extending the catalog schema and validation.

### 7.5 Integration risk: L00 / rescue ordering

The latest combat teammate note says **opening text → L00 combat tutorial → normal main game**, while the supplied `main` still uses alley crate event / battle / `alley_rescued` as its first rescue and unlock gate. Reusing both naively causes duplicate rescue, early unlocks, or an unreachable optional alley node.

Implement one consistent story/attempt lifecycle. Before shipping, test (a) first new session, (b) completed prologue entering Alley, (c) rescue/flag state, (d) entering Market, (e) returning to Alley, and (f) finished optional node interaction. The map module may implement necessary server/UI adaptations, with a concise heads-up to the narrative and combat owners; no need to delegate routine work.

### 7.6 Datadog / OTel observability

For exploration command handlers, record successful and failed **server-side** actions, not per-frame movement logs:

| Operation | Suggested metadata | Operational check |
|---|---|---|
| Enter location | map_id, phase, unlock_result | No invalid map entry |
| Fixed node interaction | interaction_id, event_id, result | No unresolved/duplicated event |
| Movement report | map_id, reported distance band, random_triggered | No enormous/excessive reports |
| Collect item | map_id, object_type, duplicate flag, award_result | Exactly-once award |
| Discover region | map_id, region_count, already_discovered | Saved fog survives reload |
| Battle return | stage_id, map_id, handoff_result | Correct return location |

Avoid player/session identity as high-cardinality metric tags. Use trace IDs for debugging and emit only necessary metrics, not every movement frame. Existing `event_random_trigger` and `event_resolve` logs from the event MR remain the event system's responsibility.

## 8. Development deliverables, integration and verification

### 8.1 What each exploration level hands off

- **Blockout:** scaled route diagram, entry/exit, walkable regions, occlusion zones, platform/elevation regions, interaction points, narrative beats, optional/critical paths, and camera bounds.
- **Data:** stable map/region/object IDs and flags; no fake `eventId` invented for backend. Coordinates in map world units, not browser pixels.
- **Prototype:** controller, reliable collisions, input prompts, camera, transitions, one-time pickups, event triggers, saving and reload behavior.
- **Visual:** low-resolution 2D pixel layer groups/sprites aligned to approved design; separate prop layers and interaction hit areas.
- **Validation:** exploration path, node choice, server random event, reload persistence, prologue/battle handoff, fixed-event completion and later revisit.

Detailed first passes: Rainy Alley (§3) and Night Market (§4). Technical handoff and APIs: §7.

### 8.2 Phased implementation plan

| Phase | Target | Definition of done |
|---|---|---|
| P0 Design | World topology, alley blockout and interaction table | All critical routes and IDs reviewed against current content |
| P0 Alley vertical slice | First illustrated, playable SVG exploration level | Walk, collide, inspect, pick up once, trigger node/random event, enter or bypass L00 according to final sequencing, save/reload |
| P0 Market traversal spike | Minimal L0/L1/L2 environment with placeholder tiles | Short jump, contextual climb, fall recovery, camera and height aware collision work reliably |
| P1 Market + hub | Complete route graph and greenhouse layout | Explore multiple elevations, return to hub, use existing inventory/home UI |
| P2 Expansion | Tunnel and warehouse | Story-confirmed encounters, routes, states and visuals |
| Continuous | Polish and observability | Map navigation clarity; request errors and duplicate awards visible in logs/traces |

**Risk order:** (1) prologue/L00 duplicate rescue conflict; (2) modifying shared state commands; (3) height projection/jump feel; (4) content-generation and unmerged MR conflicts; (5) asset production time.

**No existing game code has been modified.** This document and the separate visual reference can be copied to a feature branch for review before implementation.

### 8.3 Ownership and team heads-ups

**Map module can implement:** React/SVG map renderer, movement/collision, platform graph, camera, interactable/fog data, stable IDs, and necessary Go/API/save extensions.

**Notify only when integration contracts change:**
- Narrative/flow owner: changes to chapter transitions, rescue flags, or available locations.
- Event owner: new/renamed `interactionId`, random movement reporting changes, event return-to-explore rules.
- UI owner: mounting new view, minimap/prompt overlay interface, menu z-order.
- Battle owner: battle entry/return changes; battle board geometry remains untouched.

MR body should specify: **what changed, API/state fields, backwards compatibility, acceptance evidence, and affected teams**. Do not merge overlapping event/battle branches wholesale into our map branch.

### 8.4 Focused checks

After implementation changes: run the repository's existing `npm run check` (or its mandated subset), then one focused browser smoke flow: Alley spawn → branch → event or pickup → reload/reenter → correct completed state → valid L00/main-flow transition. For the separate Market test: climb → jump → miss → recover → minimap location. Keep evidence from the exact same build/run.

---

**Next step:** Agree on a Rainy Alley graybox layout and the single L00-to-main-story handoff. Then implement an end-to-end alley slice, with a tiny separate three-elevation Market movement test. Do not build out all five art maps before the movement and event loops work.

## 9. Rainy Alley production geometry contract

The authoritative chain is: locked graybox v0.4 → `level_design/rainy_alley/source/rainy_alley_v09.svg` gameplay geometry → approved `level_design/rainy_alley/art/rainy_alley_background.png` background → React/Go integration. Runtime movement and click-to-move use the same SVG-derived geometry through `web/src/modules/rainyAlley/runtimeGeometry.ts`; Tiled/TMJ files and their grid are not runtime authority.

The SVG-derived runtime geometry retains the reviewed western courtyard railing, claw-mark facade, eastern bridge handrail, blanket footprint, narrow passages, crate squeeze, and southeast fish-platform connector. The elevated top-right exit remains a contextual post-battle transition rather than a continuous physical walking route.

### 9.1 Random-event zone contract

The SVG source and `level_objects.json` define exactly three circular authoring zones in the 1188 × 726 graybox coordinate space:

| Stable name | Circle (x, y, radius) |
|---|---|
| `rainy_random_west` | `170, 487, 23` |
| `rainy_random_central` | `650, 510, 28` |
| `rainy_random_east` | `780, 400, 30` |

These objects define spatial eligibility only. Each zone gets one persistent attempt per journey and uses the server-configured 55% trigger probability.

### 9.2 Existing random-event compatibility

The React integration sends `CHECK_RANDOM_ZONE` with the stable `zoneId`. The Go transport admits that field and delegates to the existing service event-selection and resolution path; `REPORT_MOVE` remains the separate distance-driven path for other exploration behavior.
