'use strict';

/** קישור מנוי Pro (מזהה לקוח מוצפן) לחשבון, כדי ש-Pro יופעל אוטומטית בהתחברות. */
function createSubscriptionLinkService({ accounts, cipher }) {
  return {
    /** מקשר את מזהה הלקוח לחשבון. */
    link: (accId, cid) => accounts.setSubscriptionCid(accId, cipher.encrypt(cid)),
    /** מנתק את המנוי מהחשבון. */
    unlink: (accId) => accounts.setSubscriptionCid(accId, null),
  };
}

module.exports = { createSubscriptionLinkService };
