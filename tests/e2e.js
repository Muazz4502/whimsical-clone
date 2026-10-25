// End-to-end test: the real app in Chrome, against an in-memory fake of Google sign-in, Drive v3 and Picker.
// Run: cd tests && npm install && npm test        (set CHROME_PATH if Chrome is not in the default macOS location)
// No Google account or network access is needed; nothing touches your real Drive.
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const APP_DIR = process.argv[2] || path.resolve(__dirname, '..');
const PORT = 8089;

/* ---------------- fake Drive ---------------- */
const USERS = {
  tokA: { email: 'alice@example.com', name: 'Alice', permissionId: 'pA' },
  tokB: { email: 'bob@example.com', name: 'Bob', permissionId: 'pB' },
};
const byEmail = e => Object.values(USERS).find(u => u.email === e);
const files = {}; let seq = 0, rseq = 0;
const now = () => new Date().toISOString();
function access(u, f){
  if (f.owner === u.email) return 'owner';
  if (f.perms.some(p => p.type === 'anyone')) return f.perms.find(p => p.type === 'anyone').role;
  const p = f.perms.find(p => p.emailAddress === u.email); return p ? p.role : null;
}
const visible = (u, f) => access(u, f) && f.app.has(u.email);
function meta(u, f){
  const role = access(u, f);
  return { id: f.id, name: f.name, mimeType: f.mimeType, version: String(f.version), headRevisionId: f.rev, modifiedTime: f.mtime,
    ownedByMe: f.owner === u.email, shared: f.perms.length > 1, permissionIds: f.perms.map(p => p.id),
    owners: [{ displayName: byEmail(f.owner).name, emailAddress: f.owner, photoLink: '' }], properties: f.properties,
    capabilities: { canEdit: role === 'owner' || role === 'writer', canShare: role === 'owner' }, webViewLink: 'https://drive.example/' + f.id, trashed: f.trashed };
}
const err = (code, reason, msg) => ({ status: code, body: { error: { code, message: msg || reason, errors: [{ reason }] } } });
let failNext = null;   // inject a failure for the next upload
function drive(method, url, headers, body){
  const u = USERS[(headers.authorization || '').replace('Bearer ', '')];
  const U = new URL(url);
  if (U.pathname === '/__grant'){ const { email, ids } = JSON.parse(body); ids.forEach(id => files[id] && files[id].app.add(email)); return { status: 200, body: {} }; }
  if (!u) return err(401, 'authError');
  let m;
  if (U.pathname === '/drive/v3/about') return { status: 200, body: { user: { displayName: u.name, emailAddress: u.email, photoLink: '', permissionId: u.permissionId } } };
  if (U.pathname === '/drive/v3/files' && method === 'GET'){
    const q = U.searchParams.get('q');
    const kind = /value='(\w+)'/.exec(q)[1];
    const list = Object.values(files).filter(f => visible(u, f) && !f.trashed && f.properties && f.properties.mmKind === kind && (!/'me' in owners/.test(q) || f.owner === u.email));
    return { status: 200, body: { files: list.map(f => meta(u, f)) } };
  }
  const create = (m0, content) => {
    const id = 'F' + (++seq) + 'x_y-z';
    const f = files[id] = { id, name: m0.name, mimeType: m0.mimeType, parents: m0.parents, properties: m0.properties || {}, content: content || '', version: 1, rev: 'r' + (++rseq), mtime: now(), owner: u.email, perms: [{ id: u.permissionId, type: 'user', role: 'owner', emailAddress: u.email }], app: new Set([u.email]), trashed: false };
    return f;
  };
  if (U.pathname === '/drive/v3/files' && method === 'POST'){ const f = create(JSON.parse(body)); return { status: 200, body: meta(u, f) }; }
  const parseMp = () => {
    const b = /boundary=(.+)$/.exec(headers['content-type'])[1];
    const parts = body.split('--' + b).slice(1, -1).map(p => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
    return { m: JSON.parse(parts[0]), content: parts[1] };
  };
  if (U.pathname === '/upload/drive/v3/files' && method === 'POST'){
    if (failNext){ const r = failNext; failNext = null; return r; }
    const { m: m0, content } = parseMp();
    if (m0.parents && !files[m0.parents[0]]) return err(404, 'notFound');
    return { status: 200, body: meta(u, create(m0, content)) };
  }
  if ((m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(U.pathname)) && method === 'PATCH'){
    if (failNext){ const r = failNext; failNext = null; return r; }
    const f = files[decodeURIComponent(m[1])]; if (!f || !visible(u, f)) return err(404, 'notFound');
    const role = access(u, f); if (role !== 'owner' && role !== 'writer') return err(403, 'insufficientFilePermissions');
    const { m: m0, content } = parseMp();
    if (m0.name) f.name = m0.name; if (m0.properties) Object.assign(f.properties, m0.properties);
    f.content = content; f.version++; f.rev = 'r' + (++rseq); f.mtime = now();
    return { status: 200, body: meta(u, f) };
  }
  if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(U.pathname))){
    const f = files[decodeURIComponent(m[1])]; if (!f || !visible(u, f)) return err(404, 'notFound');
    if (method === 'GET') return U.searchParams.get('alt') === 'media' ? { status: 200, text: f.content } : { status: 200, body: meta(u, f) };
    if (method === 'PATCH'){ const p = JSON.parse(body); if (p.trashed != null) f.trashed = p.trashed; if (p.properties) Object.assign(f.properties, p.properties); f.version++; return { status: 200, body: meta(u, f) }; }
  }
  if ((m = /^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/.exec(U.pathname))){
    const f = files[decodeURIComponent(m[1])]; if (!f || !visible(u, f)) return err(404, 'notFound');
    if (method === 'GET') return { status: 200, body: { permissions: f.perms.map(p => ({ ...p, displayName: p.emailAddress && byEmail(p.emailAddress) ? byEmail(p.emailAddress).name : undefined })) } };
    if (method === 'POST'){
      if (access(u, f) !== 'owner') return err(403, 'insufficientFilePermissions');
      const p = JSON.parse(body);
      const perm = p.type === 'anyone' ? { id: 'anyoneWithLink', type: 'anyone', role: p.role } : { id: (byEmail(p.emailAddress) || {}).permissionId || ('p' + p.emailAddress), type: 'user', role: p.role, emailAddress: p.emailAddress };
      f.perms = f.perms.filter(x => x.id !== perm.id).concat(perm); f.version++;
      return { status: 200, body: perm };
    }
    if (method === 'DELETE'){
      const pid = decodeURIComponent(m[2]);
      if (access(u, f) !== 'owner' && pid !== u.permissionId) return err(403, 'insufficientFilePermissions');
      f.perms = f.perms.filter(x => x.id !== pid); f.version++;
      return { status: 204 };
    }
  }
  return err(400, 'unhandled ' + method + ' ' + U.pathname);
}

const FAKE_GSI = `window.google = window.google || {}; google.accounts = { oauth2: {
  initTokenClient(cfg){ return { callback: cfg.callback, requestAccessToken(o){ window.__reqs = (window.__reqs||0)+1; setTimeout(() => this.callback({ access_token: window.__fakeToken, expires_in: window.__fakeExpires || 3600, scope: cfg.scope }), 30); } }; },
  hasGrantedAllScopes(){ return true; }, revoke(t, cb){ cb && cb(); } } };`;
const FAKE_GAPI = `window.gapi = { load(name, o){ setTimeout(o.callback || o, 10); } };
window.google = window.google || {};
google.picker = { ViewId: { DOCS: 'docs' }, DocsViewMode: { LIST: 'list' }, Feature: { MULTISELECT_ENABLED: 'm' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id' },
  DocsView: class { setMimeTypes(){ return this; } setIncludeFolders(){ return this; } setMode(){ return this; } setFileIds(ids){ this.ids = ids.split(','); return this; } },
  PickerBuilder: class { addView(v){ this.v = v; return this; } enableFeature(){ return this; } setOAuthToken(){ return this; } setDeveloperKey(){ return this; } setAppId(){ return this; } setTitle(){ return this; } setCallback(cb){ this.cb = cb; return this; }
    build(){ const s = this; return { setVisible(){ const ids = s.v.ids || window.__pickIds || []; fetch('https://www.googleapis.com/__grant', { method: 'POST', body: JSON.stringify({ email: window.__fakeEmail, ids }) }).then(() => s.cb({ action: 'picked', docs: ids.map(id => ({ id })) })); } }; } } };`;
const TEST_CONFIG = `window.MINDMAP_CONFIG = { googleClientId: 'test.apps.googleusercontent.com', googleApiKey: 'k', googleAppId: '1', pollSeconds: 5 };`;

/* ---------------- app server ---------------- */
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/config.js'){ res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(TEST_CONFIG); }
  const fp = path.join(APP_DIR, p);
  if (!fs.existsSync(fp)){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'text/javascript' }); res.end(fs.readFileSync(fp));
}).listen(PORT);

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const apiLog = [];
async function setup(page, token){
  const u = USERS[token];
  await page.evaluateOnNewDocument((t, e) => { window.__fakeToken = t; window.__fakeEmail = e; }, token, u.email);
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith('https://accounts.google.com/gsi/client')) return req.respond({ status: 200, contentType: 'text/javascript', body: FAKE_GSI });
    if (url.startsWith('https://apis.google.com/js/api.js')) return req.respond({ status: 200, contentType: 'text/javascript', body: FAKE_GAPI });
    if (url.startsWith('https://www.googleapis.com/')){
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS, body: '' });
      const r = drive(req.method(), url, req.headers(), req.postData() || '');
      apiLog.push(req.method() + ' ' + new URL(url).pathname + ' -> ' + r.status);
      return req.respond({ status: r.status, headers: CORS, contentType: r.text != null ? 'text/plain' : 'application/json', body: r.status === 204 ? '' : (r.text != null ? r.text : JSON.stringify(r.body)) });
    }
    if (url.startsWith('http://localhost:' + PORT) || url.startsWith('data:') || url.startsWith('blob:')) return req.continue();
    return req.abort();
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.errors = errors;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, cond, extra){ console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? '  ' + extra : '')); if (!cond) failures++; }
const boards = owner => Object.values(files).filter(f => f.properties.mmKind === 'board' && !f.trashed && (!owner || f.owner === owner));
async function waitFor(fn, ms = 8000){ const t = Date.now(); while (Date.now() - t < ms){ if (await fn()) return true; await sleep(150); } return false; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-first-run'] });
  const URL0 = `http://localhost:${PORT}/`;
  try {
    /* ---- Alice, laptop 1 ---- */
    const ctxA = await browser.createBrowserContext();
    const a = await ctxA.newPage(); await a.setViewport({ width: 1280, height: 800 });
    await setup(a, 'tokA');
    await a.goto(URL0);
    await a.waitForSelector('#gConnect:not([disabled])', { timeout: 5000 });
    check('connect dialog shown on first visit', await a.$eval('#dialog', d => !d.hidden && d.textContent.includes('Google Drive')));
    // sticky: clicking outside does not close it
    await a.mouse.click(1200, 700);
    check('connect dialog is sticky', await a.$eval('#dialog', d => !d.hidden));
    await a.click('#gConnect');
    await waitFor(() => a.evaluate(() => window.__mm.mode === 'drive' && document.querySelector('#loading').hidden));
    check('signed in to drive mode', await a.evaluate(() => window.__mm.mode) === 'drive');
    check('no folder until the first board is saved', !Object.values(files).some(f => f.properties.mmKind === 'root'));
    check('profile shows Drive user', (await a.$eval('#profileName', e => e.textContent)) === 'Alice');
    check('empty-state hint visible', await a.$eval('#hint', h => !h.hidden && h.textContent.includes('No boards')));
    await a.click('#hint [data-h="example"]');
    check('example boards uploaded to Drive', await waitFor(() => boards('alice@example.com').length === 2), JSON.stringify(apiLog.slice(-5)));
    check('exactly one boards folder created for concurrent saves', Object.values(files).filter(f => f.properties.mmKind === 'root').length === 1);
    const folder = Object.values(files).find(f => f.properties.mmKind === 'root');
    check('board files live in the folder', boards().every(f => f.parents && f.parents[0] === folder.id));
    check('board file is valid JSON board', boards().every(f => { const j = JSON.parse(f.content); return j.format === 'mindmap' && j.nodes && Array.isArray(j.roots); }));
    check('file named after board', boards().some(f => f.name === 'Mapper on PPI.mindmap.json'), boards().map(f => f.name).join(', '));

    // Edit: rename the board title
    await a.click('#title', { clickCount: 3 }); await a.keyboard.type('Roadmap Q4');
    const ppi = () => boards().find(f => JSON.parse(f.content).title === 'Roadmap Q4');
    check('edit saved to Drive (title)', await waitFor(() => !!ppi()));
    check('file renamed with title', ppi() && ppi().name === 'Roadmap Q4.mindmap.json');
    // Edit: add a child node through the keyboard
    const nodeCount = () => Object.keys(JSON.parse(ppi().content).nodes).length;
    const before = nodeCount();
    const rootId = await a.evaluate(() => window.__mm.doc.roots[0].id);
    await a.click(`.node[data-id="${rootId}"] .label`);
    await a.focus('#stage');
    await a.keyboard.press('Tab'); await a.keyboard.type('Launch plan'); await a.keyboard.press('Escape');
    check('new node saved to Drive', await waitFor(() => nodeCount() === before + 1), `before=${before} now=${nodeCount()}`);
    check('pending cache cleared after save', await waitFor(() => a.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mindmaps.pending.')).length === 0)));

    // Reload: token cached, boards come back from Drive
    await a.reload();
    await waitFor(() => a.evaluate(() => window.__mm.mode === 'drive' && !!window.__mm.doc));
    check('reload goes straight to Drive (no sign-in click)', await a.$eval('#dialog', d => d.hidden));
    check('reload reopens the board with edits', await a.evaluate(() => Object.values(window.__mm.doc.nodes).some(n => n.text === 'Launch plan')));
    check('sidebar lists both boards', (await a.$$eval('#doclist .doc', r => r.length)) === 2);

    /* ---- Alice, laptop 2: same account, fresh browser ---- */
    const ctxA2 = await browser.createBrowserContext();
    const a2 = await ctxA2.newPage(); await a2.setViewport({ width: 1280, height: 800 });
    await setup(a2, 'tokA');
    await a2.goto(URL0);
    await a2.waitForSelector('#gConnect:not([disabled])'); await a2.click('#gConnect');
    await waitFor(() => a2.evaluate(() => window.__mm.mode === 'drive' && !!window.__mm.doc));
    check('second laptop sees the same boards', (await a2.$$eval('#doclist .doc', r => r.length)) === 2);
    check('second laptop reuses the same folder', Object.values(files).filter(f => f.properties.mmKind === 'root').length === 1);
    // open Roadmap on laptop 2, and edit it
    await a2.evaluate(() => { const d = Object.values(window.__mm.docs).find(d => d.title === 'Roadmap Q4'); document.querySelectorAll('#doclist .doc').forEach(r => { if (r.querySelector('.dt').textContent === 'Roadmap Q4') r.click(); }); });
    await waitFor(() => a2.evaluate(() => window.__mm.doc && window.__mm.doc.title === 'Roadmap Q4'));
    await a2.click('#title', { clickCount: 3 }); await a2.keyboard.type('Roadmap Q4 v2'); await a2.click('#stage');
    check('laptop 2 edit saved', await waitFor(() => boards().some(f => JSON.parse(f.content).title === 'Roadmap Q4 v2')));
    // laptop 1 picks it up by polling (5s in the test config); make sure it is the open board
    await a.bringToFront();
    check('laptop 1 sees laptop 2 edit live', await waitFor(() => a.evaluate(() => window.__mm.doc && window.__mm.doc.title === 'Roadmap Q4 v2'), 12000), await a.evaluate(() => window.__mm.doc && window.__mm.doc.title));

    /* ---- Sharing with Bob ---- */
    await a.click('#shareBtn');
    await a.waitForSelector('#shareEmail');
    await a.type('#shareEmail', 'bob@example.com'); await a.click('#shareForm button');
    const shared = () => boards().find(f => f.perms.some(p => p.emailAddress === 'bob@example.com'));
    check('invite creates Drive permission', await waitFor(() => !!shared()));
    check('share dialog lists Bob', await waitFor(() => a.$eval('#shareMembers', b => b.textContent.includes('Bob'))));
    check('board moves to Shared section', await waitFor(() => a.evaluate(() => window.__mm.doc.space === 'shared')));
    const link = await a.$eval('#linkField', i => i.value);
    check('share link uses Drive file id', link.endsWith('#b-' + shared().id), link);
    await a.click('[data-x="close"]');

    const ctxB = await browser.createBrowserContext();
    const b = await ctxB.newPage(); await b.setViewport({ width: 1280, height: 800 });
    await setup(b, 'tokB');
    await b.goto(link);
    await b.waitForSelector('#gConnect:not([disabled])'); await b.click('#gConnect');
    check('Bob without app access is asked to pick the file', await waitFor(() => b.evaluate(() => { const d = document.querySelector('#dialog'); return !d.hidden && d.textContent.includes('Open a shared board'); })));
    await b.click('[data-x="pick"]');
    check('Bob opens the shared board after picking', await waitFor(() => b.evaluate(() => window.__mm.doc && window.__mm.doc.title === 'Roadmap Q4 v2')));
    check('Bob sees it under Shared, by Alice', await b.evaluate(() => window.__mm.doc.space === 'shared' && document.querySelector('#doclist .doc.on .dm').textContent === 'Shared by Alice'));
    await b.click('#title', { clickCount: 3 }); await b.keyboard.type('Roadmap (Bob was here)'); await b.click('#stage');
    check('Bob edit saved into Alice’s file', await waitFor(() => JSON.parse(shared().content).title === 'Roadmap (Bob was here)'));
    await a.bringToFront();
    check('Alice sees Bob’s edit', await waitFor(() => a.evaluate(() => window.__mm.doc.title === 'Roadmap (Bob was here)'), 12000));
    check('opening a shared board creates nothing in Bob’s Drive', !Object.values(files).some(f => f.owner === 'bob@example.com'));

    /* ---- token expiry → reconnect banner, edits kept and uploaded ---- */
    await b.evaluate(() => { localStorage.setItem('mindmaps.gtoken', '{}'); });
    await b.evaluate(() => { window.__fakeToken = 'tokB'; });
    // expire in memory by making the next API call 401: swap token to an unknown one
    await b.evaluate(() => { window.__fakeToken = 'expired'; });
    await b.click('#title', { clickCount: 3 }); await b.keyboard.type('Offline edit');
    // force auth loss: invalidate via the server
    USERS.tokB_saved = USERS.tokB; delete USERS.tokB;
    await b.click('#stage');
    check('session-expired banner appears', await waitFor(() => b.evaluate(() => { const x = document.querySelector('#banner'); return !x.hidden && x.dataset.kind === 'auth'; })));
    check('unsaved edit mirrored in browser', await waitFor(() => b.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('mindmaps.pending.') && localStorage.getItem(k).includes('Offline edit')))));
    USERS.tokB = USERS.tokB_saved; delete USERS.tokB_saved;
    await b.evaluate(() => { window.__fakeToken = 'tokB'; });
    await b.click('#banner .btn');
    check('reconnect uploads the kept edit', await waitFor(() => JSON.parse(shared().content).title === 'Offline edit'));
    check('banner cleared', await b.$eval('#banner', x => x.hidden));

    /* ---- Bob leaves; Alice stops sharing; delete → trash ---- */
    await b.evaluate(() => { const row = document.querySelector('#doclist .doc.on .del'); row.click(); row.click(); });
    check('Bob leaving removes his permission', await waitFor(() => !shared()));
    await a.bringToFront();
    check('Alice’s board returns to Private', await waitFor(() => a.evaluate(() => window.__mm.doc.space === 'private'), 12000));
    const before2 = boards('alice@example.com').length;
    await a.evaluate(() => { const row = document.querySelector('#doclist .doc.on .del'); row.click(); row.click(); });
    check('delete moves the file to Drive trash', await waitFor(() => boards('alice@example.com').length === before2 - 1));
    await a2.bringToFront();
    check('other laptop drops the deleted board', await waitFor(() => a2.evaluate(() => document.querySelectorAll('#doclist .doc').length === 1), 12000));

    /* ---- save failure is retried, conflict copy on replay ---- */
    await a.bringToFront();
    failNext = { status: 503, body: { error: { code: 503, message: 'backend', errors: [{ reason: 'backendError' }] } } };
    await a.click('#title', { clickCount: 3 }); await a.keyboard.type('Retried title'); await a.click('#stage');
    check('5xx save is retried with backoff', await waitFor(() => boards('alice@example.com').some(f => JSON.parse(f.content).title === 'Retried title'), 10000));

    /* ---- crash recovery: edits that never reached Drive are replayed on next sign-in ---- */
    await a.bringToFront();
    const info = await a.evaluate(() => { const d = window.__mm.doc; return { id: d.id, fileId: d.fileId, rev: d._remoteRev, nodes: d.nodes, roots: d.roots }; });
    await a.evaluate(i => localStorage.setItem('mindmaps.pending.' + i.id, JSON.stringify({ fileId: i.fileId, base: i.rev, account: 'alice@example.com', data: { id: i.id, title: 'Recovered after crash', nodes: i.nodes, roots: i.roots, items: {}, updated: Date.now() } })), info);
    await a.reload();
    check('pending edit replayed onto unchanged board', await waitFor(() => JSON.parse(files[info.fileId].content).title === 'Recovered after crash'));
    const nBoards = boards('alice@example.com').length;
    await a.evaluate(i => localStorage.setItem('mindmaps.pending.' + i.id, JSON.stringify({ fileId: i.fileId, base: 'stale-rev', account: 'alice@example.com', data: { id: i.id, title: 'My offline version', nodes: i.nodes, roots: i.roots, items: {}, updated: Date.now() } })), info);
    await a.reload();
    check('conflicting pending edit becomes a separate board', await waitFor(() => boards('alice@example.com').some(f => JSON.parse(f.content).title === 'My offline version (unsaved changes)')));
    check('conflict did not overwrite the original', JSON.parse(files[info.fileId].content).title === 'Recovered after crash' && boards('alice@example.com').length === nBoards + 1);

    /* ---- local-only mode ---- */
    const aliceBefore = boards('alice@example.com').length;
    const ctxL = await browser.createBrowserContext();
    const l = await ctxL.newPage(); await setup(l, 'tokA');
    await l.goto(URL0); await l.waitForSelector('#gLocal'); await l.click('#gLocal');
    check('local mode works without Google', await waitFor(() => l.evaluate(() => window.__mm.mode === 'local' && Object.keys(window.__mm.docs).length === 2)));
    check('local mode makes no Drive calls for boards', boards('alice@example.com').length === aliceBefore);

    /* ---- moving local boards into Drive ---- */
    await l.evaluate(() => { const m = document.querySelector('#profileBtn'); m.click(); });
    await l.click('#menu [data-m="connect"]');
    await waitFor(() => l.evaluate(() => window.__mm.mode === 'drive' && document.querySelector('#loading').hidden));
    check('local boards offered for moving after connecting', await l.$eval('#sbBanner', x => !x.hidden && x.textContent.includes('2 boards')));
    await l.click('#moveLocal');
    check('local boards moved into Drive', await waitFor(() => boards('alice@example.com').length === aliceBefore + 2));

    for (const [n, p] of [['alice1', a], ['alice2', a2], ['bob', b], ['local', l]]) check('no JS errors in ' + n, p.errors.length === 0, p.errors.join(' | '));
  } catch(e){ console.log('CRASH', e); failures++; }
  finally {
    await browser.close(); server.close();
    console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
    process.exit(failures ? 1 : 0);
  }
})();
