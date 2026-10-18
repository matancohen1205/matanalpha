'use strict';

const SUPPORT_PATHS = new Set(['/site-config', '/contact']);

/** מחבר את נתיבי שירות הלקוחות הציבוריים (/site-config ו-/contact) בלבד; שאר הנתיבים ממשיכים הלאה. */
function mountSupport(api, { services }) {
  api.use((req, res, next) => (SUPPORT_PATHS.has(req.path) ? services.support.delegate(req, res, next) : next()));
}

module.exports = { mountSupport };
