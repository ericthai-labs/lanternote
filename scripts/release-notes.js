// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Prints the release notes of one version: its CHANGELOG.md section plus the licence line.
//   node scripts/release-notes.js [version]     (default: the version in package.json)
// Exit code 1 if CHANGELOG.md has no section for that version. Used by CI to write the GitHub release.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const version = (process.argv[2] || require(path.join(root, 'package.json')).version).replace(/^v/, '');
const cl = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const m = cl.match(new RegExp(`^## ${version.replace(/\./g, '\\.')}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
if (!m || !m[1].trim()) { console.error(`CHANGELOG.md has no section "## ${version}"`); process.exit(1); }
process.stdout.write(m[1].trim() +
  '\n\n**Downloads:** Windows — `Lanternote-' + version + '-portable.exe` (no install) or `-win.zip` (needed for the AI connection);' +
  ' macOS (Apple silicon) — `.zip`; Linux — `.AppImage`; Claude Desktop extension — `lanternote-' + version + '.mcpb`.' +
  ' The macOS and Windows builds are not code-signed yet.' +
  '\n\nLicence: Apache License 2.0 — free for any use, including commercial, provided the licence and NOTICE are kept.\n');
