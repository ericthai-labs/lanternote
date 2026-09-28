# Changelog — Lanternote

All notable changes to Lanternote, newest first. Versions follow `MAJOR.MINOR.PATCH`: the minor number goes up for new features, the patch number for fixes only.

## 1.17.0

### Changed
- **New name: Lanternote** (was *Lumen Notes*, a name already used by another notes app). Settings, caches and recovery copies are carried over on first start.
- Exe: `Lanternote-x.y.z-portable.exe`; AI connection script: `mcp/lanternote-mcp.js` — copy the new command from Settings → AI connection.
- Command Center blocks are now written ` ```lantern `; existing ` ```lumen ` blocks keep working.

### Added
- **Claude Desktop extension**: `lanternote-1.17.0.mcpb` — double-click to install the AI connection without the app, pick the notes folder; read-only unless *Let the AI edit notes* is turned on.

## 1.16.1

### Changed
- **Licence: PolyForm Noncommercial 1.0.0.** Free for personal use and for noncommercial organisations; commercial use needs the author's permission. Shown in Help → Licence and the About page.

### Removed
- One-time carry-over of settings from the app's pre-1.5 name.

## 1.16.0

### Added
- **Kanban boards**: a note with `kanban-plugin: board` in its front matter opens as a board — every `## Heading` is a lane, every `- [ ] …` a card. The common Markdown board format, so existing boards open as they are; the archive and board settings at the end of the file are kept untouched, and an unchanged board is written back byte for byte.
- Drag cards between and inside lanes, drag lanes by their header; tick cards; add cards (Enter keeps adding), edit them by double-click (a new line stays part of the card), delete them; add, rename and delete lanes; undo / redo; filter cards; saved on its own with protection against changes made elsewhere.
- A lane marked **Complete** (lane menu ⋯) ticks the cards dropped into it. Due dates on cards (`📅 2026-10-01` or `@{2026-10-01}`) turn orange when close and red when late; the lane menu sorts a lane by due date.
- Cards are task lines, so TASK queries, the Command Center and the AI connection see them.
- File → **New kanban board**; **Markdown** (or Ctrl+E) shows the board's text, **Board view** brings the board back. The outline panel lists the lanes.

## 1.15.0

### Added
- **AI connection (MCP)**: an AI assistant that speaks the Model Context Protocol — Claude Code, Claude Desktop and others — can work with your notes through Lanternote: `vault_info`, `search`, `find_notes`, `read_note`, `links`, `recent`, `query` (TABLE / LIST / TASK / CALENDAR as JSON), `list_tasks`, and, when allowed, `create_note`, `append_to_note`, `replace_in_note`, `set_task`, `set_property`. It uses the app's index (fast on 200,000 notes) and follows edits made anywhere.
- Every change made by the AI keeps the previous text as a recovery copy (the note's **Versions** button) and is listed in `mcp.log`; paths outside the folder and hidden folders are refused; a task is only ticked if its line still holds the expected text.
- Settings → **AI connection**: let the AI edit notes (on by default), folders the AI may use, and the ready-made setup for Claude Code (a command) and Claude Desktop (a config), with copy buttons. Runs from the app itself — no other software to install.

### Changed
- A Command Center without columns lets its cards share the full width.

## 1.14.0

### Added
- **TASK queries**: task lines (`- [ ] …`) as a list grouped by note (or by `GROUP BY`), with `WHERE` / `SORT` / `LIMIT` on task fields — `text`, `status`, `completed`, `checked`, `fullyCompleted`, `due`, `scheduled`, `start`, `completion`, `created` (from `📅 ⏳ 🛫 ✅ ➕ date` or `[due:: date]`), `tags`, `outlinks`, `children`, `line`, `path`, `file.*` — and the fields of the note the task is in. `file.tasks` lists a note's tasks.
- **Tick tasks in query results**, in notes and on the Command Center: the checkbox writes `[x]` / `[ ]` to that line of the note; if the line was changed elsewhere meanwhile, nothing is written and the list is refreshed.
- **CALENDAR queries**: a month with a dot per note on its date; ‹ › and Today to change month; click a day to list its notes.
- Command Center: **Open tasks** and **Calendar** cards in the built-in layout; setting **Galaxy turning speed** (off / slow / normal / fast); the galaxy now also turns while you explore it, and holds still while you point at a star or drag.

### Changed
- The first start after updating reads the folder once more, to index the tasks.

### Fixed
- The settings page no longer scrolls sideways in a narrow window.

## 1.13.0

### Changed
- **A look of its own**: a new palette — deep navy with amber in dark mode, warm paper with amber in light mode (the accent colour can still be changed in Settings; the old default purple now follows the new one); the Files / Search / Tags switch is a segmented control; callouts are outlined cards with a label bar.
- Texts in the app, the guide and the changelog describe what Lanternote does in its own words; other products are no longer named.

### Fixed
- Screenshots and tests no longer stall when the test window is covered by other windows.

## 1.12.0

### Added
- **The Command Center background is now your vault**: every star is a note. Each folder is a spiral arm in the graph's colours (a folder holding most of the vault is split into its subfolders, so a large library shows its parts); notes with many links sit near the core and are bigger; notes edited in the last 7 days shine white and twinkle. A note keeps its place between visits.
- **Galaxy** button (✦) on the Command Center: the cards step aside and the galaxy can be explored — scroll to zoom (towards the mouse), drag to move, double-click to zoom in, hover a star for the note's name and folder, click to open it; names appear when zoomed in; click a folder in the legend to highlight its arm; Esc to come back. Drawn without a graphics card (≈ 1 ms a frame, 15 ms to redraw 200,000 notes when zoomed).

### Fixed
- Large numbers no longer overflow the stat tiles.

## 1.11.0

### Added
- **Command Center** (⌂ button, Ctrl+Shift+H, command palette): a dashboard page for the whole vault. The built-in layout shows note / link / tag counts, notes edited today and this week, the top-level folders with their note counts, recently edited notes, the most used tags and notes due in the next 14 days. It does not open by itself at start-up.
- The page can be designed in an ordinary note (`Command Center.md` by default; **Layout** on the page creates it from a template): `# Left` / `# Center` / `# Right` choose the column, every `## Heading` is a card, and a card holds any Markdown — Dataview queries, links, lists, callouts — plus ```` ```lantern ```` blocks: `stats`, `recent N [folder]`, `folders [list]`, `tags N`. It updates when notes change on disk.
- Starry background drawn without a graphics card, with a choice in Settings → Command Center: *Automatic* (moving, or a still picture when drawing is slow or Windows animations are off), *Moving stars*, *Still picture*, *Plain*. The animation runs only while the page is on screen.

### Fixed
- When the open note was changed on disk while the graph was shown, the app jumped back to the note; it now stays and shows the new text when you return.

## 1.10.1

### Fixed
- **"Dataview: Cannot read properties of null (reading 'files')"** after updating from 1.9.0: the first start re-reads the vault, and every note was fed into the saved search index one by one, which ran the background indexer out of memory on large vaults (≈ 200,000 notes). The search index is now rebuilt from scratch in that case (and after large syncs), which is faster and uses far less memory.
- If the background indexer ever stops, it is started again and the folder reopened automatically; queries run while the folder is loading wait and retry instead of showing an error.

### Added
- Problems of the background threads are written to `lanternote.log` in the settings folder (Settings → Advanced).

## 1.10.0

### Added
- **Dataview queries**: ```` ```dataview ```` blocks written in the Dataview query language run in Lanternote and show as live tables and lists — `TABLE` / `TABLE WITHOUT ID` / `LIST`, `FROM` folders, tags and links, `WHERE`, `SORT`, `GROUP BY`, `FLATTEN`, `LIMIT`, frontmatter and inline `key:: value` fields, `file.*`, `this`, and the common functions (`date`, `dur`, `dateformat`, `choice`, `contains`, `startswith`, `regexmatch`, `length`, …). Queries run over the whole index in the background (≈ 20 ms for a folder, under 2 s across 200,000 notes). `TASK`, `CALENDAR` and `dataviewjs` are not supported.
- **Templates**: Alt+E inserts a template at the cursor; *New note from template…*; `<% tp.file.title %>`, `<% tp.date.now("…") %>`, `{{title}}`, `{{date}}`, `{{time}}` are filled in (Templater and core-templates syntax). The templates folder is found automatically or set in Settings.
- Settings → Templates and → Dataview (date formats in query results).

### Changed
- The index now keeps each note's fields and creation time; the first start after updating re-reads the vault once.

## 1.9.0

### Added
- **Canvas**: open and edit `.canvas` files in the open JSON Canvas 1.0 format — **interchangeable with other apps that use it**. Text cards (Markdown), note / picture / file cards, web-page cards and groups; arrows with labels between card sides; colours; multi-select; drag, resize, zoom; undo / redo; autosave with protection against changes made elsewhere. Fields the app does not know are kept untouched.
- New canvas from the File menu, the command palette or the file tree context menu. Canvases appear in the file tree and quick open (🧩).
- Renaming a note updates the canvases that show it.

### Fixed
- Canvases and pictures changed by another program are now noticed and reloaded (only `.md` notes were watched before).
- A new name typed into a note's title is no longer lost when switching notes before the field loses focus (happened when the window was not focused).

## 1.8.0

### Added
- **Image viewer**: full-window viewer for pictures in notes, the file tree and quick open. Zoom at the pointer, drag, rotate, *Fit* / *100%*, ← → to move between pictures, size and file size, *Show in folder*, *Open with…*. PNG, JPG, GIF, WebP, SVG, BMP, AVIF, ICO.
- Pictures listed in the file tree and quick open (🖼); can be hidden in Settings → Files & links.
- This changelog, shown in the app under **Help → What's new**.

## 1.7.0

### Added
- **User guide (Vietnamese)** inside the app: **F1**, Help → User guide, command palette, welcome screen.

### Changed
- The About page shows only the product, version, copyright, author and licences; opening the data folder and resetting settings moved to a new **Advanced** section.
- The **Help** menu sits after **View** (Windows convention).

## 1.6.0

### Added
- **Authorship and copyright of Eric Thai - Thai Ba Hoa**: `LICENSE.txt`, exe properties (Company, Copyright), Help → About / Licence, About page, copyright line at the top of every source file.
- `THIRD-PARTY-NOTICES.txt`: licences of the 34 bundled open-source packages (required when distributing).

## 1.5.0

### Changed
- Exe name: `Lanternote-x.y.z-portable.exe`.

### Added
- **↶ Undo**, **↷ Redo** and **🕘 Versions** buttons on the editor toolbar.

## 1.4.0

### Added
- **Settings page** (**Ctrl+,** or ⚙): appearance (light / dark / follow Windows, text size, line width, font, accent colour), editor (default view, autosave delay, spell check), where new notes and pasted pictures go, link updates on rename, delete confirmation, **folders to ignore**, daily notes (folder, name format, template), graph, file recovery.

## 1.3.0

### Added
- **Editing** (CodeMirror 6 editor): **Ctrl+E** read ⇄ edit, **autosave**, `[[` and `#` completion, Ctrl+B / I / K, Ctrl+Enter for tasks, pasted pictures stored as attachments.
- New note (**Ctrl+N**), click an unresolved link to create it, daily note, new folder.
- **Rename / move rewrites every link** pointing to the note; delete only moves to the recycle bin.
- Task checkboxes clickable in reading view; context menus; **command palette (Ctrl+P)**.
- **No silent overwrite** when a file is changed elsewhere (OneDrive, another editor): the app asks which version to keep.
- **Per-note undo history**; **restore an earlier version** (copies at most every 5 minutes, kept 14 days).
- Pending edits are saved before the window closes.

### Changed
- Print / save as PDF moved to the File menu (Ctrl+P is now the command palette).

## 1.2.0

### Added
- **"Map" graph engine** (default): the layout is computed once and cached, then drawn by level of detail like a web map — **smooth even without a graphics card** (simulated low-end PC: 90–164 fps, previously 0.5).
- **Search without Vietnamese diacritics** ("tau bay" finds "tàu bay"); search by document-code parts ("29-11", "801-a").

### Changed
- Compact on-disk search index: search memory down from ~500 MB to 50 MB; reopening no longer re-reads every note. Search matches words and word beginnings (no longer text inside a word).

## 1.1.0

### Added
- **Vaults of ~200,000 notes** (tested on 190,522 notes, 2.49 million links): reading and indexing on a background thread, on-disk cache — reopening in ~1–2 s instead of re-reading everything.
- **Graph view**: whole vault or around the open note, coloured by folder, highlight by name.
- Incremental updates when files change on disk, including changes made while the app was closed.

### Fixed
- Graph lag on large vaults (19 → 120 fps): no GPU read-backs while drawing labels; links of "hub" notes with more than 1,000 links hidden by default (**Hub links** option).

### Changed
- File limit raised from 50,000 to 1,000,000.

## 1.0.0

- First version: a **reader** for a folder of Markdown notes (`[[links]]`, backlinks, tags, callouts, embedded notes and pictures, mermaid diagrams, search, quick open). Read-only, up to 50,000 files.
