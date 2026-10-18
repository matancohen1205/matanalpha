'use strict';

/** עמודים שהסוכן רשאי להפנות אליהם (רשימה לבנה): הסוכן מחזיר מפתח בלבד ולא כתובת. */
const LINKS = Object.freeze({
  upload: { label: 'העלאת תלוש', href: '/#upload' },
  glossary: { label: 'מילון המונחים', href: '/#glossary' },
  calculator: { label: 'מחשבון נטו-ברוטו', href: '/calculator.html' },
  credits: { label: 'בדיקת נקודות זיכוי', href: '/credits.html' },
  compare: { label: 'השוואת תלושים', href: '/compare.html' },
  rights: { label: 'זכויות ותזכורות', href: '/rights.html' },
  whatsapp: { label: 'התראות בוואטסאפ', href: '/whatsapp.html' },
  pricing: { label: 'מנוי Pro', href: '/pricing.html' },
  account: { label: 'החשבון שלי', href: '/account.html' },
  signup: { label: 'יצירת חשבון', href: '/signup.html' },
  contact: { label: 'פנייה לשירות לקוחות', href: '/contact.html' },
  privacy: { label: 'מדיניות פרטיות', href: '/privacy.html' },
});

/** תיאור העמוד שבו המשתמש נמצא (להקשר בהנחיות הסוכן). */
const PAGES = Object.freeze({
  '/': 'the home page (upload and explain a payslip, glossary, FAQ)',
  '/calculator.html': 'the net/gross calculator',
  '/credits.html': 'the tax credit points check',
  '/compare.html': 'the payslip comparison tool (Pro)',
  '/rights.html': 'the rights and reminders page (vacation, recuperation, sick days; calendar reminders)',
  '/pricing.html': 'the Pro plan and pricing page',
  '/whatsapp.html': 'the WhatsApp alerts page (Pro)',
  '/contact.html': 'the contact form',
  '/about.html': 'the About us page',
  '/account.html': 'the account page',
  '/login.html': 'the login page',
  '/signup.html': 'the sign-up page',
});

/** שפות שהסוכן מתבקש לענות בהן. */
const LANG_NAMES = Object.freeze({ he: 'Hebrew', en: 'English', ru: 'Russian', ar: 'Arabic' });

module.exports = { LINKS, PAGES, LANG_NAMES };
