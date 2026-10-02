'use strict';

const fs = require('fs');
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
const { createAgent } = require('./src/agent');
const { createAccounts } = require('./src/accounts');
const { createWhatsApp, createMetaClient, createDevClient } = require('./src/whatsapp');

const PORT = Number(process.env.PORT) || 3000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;
const MAX_CONCURRENT_JOBS = 2;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');

// ---------- הקשחה כללית ----------
// דגלי פיתוח (פתיחת Pro בלי תשלום, נתיב סימולציה) אסור שיגיעו לסביבת אירוח אמיתית
if ((process.env.PRO_DEV_UNLOCK === '1' || process.env.WA_DEV === '1') &&
    (isProd || process.env.RENDER || process.env.FLY_APP_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.KUBERNETES_SERVICE_HOST)) {
  throw new Error('PRO_DEV_UNLOCK / WA_DEV must not be enabled in a hosted or production environment');
}
app.set('query parser', 'simple'); // בלי אובייקטים מקוננים מפרמטרי URL (חוסם קלט מבני זדוני)
app.set('etag', false);
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
        frameSrc: ["'none'"],
        manifestSrc: ["'self'"],
        mediaSrc: ["'none'"],
        workerSrc: ["'none'"],
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


// ---------- הגנת CSRF/Origin לכל בקשה משנה-מצב ל-API ----------
// דפדפן מודרני שולח Sec-Fetch-Site ו-Origin. בקשה חוצת-אתר נדחית. ה-webhook של Meta (ללא דפדפן) מוחרג וחתום בנפרד.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('/api', (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || req.path === '/whatsapp/webhook') return next();
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return res.status(403).json({ error: 'CROSS_SITE', message: 'הבקשה נדחתה.' });
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (!host || host !== req.headers.host) return res.status(403).json({ error: 'BAD_ORIGIN', message: 'הבקשה נדחתה.' });
  }
  next();
});
// בקשות API שנתקעות לא תופסות משאבים לנצח
app.use('/api', (req, res, next) => {
  res.setTimeout(req.path === '/analyze' ? 90_000 : 30_000, () => { if (!res.headersSent) res.status(503).json({ error: 'TIMEOUT' }); });
  next();
});

// נתיב לדיווח על פרצות (RFC 9116), נבנה מכתובת הקשר שהוגדרה
app.get('/.well-known/security.txt', (req, res) => {
  const contact = process.env.SECURITY_CONTACT || process.env.SUPPORT_EMAIL;
  if (!contact) return res.status(404).type('text').send('Not configured');
  res.type('text/plain; charset=utf-8').send(
    `Contact: mailto:${contact}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString()}\nPreferred-Languages: he, en\nCanonical: ${billingConfig.publicUrl}/.well-known/security.txt\n`
  );
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));

// ---------- דפי HTML: הזרקת כתובת האתר (canonical ו-Open Graph), robots ו-sitemap ----------
const SITE_ORIGIN = (() => { try { return new URL(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).origin; } catch { return ''; } })();
const PUBLIC_DIR = path.join(__dirname, 'public');
const pageSrc = {};
function sendPage(res, file, urlPath) {
  pageSrc[file] = pageSrc[file] || fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(pageSrc[file].split('%ORIGIN%').join(SITE_ORIGIN).split('%PATH%').join(urlPath));
}
const HTML_PAGES = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
app.get('/', (req, res) => sendPage(res, 'index.html', '/'));
for (const name of HTML_PAGES) {
  app.get([`/${name}.html`, `/${name}`], (req, res) => sendPage(res, `${name}.html`, `/${name}.html`));
}
app.get(['/login', '/login.html'], (req, res) => sendPage(res, 'account.html', '/login.html'));
app.get(['/signup', '/signup.html'], (req, res) => sendPage(res, 'account.html', '/signup.html'));

const NO_INDEX = new Set(['account']);
app.get('/robots.txt', (req, res) => {
  res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account.html\nDisallow: /login.html\nDisallow: /signup.html\n${SITE_ORIGIN ? `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n` : ''}`);
});
app.get('/sitemap.xml', (req, res) => {
  const urls = ['/'].concat(HTML_PAGES.filter((n) => n !== 'index' && !NO_INDEX.has(n)).map((n) => `/${n}.html`));
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_ORIGIN}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
});

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
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: Number(process.env.RATE_LIMIT_AUTH) || 30, standardHeaders: true, legacyHeaders: false, message: limiterMsg }); // התחברות/הרשמה/איפוס, בנפרד ממסלולי הסריקה
const heavy = rateLimit({ windowMs: 10 * 60 * 1000, limit: Number(process.env.RATE_LIMIT_HEAVY) || 20, standardHeaders: true, legacyHeaders: false, message: limiterMsg });

// ---------- וואטסאפ (Meta Cloud API) ----------
const waEnv = process.env;
const waReal = !!(waEnv.WA_ACCESS_TOKEN && waEnv.WA_PHONE_NUMBER_ID && waEnv.WA_BUSINESS_NUMBER);
if (isProd && waReal && (!(waEnv.DATA_KEY || waEnv.WA_DATA_KEY) || !waEnv.WA_APP_SECRET || !waEnv.WA_VERIFY_TOKEN || !(waEnv.DB_PATH || waEnv.WA_DB_PATH))) {
  throw new Error('DATA_KEY, WA_APP_SECRET, WA_VERIFY_TOKEN and DB_PATH are required when WhatsApp is enabled in production');
}
const dbPath = waEnv.DB_PATH || waEnv.WA_DB_PATH || ':memory:';
const dataKey = waEnv.DATA_KEY || waEnv.WA_DATA_KEY;
if (isProd && dbPath === ':memory:') {
  // חשבונות, כספות ופניות נשמרים ב-DB: בלי נתיב קבוע הם היו נמחקים בכל פריסה או הפעלה מחדש
  throw new Error('DB_PATH is required in production (use a persistent disk, e.g. /data/app.db)');
}
if (isProd && !dataKey) throw new Error('DATA_KEY is required in production');
const waStore = createStore({ path: dbPath, key: dataKey });

// ---------- מנוי ----------
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
  priceIdYearly: process.env.STRIPE_PRICE_ID_YEARLY,
  publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`,
  priceLabel: process.env.PRICE_LABEL || '19.90 ₪ לחודש',
  priceLabelYearly: process.env.PRICE_LABEL_YEARLY || (process.env.STRIPE_PRICE_ID_YEARLY || !process.env.STRIPE_SECRET_KEY ? '199 ₪ לשנה (חודשיים מתנה)' : ''),
  devUnlock: !isProd && process.env.PRO_DEV_UNLOCK === '1',
  secure: isProd,
  once: (key) => waStore.useNonce(key), // מפתחות חד-פעמיים (מזהה עסקה)
  mailer: waEnv.SMTP_URL ? require('nodemailer').createTransport(waEnv.SMTP_URL) : null,
  mailFrom: waEnv.MAIL_FROM || waEnv.SUPPORT_EMAIL,
  throttle: (key) => waStore.bump(key),
};
const billingRef = { current: createBilling(billingConfig) };
app.setBilling = (opts) => { billingRef.current = createBilling({ ...billingConfig, ...opts }); }; // לבדיקות
api.use('/billing', (req, res, next) => (req.method === 'POST' && req.path !== '/dev-activate' ? heavy : (q, r, n) => n())(req, res, () => billingRef.current.router(req, res, next)));
const requirePro = (req, res, next) => billingRef.current.requirePro(req, res, next);

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
// ---------- עוזר האתר מבוסס בינה מלאכותית (Claude) ----------
function buildAgent(over = {}) {
  return createAgent({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AGENT_MODEL || 'claude-haiku-4-5-20251001',
    dailyLimit: Number(process.env.AGENT_DAILY_LIMIT) || 2000,
    config: { priceLabel: billingConfig.priceLabel, priceLabelYearly: billingConfig.priceLabelYearly },
    ...over,
  });
}
const agentRef = { current: buildAgent() };
app.setAgent = (over) => { agentRef.current = buildAgent(over); return agentRef.current; }; // לבדיקות
api.use('/agent', (req, res, next) => agentRef.current.router(req, res, next));

// ---------- חשבונות (כספת מוצפנת בצד לקוח) ----------
function buildAccounts(over = {}) {
  return createAccounts({
    store: waStore,
    mailer: billingConfig.mailer,
    mailFrom: billingConfig.mailFrom,
    secret: tokenSecret,
    publicUrl: billingConfig.publicUrl,
    secure: isProd,
    devEndpoints: !isProd && waEnv.WA_DEV === '1',
    setProCookie: (res, cid) => billingRef.current.setProCookie(res, cid),
    isProCid: (cid) => billingRef.current.isProCid(cid),
    getProAuth: (req) => billingRef.current.getAuth(req),
    ...over,
  });
}
const accountsRef = { current: buildAccounts() };
app.setAccounts = (over) => { accountsRef.current = buildAccounts(over); return accountsRef.current; }; // לבדיקות
api.use('/account', (req, res, next) => (req.method === 'POST' ? authLimiter : (q, r, n) => n())(req, res, () => accountsRef.current.router(req, res, next)));

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

// 404 כללי: בלי להחזיר את הנתיב שהתבקש (מונע השתקפות תוכן) ובלי פרטי שרת
app.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('Not found'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: err.code, message: tooBig ? 'הקובץ גדול מדי (עד 8MB).' : 'הבקשה אינה תקינה.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'BAD_JSON', message: 'הבקשה אינה תקינה.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'TOO_LARGE', message: 'הטקסט ארוך מדי.' });
  }
  console.error('server error:', err.name);
  res.status(500).json({ error: 'FAILED', message: 'שגיאה בשרת.' });
});

if (require.main === module) {
  ensureLangDir();
  const server = app.listen(PORT, () => console.log(`Payslip app listening on http://localhost:${PORT}`));
  if (billingConfig.mailer) {
    // בדיקת חיבור ל-SMTP בעלייה: כשל מופיע בלוג מיד ולא רק כשמשתמש מבקש איפוס
    billingConfig.mailer.verify().then(
      () => console.log('SMTP: connected, password recovery emails are enabled'),
      (e) => console.error('SMTP: connection failed, emails will NOT be delivered:', e.code || e.message)
    );
  } else {
    console.warn('SMTP_URL is not set: password recovery and verification emails are disabled');
  }
  // הגנה מ-slowloris וחיבורים תקועים
  server.headersTimeout = 20_000;
  server.requestTimeout = 100_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 60;
  server.maxConnections = 1000;
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
