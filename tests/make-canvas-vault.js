// Builds the temporary vault used by tests/canvas.js:
//   node tests/make-canvas-vault.js <empty folder>
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const d = path.resolve(process.argv[2]);
fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(d, 'pics'), { recursive: true });
function png(file, W, H) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, dd) => { const l = Buffer.alloc(4); l.writeUInt32BE(dd.length); const td = Buffer.concat([Buffer.from(t), dd]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / W) | 0; raw[o + 1] = (y * 160 / H) | 0; raw[o + 2] = 80; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
png(path.join(d, 'pics', 'sunset.png'), 1600, 900);
fs.writeFileSync(path.join(d, 'Home.md'), '# Home\nStart here.\n');
fs.writeFileSync(path.join(d, 'Plan.md'), '# Plan\n## Goals\n- one\n- two\n');
const canvas = {
  nodes: [
    { id: 'g1', type: 'group', x: -60, y: -80, width: 900, height: 560, label: 'Project', color: '5' },
    { id: 't1', type: 'text', x: 0, y: 0, width: 300, height: 140, text: '# Idea\nSee [[Plan]] and **bold** text.', color: '2', 'x-extra': 'keep me' },
    { id: 'f1', type: 'file', x: 400, y: 0, width: 360, height: 260, file: 'Plan.md' },
    { id: 'f2', type: 'file', x: 0, y: 220, width: 300, height: 180, file: 'pics/sunset.png' },
    { id: 'l1', type: 'link', x: 400, y: 320, width: 360, height: 100, url: 'https://jsoncanvas.org' },
  ],
  edges: [
    { id: 'e1', fromNode: 't1', fromSide: 'right', toNode: 'f1', toSide: 'left', label: 'details', color: '1' },
    { id: 'e2', fromNode: 't1', fromSide: 'bottom', toNode: 'f2', toSide: 'top' },
  ],
  'x-top': 'also keep',
};
fs.writeFileSync(path.join(d, 'Board.canvas'), JSON.stringify(canvas, null, '\t'));
console.log('canvas test vault ready:', d);
