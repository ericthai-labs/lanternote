// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Records the app for the short vertical video (scripts/make-tiktok.js), on the made-up
// vault only. Each scene lasts as long as its voice line (TIKTOK_PLAN: [{ id, len }]);
// frames go to TIKTOK_OUT/frames-<id>/ with an ffconcat list.
//   TIKTOK_PLAN=plan.json TIKTOK_OUT=<folder> node scripts/drive.js <demo vault> scripts/tiktok.js
const fs = require('fs'), path = require('path');
const plan = JSON.parse(fs.readFileSync(process.env.TIKTOK_PLAN, 'utf8'));
const OUT = process.env.TIKTOK_OUT;
const len = (id) => plan.find((s) => s.id === id).len * 1000;

// ---- recorder: screenshots as fast as the window gives them, with their times
let frames = [], recording = false, stopped = false;
const recorder = (async () => {
  while (!stopped) {
    if (!recording) { await sleep(20); continue; }
    const t = Date.now();
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    if (recording) frames.push({ t, data: r.data });
  }
})();
let sceneStart = 0;
const begin = () => { frames = []; sceneStart = Date.now(); recording = true; };
const left = (id) => len(id) - (Date.now() - sceneStart);
async function finish(id) {
  if (left(id) > 0) await sleep(left(id));
  recording = false; await sleep(120);
  const dir = path.join(OUT, 'frames-' + id);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(f.data, 'base64'));
    const next = frames[i + 1];
    const dur = next ? (next.t - f.t) / 1000 : Math.max(0.1, (sceneStart + len(id) - f.t) / 1000 + 0.3);
    lines.push(`file '${name}'`, `duration ${dur.toFixed(3)}`);
  });
  lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  fs.writeFileSync(path.join(dir, 'frames.txt'), lines.join('\n') + '\n');
  log(`scene ${id}: ${frames.length} frames, ${(frames.length / (len(id) / 1000)).toFixed(1)} fps`);
}
// spread `steps` actions evenly over `ms`
async function over(ms, steps, fn) { const dt = ms / steps; for (let k = 0; k < steps; k++) { const t0 = Date.now(); await fn(k); const w = dt - (Date.now() - t0); if (w > 0) await sleep(w); } }
const zoomAt = (rel, f) => ev(`(() => { const i = CC.sky.data.notes.indexOf(${JSON.stringify(rel)}); const [x, y] = CC.sky.screenOf(i); CC.sky.zoomAt(${f}, x, y); })()`);

await until("typeof V !== 'undefined' && V.notes.length > 1000", 600000);
await until("/ notes · /.test(g('status').textContent)", 900000);
// 720×720 at 1.5× = 1080×1080 pictures with everything drawn larger, for a phone screen
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 720, deviceScaleFactor: 1.5, mobile: false });
await ev("Prefs.set('theme', 'dark'); Prefs.set('ccBackground', 'moving'); Prefs.set('ccMotion', 'normal'); Prefs.set('fontSize', 17); Prefs.set('dvDateFormat', 'dd/MM/yyyy'); Prefs.set('ccNote', 'Command Center.md')");
await ev("g('layout').classList.add('no-left', 'no-right')");
await ev("Ed.toggleTo('read')");

// 1. the galaxy: fly in towards one note
await ev("showView('cc'); CC.sky.setExplore(true)"); await sleep(1800);
await ev("g('ccLegend').style.visibility = 'hidden'");
begin();
await sleep(900);
await over(len('galaxy') - 1500, 60, () => zoomAt('06-Maps/Design map.md', 1.035));
await finish('galaxy');

// 2. writing with live preview
await ev("CC.sky.setExplore(false); showView('note')");
const proj = await ev("V.notes.find(p => p.startsWith('01-Projects/'))");
await ev(`openNote(${JSON.stringify(proj)})`); await until(`current === ${JSON.stringify(proj)}`, 10000);
await ev("Ed.toggleTo('edit')"); await until("Ed.active()", 5000);
const original = await ev("Ed._cm().getValue()"); // put back afterwards: the demo vault is reused
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true }); v.focus(); })()");
await sleep(800);
const text = '\n\n## Việc hôm nay\n- [ ] Gửi báo cáo tuần\n- [ ] Đọc lại [[Welcome]]\n**Quan trọng:** họp lúc 9 giờ\n';
begin();
await sleep(500);
await over(len('write') * 0.72, text.length, (k) => send('Input.insertText', { text: text[k] }));
// tick the first new task, as a click on the checkbox would
await ev("(() => { const v = Ed._cm().view; const d = v.state.doc.toString(); const at = d.lastIndexOf('- [ ] Gửi báo cáo tuần') + 3; v.dispatch({ changes: { from: at, to: at + 1, insert: 'x' } }); })()");
await finish('write');

// 3. tabs and the right pane
const others = await ev(`JSON.stringify(V.notes.filter(p => p.startsWith('01-Projects/') && p !== ${JSON.stringify(proj)}).slice(0, 2))`);
const [p2, p3] = JSON.parse(others);
// the right pane needs a window at least 900 px wide: 960×960 at 1.125× for this scene
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 960, deviceScaleFactor: 1.125, mobile: false }); await sleep(500);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true }); })()");
begin();
await sleep(400);
await ev(`Tabs.openNew(${JSON.stringify(p2)})`); await sleep(600);
await ev(`Tabs.openNew(${JSON.stringify(p3)})`); await sleep(600);
await ev('Tabs.switchTo(0)'); await sleep(300);
await ev("(() => { const v = Ed._cm().view; v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true }); })()");
await ev("Split.open('Welcome.md')");
await finish('split');
await ev(`Ed._cm().setValue(${JSON.stringify(original)})`); await ev('Ed.flush()');
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 720, deviceScaleFactor: 1.5, mobile: false });

// 4. Command Center
await ev("Split.hide(); Ed.toggleTo('read')"); await sleep(300);
await ev("showView('cc'); CC.sky.setExplore(false)"); await sleep(2500);
begin();
await sleep(1200);
await over(len('cc') - 2200, 50, () => ev("(() => { const s = document.querySelector('.cc-scroll'); if (s) s.scrollTop += 6; })()"));
await finish('cc');

// 5. the link graph of all notes
await ev("showView('note'); toggleGraph('global')");
await until("!/Laying|Loading|Preparing/i.test(g('graphInfo').textContent) && g('graphInfo').textContent.length > 0", 600000);
await sleep(1500); await ev("g('graphFit').click()"); await sleep(1500);
const wheel = () => ev("(() => { const c = document.querySelector('#graphCanvas canvas'); const r = c.getBoundingClientRect(); c.dispatchEvent(new WheelEvent('wheel', { deltaY: -60, clientX: r.left + r.width * 0.52, clientY: r.top + r.height * 0.48, bubbles: true, cancelable: true })); })()");
begin();
await sleep(600);
await over(len('graph') - 1200, 40, wheel);
await finish('graph');

// 6. the end: the galaxy turning
await ev("showView('cc'); CC.sky.setExplore(true)"); await sleep(1800);
await ev("g('ccLegend').style.visibility = 'hidden'; document.querySelector('.cc-dock').style.visibility = 'hidden'");
begin();
await finish('end');

stopped = true; await recorder;
const errs = consoleLines.filter((l) => /EXCEPTION|^error:/i.test(l));
log('errors', errs.length, errs.join(' / '));
