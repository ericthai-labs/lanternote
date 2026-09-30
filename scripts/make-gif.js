// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Turns the frames recorded by scripts/demo-gif.js into docs/images/demo.gif.
//   node scripts/make-gif.js <frames folder> [out.gif] [width]
// Needs ffmpeg on PATH. Two passes: one palette for the whole clip, then the GIF.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const [dir, gif = path.join(__dirname, '..', 'docs', 'images', 'demo.gif'), width = '880'] = process.argv.slice(2);
const list = path.join(dir, 'frames.txt');
const palette = path.join(dir, 'palette.png');
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error('ffmpeg failed' + (r.error ? ': ' + r.error.message : ''));
};
const filters = `fps=10,scale=${width}:-1:flags=lanczos`;
ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `${filters},palettegen=stats_mode=diff:max_colors=160`, palette]);
ff(['-f', 'concat', '-safe', '0', '-i', list, '-i', palette, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, '-loop', '0', gif]);
console.log(`gif: ${gif} (${(fs.statSync(gif).size / 1048576).toFixed(1)} MB)`);
