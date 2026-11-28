#!/usr/bin/env bash
# ============================================================
# ALO Labs AI-EOS — Production Deployment Script
# Steps: git pull → npm install → prisma migrate → npm run build → pm2 restart
# Usage: bash scripts/deploy.sh
# ============================================================
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────────────
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }

# ── Project directory ───────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PM2_APP_NAME="alolabs-agentos"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$PROJECT_DIR" || error "Cannot cd to ${PROJECT_DIR}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ALO Labs AgentOS — Deployment${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "  Branch:   ${BRANCH}"
echo -e "  Dir:      ${PROJECT_DIR}"
echo -e "  Time:     $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ============================================================
# 1. Git Pull
# ============================================================
info "Pulling latest code from origin/${BRANCH}..."
git fetch origin "${BRANCH}" || error "git fetch failed"
git checkout "${BRANCH}"     || error "git checkout failed"
git pull --ff-only origin "${BRANCH}" || error "git pull failed"
success "Code updated"

# ============================================================
# 2. Install Dependencies
# ============================================================
info "Installing locked dependencies..."
npm ci --no-audit || error "npm ci failed"
success "Dependencies installed"

# ============================================================
# 3. Generate Production MySQL Prisma Client
# ============================================================
info "Generating Prisma client..."
npm run db:generate:mysql || error "db:generate:mysql failed"
success "Prisma client generated"

# ============================================================
# 4. Build Application
# ============================================================
info "Building application..."
NODE_ENV=production npm run build || error "npm run build failed"
success "Build complete"

# ============================================================
# 5. PM2 Restart
# ============================================================
info "Restarting PM2 process: ${PM2_APP_NAME}..."

if ! command -v pm2 &>/dev/null; then
    error "PM2 is not installed — install with: npm install -g pm2"
fi

if pm2 describe "$PM2_APP_NAME" &>/dev/null; then
    pm2 restart "$PM2_APP_NAME" --update-env || error "pm2 restart failed"
    success "PM2 process restarted: ${PM2_APP_NAME}"
else
    pm2 start ecosystem.config.js || error "pm2 start failed"
    success "PM2 process started: ${PM2_APP_NAME}"
fi

pm2 save || warn "pm2 save failed"

# ============================================================
# 6. Health Check
# ============================================================
info "Waiting for application to become healthy..."
HEALTH_URL="http://127.0.0.1:${PORT:-3011}/api/health/ready"
MAX_RETRIES=15
RETRY_DELAY=2

for i in $(seq 1 $MAX_RETRIES); do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        success "Application is healthy!"
        break
    fi
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        warn "Application did not become healthy within $((MAX_RETRIES * RETRY_DELAY))s"
        warn "Check logs: pm2 logs ${PM2_APP_NAME}"
    else
        sleep $RETRY_DELAY
    fi
done

# ============================================================
# 7. Deployment Summary
# ============================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment Complete${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "  Time:     $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo -e "  Project:  ${PROJECT_DIR}"
echo -e "  Branch:   ${BRANCH}"
echo -e "  PM2 App:  ${PM2_APP_NAME}"
echo -e "  PID:      $(pm2 pid "$PM2_APP_NAME" 2>/dev/null || echo 'N/A')"
echo -e "  Health:   ${HEALTH_URL}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
success "Deployment successful!"
