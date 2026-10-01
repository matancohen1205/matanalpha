'use strict';

const crypto = require('crypto');
const express = require('express');

const COOKIE_PLAIN = 'ps_pro';
const COOKIE_HOST = '__Host-ps_pro'; // בפרודקשן: קידומת __Host- מחייבת Secure, Path=/ וללא Domain
const TOKEN_TTL_S = 7 * 24 * 3600; // אחרי שבוע בודקים מחדש מול ספק התשלומים

const b64 = (b) => Buffer.from(b).toString('base64url');

function sign(payload, secret) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let given;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * מודול מנוי בלי מסד נתונים: הזהות היחידה שנשמרת היא מזהה לקוח ב-Stripe בתוך עוגייה חתומה.
 * @param {object} opts
 * @param {object|null} opts.stripe  לקוח Stripe (או דמה לבדיקות). null = תשלומים לא מוגדרים
 * @param {string} opts.secret       סוד לחתימת העוגייה
 * @param {string} opts.priceId
 * @param {string} opts.publicUrl    כתובת האתר (ל-success/cancel)
 * @param {string} opts.priceLabel   טקסט מחיר לתצוגה
 * @param {boolean} [opts.devUnlock] פתיחת Pro מקומית לבדיקות (אסור בפרודקשן)
 * @param {boolean} [opts.secure]    עוגייה Secure (פרודקשן)
 */
function createBilling(opts) {
  const { stripe, secret, priceId, priceIdYearly, publicUrl, priceLabel, priceLabelYearly, devUnlock = false, secure = false, once, mailer = null, mailFrom, throttle } = opts;
  const PRICES = { monthly: priceId, yearly: priceIdYearly };
  const ourPrices = [priceId, priceIdYearly].filter(Boolean);
  // תוכניות שמוצגות באתר: שנתי רק אם הוגדר מחיר שנתי
  const plans = [{ id: 'monthly', label: priceLabel }].concat(priceLabelYearly && (priceIdYearly || !stripe) ? [{ id: 'yearly', label: priceLabelYearly }] : []);
  const COOKIE = secure ? COOKIE_HOST : COOKIE_PLAIN;
  const router = express.Router();
  router.use(express.json({ limit: '10kb' }));

  // הגנת CSRF בסיסית: רק JSON ורק מאותו origin
  router.use((req, res, next) => {
    if (req.method === 'POST') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
      const origin = req.headers.origin;
      if (origin && publicUrl && origin !== new URL(publicUrl).origin && !devUnlock) {
        return res.status(403).json({ error: 'BAD_ORIGIN' });
      }
    }
    next();
  });

  function setCookie(res, payload) {
    const token = sign({ ...payload, t: 'pro', exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }, secret);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure, maxAge: TOKEN_TTL_S * 1000, path: '/' });
  }
  const clearCookie = (res) => res.clearCookie(COOKIE, { path: '/' });
  // אסימוני וואטסאפ וסוגים אחרים חתומים באותו סוד, ולכן מקבלים רק אסימון שסוגו pro
  const getAuth = (req) => {
    const p = verify(readCookie(req, COOKIE), secret);
    return p && p.t === 'pro' ? p : null;
  };

  router.get('/me', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = getAuth(req);
    if (!auth) return res.json({ pro: false, configured: !!stripe, devUnlock, priceLabel, plans });
    // רענון מול Stripe כשהאסימון מתקרב לפקיעה
    const age = auth.exp - Math.floor(Date.now() / 1000);
    if (stripe && auth.cid && age < TOKEN_TTL_S - 24 * 3600) {
      try {
        if (await hasActiveSubscription(stripe, auth.cid)) setCookie(res, { cid: auth.cid });
        else {
          clearCookie(res);
          return res.json({ pro: false, configured: true, priceLabel, plans });
        }
      } catch {
        /* אם Stripe לא זמין משאירים את האסימון עד שיפוג */
      }
    }
    res.json({ pro: true, configured: !!stripe, devUnlock, priceLabel, plans, portal: !!(stripe && auth.cid) });
  });

  router.post('/checkout', async (req, res) => {
    const plan = req.body && req.body.plan === 'yearly' ? 'yearly' : 'monthly';
    const price = PRICES[plan];
    if (!stripe || !price) return res.status(503).json({ error: 'NOT_CONFIGURED', message: plan === 'yearly' ? 'המנוי השנתי עדיין לא זמין.' : 'התשלומים עדיין לא הוגדרו באתר.' });
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        success_url: `${publicUrl}/pricing.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/pricing.html?canceled=1`,
        locale: 'he',
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        custom_text: {
          submit: {
            message: `בלחיצה על התשלום אתם מאשרים את [תנאי השימוש](${publicUrl}/terms.html) ואת [מדיניות הפרטיות](${publicUrl}/privacy.html). ניתן לבטל בכל עת.`,
          },
        },
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error('checkout failed:', e.type || e.name);
      res.status(502).json({ error: 'CHECKOUT_FAILED', message: 'לא הצלחנו לפתוח את דף התשלום. נסו שוב.' });
    }
  });

  router.post('/activate', async (req, res) => {
    const id = req.body && req.body.session_id;
    if (!stripe) return res.status(503).json({ error: 'NOT_CONFIGURED' });
    if (typeof id !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'BAD_SESSION' });
    try {
      const s = await stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] });
      const fresh = Date.now() / 1000 - s.created < 24 * 3600;
      const paid = ['paid', 'no_payment_required'].includes(s.payment_status || 'paid');
      const items = (s.line_items && s.line_items.data) || null;
      // חייב להיות מנוי שלנו (המחיר שלנו), לא עסקה אחרת באותו חשבון Stripe
      const ours = !ourPrices.length || !items || items.some((li) => li.price && ourPrices.includes(li.price.id));
      if (s.status !== 'complete' || !s.customer || !fresh || !paid || (s.mode && s.mode !== 'subscription') || !ours) {
        return res.status(402).json({ error: 'NOT_PAID', message: 'לא נמצא תשלום שהושלם.' });
      }
      // מזהה עסקה הוא "מפתח" חד-פעמי: דליפה שלו (היסטוריה, לוגים) לא מאפשרת הפעלה חוזרת
      if (once && !once('cs:' + id)) {
        return res.status(409).json({ error: 'ALREADY_USED', message: 'הקישור כבר נוצל. אם איבדתם גישה, פנו לשירות לקוחות.' });
      }
      setCookie(res, { cid: typeof s.customer === 'string' ? s.customer : s.customer.id });
      res.json({ pro: true });
    } catch (e) {
      console.error('activate failed:', e.type || e.name);
      res.status(502).json({ error: 'ACTIVATE_FAILED', message: 'לא הצלחנו לאמת את התשלום. נסו לרענן.' });
    }
  });

  /* ---------- שחזור גישה באימייל (קישור קסם חד-פעמי) ---------- */
  const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

  router.post('/recover', async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().slice(0, 120);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'נא להזין כתובת אימייל תקינה.' });
    if (!stripe || !mailer) {
      return res.status(503).json({ error: 'NOT_AVAILABLE', message: 'שחזור באימייל אינו זמין כרגע. פנו לשירות לקוחות ונשחזר את הגישה.' });
    }
    // תשובה זהה בכל מקרה, כדי לא לחשוף אם כתובת קיימת כמנוי
    res.json({ ok: true, message: 'אם קיים מנוי פעיל בכתובת הזו, נשלח אליה קישור שחזור בתוקף 15 דקות.' });
    try {
      if (throttle && throttle('recover:' + email.toLowerCase()) > 3) return;
      let cid = null;
      for (const e of new Set([email, email.toLowerCase()])) {
        const list = await stripe.customers.list({ email: e, limit: 10 });
        for (const c of list.data) {
          if (await hasActiveSubscription(stripe, c.id)) { cid = c.id; break; }
        }
        if (cid) break;
      }
      if (!cid) return;
      const token = sign({ t: 'recover', cid, nonce: crypto.randomBytes(12).toString('base64url'), exp: Math.floor(Date.now() / 1000) + 15 * 60 }, secret);
      await mailer.sendMail({
        from: mailFrom,
        to: email,
        subject: 'קישור לשחזור הגישה למנוי Pro',
        text: `שלום,\n\nביקשתם לשחזר את הגישה למנוי Pro באתר תלוש בעברית.\nלחצו על הקישור (בתוקף 15 דקות, לשימוש חד-פעמי):\n${publicUrl}/pricing.html?recover=${token}\n\nאם לא ביקשתם זאת, אפשר להתעלם מההודעה.\n`,
      });
    } catch (e) {
      console.error('recover failed:', e.type || e.code || e.name);
    }
  });

  router.post('/recover/confirm', async (req, res) => {
    const p = verify(req.body && req.body.token, secret);
    if (!stripe || !p || p.t !== 'recover' || !p.cid) return res.status(400).json({ error: 'BAD_TOKEN', message: 'הקישור אינו תקף או שפג תוקפו.' });
    if (once && !once('rec:' + p.nonce)) return res.status(409).json({ error: 'ALREADY_USED', message: 'הקישור כבר נוצל. אפשר לבקש קישור חדש.' });
    try {
      if (!(await hasActiveSubscription(stripe, p.cid))) return res.status(402).json({ error: 'NOT_ACTIVE', message: 'המנוי אינו פעיל.' });
      setCookie(res, { cid: p.cid });
      res.json({ pro: true });
    } catch (e) {
      res.status(502).json({ error: 'RECOVER_FAILED', message: 'לא הצלחנו לאמת את המנוי. נסו שוב.' });
    }
  });

  router.post('/portal', async (req, res) => {
    const auth = getAuth(req);
    if (!stripe || !auth || !auth.cid) return res.status(401).json({ error: 'NO_SUBSCRIPTION' });
    try {
      const p = await stripe.billingPortal.sessions.create({ customer: auth.cid, return_url: `${publicUrl}/pricing.html` });
      res.json({ url: p.url });
    } catch (e) {
      res.status(502).json({ error: 'PORTAL_FAILED', message: 'לא הצלחנו לפתוח את ניהול המנוי.' });
    }
  });

  router.post('/logout', (req, res) => {
    clearCookie(res);
    res.json({ pro: false });
  });

  // מצב פיתוח בלבד: פותח Pro בלי תשלום כדי לבדוק את הפיצ'רים
  if (devUnlock) {
    router.post('/dev-activate', (req, res) => {
      setCookie(res, { cid: null, dev: true });
      res.json({ pro: true, dev: true });
    });
  }

  /** middleware להגנה על נתיבי Pro */
  function requirePro(req, res, next) {
    if (getAuth(req)) return next();
    res.status(402).json({ error: 'PRO_REQUIRED', message: 'הפיצ\'ר זמין למנויי Pro.' });
  }

  const proCache = new Map();
  /** האם ללקוח יש מנוי פעיל (עם מטמון של 6 שעות), לשימוש שירותים ברקע כמו וואטסאפ */
  async function isProCid(cid) {
    if (cid === 'dev') return devUnlock;
    if (!stripe || !cid) return false;
    const hit = proCache.get(cid);
    if (hit && hit.until > Date.now()) return hit.value;
    let value = false;
    try {
      value = await hasActiveSubscription(stripe, cid);
    } catch {
      return hit ? hit.value : false;
    }
    proCache.set(cid, { value, until: Date.now() + 6 * 3600 * 1000 });
    return value;
  }

  return { router, requirePro, getAuth, isProCid };
}

async function hasActiveSubscription(stripe, customerId) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
  return subs.data.some((s) => ['active', 'trialing', 'past_due'].includes(s.status));
}

module.exports = { createBilling, sign, verify };
