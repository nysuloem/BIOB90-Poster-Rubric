FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js rubric.js ./
COPY public ./public

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
