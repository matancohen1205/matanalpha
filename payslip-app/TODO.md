# משימות פתוחות

- [ ] **ספק SMTP לשליחת מיילים** (איפוס סיסמה, אימות כתובת, שחזור מנוי): לבחור ספק, לאמת דומיין/כתובת שולח, ולהגדיר `SMTP_URL`, `MAIL_FROM`, `PUBLIC_URL` ב-Render. ראו `DEPLOY.md`. הקוד נבדק מול שרת SMTP מקומי בלבד.
- [ ] תשלומים: Stripe (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_PRICE_ID_YEARLY`) לא נבדק מול Stripe אמיתי.
- [ ] וואטסאפ (Meta Cloud API) לא נבדק מול Meta, ותזכורות יזומות דורשות תבנית מאושרת.
- [ ] אימות נתוני החוק: `public/js/rights-core.js` ו-`public/js/tax-core.js` הם קירובים.
- [ ] בדיקת תרגומים (EN/RU/AR) על ידי דוברי שפת אם.
- [ ] **מפתח `ANTHROPIC_API_KEY`** להפעלת סוכן הצ'אט (Claude). הקוד נבדק מול ספק מדומה בלבד, לא מול ה-API האמיתי. כדאי להגדיר גם תקרת הוצאה בחשבון ה-API.
