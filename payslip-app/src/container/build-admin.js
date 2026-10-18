'use strict';

const { createAdmin } = require('../routes/admin');

/** בונה את ממשק האדמין; בלי ADMIN_PASSWORD (12+ תווים) הוא כבוי. */
function buildAdmin({ config, store, tokenSecret }, over = {}) {
  return createAdmin({ store, password: config.adminPassword, secret: tokenSecret, secure: config.isProd, ...over });
}

module.exports = { buildAdmin };
