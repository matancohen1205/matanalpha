'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/**
 * גיבוי עקבי של מסד SQLite (VACUUM INTO) לתיקיית backups ליד המסד, עם שמירת N העותקים האחרונים.
 * הקבצים מכילים נתונים מוצפנים; מפתח DATA_KEY נדרש לשחזור ויש לשמור אותו בנפרד.
 * חשוב: גיבוי על אותו דיסק לא מגן מאובדן הדיסק עצמו. הפעילו גם Snapshots של הדיסק ב-Render.
 */
function runBackup(dbPath, keep = 7, now = new Date()) {
  const dir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dest = path.join(dir, `backup-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  const db = new DatabaseSync(dbPath);
  try { db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); } finally { db.close(); }
  fs.chmodSync(dest, 0o600);
  const files = fs.readdirSync(dir).filter((f) => /^backup-.*\.db$/.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(path.join(dir, old));
  return dest;
}

module.exports = { runBackup };
