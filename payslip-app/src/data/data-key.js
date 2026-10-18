'use strict';

const crypto = require('crypto');

/**
 * מפיק מפתח הצפנה בן 32 בתים: 64 תווי hex משמשים כמו שהם, מחרוזת סודית של 32+ תווים נגזרת ב-SHA-256,
 * ובלי מפתח נוצר מפתח אקראי (למסד זמני בפיתוח/בדיקות).
 */
function deriveDataKey(key) {
  if (!key) return crypto.randomBytes(32);
  if (/^[0-9a-f]{64}$/i.test(key)) return Buffer.from(key, 'hex');
  if (String(key).length >= 32) return crypto.createHash('sha256').update(String(key)).digest();
  throw new Error('DATA_KEY must be 64 hex chars or a secret string of at least 32 characters');
}

module.exports = { deriveDataKey };
