'use strict';

/**
 * מפנה מ-http ל-https, רק כשהפרוקסי מצהיר במפורש על http (בלי כותרת: אין הפניה, כדי לא ליצור לולאה).
 * בדיקות בריאות פנימיות (/healthz) לא מופנות.
 */
function httpsRedirect(req, res, next) {
  if (req.headers['x-forwarded-proto'] === 'http' && req.path !== '/healthz') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
}

module.exports = { httpsRedirect };
