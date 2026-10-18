'use strict';

const express = require('express');
const { createAccountServices } = require('../../services/accounts');
const { createSessionCookie } = require('./session-cookie');
const { jsonOnlyNoStore, createRequireSession } = require('./middleware');
const { mountAuth } = require('./auth.routes');
const { mountVault } = require('./vault.routes');
const { mountRecovery } = require('./recovery.routes');
const { mountSettings } = require('./settings.routes');
const { mountDev } = require('./dev.routes');

/**
 * בונה את מודול החשבונות: שירותים + ראוטר. השרת שומר רק גיבוב מפתח אימות, מפתחות עטופים וכספת מוצפנת
 * ואינו יכול לקרוא את הנתונים. hooks מחברים את החשבון למנוי Pro (עוגיית Pro, בדיקת מנוי).
 */
function createAccounts({ secure = false, devEndpoints = false, setProCookie, isProCid, getProAuth, idleMs, ...serviceDeps }) {
  const svc = createAccountServices({ ...serviceDeps, idleMs });
  const cookie = createSessionCookie({ secure, maxAgeMs: svc.sessionTtlMs });
  const requireSession = createRequireSession({ cookie, session: svc.session });
  const hooks = { setProCookie, isProCid, getProAuth };
  const router = express.Router();
  const ctx = { svc, cookie, requireSession, hooks, enabled: devEndpoints };

  router.use(express.json({ limit: '300kb' }));
  router.use(jsonOnlyNoStore);
  mountAuth(router, ctx);
  mountVault(router, ctx);
  mountRecovery(router, ctx);
  mountSettings(router, ctx);
  mountDev(router, ctx);

  return { router, sessionOf: (req) => svc.session.accountFor(cookie.read(req)) };
}

module.exports = { createAccounts };
