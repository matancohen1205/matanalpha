'use strict';

const express = require('express');
const { createRateLimiters } = require('../middleware/rate-limits');
const { mountBilling } = require('./billing.routes');
const { mountAccount } = require('./account.routes');
const { mountWhatsApp } = require('./whatsapp.routes');
const { mountAgent } = require('./agent.routes');
const { mountAdmin } = require('./admin.routes');
const { mountSupport } = require('./support.routes');
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
