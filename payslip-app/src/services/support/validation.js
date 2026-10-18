'use strict';

const { TOPICS } = require('./topics');

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const PHONE = /^[0-9+\-\s()]{7,20}$/;
const MIN_FILL_MS = 2500; // מינימום זמן מילוי טופס (אנושי)
const INVISIBLE_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f‎‏‪-‮]/g;

/** מנקה תו בקרה ותווי כיווניות נסתרים, חותך לאורך מרבי. */
const clean = (s, max) => String(s ?? '').replace(INVISIBLE_CHARS, '').trim().slice(0, max);

/** האם הבקשה נראית כבוט: שדה מלכודת מלא (honeypot) או מילוי מהיר מדי. */
function botSignal(b) {
  if (b.website) return 'honeypot';
  if (!Number.isFinite(Number(b.elapsedMs)) || Number(b.elapsedMs) < MIN_FILL_MS) return 'too-fast';
  return null;
}

/** מנקה את שדות הטופס ומחזיר אובייקט פנייה מנורמל. */
function normalizeTicket(b) {
  return {
    name: clean(b.name, 80),
    email: clean(b.email, 120).toLowerCase(),
    phone: clean(b.phone, 20),
    topic: Object.prototype.hasOwnProperty.call(TOPICS, b.topic) ? b.topic : 'other',
    message: clean(b.message, 2000),
  };
}

/** בודק פנייה מנורמלת; מחזיר אובייקט שגיאות לפי שדה (ריק אם הכול תקין). */
function validateTicket(data, consent) {
  const errors = {};
  if (data.name.length < 2) errors.name = 'נא להזין שם';
  if (!EMAIL.test(data.email)) errors.email = 'נא להזין כתובת אימייל תקינה';
  if (data.phone && !PHONE.test(data.phone)) errors.phone = 'מספר הטלפון אינו תקין';
  if (data.message.length < 10) errors.message = 'נא לכתוב לפחות כמה מילים';
  if ((data.message.match(/https?:\/\//gi) || []).length > 2) errors.message = 'יותר מדי קישורים בהודעה';
  if (consent !== true) errors.consent = 'יש לאשר את מדיניות הפרטיות';
  return errors;
}

module.exports = { botSignal, normalizeTicket, validateTicket };
