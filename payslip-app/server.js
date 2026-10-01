'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { analyzePayslip } = require('./src/analyzer');
const { extractText, ensureLangDir } = require('./src/extract');
const { GLOSSARY } = require('./src/glossary');
const { compareSlips } = require('./src/compare');
const { createBilling } = require('./src/billing');
const crypto = require('crypto');
const { createStore } = require('./src/store');
const { createSupport } = require('./src/support');
const { createWhatsApp, createMetaClient, createDevClient } = require('./src/whatsapp');

const PORT = Number(process.env.PORT) || 3000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;
const MAX_CONCURRENT_JOBS = 2;

const app = express();
app.disable('x-powered-by');
// מאחורי reverse proxy (Nginx / Cloudflare / PaaS) כדי שמגבלת הקצב תזהה IP אמיתי
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  })
);
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    maxAge: '1h',
    setHeaders(res, file) {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// ---------- API ----------
const api = express.Router();
api.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const limiterMsg = { error: 'RATE_LIMIT', message: 'יותר מדי בקשות. נסו שוב בעוד מספר דקות.' };
// כללי: נטען בכל כניסה לדף (מילון, סטטוס מנוי)
api.use(rateLimit({ windowMs: 10 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: limiterMsg }));
// קפדני: פעולות כבדות (סריקה, השוואה, תשלום)
const heavy = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: limiterMsg });

// ---------- מנוי ----------
const isProd = process.env.NODE_ENV === 'production';
const stripeKey = process.env.STRIPE_SECRET_KEY;
let tokenSecret = process.env.PRO_TOKEN_SECRET;
if (!tokenSecret) {
  if (isProd && stripeKey) throw new Error('PRO_TOKEN_SECRET is required in production when Stripe is enabled');
  tokenSecret = crypto.randomBytes(32).toString('hex'); // אקראי לכל הרצה (פיתוח בלבד)
}
const billingConfig = {
  stripe: stripeKey ? require('stripe')(stripeKey) : null,
  secret: tokenSecret,
  priceId: process.env.STRIPE_PRICE_ID,
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${PORT}`,
  priceLabel: process.env.PRICE_LABEL || '19.90 ₪ לחודש',
  devUnlock: !isProd && process.env.PRO_DEV_UNLOCK === '1',
  secure: isProd,
};
const billingRef = { current: createBilling(billingConfig) };
app.setBilling = (opts) => { billingRef.current = createBilling({ ...billingConfig, ...opts }); }; // לבדיקות
api.use('/billing', (req, res, next) => (req.method === 'POST' && req.path !== '/dev-activate' ? heavy : (q, r, n) => n())(req, res, () => billingRef.current.router(req, res, next)));
const requirePro = (req, res, next) => billingRef.current.requirePro(req, res, next);

// ---------- וואטסאפ (Meta Cloud API) ----------
const waEnv = process.env;
const waReal = !!(waEnv.WA_ACCESS_TOKEN && waEnv.WA_PHONE_NUMBER_ID && waEnv.WA_BUSINESS_NUMBER);
if (isProd && waReal && (!(waEnv.DATA_KEY || waEnv.WA_DATA_KEY) || !waEnv.WA_APP_SECRET || !waEnv.WA_VERIFY_TOKEN || !(waEnv.DB_PATH || waEnv.WA_DB_PATH))) {
  throw new Error('DATA_KEY, WA_APP_SECRET, WA_VERIFY_TOKEN and DB_PATH are required when WhatsApp is enabled in production');
}
const dbPath = waEnv.DB_PATH || waEnv.WA_DB_PATH || ':memory:';
const dataKey = waEnv.DATA_KEY || waEnv.WA_DATA_KEY;
if (isProd && dbPath === ':memory:') console.warn('WARNING: DB_PATH is not set, so support tickets are not persisted');
const waStore = createStore({ path: dbPath, key: dataKey });
function buildWhatsApp(over = {}) {
  return createWhatsApp({
    store: waStore,
    client: waReal ? createMetaClient({ phoneNumberId: waEnv.WA_PHONE_NUMBER_ID, token: waEnv.WA_ACCESS_TOKEN }) : isProd ? null : createDevClient(),
    secret: tokenSecret,
    businessNumber: waEnv.WA_BUSINESS_NUMBER || (isProd ? '' : '972500000000'),
    verifyToken: waEnv.WA_VERIFY_TOKEN,
    appSecret: waEnv.WA_APP_SECRET,
    siteUrl: billingConfig.publicUrl,
    devUnlock: billingConfig.devUnlock,
    devEndpoints: !isProd && waEnv.WA_DEV === '1',
    getAuth: (req) => billingRef.current.getAuth(req),
    isPro: (cid) => billingRef.current.isProCid(cid),
    ...over,
  });
}
const waRef = { current: buildWhatsApp() };
app.setWhatsApp = (over) => { waRef.current = buildWhatsApp(over); return waRef.current; }; // לבדיקות
api.use('/whatsapp', (req, res, next) => waRef.current.router(req, res, next));

// ---------- שירות לקוחות: טופס יצירת קשר ופרטי קשר ----------
function buildSupport(over = {}) {
  return createSupport({
    store: waStore,
    mailer: waEnv.SMTP_URL ? require('nodemailer').createTransport(waEnv.SMTP_URL) : null,
    publicUrl: billingConfig.publicUrl,
    config: {
      supportEmail: waEnv.SUPPORT_EMAIL,
      supportWhatsapp: waEnv.SUPPORT_WHATSAPP,
      supportHours: waEnv.SUPPORT_HOURS,
      mailFrom: waEnv.MAIL_FROM,
      notifyTo: waEnv.SUPPORT_NOTIFY_TO,
    },
    ...over,
  });
}
const supportRef = { current: buildSupport() };
app.setSupport = (over) => { supportRef.current = buildSupport(over); return supportRef.current; }; // לבדיקות
api.use((req, res, next) => ((req.path === '/site-config' || req.path === '/contact') ? supportRef.current.router(req, res, next) : next()));

// קבצים נשמרים בזיכרון בלבד, ללא כתיבה לדיסק
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 2 },
});

let activeJobs = 0;
async function withSlot(res, fn) {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return res.status(503).json({ error: 'BUSY', message: 'השרת עסוק כרגע. נסו שוב בעוד רגע.' });
  }
  activeJobs++;
  try {
    return await fn();
  } finally {
    activeJobs--;
  }
}

const MESSAGES = {
  UNSUPPORTED_TYPE: 'סוג הקובץ אינו נתמך. אפשר להעלות PDF, JPG, PNG או WEBP.',
  SCANNED_PDF: 'ה-PDF נראה כסרוק (ללא טקסט). אפשר לצלם מסך או להעלות אותו כתמונה (JPG/PNG).',
  OCR_TIMEOUT: 'קריאת התלוש לקחה יותר מדי זמן. נסו תמונה חדה וקטנה יותר.',
};

api.post('/analyze', heavy, upload.single('payslip'), (req, res) =>
  withSlot(res, async () => {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'לא נבחר קובץ.' });
    try {
      const { text, source } = await extractText(req.file.buffer);
      const result = analyzePayslip(text);
      res.json({ ok: true, source, ...result });
    } catch (err) {
      const code = err.code || err.message;
      if (MESSAGES[code]) return res.status(422).json({ error: code, message: MESSAGES[code] });
      // לא מדפיסים תוכן או שם קובץ ללוג, רק סוג השגיאה
      console.error('analyze failed:', err.name);
      res.status(500).json({ error: 'FAILED', message: 'לא הצלחנו לקרוא את הקובץ. נסו קובץ אחר.' });
    } finally {
      req.file.buffer = null;
    }
  })
);

// הדבקת טקסט ידנית (חלופה בלי העלאת קובץ)
api.post('/analyze-text', heavy, express.json({ limit: '100kb' }), (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, MAX_TEXT_CHARS) : '';
  if (text.trim().length < 10) {
    return res.status(400).json({ error: 'NO_TEXT', message: 'יש להדביק טקסט של התלוש.' });
  }
  res.json({ ok: true, source: 'text', ...analyzePayslip(text) });
});

const glossaryList = GLOSSARY.map(({ id, type, title, what, why }) => ({ id, type, title, what, why }));
api.get('/glossary', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(glossaryList);
});

// השוואת תלושים: זמינה למנויי Pro בלבד, החישוב בשרת
api.post('/compare', requirePro, express.json({ limit: '300kb' }), (req, res) => {
  try {
    res.json({ ok: true, ...compareSlips(req.body) });
  } catch (e) {
    res.status(400).json({ error: 'BAD_INPUT', message: 'נדרשים לפחות שני תלושים תקינים (עד 12).' });
  }
});

app.use('/api', api);

app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'הקובץ גדול מדי (עד 8MB).' : 'הבקשה אינה תקינה.';
    return res.status(413).json({ error: err.code, message });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'TOO_LARGE', message: 'הטקסט ארוך מדי.' });
  }
  console.error('server error:', err.name);
  res.status(500).json({ error: 'FAILED', message: 'שגיאה בשרת.' });
});

if (require.main === module) {
  ensureLangDir();
  app.listen(PORT, () => console.log(`Payslip app listening on http://localhost:${PORT}`));
  setInterval(() => waStore.cleanup(), 24 * 3600 * 1000).unref(); // ניקוי יומי של נתונים זמניים ופניות ישנות
  if (waEnv.WA_REMINDER_TEMPLATE && waRef.current.configured) {
    // תזמון יומי של תזכורות. מניחים מופע שרת יחיד.
    const tick = () => {
      waStore.cleanup();
      waRef.current.engine.runReminders({ template: waEnv.WA_REMINDER_TEMPLATE }).catch((e) => console.error('reminders failed:', e.name));
    };
    setInterval(tick, 6 * 3600 * 1000).unref();
  }
}

module.exports = app;
