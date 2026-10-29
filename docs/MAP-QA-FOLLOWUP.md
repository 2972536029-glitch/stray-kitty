# Map QA follow-up

This branch addresses the remaining findings from the teammate report based on `96df703`. It starts from `main` at `d82a37a` and is independent of Chapter 5 MR !79. No map artwork, geometry, event cards, rewards or user saves are changed.

- **TUN-001:** a failed tunnel mainline attempt retains its mainline identity when retried from preparation. The first attempt still requires the authored boss location; retry uses the persisted failed attempt and difficulty. Victory sets `tunnel_boss_cleared` and Continue reaches `rescue_intro_10`. Home trials remain independent.
- **NM-01:** prompts, footer buttons and keyboard E share `marketInteractionTarget`. The nearest unfinished event is selected consistently, including the reported Momo/crow overlap. Floor, completion and nearby portal rules remain in effect.
- **Session recovery:** an unavailable token causes initialization to report the error without clearing credentials or the pending command. The existing explicit fresh-journey action archives the old session before creating a replacement.
- **Older RAINY-001 saves:** preparation without crate discovery offers a normal return-to-exploration button instead of an impossible rescue start. It uses the existing `GO_EXPLORE(alley)` command and preserves the crate/battle gate.

Space jumps, reverse C climbing and newly resolved Chapter 1 failures were already fixed in the merged navigation changes; those map systems are not changed here.

## Validation

- Focused Go tests passed: mainline tunnel retry after two losses and store reopen, authored Chapter 4 flow, and independent home tunnel trials.
- Three focused frontend tests passed: Market target consistency and both session recovery cases. The Market and session regression files are included in the standard test command.
- The existing 27 Market map/portal/camera tests passed.
- TypeScript, production Vite build, content/architecture consistency and whitespace checks passed. The existing large-bundle warning remains.
- One browser smoke against a separate test API/save verified old Chapter 1 preparation recovery, the Momo prompt followed by a real E key opening `momo_trail_event`, and retained credentials/pending state after a 401. No page exceptions occurred. Fixture positions/storage were test-only; no full chapter traversal was claimed.
- No full suite or full battle playthrough was repeated.

## Local review

The isolated review session is at `http://127.0.0.1:5187/`, with API port 8187 and save `.runtime/map-qa-game.json` in the separate `stray-kitty-map-qa` worktree. Existing Chapter 5 previews remain on their own ports and save. The ordinary acceptance panel can select chapter checkpoints for manual checks. The browser smoke used separate synthetic sessions; it did not modify real player records.
