FROM node:22-alpine

WORKDIR /app

# Dépendances système pour les healthchecks
RUN apk add --no-cache curl

# Installation des dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev

# Copie du code source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/auth/session || exit 1

CMD ["node", "index.js"]
