// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Stops a release build when CHANGELOG.md has no entry for the version in
// package.json, so every published version says what changed.
// Runs before `npm run dist:*` (npm "pre" scripts).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
// a heading "## x.y.z" — English, no date (the author's convention)
const re = new RegExp('^## \\[?' + version.replace(/\./g, '\\.') + '\\]?[ \\t]*$', 'm');
if (!re.test(log)) {
  console.error(`CHANGELOG.md has no entry for version ${version}.\nAdd a "## ${version}" section (Added / Changed / Fixed, in English, without a date) before building.`);
  process.exit(1);
}
console.log(`changelog: entry for ${version} found`);
