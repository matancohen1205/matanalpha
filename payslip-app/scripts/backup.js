'use strict';
// גיבוי עקבי של מסד הנתונים (SQLite VACUUM INTO). שימוש: DB_PATH=/data/app.db node scripts/backup.js [תיקיית יעד]
// הקובץ המגובה מכיל נתונים מוצפנים, אך DATA_KEY נדרש לשחזור: שמרו אותו בנפרד ובמקום בטוח.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const src = process.env.DB_PATH;
if (!src) { console.error('DB_PATH חסר'); process.exit(1); }
const dir = process.argv[2] || path.dirname(src);
const dest = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
console.log('backup written:', dest);
