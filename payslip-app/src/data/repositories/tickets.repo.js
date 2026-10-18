'use strict';

const YEAR_MS = 365 * 24 * 3600 * 1000;

/** מאגר פניות שירות לקוחות (תוכן מוצפן). */
function createTicketsRepo(db, { encrypt, decrypt }) {
  const q = {
    add: db.prepare('INSERT INTO tickets (created_at, data_enc) VALUES (?, ?)'),
    list: db.prepare('SELECT id, created_at, status, data_enc FROM tickets ORDER BY id DESC LIMIT ?'),
    setStatus: db.prepare('UPDATE tickets SET status = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM tickets WHERE id = ?'),
    purge: db.prepare('DELETE FROM tickets WHERE created_at < ?'),
  };
  return {
    /** שומר פנייה ומחזיר את מזהה הפנייה. */
    addTicket: (data, now = Date.now()) => Number(q.add.run(now, encrypt(JSON.stringify(data))).lastInsertRowid),
    /** מחזיר את הפניות האחרונות מפוענחות, מהחדשה לישנה. */
    listTickets: (limit = 50) => q.list.all(limit).map((r) => ({ id: Number(r.id), createdAt: Number(r.created_at), status: r.status, ...JSON.parse(decrypt(r.data_enc)) })),
    setTicketStatus: (id, status) => q.setStatus.run(status, id),
    /** מוחק פנייה; מחזיר כמה שורות נמחקו (0 או 1). */
    deleteTicket: (id) => Number(q.del.run(id).changes),
    /** מוחק פניות ישנות משנה. */
    purgeOldTickets: (now) => q.purge.run(now - YEAR_MS),
  };
}

module.exports = { createTicketsRepo };
