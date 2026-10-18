'use strict';

/** מאגר סשנים של חשבונות (נשמר רק גיבוב האסימון). */
function createSessionsRepo(db) {
  const q = {
    insert: db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)'),
    get: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?'),
    touch: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    del: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    delAll: db.prepare('DELETE FROM sessions WHERE account_id = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  };
  return {
    create: (tokenHash, accountId, now, expiresAt) => q.insert.run(tokenHash, accountId, now, expiresAt),
    /** סשן תקף (לא פג) לפי גיבוב אסימון, או undefined. */
    findActive: (tokenHash, now) => q.get.get(tokenHash, now),
    extend: (tokenHash, expiresAt) => q.touch.run(expiresAt, tokenHash),
    revoke: (tokenHash) => q.del.run(tokenHash),
    revokeAllFor: (accountId) => q.delAll.run(accountId),
    purgeExpired: (now) => q.purge.run(now),
  };
}

module.exports = { createSessionsRepo };
