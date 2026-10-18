'use strict';

/** מחבר /admin (ממשק ניהול הפניות; כבוי בלי ADMIN_PASSWORD). */
function mountAdmin(api, { services }) {
  api.use('/admin', services.admin.delegate);
}

module.exports = { mountAdmin };
