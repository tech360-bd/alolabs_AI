# ============================================================
# ALO Labs AI-EOS — Production Dockerfile
# Multi-stage build: deps → build → production
# Node 20 Alpine, non-root user, health check
# ============================================================

# ── Stage 1: Dependencies ────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# ── Stage 2: Build ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests and install ALL deps (including dev)
COPY package.json package-lock.json* ./
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the Next.js application
# (standalone output should be configured in next.config.js)
ENV NODE_ENV=production
RUN npm run build

# ── Stage 3: Production ──────────────────────────────────────
FROM node:20-alpine AS runner

# Security: create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3011
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone build output
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./

# Copy static assets
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

# Copy Prisma schema and engine
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.prisma ./node_modules/.prisma

# Create directories for data, logs, backups
RUN mkdir -p /app/data /app/logs /app/backups /app/db /app/storage && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3011

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3011/api/health || exit 1

# Start the application (standalone mode uses server.js)
CMD ["node", "server.js"]
