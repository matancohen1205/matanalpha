'use strict';

const { sendFailure } = require('./middleware');

/** נתיבי הרשמה, התחברות, יציאה ומצב החשבון (/register /login /logout /me). */
function mountAuth(router, { svc, cookie, hooks }) {
  router.post('/register', async (req, res) => {
    const r = await svc.credentials.register(req.body || {});
    if (!r.ok) return sendFailure(res, r);
    cookie.set(res, r.token);
    res.json({ ok: true, verified: false, mailSent: r.mailSent });
  });

  router.post('/login', async (req, res) => {
    const r = svc.credentials.login(req.body || {});
    if (!r.ok) return sendFailure(res, r);
    cookie.set(res, r.token);
    // מנוי מקושר מפעיל Pro אוטומטית (גם שחזור גישה)
    let pro = false;
    if (r.subscriptionCid && hooks.setProCookie && hooks.isProCid && (await hooks.isProCid(r.subscriptionCid))) {
      hooks.setProCookie(res, r.subscriptionCid);
      pro = true;
    }
    res.json({ ok: true, verified: r.verified, wrappedPw: r.wrappedPw, pro });
  });

  router.post('/logout', (req, res) => {
    svc.session.close(cookie.read(req));
    cookie.clear(res);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const acc = svc.session.accountFor(cookie.read(req));
    if (!acc) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, email: svc.cipher.decrypt(acc.email_enc), verified: !!acc.verified, subscriptionLinked: !!acc.cid_enc, mailAvailable: svc.mail.available });
  });
}

module.exports = { mountAuth };
