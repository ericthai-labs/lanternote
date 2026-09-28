// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under PolyForm Noncommercial 1.0.0 — see LICENSE.txt.
// Advert pictures and the illustrated guide PDF, from the screenshots of
// scripts/shots.js. Normally run by scripts/make-media.js; by hand:
//   LANTERNOTE_SRC=. npx electron scripts/render-ads.js <shots dir> <ads out dir> [guide.md guide.pdf]
// Render to a local drive, then copy into OneDrive (OneDrive may lock files being overwritten).
// Claims in the adverts must stay measurable: see docs/guide/User-Guide.md ("Why Lanternote").
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const [shots, outAds, guideMd, guidePdf] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/render-ads\.js$/.test(a) && a !== '.');
const TMP = path.join(os.tmpdir(), 'lanternote-render-tmp');
const url = (f) => 'file:///' + path.join(shots, f).replace(/\\/g, '/');

const BASE = `*{box-sizing:border-box;margin:0}body{font-family:"Segoe UI",system-ui,sans-serif;color:#e8ecf7;background:#05070f;overflow:hidden}
.brand{font-weight:800;letter-spacing:.32em;font-size:22px;color:#f0c46a;text-shadow:0 0 14px rgba(240,181,65,.45)}
.brand b{display:inline-block;width:12px;height:12px;border-radius:50%;background:#fff8e6;box-shadow:0 0 12px #fff;margin-right:12px;vertical-align:2px}
h1{font-weight:800;line-height:1.08;letter-spacing:-.01em}
h1 em{font-style:normal;color:#f0b541}
.sub{color:#b3bdd8;line-height:1.45}
.foot{color:#8591b3;font-size:18px;letter-spacing:.04em}
.chip{display:inline-block;padding:6px 14px;border-radius:20px;border:1px solid rgba(240,181,65,.35);background:rgba(30,26,16,.7);margin:0 8px 8px 0;font-size:18px;color:#f3dcae}
.shot{border-radius:14px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 0 1px rgba(150,175,255,.18)}
.shot img{display:block;width:100%}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 15% 10%,rgba(240,181,65,.16),transparent 55%),radial-gradient(ellipse at 90% 90%,rgba(47,111,219,.25),transparent 55%),#070a14}
.grid{display:grid;gap:18px}
.tile{border-radius:16px;padding:24px 26px;background:rgba(20,26,43,.85);border:1px solid rgba(150,175,255,.16)}
.tile .ico{font-size:40px;line-height:1;margin-bottom:12px;color:#f0b541}
.tile h3{font-size:27px;font-weight:700;margin-bottom:8px}
.tile p{font-size:19px;color:#aab4cf;line-height:1.4}
table.cmp{border-collapse:separate;border-spacing:0;width:100%;font-size:21px}
.cmp th,.cmp td{padding:var(--pad,13px) 18px;border-bottom:1px solid rgba(150,175,255,.14);text-align:center}
.cmp th:first-child,.cmp td:first-child{text-align:left;color:#dfe5f2}
.cmp thead th{font-size:19px;color:#9aa5c2;font-weight:600}
.cmp .us{background:rgba(240,181,65,.12);color:#fff}
.cmp thead .us{color:#f0c46a;font-size:22px;font-weight:800;border-radius:12px 12px 0 0}
.y{color:#58d08c;font-weight:700}.n{color:#ff7a7a;font-weight:700}.v{color:#f3ad5e}`;
const crop = (f, top = 40) => `<div class="shot"><img src="${url(f)}" style="margin-top:-${top}px"></div>`;
const brand = '<div class="brand"><b></b>LANTERNOTE</div>';
const bgImg = (f, pos, size) => `<div style="position:absolute;inset:0;background:url('${url(f)}') no-repeat;background-position:${pos};background-size:${size}"></div>`;

const FEATURES = [
  ['✦', 'Galaxy of your notes', 'Every star is a note, every arm a folder. Zoom, point, click to open.'],
  ['⌂', 'Command Center', 'Projects, due dates, tasks, calendar and recent notes on one page.'],
  ['☑', 'Tasks and kanban', 'Task lists from queries and drag-and-drop boards — all plain Markdown.'],
  ['▦', 'Live queries', 'Tables, lists and month calendars that update as notes change.'],
  ['⚹', 'Link graph', 'Hundreds of thousands of links, laid out once — no graphics card needed.'],
  ['⚡', 'Built for size', '≈ 200,000 notes: opens in 1–2 s, queries in ≈ 0.1 s.'],
  ['◈', 'Works with your AI', 'Claude and other MCP assistants search, query and edit your notes — every change undoable.'],
  ['◉', 'Your files, your PC', 'Plain Markdown, wiki links, canvas. No account, no cloud. Portable, no install.'],
];
const COMPARE = [
  ['Notes stay on your PC, works offline', 'y', 'n', 'y'],
  ['Plain Markdown files you own', 'y', 'n', 'y'],
  ['Tested with 200,000 notes', 'y', 'v', 'v'],
  ['Link graph without a graphics card', 'y', 'v', 'v'],
  ['Command Center + galaxy of your notes', 'y', 'n', 'n'],
  ['Tables, task lists, calendars from queries', 'y', 'v', 'v'],
  ['Tick tasks inside query results', 'y', 'v', 'v'],
  ['Kanban boards stored as plain Markdown', 'y', 'n', 'v'],
  ['Portable — no install, no admin rights', 'y', 'n', 'v'],
  ['AI assistant reads and edits notes, with undo', 'y', 'v', 'v'],
];
const mark = (k) => (k === 'y' ? '<span class="y">✔</span>' : k === 'n' ? '<span class="n">✘</span>' : '<span class="v">varies</span>');
const table = (rows, fs = 21) => `<table class="cmp" style="font-size:${fs}px"><thead><tr><th></th><th class="us">Lanternote</th><th>Typical cloud<br>note apps</th><th>Typical local<br>Markdown apps</th></tr></thead><tbody>${rows.map(([f, a, b, c]) => `<tr><td>${f}</td><td class="us">${mark(a)}</td><td>${mark(b)}</td><td>${mark(c)}</td></tr>`).join('')}</tbody></table>`;
const cmpNote = '<div class="foot" style="font-size:15px">General comparison — features of other products vary by product and version. Lanternote figures measured on a 203,000-note folder.</div>';

const ADS = [
  ['ad-01-galaxy-1920x1080', 1920, 1080, `
    ${bgImg('ad-raw-galaxy-wide.png', '380px -40px', '1920px 1080px')}
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,7,15,.96) 0%,rgba(5,7,15,.85) 30%,rgba(5,7,15,0) 55%)"></div>
    <div style="position:absolute;left:110px;top:180px;width:780px">${brand}
      <h1 style="font-size:84px;margin:44px 0 30px">Your notes,<br>as a <em>galaxy</em>.</h1>
      <p class="sub" style="font-size:29px">Every star is a note. Every arm is a folder. Notes you just edited shine. Zoom in, point, click to open.</p>
      <div style="margin-top:40px"><span class="chip">200,000 notes, still smooth</span><span class="chip">No graphics card needed</span><span class="chip">Nothing leaves your PC</span></div>
    </div>
    <div class="foot" style="position:absolute;left:110px;bottom:70px">For Windows · Plain Markdown files · Portable</div>`],
  ['ad-02-command-center-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:66px;text-align:center">${brand}
      <h1 style="font-size:66px;margin:24px 0 12px">One page. <em>Everything</em> that matters.</h1>
      <p class="sub" style="font-size:26px">Projects, due dates, open tasks, a calendar and recent notes — built from a note you can edit.</p>
    </div>
    <div style="position:absolute;left:250px;right:250px;top:320px">${crop('ad-raw-cc-wide.png')}</div>`],
  ['ad-03-tasks-calendar-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:100px;top:230px;width:640px">${brand}
      <h1 style="font-size:60px;margin:40px 0 28px">Tasks and calendars,<br><em>straight from<br>your notes.</em></h1>
      <p class="sub" style="font-size:26px">Every <b>- [ ]</b> in every note, with due dates. Tick one in the list and the note is updated. A month view shows what happened when.</p>
    </div>
    <div style="position:absolute;left:880px;top:90px;width:900px">${crop('ad-raw-tasks-square.png')}</div>`],
  ['ad-04-queries-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:100px;top:230px;width:600px">${brand}
      <h1 style="font-size:56px;margin:40px 0 28px">Write in Markdown.<br><em>Query it like<br>a database.</em></h1>
      <p class="sub" style="font-size:26px">Live tables and lists from your notes' fields — they update as you write. Your notes stay ordinary .md files.</p>
    </div>
    <div style="position:absolute;left:740px;top:170px;width:1080px">${crop('ad-raw-queries-wide.png')}</div>`],
  ['ad-05-graph-1920x1080', 1920, 1080, `
    ${bgImg('ad-raw-graph-wide.png', '0 -40px', '1920px 1080px')}
    <div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(5,7,15,.97) 0%,rgba(5,7,15,.8) 34%,rgba(5,7,15,0) 60%)"></div>
    <div style="position:absolute;left:110px;bottom:90px;width:1400px">${brand}
      <h1 style="font-size:68px;margin:30px 0 20px">A link graph for <em>very large</em> folders.</h1>
      <p class="sub" style="font-size:27px">Hundreds of thousands of notes and links, laid out once and opened instantly — even on a PC without a graphics card.</p>
    </div>`],
  ['ad-06-click-a-star-1920x1080', 1920, 1080, `
    ${bgImg('ad-raw-galaxy-zoom-wide.png', '0 -40px', '1920px 1080px')}
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,7,15,0) 45%,rgba(5,7,15,.9) 72%,rgba(5,7,15,.97) 100%)"></div>
    <div style="position:absolute;right:100px;top:250px;width:760px;text-align:right">${brand}
      <h1 style="font-size:68px;margin:40px 0 28px">Click a star.<br><em>Open a note.</em></h1>
      <p class="sub" style="font-size:27px">Zoom in to read the names. Highlight a folder to see its whole arm. Nothing leaves your PC.</p>
    </div>`],
  ['ad-07-features-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:64px;text-align:center">${brand}
      <h1 style="font-size:60px;margin:20px 0 0">Everything your notes need. <em>In one app.</em></h1>
    </div>
    <div class="grid" style="position:absolute;left:110px;right:110px;top:220px;grid-template-columns:repeat(4,1fr)">
      ${FEATURES.map(([i, h, p]) => `<div class="tile"><div class="ico">${i}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}
    </div>
    <div class="grid" style="position:absolute;left:110px;right:110px;top:690px;grid-template-columns:repeat(4,1fr)">
      ${['ad-raw-galaxy-wide.png', 'ad-raw-cc-wide.png', 'ad-raw-tasks-wide.png', 'ad-raw-graph-wide.png'].map((f) => `<div class="shot" style="height:190px"><img src="${url(f)}" style="margin-top:-2.1%"></div>`).join('')}
    </div>
    <div class="foot" style="position:absolute;left:0;right:0;bottom:60px;text-align:center">For Windows · Plain Markdown files · No account, no cloud</div>`],
  ['ad-08-comparison-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:56px;text-align:center">${brand}
      <h1 style="font-size:58px;margin:18px 0 0">Why <em>Lanternote</em>?</h1>
    </div>
    <div style="position:absolute;left:200px;right:200px;top:210px;--pad:13px">${table(COMPARE, 23)}</div>
    <div style="position:absolute;left:230px;right:230px;bottom:48px;text-align:center">${cmpNote}</div>`],
  ['ad-09-ai-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:100px;top:210px;width:700px">${brand}
      <h1 style="font-size:60px;margin:40px 0 28px">Your notes,<br><em>ready for your AI.</em></h1>
      <p class="sub" style="font-size:26px">Claude and other MCP assistants can search, run queries, tick tasks and write notes through Lanternote — on your PC, in your folder. Every change keeps the old text.</p>
      <div style="margin-top:34px"><span class="chip">Read-only or read + write</span><span class="chip">Limit it to some folders</span><span class="chip">Every edit undoable</span></div>
    </div>
    <div class="shot" style="position:absolute;left:880px;top:140px;width:900px;height:760px"><img src="${url('g19-ai-connection.png')}" style="width:1500px;max-width:none;margin:-90px 0 0 -335px"></div>`],
  ['ad-10-kanban-1920x1080', 1920, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:66px;text-align:center">${brand}
      <h1 style="font-size:66px;margin:24px 0 12px">Kanban boards that are <em>just notes</em>.</h1>
      <p class="sub" style="font-size:26px">Drag cards between lanes. Due dates turn red when late. Every board is a plain Markdown file.</p>
    </div>
    <div class="shot" style="position:absolute;left:170px;right:170px;top:300px;height:700px"><img src="${url('ad-raw-kanban-wide.png')}" style="width:2250px;max-width:none;margin:-46px 0 0 -8px"></div>`],
  ['sq-01-galaxy-1080x1080', 1080, 1080, `
    ${bgImg('ad-raw-galaxy-square.png', '0 -40px', '1080px 1080px')}
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,15,.97) 0%,rgba(5,7,15,.75) 22%,rgba(5,7,15,0) 40%,rgba(5,7,15,0) 80%,rgba(5,7,15,.9) 100%)"></div>
    <div style="position:absolute;left:0;right:0;top:64px;text-align:center">${brand}
      <h1 style="font-size:62px;margin:22px 0 0">Your notes,<br>as a <em>galaxy</em>.</h1>
    </div>
    <div class="foot" style="position:absolute;left:0;right:0;bottom:44px;text-align:center">Every star is a note · 200,000 notes, still smooth</div>`],
  ['sq-02-command-center-1080x1080', 1080, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:60px;text-align:center">${brand}
      <h1 style="font-size:52px;margin:20px 0 0">One page. <em>Everything</em><br>that matters.</h1>
    </div>
    <div style="position:absolute;left:70px;right:70px;top:280px">${crop('ad-raw-cc-square.png')}</div>`],
  ['sq-03-tasks-1080x1080', 1080, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:60px;text-align:center">${brand}
      <h1 style="font-size:52px;margin:20px 0 0">Tick a task anywhere.<br><em>The note follows.</em></h1>
    </div>
    <div style="position:absolute;left:70px;right:70px;top:280px">${crop('ad-raw-tasks-square.png')}</div>`],
  ['sq-04-comparison-1080x1080', 1080, 1080, `<div class="bg"></div>
    <div style="position:absolute;left:0;right:0;top:56px;text-align:center">${brand}
      <h1 style="font-size:52px;margin:18px 0 0">Why <em>Lanternote</em>?</h1>
    </div>
    <div style="position:absolute;left:44px;right:44px;top:200px;--pad:14px">${table(COMPARE, 18)}</div>
    <div style="position:absolute;left:50px;right:50px;bottom:34px;text-align:center">${cmpNote}</div>`],
];

async function capture(html, w, h, file) {
  const win = new BrowserWindow({ show: false, width: w, height: h, useContentSize: true, webPreferences: { offscreen: true } });
  const tmp = path.join(TMP, 'ad.html');
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 900));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(file, img.resize({ width: w, height: h }).toPNG());
  win.destroy();
  console.log('wrote', file);
}

app.on('window-all-closed', () => {}); // keep going between captures
app.whenReady().then(async () => {
  fs.mkdirSync(outAds, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
  for (const [name, w, h, body] of ADS) {
    await capture(`<!doctype html><meta charset="utf-8"><style>${BASE}html,body{width:${w}px;height:${h}px;position:relative}</style><body>${body}</body>`, w, h, path.join(outAds, name + '.png'));
  }
  if (guideMd && guidePdf) {
    const { marked } = require(path.join(process.env.LANTERNOTE_SRC || path.join(__dirname, '..'), 'node_modules', 'marked'));
    const md = fs.readFileSync(guideMd, 'utf8').replace(/^---[\s\S]*?---\r?\n/, '');
    const dir = path.dirname(path.resolve(guideMd));
    const html = `<!doctype html><meta charset="utf-8"><base href="file:///${dir.replace(/\\/g, '/')}/"><style>
      body{font-family:"Segoe UI",sans-serif;color:#1d2230;font-size:13px;line-height:1.55;margin:0 12px}
      h1{font-size:28px;margin:0 0 6px}h2{font-size:19px;margin:26px 0 8px;padding-top:8px;border-top:1px solid #e3ddcc;page-break-after:avoid}
      h3{font-size:15px;margin:16px 0 6px}img{max-width:100%;border-radius:6px;border:1px solid #d5dbe8;margin:6px 0 4px;page-break-inside:avoid}
      table{border-collapse:collapse;margin:8px 0;page-break-inside:avoid}td,th{border:1px solid #e3ddcc;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f6f1e4}
      code{background:#f4f1ea;padding:1px 4px;border-radius:3px;font-size:12px}pre{background:#f4f1ea;padding:8px 10px;border-radius:6px;white-space:pre-wrap}
      em{color:#555}</style>
      <body>${marked.parse(md)}</body>`;
    const tmp = path.join(TMP, 'guide.html');
    fs.writeFileSync(tmp, html);
    const win = new BrowserWindow({ show: false, width: 1000, height: 1400 });
    await win.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 1500));
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Lanternote — User Guide · page <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
    fs.writeFileSync(guidePdf, pdf);
    console.log('wrote', guidePdf);
  }
  app.quit();
});
