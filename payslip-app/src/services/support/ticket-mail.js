'use strict';

const { TOPICS } = require('./topics');

/** מזהה פנייה לתצוגה, למשל T-0012. */
const ticketCode = (id) => 'T-' + String(id).padStart(4, '0');

/** מרכיב את מייל ההתראה לבעל האתר, עם Reply-To אל הפונה. */
function buildTicketMail({ ticket, data, from, to }) {
  return {
    from,
    to,
    replyTo: data.email,
    subject: `[תלוש בעברית] ${TOPICS[data.topic]} (${ticket})`,
    text: `פנייה ${ticket}\nנושא: ${TOPICS[data.topic]}\nשם: ${data.name}\nאימייל: ${data.email}\nטלפון: ${data.phone || '-'}\n\n${data.message}\n`,
  };
}

module.exports = { ticketCode, buildTicketMail };
