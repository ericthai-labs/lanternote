// The indexer stops unexpectedly: the app must start it again, reopen the
// folder and keep queries and search working. Needs LANTERNOTE_TEST=1 and the
// vault made by tests/make-dv-vault.js.
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
await until("typeof V !== 'undefined' && V.notes.length >= 8", 30000);
await ev("Ed.toggleTo('read')"); await ev("openNote('Dashboard.md')");
await until("document.querySelectorAll('#note .dv tbody tr').length > 0", 15000);
await ev('window.api.testCrashIndexer()');
await sleep(300);
// a query right after the crash must not show the null error
await ev("document.querySelectorAll('#note .dv').forEach(b => b.innerHTML = ''); DvView.refresh(g('note'))");
await sleep(3500);
const errs = await ev("[...document.querySelectorAll('#note .dv-error')].map(e => e.textContent).filter(t => /null/.test(t))");
ok('no "reading files of null" error after the indexer stopped', errs.length === 0, JSON.stringify(errs));
ok('queries show results again', (await ev("document.querySelectorAll('#note .dv')[0].querySelectorAll('tbody tr').length")) === 2);
ok('the user is told', /rebuilt/.test(await ev("g('toast').textContent")), await ev("g('toast').textContent"));
const s = await ev("(async () => { setTab('search'); g('searchInput').value = 'Alpha'; for (let i = 0; i < 20; i++) { await runSearch(); if (/^[1-9]/.test(g('searchInfo').textContent)) break; await new Promise(r => setTimeout(r, 500)); } return g('searchInfo').textContent; })()");
ok('search works after the restart', /^[1-9]/.test(s), s);
