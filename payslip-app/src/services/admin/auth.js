'use strict';

const crypto = require('crypto');
const { sign, verify } = require('../billing/tokens');

const SESSION_HOURS = 8;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** שירות אימות אדמין: בדיקת סיסמה בזמן קבוע, הנפקה ואימות של אסימון סשן חתום. */
function createAdminAuth({ password, secret, now = () => Date.now() }) {
  const enabled = typeof password === 'string' && password.length >= 12;
  const key = enabled ? `${secret}|admin|${password}` : '';
  return {
    enabled,
    sessionMs: SESSION_HOURS * 3600 * 1000,
    /** השוואת סיסמה על גיבובים באורך קבוע. */
    checkPassword: (given) => crypto.timingSafeEqual(sha(given), sha(password)),
    /** מנפיק אסימון סשן ל-8 שעות. */
    issueToken: () => sign({ t: 'admin', nonce: crypto.randomBytes(8).toString('base64url'), exp: Math.floor(now() / 1000) + SESSION_HOURS * 3600 }, key),
    /** האם האסימון תקף ושייך לאדמין. */
    isValid: (token) => { const p = verify(token || '', key); return !!(p && p.t === 'admin'); },
  };
}

module.exports = { createAdminAuth };
