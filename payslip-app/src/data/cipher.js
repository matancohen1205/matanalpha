'use strict';

const crypto = require('crypto');

/** יוצר כלי הצפנה (AES-256-GCM) וגיבוב HMAC קבוע-מפתח, על בסיס מפתח הנתונים. */
function createCipher(dataKey) {
  /** מצפין טקסט; מחזיר Buffer של iv + תג אימות + מוצפן. */
  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]);
  }

  /** מפענח Buffer שנוצר על ידי encrypt ומאמת את תג האימות. */
  function decrypt(buf) {
    const b = Buffer.from(buf);
    const d = crypto.createDecipheriv('aes-256-gcm', dataKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  }

  /** גיבוב דטרמיניסטי (HMAC-SHA256) לחיפוש לפי ערך מוצפן (טלפון, אימייל) בלי לחשוף אותו. */
  const hash = (value) => crypto.createHmac('sha256', dataKey).update(String(value)).digest('hex');

  return { encrypt, decrypt, hash };
}

module.exports = { createCipher };
