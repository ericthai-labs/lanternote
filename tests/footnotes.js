// Footnotes in reading view (1.23). Folder: the basic one from run-all.js; a note is added.
const fs = require('fs'), path = require('path');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);

await until("typeof V !== 'undefined' && V.notes.length >= 3", 30000);
fs.writeFileSync(path.join(dir, 'Fn.md'), [
  '# Fn', '',
  'Torque the bolt[^t] and check it[^c]. Again[^t]. Inline one^[made in place].', '',
  '`code [^t] stays`', '',
  '## Part', '', 'Only here[^p].', '',
  '[^t]: Torque per **AMM** 29-11-00.',
  '[^c]: Visual check,',
  '    continued on the next line.',
  '[^p]: From part.',
  '[^unused]: Never referenced.', '',
].join('\n'));
fs.writeFileSync(path.join(dir, 'Embeds.md'), '# Embeds\n\n![[Fn#Part]]\n');
await until("V.idx.has('Fn.md') && V.idx.has('Embeds.md')", 10000);
await ev("openNote('Fn.md')"); await until("current === 'Fn.md'", 5000);
await ev("Ed.toggleTo('read')"); await sleep(400);

const refs = await ev("[...document.querySelectorAll('#note sup.fn-ref a')].map(a => a.textContent).join(',')");
ok('references become numbers in order, a repeated one keeps its number', refs === '1,2,1,3,4', refs);
ok('a reference inside code stays text', await ev("document.querySelector('#note code').textContent.includes('[^t]')"));
const items = await ev("[...document.querySelectorAll('#note .footnotes li')].map(li => li.dataset.fnDef).join(',')");
ok('the footnotes are listed at the end in the order used, unused last', items === 't,c,inline-1,p,unused', items);
ok('footnote text is formatted', await ev("!!document.querySelector('#note .footnotes li[data-fn-def=\"t\"] strong')"));
ok('an indented line continues a footnote', await ev("document.querySelector('#note .footnotes li[data-fn-def=\"c\"]').textContent.includes('continued on the next line')"));
ok('the definitions are not shown as paragraphs', !(await ev("[...document.querySelectorAll('#note p')].some(p => p.textContent.startsWith('[^'))")));
ok('pointing at a number shows the text', await ev("document.querySelector('#note sup.fn-ref a').title.includes('Torque per AMM')"));
ok('an inline footnote is listed', await ev("document.querySelector('#note .footnotes li[data-fn-def=\"inline-1\"]').textContent.includes('made in place')"));

await ev("g('main').scrollTop = 0");
await ev("document.querySelectorAll('#note sup.fn-ref a')[1].click()"); await sleep(400);
ok('clicking a number scrolls to its footnote', await ev("(() => { const li = document.querySelector('#note .footnotes li[data-fn-def=\"c\"]').getBoundingClientRect(); return li.top >= 0 && li.bottom <= innerHeight; })()"));
ok('it does not open anything', await ev("current === 'Fn.md'"));
await ev("document.querySelector('#note .footnotes li[data-fn-def=\"c\"] .fn-back').click()"); await sleep(300);
ok('↩ goes back to the text', await ev("(() => { const r = document.querySelectorAll('#note sup.fn-ref a')[1].getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()"));

// an embedded section keeps its footnote text
await ev("openNote('Embeds.md')"); await until("current === 'Embeds.md'", 5000); await sleep(300);
ok('an embedded section shows its footnotes', await ev("(() => { const e = document.querySelector('#note .embed'); return !!e && e.querySelector('sup.fn-ref a')?.textContent === '1' && e.querySelector('.footnotes li[data-fn-def=\"p\"]')?.textContent.includes('From part'); })()"));
