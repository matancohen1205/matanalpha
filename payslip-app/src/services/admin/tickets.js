'use strict';

/** שירות ניהול פניות: רשימה, שינוי סטטוס ומחיקה, עם בדיקת קלט. */
function createTicketAdmin(store) {
  const validId = (id) => Number.isInteger(id) && id >= 1;
  return {
    list: () => store.listTickets(200),
    /** מחזיר false אם הקלט שגוי. */
    setStatus(id, status) {
      if (!validId(id) || (status !== 'new' && status !== 'closed')) return false;
      store.setTicketStatus(id, status);
      return true;
    },
    /** מחזיר null אם המזהה שגוי, אחרת האם נמחקה פנייה. */
    remove(id) { return validId(id) ? store.deleteTicket(id) : null; },
  };
}

module.exports = { createTicketAdmin };
