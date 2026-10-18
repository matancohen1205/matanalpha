'use strict';

const { validSealedBlob } = require('./validators');

const MAX_VAULT_CHARS = 262_144; // 256KB של טקסט מוצפן

/** כספת מוצפנת (אטומה לשרת) עם נעילה אופטימית לפי גרסה. */
function createVaultService({ vaults, now }) {
  return {
    /** מחזיר את הכספת של החשבון, או גרסה 0 ו-blob ריק אם עוד לא נוצרה. */
    read(accId) {
      const v = vaults.find(accId);
      return v ? { version: Number(v.version), blob: JSON.parse(v.blob) } : { version: 0, blob: null };
    },
    /** כותב כספת אם הגרסה שהלקוח מצפה לה תואמת; אחרת מחזיר התנגשות (409). */
    write(accId, b) {
      const blobStr = JSON.stringify(b.blob || null);
      if (!validSealedBlob(b.blob) || blobStr.length > MAX_VAULT_CHARS) return { ok: false, status: 400, error: 'BAD_BLOB', message: 'הנתונים אינם תקינים או גדולים מדי.' };
      const expected = Number(b.version);
      if (!Number.isInteger(expected) || expected < 0) return { ok: false, status: 400, error: 'BAD_VERSION' };
      const cur = vaults.find(accId);
      if (!cur) {
        if (expected !== 0) return { ok: false, status: 409, error: 'CONFLICT', version: 0 };
        vaults.insertFirst(accId, blobStr, now());
        return { ok: true, version: 1 };
      }
      if (!vaults.updateIfVersion(accId, expected, blobStr, now())) {
        return { ok: false, status: 409, error: 'CONFLICT', message: 'הנתונים עודכנו ממכשיר אחר. רעננו ונסו שוב.', version: Number(cur.version) };
      }
      return { ok: true, version: expected + 1 };
    },
  };
}

module.exports = { createVaultService };
