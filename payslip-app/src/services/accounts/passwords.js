'use strict';

const crypto = require('crypto');

/** גיבוב scrypt (עלות גבוהה) של מפתח האימות עם מלח. */
const scryptHash = (key, salt) => crypto.scryptSync(key, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

/** מייצר גיבוב לשמירה: "salt:hash" בהקסדצימלי. */
function hashAuth(authKey) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${scryptHash(authKey, salt).toString('hex')}`;
}

/** בודק מפתח אימות מול גיבוב שמור, בהשוואה בזמן קבוע. */
function checkAuth(authKey, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  const expected = Buffer.from(hashHex || '', 'hex');
  const actual = scryptHash(authKey, Buffer.from(saltHex || '', 'hex'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** גיבוב דמה לשוויון זמני תגובה כשהחשבון לא קיים (מניעת enumeration לפי זמן). */
const DUMMY_HASH = hashAuth('dummy-auth-key');

module.exports = { hashAuth, checkAuth, DUMMY_HASH };
