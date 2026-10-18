'use strict';

/** קורא עוגייה בשם נתון מכותרת הבקשה (מפוענחת), או null אם אינה קיימת. */
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

module.exports = { readCookie };
