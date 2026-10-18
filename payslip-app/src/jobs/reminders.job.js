'use strict';

/** מתזמן תזכורות וואטסאפ (כל 6 שעות) כשהוגדרה תבנית והשירות פעיל. מניח מופע שרת יחיד. */
function scheduleReminders({ config, store, whatsapp }) {
  const template = config.wa.reminderTemplate;
  if (!template || !whatsapp.current.configured) return;
  const tick = () => {
    store.cleanup();
    whatsapp.current.engine.runReminders({ template }).catch((e) => console.error('reminders failed:', e.name));
  };
  setInterval(tick, 6 * 3600 * 1000).unref();
}

module.exports = { scheduleReminders };
