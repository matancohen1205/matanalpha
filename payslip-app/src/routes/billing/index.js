'use strict';

const express = require('express');
const { createBillingService } = require('../../services/billing');
const { createProCookie } = require('./pro-cookie');
const { jsonAndOriginGuard, requirePro } = require('./guards');
const { mountStatus } = require('./status.routes');
const { mountCheckout, mountActivate, mountPortal } = require('./checkout.routes');
const { mountRecovery } = require('./recovery.routes');
const { mountLogout, mountDevActivate } = require('./session.routes');

/**
 * בונה את מודול המנוי: שירותים + ראוטר. מחזיר את אותו חוזה שהמודולים האחרים משתמשים בו
 * (router, requirePro, getAuth, isProCid, setProCookie).
 */
function createBilling(opts) {
  const service = createBillingService(opts);
  const cookie = createProCookie({ proToken: service.proToken, secure: !!opts.secure });
  const router = express.Router();
  const ctx = { service, cookie };

  router.use(express.json({ limit: '10kb' }));
  router.use(jsonAndOriginGuard({ publicUrl: opts.publicUrl, devUnlock: !!opts.devUnlock }));
  mountStatus(router, ctx);
  mountCheckout(router, ctx);
  mountActivate(router, ctx);
  mountRecovery(router, ctx);
  mountPortal(router, ctx);
  mountLogout(router, ctx);
  mountDevActivate(router, ctx);

  return {
    router,
    requirePro: requirePro(cookie),
    getAuth: cookie.getAuth,
    isProCid: service.isProCid,
    setProCookie: (res, cid) => cookie.set(res, { cid }),
  };
}

module.exports = { createBilling };
