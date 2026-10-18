'use strict';

const { limitWhen } = require('../../middleware/rate-limits');

/** מחבר /billing; כל POST מוגבל בקצב כבד, חוץ מנתיב ההפעלה לפיתוח. */
function mountBilling(api, { services, limiters }) {
  const isHeavyPost = (req) => req.method === 'POST' && req.path !== '/dev-activate';
  api.use('/billing', limitWhen(isHeavyPost, limiters.heavy), services.billing.delegate);
}

module.exports = { mountBilling };
