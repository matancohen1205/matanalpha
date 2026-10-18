'use strict';

const { buildCatalog } = require('./catalog');
const { createStripeGateway } = require('./stripe-gateway');
const { createProToken } = require('./pro-token');
const { createProChecker } = require('./pro-checker');
const { createRecoveryService } = require('./recovery');

/** מרכיב את שירותי המנוי: קטלוג, שער Stripe, אסימון Pro, בודק מנוי, ושחזור גישה. */
function createBillingService(opts) {
  const { stripe, secret, publicUrl, devUnlock = false, once, mailer = null, mailFrom, throttle } = opts;
  const gateway = createStripeGateway({ stripe, publicUrl });
  return {
    gateway,
    catalog: buildCatalog(opts),
    proToken: createProToken({ secret }),
    isProCid: createProChecker({ gateway, devUnlock }),
    recovery: createRecoveryService({ gateway, secret, throttle, once, mailer, mailFrom, publicUrl }),
    once,
    publicUrl,
    devUnlock,
    priceLabel: opts.priceLabel,
  };
}

module.exports = { createBillingService };
