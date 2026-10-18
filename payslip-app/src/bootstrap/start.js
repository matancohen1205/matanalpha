'use strict';

const { ensureLangDir } = require('../extract');
const { startBackgroundJobs } = require('../jobs');
const { SERVER } = require('../config/limits');

/** מגדיר timeouts ותקרות חיבורים נגד slowloris וחיבורים תקועים. */
function applyServerLimits(server) {
  Object.assign(server, SERVER);
}

/** מפעיל את השרת: מכין נתוני שפה ל-OCR, מאזין לפורט, מגביל חיבורים ומפעיל משימות רקע. */
function startServer(app) {
  const { config } = app.container;
  ensureLangDir();
  const server = app.listen(config.port, () => console.log(`Payslip app listening on http://localhost:${config.port}`));
  applyServerLimits(server);
  startBackgroundJobs(app.container);
  return server;
}

module.exports = { startServer };
