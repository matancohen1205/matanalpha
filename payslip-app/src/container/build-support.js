'use strict';

const { createSupport } = require('../routes/support');

/** בונה את שירות פניות הלקוחות (טופס יצירת קשר ופרטי קשר ציבוריים). */
function buildSupport({ config, store, mailer }, over = {}) {
  return createSupport({ store, mailer, publicUrl: config.publicUrl, config: config.support, ...over });
}

module.exports = { buildSupport };
