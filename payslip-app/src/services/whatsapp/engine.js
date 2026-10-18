'use strict';

const { verify } = require('../billing/tokens');
const { analyzePayslip } = require('../../analyzer');
const { extractText } = require('../../extract');
const { periodKey, toSnapshot, buildAlerts, buildReply } = require('./alerts');

const DAY = 24 * 3600 * 1000;
const MAX_INBOUND_PER_DAY = 40;
const MAX_JOBS = 2;

const HELP =
  'שלחו לי תלוש שכר כתמונה או כ-PDF, ואחזיר סיכום והתראות על דברים חריגים.\n' +
  'פקודות: *סטטוס* · *הפסק* (ניתוק ומחיקת כל הנתונים).';


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

module.exports = { createEngine };
