'use strict';

const { createBilling } = require('../billing');

/** מרכיב את הגדרות המנוי והתשלום מתוך ההגדרות הכלליות והתלויות המשותפות. */
function buildBillingConfig(config, { store, tokenSecret, mailer }) {
  const { pricing, publicUrl, isProd } = config;
  return {
    stripe: config.stripeKey ? require('stripe')(config.stripeKey) : null,
    secret: tokenSecret,
    priceId: pricing.priceId,
    priceIdYearly: pricing.priceIdYearly,
    publicUrl,
    priceLabel: pricing.label,
    priceLabelYearly: pricing.labelYearly,
    devUnlock: config.devUnlock,
    secure: isProd,
    once: (key) => store.useNonce(key), // מפתחות חד-פעמיים (מזהה עסקה)
    mailer,
    mailFrom: config.mailFrom,
    throttle: (key) => store.bump(key),
  };
}

/** בונה שירות מנוי; override ממוזג להגדרות (לבדיקות). */
function buildBilling(billingConfig, over = {}) {
  return createBilling({ ...billingConfig, ...over });
}

module.exports = { buildBillingConfig, buildBilling };
