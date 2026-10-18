'use strict';

const { runBackup } = require('../services/backup');
const { DAY_MS } = require('../config/limits');

/** מתזמן גיבוי יומי של המסד (ראשון דקה אחרי העלייה); לא רץ במסד זמני בזיכרון או כש-AUTO_BACKUP=0. */
function scheduleBackups(config) {
  if (config.dbPath === ':memory:' || !config.backup.enabled) return;
  const tick = () => {
    try { console.log('backup:', runBackup(config.dbPath, config.backup.keep)); } catch (e) { console.error('backup failed:', e.code || e.name); }
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, DAY_MS).unref();
}

module.exports = { scheduleBackups };
