'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
process.env.RATE_LIMIT_HEAVY = '200';
process.env.RATE_LIMIT_AUTH = '500';
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
      let buf = ''; res.on('data', (c) => (buf += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, headers: res.headers, json, text: buf }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const cookieOf = (r) => (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => /^(__Host-)?ps_admin=/.test(c));
const PASS = 'correct-horse-battery-staple';

test('בלי ADMIN_PASSWORD (או סיסמה קצרה) הממשק כבוי לגמרי', async () => {
  app.setAdmin({ password: undefined });
  for (const [m, p] of [['GET', '/api/admin/me'], ['GET', '/api/admin/tickets'], ['POST', '/api/admin/login']]) assert.strictEqual((await req(m, p, { body: m === 'POST' ? { password: 'x' } : undefined })).status, 404, p);
  app.setAdmin({ password: 'short' });
  assert.strictEqual((await req('POST', '/api/admin/login', { body: { password: 'short' } })).status, 404);
});

test('כניסה, צפייה בפניות ועדכון סטטוס; משתמש רגיל וסיסמה שגויה נחסמים', async () => {
  app.setAdmin({ password: PASS });
  const ticketId = app.store.addTicket({ name: 'דנה', email: 'd@example.com', topic: 'other', message: '<img src=x onerror=alert(1)> שלום עולם' });
  
  assert.strictEqual((await req('GET', '/api/admin/tickets')).status, 401);
  assert.strictEqual((await req('POST', '/api/admin/login', { body: { password: 'wrong-password-123' } })).status, 401);
  assert.strictEqual((await req('POST', '/api/admin/login', { body: { password: { $ne: 1 } } })).status, 401);
  const ok = await req('POST', '/api/admin/login', { body: { password: PASS } });
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(ok.headers['set-cookie'][0], /SameSite=Strict/i);
  const cookie = cookieOf(ok);

  assert.strictEqual((await req('GET', '/api/admin/me', { cookie })).json.loggedIn, true);
  const list = await req('GET', '/api/admin/tickets', { cookie });
  assert.strictEqual(list.status, 200);
  assert.ok(list.json.tickets.some((t) => t.id === ticketId && t.name === 'דנה'));
  assert.strictEqual(list.headers['cache-control'], 'no-store');

  assert.strictEqual((await req('POST', `/api/admin/tickets/${ticketId}/status`, { body: { status: 'closed' } })).status, 401);
  assert.strictEqual((await req('POST', `/api/admin/tickets/${ticketId}/status`, { body: { status: 'hacked' }, cookie })).status, 400);
  assert.strictEqual((await req('POST', `/api/admin/tickets/${ticketId}/status`, { body: { status: 'closed' }, cookie })).status, 200);
  assert.strictEqual((await req('GET', '/api/admin/tickets', { cookie })).json.tickets.find((t) => t.id === ticketId).status, 'closed');
  // CSRF
  assert.strictEqual((await req('POST', `/api/admin/tickets/${ticketId}/status`, { body: { status: 'new' }, cookie, headers: { origin: 'https://evil.example' } })).status, 403);
  // עוגיית משתמש רגיל או מזויפת לא פותחת
  assert.strictEqual((await req('GET', '/api/admin/tickets', { cookie: 'ps_admin=' + cookie.split('=')[1].replace(/.$/, 'x') })).status, 401);
  assert.strictEqual((await req('GET', '/api/admin/tickets', { cookie: 'ps_sess=abc; ps_pro=abc' })).status, 401);
  // החלפת סיסמה מבטלת סשנים קיימים
  app.setAdmin({ password: PASS + '-new' });
  assert.strictEqual((await req('GET', '/api/admin/tickets', { cookie })).status, 401);
  // התנתקות
  app.setAdmin({ password: PASS });
});

test('ניחוש סיסמה מוגבל בקצב', async () => {
  app.setAdmin({ password: PASS });
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) limited = (await req('POST', '/api/admin/login', { body: { password: 'guess-' + i + '-xxxxxxxx' } })).status === 429;
  assert.ok(limited);
  app.setAdmin({ password: undefined });
});

test('עמוד הניהול לא ברשימת האתר ולא מאונדקס', async () => {
  assert.doesNotMatch((await req('GET', '/sitemap.xml')).text, /admin/);
  assert.doesNotMatch((await req('GET', '/robots.txt')).text, /admin/);
  const page = await req('GET', '/admin.html');
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /name="robots" content="noindex"/);
  assert.doesNotMatch((await req('GET', '/')).text, /admin\.html/);
});
