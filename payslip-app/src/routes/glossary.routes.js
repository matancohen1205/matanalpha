'use strict';

const { GLOSSARY } = require('../glossary');

/** מחזיר רק את שדות המילון שהלקוח צריך (בלי ביטויי הזיהוי הפנימיים). */
function toPublicEntries(glossary) {
  return glossary.map(({ id, type, title, what, why }) => ({ id, type, title, what, why }));
}

/** מחבר GET /glossary עם מטמון של שעה. */
function mountGlossary(api) {
  const list = toPublicEntries(GLOSSARY);
  api.get('/glossary', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(list);
  });
}

module.exports = { mountGlossary };
