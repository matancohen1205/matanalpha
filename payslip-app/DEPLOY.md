# פריסה ל-Render (צעד אחר צעד)

האתר רץ כשירות Docker אחד עם כרך קבוע (`/data`) שבו נשמר מסד ה-SQLite (פניות שירות לקוחות וחיבורי וואטסאפ).
העלות: תוכנית Starter של Render (כרך קבוע לא זמין בתוכנית החינמית).

## 1. הכנה (חד-פעמית)
1. חשבון ב-[render.com](https://render.com), והתחברות עם GitHub.
2. הקוד צריך להיות בענף ש-Render יצפה בו. כרגע העבודה נמצאת בענף `claude/hebrew-conversation-m7gfib`. אפשר לבחור אותו ב-Render, או למזג אותו קודם ל-`master`.

## 2. יצירת השירות
1. ב-Render: **New → Blueprint**, בחרו את הריפו `matanalpha` ואת הענף.
2. Render יקרא את `render.yaml` ויציע שירות `tlush-be-ivrit` עם כרך של 1GB. אשרו.
3. מלאו את משתני הסביבה שמסומנים `sync: false` (אפשר להשאיר ריקים בינתיים והאתר יעלה בלעדיהם):
   - **שירות לקוחות:** `SUPPORT_EMAIL` (מוצג באתר), ולקבלת פניות במייל גם `SMTP_URL` ו-`MAIL_FROM`.
   - **תשלומים:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (ראו README, סקריפט `stripe-setup.js`).
   - **וואטסאפ:** ראו README, חלק "בוט וואטסאפ".
4. לחצו **Apply**. הבנייה הראשונה נמשכת כמה דקות.

## 3. בדיקה אחרי העלייה
האתר יהיה זמין בכתובת `https://tlush-be-ivrit.onrender.com` (או דומה). בדקו:
- `https://<הכתובת>/healthz` מחזיר `ok`.
- בדף הבית: "נסו עם תלוש לדוגמה", העלאת תמונת תלוש, המחשבון, ועוזר האתר.
- שליחת פנייה בטופס צור קשר. את הפניות קוראים דרך ה-Shell של Render:
  `node scripts/tickets.js` (משתני `DB_PATH` ו-`DATA_KEY` כבר מוגדרים בסביבה).

## 4. הפעלת תשלומים
1. ב-Render, הוסיפו `STRIPE_SECRET_KEY` ו-`STRIPE_PRICE_ID`. התחילו במפתח `sk_test_` ובדקו תשלום עם כרטיס בדיקה `4242 4242 4242 4242`.
2. רק אחרי שהכול עובד, החליפו למפתח `sk_live_` ולמחיר Live.

## 5. חיבור דומיין (כשיהיה)
1. ב-Render: **Settings → Custom Domains → Add**, והזינו את הדומיין.
2. אצל רשם הדומיינים: הוסיפו את רשומת ה-DNS ש-Render מציג (CNAME לתת-דומיין, או A לדומיין ראשי). אישור HTTPS נוצר אוטומטית.
3. הוסיפו משתנה `PUBLIC_URL=https://הדומיין-שלכם`.
4. אם חיברתם וואטסאפ: עדכנו ב-Meta את כתובת ה-Webhook ל-`https://הדומיין/api/whatsapp/webhook`.

## 6. תחזוקה
- **גיבוי:** Render מבצע snapshot יומי של הכרך. אפשר גם להעתיק את `/data/app.db` מה-Shell.
- **מפתח הצפנה:** `DATA_KEY` נוצר פעם אחת. שמרו עותק בנפרד: בלעדיו אי אפשר לפענח פניות ונתוני וואטסאפ. לא לשנות אותו אחרי שנשמרו נתונים.
- **עדכונים:** דחיפה לענף שנבחר פורסת אוטומטית (`autoDeploy`). ה-CI ב-GitHub מריץ את הבדיקות.
- **שרת יחיד:** האחסון (SQLite) והמתזמן מניחים מופע אחד, ולכן לא להגדיל ליותר ממופע אחד.
- **עדכון נתוני מס:** לעדכן את `TAX_DATA` ב-`public/js/tax-core.js` בתחילת כל שנה.

## 7. רשימת אבטחה לפני פתיחה לציבור
- [ ] **אימות דו-שלבי (2FA)** בחשבונות GitHub, Render, Stripe ו-Meta. חשבון שנפרץ עוקף כל הגנה בקוד.
- [ ] **מפתח Stripe מוגבל:** ב-Stripe ליצור *Restricted key* עם הרשאות בלבד ל-Checkout Sessions, Customers/Subscriptions (קריאה) ו-Billing Portal, ולא להשתמש במפתח הסודי המלא.
- [ ] `NODE_ENV=production`, `TRUST_PROXY=1`, והגדרת `PUBLIC_URL`. לוודא ש-`PRO_DEV_UNLOCK` ו-`WA_DEV` **לא** מוגדרים (האפליקציה מסרבת לעלות איתם באירוח).
- [ ] `DATA_KEY` ו-`PRO_TOKEN_SECRET` ארוכים ואקראיים, מגובים בנפרד (מנהל סיסמאות), ומוחלפים אם נחשפו.
- [ ] `SECURITY_CONTACT` או `SUPPORT_EMAIL` מוגדר, כדי ש-`/.well-known/security.txt` יהיה פעיל.
- [ ] הגנת קצה (מומלץ): Cloudflare (חינמי) לפני האתר עם WAF, Bot Fight Mode, והגבלת קצב נוספת. אחרי החיבור, `TRUST_PROXY=2`.
- [ ] ב-GitHub: להפעיל Branch protection על `master`, Secret scanning ו-Dependabot alerts.
- [ ] לוגים: לוודא ש-Render לא שומר גופי בקשות, ולהגדיר התראה על שגיאות 5xx.
- [ ] גיבוי תקופתי של `/data/app.db` ובדיקת שחזור.
- [ ] בדיקת חדירות חיצונית לפני קמפיין שיווקי.

## אלטרנטיבות
- **Fly.io / Railway:** אותו `Dockerfile` עובד. נדרש כרך שמוצמד ל-`/data` והמשתנים שברשימה למעלה.
- **VPS:** `docker build -t tlush .` ואז `docker run -p 3000:3000 -v tlush-data:/data --env-file .env tlush`, מאחורי Caddy או Nginx עם HTTPS.
