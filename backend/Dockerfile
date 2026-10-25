FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# npm ci dès que package-lock.json est versionné
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY config ./config
COPY src ./src
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]
