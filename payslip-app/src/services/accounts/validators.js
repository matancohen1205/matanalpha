'use strict';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;

/** מנרמל כתובת אימייל מקלט חופשי: טקסט, אותיות קטנות, עד 120 תווים. */
function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase().slice(0, 120);
}

/** האם זו כתובת אימייל תקינה (בדיקה שמרנית, בלי תווים מסוכנים). */
const isValidEmail = (email) => EMAIL_RE.test(email);

/** מפתח האימות שנגזר בדפדפן: 32 בתים ב-base64url (43 תווים; מאפשרים 40-48). */
function validAuthKey(k) {
  return typeof k === 'string' && B64URL.test(k) && k.length >= 40 && k.length <= 48;
}

/** מפתח עטוף קצר (iv + ciphertext) של מפתח הכספת. */
function validSealed(o) {
  return !!o && typeof o === 'object' && typeof o.iv === 'string' && typeof o.ct === 'string' && B64URL.test(o.iv) && B64URL.test(o.ct) && o.iv.length <= 24 && o.ct.length <= 200;
}

/** כספת מוצפנת (גודל ה-ciphertext מוגבל בנפרד לפי MAX_VAULT_CHARS). */
function validSealedBlob(o) {
  return !!o && typeof o === 'object' && typeof o.iv === 'string' && typeof o.ct === 'string' && B64URL.test(o.iv) && B64URL.test(o.ct) && o.iv.length <= 24;
}

module.exports = { normalizeEmail, isValidEmail, validAuthKey, validSealed, validSealedBlob, B64URL };
