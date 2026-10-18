'use strict';

const { sendFailure } = require('./middleware');

/** נתיבי הכספת המוצפנת: GET /vault לקריאה, PUT /vault לכתיבה עם גרסה. */
function mountVault(router, { svc, requireSession }) {
  router.get('/vault', requireSession, (req, res) => res.json(svc.vault.read(req.acc.id)));

  router.put('/vault', requireSession, (req, res) => {
    const r = svc.vault.write(req.acc.id, req.body || {});
    if (!r.ok) return sendFailure(res, r);
    res.json({ ok: true, version: r.version });
  });
}

module.exports = { mountVault };
