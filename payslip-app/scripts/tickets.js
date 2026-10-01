'use strict';
/**
 * הצגת פניות שירות לקוחות מהמסד (מפוענחות).
 *   DB_PATH=/data/app.db DATA_KEY=<hex> node scripts/tickets.js [כמות]
 *   node scripts/tickets.js close 12      סימון פנייה כטופלה
 */
const { createStore } = require('../src/store');
const path = process.env.DB_PATH || process.env.WA_DB_PATH;
const key = process.env.DATA_KEY || process.env.WA_DATA_KEY;
if (!path || !key) {
  console.error('נדרשים DB_PATH ו-DATA_KEY');
  process.exit(1);
}
const store = createStore({ path, key });
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'close') {
  store.setTicketStatus(Number(arg), 'closed');
  console.log('נסגרה פנייה', arg);
} else {
  for (const t of store.listTickets(Number(cmd) || 30)) {
    console.log(`\n#${t.id} [${t.status}] ${new Date(t.createdAt).toLocaleString('he-IL')}  ${t.topic}\n${t.name} <${t.email}> ${t.phone || ''}\n${t.message}`);
  }
}
