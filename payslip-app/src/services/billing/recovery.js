'use strict';

const crypto = require('crypto');
const { sign, verify } = require('./tokens');
const { isValidEmail } = require('../accounts/validators');

const RECOVERY_TTL_S = 15 * 60;

/** נוסח מייל שחזור הגישה למנוי. */
function recoveryMail(link) {
  return { subject: 'קישור לשחזור הגישה למנוי Pro', text: `שלום,\n\nביקשתם לשחזר את הגישה למנוי Pro באתר תלוש בעברית.\nלחצו על הקישור (בתוקף 15 דקות, לשימוש חד-פעמי):\n${link}\n\nאם לא ביקשתם זאת, אפשר להתעלם מההודעה.\n` };
}

/** שחזור גישה למנוי באימייל: שולח קישור קסם חד-פעמי, ומאמת אותו. */
function createRecoveryService({ gateway, secret, throttle, once, mailer, mailFrom, publicUrl }) {
  return {
    /** האם שחזור באימייל זמין (נדרשים Stripe ושולח מייל). */
    available: () => gateway.available && !!mailer,
    isValidEmail,
    /** מחפש מנוי פעיל לאימייל ושולח קישור שחזור; רץ אחרי שהתשובה נשלחה, ולא חושף אם הכתובת קיימת. */
    async sendLink(email) {
      try {
        if (throttle && throttle('recover:' + email.toLowerCase()) > 3) return;
        const cid = await gateway.findActiveCustomerId(email);
        if (!cid) return;
        const token = sign({ t: 'recover', cid, nonce: crypto.randomBytes(12).toString('base64url'), exp: Math.floor(Date.now() / 1000) + RECOVERY_TTL_S }, secret);
        const mail = recoveryMail(`${publicUrl}/pricing.html?recover=${token}`);
        await mailer.sendMail({ from: mailFrom, to: email, subject: mail.subject, text: mail.text });
      } catch (e) {
        console.error('recover failed:', e.type || e.code || e.name);
      }
    },
    /** מאמת אסימון שחזור: מחזיר {status, error?, cid?} שהנתיב מתרגם לתשובה. */
    async confirm(token) {
      const p = verify(token, secret);
      if (!gateway.available || !p || p.t !== 'recover' || !p.cid) return { status: 400, error: 'BAD_TOKEN', message: 'הקישור אינו תקף או שפג תוקפו.' };
      if (once && !once('rec:' + p.nonce)) return { status: 409, error: 'ALREADY_USED', message: 'הקישור כבר נוצל. אפשר לבקש קישור חדש.' };
      try {
        if (!(await gateway.hasActiveSubscription(p.cid))) return { status: 402, error: 'NOT_ACTIVE', message: 'המנוי אינו פעיל.' };
        return { status: 200, cid: p.cid };
      } catch {
        return { status: 502, error: 'RECOVER_FAILED', message: 'לא הצלחנו לאמת את המנוי. נסו שוב.' };
      }
    },
  };
}

module.exports = { createRecoveryService };
