'use strict';

/** עוטף שולח מייל כך שכשל שליחה לא מפיל בקשה: מחזיר true/false ורושם ללוג רק את סוג השגיאה. */
function createSafeMailer({ mailer, mailFrom }) {
  return {
    available: !!mailer,
    /** שולח מייל; false אם אין שולח מוגדר או שהשליחה נכשלה. */
    async send(to, { subject, text }) {
      if (!mailer) return false;
      try {
        await mailer.sendMail({ from: mailFrom, to, subject, text });
        return true;
      } catch (e) {
        console.error('account mail failed:', e.code || e.name);
        return false;
      }
    },
  };
}

module.exports = { createSafeMailer };
