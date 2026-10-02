'use strict';
// בדיקת מוכנות להפעלה: node scripts/preflight.js (עם אותם משתני סביבה כמו בשרת). יוצא 1 אם חסר משהו חובה.
const fs = require('fs');
const path = require('path');
const e = process.env;
let blockers = 0;
const out = (lvl, msg) => { if (lvl === 'FAIL') blockers++; console.log(`${{ OK: '✓', FAIL: '✗', WARN: '!' }[lvl]} ${msg}`); };
const need = (cond, ok, bad, lvl = 'FAIL') => out(cond ? 'OK' : lvl, cond ? ok : bad);

console.log('— תשתית');
need(e.NODE_ENV === 'production', 'NODE_ENV=production', 'NODE_ENV אינו production');
need(!!e.DB_PATH && e.DB_PATH !== ':memory:', `DB_PATH=${e.DB_PATH}`, 'DB_PATH חסר: חשבונות ופניות יימחקו בכל הפעלה');
need((e.DATA_KEY || '').length >= 32, 'DATA_KEY תקין', 'DATA_KEY חסר או קצר מ-32 תווים');
need(!!e.PRO_TOKEN_SECRET && e.PRO_TOKEN_SECRET.length >= 32, 'PRO_TOKEN_SECRET תקין', 'PRO_TOKEN_SECRET חסר או קצר');
need(/^https:\/\//.test(e.PUBLIC_URL || ''), `PUBLIC_URL=${e.PUBLIC_URL}`, 'PUBLIC_URL חסר או אינו https (קישורי מייל, canonical ו-sitemap)');
need(e.TRUST_PROXY === '1', 'TRUST_PROXY=1', 'TRUST_PROXY לא מוגדר: הגבלת קצב תראה את כתובת הפרוקסי', 'WARN');
['PRO_DEV_UNLOCK', 'WA_DEV'].forEach((k) => need(e[k] !== '1', `${k} כבוי`, `${k}=1 חייב להיות כבוי בפרודקשן`));

console.log('— מייל (איפוס סיסמה, אימות, שחזור מנוי)');
need(!!e.SMTP_URL, 'SMTP_URL מוגדר', 'SMTP_URL חסר: אין מייל איפוס סיסמה ואימות');
need(!!e.MAIL_FROM, 'MAIL_FROM מוגדר', 'MAIL_FROM חסר', e.SMTP_URL ? 'FAIL' : 'WARN');
need(!!((e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID) || e.NTFY_TOPIC || ((e.SUPPORT_NOTIFY_TO || e.SUPPORT_EMAIL) && e.SMTP_URL)), 'ערוץ התראה על פניות מוגדר', 'אין ערוץ התראה על פניות שירות לקוחות (טלגרם/ntfy/מייל): פניות יישמרו אך לא תקבלו הודעה', 'WARN');
need(!!e.SUPPORT_EMAIL, 'SUPPORT_EMAIL מוגדר', 'SUPPORT_EMAIL חסר (נדרש בעמוד צור קשר ובפרטיות)', 'WARN');

need((e.ADMIN_PASSWORD || '').length >= 12, 'ממשק ניהול פניות מופעל (/admin.html)', 'ADMIN_PASSWORD חסר או קצר מ-12 תווים: ממשק הניהול כבוי', 'WARN');

console.log('— תשלומים');
const stripe = !!e.STRIPE_SECRET_KEY;
need(stripe, 'Stripe מוגדר', 'STRIPE_SECRET_KEY חסר: אי אפשר להצטרף ל-Pro', 'WARN');
if (stripe) {
  need(/^sk_live_/.test(e.STRIPE_SECRET_KEY), 'מפתח live', 'המפתח אינו sk_live_ (מצב בדיקה)', 'WARN');
  need(!!e.STRIPE_PRICE_ID, 'STRIPE_PRICE_ID מוגדר', 'STRIPE_PRICE_ID חסר');
  need(!!e.STRIPE_PRICE_ID_YEARLY, 'מחיר שנתי מוגדר', 'STRIPE_PRICE_ID_YEARLY חסר (המתג השנתי לא יוצג)', 'WARN');
}

console.log('— סוכן צ\'אט');
need(!!e.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY מוגדר', 'אין מפתח: הצ\'אט פועל כעוזר כללים', 'WARN');

console.log('— וואטסאפ (אופציונלי)');
if (e.WA_ACCESS_TOKEN) ['WA_PHONE_NUMBER_ID', 'WA_BUSINESS_NUMBER', 'WA_APP_SECRET', 'WA_VERIFY_TOKEN'].forEach((k) => need(!!e[k], `${k} מוגדר`, `${k} חסר`));
else out('WARN', 'וואטסאפ כבוי');

console.log('— תוכן משפטי');
const pub = path.join(__dirname, '..', 'public');
const left = fs.readdirSync(pub).filter((f) => f.endsWith('.html')).filter((f) => /\[להשלים[^\]]*\]/.test(fs.readFileSync(path.join(pub, f), 'utf8')));
need(!left.length, 'אין שדות [להשלים]', `שדות [להשלים] בעמודים: ${left.join(', ')} `);
need(!/draft-note/.test(fs.readFileSync(path.join(pub, 'terms.html'), 'utf8')), 'תנאי השימוש ללא סימון טיוטה', 'תנאי השימוש מסומנים כטיוטה: נדרשת בדיקה של עורך דין', 'WARN');

console.log(blockers ? `\n${blockers} חסמים לפני הפעלה.` : '\nאין חסמים.');
process.exit(blockers ? 1 : 0);
