'use strict';

const express = require('express');
const compression = require('compression');
const { createContainer } = require('./container');
const { attachTestHooks } = require('./container/test-hooks');
const { securityHeaders, permissionsPolicy } = require('./middleware/security-headers');
const { originGuard } = require('./middleware/origin-guard');
const { apiTimeout } = require('./middleware/api-timeout');
const { httpsRedirect } = require('./middleware/https-redirect');
const { apiNotFound, notFound, errorHandler } = require('./middleware/error-handlers');
const { createWellKnownRouter } = require('./routes/well-known.routes');
const { mountHealth } = require('./routes/health.routes');
const { createPagesRouter } = require('./routes/pages.routes');
const { createApiRouter } = require('./routes/api.router');

/** מגדיר הקשחה כללית של Express (בלי x-powered-by, פרסור query פשוט, בלי etag, אמון בפרוקסי). */
function applyAppSettings(app, config) {
  app.disable('x-powered-by');
  app.set('query parser', 'simple'); // בלי אובייקטים מקוננים מפרמטרי URL
  app.set('etag', false);
  if (config.trustProxy) app.set('trust proxy', config.trustProxy); // כדי שמגבלת הקצב תזהה IP אמיתי
}

/**
 * בונה את אפליקציית Express: יוצר את מיכל השירותים, ומחבר middleware וראוטרים בסדר הנכון.
 * @returns {import('express').Express} app עם ווי בדיקות מחוברים
 */
function createApp() {
  const container = createContainer();
  const { config } = container;
  const app = express();
  applyAppSettings(app, config);

  app.use(securityHeaders(config.isProd));
  app.use(permissionsPolicy);
  app.use('/api', originGuard, apiTimeout);
  app.use(createWellKnownRouter(config));
  if (config.isProd) app.use(httpsRedirect);
  app.use(compression()); // דחיסת HTML/CSS/JS/JSON
  mountHealth(app);
  app.use(createPagesRouter(config.siteOrigin));
  app.use('/api', createApiRouter(container));
  app.use('/api', apiNotFound);
  app.use(notFound);
  app.use(errorHandler);

  attachTestHooks(app, container);
  app.container = container; // גישה להפעלה (bootstrap) ולמשימות רקע
  return app;
}

module.exports = { createApp };
