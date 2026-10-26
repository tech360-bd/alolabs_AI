# ============================================================
# ALO Labs AgentOS — Production Dockerfile
# Multi-stage build: deps → build → production
#
# Base image notes (important):
#   All three stages use node:20-slim (Debian bookworm, glibc, OpenSSL 3.0) so
#   that native addons and the Prisma query engine share one ABI:
#     - prisma/schema.prisma declares binaryTargets = ["native",
#       "debian-openssl-3.0.x"], which is a glibc/OpenSSL-3.0 binary. It will
#       NOT load on Alpine (musl). Mixing an Alpine builder with this target
#       produced an image whose Prisma engine could not start.
#     - bcrypt and better-sqlite3 are compiled/prebuilt per libc, so building
#       them on musl and running them on glibc fails at require() time.
#
# Runtime dependency notes (verified against a real build):
#   next.config.ts lists bcrypt, sharp, mysql2, better-sqlite3 and pg in
#   `serverExternalPackages`. That stops Next.js BUNDLING them, but its output
#   file tracing still copies them into .next/standalone/node_modules — along
#   with @prisma/client, the query engine binary, bindings and
#   file-uri-to-path. So they need no special handling here.
#
#   The one real gap is the Prisma driver adapter: src/lib/db.ts pulls it in
#   with a lazy require() inside the PRISMA_SQLITE_ADAPTER branch, which static
#   tracing cannot see. Stage 3 copies that three-package closure explicitly.
# ============================================================

# ── Stage 1: Dependencies ────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Toolchain for native addons (bcrypt, better-sqlite3) that have no matching
# prebuilt binary and must fall back to node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# ── Stage 2: Build ───────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests and install ALL deps (including dev)
COPY package.json package-lock.json* ./
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Generate the Prisma client.
# Requires reachability to binaries.prisma.sh to fetch the query engine for
# binaryTargets "debian-openssl-3.0.x". For air-gapped builds see
# scripts/dev-generate-client.sh (engine-less client + driver adapter).
RUN npx prisma generate

# Build the Next.js application.
# Uses `npm run build` (not bare `next build`) because the package.json build
# script also copies .next/static and public into .next/standalone — the
# artifacts CI verifies.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────
FROM node:20-slim AS runner

# Security: create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Set production environment.
# PORT 3011 matches package.json scripts, docker-compose*.yml, the Caddyfile
# upstream and deploy/prometheus.yml. Do not change one without the others —
# scripts/validate-compose.mjs enforces agreement in CI.
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3011
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone build output (includes server.js and traced dependencies)
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./

# Copy static assets
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

# Copy the Prisma schema, the generated client, and the query engine.
# `@prisma/client` and the engine binary are already inside the standalone
# output via Next.js file tracing; the schema is copied for `prisma db push`.
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.prisma ./node_modules/.prisma

# Copy the Prisma driver-adapter closure that Next.js tracing does NOT reach.
#
# src/lib/db.ts loads the adapter through a lazy `require()` inside the
# PRISMA_SQLITE_ADAPTER branch, so the bundler's static trace never sees it and
# the standalone output omits these three packages. Without them the engine-less
# SQLite mode documented in src/lib/db.ts fails with MODULE_NOT_FOUND.
#
# Verified closure (each package's own dependencies):
#   @prisma/adapter-better-sqlite3 -> better-sqlite3 (already traced),
#                                     @prisma/driver-adapter-utils
#   @prisma/driver-adapter-utils   -> @prisma/debug
#   @prisma/debug                  -> (none)
#
# Everything else in `serverExternalPackages` — bcrypt, better-sqlite3, mysql2,
# pg, sharp — plus bindings and file-uri-to-path ARE present in the standalone
# output already, so they must not be copied again.
COPY --from=builder --chown=appuser:appgroup /app/node_modules/@prisma/adapter-better-sqlite3 ./node_modules/@prisma/adapter-better-sqlite3
COPY --from=builder --chown=appuser:appgroup /app/node_modules/@prisma/driver-adapter-utils ./node_modules/@prisma/driver-adapter-utils
COPY --from=builder --chown=appuser:appgroup /app/node_modules/@prisma/debug ./node_modules/@prisma/debug

# Create directories for data, logs, backups
RUN mkdir -p /app/data /app/logs /app/backups && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3011

# Health check.
# Uses node's built-in fetch instead of wget/curl: node:20-slim ships neither,
# and this avoids adding a package purely for probing.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+((process.env.PORT||3011))+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the application (standalone mode uses server.js)
CMD ["node", "server.js"]
