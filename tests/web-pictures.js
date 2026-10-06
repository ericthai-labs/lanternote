// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Pictures from the internet are not fetched unless Settings allows it or the reader clicks one.
// A small web server on this PC counts every request the app makes to it.
const fs = require('fs'), path = require('path'), http = require('http');
const dir = process.env.TV;
const ok = (name, cond, extra = '') => log((cond ? 'PASS ' : 'FAIL ') + name, extra);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEIGBmgAAAhAgL/2m0y3AAAAABJRU5ErkJggg==', 'base64');
const hits = {};
const server = http.createServer((req, res) => { hits[req.url] = (hits[req.url] || 0) + 1; res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const web = `http://127.0.0.1:${server.address().port}`;
const n = (u) => hits[u] || 0;
try {
  await until("typeof V !== 'undefined' && !!current", 30000);
  fs.writeFileSync(path.join(dir, 'Web.md'), `# Web\n\n![chart](${web}/md.png)\n\n<img src="${web}/html.png">\n\n![[sunset.png]]\n`);
  await until("V.idx.has('Web.md')", 15000);
  await ev("openNote('Web.md')"); await sleep(800);
  ok('nothing fetched from the internet by default', n('/md.png') === 0 && n('/html.png') === 0, JSON.stringify(hits));
  ok('a placeholder shows instead of the picture', (await ev("g('note').querySelectorAll('.web-pic').length")) === 1, await ev("g('note').querySelector('.web-pic')?.textContent"));
  ok('pictures in the folder still show', (await ev("g('note').querySelectorAll('img[data-vault-src]').length")) === 1);
  await ev("g('note').querySelector('.web-pic').click()"); await sleep(800);
  ok('clicking the placeholder loads that one picture', n('/md.png') === 1 && n('/html.png') === 0 && (await ev(`[...g('note').querySelectorAll('img')].some((i) => i.src.endsWith('/md.png') && i.naturalWidth > 0)`)), JSON.stringify(hits));
  ok('live preview does not fetch it', (await ev(`pictureUrl('${web}/x.png', 'Web.md', false)`)) === null);
  await ev("Prefs.set('remoteImages', true)"); await sleep(800);
  ok('with the setting on, every picture loads', n('/html.png') >= 1 && (await ev("g('note').querySelectorAll('.web-pic').length")) === 0, JSON.stringify(hits));
  await ev("Prefs.set('remoteImages', false)"); await sleep(300);

  // a picture outside the folder, linked as file:///… (drawings kept on another drive)
  const outDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ln-out pics-'));
  const outPic = path.join(outDir, 'chart 1.png'), outTxt = path.join(outDir, 'secret.txt');
  fs.writeFileSync(outPic, png); fs.writeFileSync(outTxt, 'not a picture');
  const fileUrl = (p) => require('url').pathToFileURL(p).toString();
  fs.writeFileSync(path.join(dir, 'Out.md'), `# Out\n\n![drawing](${fileUrl(outPic)})\n\n![txt](${fileUrl(outTxt)})\n`);
  await until("V.idx.has('Out.md')", 15000);
  await ev("openNote('Out.md')"); await sleep(800);
  ok('a picture outside the folder shows', await ev("[...g('note').querySelectorAll('img[data-ext-src]')].some((i) => i.naturalWidth > 0)"),
    await ev("g('note').querySelector('img[data-ext-src]')?.src"));
  const loads = (u) => ev(`new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = extUrl('${u}') + '?' + Math.random(); })`);  // a fresh address: never the cache
  ok('a file outside the folder that is no picture is not shown', (await ev("g('note').querySelectorAll('img[data-ext-src]').length")) === 1,
    await ev("g('note').querySelector('.muted')?.textContent"));
  ok('the picture loads while the setting is on', await loads(fileUrl(outPic)));
  ok('live preview shows it too', /^vault:\/\/ext\//.test(await ev(`pictureUrl('${fileUrl(outPic)}', 'Out.md', false)`)));
  await ev("Prefs.set('localImages', false)"); await sleep(800);
  ok('setting off: shown as text, not read', (await ev("g('note').querySelectorAll('img[data-ext-src]').length")) === 0
    && !(await loads(fileUrl(outPic))), await ev("g('note').querySelector('.muted')?.textContent"));
  await ev("Prefs.set('localImages', true)"); await sleep(300);

  // a document outside the folder: a link that opens it in its own app — never a program
  const outBat = path.join(outDir, 'run.bat');
  fs.writeFileSync(outBat, '@echo off');
  fs.writeFileSync(path.join(dir, 'Docs.md'), `# Docs\n\n[datasheet](${fileUrl(path.join(outDir, 'ds.pdf'))}) · [program](${fileUrl(outBat)})\n`);
  await until("V.idx.has('Docs.md')", 15000);
  await ev("openNote('Docs.md')"); await sleep(800);
  ok('a file:/// link shows as a link', (await ev("g('note').querySelectorAll('a[data-file-href]').length")) === 2,
    await ev("g('note').querySelector('a[data-file-href]')?.dataset.fileHref"));
  ok('a program outside the folder is never opened', (await ev(`window.api.openExternal('${fileUrl(outBat)}')`)) === false);
  ok('a missing document is not opened', (await ev(`window.api.openExternal('${fileUrl(path.join(outDir, 'ds.pdf'))}')`)) === false);
} finally { server.close(); }
