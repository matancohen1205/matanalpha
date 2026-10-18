'use strict';

/** לקוח לפיתוח מקומי: מדפיס הודעות במקום לשלוח. */
function createDevClient(log = console.log) {
  return {
    sendText: async (to, text) => log(`[WA dev] → ${to}\n${text}\n`),
    sendTemplate: async (to, name) => log(`[WA dev] → ${to} (template ${name})`),
    downloadMedia: async () => {
      throw new Error('no media in dev client');
    },
  };
}


module.exports = { createDevClient };
