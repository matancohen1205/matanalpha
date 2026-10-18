'use strict';

const { createWhatsApp, createMetaClient, createDevClient } = require('../whatsapp');

/** בוחר לקוח וואטסאפ: Meta אמיתי, לקוח פיתוח מקומי, או כלום בפרודקשן בלי הגדרה. */
function pickWhatsAppClient(config) {
  const { wa, isProd } = config;
  if (wa.real) return createMetaClient({ phoneNumberId: wa.phoneNumberId, token: wa.accessToken });
  return isProd ? null : createDevClient();
}

/** בונה את שירות הוואטסאפ ומחבר אותו למנוי דרך פונקציות lazy (כדי לעקוב אחרי החלפת שירות המנוי). */
function buildWhatsApp({ config, store, tokenSecret, billingConfig, billing }, over = {}) {
  const { wa, isProd } = config;
  return createWhatsApp({
    store,
    client: pickWhatsAppClient(config),
    secret: tokenSecret,
    businessNumber: wa.businessNumber || (isProd ? '' : '972500000000'),
    verifyToken: wa.verifyToken,
    appSecret: wa.appSecret,
    siteUrl: billingConfig.publicUrl,
    devUnlock: billingConfig.devUnlock,
    devEndpoints: config.devEndpoints,
    getAuth: (req) => billing.current.getAuth(req),
    isPro: (cid) => billing.current.isProCid(cid),
    ...over,
  });
}

module.exports = { buildWhatsApp };
