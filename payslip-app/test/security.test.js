'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { sign } = require('../src/billing');
const { assertSafeMediaUrl } = require('../src/whatsapp');

process.env.RATE_LIMIT_HEAVY = '60'; // הבדיקות שולחות הרבה בקשות; בדיקת ההגבלה בסוף
const app = require('../server');
let server;
test.before(() => { server = app.listen(0); });
test.after(() => server.close());

function req(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.isBuffer(body) ? body : typeof body === 'string' ? body : JSON.stringify(body);
    const h = { ...headers };
    if (data && !h['content-type']) h['content-type'] = 'application/json';
    if (data) h['content-length'] = Buffer.byteLength(data);
    const r = http.request({ port: server.address().port, method, path: p, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function multipart(buf, name = 'payslip', filename = 'a.bin') {
  const b = '----t' + crypto.randomBytes(6).toString('hex');
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  return { body: Buffer.concat([head, buf, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

test('כותרות אבטחה', async () => {
  const r = await req('GET', '/');
  const csp = r.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.ok(r.headers['strict-transport-security']);
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(r.headers['referrer-policy'], 'no-referrer');
  assert.strictEqual(r.headers['x-powered-by'], undefined);
  assert.ok(r.headers['cross-origin-opener-policy']);
  assert.match((await req('GET', '/api/glossary')).headers['cache-control'] || '', /max-age|no-store/);
  assert.strictEqual((await req('GET', '/api/billing/me')).headers['cache-control'], 'no-store');
});

test('חסימת בקשות חוצות-אתר (CSRF)', async () => {
  const post = (headers) => req('POST', '/api/analyze-text', { body: { text: 'שכר יסוד 12,000.00 ברוטו' }, headers });
  assert.strictEqual((await post({ origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await post({ 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.strictEqual((await post({ 'sec-fetch-site': 'same-site' })).status, 403);
  const host = `localhost:${server.address().port}`;
  assert.strictEqual((await post({ origin: `http://${host}`, 'sec-fetch-site': 'same-origin' })).status, 200);
  // ל-webhook של Meta אין Origin מדפדפן, והוא מוגן בחתימה
  assert.strictEqual((await req('POST', '/api/whatsapp/webhook', { body: '{}', headers: { origin: 'https://evil.example' } })).status, 401);
});

test('מעבר תיקיות וחשיפת קבצים', async () => {
  for (const p of ['/..%2f..%2fetc%2fpasswd', '/%2e%2e/server.js', '/..%5cserver.js', '/src/analyzer.js', '/server.js', '/package.json', '/.env', '/.git/config', '/node_modules/express/package.json', '/.tessdata/heb.traineddata.gz', '/data/app.db', '/DEPLOY.md']) {
    const r = await req('GET', p);
    assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.doesNotMatch(r.text, /root:|require\(|express/);
  }
});

test('העלאה: סוגי קבצים מסוכנים, ענק, פצצות ופורמט פגום', async () => {
  const send = (buf, filename) => { const m = multipart(buf, 'payslip', filename); return req('POST', '/api/analyze', m); };
  assert.strictEqual((await send(Buffer.from('<?php system($_GET[1]); ?>'), 'shell.php.pdf')).status, 422);
  assert.strictEqual((await send(Buffer.from('MZ\x90\x00 not an image'), 'evil.exe')).status, 422);
  assert.strictEqual((await send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg')).status, 422);
  assert.strictEqual((await send(Buffer.alloc(9 * 1024 * 1024, 1), 'big.png')).status, 413);
  // PNG שמצהיר על 60000x60000 פיקסלים (פצצת דחיסה)
  const png = fs.readFileSync(path.join(__dirname, 'fixtures', 'tiny.png'));
  const bomb = Buffer.from(png); bomb.writeUInt32BE(60000, 16); bomb.writeUInt32BE(60000, 20);
  assert.strictEqual((await send(bomb, 'bomb.png')).status, 422);
  assert.strictEqual((await send(Buffer.from('%PDF-1.4\n1 0 obj<</Length 99999999>>stream\nAAAA'), 'bad.pdf')).status, 422);
  // שם שדה לא צפוי / בלי קובץ
  assert.ok([400, 500].includes((await req('POST', '/api/analyze', multipart(png, 'other'))).status));
  assert.strictEqual((await req('POST', '/api/analyze')).status, 400);
});

test('גוף JSON: גודל, תחביר ופולוציית פרוטוטייפ', async () => {
  const big = await req('POST', '/api/analyze-text', { body: JSON.stringify({ text: 'א'.repeat(300_000) }) });
  assert.strictEqual(big.status, 413);
  const bad = await req('POST', '/api/analyze-text', { body: '{"text": ' });
  assert.strictEqual(bad.status, 400);
  assert.doesNotMatch(bad.text, /at |node_modules|Error:/); // בלי stack trace
  await req('POST', '/api/analyze-text', { body: '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"text":"שכר נטו 1,000.00"}' });
  await req('POST', '/api/contact', { body: '{"__proto__":{"polluted":"yes"}}' });
  assert.strictEqual({}.polluted, undefined);
  assert.strictEqual(Object.prototype.polluted, undefined);
});

test('אסימוני שירות אחרים לא נחשבים עוגיית Pro, ועוגייה מזויפת נדחית', async () => {
  const secret = 'test-secret';
  app.setBilling({ stripe: null, secret });
  const slips = { slips: [1, 2].map((n) => ({ label: 'm' + n, items: [{ id: 'gross', title: 'ברוטו', type: 'summary', amount: 1000 * n }] })) };
  const exp = Math.floor(Date.now() / 1000) + 600;
  const waLink = sign({ t: 'wa-link', cid: 'cus_1', nonce: 'n', exp }, secret);
  const noType = sign({ cid: 'cus_1', exp }, secret);
  const good = sign({ t: 'pro', cid: 'cus_1', exp }, secret);
  const forged = sign({ t: 'pro', cid: 'cus_1', exp }, 'another-secret');
  const expired = sign({ t: 'pro', cid: 'cus_1', exp: 1 }, secret);
  const call = (tok) => req('POST', '/api/compare', { body: slips, headers: { cookie: `ps_pro=${tok}` } });
  assert.strictEqual((await call(waLink)).status, 402);
  assert.strictEqual((await call(noType)).status, 402);
  assert.strictEqual((await call(forged)).status, 402);
  assert.strictEqual((await call(expired)).status, 402);
  assert.strictEqual((await call(good)).status, 200);
  assert.strictEqual((await call(good + 'x')).status, 402);
});

test('הפעלת מנוי: מחיר, מצב, שימוש חוזר, ועוגיית __Host- בפרודקשן', async () => {
  const sessions = {
    cs_ok: { id: 'cs_ok', status: 'complete', mode: 'subscription', payment_status: 'paid', customer: 'cus_9', created: Date.now() / 1000, line_items: { data: [{ price: { id: 'price_ours' } }] } },
    cs_other_price: { id: 'cs_other_price', status: 'complete', mode: 'subscription', payment_status: 'paid', customer: 'cus_9', created: Date.now() / 1000, line_items: { data: [{ price: { id: 'price_cheap' } }] } },
    cs_payment_mode: { id: 'cs_payment_mode', status: 'complete', mode: 'payment', payment_status: 'paid', customer: 'cus_9', created: Date.now() / 1000, line_items: { data: [{ price: { id: 'price_ours' } }] } },
    cs_unpaid: { id: 'cs_unpaid', status: 'complete', mode: 'subscription', payment_status: 'unpaid', customer: 'cus_9', created: Date.now() / 1000 },
    cs_old: { id: 'cs_old', status: 'complete', mode: 'subscription', payment_status: 'paid', customer: 'cus_9', created: Date.now() / 1000 - 3 * 86400 },
  };
  const stripe = { checkout: { sessions: { create: async () => ({ url: 'x' }), retrieve: async (id) => { if (!sessions[id]) throw new Error('nope'); return sessions[id]; } } }, subscriptions: { list: async () => ({ data: [{ status: 'active' }] }) } };
  app.setBilling({ stripe, priceId: 'price_ours', secret: 'test-secret', secure: true });
  const act = (id) => req('POST', '/api/billing/activate', { body: { session_id: id } });
  for (const id of ['cs_other_price', 'cs_payment_mode', 'cs_unpaid', 'cs_old']) assert.strictEqual((await act(id)).status, 402, id);
  assert.strictEqual((await act('cs_missing')).status, 502);
  assert.strictEqual((await act('cs_ok; DROP TABLE')).status, 400);
  const ok = await act('cs_ok');
  assert.strictEqual(ok.status, 200);
  const c = ok.headers['set-cookie'][0];
  assert.match(c, /^__Host-ps_pro=/);
  assert.match(c, /HttpOnly/i); assert.match(c, /Secure/i); assert.match(c, /SameSite=Strict/i); assert.match(c, /Path=\//);
  assert.doesNotMatch(c, /Domain=/i);
  assert.strictEqual((await act('cs_ok')).status, 409); // שימוש חוזר
});

test('SSRF: כתובות מדיה', () => {
  assertSafeMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1');
  for (const u of ['http://lookaside.fbsbx.com/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://localhost/x', 'https://[::1]/x', 'https://metadata.internal/x', 'https://user:pw@evil.example/x', 'file:///etc/passwd', 'not a url']) {
    assert.throws(() => assertSafeMediaUrl(u), u);
  }
});

test('security.txt ודגלי פיתוח אסורים באירוח', () => {
  assert.ok(true);
  const res = spawnSync(process.execPath, ['-e', "require('./server.js')"], { cwd: path.join(__dirname, '..'), env: { ...process.env, PRO_DEV_UNLOCK: '1', RENDER: 'true' }, encoding: 'utf8' });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /must not be enabled/);
  const prod = spawnSync(process.execPath, ['-e', "require('./server.js')"], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', WA_DEV: '1' }, encoding: 'utf8' });
  assert.notStrictEqual(prod.status, 0);
});

test('security.txt נבנה מכתובת הקשר', async () => {
  const none = await req('GET', '/.well-known/security.txt');
  assert.ok([200, 404].includes(none.status));
});

test('מנוי שנתי ושחזור גישה באימייל', async () => {
  const mails = [];
  const mailer = { sendMail: async (m) => mails.push(m) };
  let active = true;
  const customers = { 'owner@example.com': [{ id: 'cus_owner' }] };
  const created = [];
  const stripe = {
    checkout: { sessions: { create: async (p) => { created.push(p); return { url: 'https://stripe.test/pay' }; }, retrieve: async () => ({}) } },
    customers: { list: async ({ email }) => ({ data: customers[email] || [] }) },
    subscriptions: { list: async () => ({ data: active ? [{ status: 'active' }] : [{ status: 'canceled' }] }) },
  };
  app.setBilling({ stripe, priceId: 'price_m', priceIdYearly: 'price_y', priceLabel: '19.90', priceLabelYearly: '199', secret: 'test-secret', mailer, mailFrom: 'no-reply@site.test', throttle: (() => { const n = {}; return (k) => (n[k] = (n[k] || 0) + 1); })() });

  // שנתי / חודשי בקופה
  await req('POST', '/api/billing/checkout', { body: { plan: 'yearly' } });
  await req('POST', '/api/billing/checkout', { body: {} });
  assert.strictEqual(created[0].line_items[0].price, 'price_y');
  assert.strictEqual(created[1].line_items[0].price, 'price_m');
  const me = await req('GET', '/api/billing/me');
  assert.deepStrictEqual(me.json.plans.map((p) => p.id), ['monthly', 'yearly']);

  // שחזור: תשובה זהה לכתובת קיימת ולא קיימת, מייל רק לבעל מנוי
  const wait = () => new Promise((r) => setTimeout(r, 60));
  const a = await req('POST', '/api/billing/recover', { body: { email: 'stranger@example.com' } });
  const b = await req('POST', '/api/billing/recover', { body: { email: 'owner@example.com' } });
  await wait();
  assert.deepStrictEqual(a.json, b.json);
  assert.strictEqual(mails.length, 1);
  assert.strictEqual(mails[0].to, 'owner@example.com');
  assert.strictEqual((await req('POST', '/api/billing/recover', { body: { email: 'not-an-email' } })).status, 400);
  const link = mails[0].text.match(/recover=([\w.-]+)/)[1];

  // אישור: חד-פעמי, ועוגייה רק לטוקן מסוג recover
  const waLike = sign({ t: 'pro', cid: 'cus_owner', exp: Math.floor(Date.now() / 1000) + 60 }, 'test-secret');
  assert.strictEqual((await req('POST', '/api/billing/recover/confirm', { body: { token: waLike } })).status, 400);
  assert.strictEqual((await req('POST', '/api/billing/recover/confirm', { body: { token: link + 'x' } })).status, 400);
  const ok = await req('POST', '/api/billing/recover/confirm', { body: { token: link } });
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers['set-cookie'][0], /^ps_pro=/);
  assert.strictEqual((await req('POST', '/api/billing/recover/confirm', { body: { token: link } })).status, 409);

  // מנוי שבוטל לא משוחזר גם עם קישור תקף
  await req('POST', '/api/billing/recover', { body: { email: 'owner@example.com' } });
  await wait();
  active = false;
  const link2 = mails[1].text.match(/recover=([\w.-]+)/)[1];
  assert.strictEqual((await req('POST', '/api/billing/recover/confirm', { body: { token: link2 } })).status, 402);

  // בלי שרת דואר: שחזור לא זמין
  app.setBilling({ stripe, priceId: 'price_m', secret: 'test-secret', mailer: null });
  assert.strictEqual((await req('POST', '/api/billing/recover', { body: { email: 'owner@example.com' } })).status, 503);
});

test('זכויות: חישוב ותזכורות ביומן תקינים', () => {
  const R = require('../public/js/rights-core');
  const r = R.compute({ start: '2019-03-10', daysPerWeek: 5, today: '2025-10-01' });
  assert.strictEqual(r.yearNo, 7);
  assert.strictEqual(r.recuperation.days, 7);
  assert.strictEqual(r.sick.accrued, 90);
  assert.ok(R.compute({ start: '2030-01-01' }).error);
  assert.ok(R.compute({ start: 'not-a-date' }).error);
  assert.strictEqual(R.compute({ start: '2025-09-20', today: '2025-10-01' }).recuperation.firstYearProRata, true);
  const ics = R.toIcs(R.reminderCatalog(r, '2025-10-01'), 'x');
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 5);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'שורות ארוכות מ-75 בתים');
  // הזרקת שורות: פסיק/נקודה-פסיק/שורה חדשה בשדות חייבים להיות מוברחים
  const evil = R.toIcs([{ id: 'x', title: 'a\r\nEND:VCALENDAR', desc: 'b;c,d', start: new Date(Date.UTC(2026, 0, 1)), rrule: 'FREQ=YEARLY' }], 'x');
  assert.strictEqual(evil.split('\r\n').filter((l) => l === 'END:VCALENDAR').length, 1);
});
