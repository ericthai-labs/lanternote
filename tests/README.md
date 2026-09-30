# Tests

UI scenarios drive the running app through the DevTools protocol (`scripts/drive.js`) and print `PASS` / `FAIL` for every step.
Always run them on **throw-away folders**, never on real notes — they create, rename and delete files.

## Run everything

```bash
node tests/mcp.js        # AI connection (MCP), 35 checks, no window needed
node tests/index-cache.js # index cache survives closing during a slow open, 3 checks, no window needed
node tests/run-all.js    # every UI scenario below, on fresh folders in the temp directory
```

`node tests/run-all.js "<path to Lanternote.exe>"` tests a packaged build; `ONLY=editing.js,kanban.js node tests/run-all.js` runs a few.
On Linux without a display, use `xvfb-run -a node tests/run-all.js`. CI runs both commands on Windows, macOS and Linux; all three must pass before anything is built.

## Scenarios

| Scenario | Folder it needs | Command |
|---|---|---|
| `editing.js` (18 steps) | `Home.md` (links `[[A]]`, `[[Missing]]`, `[md](sub/B.md)`, two tasks), `A.md`, `sub/B.md` (links `[[A\|alias]]`, `![[A#A]]`) | `TV=<folder> node scripts/drive.js <folder> tests/editing.js` |
| `settings.js` (7 steps) | as above plus `Archive/Old.md` | `TV=<folder> node scripts/drive.js <folder> tests/settings.js` |
| `guide-about.js` (6 steps) | any folder with `Home.md` | `node scripts/drive.js <folder> tests/guide-about.js` |
| `image-viewer.js` (10 steps) | `Home.md` embedding `![[sunset.png\|400]]` and `![[logo.svg]]`; `pics/` with sunset.png, small.png, logo.svg | `node scripts/drive.js <folder> tests/image-viewer.js` |
| `changelog.js` (4 steps) | any folder with `Home.md` | `node scripts/drive.js <folder> tests/changelog.js` |
| `undo-redo.js` (5 steps) | any folder with `Home.md` | `node scripts/drive.js <folder> tests/undo-redo.js` |
| `tabs-split.js` (19 steps) | as `editing.js` | `TV=<folder> node scripts/drive.js <folder> tests/tabs-split.js` |
| `live-preview.js` (13 steps) | as `editing.js` | `TV=<folder> node scripts/drive.js <folder> tests/live-preview.js` |
| `canvas.js` (17 steps) | made by `node tests/make-canvas-vault.js <empty folder>` | `TV=<folder> node scripts/drive.js <folder> tests/canvas.js` |
| `dataview.js` (15 steps) | made by `node tests/make-dv-vault.js <empty folder>` | `TV=<folder> node scripts/drive.js <folder> tests/dataview.js` |
| `kanban.js` (25 steps) | made by `node tests/make-kanban-vault.js <empty folder>` | `TV=<folder> node scripts/drive.js <folder> tests/kanban.js` |
| `tasks-calendar.js` (19 steps) | made by `node tests/make-task-vault.js <empty folder>` | `TV=<folder> node scripts/drive.js <folder> tests/tasks-calendar.js` |
| `command-center.js` (42 steps) | made by `node tests/make-cc-vault.js <empty folder>` — the folder must be named `lanternote-cc-vault` | `TV=<folder> node scripts/drive.js <folder> tests/command-center.js` |
| `indexer-recovery.js` (4 steps) | the folder from `make-dv-vault.js` | `LANTERNOTE_TEST=1 TV=<folder> node scripts/drive.js <folder> tests/indexer-recovery.js` |
| `mcp.js` (35 steps, no `drive.js`) | makes its own temporary folder and settings | `node tests/mcp.js` · packaged: `MCP_CMD='["<win-unpacked>/Lanternote.exe","<win-unpacked>/resources/app.asar/mcp/lanternote-mcp.js"]' MCP_ENV='{"ELECTRON_RUN_AS_NODE":"1"}' node tests/mcp.js` |
| `index-cache.js` (3 steps, no `drive.js`) | makes its own temporary folder (20,000 notes) and cache | `node tests/index-cache.js` |
| `map-weak-pc.js` | a large folder (read only) | `WEAK=1 node scripts/drive.js <folder> tests/map-weak-pc.js` |

Options for `scripts/drive.js`: `APP_EXE="dist/win-unpacked/Lanternote.exe"` tests a packaged build; `WEAK=1` imitates a low-end PC (no GPU, 4× slower CPU); `FRESH_PROFILE=1` starts with empty settings (the app then opens no folder); `KEEP_PROFILE=1` keeps the settings of the previous run (an upgrade: run an old build, then the new one with this); `THEME=dark` for screenshots.

A large made-up folder for speed checks: `node scripts/make-demo-vault.js <empty folder>` (about 139,000 notes), then `node scripts/bench-index.js <folder> <words to search>`.
