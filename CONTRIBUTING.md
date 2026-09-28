# Contributing to Lanternote

Thanks for taking the time to help. Bug reports, ideas and pull requests are all welcome.

## Ask a question or share an idea

Use [Discussions](https://github.com/ericthai-labs/lanternote/discussions) for questions, "how do I…", show-and-tell and early ideas. Issues are for bugs and concrete feature requests.

## Report a bug

Open a [bug report](https://github.com/ericthai-labs/lanternote/issues/new?template=bug_report.yml) and include:

- the Lanternote version (**Help → About**) and your Windows version;
- what you did, what you expected, and what happened;
- roughly how many notes are in the folder, if the problem is about speed;
- a screenshot, if it helps.

Please **do not attach your real notes**. If a bug needs a folder to reproduce, make a small one with made-up text — `scripts/make-demo-vault.js` builds a large made-up folder for you.

Security problems: see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Send a pull request

1. For anything larger than a small fix, open an issue or discussion first so we can agree on the approach.
2. Fork the repository and create a branch from `main`.
3. Set up and run from source:

   ```bash
   npm ci
   npm start
   ```

4. Keep the change focused, and match the style of the code around it.
5. Run the tests that cover your change — see [tests/README.md](tests/README.md). UI tests drive the app with `scripts/drive.js`; always point them at a **throw-away folder**, because they create, rename and delete files.

   ```bash
   node tests/mcp.js
   node scripts/drive.js <throw-away folder> tests/editing.js
   ```

6. If the change is visible to users, add a line to [CHANGELOG.md](CHANGELOG.md) under the next version (English, no date; *Added*, *Changed* or *Fixed*).
7. Open the pull request and describe what changed and how you tested it.

## Ground rules

- **Your notes stay local.** Lanternote must work offline and must not send data anywhere unless the user turns on the AI connection. Pull requests that add telemetry, accounts or network calls will not be accepted.
- **Large folders are the point.** Changes to indexing, search, the graph or the galaxy should be checked on a big folder — `node scripts/make-demo-vault.js <empty folder>` makes one with about 139,000 notes, and `node scripts/bench-index.js` measures indexing and search.
- **Plain Markdown.** Notes, boards and canvases must stay readable in any text editor.
- **No other products' names** in the app, docs or tests; describe compatibility with open standards (Markdown, wiki links, JSON Canvas).

## Licence of contributions

Lanternote is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.txt). By submitting a contribution you agree that it may be used, changed and released as part of Lanternote under that licence or any other licence the author chooses.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
