#!/bin/sh
# מריץ את האפליקציה כמשתמש לא-מורשה. כרכים קבועים (Render/Fly) מגיעים בבעלות root, לכן מתקנים הרשאות לפני הורדת ההרשאות.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R node:node /data 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
