'use strict';

/** מחבר /whatsapp (חיבור ובוט וואטסאפ, כולל ה-webhook של Meta). */
function mountWhatsApp(api, { services }) {
  api.use('/whatsapp', services.whatsapp.delegate);
}

module.exports = { mountWhatsApp };
