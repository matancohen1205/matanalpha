'use strict';

/** POST /logout: מנקה את עוגיית ה-Pro מהמכשיר. */
function mountLogout(router, { cookie }) {
  router.post('/logout', (req, res) => {
    cookie.clear(res);
    res.json({ pro: false });
  });
}

/** POST /dev-activate: פותח Pro בלי תשלום, רק במצב פיתוח (אסור בפרודקשן). */
function mountDevActivate(router, { service, cookie }) {
  if (!service.devUnlock) return;
  router.post('/dev-activate', (req, res) => {
    cookie.set(res, { cid: null, dev: true });
    res.json({ pro: true, dev: true });
  });
}

module.exports = { mountLogout, mountDevActivate };
