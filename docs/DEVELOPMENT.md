# Development and release workflow

## Merge, deploy, and verify online

For changes intended for the shared preview, follow the complete release flow:

1. Work on a feature or fix branch, run the checks appropriate to the change, and merge through a merge request into `main`.
2. Open the [GitLab pipelines](https://school-gitlab.xsolla.dev/haozhe_wang/stray-kitty/-/pipelines) and select the pipeline for the intended `main` merge commit. Wait for `web_checks`, `server_checks`, `server_build`, and `deploy_images` to succeed. The images for frontend, game, and payment are built automatically.
3. Click **▶ `deploy_apply`** in that same pipeline. This is a required manual step: merging to `main` prepares the release but does not update the live site. A pipeline waiting at this step may show `manual` or `blocked`. Coordinate with the team so only one deployment runs against the shared preview at a time.
4. Wait for `deploy_apply` to succeed. Its log must confirm all three service rollouts, payment readiness, and the public health check. Release records are available in the job's artifacts for one month.
5. Open [Stray Kitty online](https://starry-kitty.duckdns.org/), confirm the [health check](https://starry-kitty.duckdns.org/healthz) returns `ok`, and smoke-test the changed player flow. The public health check covers frontend nginx only; it does not replace API, payment, or gameplay verification. Hard-refresh if the browser still shows the previous UI.
6. Report the deployed commit, deployment job link, live-site link, and verification result. Treat the change as released only after deployment and online verification finish; report a pending or failed deployment explicitly.

See the [deployment guide](../deploy/team-preview-haozhe/README.md) and [release checklist](../deploy/team-preview-haozhe/RELEASE_CHECKLIST.md) for detailed checks and recovery instructions.

## Worktree layout

The Chapter 2 and Chapter 4 branches use separate Git worktrees and separate working trees. Both use the default frontend port `127.0.0.1:5017` and API port `127.0.0.1:8017`, so run only one worktree's development server at a time. The current Chapter 4 branch stores its local game state in that worktree's ignored `.runtime/game.json`. An explicit `GAME_DATA_FILE` environment variable overrides this path. Do not copy or merge save files between worktrees.

## Start, switch, and stop

From the worktree you want to run:

1. Stop the current server with `Ctrl+C` in the terminal that ran `npm run dev`.
2. Wait for the launcher to report shutdown and confirm ports 5017 and 8017 are free.
3. Change directory to the intended worktree.
4. Run `npm run dev` in one terminal. This launcher owns the frontend and API children for the full session.
5. Wait for Vite's ready message and the API's `stray-kitty ready` log; open `http://127.0.0.1:5017`.

On Windows, inspect port owners from PowerShell:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5017,8017 |
  ForEach-Object {
    $listener = $_
    Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" |
      Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
  }
```

The launcher performs the same owner check before starting. If a port is occupied, it reports the process ID, parent, executable, and command line, then exits without terminating that process. Stop it only after confirming it belongs to the development session you intend to close.

## Browser regression recordings

Run the full browser suite with `npm run test:e2e`, keeping its default single worker: legacy fixtures still share fixed server ports. The L03 fixture has a separate server port and save per worker, so its three difficulty cases can be checked twice with three concurrent workers:

```sh
npm run test:e2e -- tests/e2e/l03-greenhouse.spec.ts --grep "L03 (low|medium|high):" --fully-parallel --workers=3 --repeat-each=2
```

Install Playwright's FFmpeg with `npx playwright install ffmpeg` when using a separately installed browser. Keep `PLAYWRIGHT_BROWSERS_PATH` consistent between installation and test execution if you use a custom browser cache.

The five chapter suites (`l01-chapter` through `l05-finale`) use the shared `battleRecording` options with Playwright's managed `page` fixture. Each run records action/assertion history, DOM snapshots, network activity and source files in a trace, plus an 800×610, 10 fps WebM video. Only these suites replace continuous JPEG trace screenshots with video: long canvas battles can otherwise generate thousands of separate images to write and archive. Other suites retain the default trace screenshots, including tests that create browser contexts manually. Failed runs retain their trace, any recorded video and a full-size failure screenshot. Set `KITTY_E2E_KEEP_ARTIFACTS=1` to retain successful traces and chapter videos as well when checking recording integrity or sharing regression evidence. This affects artifact retention only; test timeouts and retries are unchanged.

Keep the test worktree unchanged until the Playwright process has exited, including context teardown and artifact packaging. Source files are read again when the trace is archived; editing them during that interval can make the recorded source disagree with the executed test and can race ZIP size checks. Make further fixes in another worktree or wait for the run to finish. When changing recording settings, verify both a successful run and a controlled failure: the ZIP must open in Trace Viewer, the video must play, and teardown must finish without artifact errors.

## Runtime files and safe cleanup

- `.runtime/game.json` is persistent Chapter 4 game state. Keep it when rebuilding or cleaning generated files.
- Browser tokens and pending commands live in `localStorage` for the current site origin. If a token is sent to a different worktree's backend and receives `UNAUTHORIZED`, retrying preserves it. The explicit new-journey action archives that session and pending command locally before creating a new session. Return to the worktree that owns the save to reconnect to its existing state.
- `.runtime/kitty-api.exe` and `.runtime/kitty-preview.exe` are reproducible build outputs. Never remove a binary while its process is running; the launcher rebuilds its API executable on the next start.
- `.runtime` may also contain browser captures, test inputs, logs, and other recovery evidence. Inspect before deleting. Do not use `git clean -fdx` or remove `.runtime` recursively.
- `test-results/` and `output/` may contain useful failure evidence. Preserve them unless a specific artifact is confirmed disposable.

The launcher does not load `.env` automatically. Set optional overrides in the launching shell. Keep each worktree's backend pointed at its own persistent data file; do not combine Chapter 2 and Chapter 4 state.
