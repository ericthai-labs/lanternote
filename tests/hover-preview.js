// Link preview on hover (1.23). Folder: the basic one from run-all.js
// (Home.md links [[A]] [[Missing]] [md](sub/B.md) and has two tasks; sub/B.md embeds ![[A#A]]).
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const at = async (sel) => JSON.parse(await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'null'; const b = e.getBoundingClientRect(); return JSON.stringify({ x: b.x + Math.min(6, b.width / 2), y: b.y + b.height / 2 }); })()`));
async function point(sel, modifiers = 0) {
  const r = await at(sel);
  if (!r) throw new Error('not found: ' + sel);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, modifiers });
}
const away = () => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 300 });
const card = () => ev("(() => { const c = Hover._card(); return c && !c.hidden ? c.innerText : null; })()");

await until("typeof V !== 'undefined' && V.notes.length >= 3 && current === 'Home.md'", 30000);
await ev("Prefs.set('hoverPreview', true)");
await ev("Ed.toggleTo('read')"); await sleep(300);

await point('#note a.internal[data-path="A.md"]');
await until("Hover.visible", 3000).catch(() => {});
let t = await card();
ok('pointing at a link shows the note it points to', t && t.includes('Text of A'), JSON.stringify(t));
ok('the card shows the note name', await ev("Hover._card().querySelector('.hover-title').textContent === 'A'"));
await away();
await until("!Hover.visible", 3000).catch(() => {});
ok('moving away closes the card', !(await ev("Hover.visible")));

await point('#note a.internal[data-path="sub/B.md"]');
await until("Hover.visible", 3000).catch(() => {});
t = await card();
ok('a Markdown link previews too, with its embeds', t && t.includes('alias') && t.includes('Text of A'), JSON.stringify(t));
ok('the card has no element ids (no clash with the open note)', await ev("Hover._card().querySelectorAll('.hover-body [id]').length === 0"));
// moving into the card keeps it open
await point('.hover-card .hover-body');
await sleep(500);
ok('the card stays open while the pointer is on it', await ev("Hover.visible"));
await away(); await until("!Hover.visible", 3000).catch(() => {});

await point('#note a.internal.unresolved');
await until("Hover.visible", 3000).catch(() => {});
t = await card();
ok('a link to a missing note says so', t && /does not exist/.test(t), JSON.stringify(t));
await away(); await until("!Hover.visible", 3000).catch(() => {});

// a note with tasks (Home itself): they cannot be ticked from there
await ev("(() => { const a = document.createElement('a'); a.className = 'internal'; a.dataset.path = 'Home.md'; a.id = 'hv-test'; a.textContent = 'self'; document.querySelector('#note').prepend(a); })()");
await point('#hv-test');
await until("Hover.visible", 3000).catch(() => {});
ok('tasks in the card are read-only', await ev("[...Hover._card().querySelectorAll('input[type=checkbox]')].every(c => c.disabled && !c.dataset.task) && Hover._card().querySelectorAll('input[type=checkbox]').length === 2"), await ev("JSON.stringify([Hover.visible, [...Hover._card().querySelectorAll('input')].map(c => [c.disabled, c.dataset.task]), Hover._card().innerText.slice(0,80)])"));
await ev("document.getElementById('hv-test').remove()");
await away(); await until("!Hover.visible", 3000).catch(() => {});

// Escape closes it
await point('#note a.internal[data-path="A.md"]');
await until("Hover.visible", 3000).catch(() => {});
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(200);
ok('Escape closes the card', !(await ev("Hover.visible")));
await away(); await sleep(300);

// in the editor: only with Ctrl
await ev("Prefs.set('livePreview', true)");
await ev("Ed.toggleTo('edit')"); await until("Ed.active() && !!Ed._cm()", 5000);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: 0 } }); })()"); await sleep(400);
await point('#editorHost .cm-lp-link[data-target="A"]');
await sleep(800);
ok('in the editor, pointing without Ctrl shows nothing', !(await ev("Hover.visible")));
await away(); await sleep(200);
await point('#editorHost .cm-lp-link[data-target="A"]', 2); // 2 = Ctrl
await until("Hover.visible", 3000).catch(() => {});
t = await card();
ok('in the editor, Ctrl + pointing shows the note', t && t.includes('Text of A'), JSON.stringify(t));
await away(); await until("!Hover.visible", 3000).catch(() => {});
await ev("Ed.toggleTo('read')"); await sleep(300);

// turned off
await ev("Prefs.set('hoverPreview', false)");
await point('#note a.internal[data-path="A.md"]');
await sleep(800);
ok('Settings can turn it off', !(await ev("Hover.visible")));
await ev("Prefs.set('hoverPreview', true)");
await away();
