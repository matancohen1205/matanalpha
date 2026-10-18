'use strict';

const express = require('express');

/** בונה את תוכן security.txt (RFC 9116) מכתובת הקשר לדיווח על פרצות. */
function buildSecurityTxt(contact, publicUrl) {
  const expires = new Date(Date.now() + 365 * 864e5).toISOString();
  return `Contact: mailto:${contact}\nExpires: ${expires}\nPreferred-Languages: he, en\nCanonical: ${publicUrl}/.well-known/security.txt\n`;
}

/** מחבר /.well-known/security.txt; בלי כתובת קשר מוגדרת מחזיר 404. */
function createWellKnownRouter(config) {
  const router = express.Router();
  router.get('/.well-known/security.txt', (req, res) => {
    if (!config.securityContact) return res.status(404).type('text').send('Not configured');
    res.type('text/plain; charset=utf-8').send(buildSecurityTxt(config.securityContact, config.publicUrl));
  });
  return router;
}

module.exports = { createWellKnownRouter };
