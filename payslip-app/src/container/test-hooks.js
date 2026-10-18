'use strict';

/** מחבר ל-app את "ווי הבדיקות" (החלפת שירותים ופתיחת ה-store) שהבדיקות האוטומטיות משתמשות בהם. */
function attachTestHooks(app, container) {
  const { services, store } = container;
  app.store = store;
  app.setBilling = (opts) => { services.billing.rebuild(opts); };
  app.setWhatsApp = (over) => services.whatsapp.rebuild(over);
  app.setSupport = (over) => services.support.rebuild(over);
  app.setAgent = (over) => services.agent.rebuild(over);
  app.setAdmin = (over) => services.admin.rebuild(over);
  app.setAccounts = (over) => services.accounts.rebuild(over);
}

module.exports = { attachTestHooks };
