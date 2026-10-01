'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const { createStore } = require('../src/store');
const { createEngine, buildAlerts } = require('../src/whatsapp');
const { sign } = require('../src/billing');
const { analyzePayslip } = require('../src/analyzer');

const SECRET = 'wa-test-secret';
const DAY = 864e5;

function slip(period, { gross = 14000, tax = 1400, travel = 396, credits = 2.25 } = {}) {
  const f = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const pension = Math.round(gross * 0.06);
  const net = gross - tax - 540 - 470 - pension;
  return [`תלוש שכר לחודש ${period}`, `שכר יסוד ${f(gross - travel)}`, travel ? `החזר נסיעות ${f(travel)}` : '', `סה"כ ברוטו ${f(gross)}`, `מס הכנסה ${f(tax)}`, `ביטוח לאומי ${f(540)}`, `מס בריאות ${f(470)}`, `פנסיה עובד ${f(pension)}`, `שכר נטו ${f(net)}`, `נקודות זיכוי ${credits}`].filter(Boolean).join('\n');
}

function setup({ pro = true } = {}) {
  const store = createStore({ key: crypto.randomBytes(32).toString('hex') });
  const sent = [];
  let nextText = '';
  let clock = Date.parse('2025-09-10T10:00:00Z');
  const client = {
    sendText: async (to, text) => sent.push({ to, text }),
    sendTemplate: async (to, name) => sent.push({ to, template: name }),
    downloadMedia: async () => Buffer.from('x'),
  };
  const engine = createEngine({
    store, client, secret: SECRET, siteUrl: 'https://site.test', isPro: async () => pro, now: () => clock,
    extract: async () => ({ text: nextText }),
  });
  let n = 0;
  return {
    store, sent, engine,
    advance: (days) => { clock += days * DAY; },
    setSlip: (t) => { nextText = t; },
    say: (from, text) => engine.handle({ id: `m${++n}`, from, type: 'text', text: { body: text } }),
    media: (from) => engine.handle({ id: `m${++n}`, from, type: 'image', image: { id: 'media1' } }),
    token: (cid, over = {}) => sign({ t: 'wa-link', cid, nonce: crypto.randomBytes(8).toString('hex'), exp: Math.floor(Date.now() / 1000) + 600, ...over }, SECRET),
    last: () => sent[sent.length - 1],
  };
}

test('אחסון: הצפנה, מחיקה ומגבלת תמונות מצב', () => {
  const s = createStore({ key: crypto.randomBytes(32).toString('hex') });
  const u = s.link({ cid: 'cus_1', phone: '972501234567' });
  assert.strictEqual(s.getByPhone('972501234567').cid, 'cus_1');
  for (let m = 1; m <= 14; m++) s.saveSnapshot(u.id, `2025-${String(m).padStart(2, '0')}`.replace('2025-13', '2026-01').replace('2025-14', '2026-02'), { items: [{ id: 'gross', amount: m }] });
  assert.strictEqual(s.recentSnapshots(u.id, 99).length, 12);
  s.deleteUser(u.id);
  assert.strictEqual(s.getByPhone('972501234567'), null);
  assert.strictEqual(s.recentSnapshots(u.id, 5).length, 0);
});

test('חיבור: אסימון תקין עובד פעם אחת, מזויף נדחה', async () => {
  const t = setup();
  await t.say('972501111111', `חיבור: ${t.token('cus_a')}`);
  assert.match(t.last().text, /החיבור הצליח/);
  assert.strictEqual(t.store.getByPhone('972501111111').cid, 'cus_a');
  const reused = t.token('cus_a', { nonce: 'same-nonce-for-reuse' });
  await t.say('972502222222', `חיבור: ${reused}`);
  await t.say('972503333333', `חיבור: ${reused}`);
  assert.match(t.last().text, /כבר נוצל/);
  await t.say('972504444444', 'חיבור: ' + 'x'.repeat(60));
  assert.match(t.last().text, /אינו תקף/);
  assert.strictEqual(t.store.getByPhone('972504444444'), null);
});

test('שולח לא מקושר מקבל הנחיה, לא ניתוח', async () => {
  const t = setup();
  await t.media('972509999999');
  assert.match(t.last().text, /לחבר את הוואטסאפ/);
});

test('ניתוח תלוש והתראות בין חודשים', async () => {
  const t = setup();
  await t.say('972501111111', `חיבור: ${t.token('cus_a')}`);

  t.setSlip(slip('07/2025'));
  await t.media('972501111111');
  assert.match(t.last().text, /סיכום תלוש 07\/2025/);
  assert.match(t.last().text, /התלוש הראשון/);

  t.setSlip(slip('08/2025'));
  await t.media('972501111111');
  assert.match(t.last().text, /לא זיהיתי שינויים חריגים/);

  // החודש: נסיעות נעלמו, מס קפץ, נקודות זיכוי ירדו
  t.setSlip(slip('09/2025', { travel: 0, tax: 2600, credits: 1.5 }));
  await t.media('972501111111');
  const text = t.last().text;
  assert.match(text, /דברים שכדאי לבדוק/);
  assert.match(text, /החזר נסיעות/);
  assert.match(text, /שיעור מס ההכנסה/);
  assert.match(text, /נקודות הזיכוי/);

  const u = t.store.getByPhone('972501111111');
  assert.deepStrictEqual(t.store.recentSnapshots(u.id, 5).map((s) => s.period), ['2025-07', '2025-08', '2025-09']);
  // לא נשמר טקסט גולמי: רק מזהה/כותרת מהמילון/סוג/סכום
  const snap = t.store.recentSnapshots(u.id, 1)[0];
  assert.deepStrictEqual(Object.keys(snap.items[0]).sort(), ['amount', 'id', 'title', 'type']);
});

test('קובץ שלא ניתן לקרוא לא נשמר', async () => {
  const t = setup();
  await t.say('972501111111', `חיבור: ${t.token('cus_a')}`);
  t.setSlip('זה לא תלוש בכלל');
  await t.media('972501111111');
  assert.match(t.last().text, /לא הצלחתי לקרוא/);
  assert.strictEqual(t.store.recentSnapshots(t.store.getByPhone('972501111111').id, 5).length, 0);
});

test('הפסק מוחק הכול; מנוי לא פעיל משהה', async () => {
  const t = setup();
  await t.say('972501111111', `חיבור: ${t.token('cus_a')}`);
  t.setSlip(slip('08/2025'));
  await t.media('972501111111');
  await t.say('972501111111', 'הפסק');
  assert.match(t.last().text, /מחקתי/);
  assert.strictEqual(t.store.getByPhone('972501111111'), null);

  const inactive = setup({ pro: false });
  await inactive.say('972502222222', `חיבור: ${inactive.token('cus_b')}`);
  inactive.setSlip(slip('08/2025'));
  await inactive.media('972502222222');
  assert.match(inactive.last().text, /המנוי שלך אינו פעיל/);
  assert.strictEqual(inactive.store.recentSnapshots(inactive.store.getByPhone('972502222222').id, 5).length, 0);
});

test('כפילות הודעה ומגבלה יומית', async () => {
  const t = setup();
  await t.say('972501111111', `חיבור: ${t.token('cus_a')}`);
  const before = t.sent.length;
  await t.engine.handle({ id: 'dup', from: '972501111111', type: 'text', text: { body: 'עזרה' } });
  await t.engine.handle({ id: 'dup', from: '972501111111', type: 'text', text: { body: 'עזרה' } });
  assert.strictEqual(t.sent.length, before + 1);
  for (let i = 0; i < 60; i++) await t.say('972501111111', 'עזרה');
  assert.ok(t.sent.length - before < 45);
});

test('תזכורת חודשית רק למי שלא שלח תלוש', async () => {
  const t = setup();
  await t.say('972501111111', `חיבור: ${t.token('cus_a')}`);
  assert.strictEqual(await t.engine.runReminders({ template: 'payslip_reminder' }), 0); // רק התחבר
  t.advance(30);
  assert.strictEqual(await t.engine.runReminders({ template: 'payslip_reminder' }), 1);
  assert.strictEqual(t.last().template, 'payslip_reminder');
  assert.strictEqual(await t.engine.runReminders({ template: 'payslip_reminder' }), 0); // לא פעמיים
  assert.strictEqual(await t.engine.runReminders({}), 0);
});

test('buildAlerts: אין התראות על תלוש ראשון תקין', () => {
  const a = analyzePayslip(slip('08/2025'));
  assert.deepStrictEqual(buildAlerts(a, [], '2025-08').filter((x) => x.level === 'warn'), []);
});

/* ---------------- HTTP: webhook חתום + API לאתר ---------------- */

function req(server, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    const r = http.request({ port: server.address().port, method, path, headers: { ...(data && !headers['content-type'] ? { 'content-type': 'application/json' } : {}), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, headers: res.headers, json: j, text: buf }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

test('HTTP: אימות webhook, חתימה, וקישור חיבור מהאתר', async () => {
  const app = require('../server');
  const sent = [];
  const client = { sendText: async (to, text) => sent.push({ to, text }), sendTemplate: async () => {}, downloadMedia: async () => Buffer.from('') };
  app.setBilling({ stripe: null, secret: 'test-secret', devUnlock: true });
  const wa = app.setWhatsApp({ client, businessNumber: '972500000001', verifyToken: 'vt', appSecret: 'appsec', secret: 'test-secret', devUnlock: true, isPro: async () => true });
  const server = app.listen(0);
  try {
    assert.strictEqual((await req(server, 'GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=abc')).text, 'abc');
    assert.strictEqual((await req(server, 'GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc')).status, 403);

    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'w1', from: '972507777777', type: 'text', text: { body: 'שלום' } }] } }] }] });
    const goodSig = 'sha256=' + crypto.createHmac('sha256', 'appsec').update(payload).digest('hex');
    assert.strictEqual((await req(server, 'POST', '/api/whatsapp/webhook', { body: payload, headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } })).status, 401);
    assert.strictEqual((await req(server, 'POST', '/api/whatsapp/webhook', { body: payload })).status, 401);
    assert.strictEqual((await req(server, 'POST', '/api/whatsapp/webhook', { body: payload, headers: { 'x-hub-signature-256': goodSig } })).status, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].text, /לחבר את הוואטסאפ/);

    // אתר: ללא Pro נחסם
    assert.strictEqual((await req(server, 'POST', '/api/whatsapp/link', { body: { consent: true } })).status, 402);
    const act = await req(server, 'POST', '/api/billing/dev-activate', { body: {} });
    const cookie = act.headers['set-cookie'][0].split(';')[0];
    assert.strictEqual((await req(server, 'POST', '/api/whatsapp/link', { body: {}, headers: { cookie } })).status, 400); // בלי הסכמה
    const link = await req(server, 'POST', '/api/whatsapp/link', { body: { consent: true }, headers: { cookie } });
    assert.strictEqual(link.status, 200);
    assert.match(link.json.url, /^https:\/\/wa\.me\/972500000001\?text=/);

    // המשתמש שולח את ההודעה המוכנה מהטלפון שלו
    const text = decodeURIComponent(link.json.url.split('?text=')[1]);
    await wa.engine.handle({ id: 'w2', from: '972508888888', type: 'text', text: { body: text } });
    const st = await req(server, 'GET', '/api/whatsapp/status', { headers: { cookie } });
    assert.strictEqual(st.json.linked, true);
    assert.match(st.json.phone, /^•+888$/); // טלפון מוסתר
    assert.strictEqual((await req(server, 'POST', '/api/whatsapp/unlink', { body: {}, headers: { cookie } })).json.linked, false);
    assert.strictEqual((await req(server, 'GET', '/api/whatsapp/status', { headers: { cookie } })).json.linked, false);
  } finally {
    server.close();
  }
});
