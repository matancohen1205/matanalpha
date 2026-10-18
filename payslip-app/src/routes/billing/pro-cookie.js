'use strict';

const { readCookie } = require('../../http/cookies');

const COOKIE_PLAIN = 'ps_pro';
const COOKIE_HOST = '__Host-ps_pro'; // בפרודקשן: קידומת __Host- מחייבת Secure, Path=/ וללא Domain

/** עוגיית Pro: קריאת המשתמש המנוי מהבקשה, הצבה וניקוי של העוגייה בתשובה. */
function createProCookie({ proToken, secure }) {
  const name = secure ? COOKIE_HOST : COOKIE_PLAIN;
  return {
    /** מחזיר את מטען אסימון ה-Pro מהבקשה, או null. */
    getAuth: (req) => proToken.read(readCookie(req, name)),
    /** קובע עוגיית Pro חתומה עם המטען (HttpOnly, SameSite=Strict). */
    set(res, payload) {
      res.cookie(name, proToken.issue(payload), { httpOnly: true, sameSite: 'strict', secure, maxAge: proToken.ttlSeconds * 1000, path: '/' });
    },
    clear: (res) => res.clearCookie(name, { path: '/' }),
  };
}

module.exports = { createProCookie };
