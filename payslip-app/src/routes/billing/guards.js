'use strict';

/** הגנת CSRF בסיסית ל-POST: רק JSON, ורק מאותו origin של האתר (למעט פיתוח). */
function jsonAndOriginGuard({ publicUrl, devUnlock }) {
  const siteOrigin = publicUrl ? new URL(publicUrl).origin : null;
  return (req, res, next) => {
    if (req.method === 'POST') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
      const origin = req.headers.origin;
      if (origin && siteOrigin && origin !== siteOrigin && !devUnlock) return res.status(403).json({ error: 'BAD_ORIGIN' });
    }
    next();
  };
}

/** middleware שמגן על נתיבי Pro: ללא עוגיית מנוי תקפה מחזיר 402. */
function requirePro(cookie) {
  return (req, res, next) => (cookie.getAuth(req) ? next() : res.status(402).json({ error: 'PRO_REQUIRED', message: 'הפיצ\'ר זמין למנויי Pro.' }));
}

module.exports = { jsonAndOriginGuard, requirePro };
