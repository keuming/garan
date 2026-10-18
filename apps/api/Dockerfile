FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT:-4000}/health || exit 1
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
