// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Records the short demo shown at the top of the README (docs/images/demo.gif),
// on the made-up vault from scripts/make-demo-vault.js. Run by make-media.js, or:
//   DEMO_OUT=<frames folder> node scripts/drive.js <demo vault> scripts/demo-gif.js
// then scripts/make-gif.js turns the frames into the GIF (needs ffmpeg).
const fs = require('fs');
const path = require('path');
const out = process.env.DEMO_OUT;
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- recorder: screenshots as fast as the window gives them, with their times
const frames = []; let recording = false, stopped = false;
const recorder = (async () => {
  while (!stopped) {
    if (!recording) { await sleep(40); continue; }
    const t = Date.now();
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    if (recording) frames.push({ t, data: r.data });
  }
})();
const play = async (ms) => { recording = true; await sleep(ms); };
const pause = () => { recording = false; };
const typeInto = async (id, text, after) => {
  for (let i = 1; i <= text.length; i++) { await ev(`g('${id}').value = ${JSON.stringify(text.slice(0, i))}; ${after}`); await sleep(90); }
};

await until("typeof V !== 'undefined' && V.notes.length > 1000", 600000);
await until("/ notes · /.test(g('status').textContent)", 900000);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await ev("Prefs.set('theme', 'dark'); Prefs.set('ccBackground', 'moving'); Prefs.set('ccMotion', 'normal'); Prefs.set('dvDateFormat', 'dd/MM/yyyy')");
await ev("Ed.toggleTo('read'); showView('note'); openNote('Welcome.md')"); await until("current === 'Welcome.md'", 10000); await sleep(1500);

// 1. the note
await play(1200);
// 2. quick open by name
await ev('openSwitcher()'); await typeInto('swInput', 'amber harbor', 'swFilter()'); await play(900);
const hit = await ev("V.notes.find(p => /amber harbor/i.test(p)) || 'Welcome.md'");
await ev(`closeSwitcher(); openNote(${JSON.stringify(hit)})`); await play(1300);
// 3. full-text search
await ev("setTab('search')"); await typeInto('searchInput', 'river pattern', ''); await ev('runSearch()');
pause(); await until("/notes?/.test(g('searchInfo').textContent) && !/not complete|Searching/.test(g('searchInfo').textContent)", 240000);
await play(1800);
await ev("setTab('files')");
// 4. Command Center with the moving sky
await ev('toggleCC()'); await sleep(300); await play(2600);
// 5. the galaxy: fly in towards one note
await ev("document.querySelector('[data-cc-act=\"galaxy\"]').click()"); await play(1500);
const target = '06-Maps/Design map.md';
for (let z = 1.12; z < 9; z *= 1.12) {
  await ev(`(() => { const i = CC.sky.data.notes.indexOf(${JSON.stringify(target)}); const [x, y] = CC.sky.screenOf(i); CC.sky.zoomAt(1.12, x, y); })()`);
  await play(70);
}
await play(1400);
// 6. the link graph of all notes
pause(); await ev("CC.sky.setExplore(false); showView('note'); toggleGraph('global')");
await until("!/Laying|Loading|Preparing/i.test(g('graphInfo').textContent) && g('graphInfo').textContent.length > 0", 600000);
await sleep(1500); await ev("g('graphFit').click()"); await sleep(1500);
await play(2200);
pause(); stopped = true; await recorder;

// frames + how long each is shown, for ffmpeg's concat demuxer
const lines = ['ffconcat version 1.0'];
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.jpg`;
  fs.writeFileSync(path.join(out, name), Buffer.from(f.data, 'base64'));
  const next = frames[i + 1];
  const dur = next && next.t - f.t < 400 ? (next.t - f.t) / 1000 : 0.08; // gaps (paused while loading) are cut
  lines.push(`file '${name}'`, `duration ${dur.toFixed(3)}`);
});
lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
fs.writeFileSync(path.join(out, 'frames.txt'), lines.join('\n') + '\n');
log(`demo: ${frames.length} frames`);
