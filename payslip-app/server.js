'use strict';

const { createApp } = require('./src/app');
const { startServer } = require('./src/bootstrap/start');

const app = createApp();

// הרצה ישירה (node server.js) מפעילה האזנה; ייבוא (בבדיקות) מחזיר רק את האפליקציה
if (require.main === module) startServer(app);

module.exports = app;
