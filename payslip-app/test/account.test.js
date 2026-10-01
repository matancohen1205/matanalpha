'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
process.env.RATE_LIMIT_HEAVY = '200';
const V = require('../public/js/vault-crypto');
const app = require('../server');

let server;
test.before(() => { server = app.listen(0); });
test.after(() => server.close());

function req(method, p, { body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const h = { ...headers, ...(cookie ? { cookie } : {}) };
    if (data) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(data); }
    const r = http.request({ port: server.address().port, method, path: p, headers: h }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, headers: res.headers, json, text: buf }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const cookieOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => /^(__Host-)?ps_sess=/.test(c));

async function register(email, password, extra = {}) {
  const m = await V.createAccountMaterial(password, email);
  const r = await req('POST', '/api/account/register', { body: { email, authKey: m.authKey, wrappedPw: m.wrappedPw, wrappedRec: m.wrappedRec, ...extra } });
  return { m, r, cookie: cookieOf(r) };
}
async function login(email, password) {
  const d = await V.deriveFromPassword(password, email);
  return req('POST', '/api/account/login', { body: { email, authKey: d.authKey } });
}

test('הרשמה, כספת מוצפנת, והשרת לא רואה טקסט גלוי', async () => {
  const mails = [];
  app.setAccounts({ mailer: { sendMail: async (m) => mails.push(m) }, mailFrom: 'x@y.z' });
  const { m, r, cookie } = await register('dana@example.com', 'correct horse battery');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(r.headers['set-cookie'][0], /SameSite=Strict/i);
  assert.ok(cookie);
  assert.strictEqual(mails.length, 1);

  const me = await req('GET', '/api/account/me', { cookie });
  assert.strictEqual(me.json.email, 'dana@example.com');
  assert.strictEqual(me.json.verified, false);

  // כספת: הצפנה בדפדפן, העלאה, והורדה
  const secretText = 'שכר ברוטו 15126 סודי-מאוד';
  const blob = await V.encryptJson(m.vaultKey, { snapshots: [{ note: secretText }] });
  const put = await req('PUT', '/api/account/vault', { body: { version: 0, blob }, cookie });
  assert.strictEqual(put.json.version, 1);
  const got = await req('GET', '/api/account/vault', { cookie });
  assert.strictEqual(got.json.version, 1);
  assert.doesNotMatch(JSON.stringify(got.json), /סודי|15126/);
  assert.strictEqual((await V.decryptJson(m.vaultKey, got.json.blob)).snapshots[0].note, secretText);

  // התנגשות גרסאות
  const again = await req('PUT', '/api/account/vault', { body: { version: 0, blob }, cookie });
  assert.strictEqual(again.status, 409);
  const ok2 = await req('PUT', '/api/account/vault', { body: { version: 1, blob }, cookie });
  assert.strictEqual(ok2.json.version, 2);
  // כספת גדולה / פגומה
  assert.strictEqual((await req('PUT', '/api/account/vault', { body: { version: 2, blob: { iv: 'a', ct: 'b'.repeat(300_000) } }, cookie })).status, 400);
  assert.strictEqual((await req('PUT', '/api/account/vault', { body: { version: 2, blob: { iv: '<script>', ct: 'x' } }, cookie })).status, 400);
  assert.strictEqual((await req('GET', '/api/account/vault')).status, 401);
});

test('התחברות: סיסמה נכונה, שגויה, נעילה אחרי ניסיונות, ואין חשיפת קיום חשבון', async () => {
  await register('lock@example.com', 'right-password-123');
  const good = await login('lock@example.com', 'right-password-123');
  assert.strictEqual(good.status, 200);
  assert.ok(cookieOf(good));
  // פתיחת מפתח הכספת מהמפתח העטוף שהשרת החזיר
  const vk = await V.unwrapWithPassword('right-password-123', 'lock@example.com', good.json.wrappedPw);
  assert.strictEqual(vk.length, 32);

  const wrong = await login('lock@example.com', 'wrong-password');
  const missing = await login('nobody@example.com', 'whatever-password');
  assert.strictEqual(wrong.status, 401);
  assert.strictEqual(missing.status, 401);
  assert.deepStrictEqual(wrong.json, missing.json); // אותה תשובה
  for (let i = 0; i < 4; i++) await login('lock@example.com', 'wrong-' + i);
  const locked = await login('lock@example.com', 'right-password-123'); // נעול גם עם סיסמה נכונה
  assert.strictEqual(locked.status, 429);
  // קלט זדוני
  assert.strictEqual((await req('POST', '/api/account/login', { body: { email: 'a@b.co', authKey: { $ne: 1 } } })).status, 401);
  assert.strictEqual((await req('POST', '/api/account/login', { body: { email: ['a@b.co'], authKey: 'x' } })).status, 401);
});

test('הרשמה: אימייל כפול, חומר פגום, ואימות מייל חד-פעמי', async () => {
  const mails = [];
  app.setAccounts({ mailer: { sendMail: async (m) => mails.push(m) }, mailFrom: 'x@y.z' });
  const first = await register('verify@example.com', 'a-long-password-1');
  assert.strictEqual(first.r.status, 200);
  const dup = await register('Verify@Example.com', 'another-password');
  assert.strictEqual(dup.r.status, 409);
  const bad = await req('POST', '/api/account/register', { body: { email: 'bad@example.com', authKey: 'short', wrappedPw: {}, wrappedRec: {} } });
  assert.strictEqual(bad.status, 400);
  const tok = mails[0].text.match(/verify=([\w.-]+)/)[1];
  assert.strictEqual((await req('POST', '/api/account/verify', { body: { token: tok + 'x' } })).status, 400);
  assert.strictEqual((await req('POST', '/api/account/verify', { body: { token: tok } })).status, 200);
  assert.strictEqual((await req('POST', '/api/account/verify', { body: { token: tok } })).status, 400);
  assert.strictEqual((await req('GET', '/api/account/me', { cookie: first.cookie })).json.verified, true);
});

test('איפוס סיסמה באמצעות מפתח שחזור: הנתונים נשמרים, סשנים ישנים נסגרים', async () => {
  const mails = [];
  app.setAccounts({ mailer: { sendMail: async (m) => mails.push(m) }, mailFrom: 'x@y.z' });
  const { m, cookie } = await register('reset@example.com', 'old-password-12345');
  const blob = await V.encryptJson(m.vaultKey, { keep: 'me' });
  await req('PUT', '/api/account/vault', { body: { version: 0, blob }, cookie });

  const f1 = await req('POST', '/api/account/forgot', { body: { email: 'reset@example.com' } });
  const f2 = await req('POST', '/api/account/forgot', { body: { email: 'ghost@example.com' } });
  assert.deepStrictEqual(f1.json, f2.json);
  await new Promise((r) => setTimeout(r, 80));
  const resetMail = mails.find((x) => /reset=/.test(x.text));
  assert.ok(resetMail);
  assert.strictEqual(mails.filter((x) => x.to === 'ghost@example.com').length, 0);
  const token = resetMail.text.match(/reset=([\w.-]+)/)[1];

  const info = await req('POST', '/api/account/reset-info', { body: { token } });
  const vk = await V.unwrapWithRecovery(m.recoveryKey, info.json.wrappedRec);
  const rw = await V.rewrapForNewPassword('brand-new-password-9', 'reset@example.com', vk);
  const done = await req('POST', '/api/account/reset', { body: { token, authKey: rw.authKey, wrappedPw: rw.wrappedPw } });
  assert.strictEqual(done.status, 200);
  assert.strictEqual((await req('POST', '/api/account/reset', { body: { token, authKey: rw.authKey, wrappedPw: rw.wrappedPw } })).status, 409);
  assert.strictEqual((await req('GET', '/api/account/me', { cookie })).json.loggedIn, false); // סשן ישן נסגר
  assert.strictEqual((await login('reset@example.com', 'old-password-12345')).status, 401);
  const nl = await login('reset@example.com', 'brand-new-password-9');
  assert.strictEqual(nl.status, 200);
  const vk2 = await V.unwrapWithPassword('brand-new-password-9', 'reset@example.com', nl.json.wrappedPw);
  const data = await req('GET', '/api/account/vault', { cookie: cookieOf(nl) });
  assert.strictEqual((await V.decryptJson(vk2, data.json.blob)).keep, 'me');
  // מפתח שחזור שגוי לא פותח
  await assert.rejects(V.unwrapWithRecovery('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA', info.json.wrappedRec));
  // אסימון מסוג אחר לא מתקבל
  assert.strictEqual((await req('POST', '/api/account/reset-info', { body: { token: mails[0].text.match(/verify=([\w.-]+)/)?.[1] || 'x' } })).status, 400);
});

test('שינוי סיסמה, מחיקת חשבון, והגנות CSRF', async () => {
  const { m, cookie } = await register('change@example.com', 'first-password-123');
  const oldD = await V.deriveFromPassword('first-password-123', 'change@example.com');
  const nw = await V.rewrapForNewPassword('second-password-456', 'change@example.com', m.vaultKey);
  assert.strictEqual((await req('POST', '/api/account/change-password', { body: { oldAuthKey: nw.authKey, authKey: nw.authKey, wrappedPw: nw.wrappedPw }, cookie })).status, 401);
  const ch = await req('POST', '/api/account/change-password', { body: { oldAuthKey: oldD.authKey, authKey: nw.authKey, wrappedPw: nw.wrappedPw }, cookie });
  assert.strictEqual(ch.status, 200);
  const newCookie = cookieOf(ch);
  assert.strictEqual((await login('change@example.com', 'second-password-456')).status, 200);

  // CSRF: אתר אחר לא יכול לפעול בשם המשתמש
  assert.strictEqual((await req('POST', '/api/account/logout', { body: {}, cookie: newCookie, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.strictEqual((await req('POST', '/api/account/delete', { body: { authKey: nw.authKey }, cookie: newCookie, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);

  // מחיקה מחייבת סיסמה
  assert.strictEqual((await req('POST', '/api/account/delete', { body: { authKey: oldD.authKey }, cookie: newCookie })).status, 401);
  assert.strictEqual((await req('POST', '/api/account/delete', { body: { authKey: nw.authKey }, cookie: newCookie })).status, 200);
  assert.strictEqual((await login('change@example.com', 'second-password-456')).status, 401);
  assert.strictEqual((await req('GET', '/api/account/me', { cookie: newCookie })).json.loggedIn, false);
});

test('קישור מנוי Pro לחשבון משחזר Pro בהתחברות', async () => {
  const { sign } = require('../src/billing');
  const stripe = { subscriptions: { list: async () => ({ data: [{ status: 'active' }] }) }, customers: { list: async () => ({ data: [] }) } };
  app.setBilling({ stripe, priceId: 'p', secret: 'test-secret' });
  app.setAccounts({});
  const { cookie } = await register('pro@example.com', 'pro-password-12345');
  const proCookie = 'ps_pro=' + sign({ t: 'pro', cid: 'cus_77', exp: Math.floor(Date.now() / 1000) + 600 }, 'test-secret');
  assert.strictEqual((await req('POST', '/api/account/link-subscription', { body: {}, cookie })).status, 402); // בלי Pro
  assert.strictEqual((await req('POST', '/api/account/link-subscription', { body: {}, cookie: `${cookie}; ${proCookie}` })).status, 200);
  assert.strictEqual((await req('GET', '/api/account/me', { cookie })).json.subscriptionLinked, true);
  // מכשיר חדש: התחברות מחזירה Pro
  const l = await login('pro@example.com', 'pro-password-12345');
  assert.strictEqual(l.json.pro, true);
  const proSet = (l.headers['set-cookie'] || []).find((c) => c.startsWith('ps_pro='));
  assert.ok(proSet);
  const check = await req('GET', '/api/billing/me', { cookie: proSet.split(';')[0] });
  assert.strictEqual(check.json.pro, true);
  assert.strictEqual((await req('POST', '/api/account/unlink-subscription', { body: {}, cookie: cookieOf(l) })).status, 200);
});
