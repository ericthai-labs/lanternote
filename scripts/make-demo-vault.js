// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Builds a large vault of made-up notes for screenshots, the user guide and
// adverts — so no real record ever appears in a picture.
//   node scripts/make-demo-vault.js <empty folder> [notes, default 150000]
// Every name, folder and text is invented; the same folder is produced on
// every run (seeded random).
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'demo-vault');
const TOTAL = +(process.argv[3] || 150000);
fs.rmSync(dir, { recursive: true, force: true });

let seed = 20260927;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000, NOW = Date.now();

const ADJ = ['Amber', 'Quiet', 'Northern', 'Silver', 'Hidden', 'Golden', 'Distant', 'Coastal', 'Frozen', 'Bright', 'Ancient', 'Crimson', 'Gentle', 'Hollow', 'Lunar', 'Misty', 'Open', 'Rapid', 'Solar', 'Tidal', 'Urban', 'Velvet', 'Wild', 'Young', 'Azure', 'Cedar', 'Copper', 'Emerald', 'Ivory', 'Jade'];
const NOUN = ['Harbor', 'Theory', 'Garden', 'River', 'Signal', 'Lantern', 'Orchard', 'Compass', 'Meadow', 'Circuit', 'Canyon', 'Archive', 'Beacon', 'Delta', 'Engine', 'Forest', 'Glacier', 'Horizon', 'Island', 'Journey', 'Kernel', 'Library', 'Mosaic', 'Nebula', 'Ocean', 'Prism', 'Quarry', 'Ridge', 'Summit', 'Valley'];
const TOPIC = ['design', 'research', 'health', 'finance', 'writing', 'cooking', 'travel', 'music', 'science', 'history', 'ecology', 'software', 'maths', 'language', 'photography', 'gardening', 'astronomy', 'architecture', 'economics', 'psychology'];
const WORDS = 'the a of and to in is that for on with as by this from at an be are it or its was which can more also into about than between each other these their over after under while through during without across around'.split(' ')
  .concat('light river pattern garden signal method river season structure network theory habit memory circle energy story system surface weather balance rhythm window measure question answer example detail reason result'.split(' '));
const sentence = () => { const n = 8 + Math.floor(rnd() * 12); const w = []; for (let i = 0; i < n; i++) w.push(pick(WORDS)); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(' ') + '.'; };
const para = (k = 3) => Array.from({ length: k }, sentence).join(' ');
const TASKS = ['Draft the outline', 'Book a review with the team', 'Collect feedback', 'Update the budget sheet', 'Write the summary', 'Check the figures', 'Send the proposal', 'Plan the next sprint', 'Clean up the notes', 'Prepare the demo', 'Order the materials', 'Call the supplier'];
const dayIso = (d) => new Date(NOW + d * DAY).toISOString().slice(0, 10);
const title = (i) => `${ADJ[i % ADJ.length]} ${NOUN[Math.floor(i / ADJ.length) % NOUN.length]} ${Math.floor(i / (ADJ.length * NOUN.length)) + 1}`;

// folders and how many notes each gets (share of TOTAL); the library is most of the vault
const LIB = [['Articles', 0.26], ['Papers', 0.18], ['Glossary', 0.15], ['Species', 0.1], ['Books', 0.08], ['Places', 0.07], ['Recipes', 0.05], ['Minerals', 0.03]];
const notes = []; // { rel, title, folder, mtime, fm, links: [], tags: [], body }
const add = (rel, o) => { const n = { rel, links: [], tags: [], fm: null, body: '', ...o }; notes.push(n); return n; };
const age = () => { const r = rnd(); return r < 0.015 ? rnd() * 7 : r < 0.1 ? 7 + rnd() * 30 : 37 + rnd() * 700; };

// hubs: one index note per library shelf, a few topic maps
const hubs = LIB.map(([f]) => add(`04-Library/${f}/_Index ${f}.md`, { title: `_Index ${f}`, mtime: NOW - 20 * DAY, body: `# ${f}\n\nEvery ${f.toLowerCase()} note in the library links here.\n` }));
const maps = TOPIC.map((t) => add(`06-Maps/${t[0].toUpperCase() + t.slice(1)} map.md`, { title: `${t[0].toUpperCase() + t.slice(1)} map`, mtime: NOW - age() * DAY, tags: ['map', 'topic/' + t], body: `# ${t[0].toUpperCase() + t.slice(1)} map\n\n> [!abstract] Map of content\n> The main notes about ${t}.\n` }));

let k = 0;
for (const [shelf, share] of LIB) {
  const n = Math.round(TOTAL * share);
  for (let i = 0; i < n; i++, k++) {
    const t = `${title(k)}`;
    const topic = pick(TOPIC);
    add(`04-Library/${shelf}/${t}.md`, { title: t, mtime: NOW - age() * DAY, shelf, topic, tags: [shelf.toLowerCase(), 'topic/' + topic] });
  }
}
const lib = notes.filter((x) => x.shelf);
// projects with fields for the Command Center and Dataview
const STATUS = ['active', 'active', 'active', 'paused', 'planned', 'done'], PRIO = ['High', 'Medium', 'Medium', 'Low'];
const projects = [];
for (let i = 0; i < 48; i++) {
  const t = `Project ${NOUN[i % NOUN.length]} ${ADJ[(i * 7) % ADJ.length]}`;
  const due = new Date(NOW + (Math.floor(rnd() * 70) - 10) * DAY).toISOString().slice(0, 10);
  const status = STATUS[i % STATUS.length];
  projects.push(add(`01-Projects/${t}.md`, {
    title: t, mtime: NOW - (i < 10 ? rnd() * 6 : age()) * DAY, tags: ['project'],
    fm: { type: 'project', status, priority: PRIO[i % PRIO.length], due, owner: pick(['Team A', 'Team B', 'Team C']) },
    body: `# ${t}\n\n## Goal\n${para(2)}\n\n## Next steps\n- [x] ${pick(TASKS)} ✅ ${dayIso(-2 - (i % 5))}\n- [ ] ${pick(TASKS)} 📅 ${dayIso((i % 9) - 2)}\n    - [ ] ${pick(TASKS)}\n- [ ] ${pick(TASKS)} 📅 ${dayIso((i % 13) + 3)} #${pick(['urgent', 'review', 'waiting'])}\n\n## Notes\n${para(3)}\n`,
  }));
}
// areas, inbox, meetings, daily journal
for (const a of ['Health', 'Finance', 'Team', 'Learning', 'Home', 'Writing']) for (let i = 0; i < 30; i++) add(`02-Areas/${a}/${a} ${title(i * 3 + 11)}.md`, { title: `${a} ${title(i * 3 + 11)}`, mtime: NOW - age() * DAY, tags: ['area/' + a.toLowerCase()] });
for (let i = 0; i < 60; i++) add(`00-Inbox/Idea ${title(i * 13 + 5)}.md`, { title: `Idea ${title(i * 13 + 5)}`, mtime: NOW - (i < 12 ? rnd() * 5 : age()) * DAY, tags: ['idea'] });
for (let i = 0; i < 400; i++) { const d = new Date(NOW - i * 3 * DAY); const day = d.toISOString().slice(0, 10); add(`05-Meetings/${day} ${pick(NOUN)} sync.md`, { title: `${day} sync`, mtime: d.getTime(), tags: ['meeting'] }); }
for (let i = 0; i < 730; i++) { const d = new Date(NOW - i * DAY); const day = d.toISOString().slice(0, 10); add(`03-Journal/${day.slice(0, 4)}/${day}.md`, { title: day, mtime: d.getTime() + 18 * 3600000 - DAY / 2, tags: ['journal'], body: `# ${day}\n\n- [${i ? 'x' : ' '}] ${sentence()}\n- [ ] ${sentence()}\n\n${para(2)}\n` }); }

// links: every library note → its shelf index + 1-3 others (earlier notes are linked more: hubs grow)
const nameOf = (x) => x.rel.split('/').pop().replace(/\.md$/, '');
const byTopic = new Map(TOPIC.map((t) => [t, lib.filter((x) => x.topic === t)])), seenTopic = new Map();
for (let i = 0; i < lib.length; i++) {
  const x = lib[i];
  x.links.push(nameOf(hubs[LIB.findIndex(([f]) => f === x.shelf)]));
  const m = 1 + Math.floor(rnd() * 3);
  // mostly within the same topic (clusters, as in real notes), sometimes anywhere
  const same = byTopic.get(x.topic), seen = seenTopic.get(x.topic) || 0;
  for (let j = 0; j < m; j++) {
    const o = rnd() < 0.85 && seen ? same[Math.floor(Math.pow(rnd(), 2.2) * seen)] : lib[Math.floor(Math.pow(rnd(), 2.2) * Math.max(1, i))];
    if (o && o !== x) x.links.push(nameOf(o));
  }
  seenTopic.set(x.topic, seen + 1);
  if (rnd() < 0.3) x.links.push(nameOf(maps[TOPIC.indexOf(x.topic)]));
}
for (const m of maps) for (let j = 0; j < 25; j++) m.links.push(nameOf(pick(lib)));
for (const p of projects) for (let j = 0; j < 4; j++) p.links.push(nameOf(pick(lib)));
// journal, meetings, areas and inbox point at projects and library notes, like real ones do
for (const x of notes) if (/^0[0235]-/.test(x.rel)) { x.links.push(nameOf(pick(projects))); for (let j = 0; j < 2; j++) x.links.push(nameOf(pick(lib))); }

// the showcase notes used by the guide
add('Welcome.md', { title: 'Welcome', mtime: NOW - 2 * 3600000, tags: ['start'], body: `# Welcome

This vault is **made up** for pictures and the user guide — every name and text in it is invented.

> [!tip] Start here
> Open the **Command Center** with the ⌂ button, or press **Ctrl+Shift+H**.

## What is inside
| Folder | What |
|---|---|
| [[Projects dashboard\\|01-Projects]] | ${projects.length} projects with status, priority and due date |
| 03-Journal | a daily note for two years |
| 04-Library | about ${Math.round(lib.length / 1000)},000 articles, papers, books and more |
| 06-Maps | one map of content per topic |

## Today
- [x] Sort the inbox
- [ ] Review [[${nameOf(projects[0])}]]
- [ ] Read [[${nameOf(lib[3])}]]

## Links
See the [[${nameOf(maps[0])}]], the [[${nameOf(maps[1])}]] and the [[Ideas board]] canvas. #start
` });
add('Tasks and calendar.md', { title: 'Tasks and calendar', mtime: NOW - 4 * 3600000, body: `# Tasks and calendar

## Due in the next 7 days
\`\`\`dataview
TASK FROM "01-Projects" WHERE !completed AND due AND due <= date(today) + dur(7 days) SORT due ASC LIMIT 8
\`\`\`

## Meetings
\`\`\`dataview
CALENDAR file.day FROM "05-Meetings"
\`\`\`
` });
// a second Command Center layout, used for the task / calendar adverts
add('This week.md', { title: 'This week', mtime: NOW - 5 * DAY, body: `# This week

## Open tasks
\`\`\`dataview
TASK FROM "01-Projects" WHERE !completed AND due AND due <= date(today) + dur(14 days) SORT due ASC LIMIT 7
\`\`\`

## Meetings
\`\`\`dataview
CALENDAR file.day FROM "05-Meetings"
\`\`\`
` });
add('Launch board.md', { title: 'Launch board', mtime: NOW - 2 * 3600000, body: `---

kanban-plugin: board

---

## Backlog

- [ ] Write the release notes 📅 ${dayIso(9)}
- [ ] Record a short demo video #marketing
- [ ] Translate the guide
- [ ] Collect feedback from [[${nameOf(projects[2])}]]


## In progress

- [ ] Design the landing page 📅 ${dayIso(2)} #design
- [ ] Fix the export bug 📅 ${dayIso(-1)} #urgent
- [ ] Update the budget sheet
    check the figures with Team B


## Review

- [ ] Final check of [[${nameOf(projects[0])}]] 📅 ${dayIso(4)}
- [ ] Proofread the brochure


## Done

**Complete**
- [x] Kick-off meeting
- [x] Choose the launch date
- [x] Book the venue


%% kanban:settings
\`\`\`
{"kanban-plugin":"board"}
\`\`\`
%%
` });
add('Projects dashboard.md', { title: 'Projects dashboard', mtime: NOW - 3 * DAY, body: `# Projects dashboard

## Active projects
\`\`\`dataview
TABLE status AS "Status", priority AS "Priority", due AS "Due", owner AS "Owner"
FROM "01-Projects"
WHERE type = "project" AND status = "active"
SORT due ASC
\`\`\`

## By status
\`\`\`dataview
TABLE length(rows) AS "Projects"
FROM "01-Projects"
GROUP BY status
\`\`\`
` });
add('Command Center.md', { title: 'Command Center', mtime: NOW - 5 * DAY, body: `# Command Center

# Left

## Today
\`\`\`lantern
stats
\`\`\`

## Top tags
\`\`\`lantern
tags 10
\`\`\`

# Center

## Areas
\`\`\`lantern
folders 00-Inbox, 01-Projects, 02-Areas, 03-Journal, 04-Library, 06-Maps
\`\`\`

## Active projects
\`\`\`dataview
TABLE WITHOUT ID file.link AS "Project", priority AS "Priority", due AS "Due"
FROM "01-Projects"
WHERE status = "active"
SORT choice(priority = "High", 1, choice(priority = "Medium", 2, 3)) ASC, due ASC
LIMIT 8
\`\`\`

# Right

## Due in 14 days
\`\`\`dataview
TABLE WITHOUT ID file.link AS "Project", due AS "Due"
FROM "01-Projects"
WHERE due AND status != "done" AND due >= date(today) AND due <= date(today) + dur(14 days)
SORT due ASC
\`\`\`

## Open tasks
\`\`\`dataview
TASK FROM "01-Projects" WHERE !completed SORT due ASC LIMIT 8
\`\`\`

## Calendar
\`\`\`dataview
CALENDAR file.day FROM "03-Journal" OR "05-Meetings"
\`\`\`

## Recently edited
\`\`\`lantern
recent 8
\`\`\`
` });

// write
let written = 0;
for (const x of notes) {
  const f = path.join(dir, x.rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  let text = '';
  if (x.fm) text += '---\n' + Object.entries(x.fm).map(([a, b]) => `${a}: ${b}`).join('\n') + '\n---\n';
  text += x.body || `# ${x.title}\n\n${para(3)}\n\n${para(2)}\n`;
  if (x.links.length) text += '\nRelated: ' + [...new Set(x.links)].map((l) => `[[${l}]]`).join(' · ') + '\n';
  if (x.tags.length) text += '\n' + x.tags.map((t) => '#' + t).join(' ') + '\n';
  fs.writeFileSync(f, text);
  const t = new Date(x.mtime); fs.utimesSync(f, t, t);
  if (++written % 20000 === 0) console.log(written, 'notes written');
}
// a canvas
const cv = { nodes: [
  { id: 'a', type: 'text', text: '# Ideas board\nThings to try this month', x: -420, y: -240, width: 300, height: 120, color: '6' },
  { id: 'b', type: 'file', file: 'Welcome.md', x: -60, y: -300, width: 360, height: 260 },
  { id: 'c', type: 'file', file: projects[0].rel, x: -440, y: 20, width: 340, height: 240, color: '4' },
  { id: 'd', type: 'text', text: '**Next**\n- sketch\n- test\n- ship', x: -20, y: 60, width: 240, height: 160, color: '3' },
  { id: 'e', type: 'group', label: 'This week', x: -480, y: -340, width: 820, height: 640 },
], edges: [
  { id: 'e1', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', label: 'read first' },
  { id: 'e2', fromNode: 'a', fromSide: 'bottom', toNode: 'c', toSide: 'top' },
  { id: 'e3', fromNode: 'c', fromSide: 'right', toNode: 'd', toSide: 'left', color: '4' },
] };
fs.writeFileSync(path.join(dir, 'Ideas board.canvas'), JSON.stringify(cv, null, 2));
console.log('demo vault ready:', dir, '—', notes.length.toLocaleString(), 'notes');
