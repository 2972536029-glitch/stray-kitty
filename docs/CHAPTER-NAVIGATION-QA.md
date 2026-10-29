# Integrated chapter navigation and player-flow repair

Branch: `fix/chapter-navigation-player-flow`, based on `main` at `96df703`, including the merged HomeMap/story and trap-card work. Approved map artwork, movement geometry, masks and lighting data are preserved.

Verification status: **PASS** on 2026-10-29 15:22 UTC+8: seven browser cases against one isolated application, including the connected journey and the visible Chapter 3-to-4 progression.

## Level registry

The production exploration host is `web/src/examples/demo/scene.ts`. Its directory name does not make the integrated renderers placeholders. Exploration dispatch now reads `CHAPTER_MAP_ROUTES` through `explorationScene()`; narrative previews cannot override an exploration destination.

| Chapter | Chapter ID | Map ID | Actual renderer | PNG/SVG assets and spatial data | Result |
|---|---|---|---|---|---|
| 1 — Rainy Alley | `alley` | `alley` | `modules/rainyAlley/IntegratedRainyAlley.ts` | `level_design/rainy_alley/art/rainy_alley_background.png`; authored `source/rainy_alley_v09.svg`, compiled `source/geometry.json` and `source/level_objects.json`; foreground `art/doorway_foreground.svg` | Integrated runtime; spawn `(111,626)` |
| 2 — Night Market | `market` | `market` | `DemoScene.drawMarket()`, `modules/nightMarket/map.ts`, `MarketTransitionController` | `web/public/assets/night-market/night_market_L0_streets_1672x941.png`, `night_market_L1_rooftops_1672x941.png`, `night_market_Lminus1_tunnel_1672x941.png`; `specs/night-market/night_market_v016_spatial_reference.json` | Integrated three-floor runtime; initial L0 spawn `(670,781)`; cleared battle return uses the authored boss approach |
| 3 — Greenhouse | `greenhouse` | `greenhouse` | Directed Home narrative / `homeStoryBeat()` / `paintHomestead()`; `modules/battle/greenhouse/GreenhouseBattleViewport.tsx` for defense | Shared `modules/home/layout.ts`, `painter.ts`, `story.ts`; existing generated battle geometry in `greenhouse/config.ts` and floor atlas | Story, staged Momo arrival and defense preserved; no independent exploration runtime |
| 4 — Underground Tunnel | `rescue` | `tunnel` | `modules/chapter4/TunnelMap.ts` | `level_design/chapter4/art/chapter4_L0_approved.png`, `chapter4_Lminus1_tunnel_v11.png`; matching `collision/chapter4_L0_walkable.png`, `chapter4_Lminus1_walkable.png`; `data/chapter4.map.json`, `data/chapter4.lighting.json`; `reference/chapter4_anchor_overlay.svg` is a reference annotation | Integrated L0/L−1 runtime; spawn `(845,135)`; approved collision and lighting preserved |
| 5 — Warehouse / Finale | `finale` | Catalog: `warehouse`; current story: `greenhouse` | Existing `drawTunnel()` narrative preview / Home ending; `modules/battle/finale/FinaleBattleViewport.tsx` for independent battle | Existing generated warehouse geometry in `finale/config.ts`, deterministic scenery and floor atlas | Story, ending and battle preserved; warehouse exploration remains unimplemented |
| Home / base | Progress-dependent | `greenhouse` | `paintHomestead()` + HomePanel + `ui/HomeMap.tsx` | Shared `greenhouse-homestead-v1` layout, generated scenery, furniture and directed/free cats | HomeMap and live Home use the same layout; panel collapse, map freeze, story skip and legitimate returns verified |
| Unknown / unavailable exploration ID | — | Unknown, `greenhouse`, `warehouse` | No exploration renderer | No fallback to another chapter | Server rejects `MAP_UNAVAILABLE`; unknown explore state displays an unavailable scene |

Spatial-source clarification: Alley executes SVG-derived geometry, rather than mounting an SVG DOM element. Market's merged executable spatial source is the v016 JSON; a standalone Night Market SVG is not tracked. Tunnel's approved handoff explicitly makes the two raster masks authoritative and forbids its obsolete SVG collision draft. The SVG overlay is an annotation, not collision. See `level_design/chapter4/README.md`. No approved artwork, movement collision geometry, masks, lighting data or level coordinates were changed. The new non-blocking Market exit trigger uses the existing server-approved exit bounds.

The narrative reference available in this checkout is `docs/GAME-FLOWCHART.md`; no `GAME-FLOWCHART(4).md` exists here. Later merged Market and Tunnel decisions take precedence, including the physical Market exit and Tunnel's authored D/F/G sequence.

## Confirmed root causes

1. `GO_EXPLORE` changed phase/map but retained `chapterId`, an old story node and terminal battle state. A retained Tunnel story scene took precedence over Market drawing and could display the old narrative preview.
2. Map unlock conditions disagreed with server gates. Chapter 3/5 map selections were permanently excluded even though their existing stories were playable.
3. Home lacked clearly separated exploration trials. Chapter 1/3/4/5 battle entries used ambiguous chapter-trial labels.
4. Chapter 3 and finale actions appeared before their required progression; finale story entry also lacked the corresponding server guard.
5. Shared failed-encounter dialogue always exited into rescue preparation. Ordinary random encounters could strand an Alley player before crate discovery and overwrite the current chapter. Those exits now preserve the originating map/chapter and resume exploration; the crate and Market intel events retain preparation.
6. Tunnel `Space` connectors compared the authored word `Space` with the keyboard character ` `, so jumps could not activate. Reverse same-floor connectors selected the wrong endpoint. The G encounter submitted the previous frame's position, which could be outside the server's validated trigger region. Quick E taps could also be cleared on keyup before the next frame consumed them. Key normalization, endpoint selection, position publication order and immediate E handling are fixed without changing geometry.
7. Market/Tunnel mainline settlement buttons said “return home” while actually resuming exploration/rescue dialogue. Their labels now match the existing transitions. An impossible Market preparation return has been replaced with the authored exit explanation.
8. `EXIT_MARKET` was missing from the frontend controller's phase whitelist. After that was corrected, the HTTP validator still treated its required `position` object as a string and rejected valid coordinates. The command is now admitted during exploration and the HTTP boundary validates numeric `{x,y}` coordinates. A real HTTP regression covers malformed and valid payloads.
9. The browser harness needed valid fixture tokens, completed session initialization, drained API output pipes and movement steps checked with the production swept-movement functions, rather than destination-point legality alone. It now uses authored C/F/Space links and real keyboard input, with no teleports or geometry edits.

The merged HomeMap/story implementation is retained: its shared homestead painter, directed story cats, Momo's pre-recruitment entrance, Home panel collapse/reopen controls and visible story-skip button remain connected. The trap-card upgrade and its generated catalogs/tier-text lint are also retained.

10. The Market exit was tied only to the final C-animation callback and returned to Home without starting Chapter 3. The requested spatial trigger now detects arrival in the exit volume during normal scene updates; the server atomically records the crossing and starts `greenhouse_intro_1`.

## Navigation

Trace: visible button -> HomePanel/WorldMap/GameScreen handler -> chapter command helper -> GameController phase validation -> HttpGameApi -> Go HTTP validation/service -> GameState -> Viewport -> scene registry -> integrated renderer. Exploration uses `GO_EXPLORE` with `{mapId}`; story uses `START_STORY` with `{nodeId}`; battle trials use `START_BATTLE` with `{stageId}`; return uses `GO_HOME`; settlements use `CONTINUE`. The physical Market exit uses `EXIT_MARKET` with `{layer:'L0', position:{x,y}}` after the final authored C climb.

Identically captioned Home and WorldMap controls were clicked separately; duplicate caption/destination pairs share one table row.

Art keys A/M/T refer to the exact paths in the registry above. B means the existing generated battle configuration plus floor atlas; H means the existing Home scene. Story-only entries do not claim an exploration renderer.

| Button | Previous behavior | Intended destination | Actual scene | PNG/SVG assets | Game state / browser result |
|---|---|---|---|---|---|
| 进入第一章试玩 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 进入第二章试玩 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | market | night-market | M: three PNG floors + v016 spatial JSON | PASS: explore / market / market; no active battle |
| 进入第四章试玩 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | tunnel | chapter4-tunnel | T: approved PNG floors + masks/map/lighting JSON | PASS: explore / rescue / tunnel; no active battle |
| 再去小巷走走 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 前往午夜集市 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | market | night-market | M: three PNG floors + v016 spatial JSON | PASS: explore / market / market; no active battle |
| 前往地下暗道 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | tunnel | chapter4-tunnel | T: approved PNG floors + masks/map/lighting JSON | PASS: explore / rescue / tunnel; no active battle |
| 前往雨后小巷 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 前往地下通道 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | tunnel | chapter4-tunnel | T: approved PNG floors + masks/map/lighting JSON | PASS: explore / rescue / tunnel; no active battle |
| 重温第一章剧情 | Existing story entry; route availability or stale state could be inconsistent. | chapter1_intro | DialoguePanel / chapter1_intro | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 重温第二章剧情 | Existing story entry; route availability or stale state could be inconsistent. | market_intro_1 | DialoguePanel / market_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 重温第三章剧情 | Existing story entry; route availability or stale state could be inconsistent. | greenhouse_intro_1 | DialoguePanel / greenhouse_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 重温第四章剧情 | Existing story entry; route availability or stale state could be inconsistent. | rescue_intro_1 | DialoguePanel / rescue_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 启程：第二章 | Existing story entry; route availability or stale state could be inconsistent. | market_intro_1 | DialoguePanel / market_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 启程：第三章 | Existing story entry; route availability or stale state could be inconsistent. | greenhouse_intro_1 | DialoguePanel / greenhouse_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 启程：第四章 | Existing story entry; route availability or stale state could be inconsistent. | rescue_intro_1 | DialoguePanel / rescue_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 启程：终章 | Existing story entry; route availability or stale state could be inconsistent. | finale_intro_1 | DialoguePanel / finale_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 重温终章大结局 | Existing story entry; route availability or stale state could be inconsistent. | finale_intro_1 | DialoguePanel / finale_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 进入第三章剧情 | Existing story entry; route availability or stale state could be inconsistent. | greenhouse_intro_1 | DialoguePanel / greenhouse_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 进入第五章剧情 | Existing story entry; route availability or stale state could be inconsistent. | finale_intro_1 | DialoguePanel / finale_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 前往废弃花房剧情 | Existing story entry; route availability or stale state could be inconsistent. | greenhouse_intro_1 | DialoguePanel / greenhouse_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 前往废弃仓库剧情 | Existing story entry; route availability or stale state could be inconsistent. | finale_intro_1 | DialoguePanel / finale_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 直达雨巷 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 直达午夜集市 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | market | night-market | M: three PNG floors + v016 spatial JSON | PASS: explore / market / market; no active battle |
| 开启第二章剧情 | Existing story entry; route availability or stale state could be inconsistent. | market_intro_1 | DialoguePanel / market_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 验收 / 跳过本段对话 (market_intro_1) | Existing behavior preserved; label and destination verified. | market exploration | market exploration | Existing chapter content | PASS: market exploration |
| 开启终章剧情 | Existing story entry; route availability or stale state could be inconsistent. | finale_intro_1 | DialoguePanel / finale_intro_1 | Existing story backdrop (A/M/T/H, as applicable) | PASS: expected story node observed; no unintended battle |
| 验收 / 跳过本段对话 (finale_intro_1) | Existing behavior preserved; label and destination verified. | home ending | home ending | Existing chapter content | PASS: home ending |
| 开始第一章战斗试玩 | Battle trial existed; chapter-only labels were ambiguous (Market was already explicit). | alley_boss | BattleHost / alley_boss -> Home | B -> H | PASS: correct stage; QA completion and real settlement return |
| 开始集市防线战斗试玩 | Battle trial existed; chapter-only labels were ambiguous (Market was already explicit). | market_boss | BattleHost / market_boss -> Home | B -> H | PASS: correct stage; QA completion and real settlement return |
| 开始第三章战斗试玩 | Battle trial existed; chapter-only labels were ambiguous (Market was already explicit). | greenhouse_boss | BattleHost / greenhouse_boss -> Home | B -> H | PASS: correct stage; QA completion and real settlement return |
| 开始第四章战斗试玩 | Battle trial existed; chapter-only labels were ambiguous (Market was already explicit). | tunnel_boss | BattleHost / tunnel_boss -> Home | B -> H | PASS: correct stage; QA completion and real settlement return |
| 开始第五章战斗试玩 | Battle trial existed; chapter-only labels were ambiguous (Market was already explicit). | finale_boss | BattleHost / finale_boss -> Home | B -> H | PASS: correct stage; QA completion and real settlement return |
| 关闭猫爪地图 | Existing behavior preserved. | same saved state | Map overlay / Title / Home | Existing backdrop preserved | PASS: saved state unchanged |
| 返回标题 | Existing behavior preserved. | same saved state | Map overlay / Title / Home | Existing backdrop preserved | PASS: saved state unchanged |
| 继续冒险 | Existing behavior preserved. | same saved state | Map overlay / Title / Home | Existing backdrop preserved | PASS: saved state unchanged |
| 标题 / 重新开始（重置为新存档） | Existing explicit new-journey behavior preserved. | new isolated prologue session | StartScreen | Existing title artwork | PASS: new isolated session at prologue_1 |
| 继续故事 | Existing story/tutorial exit; the connected UI regression verifies the destination. | market | night-market | M: three PNG floors + v016 spatial JSON | PASS: explore / market / market; no active battle |
| 回集市收集线索 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | market | night-market | M: three PNG floors + v016 spatial JSON | PASS: explore / market / market; no active battle |
| 带着收获继续探索集市 | Old GO_EXPLORE could retain another chapter/story/battle; dedicated exploration trials were missing. | market | night-market | M: three PNG floors + v016 spatial JSON | PASS: explore / market / market; no active battle |
| 调整防线，再试一次 (2章) | Existing retry path; now included in the real UI sweep. | preparation | Chapter loadout | B / H | PASS: lost settlement -> preparation |
| 返回家园 (2章失败准备页) | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 调整防线，再试一次 (3章) | Existing retry path; now included in the real UI sweep. | preparation | Chapter loadout | B / H | PASS: lost settlement -> preparation |
| 返回家园 (3章失败准备页) | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 调整防线，再试一次 (4章) | Existing retry path; now included in the real UI sweep. | preparation | Chapter loadout | B / H | PASS: lost settlement -> preparation |
| 返回家园 (4章失败准备页) | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 调整防线，再试一次 (5章) | Existing retry path; now included in the real UI sweep. | preparation | Chapter loadout | B / H | PASS: lost settlement -> preparation |
| 返回家园 (5章失败准备页) | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 第一章失败 / 调整防线，再试一次 / 开始第一章战斗试玩 | Existing behavior preserved; label and destination verified. | alley_rescue retry → home | alley_rescue retry → home | Existing chapter content | PASS: alley_rescue retry → home |
| 重新开始教学 / 进入雨夜小巷 | Existing story/tutorial exit; the connected UI regression verifies the destination. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 回到花房 (alley) | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 回到花房 (tunnel) | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 验收 / 直达花房 | Existing return path; terminal battle state is now cleared consistently. | home | HomePanel | H | PASS: home; battle cleared; legitimate flags retained |
| 随机遭遇失败 / 继续故事 | Shared failed-encounter dialogue incorrectly entered rescue preparation and could overwrite the originating chapter. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 验收 / 重置为新存档 | Existing explicit new-journey behavior preserved. | new isolated prologue session | StartScreen | Existing title artwork | PASS: new isolated session at prologue_1 |
| 继续故事 | Existing story/tutorial exit; the connected UI regression verifies the destination. | alley | rainy-alley | A: approved PNG + SVG-derived geometry | PASS: explore / alley / alley; no active battle |
| 继续故事 | Existing story/tutorial exit; the connected UI regression verifies the destination. | tunnel | chapter4-tunnel | T: approved PNG floors + masks/map/lighting JSON | PASS: explore / rescue / tunnel; no active battle |
| 跳过剧情（第三章） | Existing behavior preserved; label and destination verified. | Momo recruited; home free mode | Momo recruited; home free mode | Existing chapter content | PASS: Momo recruited; home free mode |
| 收起家园面板 / 整理家园 / 家园地图 / 关闭猫爪地图 | Existing behavior preserved; label and destination verified. | same home layout and saved state; clock resumes | same home layout and saved state; clock resumes | Existing chapter content | PASS: same home layout and saved state; clock resumes |
| 开始冒险 | Existing transition preserved or accurately relabeled. | prologue dialogue | StartScreen -> DialoguePanel | See registry | PASS: fresh connected journey starts from prologue |
| 进入雨夜小巷 | Existing transition preserved or accurately relabeled. | chapter1_intro -> alley/explore | IntegratedRainyAlley | See registry | PASS: tutorial settlement -> Chapter 1 |
| 带伙伴回家 | Existing transition preserved or accurately relabeled. | rescue_1 -> physical poster -> Home | Alley -> HomePanel | See registry | PASS: rescue continuation preserves the authored poster requirement |
| 继续探索集市 | Existing transition preserved or accurately relabeled. | market/explore after mainline victory | Night Market | See registry | PASS: market_cleared; no unrelated active battle |
| 继续救援故事 | Existing transition preserved or accurately relabeled. | rescue_intro_10 -> Home | DialoguePanel -> HomePanel | See registry | PASS: tunnel completion and rescued-batch flags |
| 继续故事（终章） | Existing transition preserved or accurately relabeled. | existing finale -> ending | Existing narrative -> HomePanel | See registry | PASS: finale_completed and kingdom_founded |
| North exit trigger / 北街出口 | Only the C-animation callback submitted exit; Home still required a separate Chapter 3 click. | Chapter 3 story in existing Greenhouse/Home scene | home / greenhouse_intro_1 | H: shared homestead renderer | PASS: dialogue / greenhouse / greenhouse; market_exit_crossed + chapter_3_started; exactly one EXIT_MARKET request |
| 继续第三章：守住花房防线 | Required defense was buried among trial cards after the dialogue, making Chapter 4 appear inaccessible. | greenhouse_boss, then a visible Chapter 4 story entry after victory | GreenhouseBattleViewport -> Home mainline card -> actual TunnelMap | B -> H -> T | PASS: primary action visible on desktop/phone; defense victory unlocks visible Chapter 4 entry; reload preserves it; real Chapter 4 dialogue and Tunnel movement pass |

## Connected player flow

| Stage | Trigger | Required state | Actual transition | Result |
|---|---|---|---|---|
| Prologue → Chapter 1 | continue tutorial settlement and chapter introduction | l00_completed; alley/explore | alley / alley / explore | PASS |
| Crate → rescue battle | walk authored route, E, 2d6, start defense | alley_rescue active | alley / alley / battle / alley_rescue | PASS |
| Rescue → poster → Home | settlement, rescue story, C climb and E at poster | diandian; alley_rescued; lost_poster_found; rescue_story_done | alley / greenhouse / home | PASS |
| Home → Market | Chapter 2 story button and continue dialogue | market_intro_1 → market/explore; no battle | market / market / explore | PASS |
| Market floors, clues and R1/R2/R3 | real C/F links, E at crow and pigeon, 2d6 | L0/L1/Lm1 artwork; both clue flags; successful R1/R2/R3 responses | market / market / explore | PASS |
| Market boss → exploration | E at authored boss, QA battle completion, settlement continue | mainline market_boss; market_cleared; explore | market / market / explore | PASS |
| Market → Chapter 3 automatically | cross the north exit trigger after the final C climb | market_exit_crossed; chapter_3_started; greenhouse_intro_1 | greenhouse / greenhouse / dialogue / greenhouse_intro_1 | PASS |
| Chapter 3 → Chapter 4 unlock | greenhouse narrative, Momo recruitment, visible primary defense action | momo_joined; greenhouse_fortified | greenhouse / greenhouse / home | PASS |
| Tunnel floors, trap and valve | E at authored trap/valve, F connectors, 2d6 | tunnel_false_kitten_trap_found; valve_three_investigated | rescue / tunnel / explore | PASS |
| Tunnel battle → rescue completion → Home | authored G region, QA battle completion, continue rescue_intro_10 | tunnel_boss_cleared; tunnel_explored; cats_rescued_batch1 | rescue / greenhouse / home | PASS |
| Finale story → Ending | existing Chapter 5 narrative, continue all ending nodes | finale_completed; kingdom_founded; home | finale / greenhouse / home | PASS |
| Market exit HTTP regression | physical C climb from cleared Market fixture | EXIT_MARKET accepted as object position; Chapter 3 story in Home scene | greenhouse / greenhouse / dialogue / greenhouse_intro_1 | PASS |
| Tunnel G HTTP regression | walk into authored G region and continue settlement | current position accepted; rescue_intro_10; home | rescue / greenhouse / home | PASS |
| QA Chapter 2 → north exit → Chapter 3 | QA story entry, real boss entry/settlement, north exit trigger automatically starts Chapter 3 | market_cleared; market_exit_crossed; greenhouse_intro_1 | greenhouse / greenhouse / dialogue / greenhouse_intro_1 | PASS |
| Chapter 3 visible next step → Chapter 4 | finish Chapter 3 dialogue, primary defense action, QA victory, top Chapter 4 entry | greenhouse_fortified; rescue_intro_1 → actual TunnelMap | rescue / tunnel / explore | PASS |

Battle duration is shortened through the visible, server-gated QA victory control. Every battle entry, settlement control, story continuation and chapter transition is exercised in the actual UI. This suite verifies navigation and progression, not a fresh balancing or combat-strategy acceptance of every wave.

## Remaining Chapter 3/5 scope

- Chapter 3 has implemented Home narrative, Momo recruitment and a working generated defense battle. Its existing defense victory sets `greenhouse_fortified` and unlocks Chapter 4. There is no separate Greenhouse exploration map to mount.
- Chapter 5 has implemented narrative, the Home ending and a working generated independent warehouse battle. The story does not launch that battle; a future narrative-to-battle hook and independent warehouse exploration runtime are still absent. Neither connection was fabricated.
- WorldMap and Home now identify these destinations as story/battle content and explicitly state that exploration is unavailable.

## Market exit and Chapter 3-to-4 progression

The non-blocking north exit trigger covers L0 x=1317..1413, y=40..136, matching the existing server exit bounds beyond the final crate. It requires `market_cleared`. The authored C climb and all movement collision remain unchanged. Normal frame updates detect the trigger after walking or a completed climb; an entry latch prevents duplicate requests. The QA collision overlay outlines the trigger.

`EXIT_MARKET` records `market_exit_crossed` and starts `greenhouse_intro_1` atomically through the existing story-entry handler. Chapter 3 uses the shared Greenhouse/Home scene. After its dialogue recruits Momo, Home displays a primary Greenhouse defense action at the top. Defense victory sets `greenhouse_fortified`; the same location then offers Chapter 4 story entry or Tunnel exploration/replay. No extra Home click is needed after leaving the Market, and no furniture-panel scrolling is needed to find the Chapter 3 defense or Chapter 4 entry.

## Random-event deadlock regression

The shared situation dialogue exit resumes the originating exploration map for ordinary random events while preserving preparation for crate/intel missions. Deterministic Go regressions resolve `moving_sack_event/rush_untie` and `dark_meow_event/follow_voice` with dice `[1,1]`, finish every dialogue node and require `explore`. The Alley case then discovers the real crate, resolves it, reaches preparation and starts `alley_rescue`. Premature battle/Home access stays locked, so this fixes the deadlock without granting unearned progress.

Saves already persisted in an invalid preparation state by the old deployment are not automatically migrated by this change.

## Verification

The browser suite ran all seven cases in one worker against one temporary API/static application. The connected journey starts with a new anonymous session; navigation and long-prerequisite cases use isolated fixtures. Battles are shortened through the visible server-gated QA victory control, so these checks validate navigation and progression rather than combat balance.

| Browser case | Result |
|---|---|
| A: registry mounts integrated Alley, Market and Tunnel, loads artwork and moves | PASSED (7.1s) |
| B: every available Home, map, trial, story, replay and development chapter control | PASSED (75.5s) |
| C: connected normal journey through implemented exploration, story and completion transitions | PASSED (328.3s) |
| D: physical Market exit and automatic Tunnel encounter cross the real HTTP boundary | PASSED (31.4s) |
| E: merged HomeMap, directed Momo story and home navigation remain connected | PASSED (7.5s) |
| F: QA Chapter 2 story entry can finish its battle, leave the Market and start Chapter 3 | PASSED (33.7s) |
| G: Chapter 3 shows its required defense and Chapter 4 entry without scrolling | PASSED (7.3s) |

| Additional check | Result |
|---|---|
| TypeScript tests (normal suite plus focused navigation/map tests) | 570 passed |
| `go -C server test ./...` | PASS |
| `go -C server vet ./...` | PASS |
| TypeScript typecheck | PASS |
| Content catalog validation | PASS |
| Architecture check | PASS |
| Production build | PASS; existing large-chunk advisory remains |
| `git diff --check` | PASS |
| OpenAPI specification and generated content schema | PASS; used the declared validator versions in an ignored isolated install because this checkout's package payload was incomplete |

## Reproduction and artifacts

Run `npm run test:player-flow` after installing the declared dependencies and Playwright Chromium. The script checks content and types, builds the E2E client, builds an isolated Go API, then runs all cases. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing Chromium executable.

The suite writes route/state/painted-image records to `output/player-flow/navigation.json`, Playwright results to `output/player-flow/results.json`, and screenshots alongside them. These generated artifacts remain ignored rather than committed. The test API uses port 8179 and a temporary save file; it stops after the suite and does not modify the user's save or browser profile. Separately running manual development sessions are left untouched.

## Changed-file groups

- Navigation/state: `web/src/core/chapter-navigation.ts`, flow permissions, command helpers, App story binding and Go story/exploration transitions.
- UI: Home progression and trials, WorldMap availability/current-location labels, settlement/retry text and explicit battle-trial labels.
- Market: spatial exit trigger, normal-frame detection and typed HTTP position validation.
- Chapter 4: authored Space-key normalization, reverse connector selection, immediate E interactions and current-position publication for G battle entry.
- Regression coverage: integrated Playwright suite/config/runner, navigation and map unit tests, deterministic service tests, HTTP boundary tests and aligned progression fixtures.

No dependency versions, lockfile, approved level assets, persistent saves or unrelated local files are included in this change.
