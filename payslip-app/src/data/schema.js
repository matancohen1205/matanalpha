'use strict';

const { DatabaseSync } = require('node:sqlite');

/** הגדרת הטבלאות (יצירה אידמפוטנטית). אין כאן שדות כרטיס אשראי, שמות או טקסט תלוש. */
const SCHEMA_SQL = `
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
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    data_enc BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT NOT NULL UNIQUE,
    email_enc BLOB NOT NULL,
    auth_hash TEXT NOT NULL,
    wrapped_pw TEXT NOT NULL,
    wrapped_rec TEXT NOT NULL,
    cid_enc BLOB,
    verified INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vaults (
    account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    blob TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS seen_messages (id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS inbound_counts (phone_hash TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (phone_hash, day));
`;

/** פותח מסד SQLite (קובץ או זיכרון), יוצר את הסכמה ומפעיל אכיפת מפתחות זרים. */
function openDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA_SQL);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

module.exports = { openDatabase, SCHEMA_SQL };
