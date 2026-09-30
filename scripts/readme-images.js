// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Refreshes the pictures the README shows (docs/images/) from a media run:
// resized and saved as JPEG so the repository stays small. Run with Electron
// (it uses nativeImage); make-media.js calls it after the adverts are made.
//   electron scripts/readme-images.js <shots dir> <ads dir> [out dir]
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const [shots, ads, out = path.join(__dirname, '..', 'docs', 'images')] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// [published name, source folder, source file, width]
const PICTURES = [
  ['hero', ads, 'ad-01-galaxy-1920x1080.png', 1600],
  ['main-window', shots, 'g01-main-window.png', 1440],
  ['command-center', shots, 'g11-command-center.png', 1440],
  ['galaxy', shots, 'g12-galaxy.png', 1440],
  ['graph', shots, 'g09-graph.png', 1440],
  ['editing', shots, 'g04-editing.png', 1440],
  ['search', shots, 'g03-search.png', 1440],
  ['queries', shots, 'g06-queries.png', 1440],
  ['tasks', shots, 'g07-tasks.png', 1440],
  ['calendar', shots, 'g08-calendar.png', 1440],
  ['kanban', shots, 'g20-kanban.png', 1440],
  ['canvas', shots, 'g05-canvas.png', 1440],
  ['ai-connection', shots, 'g19-ai-connection.png', 1440],
  ['light-theme', shots, 'g18-light-theme.png', 1440],
  ['comparison', ads, 'ad-08-comparison-1920x1080.png', 1600],
];

app.whenReady().then(() => {
  fs.mkdirSync(out, { recursive: true });
  let bytes = 0;
  for (const [name, dir, file, width] of PICTURES) {
    const src = path.join(dir, file);
    if (!fs.existsSync(src)) { console.error('missing', src); app.exit(1); return; }
    let img = nativeImage.createFromPath(src);
    if (img.getSize().width > width) img = img.resize({ width, quality: 'best' });
    const buf = img.toJPEG(86);
    fs.writeFileSync(path.join(out, name + '.jpg'), buf);
    bytes += buf.length;
  }
  console.log(`readme images: ${PICTURES.length} pictures, ${(bytes / 1048576).toFixed(1)} MB in ${out}`);
  app.quit();
});
