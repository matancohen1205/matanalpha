'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const TaxCore = require('../public/js/tax-core');
const { compareSlips } = require('../src/compare');
const { sign, verify } = require('../src/billing');

test('ברוטו->נטו: עקביות ושפיות', () => {
  const r = TaxCore.grossToNet({ gross: 15000, creditPoints: 2.25, pensionPct: 6 });
  assert.ok(r.net > 10000 && r.net < 13000, 'net=' + r.net);
  assert.strictEqual(r.net, +(r.gross - r.totalDeductions).toFixed(2));
  const low = TaxCore.grossToNet({ gross: 5000, creditPoints: 2.25, pensionPct: 6 });
  assert.strictEqual(low.incomeTax, 0); // מתחת לסף המס אחרי זיכוי
});

test('נטו->ברוטו הפיך', () => {
  const g = TaxCore.grossToNet({ gross: 18000, creditPoints: 3, pensionPct: 6, studyFundPct: 2.5 });
  const back = TaxCore.netToGross({ net: g.net, creditPoints: 3, pensionPct: 6, studyFundPct: 2.5 });
  assert.ok(Math.abs(back.gross - 18000) < 1, 'gross=' + back.gross);
});

test('נקודות זיכוי: אישה עם ילד בן 3', () => {
  const r = TaxCore.estimateCredits({ gender: 'f', children: [2022], taxYear: 2025 });
  assert.strictEqual(r.total, 2.25 + 0.5 + 2.5);
});

test('השוואה: טבלה, סדרות והתראות', () => {
  const mk = (label, gross, tax, extra = []) => ({
    label,
    items: [
      { id: 'gross', title: 'ברוטו', type: 'summary', amount: gross },
      { id: 'net', title: 'נטו', type: 'summary', amount: gross * 0.75 },
      { id: 'income_tax', title: 'מס הכנסה', type: 'deduction', amount: tax },
      ...extra,
    ],
  });
  const travel = { id: 'travel', title: 'נסיעות', type: 'earning', amount: 400 };
  const r = compareSlips({ slips: [mk('01/2025', 10000, 800, [travel]), mk('02/2025', 10000, 800, [travel]), mk('03/2025', 12000, 1900)] });
  assert.strictEqual(r.labels.length, 3);
  assert.deepStrictEqual(r.series.gross.values, [10000, 10000, 12000]);
  assert.ok(r.findings.some((f) => f.title.includes('נסיעות')));
  assert.ok(r.findings.some((f) => f.title.includes('שיעור מס')));
  assert.throws(() => compareSlips({ slips: [mk('a', 1, 1)] }));
});

test('חתימת אסימון', () => {
  const t = sign({ cid: 'cus_1', exp: Math.floor(Date.now() / 1000) + 60 }, 'secret');
  assert.strictEqual(verify(t, 'secret').cid, 'cus_1');
  assert.strictEqual(verify(t, 'other'), null);
  assert.strictEqual(verify(t.slice(0, -2) + 'xx', 'secret'), null);
  assert.strictEqual(verify(sign({ exp: 1 }, 'secret'), 'secret'), null);
});

function request(server, method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { port: server.address().port, method, path, headers: { ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...(cookie ? { cookie } : {}) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: buf ? JSON.parse(buf) : null }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('מנוי: חסימת Pro, הפעלה דרך Stripe מדומה, והשוואה', async () => {
  const app = require('../server');
  const fakeStripe = {
    checkout: {
      sessions: {
        create: async (params) => { fakeStripe.lastCheckout = params; return { url: 'https://stripe.test/pay' }; },
        retrieve: async (id) => ({ id, status: id === 'cs_paid' ? 'complete' : 'open', customer: 'cus_42', created: Date.now() / 1000 }),
      },
    },
    billingPortal: { sessions: { create: async () => ({ url: 'https://stripe.test/portal' }) } },
    subscriptions: { list: async () => ({ data: [{ status: 'active' }] }) },
  };
  app.setBilling({ stripe: fakeStripe, priceId: 'price_x', secret: 'test-secret' });
  const server = app.listen(0);
  try {
    const slips = { slips: [1, 2].map((n) => ({ label: 'm' + n, items: [{ id: 'gross', title: 'ברוטו', type: 'summary', amount: 1000 * n }] })) };

    assert.strictEqual((await request(server, 'POST', '/api/compare', slips)).status, 402);
    assert.strictEqual((await request(server, 'GET', '/api/billing/me')).json.pro, false);
    assert.strictEqual((await request(server, 'POST', '/api/billing/checkout', {})).json.url, 'https://stripe.test/pay');
    const co = fakeStripe.lastCheckout;
    assert.strictEqual(co.mode, 'subscription');
    assert.strictEqual(co.locale, 'he');
    assert.strictEqual(co.line_items[0].price, 'price_x');
    assert.match(co.success_url, /pricing\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
    assert.strictEqual((await request(server, 'POST', '/api/billing/activate', { session_id: 'cs_unpaid' })).status, 402);
    assert.strictEqual((await request(server, 'POST', '/api/billing/activate', { session_id: '../x' })).status, 400);

    const act = await request(server, 'POST', '/api/billing/activate', { session_id: 'cs_paid' });
    assert.strictEqual(act.status, 200);
    const cookie = act.headers['set-cookie'][0].split(';')[0];
    assert.match(act.headers['set-cookie'][0], /HttpOnly/i);
    assert.match(act.headers['set-cookie'][0], /SameSite=Strict/i);

    assert.strictEqual((await request(server, 'GET', '/api/billing/me', null, cookie)).json.pro, true);
    const cmp = await request(server, 'POST', '/api/compare', slips, cookie);
    assert.strictEqual(cmp.status, 200);
    assert.deepStrictEqual(cmp.json.series.gross.values, [1000, 2000]);
    assert.strictEqual((await request(server, 'POST', '/api/billing/portal', {}, cookie)).json.url, 'https://stripe.test/portal');
    // עוגייה מזויפת לא עוברת
    assert.strictEqual((await request(server, 'POST', '/api/compare', slips, 'ps_pro=abc.def')).status, 402);
  } finally {
    server.close();
  }
});

/* ---------------- שירות לקוחות ---------------- */
const ChatKB = require('../public/js/chat-kb');
const { GLOSSARY } = require('../src/glossary');
const { createSupport } = require('../src/support');

test('עוזר האתר: התאמת שאלות לכוונות ולמילון', () => {
  const intent = (q) => { const r = ChatKB.match(q, GLOSSARY); return r.type === 'kb' ? r.intent.id : r.type === 'glossary' ? 'glossary:' + r.entry.id : 'none'; };
  assert.strictEqual(intent('איך מעלים תלוש'), 'upload');
  assert.strictEqual(intent('אני רוצה לבטל את המנוי'), 'billing');
  assert.strictEqual(intent('כמה עולה המנוי'), 'pro');
  assert.strictEqual(intent('האתר לא עובד לי'), 'human');
  assert.strictEqual(intent('אני רוצה נציג'), 'human');
  assert.strictEqual(intent('מה זה ביטוח לאומי'), 'glossary:national_insurance');
  assert.strictEqual(intent('למה מנכים לי מס בריאות'), 'glossary:health_tax');
  assert.strictEqual(intent('איפה מוחקים את המידע שלי'), 'privacy');
  assert.strictEqual(intent('כדורגל'), 'none');
});

test('טופס יצירת קשר: ולידציה, מלכודת בוטים, שמירה מוצפנת ומייל', async () => {
  const app = require('express')();
  const { createStore } = require('../src/store');
  const store = createStore({ key: require('crypto').randomBytes(32).toString('hex') });
  const mails = [];
  const { router } = createSupport({ store, mailer: { sendMail: async (m) => mails.push(m) }, config: { supportEmail: 'help@site.test', supportHours: 'א-ה 9:00-17:00' } });
  app.use('/api', router);
  const server = app.listen(0);
  const good = { name: 'דנה כהן', email: 'dana@example.com', topic: 'billing', message: 'חויבתי פעמיים החודש, אשמח לבדיקה.', consent: true, elapsedMs: 8000, website: '' };
  try {
    assert.strictEqual((await request(server, 'GET', '/api/site-config')).json.supportEmail, 'help@site.test');
    // חסר אימייל + בלי הסכמה
    const bad = await request(server, 'POST', '/api/contact', { ...good, email: 'nope', consent: false });
    assert.strictEqual(bad.status, 400);
    assert.ok(bad.json.errors.email && bad.json.errors.consent);
    // מהר מדי (בוט)
    assert.strictEqual((await request(server, 'POST', '/api/contact', { ...good, elapsedMs: 100 })).status, 400);
    // honeypot: מחזיר הצלחה מדומה ולא שומר
    const before = store.listTickets().length;
    assert.strictEqual((await request(server, 'POST', '/api/contact', { ...good, website: 'http://spam' })).json.ticket, 'T-0000');
    assert.strictEqual(store.listTickets().length, before);
    // תקין
    const ok = await request(server, 'POST', '/api/contact', good);
    assert.strictEqual(ok.status, 200);
    assert.match(ok.json.ticket, /^T-\d{4}$/);
    const t = store.listTickets()[0];
    assert.strictEqual(t.email, 'dana@example.com');
    assert.strictEqual(t.topic, 'billing');
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(mails.length, 1);
    assert.strictEqual(mails[0].to, 'help@site.test');
    assert.strictEqual(mails[0].replyTo, 'dana@example.com');
    assert.match(mails[0].subject, /מנוי ותשלום/);
    // הגבלת קצב: 5 לשעה (כבר נוצלו 4 קריאות שהגיעו עד המגבל)
    let limited = false;
    for (let i = 0; i < 6 && !limited; i++) limited = (await request(server, 'POST', '/api/contact', good)).status === 429;
    assert.ok(limited);
  } finally {
    server.close();
  }
});
