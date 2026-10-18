'use strict';

const crypto = require('crypto');
const { sign, verify } = require('../billing/tokens');

/** יוצר מנפיק וקורא של אסימוני מייל חתומים (אימות כתובת, איפוס סיסמה) עם תוקף וחד-פעמיות. */
function createMailTokens({ secret, now }) {
  return {
    /** מנפיק אסימון מסוג type לחשבון accId שתקף ttlMin דקות. */
    issue(type, accId, ttlMin) {
      return sign({ t: type, aid: accId, nonce: crypto.randomBytes(12).toString('base64url'), exp: Math.floor(now() / 1000) + ttlMin * 60 }, secret);
    },
    /** קורא אסימון ומחזיר את התוכן רק אם החתימה, הסוג והחשבון תקינים. */
    read(token, type) {
      const p = verify(token, secret);
      return p && p.t === type && p.aid ? p : null;
    },
  };
}

module.exports = { createMailTokens };
