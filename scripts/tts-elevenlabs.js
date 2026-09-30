// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// ElevenLabs text-to-speech for scripts/make-tiktok.js. The key is read from the
// ELEVENLABS_API_KEY environment variable, or else from the file ~/.elevenlabs-api-key
// (in your home folder — keep it out of synced folders and repositories). It is never
// printed or written anywhere.
//   node scripts/tts-elevenlabs.js --list                     voices in your account (name, id, language)
//   node scripts/tts-elevenlabs.js --models                   models, and which speak Vietnamese
//   node scripts/tts-elevenlabs.js <text file> <out.mp3> <voice id> [model] [language]
// Model: eleven_v3 (default; speaks Vietnamese), or eleven_flash_v2_5 / eleven_turbo_v2_5.
const fs = require('fs');
const keyFile = require('path').join(require('os').homedir(), '.elevenlabs-api-key');
const KEY = (process.env.ELEVENLABS_API_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
if (!KEY) { console.error(`No ElevenLabs key: set ELEVENLABS_API_KEY or put it in ${keyFile}`); process.exit(2); }
const API = 'https://api.elevenlabs.io';
const headers = { 'xi-api-key': KEY, 'Content-Type': 'application/json' };

async function main() {
  const a = process.argv.slice(2);
  if (a[0] === '--models') {
    const r = await fetch(`${API}/v1/models`, { headers });
    if (!r.ok) throw new Error(`models: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    for (const m of await r.json()) {
      const vi = (m.languages || []).some((l) => /^vi/i.test(l.language_id || '') || /vietnam/i.test(l.name || ''));
      console.log([m.model_id, m.name, m.can_do_text_to_speech ? 'tts' : '-', vi ? 'Vietnamese' : ''].join(' | '));
    }
    return;
  }
  if (a[0] === '--list') {
    const r = await fetch(`${API}/v1/voices`, { headers });
    if (!r.ok) throw new Error(`voices: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    const { voices } = await r.json();
    for (const v of voices) {
      const l = v.labels || {};
      console.log([v.voice_id, v.name, v.category, l.language || '', l.accent || '', l.gender || '', l.age || '', l.description || l.use_case || ''].join(' | '));
    }
    return;
  }
  const [txt, out, voice, model = 'eleven_v3', language = 'vi'] = a;
  if (!txt || !out || !voice) throw new Error('usage: <text file> <out.mp3> <voice id> [model] [language]');
  const body = { text: fs.readFileSync(txt, 'utf8'), model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true } };
  if (language) body.language_code = language;
  const r = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`speech: HTTP ${r.status} ${(await r.text()).slice(0, 400)}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
