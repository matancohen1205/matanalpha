'use strict';

const { createMailTokens } = require('./mail-tokens');
const { createSafeMailer } = require('./safe-mailer');
const { createSessionService } = require('./session.service');
const { createCredentialsService } = require('./credentials.service');
const { createAccountRecoveryService } = require('./recovery.service');
const { createVaultService } = require('./vault.service');
const { createSubscriptionLinkService } = require('./subscription-link.service');
const mails = require('./account-mails');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // תקרה מוחלטת לסשן

/** מרכיב את שירותי החשבונות מעל מאגרי הנתונים (store.accounts / sessions / vaults). */
function createAccountServices({ store, mailer, mailFrom, secret, publicUrl, idleMs, now = () => Date.now() }) {
  const { accounts, sessions, vaults } = store;
  const cipher = { encrypt: store.encrypt, decrypt: store.decrypt, hash: store.hash };
  const tokens = createMailTokens({ secret, now });
  const mail = createSafeMailer({ mailer, mailFrom });
  const session = createSessionService({ sessions, accounts, now, ttlMs: SESSION_TTL_MS, idleMs });
  const deps = { accounts, sessions: session, vaults, cipher, tokens, mail, mails, publicUrl, now, store };
  return {
    sessionTtlMs: SESSION_TTL_MS,
    session,
    mail,
    tokens,
    accounts,
    cipher,
    credentials: createCredentialsService(deps),
    recovery: createAccountRecoveryService(deps),
    vault: createVaultService(deps),
    subscription: createSubscriptionLinkService(deps),
  };
}

module.exports = { createAccountServices };
