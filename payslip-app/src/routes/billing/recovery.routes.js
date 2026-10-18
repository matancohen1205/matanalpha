'use strict';

/** POST /recover ו-/recover/confirm: שחזור גישה למנוי באימייל (קישור קסם חד-פעמי). */
function mountRecovery(router, { service, cookie }) {
  const { recovery } = service;

  router.post('/recover', async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().slice(0, 120);
    if (!recovery.isValidEmail(email)) return res.status(400).json({ error: 'BAD_EMAIL', message: 'נא להזין כתובת אימייל תקינה.' });
    if (!recovery.available()) return res.status(503).json({ error: 'NOT_AVAILABLE', message: 'שחזור באימייל אינו זמין כרגע. פנו לשירות לקוחות ונשחזר את הגישה.' });
    // תשובה זהה בכל מקרה, כדי לא לחשוף אם כתובת קיימת כמנוי
    res.json({ ok: true, message: 'אם קיים מנוי פעיל בכתובת הזו, נשלח אליה קישור שחזור בתוקף 15 דקות.' });
    await recovery.sendLink(email);
  });

  router.post('/recover/confirm', async (req, res) => {
    const r = await recovery.confirm(req.body && req.body.token);
    if (r.status !== 200) return res.status(r.status).json({ error: r.error, message: r.message });
    cookie.set(res, { cid: r.cid });
    res.json({ pro: true });
  });
}

module.exports = { mountRecovery };
