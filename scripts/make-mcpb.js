// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Builds the Claude Desktop extension: dist-<version>/lanternote-<version>.mcpb
// (an MCP Bundle — double-click to install, pick the notes folder, done).
//   node scripts/make-mcpb.js [out folder]
// It holds only the MCP server and the indexer it shares with the app (no
// dependencies); Claude Desktop runs it with its own Node. Writing is OFF unless
// the user turns on "Let the AI edit notes". Also writes server.json for the
// MCP Registry with the bundle's SHA-256.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const src = path.join(__dirname, '..');
const pkg = require(path.join(src, 'package.json'));
const version = pkg.version;
const out = path.resolve(process.argv[2] || path.join(src, `dist-${version}`));
const FILES = ['mcp/lanternote-mcp.js', 'indexer.js', 'search-index.js', 'src/core.js', 'src/dataview.js', 'package.json', 'LICENSE.txt', 'NOTICE'];
const REPO = 'https://github.com/ericthai-labs/lanternote';

const TOOLS = [
  ['vault_info', 'Overview of the notes folder: notes, links, top folders and tags'],
  ['search', 'Full-text search in every note, accents optional'],
  ['find_notes', 'Find notes by name'],
  ['read_note', 'Read a note, or one section under a heading'],
  ['verify_quote', 'Check that a quotation and its numbers really are in a note before citing it'],
  ['links', 'Outgoing links and backlinks of a note'],
  ['recent', 'Notes edited most recently'],
  ['query', 'Run a Dataview-language query (TABLE, LIST, TASK, CALENDAR) and get JSON'],
  ['list_tasks', 'Open or done tasks across notes, by due date, folder or tag'],
  ['create_note', 'Create a note (only when editing is allowed)'],
  ['append_to_note', 'Add text to a note or a section (only when editing is allowed)'],
  ['replace_in_note', 'Replace an exact passage in a note (only when editing is allowed)'],
  ['set_task', 'Tick or untick a task (only when editing is allowed)'],
  ['set_property', 'Set a front-matter property (only when editing is allowed)'],
];

const manifest = {
  manifest_version: '0.2',
  name: 'lanternote',
  display_name: 'Lanternote',
  version,
  description: 'Search, read and query a folder of Markdown notes — even 200,000 of them. Optional, reversible editing.',
  long_description: 'Lanternote gives Claude fast access to a local folder of Markdown notes (wiki links, tags, front matter, tasks) through the same indexer as the Lanternote desktop app: full-text search, notes by name, backlinks, Dataview-language queries and task lists, tested on 190,000+ notes. Read-only by default. Turn on "Let the AI edit notes" to let Claude create notes, append, replace passages, tick tasks and set properties — every change keeps the previous text as a recovery copy and is logged. Nothing is uploaded by the extension itself; the notes Claude reads are sent to Claude as part of the conversation.',
  author: { name: 'Eric Thai', url: REPO },
  repository: { type: 'git', url: REPO },
  homepage: 'https://ericthai-labs.github.io/lanternote/',
  documentation: `${REPO}#readme`,
  support: `${REPO}/issues`,
  license: 'Apache-2.0',
  keywords: ['markdown', 'notes', 'knowledge-base', 'wiki-links', 'dataview', 'tasks', 'search', 'pkm'],
  server: {
    type: 'node',
    entry_point: 'server/mcp/lanternote-mcp.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/mcp/lanternote-mcp.js', '--vault', '${user_config.vault}', '--only', '${user_config.only}'],
      env: { LANTERNOTE_ALLOW_WRITE: '${user_config.allow_writing}' },
    },
  },
  tools: TOOLS.map(([name, description]) => ({ name, description })),
  tools_generated: true,
  user_config: {
    vault: { type: 'directory', title: 'Notes folder', description: 'The folder of Markdown notes Claude may use.', required: true },
    allow_writing: { type: 'boolean', title: 'Let the AI edit notes', description: 'Off: read only. On: Claude may create and change notes; every change keeps the previous text.', default: false, required: false },
    only: { type: 'string', title: 'Only these folders (optional)', description: 'Comma-separated folders inside the notes folder, e.g. "Projects, Journal". Empty = the whole folder.', default: '', required: false },
  },
  compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=18.0.0' } },
};

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'lanternote-mcpb-'));
try {
  for (const f of FILES) {
    const to = path.join(stage, f === 'LICENSE.txt' || f === 'NOTICE' || f === 'package.json' ? f : path.join('server', f));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, f), to);
  }
  // the server reads ../package.json from server/mcp — keep one next to it too
  fs.copyFileSync(path.join(src, 'package.json'), path.join(stage, 'server', 'package.json'));
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const icon = path.join(src, 'docs', 'images', 'icon.png');
  if (fs.existsSync(icon)) { fs.copyFileSync(icon, path.join(stage, 'icon.png')); manifest.icon = 'icon.png'; fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); }

  fs.mkdirSync(out, { recursive: true });
  const bundle = path.join(out, `lanternote-${version}.mcpb`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const run = (a) => { const r = spawnSync(npx, ['--yes', '@anthropic-ai/mcpb', ...a], { stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) throw new Error('mcpb ' + a[0] + ' failed'); };
  run(['validate', path.join(stage, 'manifest.json')]);
  run(['pack', stage, bundle]);

  const sha = crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
  // MCP Registry entry (published with: mcp-publisher login github && mcp-publisher publish)
  const server = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: 'io.github.ericthai-labs/lanternote',
    title: 'Lanternote',
    description: 'Search, read and query large folders of Markdown notes (200,000+). Optional, reversible edits.',
    repository: { url: REPO, source: 'github' },
    websiteUrl: manifest.homepage,
    version,
    packages: [{
      registryType: 'mcpb',
      identifier: `${REPO}/releases/download/v${version}/lanternote-${version}.mcpb`,
      fileSha256: sha,
      transport: { type: 'stdio' },
    }],
  };
  fs.writeFileSync(path.join(src, 'server.json'), JSON.stringify(server, null, 2) + '\n');
  console.log(`mcpb: ${bundle} (${(fs.statSync(bundle).size / 1024).toFixed(0)} KB, sha256 ${sha})\nserver.json updated`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
