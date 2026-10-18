'use strict';

/** נתיב פיתוח בלבד (WA_DEV): מנפיק אסימוני אימות/איפוס בלי מייל, לבדיקות מקצה לקצה. */
function mountDev(router, { svc, enabled }) {
  if (!enabled) return;
  router.get('/dev-token', (req, res) => {
    const acc = svc.accounts.findByEmailHash(svc.cipher.hash('acct:' + String(req.query.email || '').toLowerCase()));
    if (!acc) return res.status(404).end();
    res.json({ verify: svc.tokens.issue('verify', acc.id, 60), reset: svc.tokens.issue('reset', acc.id, 30) });
  });
}

module.exports = { mountDev };
