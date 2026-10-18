'use strict';

const { deriveDataKey } = require('./data-key');
const { createCipher } = require('./cipher');
const { openDatabase } = require('./schema');
const { createUsersRepo, MAX_SNAPSHOTS } = require('./repositories/users.repo');
const { createTicketsRepo } = require('./repositories/tickets.repo');
const { createThrottleRepo } = require('./repositories/throttle.repo');
const { createAccountsRepo } = require('./repositories/accounts.repo');
const { createSessionsRepo } = require('./repositories/sessions.repo');
const { createVaultsRepo } = require('./repositories/vaults.repo');

/**
 * חזית שכבת הנתונים: פותחת את המסד, יוצרת הצפנה ומאגרים, ומציגה API אחיד.
 * מה נשמר: טלפון מוצפן + גיבוב, מזהה לקוח, תמונות מצב (סעיף/סוג/סכום בלבד), פניות, חשבונות וכספות מוצפנות.
 */
function createStore({ path = ':memory:', key } = {}) {
  const cipher = createCipher(deriveDataKey(key));
  const db = openDatabase(path);
  const users = createUsersRepo(db, cipher);
  const tickets = createTicketsRepo(db, cipher);
  const throttle = createThrottleRepo(db, cipher);
  const accounts = createAccountsRepo(db);
  const sessions = createSessionsRepo(db);
  const vaults = createVaultsRepo(db);

  return {
    db,
    encrypt: cipher.encrypt,
    decrypt: cipher.decrypt,
    hash: cipher.hash,
    accounts, sessions, vaults, // מאגרים לשירות החשבונות
    ...users,
    ...tickets,
    useNonce: throttle.useNonce,
    firstSight: throttle.firstSight,
    bump: throttle.bump,
    /** ניקוי תקופתי: פניות ישנות, סשנים שפגו ורשומות הגנה זמניות. */
    cleanup(now = Date.now()) {
      tickets.purgeOldTickets(now);
      sessions.purgeExpired(now);
      throttle.purge(now);
    },
    close: () => db.close(),
  };
}

module.exports = { createStore, MAX_SNAPSHOTS };
