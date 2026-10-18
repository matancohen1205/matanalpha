'use strict';

const { checkSmtp } = require('./smtp-check.job');
const { scheduleBackups } = require('./backup.job');
const { scheduleCleanup } = require('./cleanup.job');
const { scheduleReminders } = require('./reminders.job');

/** מפעיל את כל משימות הרקע של השרת (בדיקת SMTP, גיבוי, ניקוי, תזכורות). */
function startBackgroundJobs(container) {
  const { config, store, mailer, services } = container;
  checkSmtp(mailer);
  scheduleBackups(config);
  scheduleCleanup(store);
  scheduleReminders({ config, store, whatsapp: services.whatsapp });
}

module.exports = { startBackgroundJobs };
