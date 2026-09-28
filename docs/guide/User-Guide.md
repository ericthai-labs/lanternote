---
title: Lanternote — User Guide
version: 1.14.0
---

# Lanternote — User Guide

*Version 1.14.0. Every picture was taken on a **made-up folder of about 139,000 notes** (built by `scripts/make-demo-vault.js`): all note names, folders and texts in it are invented.*

Lanternote is a Windows app for a **folder of Markdown notes**: wiki links, backlinks, tags, canvases, live queries, tasks, calendars and a link graph. It stays fast on very large folders (measured on 200,000 notes), runs on PCs without a graphics card, and never sends your notes anywhere.

## Highlights

| | |
|---|---|
| **Your vault as a galaxy** | Every star is a note, every arm a folder. Zoom in to read names, click a star to open it. |
| **Command Center** | One page with what matters: projects, due dates, open tasks, a calendar, recent notes — built from an ordinary note you can edit. |
| **Live queries** | Tables, lists, task lists and month calendars from ` ```dataview ` blocks, updated as notes change. |
| **Kanban boards** | Drag cards between lanes; boards are plain Markdown notes in the common board format. |
| **Tick tasks anywhere** | Check a task in any query result or on the Command Center: the note is updated on the spot. |
| **Built for size** | ≈ 200,000 notes: opens in 1–2 s after the first time, queries in ≈ 0.1 s, the galaxy draws a frame in ≈ 1 ms. |
| **Any PC** | Graph and galaxy are drawn without a graphics card. Portable: no installation, no admin rights. |
| **Works with your AI assistant** | Claude and other MCP assistants can search, query and — if you allow it — edit your notes. Every AI change keeps the old text. |
| **Your files, your PC** | Plain `.md` files in your own folder. No account, no cloud; nothing leaves your PC unless you connect an AI. |

## Why Lanternote

| | Lanternote | Typical cloud note apps | Typical local Markdown apps |
|---|---|---|---|
| Notes stay on your PC, works offline | ✅ always | ❌ stored on the provider's servers | ✅ |
| Plain Markdown files you own | ✅ | ❌ usually a closed format | ✅ |
| Tested with 200,000 notes | ✅ measured | ⚠️ varies | ⚠️ varies |
| Link graph without a graphics card | ✅ | ⚠️ varies | ⚠️ varies |
| Command Center page + galaxy of your notes | ✅ built in | ❌ | ❌ not built in |
| Tables, task lists, calendars from queries | ✅ built in | ⚠️ some, inside their own databases | ⚠️ often through add-ons |
| Tick tasks inside query results | ✅ | ⚠️ varies | ⚠️ varies |
| Kanban boards stored as plain Markdown | ✅ built in | ❌ usually their own format | ⚠️ often through add-ons |
| Portable, no installation, no admin rights | ✅ | ❌ account and install / browser | ⚠️ varies |
| AI assistant can read and edit notes (MCP), with undo | ✅ built in | ⚠️ varies | ⚠️ often through add-ons |

*The comparison is general: features of other products differ from one product and version to the next. Figures for Lanternote were measured on a 203,000-note folder and on the made-up 139,000-note folder.*

## 1. Main window

![Main window](img/g01-main-window.png)

| Area | What it holds |
|---|---|
| Top bar | ☰ file panel · ‹ › back / forward · **Quick open** · ⌂ Command Center · ✎ read / edit · ⚹ graph · ⟳ reload · ◐ light / dark · ⚙ settings · ⋮ outline panel |
| Left | **Files** (folder tree), **Search**, **Tags** |
| Middle | The open note: callouts, tables, task lists, links |
| Right | **Outline**, **Backlinks** (notes that link here), **Outgoing links** |

The first time a large folder is opened the app reads every note (15–20 s for 200,000 notes); afterwards it opens in 1–2 s.

## 2. Quick open — Ctrl+O

![Quick open](img/g02-quick-open.png)

Type a few letters of the name (they need not be next to each other), ↑↓ to pick, Enter to open. Empty, it lists the notes opened and edited most recently.

## 3. Search every note — Ctrl+Shift+F

![Search](img/g03-search.png)

All the words must appear, with or without accents; matches are highlighted. `tag:#name` lists the notes with a tag.

## 4. Editing — Ctrl+E

![Editing](img/g04-editing.png)

- **Ctrl+E** switches reading ⇄ editing. Saved as you type; **Undo / Redo / Versions** at the top.
- Type `[[` to link to a note; rename a note in its title field — links to it are updated.
- If the file is changed elsewhere while you edit, the app asks which version to keep and never overwrites silently.

## 5. Canvas

![Canvas](img/g05-canvas.png)

Open `.canvas` files (the open JSON Canvas format): text, note, picture and web cards, groups, arrows, colours. Double-click the board to add a card; **Fit** shows everything.

## 6. Live queries

![Queries](img/g06-queries.png)

A ` ```dataview ` block becomes a live table or list, updated as notes change:

```
TABLE status AS "Status", priority AS "Priority", due AS "Due", owner AS "Owner"
FROM "01-Projects"
WHERE type = "project" AND status = "active"
SORT due ASC
```

`TABLE`, `LIST`, `TASK`, `CALENDAR`; `FROM` folders, `#tags` and `[[links]]`; `WHERE`, `SORT`, `GROUP BY`, `FLATTEN`, `LIMIT`; fields from the front matter, inline `key:: value` and `file.*`; the common functions (`date(today)`, `dur(7 days)`, `contains`, `dateformat`, …).

## 7. Tasks

![Tasks](img/g07-tasks.png)

`TASK` lists task lines (`- [ ] …`) grouped by note:

```
TASK FROM "01-Projects" WHERE !completed AND due <= date(today) + dur(7 days) SORT due ASC
```

- Dates are read from the task line: `📅 2026-10-01` (due), `⏳` scheduled, `🛫` start, `✅` done, `➕` created — or `[due:: 2026-10-01]`.
- Fields: `text`, `status`, `completed`, `checked`, `fullyCompleted`, `due`, `tags`, `children`, `line`, `path`, `file.*`, plus the fields of the note the task is in (e.g. `GROUP BY owner`).
- **Tick a task right in the list** — in a note or on the Command Center — and its note is updated. If that line was changed elsewhere meanwhile, nothing is written and the list refreshes.

## 8. Calendar

![Calendar](img/g08-calendar.png)

`CALENDAR` puts a dot for each note on its date:

```
CALENDAR file.day FROM "05-Meetings"
```

‹ › change month, **Today** comes back; click a day to list its notes. `file.day` is the date in the file name (`2026-09-27.md`), `file.mday` the day it was last edited; any date field works too.

## 8b. Kanban boards

![Kanban board](img/g20-kanban.png)

A note with `kanban-plugin: board` in its front matter opens as a **board**: every `## Heading` is a lane, every `- [ ] …` a card — the common Markdown board format, so boards made elsewhere open as they are. **File → New kanban board** makes one.

- **Drag** cards between and inside lanes; drag a lane by its header to reorder lanes.
- **+ Add a card** (Enter keeps adding, Esc stops); **double-click** a card to edit it (Shift+Enter for a new line); ✕ deletes; the checkbox ticks it.
- The lane menu **⋯**: rename, mark the lane **Complete** (cards dropped there are ticked), sort by due date, delete done cards, delete the lane.
- Due dates (`📅 2026-10-01` or `@{2026-10-01}`) turn orange when close and red when late. **Filter cards** narrows the board; Ctrl+Z / Ctrl+Y undo and redo.
- **Markdown** (or Ctrl+E) shows the board's text; **Board view** brings the board back. Cards are task lines, so `TASK` queries, the Command Center and the AI connection see them.

## 9. Graph — Ctrl+G

![Graph](img/g09-graph.png)

**All notes**: the whole folder, coloured by top folder. Scroll to zoom, drag to move, click a dot to open the note. The **Map** engine lays out once, remembers the layout and needs no graphics card (139,000 notes laid out in about 2 s).

![Graph around a note](img/g10-graph-local.png)

**Ctrl+Shift+G** (**This note**): only the notes around the open one, 1–3 links deep.

## 10. Command Center — Ctrl+Shift+H

![Command Center](img/g11-command-center.png)

Open it with **⌂**. The page is built from an ordinary note, `Command Center.md` — click **Layout** in the dock to edit it:

- `# Left`, `# Center`, `# Right` choose the column; every `## Heading` is a card.
- A card holds any Markdown and queries (a card with one query shows its count), plus ` ```lantern ` blocks:

| Block | Shows |
|---|---|
| `stats` | notes, links, tags, edited today, edited in 7 days |
| `recent 10` · `recent 10 Folder` | most recently edited notes |
| `folders` · `folders A, B/C` | folders with their note counts; click to open one in the file panel |
| `tags 12` | the most used tags |

Without that note a built-in layout is shown (stats, folders, recent notes, due dates, open tasks, calendar).

## 11. The galaxy of your notes — ✦ Galaxy

![Galaxy](img/g12-galaxy.png)

The Command Center background **is your folder**: every star is a note. Each folder is a spiral arm (a folder holding most of the notes is split into its subfolders); notes with many links sit near the core and are bigger; notes edited in the last 7 days shine white. A note keeps its place from one visit to the next.

Click **✦ Galaxy** to explore it:

![Zoomed in](img/g13-galaxy-zoom.png)

**Scroll** to zoom around the pointer — names appear when you are close. **Drag** to move, **double-click** to zoom in.

![Hovering a star](img/g14-galaxy-hover.png)

**Point** at a star for its name and folder, **click** to open the note.

![Highlighting an arm](img/g15-galaxy-highlight.png)

**Click a folder in the legend** to highlight its arm; **Esc** to come back. The galaxy keeps turning while you explore and holds still while you point at a star or drag.

## 12. Settings — Ctrl+,

![Settings](img/g16-settings.png)

**Command Center**:

- **Built from the note** — the layout note (default `Command Center.md`).
- **Background** — *Automatic* (moving; a still picture when drawing is slow or Windows animations are off), *Moving*, *Still picture*, *Plain* (follows light / dark). None of them needs a graphics card.
- **Galaxy turning speed** — Off, Slow, Normal, Fast.

**AI connection**: see section 13.

Other sections: appearance (theme, text size, font, accent colour), editor, where new notes and pasted pictures go, daily notes, templates, query date formats, graph, file recovery.

## 13. Connect an AI assistant (MCP)

![AI connection](img/g19-ai-connection.png)

An AI assistant that speaks **MCP** — Claude Code, Claude Desktop and others — can work with your notes through Lanternote: search, read, run queries, list tasks and, if you allow it, **create notes, add text, change a passage, tick tasks and set properties**.

1. Open **Settings → AI connection**.
2. **Claude Code**: *Copy command*, paste it in a terminal, run it once. **Claude Desktop**: *Copy config*, paste it into `claude_desktop_config.json` (Settings → Developer → Edit config), restart Claude Desktop.
3. Ask as usual — *"Which projects have overdue tasks this week? Summarise them and add the list to tomorrow's meeting note."*

| Tool | What the AI can do |
|---|---|
| `vault_info`, `find_notes`, `search`, `recent` | learn the folder, find notes by name or text |
| `read_note`, `links` | read a note or one section; backlinks and outgoing links |
| `query`, `list_tasks` | run TABLE / LIST / TASK / CALENDAR queries; tasks by due date |
| `create_note`, `append_to_note`, `replace_in_note` | write notes (only when allowed) |
| `set_task`, `set_property` | tick tasks, set front-matter properties (only when allowed) |

- The AI works with the folder last opened in Lanternote. **Let the AI edit notes** off = read only; **Folders the AI may use** limits what it sees.
- Every AI change keeps the previous text: open the note and click **🕘 Versions**. Changes are also listed in `mcp.log`.
- When the AI reads a note, that text is sent to the AI provider — connect only folders you are happy to share.
- Use the unzipped app (the `win-unpacked` folder or the `.zip`) for the AI connection, not the portable `.exe`.

## 14. Command palette — Ctrl+P

![Command palette](img/g17-command-palette.png)

Every command in one list: type a few letters, ↑↓, Enter.

## 15. Light theme

![Light theme](img/g18-light-theme.png)

**Ctrl+Shift+D** switches light / dark. With the *Plain* background the Command Center follows the theme.

## 16. Keyboard shortcuts

| Keys | Action |
|---|---|
| F1 | In-app guide |
| Ctrl+O | Quick open |
| Ctrl+Shift+F | Search every note |
| Ctrl+Shift+H | Command Center |
| Ctrl+G / Ctrl+Shift+G | Graph of all notes / around this note |
| Ctrl+N | New note |
| Ctrl+E | Read ⇄ edit |
| Alt+E | Insert a template |
| Ctrl+P | Command palette |
| Ctrl+, | Settings |
| Ctrl+Shift+D | Light / dark |
| Ctrl+− / Ctrl+= / Ctrl+0 | Zoom the whole window out / in / reset |
| Esc | Close a dialog, leave the galaxy |

## 17. Taking Lanternote to another PC

Copy **one file**: `Lanternote-<version>-portable.exe`. It runs from anywhere (USB stick, Desktop, a network drive) with no installation and no admin rights; it unpacks itself on each start, so it opens a few seconds slower. Alternatively copy the whole `win-unpacked` folder (or unzip `Lanternote-<version>-win.zip`) and run `Lanternote.exe` inside it — it starts faster. Copying only `Lanternote.exe` out of that folder does **not** work.

Settings, the index cache and recovery copies live on each PC in `%APPDATA%\Lanternote` and are not carried over: the first start on a new PC reads the folder once. The app is not code-signed yet, so Windows may show a SmartScreen warning (*More info → Run anyway*); company PCs may block unsigned programs.

---
© 2026 Eric Thai - Thai Ba Hoa. Pictures are rebuilt by `node scripts/make-media.js`.
