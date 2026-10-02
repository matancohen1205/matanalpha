'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const TOPICS = {
  usage: 'שאלה על השימוש באתר',
  technical: 'בעיה טכנית',
  billing: 'מנוי ותשלום',
  privacy: 'פרטיות ומחיקת מידע',
  whatsapp: 'בוט הוואטסאפ',
  other: 'אחר',
};
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const PHONE = /^[0-9+\-\s()]{7,20}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‎‏‪-‮]/g, '').trim().slice(0, max);

/**
 * @param {object} o
 * @param {object} o.store    createStore()
 * @param {object|null} o.mailer  אובייקט עם sendMail (nodemailer) או null
 * @param {object} o.config   { supportEmail, supportWhatsapp, supportHours, mailFrom, notifyTo }
 */
function createSupport({ store, mailer, config = {}, publicUrl }) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT', message: 'נשלחו כמה פניות בזמן קצר. נסו שוב מאוחר יותר.' },
  });

  router.get('/site-config', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      supportEmail: config.supportEmail || '',
      supportWhatsapp: String(config.supportWhatsapp || '').replace(/\D/g, ''),
      supportHours: config.supportHours || '',
      topics: TOPICS,
    });
  });

  router.post('/contact', limiter, express.json({ limit: '12kb' }), (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON_ONLY' });
    if (publicUrl && req.headers.origin && req.headers.origin !== new URL(publicUrl).origin && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'BAD_ORIGIN' });
    }
    const b = req.body || {};
    // מלכודת בוטים: שדה נסתר שבני אדם לא ממלאים, ומינימום זמן מילוי
    if (b.website) return res.json({ ok: true, ticket: 'T-0000' });
    if (!Number.isFinite(Number(b.elapsedMs)) || Number(b.elapsedMs) < 2500) {
      return res.status(400).json({ error: 'TOO_FAST', message: 'נסו לשלוח שוב בעוד רגע.' });
    }

    const data = {
      name: clean(b.name, 80),
      email: clean(b.email, 120).toLowerCase(),
      phone: clean(b.phone, 20),
      topic: Object.prototype.hasOwnProperty.call(TOPICS, b.topic) ? b.topic : 'other',
      message: clean(b.message, 2000),
    };
    const errors = {};
    if (data.name.length < 2) errors.name = 'נא להזין שם';
    if (!EMAIL.test(data.email)) errors.email = 'נא להזין כתובת אימייל תקינה';
    if (data.phone && !PHONE.test(data.phone)) errors.phone = 'מספר הטלפון אינו תקין';
    if (data.message.length < 10) errors.message = 'נא לכתוב לפחות כמה מילים';
    if ((data.message.match(/https?:\/\//gi) || []).length > 2) errors.message = 'יותר מדי קישורים בהודעה';
    if (b.consent !== true) errors.consent = 'יש לאשר את מדיניות הפרטיות';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'INVALID', errors, message: 'יש להשלים כמה שדות.' });

    const id = store.addTicket(data);
    const ticket = 'T-' + String(id).padStart(4, '0');
    res.json({ ok: true, ticket });

    const text = `פנייה ${ticket}\nנושא: ${TOPICS[data.topic]}\nשם: ${data.name}\nאימייל: ${data.email}\nטלפון: ${data.phone || '-'}\n\n${data.message}\n`;
    if (mailer && (config.notifyTo || config.supportEmail)) {
      mailer
        .sendMail({
          from: config.mailFrom || config.supportEmail,
          to: config.notifyTo || config.supportEmail,
          replyTo: data.email,
          subject: `[תלוש בעברית] ${TOPICS[data.topic]} (${ticket})`,
          text: `פנייה ${ticket}\nנושא: ${TOPICS[data.topic]}\nשם: ${data.name}\nאימייל: ${data.email}\nטלפון: ${data.phone || '-'}\n\n${data.message}\n`,
        })
        .catch((e) => console.error('support mail failed:', e.code || e.name));
    }
  });

  return { router, TOPICS };
}

module.exports = { createSupport, TOPICS };
