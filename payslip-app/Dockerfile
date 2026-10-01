FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# קבצי השפה של ה-OCR נארזים בזמן הבנייה (בלי הורדה בזמן ריצה)
RUN node -e "require('./src/extract').ensureLangDir()" && mkdir -p /data && chown -R node:node /app /data
ENV DB_PATH=/data/app.db
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# מתחיל כ-root רק כדי לתקן הרשאות כרך, ואז רץ כ-node
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
