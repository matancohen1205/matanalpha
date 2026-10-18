'use strict';

const express = require('express');
const { createRateLimiters } = require('../middleware/rate-limits');
const { mountBilling } = require('./mounts/billing.mount');
const { mountAccount } = require('./mounts/account.mount');
const { mountWhatsApp } = require('./mounts/whatsapp.mount');
const { mountAgent } = require('./mounts/agent.mount');
const { mountAdmin } = require('./mounts/admin.mount');
const { mountSupport } = require('./mounts/support.mount');
const { mountAnalyze } = require('./analyze.routes');
const { mountGlossary } = require('./glossary.routes');
const { mountCompare } = require('./compare.routes');

/** מרכיב את כל ה-API תחת /api: כותרות no-store, הגבלת קצב כללית, ואז כל קבוצת נתיבים. */
function createApiRouter(container) {
  const api = express.Router();
  const deps = { services: container.services, limiters: createRateLimiters(container.config.env) };
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use(deps.limiters.general);
  mountBilling(api, deps);
  mountWhatsApp(api, deps);
  mountAgent(api, deps);
  mountAdmin(api, deps);
  mountAccount(api, deps);
  mountSupport(api, deps);
  mountAnalyze(api, deps);
  mountGlossary(api, deps);
  mountCompare(api, deps);
  return api;
}

module.exports = { createApiRouter };
