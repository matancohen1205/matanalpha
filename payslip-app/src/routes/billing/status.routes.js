'use strict';

const DAY_S = 24 * 3600;

/** GET /me: מצב המנוי של הגולש; מרענן את העוגייה מול Stripe כשהיא מתקרבת לפקיעה. */
function mountStatus(router, { service, cookie }) {
  const { gateway, catalog, proToken, priceLabel, devUnlock } = service;
  const base = { configured: gateway.available, devUnlock, priceLabel, plans: catalog.plans };

  router.get('/me', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const auth = cookie.getAuth(req);
    if (!auth) return res.json({ pro: false, ...base });
    const age = auth.exp - Math.floor(Date.now() / 1000);
    if (gateway.available && auth.cid && age < proToken.ttlSeconds - DAY_S) {
      try {
        if (await gateway.hasActiveSubscription(auth.cid)) cookie.set(res, { cid: auth.cid });
        else {
          cookie.clear(res);
          return res.json({ pro: false, configured: true, priceLabel, plans: catalog.plans });
        }
      } catch {
        /* אם Stripe לא זמין משאירים את האסימון עד שיפוג */
      }
    }
    res.json({ pro: true, ...base, portal: !!(gateway.available && auth.cid) });
  });
}

module.exports = { mountStatus };
