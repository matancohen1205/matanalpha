'use strict';

const helmet = require('helmet');

/** בונה את מדיניות CSP הקפדנית: רק משאבים מהאתר עצמו, בלי סקריפטים/סגנונות מוטמעים. */
function buildCspDirectives(isProd) {
  return {
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
    ...(isProd ? { upgradeInsecureRequests: [] } : {}),
  };
}

/** middleware של כותרות אבטחה (CSP, HSTS, Referrer-Policy). */
function securityHeaders(isProd) {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives: buildCspDirectives(isProd) },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  });
}

/** middleware שמגביל הרשאות דפדפן (מצלמה, מיקרופון, מיקום, תשלום). */
function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
}

module.exports = { securityHeaders, permissionsPolicy };
