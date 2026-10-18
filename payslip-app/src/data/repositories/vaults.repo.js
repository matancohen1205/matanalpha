'use strict';

/** מאגר כספות מוצפנות בצד הלקוח (blob אטום לשרת, עם גרסה לזיהוי התנגשויות). */
function createVaultsRepo(db) {
  const q = {
    get: db.prepare('SELECT version, blob, updated_at FROM vaults WHERE account_id = ?'),
    insert: db.prepare('INSERT INTO vaults (account_id, version, blob, updated_at) VALUES (?,?,?,?)'),
    update: db.prepare('UPDATE vaults SET version = version + 1, blob = ?, updated_at = ? WHERE account_id = ? AND version = ?'),
    del: db.prepare('DELETE FROM vaults WHERE account_id = ?'),
  };
  return {
    find: (accountId) => q.get.get(accountId),
    /** יוצר כספת ראשונה (גרסה 1). */
    insertFirst: (accountId, blobStr, now) => q.insert.run(accountId, 1, blobStr, now),
    /** מעדכן רק אם הגרסה תואמת (נעילה אופטימית); מחזיר true בהצלחה. */
    updateIfVersion: (accountId, expectedVersion, blobStr, now) => Number(q.update.run(blobStr, now, accountId, expectedVersion).changes) === 1,
    remove: (accountId) => q.del.run(accountId),
  };
}

module.exports = { createVaultsRepo };
