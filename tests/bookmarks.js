// Bookmarks (1.23). Folder: the basic one from run-all.js.
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const shown = () => ev("[...document.querySelectorAll('#bmList .bm')].map(e => e.dataset.path).join(', ')");

await until("typeof V !== 'undefined' && V.notes.length >= 3 && current === 'Home.md'", 30000);
await ev("Ed.toggleTo('read')"); await sleep(300);
// start clean (settings can survive from another run)
await ev("Bookmarks.list.forEach(p => Bookmarks.toggle(p))"); await sleep(200);
ok('no bookmarks: the section is hidden', await ev("g('bmBox').hidden"));
ok('the note shows a ☆ Bookmark button', await ev("/Bookmark/.test(document.querySelector('#note [data-bm]').textContent)"));

await ev("document.querySelector('#note [data-bm]').click()"); await sleep(300);
ok('the button bookmarks the open note', (await shown()) === 'Home.md', await shown());
ok('the button shows it is bookmarked', await ev("document.querySelector('#note [data-bm]').textContent.includes('★')"));
ok('the section appears above the file list', await ev("!g('bmBox').hidden && g('bmCount').textContent === '1'"));

await ev("Bookmarks.toggle('A.md')"); await ev("Bookmarks.toggle('sub/B.md')"); await sleep(200);
ok('more bookmarks keep the order they were added', (await shown()) === 'Home.md, A.md, sub/B.md', await shown());

// clicking a bookmark opens it
await ev("document.querySelector('#bmList .bm[data-path=\"A.md\"]').click()");
await until("current === 'A.md'", 5000);
ok('clicking a bookmark opens the note', true);
ok('the open note is marked in the list', await ev("document.querySelector('#bmList .bm.on').dataset.path === 'A.md'"));

// the file menu
await ev("(() => { const r = document.querySelector('#bmList .bm[data-path=\"sub/B.md\"]').getBoundingClientRect(); document.querySelector('#bmList .bm[data-path=\"sub/B.md\"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 })); })()");
await sleep(200);
ok('the file menu offers Remove bookmark', await ev("[...document.querySelectorAll('#ctxMenu .mi')].some(m => m.textContent === 'Remove bookmark')"));
await ev("[...document.querySelectorAll('#ctxMenu .mi')].find(m => m.textContent === 'Remove bookmark').click()"); await sleep(200);
ok('Remove bookmark takes it out', (await shown()) === 'Home.md, A.md', await shown());

// renaming a bookmarked note keeps the bookmark
await ev("Ed.renameTo ? Ed.renameTo('A.md', 'A renamed.md') : null");
const canRename = await ev("typeof Ed.renameTo === 'function'");
if (canRename) {
  await until("V.idx.has('A renamed.md')", 10000);
  await sleep(300);
  ok('renaming a note moves its bookmark', (await shown()) === 'Home.md, A renamed.md', await shown());
}

// saved: they come back after a reload of the folder
await ev("reloadVault(false)"); await sleep(2500);
await until("document.querySelectorAll('#bmList .bm').length >= 2", 10000).catch(() => {});
ok('bookmarks are kept', (await shown()).startsWith('Home.md, A'), await shown());
await ev("Bookmarks.list.forEach(p => Bookmarks.toggle(p))");
