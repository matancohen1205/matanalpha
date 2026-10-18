'use strict';

const { sendFailure } = require('./middleware');

/** הגדרות חשבון: החלפת סיסמה, מחיקת חשבון, וקישור/ניתוק מנוי Pro. */
function mountSettings(router, { svc, cookie, requireSession, hooks }) {
  router.post('/change-password', requireSession, (req, res) => {
    const r = svc.credentials.changePassword(req.acc, req.body || {});
    if (!r.ok) return sendFailure(res, r);
    cookie.set(res, r.token);
    res.json({ ok: true });
  });

  router.post('/delete', requireSession, (req, res) => {
    const r = svc.credentials.deleteAccount(req.acc, req.body || {});
    if (!r.ok) return sendFailure(res, r);
    cookie.clear(res);
    res.json({ ok: true });
  });

  router.post('/link-subscription', requireSession, (req, res) => {
    const auth = hooks.getProAuth && hooks.getProAuth(req);
    if (!auth || !auth.cid) return res.status(402).json({ error: 'PRO_REQUIRED', message: 'כדי לקשר מנוי צריך להיות מחוברים עם מנוי Pro פעיל במכשיר הזה.' });
    svc.subscription.link(req.acc.id, auth.cid);
    res.json({ ok: true });
  });

  router.post('/unlink-subscription', requireSession, (req, res) => {
    svc.subscription.unlink(req.acc.id);
    res.json({ ok: true });
  });
}

module.exports = { mountSettings };
