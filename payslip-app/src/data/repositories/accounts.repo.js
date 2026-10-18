'use strict';

/** מאגר חשבונות משתמשים (אימייל מוצפן, גיבוב מפתח אימות, מפתחות כספת עטופים). */
function createAccountsRepo(db) {
  const q = {
    byEmail: db.prepare('SELECT * FROM accounts WHERE email_hash = ?'),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    insert: db.prepare('INSERT INTO accounts (email_hash, email_enc, auth_hash, wrapped_pw, wrapped_rec, created_at) VALUES (?,?,?,?,?,?)'),
    fail: db.prepare('UPDATE accounts SET fail_count = ?, locked_until = ? WHERE id = ?'),
    ok: db.prepare('UPDATE accounts SET fail_count = 0, locked_until = 0, last_login = ? WHERE id = ?'),
    verified: db.prepare('UPDATE accounts SET verified = 1 WHERE id = ?'),
    setAuth: db.prepare('UPDATE accounts SET auth_hash = ?, wrapped_pw = ?, fail_count = 0, locked_until = 0 WHERE id = ?'),
    setRec: db.prepare('UPDATE accounts SET wrapped_rec = ? WHERE id = ?'),
    setCid: db.prepare('UPDATE accounts SET cid_enc = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM accounts WHERE id = ?'),
  };
  return {
    findByEmailHash: (h) => q.byEmail.get(h),
    findById: (id) => q.byId.get(id),
    /** יוצר חשבון ומחזיר את המזהה שלו. */
    create: ({ emailHash, emailEnc, authHash, wrappedPw, wrappedRec, now }) =>
      Number(q.insert.run(emailHash, emailEnc, authHash, JSON.stringify(wrappedPw), JSON.stringify(wrappedRec), now).lastInsertRowid),
    /** קובע מונה כשלונות ונעילה. */
    setFailures: (id, count, lockedUntil) => q.fail.run(count, lockedUntil, id),
    /** מאפס כשלונות ורושם כניסה מוצלחת. */
    markLogin: (id, now) => q.ok.run(now, id),
    markVerified: (id) => q.verified.run(id),
    /** מחליף גיבוב סיסמה ומפתח עטוף (ומאפס נעילה). */
    setPassword: (id, authHash, wrappedPw) => q.setAuth.run(authHash, JSON.stringify(wrappedPw), id),
    setRecovery: (id, wrappedRec) => q.setRec.run(JSON.stringify(wrappedRec), id),
    /** מקשר/מנתק מזהה לקוח של מנוי (מוצפן; null לניתוק). */
    setSubscriptionCid: (id, cidEnc) => q.setCid.run(cidEnc, id),
    /** מוחק חשבון (סשנים וכספת נמחקים בקסקדה). */
    remove: (id) => q.del.run(id),
  };
}

module.exports = { createAccountsRepo };
