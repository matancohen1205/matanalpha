'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/whatsapp/webhook']); // ה-webhook של Meta אינו דפדפן וחתום בנפרד

/** מחזיר true אם ה-Origin של הבקשה אינו תואם למארח (בקשה חוצת-אתר). */
function isForeignOrigin(origin, host) {
  let originHost;
  try { originHost = new URL(origin).host; } catch { return true; }
  return !originHost || originHost !== host;
}

/** הגנת CSRF: דוחה בקשות משנות-מצב חוצות-אתר לפי Sec-Fetch-Site ו-Origin. */
function originGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return res.status(403).json({ error: 'CROSS_SITE', message: 'הבקשה נדחתה.' });
  const origin = req.headers.origin;
  if (origin && isForeignOrigin(origin, req.headers.host)) return res.status(403).json({ error: 'BAD_ORIGIN', message: 'הבקשה נדחתה.' });
  next();
}

module.exports = { originGuard };
