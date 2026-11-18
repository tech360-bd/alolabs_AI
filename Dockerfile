# syntax=docker/dockerfile:1
# Production image: MySQL/MariaDB. The SQLite adapter is a local test tool.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY mini-services/queue-service/package.json ./mini-services/queue-service/
COPY mini-services/realtime-service/package.json ./mini-services/realtime-service/
COPY scripts/typecheck/package.json ./scripts/typecheck/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run db:generate:mysql
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/* \
    && mkdir -p data storage db/backups logs && chown -R node:node /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
ENV PORT=3011
COPY --from=builder --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3011
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
