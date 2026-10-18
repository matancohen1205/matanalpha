'use strict';

const express = require('express');
const { compareSlips } = require('../compare');

/** מחבר POST /compare: השוואת תלושים למנויי Pro בלבד, החישוב בשרת. */
function mountCompare(api, { services }) {
  const requirePro = (req, res, next) => services.billing.current.requirePro(req, res, next);
  api.post('/compare', requirePro, express.json({ limit: '300kb' }), (req, res) => {
    try {
      res.json({ ok: true, ...compareSlips(req.body) });
    } catch {
      res.status(400).json({ error: 'BAD_INPUT', message: 'נדרשים לפחות שני תלושים תקינים (עד 12).' });
    }
  });
}

module.exports = { mountCompare };
