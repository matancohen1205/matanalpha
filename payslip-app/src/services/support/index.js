'use strict';

const { TOPICS } = require('./topics');
const { botSignal, normalizeTicket, validateTicket } = require('./validation');
const { ticketCode, buildTicketMail } = require('./ticket-mail');

/** שירות שירות-הלקוחות: פרטי קשר ציבוריים, קבלת פנייה (שמירה מוצפנת) ושליחת התראה במייל. */
function createSupportService({ store, mailer, config = {} }) {
  const notifyTo = config.notifyTo || config.supportEmail;
  return {
    /** פרטי הקשר הציבוריים והנושאים לטופס. */
    publicConfig: () => ({
      supportEmail: config.supportEmail || '',
      supportWhatsapp: String(config.supportWhatsapp || '').replace(/\D/g, ''),
      supportHours: config.supportHours || '',
      topics: TOPICS,
    }),
    /**
     * מקבל טופס פנייה. מחזיר {status, body} לתשובה, ו-notify (אם יש) לביצוע אחרי שהתשובה נשלחה.
     * בוטים (honeypot) מקבלים הצלחה מדומה בלי שמירה.
     */
    submit(b) {
      const bot = botSignal(b);
      if (bot === 'honeypot') return { status: 200, body: { ok: true, ticket: 'T-0000' } };
      if (bot) return { status: 400, body: { error: 'TOO_FAST', message: 'נסו לשלוח שוב בעוד רגע.' } };
      const data = normalizeTicket(b);
      const errors = validateTicket(data, b.consent);
      if (Object.keys(errors).length) return { status: 400, body: { error: 'INVALID', errors, message: 'יש להשלים כמה שדות.' } };
      const ticket = ticketCode(store.addTicket(data));
      const notify = mailer && notifyTo
        ? () => mailer.sendMail(buildTicketMail({ ticket, data, from: config.mailFrom || config.supportEmail, to: notifyTo }))
            .catch((e) => console.error('support mail failed:', e.code || e.name))
        : null;
      return { status: 200, body: { ok: true, ticket }, notify };
    },
  };
}

module.exports = { createSupportService };
