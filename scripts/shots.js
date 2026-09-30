// Screenshots for the user guide and adverts, taken on the made-up vault
// from scripts/make-demo-vault.js (never on a real one). Normally run by
// scripts/make-media.js; by hand:
//   node scripts/make-demo-vault.js E:/lanternote-demo-vault
//   THEME=dark node scripts/drive.js E:/lanternote-demo-vault scripts/shots.js <out folder>
// Guide pictures (g-*) are 1440x900; advert captures (ad-raw-*) 1920x1080 and 1080x1080.
const view = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(600); };
const panels = (left, right = left) => ev(`g('layout').classList.toggle('no-left', ${!left}); g('layout').classList.toggle('no-right', ${!right})`);
const dvDone = "![...document.querySelectorAll('.dv')].some(b => b.isConnected && b.offsetParent && /Running|index/i.test(b.textContent))";
const openAndWait = async (p) => { await ev(`showView('note'); openNote(${JSON.stringify(p)})`); await until(`current === ${JSON.stringify(p)}`, 10000); await until(dvDone, 60000); await sleep(900); };
const hoverNote = async (rel) => {
  await ev(`(() => { const i = CC.sky.data.notes.indexOf(${JSON.stringify(rel)}); const [x, y] = CC.sky.screenOf(i); const r = g('ccSky').getBoundingClientRect(); g('ccSky').dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x, clientY: r.top + y, bubbles: true })); })()`);
  await sleep(500);
};
const zoomTo = (rel, z) => ev(`(() => { const i = CC.sky.data.notes.indexOf(${JSON.stringify(rel)}); const [x, y] = CC.sky.screenOf(i); CC.sky.zoomAt(${z}, x, y); })()`);
const galaxyChrome = (on) => ev(`g('ccLegend').style.visibility = '${on ? '' : 'hidden'}'; document.querySelector('.cc-dock').style.visibility = '${on ? '' : 'hidden'}'`);

await until("typeof V !== 'undefined' && V.notes.length > 1000", 600000);
await until("/ notes · /.test(g('status').textContent)", 900000); // text index ready: the status bar shows counts
// a still galaxy while shooting, so every picture is the same whatever the timing
await ev("Prefs.set('theme', 'dark'); Prefs.set('ccBackground', 'still'); Prefs.set('ccMotion', 'normal'); Prefs.set('dvDateFormat', 'dd/MM/yyyy')");
await ev("Ed.toggleTo('read')");
await view(1440, 900);
await panels(true);

await openAndWait('Welcome.md');
await shot('g01-main-window');
await ev("openSwitcher(); g('swInput').value = 'amber harbor'; swFilter()"); await sleep(500);
await shot('g02-quick-open');
await ev('closeSwitcher()');
await ev("setTab('search'); g('searchInput').value = 'river pattern season'; runSearch()");
await until("/notes?/.test(g('searchInfo').textContent) && !/not complete|Searching/.test(g('searchInfo').textContent)", 240000);
await ev('runSearch()'); await sleep(800);
await shot('g03-search');
await ev("setTab('files')");
const proj = await ev("V.notes.find(p => p.startsWith('01-Projects/'))");
await ev(`openNote(${JSON.stringify(proj)})`); await ev("Ed.toggleTo('edit')"); await sleep(1500);
await shot('g04-editing');
// 1.18: live preview (cursor at the end, so the rest reads like the reading view), tabs, the right pane
const endOfNote = "(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: v.state.doc.length } }); v.scrollDOM.scrollTop = 0; })()";
await ev(endOfNote); await sleep(800);
await shot('g04b-live-preview');
const other = await ev(`V.notes.find(p => p.startsWith('01-Projects/') && p !== ${JSON.stringify(proj)})`);
await ev(`Tabs.openNew(${JSON.stringify(other)})`); await until(`current === ${JSON.stringify(other)}`, 10000);
await ev("Tabs.switchTo(0)"); await until(`current === ${JSON.stringify(proj)}`, 10000);
await ev(endOfNote);
await ev("Split.open('Welcome.md')"); await until("Split.path === 'Welcome.md'", 10000); await sleep(1200);
await shot('g04c-tabs-split');
await ev("Split.hide()"); await ev("Tabs.close(1)"); await sleep(400);
await ev("Ed.toggleTo('read')");
await ev("openNote('Ideas board.canvas')"); await until("CanvasView.active()", 10000); await sleep(1200);
await shot('g05-canvas');
await openAndWait('Projects dashboard.md');
await shot('g06-queries');
await openAndWait('Tasks and calendar.md');
await shot('g07-tasks');
await ev("(() => { const c = [...document.querySelectorAll('#note .dv-cal-cell.has')]; c[Math.max(0, c.length - 3)].click(); })()"); await sleep(500);
await ev("document.querySelector('#note .dv-cal').scrollIntoView({ block: 'start' })"); await sleep(300);
await shot('g08-calendar');
await ev("showView('note'); openNote('Launch board.md')"); await until("KanbanView.active()", 10000); await sleep(900);
await shot('g20-kanban');
await openAndWait('Welcome.md');
await ev("toggleGraph('global')");
await until("!/Laying|Loading|Preparing/i.test(g('graphInfo').textContent) && g('graphInfo').textContent.length > 0", 600000);
await sleep(2000); await ev("g('graphFit').click()"); await sleep(2000);
await shot('g09-graph');
await ev("toggleGraph('local')"); await sleep(3500);
await shot('g10-graph-local');
await ev("showView('note')");
// Command Center, without the outline panel so the page gets the room
await panels(true, false);
await ev('toggleCC()');
await until("view === 'cc' && document.querySelectorAll('#ccBody .dv').length >= 3", 20000); await until(dvDone, 60000); await sleep(1500);
await shot('g11-command-center');
await ev("document.querySelector('[data-cc-act=\"galaxy\"]').click()"); await sleep(1200);
await shot('g12-galaxy');
await zoomTo('06-Maps/Design map.md', 9); await sleep(800);
await shot('g13-galaxy-zoom');
await hoverNote('06-Maps/Design map.md');
await shot('g14-galaxy-hover');
await ev("CC.sky.setExplore(false); CC.sky.setExplore(true)");
await ev("document.querySelector('.cc-lg[data-hl=\"1\"]').click()"); await sleep(800);
await shot('g15-galaxy-highlight');
await ev("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
await panels(true);
await ev("Prefs.open('Command Center')"); await sleep(600);
await shot('g16-settings');
// the AI connection page; this copy's folders are shown as a typical install folder
await ev("Prefs.open('AI connection')"); await sleep(700);
const mi = await ev('window.api.mcpInfo()');
const FAKE = [[mi.command, 'C:\\Apps\\Lanternote\\Lanternote.exe'], [mi.script, 'C:\\Apps\\Lanternote\\resources\\app.asar\\mcp\\lanternote-mcp.js']]
  .flatMap(([a, b]) => [[a, b], [JSON.stringify(a).slice(1, -1), JSON.stringify(b).slice(1, -1)]]);
await ev(`(() => { const P = ${JSON.stringify(FAKE)}; document.querySelectorAll('.set-code').forEach((c) => { let t = c.textContent; for (const [a, b] of P) t = t.split(a).join(b); c.textContent = t; }); })()`);
await shot('g19-ai-connection');
await ev("g('settings').hidden = true");
await ev("Ed.palette(); g('palInput').value = 'command'; g('palInput').dispatchEvent(new Event('input'))"); await sleep(500);
await shot('g17-command-palette');
await ev("g('palette').hidden = true");
await ev("Prefs.set('theme', 'light'); Prefs.set('ccBackground', 'plain')"); await sleep(1200);
await shot('g18-light-theme');
await ev("Prefs.set('theme', 'dark'); Prefs.set('ccBackground', 'still')"); await sleep(1200);

// adverts: raw captures, no side panels
await panels(false);
for (const [w, h, tag] of [[1920, 1080, 'wide'], [1080, 1080, 'square']]) {
  await view(w, h);
  await ev("showView('cc'); CC.sky.setExplore(false)"); await sleep(1500);
  await shot(`ad-raw-cc-${tag}`);
  await ev('CC.sky.setExplore(true)'); await sleep(1500);
  await galaxyChrome(false); await sleep(300);
  await shot(`ad-raw-galaxy-${tag}`);
  await zoomTo('06-Maps/Design map.md', 7); await sleep(800);
  await shot(`ad-raw-galaxy-zoom-${tag}`);
  await galaxyChrome(true); await ev('CC.sky.setExplore(false)');
  // tasks + calendar side by side: the 'This week' layout on the Command Center
  await ev("Prefs.set('ccNote', 'This week.md')"); await ev("showView('cc'); CC.render()");
  await until("/This week/i.test(g('ccTitle').textContent) && document.querySelector('#ccBody .dv-cal') && document.querySelector('#ccBody .dv-task')", 20000); await sleep(1500);
  await shot(`ad-raw-tasks-${tag}`);
  await ev("Prefs.set('ccNote', 'Command Center.md')");
}
await view(1920, 1080);
await panels(false);
await ev("showView('note'); openNote('Launch board.md')"); await until("KanbanView.active()", 10000); await sleep(900);
await shot('ad-raw-kanban-wide');
await openAndWait('Projects dashboard.md');
await panels(true, false);
await shot('ad-raw-queries-wide');
await panels(false);
await ev("toggleGraph('global')"); await sleep(3000); await ev("g('graphFit').click()"); await sleep(2500);
await ev("(() => { const c = document.querySelector('#graphCanvas canvas'); const r = c.getBoundingClientRect(); for (let k = 0; k < 2; k++) c.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true, cancelable: true })); })()"); await sleep(2500);
await shot('ad-raw-graph-wide');
// writing: live preview on the left, a note to read on the right
await ev("showView('note')"); await panels(false);
await ev(`openNote(${JSON.stringify(proj)})`); await until(`current === ${JSON.stringify(proj)}`, 10000);
await ev("Ed.toggleTo('edit')"); await until("Ed.active()", 5000); await ev(endOfNote);
await ev("Split.open('Welcome.md')"); await until("Split.path === 'Welcome.md'", 10000); await sleep(1200);
await shot('ad-raw-write-wide');
await ev("Split.hide()"); await ev("Ed.toggleTo('read')");
await ev("showView('note')");
const errs = consoleLines.filter((l) => /EXCEPTION|^error:/i.test(l));
log('errors', errs.length, errs.join(' / '));
