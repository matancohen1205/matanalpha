'use strict';

const { hashAuth } = require('./passwords');
const { normalizeEmail, isValidEmail, validAuthKey, validSealed } = require('./validators');

const fail = (status, error, message) => ({ ok: false, status, error, message });
const BAD_LINK = 'הקישור אינו תקף או שפג תוקפו.';

/** אימות כתובת אימייל ואיפוס סיסמה בקישור מייל חד-פעמי (לוגיקה בלבד). */
function createAccountRecoveryService({ accounts, sessions, vaults, cipher, tokens, mail, mails, publicUrl, store }) {
  const emailHash = (e) => cipher.hash('acct:' + e);

  return {
    /** מאמת כתובת לפי אסימון מייל (חד-פעמי). */
    verifyEmail(token) {
      const p = tokens.read(token, 'verify');
      if (!p || !store.useNonce('ver:' + p.nonce)) return fail(400, 'BAD_TOKEN', 'הקישור אינו תקף או שכבר נוצל.');
      accounts.markVerified(p.aid);
      return { ok: true };
    },

    /** שולח שוב מייל אימות לחשבון מחובר שעוד לא אומת. */
    async resendVerification(acc) {
      if (acc.verified) return { ok: true, already: true };
      const url = `${publicUrl}/login.html?verify=${tokens.issue('verify', acc.id, 24 * 60)}`;
      const sent = await mail.send(cipher.decrypt(acc.email_enc), mails.verificationMail(url));
      return { ok: sent, message: sent ? 'נשלח.' : 'שליחת מייל אינה זמינה כרגע.' };
    },

    /** בדיקות מקדימות לבקשת איפוס (תקינות כתובת וזמינות מייל); null אם אפשר להמשיך. */
    checkForgotRequest(rawEmail) {
      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) return fail(400, 'BAD_EMAIL', 'נא להזין כתובת אימייל תקינה.');
      if (!mail.available) return fail(503, 'NOT_AVAILABLE', 'איפוס סיסמה באימייל אינו זמין כרגע. פנו לשירות לקוחות.');
      return null;
    },

    /** שולח מייל איפוס אם החשבון קיים (עד 3 בקשות ליום לכתובת); רץ אחרי שהתשובה נשלחה ולא חושף קיום חשבון. */
    async sendResetMail(rawEmail) {
      const email = normalizeEmail(rawEmail);
      const acc = accounts.findByEmailHash(emailHash(email));
      if (!acc || store.bump('forgot:' + email) > 3) return;
      await mail.send(email, mails.resetMail(`${publicUrl}/login.html?reset=${tokens.issue('reset', acc.id, 30)}`));
    },

    /** מחזיר את המפתח העטוף במפתח השחזור כדי שהדפדפן יפתח אותו ויעטוף מחדש בסיסמה חדשה. */
    resetInfo(token) {
      const p = tokens.read(token, 'reset');
      const acc = p && accounts.findById(p.aid);
      if (!acc) return fail(400, 'BAD_TOKEN', BAD_LINK);
      return { ok: true, wrappedRec: JSON.parse(acc.wrapped_rec), email: cipher.decrypt(acc.email_enc) };
    },

    /** מאפס סיסמה; בלי מפתח שחזור (wipe) הכספת הישנה נמחקת ומפתח שחזור חדש נקבע. מנתק את כל המכשירים. */
    resetPassword(b) {
      const p = tokens.read(b.token, 'reset');
      const acc = p && accounts.findById(p.aid);
      if (!acc || !validAuthKey(b.authKey) || !validSealed(b.wrappedPw)) return fail(400, 'BAD_TOKEN', BAD_LINK);
      const wipe = b.wipe === true;
      if (wipe && !validSealed(b.wrappedRec)) return fail(400, 'BAD_MATERIAL', 'חומר ההצפנה אינו תקין.');
      if (!store.useNonce('rst:' + p.nonce)) return fail(409, 'ALREADY_USED', 'הקישור כבר נוצל.');
      accounts.setPassword(acc.id, hashAuth(b.authKey), b.wrappedPw);
      if (wipe) { accounts.setRecovery(acc.id, b.wrappedRec); vaults.remove(acc.id); }
      sessions.closeAll(acc.id);
      accounts.markVerified(acc.id); // הגעה לקישור במייל מוכיחה בעלות
      return { ok: true };
    },
  };
}

module.exports = { createAccountRecoveryService };
