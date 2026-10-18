'use strict';

const { createAgent } = require('../agent');

/** בונה את סוכן הצ'אט (Claude); בלי מפתח הוא כבוי ומחזיר 503. */
function buildAgent({ config, billingConfig }, over = {}) {
  return createAgent({
    apiKey: config.agent.apiKey,
    model: config.agent.model,
    dailyLimit: config.agent.dailyLimit,
    config: { priceLabel: billingConfig.priceLabel, priceLabelYearly: billingConfig.priceLabelYearly },
    ...over,
  });
}

module.exports = { buildAgent };
