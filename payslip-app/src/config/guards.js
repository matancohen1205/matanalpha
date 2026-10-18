'use strict';

/** מונע הפעלה של דגלי פיתוח (פתיחת Pro חינם, נתיב סימולציה) בסביבת אירוח אמיתית. */
function assertNoDevFlagsInHosting(config) {
  const { env, hosted } = config;
  if ((env.PRO_DEV_UNLOCK === '1' || env.WA_DEV === '1') && hosted) {
    throw new Error('PRO_DEV_UNLOCK / WA_DEV must not be enabled in a hosted or production environment');
  }
}

/** דורש הגדרות חובה לוואטסאפ אמיתי בפרודקשן. */
function assertWhatsAppConfig(config) {
  const { isProd, wa, dataKey, env } = config;
  if (isProd && wa.real && (!dataKey || !wa.appSecret || !wa.verifyToken || !(env.DB_PATH || env.WA_DB_PATH))) {
    throw new Error('DATA_KEY, WA_APP_SECRET, WA_VERIFY_TOKEN and DB_PATH are required when WhatsApp is enabled in production');
  }
}

/** דורש מסד נתונים קבוע ומפתח הצפנה בפרודקשן (אחרת חשבונות ופניות היו נמחקים בכל הפעלה). */
function assertPersistentStorage(config) {
  if (config.isProd && config.dbPath === ':memory:') throw new Error('DB_PATH is required in production (use a persistent disk, e.g. /data/app.db)');
  if (config.isProd && !config.dataKey) throw new Error('DATA_KEY is required in production');
}

/** מריץ את כל בדיקות הבטיחות בעלייה, בסדר קבוע. */
function assertSafeConfig(config) {
  assertNoDevFlagsInHosting(config);
  assertWhatsAppConfig(config);
  assertPersistentStorage(config);
}

module.exports = { assertSafeConfig };
