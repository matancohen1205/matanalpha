'use strict';

/** בודק חיבור SMTP בעלייה ומדפיס ללוג אם מיילים יישלחו (כשל מופיע מיד ולא רק כשמשתמש מבקש איפוס). */
function checkSmtp(mailer) {
  if (!mailer) {
    console.warn('SMTP_URL is not set: password recovery and verification emails are disabled');
    return;
  }
  mailer.verify().then(
    () => console.log('SMTP: connected, password recovery emails are enabled'),
    (e) => console.error('SMTP: connection failed, emails will NOT be delivered:', e.code || e.message)
  );
}

module.exports = { checkSmtp };
