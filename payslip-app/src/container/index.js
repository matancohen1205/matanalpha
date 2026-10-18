'use strict';

const { readConfig, resolveTokenSecret } = require('../config/env');
const { assertSafeConfig } = require('../config/guards');
const { createStore } = require('../data/store');
const { createSwappable } = require('./swappable');
const { buildBillingConfig, buildBilling } = require('./build-billing');
const { buildWhatsApp } = require('./build-whatsapp');
const { buildSupport } = require('./build-support');
const { buildAgent } = require('./build-agent');
const { buildAdmin } = require('./build-admin');
const { buildAccounts } = require('./build-accounts');

/** יוצר שולח מייל (SMTP) משותף, או null כשלא הוגדר SMTP_URL. */
function createMailer(config) {
  return config.smtpUrl ? require('nodemailer').createTransport(config.smtpUrl) : null;
}

/**
 * שורש ההרכבה: קורא הגדרות, בודק בטיחות, יוצר מסד ושירותים ומחבר ביניהם.
 * כל שירות עטוף ב-swappable כדי שבדיקות יוכלו להחליף אותו.
 */
function createContainer(env = process.env) {
  const config = readConfig(env);
  assertSafeConfig(config);
  const store = createStore({ path: config.dbPath, key: config.dataKey });
  const tokenSecret = resolveTokenSecret(env, config.isProd);
  const mailer = createMailer(config);
  const billingConfig = buildBillingConfig(config, { store, tokenSecret, mailer });

  const billing = createSwappable((over) => buildBilling(billingConfig, over));
  const base = { config, store, tokenSecret, billingConfig, billing, mailer };
  const whatsapp = createSwappable((over) => buildWhatsApp(base, over));
  const support = createSwappable((over) => buildSupport(base, over));
  const agent = createSwappable((over) => buildAgent(base, over));
  const admin = createSwappable((over) => buildAdmin(base, over));
  const accounts = createSwappable((over) => buildAccounts(base, over));

  return { config, store, tokenSecret, billingConfig, mailer, services: { billing, whatsapp, support, agent, admin, accounts } };
}

module.exports = { createContainer };
