'use strict';

const { isValidActivation, customerIdOf } = require('../../services/billing/activation');

/** POST /checkout: פותח דף תשלום למנוי חודשי או שנתי. */
function mountCheckout(router, { service }) {
  const { gateway, catalog } = service;
  router.post('/checkout', async (req, res) => {
    const plan = req.body && req.body.plan === 'yearly' ? 'yearly' : 'monthly';
    const price = catalog.prices[plan];
    if (!gateway.available || !price) return res.status(503).json({ error: 'NOT_CONFIGURED', message: plan === 'yearly' ? 'המנוי השנתי עדיין לא זמין.' : 'התשלומים עדיין לא הוגדרו באתר.' });
    try {
      res.json({ url: await gateway.createCheckoutUrl(price) });
    } catch (e) {
      console.error('checkout failed:', e.type || e.name);
      res.status(502).json({ error: 'CHECKOUT_FAILED', message: 'לא הצלחנו לפתוח את דף התשלום. נסו שוב.' });
    }
  });
}

/** POST /activate: מאמת תשלום שהושלם ב-Stripe ומפעיל Pro (מזהה העסקה חד-פעמי). */
function mountActivate(router, { service, cookie }) {
  const { gateway, catalog, once } = service;
  router.post('/activate', async (req, res) => {
    const id = req.body && req.body.session_id;
    if (!gateway.available) return res.status(503).json({ error: 'NOT_CONFIGURED' });
    if (typeof id !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'BAD_SESSION' });
    try {
      const session = await gateway.retrieveCheckout(id);
      if (!isValidActivation(session, catalog.ourPrices)) return res.status(402).json({ error: 'NOT_PAID', message: 'לא נמצא תשלום שהושלם.' });
      // מזהה עסקה הוא "מפתח" חד-פעמי: דליפה שלו לא מאפשרת הפעלה חוזרת
      if (once && !once('cs:' + id)) return res.status(409).json({ error: 'ALREADY_USED', message: 'הקישור כבר נוצל. אם איבדתם גישה, פנו לשירות לקוחות.' });
      cookie.set(res, { cid: customerIdOf(session) });
      res.json({ pro: true });
    } catch (e) {
      console.error('activate failed:', e.type || e.name);
      res.status(502).json({ error: 'ACTIVATE_FAILED', message: 'לא הצלחנו לאמת את התשלום. נסו לרענן.' });
    }
  });
}

/** POST /portal: פותח את פורטל ניהול המנוי של Stripe למנוי מחובר. */
function mountPortal(router, { service, cookie }) {
  router.post('/portal', async (req, res) => {
    const auth = cookie.getAuth(req);
    if (!service.gateway.available || !auth || !auth.cid) return res.status(401).json({ error: 'NO_SUBSCRIPTION' });
    try {
      res.json({ url: await service.gateway.createPortalUrl(auth.cid) });
    } catch {
      res.status(502).json({ error: 'PORTAL_FAILED', message: 'לא הצלחנו לפתוח את ניהול המנוי.' });
    }
  });
}

module.exports = { mountCheckout, mountActivate, mountPortal };
