// Builds the temporary vault used by tests/command-center.js:
//   node tests/make-cc-vault.js <empty folder>
const fs = require('fs'), path = require('path');
const d = path.resolve(process.argv[2]);
fs.rmSync(d, { recursive: true, force: true });
const w = (rel, text, daysAgo = 3) => {
  const f = path.join(d, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text);
  const t = new Date(Date.now() - daysAgo * 86400000); fs.utimesSync(f, t, t);
};
const iso = (days) => { const t = new Date(); t.setDate(t.getDate() + days); return t.toISOString().slice(0, 10); };
w('00-Inbox/Idea.md', '# Idea\n#idea\n', 10);
w('00-Inbox/Capture.md', '# Capture\n#idea #todo\n', 9);
w('01-Process/Running.md', '# Running\n[[Idea]]\n', 8);
w('03-Projects/Alpha.md', `---\ndue: ${iso(3)}\ntags: [project]\n---\n# Alpha\n[[Running]]\n`, 5);
w('03-Projects/Beta.md', `---\ndue: ${iso(10)}\ntags: [project]\n---\n# Beta\n`, 4);
w('03-Projects/Gamma.md', `---\ndue: ${iso(40)}\ntags: [project]\n---\n# Gamma\n`, 6);
w('03-Projects/Old.md', `---\ndue: ${iso(-2)}\n---\n# Old\n`, 30);
w('Home.md', '# Home\n[[Alpha]]\n', 2);
w('Latest.md', '# Latest\n', 0);
console.log('command center test vault ready:', d);
