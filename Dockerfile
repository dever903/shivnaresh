FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["node", "server/index.mjs"]
