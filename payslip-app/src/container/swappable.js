'use strict';

/**
 * עוטף שירות שאפשר להחליף בזמן ריצה (לבדיקות) בלי לשנות את הראוטרים שמשתמשים בו.
 * @param {(over?: object) => object} build  בונה מופע חדש של השירות
 */
function createSwappable(build) {
  const holder = {
    current: build(),
    /** בונה מופע חדש עם override ומחליף את הנוכחי; מחזיר אותו. */
    rebuild(over) {
      holder.current = build(over);
      return holder.current;
    },
    /** middleware שמעביר כל בקשה ל-router של המופע הנוכחי. */
    delegate: (req, res, next) => holder.current.router(req, res, next),
  };
  return holder;
}

module.exports = { createSwappable };
