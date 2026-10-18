'use strict';

const crypto = require('crypto');
const { B64URL } = require('./validators');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const MAX_TOKEN_CHARS = 64;
const MIN_EXTEND_STEP_MS = 60_000; // לא מעדכנים את המסד על כל בקשה

/** שירות סשנים: פתיחה, זיהוי חשבון לפי אסימון, הארכה בפעילות (סשן הזזה), וסגירה. */
function createSessionService({ sessions, accounts, now, ttlMs, idleMs }) {
  return {
    /** פותח סשן חדש לחשבון ומחזיר את האסימון (נשמר רק גיבוב שלו). */
    open(accountId) {
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.create(sha256(token), accountId, now(), now() + idleMs);
      return token;
    },
    /** מחזיר את החשבון של האסימון (ומאריך את הסשן עד התקרה), או null אם לא תקף. */
    accountFor(token) {
      if (!token || !B64URL.test(token) || token.length > MAX_TOKEN_CHARS) return null;
      const s = sessions.findActive(sha256(token), now());
      if (!s) return null;
      const next = Math.min(Number(s.created_at) + ttlMs, now() + idleMs);
      if (next - Number(s.expires_at) > MIN_EXTEND_STEP_MS) sessions.extend(sha256(token), next);
      return accounts.findById(s.account_id);
    },
    /** סוגר סשן בודד. */
    close(token) {
      if (token) sessions.revoke(sha256(token));
    },
    /** סוגר את כל הסשנים של החשבון (אחרי החלפת סיסמה או איפוס). */
    closeAll(accountId) {
      sessions.revokeAllFor(accountId);
    },
  };
}

module.exports = { createSessionService };
