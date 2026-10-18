'use strict';

const { hashAuth, checkAuth, DUMMY_HASH } = require('./passwords');
const { normalizeEmail, isValidEmail, validAuthKey, validSealed } = require('./validators');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const fail = (status, error, message) => ({ ok: false, status, error, message });

/** הרשמה, התחברות, החלפת סיסמה ומחיקת חשבון (לוגיקה בלבד, בלי HTTP). */
function createCredentialsService({ accounts, sessions, cipher, tokens, mail, mails, publicUrl, now }) {
  const emailHash = (e) => cipher.hash('acct:' + e);

  /** שולח מייל אימות כתובת לחשבון. */
  const sendVerification = (email, accId, opts) => mail.send(email, mails.verificationMail(`${publicUrl}/login.html?verify=${tokens.issue('verify', accId, 24 * 60)}`, opts));

  return {
    emailHash,
    sendVerification,
    /** יוצר חשבון חדש (מפתח אימות מגובב, מפתחות עטופים) ופותח לו סשן; שולח מייל אימות. */
    async register(b) {
      const email = normalizeEmail(b.email);
      if (!isValidEmail(email)) return fail(400, 'BAD_EMAIL', 'נא להזין כתובת אימייל תקינה.');
      if (!validAuthKey(b.authKey) || !validSealed(b.wrappedPw) || !validSealed(b.wrappedRec)) return fail(400, 'BAD_MATERIAL', 'הבקשה אינה תקינה.');
      if (accounts.findByEmailHash(emailHash(email))) return fail(409, 'EMAIL_EXISTS', 'כבר קיים חשבון בכתובת הזו. אפשר להתחבר או לאפס סיסמה.');
      const id = accounts.create({ emailHash: emailHash(email), emailEnc: cipher.encrypt(email), authHash: hashAuth(b.authKey), wrappedPw: b.wrappedPw, wrappedRec: b.wrappedRec, now: now() });
      const token = sessions.open(id);
      const mailSent = await sendVerification(email, id, { welcome: true });
      return { ok: true, token, mailSent };
    },

    /**
     * מאמת אימייל וסיסמה (נעילה אחרי 5 כשלונות, ושוויון זמנים מול חשבון לא קיים) ופותח סשן.
     * מחזיר גם את מזהה מנוי ה-Pro המקושר (אם יש) כדי שהנתיב יפעיל Pro.
     */
    login(b) {
      const email = normalizeEmail(b.email);
      const bad = () => fail(401, 'BAD_CREDENTIALS', 'אימייל או סיסמה שגויים.');
      if (!isValidEmail(email) || !validAuthKey(b.authKey)) { checkAuth('x'.repeat(43), DUMMY_HASH); return bad(); }
      const acc = accounts.findByEmailHash(emailHash(email));
      if (!acc) { checkAuth(b.authKey, DUMMY_HASH); return bad(); }
      if (Number(acc.locked_until) > now()) return fail(429, 'LOCKED', 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.');
      if (!checkAuth(b.authKey, acc.auth_hash)) {
        const n = Number(acc.fail_count) + 1;
        accounts.setFailures(acc.id, n >= MAX_FAILS ? 0 : n, n >= MAX_FAILS ? now() + LOCK_MS : 0);
        return bad();
      }
      accounts.markLogin(acc.id, now());
      return { ok: true, token: sessions.open(acc.id), verified: !!acc.verified, wrappedPw: JSON.parse(acc.wrapped_pw), subscriptionCid: acc.cid_enc ? cipher.decrypt(acc.cid_enc) : null };
    },

    /** מחליף סיסמה (מחייב את הסיסמה הנוכחית), מנתק מכשירים אחרים ופותח סשן חדש. */
    changePassword(acc, b) {
      if (!validAuthKey(b.oldAuthKey) || !validAuthKey(b.authKey) || !validSealed(b.wrappedPw)) return fail(400, 'BAD_MATERIAL');
      if (!checkAuth(b.oldAuthKey, acc.auth_hash)) return fail(401, 'BAD_CREDENTIALS', 'הסיסמה הנוכחית שגויה.');
      accounts.setPassword(acc.id, hashAuth(b.authKey), b.wrappedPw);
      sessions.closeAll(acc.id);
      return { ok: true, token: sessions.open(acc.id) };
    },

    /** מוחק חשבון (כולל סשנים וכספת) אחרי אימות סיסמה. */
    deleteAccount(acc, b) {
      if (!validAuthKey(b.authKey) || !checkAuth(b.authKey, acc.auth_hash)) return fail(401, 'BAD_CREDENTIALS', 'הסיסמה שגויה.');
      accounts.remove(acc.id);
      return { ok: true };
    },
  };
}

module.exports = { createCredentialsService };
