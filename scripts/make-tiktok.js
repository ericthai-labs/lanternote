// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// A short vertical video (1080×1920) with a spoken voice-over, for TikTok / Reels / Shorts.
//   node scripts/make-tiktok.js <work folder> [--to "<folder to copy the .mp4 into>"] [--voice vi-VN-HoaiMyNeural]
//     [--engine edge | elevenlabs] [--el-voice <voice id>] [--el-model eleven_v3] [--name <suffix of the .mp4>]
// --engine elevenlabs reads the key from ELEVENLABS_API_KEY (scripts/tts-elevenlabs.js --list shows the voices).
// Needs: ffmpeg on PATH, `pip install edge-tts` (the voice is made by an online text-to-speech
// service: only the lines below are sent), and the made-up vault of scripts/make-media.js
// (<work folder>/demo-vault — never a real one).
// Steps: voice per scene (edge-tts) → the app recorded for as long as each line lasts
// (scripts/tiktok.js) → title + subtitle cards (scripts/render-tiktok.js) → ffmpeg.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const to = flag('--to', null), voice = flag('--voice', 'vi-VN-HoaiMyNeural'), rate = flag('--rate', '+6%');
const engine = flag('--engine', 'edge'), elVoice = flag('--el-voice', null), elModel = flag('--el-model', 'eleven_v3'), name = flag('--name', 'vi');
if (engine === 'elevenlabs' && !elVoice) throw new Error('--engine elevenlabs needs --el-voice <voice id> (node scripts/tts-elevenlabs.js --list)');
const work = path.resolve(args[0] || 'E:/lanternote-media');
const src = path.join(__dirname, '..');
const demo = path.join(work, 'demo-vault'), dir = path.join(work, 'tiktok');
const version = require(path.join(src, 'package.json')).version;

// say: what the voice reads (numbers in words); sub: the subtitle; title: the big line on top
const SCENES = [
  { id: 'galaxy', title: 'Ghi chú của bạn,\n<em>thành một thiên hà</em>',
    say: 'Hàng trăm nghìn ghi chú, hiện thành một thiên hà. Mỗi ngôi sao là một ghi chú, bấm vào là mở.',
    sub: 'Hàng trăm nghìn ghi chú, hiện thành một thiên hà. Mỗi ngôi sao là một ghi chú — bấm vào là mở.' },
  { id: 'write', title: 'Viết Markdown,\n<em>thấy ngay khi gõ</em>',
    say: 'Viết bằng Markdown và thấy kết quả ngay khi gõ. Việc cần làm tick được, liên kết bấm được.',
    sub: 'Viết bằng Markdown, thấy kết quả ngay khi gõ. Việc cần làm tick được, liên kết bấm được.' },
  { id: 'split', title: 'Nhiều tab,\n<em>chia đôi màn hình</em>',
    say: 'Mở nhiều tab, và đọc một ghi chú bên phải trong khi viết bên trái.',
    sub: 'Mở nhiều tab — đọc một ghi chú bên phải trong khi viết bên trái.' },
  { id: 'cc', title: 'Mọi thứ quan trọng\n<em>trên một trang</em>',
    say: 'Dự án, hạn chót, việc cần làm và lịch, gom về một trang tổng quan.',
    sub: 'Dự án, hạn chót, việc cần làm và lịch — gom về một trang tổng quan.' },
  { id: 'graph', title: '200.000 ghi chú,\n<em>vẫn mượt</em>',
    say: 'Đã thử với hai trăm nghìn ghi chú. Đồ thị liên kết chạy được cả trên máy không có card đồ hoạ.',
    sub: 'Đã thử với 200.000 ghi chú. Đồ thị liên kết chạy cả trên máy không có card đồ hoạ.' },
  { id: 'end', title: '<em>Lanternote</em>',
    say: 'Ghi chú là file Markdown nằm trên máy bạn, không cần tài khoản. Có cho Windows, Mác và Linux. Tìm Lanternote trên GitHub.',
    sub: 'File Markdown trên máy bạn, không cần tài khoản.\nWindows · macOS · Linux\ngithub.com/ericthai-labs/lanternote' },
];

const run = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { cwd: src, encoding: 'utf8', maxBuffer: 1 << 26, ...opts, env: { ...process.env, ...(opts.env || {}) } });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed (${r.status}): ${(r.stderr || '').slice(-800)}`);
  return r.stdout || '';
};
const seconds = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
if (!fs.existsSync(path.join(demo, 'Welcome.md'))) throw new Error(`no demo vault in ${demo} — run scripts/make-media.js first`);
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });

// 1. the voice, one file per scene
const edge = process.platform === 'win32' ? 'edge-tts.exe' : 'edge-tts';
for (const s of SCENES) {
  const mp3 = path.join(dir, `voice-${s.id}.mp3`), txt = path.join(dir, `voice-${s.id}.txt`);
  fs.writeFileSync(txt, s.say, 'utf8'); // a file, not an argument: Vietnamese survives the Windows command line
  for (let i = 1; ; i++) { // the online services now and then answer with no audio
    try {
      if (engine === 'elevenlabs') run(process.execPath, ['scripts/tts-elevenlabs.js', txt, mp3, elVoice, elModel]);
      else run(edge, ['--voice', voice, `--rate=${rate}`, '--file', txt, '--write-media', mp3]);
      break;
    } catch (e) { if (i >= 4) throw e; console.log(`voice ${s.id}: retry ${i}`); }
  }
  s.voice = seconds(mp3);
  s.len = +(s.voice + 0.55).toFixed(2); // a breath between scenes
  console.log(`voice ${s.id}: ${s.voice.toFixed(2)} s`);
}
const plan = path.join(dir, 'plan.json');
fs.writeFileSync(plan, JSON.stringify(SCENES.map(({ id, len }) => ({ id, len })), null, 1));

// 2. the app, recorded scene by scene on the made-up vault (1080×1080)
run(process.execPath, ['scripts/drive.js', demo, 'scripts/tiktok.js'], { env: { TIKTOK_PLAN: plan, TIKTOK_OUT: dir, THEME: 'dark' }, stdio: 'inherit', encoding: undefined });

// 3. title / subtitle cards
fs.writeFileSync(path.join(dir, 'cards.json'), JSON.stringify(SCENES.map(({ id, title, sub }) => ({ id, title, sub })), null, 1));
run(require(path.join(src, 'node_modules', 'electron')), ['scripts/render-tiktok.js', dir], { stdio: 'inherit', encoding: undefined });

// 4. each scene: card + app video (+ its voice), then all scenes joined
const parts = [];
for (const s of SCENES) {
  const part = path.join(dir, `part-${s.id}.mp4`);
  run('ffmpeg', ['-y', '-loglevel', 'error',
    '-loop', '1', '-framerate', '30', '-i', path.join(dir, `card-${s.id}.png`),
    '-f', 'concat', '-safe', '0', '-i', path.join(dir, `frames-${s.id}`, 'frames.txt'),
    '-i', path.join(dir, `voice-${s.id}.mp3`),
    '-filter_complex',
    `[1:v]scale=1080:1080,fps=30,setpts=PTS-STARTPTS[app];[0:v][app]overlay=0:350:shortest=0,trim=duration=${s.len},fade=t=in:st=0:d=0.25,fade=t=out:st=${(s.len - 0.25).toFixed(2)}:d=0.25,format=yuv420p[v];` +
    `[2:a]adelay=150|150,apad,atrim=duration=${s.len},aresample=48000[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-t', String(s.len), part]);
  parts.push(part);
}
const list = path.join(dir, 'parts.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n');
const out = path.join(dir, `Lanternote-${version}-tiktok-${name}.mp4`);
run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-movflags', '+faststart', out]);
console.log(`video: ${out} (${seconds(out).toFixed(1)} s)`);
// the voice-over text, for the TikTok caption / accessibility
fs.writeFileSync(path.join(dir, 'loi-thoai.txt'), SCENES.map((s) => s.say).join('\n') + '\n');
if (to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of [out, path.join(dir, 'loi-thoai.txt')]) fs.copyFileSync(f, path.join(to, path.basename(f)));
  console.log('copied to', to);
}
