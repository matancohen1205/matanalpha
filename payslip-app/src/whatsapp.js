'use strict';

const crypto = require('crypto');
const express = require('express');
const { sign, verify } = require('./billing');
const { analyzePayslip } = require('./analyzer');
const { extractText } = require('./extract');
const { compareSlips } = require('./compare');

const DAY = 24 * 3600 * 1000;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const LINK_TTL_S = 30 * 60;
const MAX_INBOUND_PER_DAY = 40;
const MAX_JOBS = 2;

const fmt = (n) => `${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`;

/* ---------------------------------------------------------------- Meta Cloud API */

function assertSafeMediaUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('BAD_MEDIA_URL'); }
  const h = u.hostname.toLowerCase();
  const internal = h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':');
  if (u.protocol !== 'https:' || internal || u.username || u.password) throw new Error('BAD_MEDIA_URL');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createMetaClient({ phoneNumberId, token, version = 'v21.0', fetchImpl = fetch }) {
  const base = `https://graph.facebook.com/${version}`;
  const headers = { Authorization: `Bearer ${token}` };

  async function post(body) {
    const res = await fetchImpl(`${base}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    if (!res.ok) {
      const err = new Error(`WhatsApp API ${res.status}`);
      err.status = res.status;
      throw err;
    }
  }
  return {
    sendText: (to, text) => post({ to, type: 'text', text: { body: text, preview_url: false } }),
    sendTemplate: (to, name, lang = 'he', params = []) =>
      post({
        to,
        type: 'template',
        template: {
          name,
          language: { code: lang },
          ...(params.length ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] } : {}),
        },
      }),
    async downloadMedia(mediaId) {
      const meta = await fetchImpl(`${base}/${encodeURIComponent(mediaId)}`, { headers });
      if (!meta.ok) throw new Error('media lookup failed');
      const info = await meta.json();
      if (Number(info.file_size) > MAX_MEDIA_BYTES) {
        const e = new Error('TOO_LARGE');
        e.code = 'TOO_LARGE';
        throw e;
      }
      // כתובת ההורדה מגיעה מתשובת Meta, ובכל זאת מאמתים אותה: HTTPS בלבד ולא כתובת פנימית (הגנת SSRF)
      assertSafeMediaUrl(info.url);
      const file = await fetchImpl(info.url, { headers, redirect: 'error' });
      if (!file.ok) throw new Error('media download failed');
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_MEDIA_BYTES) {
        const e = new Error('TOO_LARGE');
        e.code = 'TOO_LARGE';
        throw e;
      }
      return buffer;
    },
  };
}

/** לקוח לפיתוח מקומי: מדפיס הודעות במקום לשלוח */
function createDevClient(log = console.log) {
  return {
    sendText: async (to, text) => log(`[WA dev] → ${to}\n${text}\n`),
    sendTemplate: async (to, name) => log(`[WA dev] → ${to} (template ${name})`),
    downloadMedia: async () => {
      throw new Error('no media in dev client');
    },
  };
}

/* ---------------------------------------------------------------- התראות */

function periodKey(analysis, now) {
  const p = analysis.summary && analysis.summary.period; // "MM/YYYY"
  const m = p && /^(\d{2})\/(\d{4})$/.exec(p);
  return m ? `${m[2]}-${m[1]}` : new Date(now).toISOString().slice(0, 7);
}

function toSnapshot(analysis) {
  return {
    items: analysis.items
      .filter((i) => i.amount !== null && i.id !== 'manual')
      .map((i) => ({ id: i.id, title: i.title, type: i.type, amount: i.amount })), // כותרות מהמילון שלנו, לא טקסט מהתלוש
  };
}

function buildAlerts(analysis, previous, currentKey) {
  const alerts = [];
  const snap = toSnapshot(analysis);
  if (previous.length) {
    try {
      const r = compareSlips({
        slips: [...previous.map((s) => ({ label: s.period, items: s.items })), { label: currentKey, items: snap.items }],
      });
      r.findings.forEach((f) => alerts.push({ level: f.level, text: f.title }));
    } catch {
      /* אין מספיק נתונים להשוואה */
    }
  }
  (analysis.insights || []).filter((i) => i.level === 'warn').forEach((i) => alerts.push({ level: 'warn', text: i.title }));
  const order = { warn: 0, info: 1, ok: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]).slice(0, 6);
}

function buildReply(analysis, alerts, currentKey, hadPrevious) {
  const s = analysis.summary;
  const lines = [`*סיכום תלוש ${currentKey.slice(5)}/${currentKey.slice(0, 4)}*`];
  if (s.gross) lines.push(`ברוטו: ${fmt(s.gross)}`);
  if (s.totalDeductions) lines.push(`ניכויים: ${fmt(s.totalDeductions)}`);
  if (s.net) lines.push(`נטו: ${fmt(s.net)}`);
  lines.push('');
  const warns = alerts.filter((a) => a.level === 'warn');
  const infos = alerts.filter((a) => a.level !== 'warn');
  if (warns.length) {
    lines.push('*⚠️ דברים שכדאי לבדוק:*');
    warns.forEach((a) => lines.push(`• ${a.text}`));
  } else {
    lines.push(hadPrevious ? '✅ לא זיהיתי שינויים חריגים לעומת החודשים הקודמים.' : '✅ לא זיהיתי דבר חריג בתלוש.');
  }
  if (infos.length) {
    lines.push('', '*לידיעתך:*');
    infos.forEach((a) => lines.push(`• ${a.text}`));
  }
  if (!hadPrevious) lines.push('', 'זה התלוש הראשון ששמרתי, ובחודש הבא אשווה אותו אוטומטית.');
  lines.push('', 'הערכה אוטומטית בלבד ואינה ייעוץ מקצועי. לשאלות פנו למחלקת השכר.');
  return lines.join('\n');
}

const HELP =
  'שלחו לי תלוש שכר כתמונה או כ-PDF, ואחזיר סיכום והתראות על דברים חריגים.\n' +
  'פקודות: *סטטוס* · *הפסק* (ניתוק ומחיקת כל הנתונים).';

/* ---------------------------------------------------------------- מנוע ההודעות */

/**
 * @param {object} d  תלויות (מוזרקות לבדיקות)
 * @param {object} d.store
 * @param {object} d.client           sendText / sendTemplate / downloadMedia
 * @param {string} d.secret           סוד לחתימת אסימוני קישור
 * @param {(cid:string)=>Promise<boolean>} d.isPro
 * @param {string} d.siteUrl
 * @param {Function} [d.extract]      ברירת מחדל: extractText
 */
function createEngine(d) {
  const extract = d.extract || extractText;
  const now = d.now || (() => Date.now());
  let jobs = 0;

  async function reply(to, text) {
    try {
      await d.client.sendText(to, text);
    } catch (e) {
      console.error('wa send failed:', e.status || e.name);
    }
  }

  async function handle(msg) {
    const from = String(msg.from || '');
    if (!/^\d{8,15}$/.test(from)) return;
    if (!d.store.firstSight(msg.id || `${from}-${now()}`, now())) return; // כבר טופל
    if (d.store.bump(from, now()) > MAX_INBOUND_PER_DAY) return;

    const text = msg.type === 'text' && msg.text ? String(msg.text.body || '').trim() : '';

    // 1. חיבור חשבון
    const link = /חיבור:\s*([A-Za-z0-9_.\-]{20,400})/.exec(text);
    if (link) return linkAccount(from, link[1]);

    const user = d.store.getByPhone(from);

    // 2. הפסקה ומחיקה (מותר גם בלי מנוי פעיל)
    if (user && /^(הפסק|הפסקה|stop|unsubscribe|מחק)/i.test(text)) {
      d.store.deleteUser(user.id);
      return reply(from, 'הפסקתי את ההתראות ומחקתי את כל הנתונים שלך, כולל מספר הטלפון. תודה שהיית איתנו. אפשר לחבר מחדש בכל עת דרך האתר.');
    }

    if (!user) {
      return reply(from, `שלום! כדי להשתמש בשירות צריך לחבר את הוואטסאפ מהאתר (למנויי Pro): ${d.siteUrl}/whatsapp.html`);
    }

    if (!(await d.isPro(user.cid))) {
      return reply(from, `המנוי שלך אינו פעיל, ולכן ההתראות מושהות. אפשר לחדש בכל עת: ${d.siteUrl}/pricing.html\nלמחיקת הנתונים שלח *הפסק*.`);
    }

    if (/^(סטטוס|status)/i.test(text)) {
      const snaps = d.store.recentSnapshots(user.id, 12);
      return reply(from, `מחובר ✅\nתלושים שמורים להשוואה: ${snaps.length}${snaps.length ? `\nהאחרון: ${snaps[snaps.length - 1].period}` : ''}`);
    }

    if (msg.type === 'image' || msg.type === 'document') {
      return processMedia(user, from, msg);
    }
    return reply(from, HELP);
  }

  async function linkAccount(from, token) {
    const p = verify(token, d.secret);
    if (!p || p.t !== 'wa-link' || !p.cid) {
      return reply(from, 'קישור החיבור אינו תקף או שפג תוקפו. אפשר ליצור קישור חדש באתר.');
    }
    if (!d.store.useNonce(p.nonce, now())) {
      return reply(from, 'קישור החיבור כבר נוצל. אפשר ליצור קישור חדש באתר.');
    }
    d.store.link({ cid: p.cid, phone: from, now: now() });
    return reply(from, 'החיבור הצליח ✅\nשלחו לי עכשיו את תלוש השכר כתמונה או כ-PDF, ואחזיר סיכום והתראות על דברים חריגים.\nהתלוש עצמו לא נשמר, רק סכומים מסוכמים להשוואה בין חודשים. לניתוק ומחיקה שלחו *הפסק*.');
  }

  async function processMedia(user, from, msg) {
    const media = msg[msg.type];
    if (!media || !media.id) return reply(from, HELP);
    if (jobs >= MAX_JOBS) return reply(from, 'אני עסוק כרגע, נסו לשלוח שוב בעוד רגע.');
    jobs++;
    try {
      let buffer = await d.client.downloadMedia(media.id);
      let analysis;
      try {
        const { text } = await extract(buffer);
        analysis = analyzePayslip(text);
      } finally {
        buffer = null; // הקובץ לא נשמר
      }
      const recognized = analysis.items.filter((i) => ['gross', 'net'].includes(i.id)).length;
      if (analysis.items.length < 3 || !recognized) {
        return reply(from, 'לא הצלחתי לקרוא את התלוש. נסו תמונה ישרה, חדה ומוארת, או קובץ PDF עם טקסט.');
      }
      const key = periodKey(analysis, now());
      const previous = d.store.recentSnapshots(user.id, 4).filter((s) => s.period !== key);
      const alerts = buildAlerts(analysis, previous, key);
      d.store.saveSnapshot(user.id, key, toSnapshot(analysis), now());
      return reply(from, buildReply(analysis, alerts, key, previous.length > 0));
    } catch (e) {
      const code = e.code || e.message;
      const known = {
        SCANNED_PDF: 'ה-PDF נראה סרוק, בלי טקסט. שלחו אותו כתמונה (צילום מסך).',
        UNSUPPORTED_TYPE: 'סוג הקובץ לא נתמך. שלחו תמונה (JPG/PNG) או PDF.',
        TOO_LARGE: 'הקובץ גדול מדי (עד 8MB).',
        OCR_TIMEOUT: 'הקריאה לקחה יותר מדי זמן. נסו תמונה קטנה וחדה יותר.',
      };
      console.error('wa media failed:', code);
      return reply(from, known[code] || 'משהו השתבש בקריאת התלוש. נסו שוב.');
    } finally {
      jobs--;
    }
  }

  /** תזכורות חודשיות (הודעת תבנית, כי השיחה יזומה על ידינו). נקרא ממתזמן יומי. */
  async function runReminders({ template, lang = 'he' } = {}) {
    if (!template) return 0;
    const t = now();
    let sent = 0;
    for (const u of d.store.remindable(t - 25 * DAY)) {
      const last = d.store.lastSnapshotAt(u.id) || u.consentAt;
      if (t - last < 28 * DAY) continue;
      if (!(await d.isPro(u.cid))) continue;
      try {
        await d.client.sendTemplate(u.phone, template, lang);
        d.store.markReminded(u.id, t);
        sent++;
      } catch (e) {
        console.error('wa reminder failed:', e.status || e.name);
      }
    }
    return sent;
  }

  return { handle, runReminders };
}

/* ---------------------------------------------------------------- Router */

function createWhatsApp(cfg) {
  const { store, client, secret, businessNumber, verifyToken, appSecret, getAuth, devUnlock = false, siteUrl, isPro, devEndpoints = false } = cfg;
  const engine = createEngine({ store, client, secret, isPro, siteUrl, extract: cfg.extract });
  const router = express.Router();
  const configured = !!(client && businessNumber);

  // ---- Webhook מ-Meta (גוף גולמי לצורך אימות חתימה) ----
  router.get('/webhook', (req, res) => {
    if (verifyToken && req.query['hub.mode'] === 'subscribe' && typeof req.query['hub.verify_token'] === 'string' && safeEqual(req.query['hub.verify_token'], verifyToken)) {
      return res.type('text').send(String(req.query['hub.challenge'] || ''));
    }
    res.sendStatus(403);
  });

  router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const sig = String(req.headers['x-hub-signature-256'] || '');
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret || '').update(req.body || Buffer.alloc(0)).digest('hex');
    const ok = appSecret && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.sendStatus(401);
    res.sendStatus(200); // עונים מיד, מעבדים ברקע
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return;
    }
    for (const entry of payload.entry || []) {
      for (const ch of entry.changes || []) {
        for (const m of (ch.value && ch.value.messages) || []) {
          engine.handle(m).catch((e) => console.error('wa handle failed:', e.name));
        }
      }
    }
  });

  // ---- API לאתר (מנויי Pro בלבד) ----
  const json = express.json({ limit: '5kb' });
  function identity(req) {
    const a = getAuth(req);
    if (!a) return null;
    return a.cid || (a.dev && devUnlock ? 'dev' : null);
  }
  const mask = (p) => `${'•'.repeat(Math.max(0, p.length - 3))}${p.slice(-3)}`;

  router.get('/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const cid = identity(req);
    if (!cid) return res.json({ configured, pro: false });
    const u = store.getByCid(cid);
    res.json({ configured, pro: true, linked: !!u, phone: u ? mask(u.phone) : null });
  });

  router.post('/link', json, (req, res) => {
    const cid = identity(req);
    if (!cid) return res.status(402).json({ error: 'PRO_REQUIRED', message: 'החיבור זמין למנויי Pro.' });
    if (!configured) return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'שירות הוואטסאפ עדיין לא הופעל באתר.' });
    if (!req.body || req.body.consent !== true) {
      return res.status(400).json({ error: 'CONSENT_REQUIRED', message: 'יש לאשר קבלת הודעות כדי להמשיך.' });
    }
    const token = sign({ t: 'wa-link', cid, nonce: crypto.randomBytes(12).toString('base64url'), exp: Math.floor(Date.now() / 1000) + LINK_TTL_S }, secret);
    const text = `חיבור: ${token}`;
    res.json({ url: `https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`, expiresInMinutes: LINK_TTL_S / 60 });
  });

  router.post('/unlink', json, (req, res) => {
    const cid = identity(req);
    if (!cid) return res.status(402).json({ error: 'PRO_REQUIRED' });
    const u = store.getByCid(cid);
    if (u) store.deleteUser(u.id);
    res.json({ linked: false });
  });

  if (devEndpoints) {
    // סימולציית הודעה נכנסת בפיתוח מקומי בלבד
    router.post('/dev-inbound', json, async (req, res) => {
      await engine.handle({ id: `dev-${Date.now()}-${Math.random()}`, from: String(req.body.from), type: 'text', text: { body: String(req.body.text || '') } });
      res.json({ ok: true });
    });
  }

  return { router, engine, configured };
}

module.exports = { assertSafeMediaUrl, createWhatsApp, createEngine, createMetaClient, createDevClient, buildAlerts, buildReply, periodKey };
