'use strict';

const MAX_SNAPSHOTS = 12; // תמונות מצב חודשיות לכל משתמש וואטסאפ

/** מאגר משתמשי וואטסאפ (טלפון מוצפן) ותמונות המצב החודשיות שלהם. */
function createUsersRepo(db, { encrypt, decrypt, hash }) {
  const q = {
    byCid: db.prepare('SELECT * FROM users WHERE cid = ?'),
    byPhone: db.prepare('SELECT * FROM users WHERE phone_hash = ?'),
    insertUser: db.prepare('INSERT INTO users (cid, phone_hash, phone_enc, consent_at, created_at) VALUES (?,?,?,?,?)'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
    upSnap: db.prepare('INSERT INTO snapshots (user_id, period, data_enc, created_at) VALUES (?,?,?,?) ON CONFLICT(user_id, period) DO UPDATE SET data_enc = excluded.data_enc, created_at = excluded.created_at'),
    snaps: db.prepare('SELECT period, data_enc, created_at FROM snapshots WHERE user_id = ? ORDER BY period DESC LIMIT ?'),
    trim: db.prepare(`DELETE FROM snapshots WHERE user_id = ? AND period NOT IN (SELECT period FROM snapshots WHERE user_id = ? ORDER BY period DESC LIMIT ${MAX_SNAPSHOTS})`),
    lastSnap: db.prepare('SELECT MAX(created_at) AS t FROM snapshots WHERE user_id = ?'),
    due: db.prepare('SELECT * FROM users WHERE reminders = 1 AND last_reminded_at < ?'),
    setReminded: db.prepare('UPDATE users SET last_reminded_at = ? WHERE id = ?'),
    setReminders: db.prepare('UPDATE users SET reminders = ? WHERE id = ?'),
  };

  /** ממיר שורת מסד למשתמש "ציבורי" עם טלפון מפוענח. */
  const toUser = (row) => (row ? { id: Number(row.id), cid: row.cid, phone: decrypt(row.phone_enc), consentAt: Number(row.consent_at), reminders: !!row.reminders, lastRemindedAt: Number(row.last_reminded_at) } : null);

  return {
    /** מקשר טלפון ללקוח; מחליף קישור קודם של אותו לקוח או אותו טלפון. */
    link({ cid, phone, now = Date.now() }) {
      const old = q.byCid.get(cid);
      if (old) q.delUser.run(old.id);
      const other = q.byPhone.get(hash(phone));
      if (other) q.delUser.run(other.id);
      q.insertUser.run(cid, hash(phone), encrypt(String(phone)), now, now);
      return toUser(q.byCid.get(cid));
    },
    getByCid: (cid) => toUser(q.byCid.get(cid)),
    getByPhone: (phone) => toUser(q.byPhone.get(hash(phone))),
    /** מחיקה מלאה של המשתמש וכל תמונות המצב שלו. */
    deleteUser: (userId) => { q.delUser.run(userId); },
    setReminders: (userId, on) => { q.setReminders.run(on ? 1 : 0, userId); },
    /** שומר תמונת מצב (מוצפנת) ומקצץ למספר המקסימלי. */
    saveSnapshot(userId, period, data, now = Date.now()) {
      q.upSnap.run(userId, period, encrypt(JSON.stringify(data)), now);
      q.trim.run(userId, userId);
    },
    /** עד n תמונות מצב אחרונות, מהישנה לחדשה. */
    recentSnapshots(userId, n = 3) {
      return q.snaps.all(userId, n)
        .map((r) => ({ period: r.period, createdAt: Number(r.created_at), ...JSON.parse(decrypt(r.data_enc)) }))
        .reverse();
    },
    lastSnapshotAt: (userId) => Number(q.lastSnap.get(userId).t || 0),
    /** משתמשים שאפשר לשלוח להם תזכורת (לא קיבלו תזכורת מאז `before`). */
    remindable: (before) => q.due.all(before).map(toUser),
    markReminded: (userId, now = Date.now()) => q.setReminded.run(now, userId),
  };
}

module.exports = { createUsersRepo, MAX_SNAPSHOTS };
