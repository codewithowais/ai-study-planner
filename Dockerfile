# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone output bundles only what the server needs.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# The JSON data store lives on a mounted volume (see docker-compose.yml).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
