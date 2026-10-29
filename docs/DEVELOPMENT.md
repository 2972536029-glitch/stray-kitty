# Local development and worktrees

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

## Runtime files and safe cleanup

- `.runtime/game.json` is persistent Chapter 4 game state. Keep it when rebuilding or cleaning generated files.
- Browser tokens and pending commands live in `localStorage` for the current site origin. If a token is sent to a different worktree's backend and receives `UNAUTHORIZED`, retrying preserves it. The explicit new-journey action archives that session and pending command locally before creating a new session. Return to the worktree that owns the save to reconnect to its existing state.
- `.runtime/kitty-api.exe` and `.runtime/kitty-preview.exe` are reproducible build outputs. Never remove a binary while its process is running; the launcher rebuilds its API executable on the next start.
- `.runtime` may also contain browser captures, test inputs, logs, and other recovery evidence. Inspect before deleting. Do not use `git clean -fdx` or remove `.runtime` recursively.
- `test-results/` and `output/` may contain useful failure evidence. Preserve them unless a specific artifact is confirmed disposable.

The launcher does not load `.env` automatically. Set optional overrides in the launching shell. Keep each worktree's backend pointed at its own persistent data file; do not combine Chapter 2 and Chapter 4 state.
