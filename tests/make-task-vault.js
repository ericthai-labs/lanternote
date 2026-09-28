// Builds the temporary vault used by tests/tasks-calendar.js:
//   node tests/make-task-vault.js <empty folder>
const fs = require('fs'), path = require('path');
const d = path.resolve(process.argv[2]);
fs.rmSync(d, { recursive: true, force: true });
const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
const iso = (days) => { const t = new Date(); t.setDate(t.getDate() + days); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const prevMonth = (() => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - 1); t.setDate(15); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-15`; })();
w('Tasks/Alpha.md', `---\nowner: Son\n---\n# Alpha\n\n- [ ] Write plan 📅 ${iso(2)}\n    - [x] Draft outline\n    - [ ] Review outline\n- [x] Kickoff ✅ ${iso(-3)}\n- [-] Dropped idea\n- [ ] Call vendor [due:: ${iso(-1)}] #urgent\n`);
w('Tasks/Beta.md', '# Beta\n\n- [ ] Beta one 📅 ' + iso(10) + '\n- [ ] Beta two\n\n```\n- [ ] not a task, inside code\n```\n');
w(`Journal/${iso(0)}.md`, '# Today\n');
w(`Journal/${iso(-1)}.md`, '# Yesterday\n');
w(`Journal/${prevMonth}.md`, '# Last month\n');
w('Home.md', [
  '# Home', '',
  '```dataview', 'TASK FROM "Tasks" WHERE !completed', '```', '',
  '```dataview', 'TASK FROM "Tasks" WHERE due AND due <= date(today) + dur(7 days) SORT due ASC', '```', '',
  '```dataview', 'TASK WHERE contains(tags, "#urgent")', '```', '',
  '```dataview', 'TASK FROM "Tasks" GROUP BY owner', '```', '',
  '```dataview', 'TABLE length(file.tasks) AS "Tasks" FROM "Tasks" SORT file.name ASC', '```', '',
  '```dataview', 'TASK FROM "Tasks" WHERE fullyCompleted', '```', '',
  '```dataview', 'CALENDAR file.day FROM "Journal"', '```', '',
  '```dataview', 'TASK WHERE completed LIMIT 1', '```', '',
].join('\n'));
w('Command Center.md', '# Plan\n\n# Left\n## Open tasks\n```dataview\nTASK FROM "Tasks" WHERE !completed AND status != "-"\n```\n\n# Right\n## Journal\n```dataview\nCALENDAR file.day FROM "Journal"\n```\n');
console.log('task test vault ready:', d);
