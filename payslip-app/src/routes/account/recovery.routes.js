'use strict';

const { sendFailure } = require('./middleware');

/** אימות כתובת, שליחה חוזרת, ואיפוס סיסמה במייל (/verify /resend-verification /forgot /reset-info /reset). */
function mountRecovery(router, { svc, requireSession }) {
  router.post('/verify', (req, res) => {
    const r = svc.recovery.verifyEmail(req.body && req.body.token);
    if (!r.ok) return sendFailure(res, r);
    res.json({ ok: true });
  });

  router.post('/resend-verification', requireSession, async (req, res) => res.json(await svc.recovery.resendVerification(req.acc)));

  router.post('/forgot', async (req, res) => {
    const email = req.body && req.body.email;
    const blocked = svc.recovery.checkForgotRequest(email);
    if (blocked) return sendFailure(res, blocked);
    // תשובה זהה בכל מקרה (לא חושפים אם הכתובת קיימת); המייל נשלח אחרי התשובה
    res.json({ ok: true, message: 'אם קיים חשבון בכתובת הזו, נשלח אליה קישור לאיפוס (בתוקף 30 דקות).' });
    await svc.recovery.sendResetMail(email);
  });

  router.post('/reset-info', (req, res) => {
    const r = svc.recovery.resetInfo(req.body && req.body.token);
    if (!r.ok) return sendFailure(res, r);
    res.json({ wrappedRec: r.wrappedRec, email: r.email });
  });

  router.post('/reset', (req, res) => {
    const r = svc.recovery.resetPassword(req.body || {});
    if (!r.ok) return sendFailure(res, r);
    res.json({ ok: true });
  });
}

module.exports = { mountRecovery };
