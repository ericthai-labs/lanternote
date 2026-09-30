// MCP server test: talks JSON-RPC over stdio to mcp/lanternote-mcp.js on a
// TEMPORARY vault (made here with tests/make-task-vault.js) and a temporary
// settings folder, so no real notes or settings are touched.
//   node tests/mcp.js
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..');
const V = path.join(os.tmpdir(), 'lanternote-mcp-vault'), U = path.join(os.tmpdir(), 'lanternote-mcp-userdata');
fs.rmSync(U, { recursive: true, force: true }); fs.mkdirSync(U, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'make-task-vault.js'), V]);
const rd = (f) => fs.readFileSync(path.join(V, f), 'utf8');
let failed = 0;
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + name, cond ? '' : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function server(extra = [], env = {}) {
  const cmd = process.env.MCP_CMD ? JSON.parse(process.env.MCP_CMD) : [process.execPath, path.join(root, 'mcp', 'lanternote-mcp.js')];
  const p = spawn(cmd[0], [...cmd.slice(1), '--vault', V, ...extra], { env: { ...process.env, LANTERNOTE_USER_DATA: U, ...(process.env.MCP_ENV ? JSON.parse(process.env.MCP_ENV) : {}), ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0; const waits = new Map(), errs = [];
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); const w = waits.get(m.id); if (w) { waits.delete(m.id); w(m); } } });
  p.stderr.on('data', (d) => errs.push(String(d)));
  const rpc = (method, params) => new Promise((res, rej) => { const k = ++id; const t = setTimeout(() => rej(new Error('timeout ' + method)), 60000); waits.set(k, (m) => { clearTimeout(t); res(m); }); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  const call = async (name, a = {}) => { const m = await rpc('tools/call', { name, arguments: a }); const text = m.result.content[0].text; return m.result.isError ? { error: text } : JSON.parse(text); };
  return { p, rpc, call, errs, close: () => { p.stdin.end(); } };
}

(async () => {
  const s = server();
  const init = await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  ok('initialize: server info and instructions', init.result.serverInfo.name === 'lanternote' && /vault_info/.test(init.result.instructions) && init.result.capabilities.tools, JSON.stringify(init));
  s.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = (await s.rpc('tools/list', {})).result.tools;
  ok('tools/list: 14 tools with schemas', list.length === 14 && list.every((t) => t.inputSchema && t.description), list.map((t) => t.name).join());
  const info = await s.call('vault_info');
  ok('vault_info', info.notes === 7 && info.write === true && info.folders.some((f) => f.name === 'Tasks' && f.notes === 2), JSON.stringify(info));
  const se = await s.call('search', { query: 'vendor' });
  ok('search finds text', se.hits.some((h) => h.path === 'Tasks/Alpha.md'), JSON.stringify(se));
  ok('find_notes by name', JSON.stringify((await s.call('find_notes', { name: 'alp' })).notes) === '["Tasks/Alpha.md"]');
  const rn = await s.call('read_note', { note: 'Alpha', with_line_numbers: true });
  ok('read_note by name, with line numbers', rn.path === 'Tasks/Alpha.md' && /\n6: - \[ \] Write plan/.test(rn.text), rn.text);
  // checking a quotation before citing it
  const vq = (quote, line) => s.call('verify_quote', { note: 'Alpha', quote, line });
  const v1 = await vq('**Write plan**');
  ok('verify_quote: exact, Markdown marks ignored', v1.verdict === 'exact' && JSON.stringify(v1.lines) === '[6,6]', JSON.stringify(v1));
  const v2 = await vq('Draft outline. Review outline');
  ok('verify_quote: exact across list lines', v2.verdict === 'exact' && JSON.stringify(v2.lines) === '[7,8]', JSON.stringify(v2));
  const date = /\d{4}-\d\d-\d\d/.exec(rd('Tasks/Alpha.md'))[0], wrong = '2099' + date.slice(4);
  const v3 = await vq('Write plan by ' + wrong);
  ok('verify_quote: a number not in the source is reported', v3.verdict === 'not_supported' && JSON.stringify(v3.numbers_not_in_source) === JSON.stringify([wrong]) && JSON.stringify(v3.lines) === '[6,6]', JSON.stringify(v3));
  const v4 = await vq('Write plan ' + date);
  ok('verify_quote: close when every word and number is there', ['exact', 'close'].includes(v4.verdict) && !v4.numbers_not_in_source, JSON.stringify(v4));
  const v5 = await vq('Call vendor', 2);
  ok('verify_quote: not near the given line, found elsewhere', v5.verdict === 'not_supported' && JSON.stringify(v5.found_elsewhere) === '{"verdict":"exact","lines":[11,11]}', JSON.stringify(v5));
  ok('verify_quote: invented text is not supported', (await vq('The budget was approved by the board')).verdict === 'not_supported');
  const q = await s.call('query', { dql: 'TABLE length(file.tasks) AS "Tasks" FROM "Tasks" SORT file.name ASC' });
  ok('query TABLE as JSON', JSON.stringify(q.rows) === '[["Tasks/Alpha.md",6],["Tasks/Beta.md",2]]', JSON.stringify(q));
  const lt = await s.call('list_tasks', { due_within_days: 7 });
  const due = lt.groups.flatMap((g) => g.tasks.map((t) => t.text.split(' ')[0] + ' ' + t.text.split(' ')[1]));
  ok('list_tasks due within 7 days', JSON.stringify(due) === '["Call vendor","Write plan"]', JSON.stringify(lt));
  const cal = await s.call('query', { dql: 'CALENDAR file.day FROM "Journal"' });
  ok('query CALENDAR', cal.type === 'CALENDAR' && cal.total === 3 && cal.days.every((d) => /^\d{4}-\d\d-\d\d$/.test(d.date)), JSON.stringify(cal));
  // writing
  const beta = lt.groups.length && (await s.call('list_tasks', { text: 'beta one' })).groups[0].tasks[0];
  const st = await s.call('set_task', { note: beta.path, line: beta.line, done: true, text: 'Beta one' });
  ok('set_task ticks the line', !st.error && /- \[x\] Beta one/.test(rd('Tasks/Beta.md')), JSON.stringify(st));
  ok('the index sees it at once', !(await s.call('list_tasks', {})).groups.some((g) => g.tasks.some((t) => /Beta one/.test(t.text))));
  const rec = path.join(U, 'recovery'); const copies = fs.existsSync(rec) ? fs.readdirSync(rec, { recursive: true }).filter((f) => /\d{13}\.md$/.test(f)) : [];
  ok('a recovery copy is kept (the app\'s Versions)', copies.length === 1, JSON.stringify(copies));
  ok('set_task refuses the wrong task', /different task/.test((await s.call('set_task', { note: 'Beta', line: beta.line + 1, done: true, text: 'Beta one' })).error || ''));
  const cn = await s.call('create_note', { path: 'Inbox/From AI', content: '# From AI\n\nAbout [[Alpha]].\n' });
  ok('create_note (adds .md, makes the folder)', cn.created && rd('Inbox/From AI.md').includes('[[Alpha]]'), JSON.stringify(cn));
  ok('backlinks update after a write', (await s.call('links', { note: 'Alpha' })).backlinks.includes('Inbox/From AI.md'));
  ok('create_note does not overwrite by accident', /already exists/.test((await s.call('create_note', { path: 'Inbox/From AI.md', content: 'x' })).error || ''));
  await s.call('append_to_note', { note: 'From AI', heading: 'Next', content: '- [ ] Follow up' });
  await s.call('append_to_note', { note: 'From AI', heading: 'Next', content: '- [ ] Second' });
  await s.call('append_to_note', { note: 'From AI', content: 'Last line.' });
  ok('append_to_note: new heading, then under it, then at the end', /## Next\n- \[ \] Follow up\n- \[ \] Second\n\nLast line\.\n$/.test(rd('Inbox/From AI.md')), JSON.stringify(rd('Inbox/From AI.md')));
  ok('replace_in_note refuses an ambiguous match', /occurs 2 times/.test((await s.call('replace_in_note', { note: 'From AI', find: '- [ ]', replace: '* [ ]' })).error || ''));
  await s.call('replace_in_note', { note: 'From AI', find: 'Follow up', replace: 'Follow up with Son' });
  ok('replace_in_note', rd('Inbox/From AI.md').includes('Follow up with Son'));
  await s.call('set_property', { note: 'Alpha', key: 'status', value: 'done' });
  await s.call('set_property', { note: 'Alpha', key: 'tags', value: ['project', 'q4'] });
  ok('set_property adds, keeps the rest', /^---\nowner: Son\nstatus: done\ntags: \[project, q4\]\n---\n# Alpha/.test(rd('Tasks/Alpha.md')), JSON.stringify(rd('Tasks/Alpha.md').slice(0, 80)));
  ok('queries see the new property', JSON.stringify((await s.call('query', { dql: 'LIST FROM "Tasks" WHERE status = "done"' })).items) === '["Tasks/Alpha.md"]');
  await s.call('set_property', { note: 'Alpha', key: 'owner', value: null });
  ok('set_property null removes it', !/owner:/.test(rd('Tasks/Alpha.md')));
  ok('no writing outside the folder', /Not inside/.test((await s.call('create_note', { path: '../evil.md', content: 'x' })).error || '') && !fs.existsSync(path.join(V, '..', 'evil.md')));
  ok('no writing into hidden folders', /Hidden/.test((await s.call('create_note', { path: '.cfg/x.md', content: 'x' })).error || ''));
  ok('unknown note: a helpful error', /Note not found.*find_notes/.test((await s.call('read_note', { note: 'Nope' })).error || ''));
  fs.writeFileSync(path.join(V, 'Outside edit.md'), '# Outside\n');
  await sleep(2000);
  ok('edits made elsewhere are picked up', JSON.stringify((await s.call('find_notes', { name: 'outside' })).notes) === '["Outside edit.md"]');
  ok('changes are logged in mcp.log', (fs.readFileSync(path.join(U, 'mcp.log'), 'utf8').match(/\n/g) || []).length >= 8);
  s.close();
  // read-only server
  const r = server(['--read-only']);
  await r.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  const rlist = (await r.rpc('tools/list', {})).result.tools.map((t) => t.name);
  ok('--read-only: no writing tools', rlist.length === 9 && !rlist.includes('create_note'), rlist.join());
  ok('--read-only: writing is refused', /Unknown tool/.test((await r.call('create_note', { path: 'x.md', content: 'x' })).error || '') && !fs.existsSync(path.join(V, 'x.md')));
  r.close();
  // the app's setting "Let the AI edit notes" off
  fs.writeFileSync(path.join(U, 'settings.json'), JSON.stringify({ prefs: { mcpWrite: false, mcpOnly: 'Journal' } }));
  const pz = server();
  await pz.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  ok('app settings: no writing, only the folders chosen', (await pz.rpc('tools/list', {})).result.tools.length === 9 && (await pz.call('vault_info')).notes === 3);
  pz.close();
  // the .mcpb bundle's option overrides the app setting, both ways
  const bOn = server([], { LANTERNOTE_ALLOW_WRITE: 'true' });
  await bOn.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  ok('bundle option on: writing tools although the app setting is off', (await bOn.rpc('tools/list', {})).result.tools.length === 14);
  bOn.close();
  fs.rmSync(path.join(U, 'settings.json'));
  const bOff = server([], { LANTERNOTE_ALLOW_WRITE: 'false' });
  await bOff.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  ok('bundle option off (the default): read only without any app settings', (await bOff.rpc('tools/list', {})).result.tools.length === 9);
  bOff.close();
  fs.writeFileSync(path.join(U, 'settings.json'), '{}');
  fs.rmSync(path.join(U, 'settings.json'));
  // limited to one folder
  const o = server(['--only', 'Tasks']);
  await o.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  ok('--only: other folders are invisible', (await o.call('vault_info')).notes === 2 && (await o.call('search', { query: 'Today' })).hits.length === 0 && /not found/.test((await o.call('read_note', { note: 'Home' })).error || ''));
  ok('--only: no writing elsewhere', /Outside the folders/.test((await o.call('create_note', { path: 'Inbox/y.md', content: 'y' })).error || ''));
  o.close();
  await sleep(500);
  const stderr = s.errs.concat(r.errs, o.errs).join('');
  ok('no crash messages', !/crashed|Error:/.test(stderr), stderr);
  console.log(failed ? `${failed} FAILED` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
