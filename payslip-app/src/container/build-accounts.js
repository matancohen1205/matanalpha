'use strict';

const { createAccounts } = require('../accounts');

/** בונה את שירות החשבונות ומחבר אותו למנוי (קישור מנוי לחשבון) דרך פונקציות lazy. */
function buildAccounts({ config, store, tokenSecret, billingConfig, billing }, over = {}) {
  return createAccounts({
    store,
    mailer: billingConfig.mailer,
    mailFrom: billingConfig.mailFrom,
    secret: tokenSecret,
    publicUrl: billingConfig.publicUrl,
    secure: config.isProd,
    devEndpoints: config.devEndpoints,
    setProCookie: (res, cid) => billing.current.setProCookie(res, cid),
    isProCid: (cid) => billing.current.isProCid(cid),
    getProAuth: (req) => billing.current.getAuth(req),
    ...over,
  });
}

module.exports = { buildAccounts };
