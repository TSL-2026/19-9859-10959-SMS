# Stage 1: builder — install production dependencies
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/*

# Stage 2: production — minimal Alpine image
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache curl ca-certificates

COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY server.js ./
COPY public/ ./public/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/uploads && \
    chown -R appuser:appgroup /app && \
    chmod 755 /app/uploads

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
