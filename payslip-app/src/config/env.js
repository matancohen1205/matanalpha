'use strict';

const crypto = require('crypto');

/** מחזיר true כשהתהליך רץ בסביבת אירוח אמיתית (ולא על מחשב פיתוח). */
function isHostedEnvironment(env) {
  return env.NODE_ENV === 'production' || !!(env.RENDER || env.FLY_APP_NAME || env.RAILWAY_ENVIRONMENT || env.KUBERNETES_SERVICE_HOST);
}

/** מחשב את כתובת האתר הציבורית (לקישורי מייל, canonical ו-sitemap). */
function resolvePublicUrl(env, port) {
  return env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
}

/** מחזיר את ה-origin של כתובת האתר, או מחרוזת ריקה אם הכתובת אינה תקינה. */
function originOf(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

/** מחזיר את סוד החתימה של האסימונים; בפיתוח בלי סוד נוצר סוד אקראי להרצה. */
function resolveTokenSecret(env, isProd) {
  if (env.PRO_TOKEN_SECRET) return env.PRO_TOKEN_SECRET;
  if (isProd && env.STRIPE_SECRET_KEY) throw new Error('PRO_TOKEN_SECRET is required in production when Stripe is enabled');
  return crypto.randomBytes(32).toString('hex');
}

/** קורא את משתני הסביבה פעם אחת לאובייקט הגדרות אחיד (ללא בדיקות בטיחות; ראו guards.js). */
function readConfig(env = process.env) {
  const port = Number(env.PORT) || 3000;
  const isProd = env.NODE_ENV === 'production';
  const publicUrl = resolvePublicUrl(env, port);
  return {
    env,
    port,
    isProd,
    hosted: isHostedEnvironment(env),
    trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || 1 : 0,
    publicUrl,
    siteOrigin: originOf(publicUrl),
    dbPath: env.DB_PATH || env.WA_DB_PATH || ':memory:',
    dataKey: env.DATA_KEY || env.WA_DATA_KEY,
    stripeKey: env.STRIPE_SECRET_KEY,
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM || env.SUPPORT_EMAIL,
    devUnlock: !isProd && env.PRO_DEV_UNLOCK === '1',
    devEndpoints: !isProd && env.WA_DEV === '1',
    pricing: {
      priceId: env.STRIPE_PRICE_ID,
      priceIdYearly: env.STRIPE_PRICE_ID_YEARLY,
      label: env.PRICE_LABEL || '19.90 ₪ לחודש',
      labelYearly: env.PRICE_LABEL_YEARLY || (env.STRIPE_PRICE_ID_YEARLY || !env.STRIPE_SECRET_KEY ? '199 ₪ לשנה (חודשיים מתנה)' : ''),
    },
    wa: {
      real: !!(env.WA_ACCESS_TOKEN && env.WA_PHONE_NUMBER_ID && env.WA_BUSINESS_NUMBER),
      phoneNumberId: env.WA_PHONE_NUMBER_ID,
      accessToken: env.WA_ACCESS_TOKEN,
      businessNumber: env.WA_BUSINESS_NUMBER,
      verifyToken: env.WA_VERIFY_TOKEN,
      appSecret: env.WA_APP_SECRET,
      reminderTemplate: env.WA_REMINDER_TEMPLATE,
    },
    support: {
      supportEmail: env.SUPPORT_EMAIL,
      supportWhatsapp: env.SUPPORT_WHATSAPP,
      supportHours: env.SUPPORT_HOURS,
      mailFrom: env.MAIL_FROM,
      notifyTo: env.SUPPORT_NOTIFY_TO,
    },
    agent: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AGENT_MODEL || 'claude-haiku-4-5-20251001',
      dailyLimit: Number(env.AGENT_DAILY_LIMIT) || 2000,
    },
    accountIdleMs: (Number(env.ACCOUNT_IDLE_MINUTES) || 120) * 60 * 1000,
    adminPassword: env.ADMIN_PASSWORD,
    securityContact: env.SECURITY_CONTACT || env.SUPPORT_EMAIL,
    backup: { enabled: env.AUTO_BACKUP !== '0', keep: Number(env.BACKUP_KEEP) || 7 },
  };
}

module.exports = { readConfig, resolveTokenSecret, isHostedEnvironment };
