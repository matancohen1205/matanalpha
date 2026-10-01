FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# הכנת קבצי השפה של ה-OCR בזמן הבנייה, ואז הרצה כמשתמש לא-מורשה
RUN node -e "require('./src/extract').ensureLangDir()" && mkdir -p /data && chown -R node:node /app /data
ENV WA_DB_PATH=/data/whatsapp.db
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
