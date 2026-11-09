// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Speed checks on a vault the size of a large real one (no real data).
//   node scripts/make-big-vault.js <empty folder> [notes = 240000]
// A made-up vault shaped like the real one: 240,000 notes in ~600 folders, ~13 wiki links per note,
// front matter on every note (some with status / revision), ~3 KB of text each. No real data.
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const N = +(process.argv[3] || 240000);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const words = 'pump valve actuator brake wheel torque check inspect replace remove install panel wire connector harness sensor duct seal bolt nut test system fault message task procedure figure part ata reference limit damage repair'.split(' ');
const name = (i) => `N${String(i).padStart(6, '0')} ${words[i % words.length]}`;
const folder = (i) => `F${String(i % 600).padStart(3, '0')}/S${(i >> 3) % 4}`;
fs.mkdirSync(root, { recursive: true });
const made = new Set();
const t = Date.now();
for (let i = 0; i < N; i++) {
  const dir = path.join(root, folder(i));
  if (!made.has(dir)) { fs.mkdirSync(dir, { recursive: true }); made.add(dir); }
  const links = [];
  for (let k = 0; k < 13; k++) links.push(`[[${name(Math.floor(rnd() * N))}]]`);
  const fm = ['---', `doc_id: D-${i}`, `trangthai: ${i % 50 === 0 ? 'superseded' : 'active'}`, `revision: Rev ${i % 9}`, `tags: [ata/${i % 40}]`, '---'];
  const body = [];
  for (let s = 0; s < 18; s++) { let line = ''; for (let k = 0; k < 24; k++) line += words[Math.floor(rnd() * words.length)] + ' '; body.push(line); }
  body.splice(3, 0, links.slice(0, 7).join(' '));
  body.splice(10, 0, links.slice(7).join(' '));
  fs.writeFileSync(path.join(dir, name(i) + '.md'), fm.join('\n') + `\n# ${name(i)}\n\n` + body.join('\n\n') + '\n');
  if (i % 20000 === 0) process.stdout.write(`\r${i}`);
}
console.log(`\n${N} notes in ${made.size} folders, ${((Date.now() - t) / 1000).toFixed(0)} s`);
