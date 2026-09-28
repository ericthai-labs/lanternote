// Builds the temporary vault used by tests/kanban.js:
//   node tests/make-kanban-vault.js <empty folder>
const fs = require('fs'), path = require('path');
const d = path.resolve(process.argv[2]);
fs.rmSync(d, { recursive: true, force: true });
const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
const iso = (days) => { const t = new Date(); t.setDate(t.getDate() + days); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
// a board as the common board format writes it (front matter, lanes, Complete lane, archive, settings)
w('Boards/Sprint.md', `---

kanban-plugin: board

---

## To do

- [ ] Write the plan @{${iso(-1)}}
- [ ] Review [[Spec]] #urgent
- [ ] Two-line card
    second line of the card


## Doing

- [ ] Build the thing 📅 ${iso(1)}


## Done

**Complete**
- [x] Kickoff


***

## Archive

- [x] Old card

%% kanban:settings
\`\`\`
{"kanban-plugin":"board","lane-width":270}
\`\`\`
%%`);
w('Spec.md', '# Spec\n');
w('Home.md', '# Home\n\n```dataview\nTASK FROM "Boards" WHERE !completed\n```\n');
console.log('kanban test vault ready:', d);
