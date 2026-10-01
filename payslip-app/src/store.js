'use strict';

const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const MAX_SNAPSHOTS = 12;
const DAY = 24 * 3600 * 1000;

/**
 * אחסון מינימלי למנויי וואטסאפ. מה נשמר:
 *  - מספר טלפון (מוצפן AES-256-GCM) + גיבוב HMAC לחיפוש
 *  - מזהה לקוח ב-Stripe, זמן הסכמה
 *  - "תמונות מצב" חודשיות: מזהי סעיפים, סוג וסכום בלבד (מוצפן). אין שמות, אין מספרי זהות, אין טקסט מהתלוש.
 */
function createStore({ path = ':memory:', key } = {}) {
  const dataKey = key ? Buffer.from(key, 'hex') : crypto.randomBytes(32);
  if (dataKey.length !== 32) throw new Error('WA_DATA_KEY must be 32 bytes (64 hex chars)');

  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cid TEXT NOT NULL UNIQUE,
      phone_hash TEXT NOT NULL UNIQUE,
      phone_enc BLOB NOT NULL,
      consent_at INTEGER NOT NULL,
      reminders INTEGER NOT NULL DEFAULT 1,
      last_reminded_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      data_enc BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, period)
    );
    CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS seen_messages (id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inbound_counts (phone_hash TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (phone_hash, day));
  `);
  db.exec('PRAGMA foreign_keys = ON');

  const hash = (phone) => crypto.createHmac('sha256', dataKey).update(String(phone)).digest('hex');

  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]);
  }
  function decrypt(buf) {
    const b = Buffer.from(buf);
    const d = crypto.createDecipheriv('aes-256-gcm', dataKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  }

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
    nonce: db.prepare('INSERT OR IGNORE INTO nonces (nonce, used_at) VALUES (?, ?)'),
    seen: db.prepare('INSERT OR IGNORE INTO seen_messages (id, seen_at) VALUES (?, ?)'),
    purgeSeen: db.prepare('DELETE FROM seen_messages WHERE seen_at < ?'),
    purgeNonces: db.prepare('DELETE FROM nonces WHERE used_at < ?'),
    count: db.prepare("INSERT INTO inbound_counts (phone_hash, day, n) VALUES (?,?,1) ON CONFLICT(phone_hash, day) DO UPDATE SET n = n + 1 RETURNING n"),
    purgeCounts: db.prepare('DELETE FROM inbound_counts WHERE day < ?'),
  };

  const publicUser = (row) => (row ? { id: Number(row.id), cid: row.cid, phone: decrypt(row.phone_enc), consentAt: Number(row.consent_at), reminders: !!row.reminders, lastRemindedAt: Number(row.last_reminded_at) } : null);

  return {
    hash,
    /** מקשר טלפון ללקוח. מחליף קישור קודם של אותו לקוח או אותו טלפון. */
    link({ cid, phone, now = Date.now() }) {
      const old = q.byCid.get(cid);
      if (old) q.delUser.run(old.id);
      const other = q.byPhone.get(hash(phone));
      if (other) q.delUser.run(other.id);
      q.insertUser.run(cid, hash(phone), encrypt(String(phone)), now, now);
      return publicUser(q.byCid.get(cid));
    },
    getByCid: (cid) => publicUser(q.byCid.get(cid)),
    getByPhone: (phone) => publicUser(q.byPhone.get(hash(phone))),
    /** מחיקה מלאה של המשתמש וכל תמונות המצב שלו */
    deleteUser(userId) {
      q.delUser.run(userId);
    },
    setReminders(userId, on) {
      q.setReminders.run(on ? 1 : 0, userId);
    },
    saveSnapshot(userId, period, data, now = Date.now()) {
      q.upSnap.run(userId, period, encrypt(JSON.stringify(data)), now);
      q.trim.run(userId, userId);
    },
    /** מהישן לחדש, עד n אחרונים */
    recentSnapshots(userId, n = 3) {
      return q
        .snaps.all(userId, n)
        .map((r) => ({ period: r.period, createdAt: Number(r.created_at), ...JSON.parse(decrypt(r.data_enc)) }))
        .reverse();
    },
    lastSnapshotAt: (userId) => Number(q.lastSnap.get(userId).t || 0),
    /** משתמשים שאפשר לשלוח להם תזכורת (לא קיבלו תזכורת מאז `before`) */
    remindable: (before) => q.due.all(before).map(publicUser),
    markReminded: (userId, now = Date.now()) => q.setReminded.run(now, userId),
    /** אסימון קישור חד-פעמי. מחזיר true אם זו הפעם הראשונה. */
    useNonce(nonce, now = Date.now()) {
      return Number(q.nonce.run(nonce, now).changes) === 1;
    },
    /** מניעת עיבוד כפול של אותה הודעה (Meta שולחת מחדש כשאין תשובה מהירה) */
    firstSight(messageId, now = Date.now()) {
      return Number(q.seen.run(messageId, now).changes) === 1;
    },
    /** מגבלת הודעות יומית לכל טלפון */
    bump(phone, now = Date.now()) {
      return Number(q.count.get(hash(phone), new Date(now).toISOString().slice(0, 10)).n);
    },
    cleanup(now = Date.now()) {
      q.purgeSeen.run(now - 3 * DAY);
      q.purgeNonces.run(now - 2 * DAY);
      q.purgeCounts.run(new Date(now - 3 * DAY).toISOString().slice(0, 10));
    },
    close: () => db.close(),
  };
}

module.exports = { createStore, MAX_SNAPSHOTS };
