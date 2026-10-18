'use strict';

const DAY_MS = 24 * 3600 * 1000;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/** מאגר מנגנוני הגנה זמניים: אסימונים חד-פעמיים, הודעות שנראו, וספירת בקשות יומית. */
function createThrottleRepo(db, { hash }) {
  const q = {
    nonce: db.prepare('INSERT OR IGNORE INTO nonces (nonce, used_at) VALUES (?, ?)'),
    seen: db.prepare('INSERT OR IGNORE INTO seen_messages (id, seen_at) VALUES (?, ?)'),
    count: db.prepare('INSERT INTO inbound_counts (phone_hash, day, n) VALUES (?,?,1) ON CONFLICT(phone_hash, day) DO UPDATE SET n = n + 1 RETURNING n'),
    purgeSeen: db.prepare('DELETE FROM seen_messages WHERE seen_at < ?'),
    purgeNonces: db.prepare('DELETE FROM nonces WHERE used_at < ?'),
    purgeCounts: db.prepare('DELETE FROM inbound_counts WHERE day < ?'),
  };
  return {
    /** צורך אסימון חד-פעמי; true רק בפעם הראשונה. */
    useNonce: (nonce, now = Date.now()) => Number(q.nonce.run(nonce, now).changes) === 1,
    /** true בפעם הראשונה שרואים מזהה הודעה (מניעת עיבוד כפול כש-Meta שולחת שוב). */
    firstSight: (messageId, now = Date.now()) => Number(q.seen.run(messageId, now).changes) === 1,
    /** מגדיל ומחזיר מונה יומי לפי מפתח (טלפון, אימייל וכו'). */
    bump: (key, now = Date.now()) => Number(q.count.get(hash(key), dayKey(now)).n),
    /** מנקה רשומות זמניות ישנות. */
    purge(now) {
      q.purgeSeen.run(now - 3 * DAY_MS);
      q.purgeNonces.run(now - 2 * DAY_MS);
      q.purgeCounts.run(dayKey(now - 3 * DAY_MS));
    },
  };
}

module.exports = { createThrottleRepo };
