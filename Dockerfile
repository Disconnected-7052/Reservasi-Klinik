FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY services ./services
COPY gateway ./gateway
COPY frontend ./frontend
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "gateway/index.js"]
