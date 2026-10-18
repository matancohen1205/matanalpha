'use strict';

const { DAY_MS } = require('../config/limits');

/** מתזמן ניקוי יומי של נתונים זמניים ופניות ישנות. */
function scheduleCleanup(store) {
  setInterval(() => store.cleanup(), DAY_MS).unref();
}

module.exports = { scheduleCleanup };
