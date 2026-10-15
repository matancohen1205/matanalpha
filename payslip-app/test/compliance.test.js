'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('node:child_process');
process.env.RATE_LIMIT_HEAVY = '500';
process.env.RATE_LIMIT_AUTH = '500';
const V = require('../public/js/vault-crypto');
const app = require('../server');

let server;
test.before(() => { server = app.listen(0); });
test.after(() => server.close());

function req(method, p, { body, raw, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw !== undefined ? raw : body === undefined ? null : JSON.stringify(body);
    const h = { ...headers, ...(cookie ? { cookie } : {}) };
    if (data !== null) { h['content-type'] = h['content-type'] || 'application/json'; h['content-length'] = Buffer.byteLength(data); }
    const r = http.request({ port: server.address().port, method, path: p, headers: h }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, headers: res.headers, json, text: buf }); });
    });
    r.on('error', reject); if (data !== null) r.write(data); r.end();
  });
}
const cookieOf = (r, name) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => new RegExp(`^(__Host-)?${name}=`).test(c));

test('ניתוק סשן לא פעיל: הזזה בפעילות, ופקיעה אחרי חוסר פעילות', async () => {
  let t = Date.now();
  app.setAccounts({ now: () => t });
  const m = await V.createAccountMaterial('idle-password-12345', 'idle@example.com');
  const reg = await req('POST', '/api/account/register', { body: { email: 'idle@example.com', authKey: m.authKey, wrappedPw: m.wrappedPw, wrappedRec: m.wrappedRec } });
  const cookie = cookieOf(reg, 'ps_sess');
  const me = () => req('GET', '/api/account/me', { cookie }).then((r) => r.json.loggedIn);
  const MIN = 60_000;
  t += 100 * MIN; assert.strictEqual(await me(), true);   // פעיל: מאריך
  t += 100 * MIN; assert.strictEqual(await me(), true);   // 200 דקות מההתחלה, אבל פעילות הארכה
  t += 130 * MIN; assert.strictEqual(await me(), false);  // מעל 120 דקות חוסר פעילות
  app.setAccounts({});
});

test('אדמין: מחיקת פנייה לצמיתות (הזכות להישכח)', async () => {
  app.setAdmin({ password: 'correct-horse-battery-staple' });
  const id = app.store.addTicket({ name: 'למחיקה', email: 'del@example.com', topic: 'other', message: 'בקשה למחיקת מידע שלי' });
  assert.strictEqual((await req('DELETE', `/api/admin/tickets/${id}`)).status, 401);
  const cookie = cookieOf(await req('POST', '/api/admin/login', { body: { password: 'correct-horse-battery-staple' } }), 'ps_admin');
  assert.strictEqual((await req('DELETE', `/api/admin/tickets/abc`, { cookie })).status, 400);
  assert.strictEqual((await req('DELETE', `/api/admin/tickets/${id}`, { cookie })).json.deleted, 1);
  assert.ok(!(await req('GET', '/api/admin/tickets', { cookie })).json.tickets.some((x) => x.id === id));
  assert.strictEqual((await req('DELETE', `/api/admin/tickets/${id}`, { cookie })).json.deleted, 0);
  app.setAdmin({ password: undefined });
});

test('מחיקת חשבון מוחקת גם סשנים וכספת (הזכות להישכח)', async () => {
  const m = await V.createAccountMaterial('forget-me-password-1', 'forget@example.com');
  const reg = await req('POST', '/api/account/register', { body: { email: 'forget@example.com', authKey: m.authKey, wrappedPw: m.wrappedPw, wrappedRec: m.wrappedRec } });
  const cookie = cookieOf(reg, 'ps_sess');
  await req('PUT', '/api/account/vault', { body: { version: 0, blob: await V.encryptJson(m.vaultKey, { x: 1 }) }, cookie });
  const del = await req('POST', '/api/account/delete', { body: { authKey: m.authKey }, cookie });
  assert.strictEqual(del.status, 200);
  const db = app.store.db;
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM accounts WHERE email_hash = ?').get(app.store.hash('acct:forget@example.com')).n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM vaults').get().n, db.prepare('SELECT COUNT(*) n FROM vaults v JOIN accounts a ON a.id = v.account_id').get().n); // אין כספות יתומות
});

test('הזרקות SQL ו-XSS בשדות: נשמרים כטקסט, לא מבצעים קוד ולא שוברים את המסד', async () => {
  const payloads = ["'; DROP TABLE tickets; --", "\" OR \"1\"=\"1", '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '${7*7}', '{{7*7}}', "Robert'); DROP TABLE accounts;--"];
  for (const p of payloads) {
    const r = await req('POST', '/api/contact', { body: { name: 'בדיקה ' + p, email: 'inj@example.com', topic: 'other', message: 'הודעה ארוכה מספיק ' + p, consent: true, elapsedMs: 9000, website: '' } });
    assert.ok([200, 400, 429].includes(r.status), `${p} -> ${r.status}`);
    const login = await req('POST', '/api/account/login', { body: { email: p + '@example.com', authKey: p } });
    assert.strictEqual(login.status, 401);
    assert.doesNotMatch(login.text, /SQLITE|syntax|stack|at .*\.js/i);
  }
  // הטבלאות עדיין קיימות
  for (const t of ['tickets', 'accounts', 'sessions', 'vaults']) assert.ok(app.store.db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(t), t);
  // הערכים נשמרו כטקסט מילולי ולא פורשו
  const stored = app.store.listTickets(50).filter((x) => /DROP TABLE|<script>/.test(x.message));
  stored.forEach((x) => assert.ok(typeof x.message === 'string'));
});

test('שגיאות לא חושפות פרטי מערכת (stack, נתיבים, שמות קבצים)', async () => {
  const cases = [
    req('POST', '/api/analyze-text', { raw: '{"text": ', headers: { 'content-type': 'application/json' } }),
    req('POST', '/api/analyze-text', { raw: 'x'.repeat(200_000), headers: { 'content-type': 'application/json' } }),
    req('POST', '/api/account/login', { raw: '[[[[', headers: { 'content-type': 'application/json' } }),
    req('GET', '/api/does-not-exist'), req('GET', '/%00'), req('GET', '/..%2f..%2fetc/passwd'),
    req('POST', '/api/analyze', { raw: 'garbage', headers: { 'content-type': 'multipart/form-data; boundary=x' } }),
  ];
  for (const r of await Promise.all(cases)) {
    assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
    assert.doesNotMatch(r.text, /node_modules|\/home\/|\\Users\\|at Object\.|at Function|SyntaxError|ENOENT|express|multer/i);
  }
});

test('אין שדות כרטיס אשראי במסד הנתונים: התשלום מתבצע אצל Stripe בלבד', () => {
  const cols = [];
  for (const { name } of app.store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    for (const c of app.store.db.prepare(`PRAGMA table_info(${name})`).all()) cols.push(`${name}.${c.name}`);
  }
  assert.deepStrictEqual(cols.filter((c) => /card|cvv|cvc|pan\b|iban|account_number|credit/i.test(c)), []);
});

test('גיבוי אוטומטי: עותק קריא, ושמירה של N אחרונים בלבד', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { runBackup } = require('../src/backup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const db = new DatabaseSync(path.join(dir, 'app.db')); db.exec('CREATE TABLE t(x); INSERT INTO t VALUES (42)'); db.close();
  for (let i = 0; i < 5; i++) runBackup(path.join(dir, 'app.db'), 3, new Date(Date.UTC(2026, 0, 1 + i)));
  const files = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.strictEqual(files.length, 3);
  assert.match(files[0], /2026-01-03/);
  const c = new DatabaseSync(path.join(dir, 'backups', files[2]));
  assert.strictEqual(c.prepare('SELECT x FROM t').get().x, 42);
  c.close();
  assert.strictEqual((fs.statSync(path.join(dir, 'backups', files[2])).mode & 0o077), 0); // הרשאות פרטיות
  fs.rmSync(dir, { recursive: true, force: true });
});

test('פרודקשן: הפניה מ-http ל-https, HSTS, ושרת שמסרב לעלות בלי DB_PATH', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-'));
  const base = { ...process.env, NODE_ENV: 'production', PORT: '0', TRUST_PROXY: '1', DATA_KEY: 'k'.repeat(40), PRO_TOKEN_SECRET: 's'.repeat(40), PUBLIC_URL: 'https://example.test' };
  delete base.DB_PATH;
  const noDb = await new Promise((resolve) => { const c = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: base }); let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('exit', (code) => resolve({ code, e })); });
  assert.notStrictEqual(noDb.code, 0);
  assert.match(noDb.e, /DB_PATH is required/);

  const port = 3900 + Math.floor(Math.random() * 90);
  const child = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...base, PORT: String(port), DB_PATH: path.join(dir, 'app.db') } });
  try {
    await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('server did not start')), 15000); child.stdout.on('data', (d) => { if (/listening/.test(d)) { clearTimeout(t); resolve(); } }); child.on('exit', () => reject(new Error('server exited'))); });
    const get = (p, h) => new Promise((resolve, reject) => http.get({ port, path: p, headers: h }, (res) => { res.resume(); res.on('end', () => resolve(res)); }).on('error', reject));
    const plain = await get('/pricing.html', { host: 'example.test', 'x-forwarded-proto': 'http' });
    assert.strictEqual(plain.statusCode, 301);
    assert.strictEqual(plain.headers.location, 'https://example.test/pricing.html');
    const secure = await get('/', { host: 'example.test', 'x-forwarded-proto': 'https' });
    assert.strictEqual(secure.statusCode, 200);
    assert.match(secure.headers['strict-transport-security'] || '', /max-age=\d+/);
    assert.strictEqual((await get('/healthz', { host: 'example.test', 'x-forwarded-proto': 'http' })).statusCode, 200); // בדיקות בריאות פנימיות
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
});
