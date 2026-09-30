// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Title + subtitle cards (1080×1920) for scripts/make-tiktok.js: one PNG per scene, with a
// 1080×1080 space at y = 350 where the recorded app goes. Run with Electron:
//   electron scripts/render-tiktok.js <folder with cards.json>
// Layout keeps text out of the areas TikTok covers (top ~150 px, bottom ~320 px).
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const dir = process.argv.slice(2).find((a) => !/render-tiktok\.js$/.test(a) && a !== '.' && !a.startsWith('--'));
const cards = JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8'));
const TMP = path.join(os.tmpdir(), 'lanternote-tiktok-tmp');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const CSS = `*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{font-family:"Segoe UI",system-ui,sans-serif;color:#eef1fa;background:radial-gradient(ellipse at 20% 5%,rgba(240,181,65,.22),transparent 50%),radial-gradient(ellipse at 90% 95%,rgba(47,111,219,.30),transparent 55%),#070a14;position:relative}
.brand{position:absolute;top:150px;left:0;right:0;text-align:center;font-weight:800;letter-spacing:.34em;font-size:24px;color:#f0c46a;text-shadow:0 0 14px rgba(240,181,65,.45)}
.brand b{display:inline-block;width:12px;height:12px;border-radius:50%;background:#fff8e6;box-shadow:0 0 12px #fff;margin-right:12px;vertical-align:2px}
h1{position:absolute;top:192px;left:40px;right:40px;height:150px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:58px;font-weight:800;line-height:1.1;letter-spacing:-.01em}
h1 em{font-style:normal;color:#f0b541}
h1.big{font-size:92px}
.frame{position:absolute;top:348px;left:-2px;width:1084px;height:1084px;border-top:2px solid rgba(240,181,65,.55);border-bottom:2px solid rgba(240,181,65,.55);background:#0f1422}
.sub{position:absolute;top:1452px;left:56px;right:56px;text-align:center;font-size:40px;font-weight:600;line-height:1.32;color:#fff;white-space:pre-line;text-shadow:0 2px 10px rgba(0,0,0,.6)}`;

async function capture(html, file) {
  const win = new BrowserWindow({ show: false, width: 1080, height: 1920, useContentSize: true, webPreferences: { offscreen: true } });
  const tmp = path.join(TMP, 'card.html');
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  // a hidden window is no taller than the screen: capture through DevTools at the exact size
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 700));
  const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 }, captureBeyondViewport: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  dbg.detach();
  win.destroy();
  console.log('wrote', file);
}

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  for (const c of cards) {
    // the title may use <em> for the accent colour and \n for a line break; everything else is text
    const title = esc(c.title).replace(/&lt;(\/?)em&gt;/g, '<$1em>').replace(/\n/g, '<br>');
    const big = !/\n/.test(c.title);
    const body = `<div class="brand"><b></b>LANTERNOTE</div><h1${big ? ' class="big"' : ''}><span>${title}</span></h1><div class="frame"></div><div class="sub">${esc(c.sub)}</div>`;
    await capture(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>${body}</body>`, path.join(dir, `card-${c.id}.png`));
  }
  app.quit();
});
