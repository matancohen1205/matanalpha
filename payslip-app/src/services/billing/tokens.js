'use strict';

const crypto = require('crypto');

const b64 = (b) => Buffer.from(b).toString('base64url');

/** חותם מטען JSON ב-HMAC-SHA256; מחזיר "גוף.חתימה" ב-base64url. */
function sign(payload, secret) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** מאמת חתימה ותוקף (exp בשניות); מחזיר את המטען או null אם האסימון לא תקף. */
function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let given;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
