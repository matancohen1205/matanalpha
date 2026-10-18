'use strict';

/** מחבר GET /healthz לבדיקת בריאות של פלטפורמת האירוח. */
function mountHealth(app) {
  app.get('/healthz', (req, res) => res.type('text').send('ok'));
}

module.exports = { mountHealth };
