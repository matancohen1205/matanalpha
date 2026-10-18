'use strict';

const { limitWhen } = require('../middleware/rate-limits');

/** מחבר /account (חשבונות וכספת); כל POST מוגבל במגביל ההתחברות הנפרד. */
function mountAccount(api, { services, limiters }) {
  api.use('/account', limitWhen((req) => req.method === 'POST', limiters.auth), services.accounts.delegate);
}

module.exports = { mountAccount };
