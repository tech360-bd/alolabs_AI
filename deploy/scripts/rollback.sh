#!/usr/bin/env bash
# ============================================================
# ALO Labs Agent Hub — Rollback Script
# Usage: sudo bash rollback.sh [--commit SHA] [--backup-id ID]
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_USER="alohub"
APP_DIR="/opt/alolabs/agent-hub"
SERVICE_NAME="alolabs-agent-hub"
TARGET_COMMIT=""
BACKUP_ID=""
HEALTH_TIMEOUT=60

# ── Parse arguments ──────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --commit)      shift; TARGET_COMMIT="$1" ;;
        --backup-id)   shift; BACKUP_ID="$1" ;;
        --help|-h)
            echo "Usage: sudo bash rollback.sh [--commit SHA] [--backup-id ID]"
            echo ""
            echo "  --commit      Git commit SHA to rollback to"
            echo "  --backup-id   Backup ID to restore from"
            echo ""
            echo "If neither is specified, rolls back to the previous deploy commit."
            exit 0
            ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ROLLBACK][$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[ROLLBACK][WARN]${NC} $*"; }
fail() { echo -e "${RED}[ROLLBACK][ERROR]${NC} $*"; exit 1; }
ok()   { echo -e "  ${GREEN}✅${NC} $*"; }

if [[ $EUID -ne 0 ]]; then fail "This script must be run as root."; fi
if [[ ! -d "${APP_DIR}" ]]; then fail "App directory not found: ${APP_DIR}"; fi

log "============================================================"
log "ALO Labs Agent Hub — Rollback"
log "============================================================"

# ── Determine rollback target ────────────────────────────────
CURRENT_COMMIT=$(cd "${APP_DIR}" && git rev-parse HEAD 2>/dev/null || echo "unknown")

if [[ -n "${TARGET_COMMIT}" ]]; then
    # Validate commit exists
    if ! cd "${APP_DIR}" && git cat-file -t "${TARGET_COMMIT}" &>/dev/null; then
        fail "Commit ${TARGET_COMMIT} not found in repository."
    fi
    ROLLBACK_TO="${TARGET_COMMIT}"
elif [[ -n "${BACKUP_ID}" ]]; then
    BACKUP_PATH="${APP_DIR}/backups/${BACKUP_ID}"
    if [[ ! -d "${BACKUP_PATH}" ]]; then
        fail "Backup not found: ${BACKUP_PATH}"
    fi
    if [[ -f "${BACKUP_PATH}/commit.txt" ]]; then
        ROLLBACK_TO=$(cat "${BACKUP_PATH}/commit.txt")
    else
        fail "Backup ${BACKUP_ID} does not contain commit.txt"
    fi
else
    # Use previous deploy commit
    if [[ -f "${APP_DIR}/.deploy-previous-commit" ]]; then
        ROLLBACK_TO=$(cat "${APP_DIR}/.deploy-previous-commit")
    else
        fail "No previous commit found. Use --commit or --backup-id to specify target."
    fi
fi

log "Current commit:   ${CURRENT_COMMIT:0:8}"
log "Rollback target:  ${ROLLBACK_TO:0:8}"
log ""

if [[ "${CURRENT_COMMIT}" == "${ROLLBACK_TO}" ]]; then
    warn "Already at target commit. Nothing to rollback."
    exit 0
fi

# ── Confirmation prompt ──────────────────────────────────────
echo -e "${YELLOW}⚠️  WARNING: This will rollback the application to a previous version.${NC}"
echo -e "${YELLOW}   Current: ${CURRENT_COMMIT:0:8} → Target: ${ROLLBACK_TO:0:8}${NC}"
read -rp "Are you sure? [y/N] " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
    log "Rollback cancelled by user."
    exit 0
fi

# ── Step 1: Create rollback backup point ─────────────────────
log "[Step 1/4] Creating safety backup before rollback..."
SAFE_BACKUP="${APP_DIR}/backups/pre_rollback_$(date '+%Y%m%d_%H%M%S')"
mkdir -p "${SAFE_BACKUP}"

if [[ -d "${APP_DIR}/.next" ]]; then
    cp -a "${APP_DIR}/.next" "${SAFE_BACKUP}/.next.bak" 2>/dev/null || true
fi
if [[ -f "${APP_DIR}/.env" ]]; then
    cp "${APP_DIR}/.env" "${SAFE_BACKUP}/.env.bak" 2>/dev/null || true
fi
echo "${CURRENT_COMMIT}" > "${SAFE_BACKUP}/commit.txt"
ok "Safety backup: ${SAFE_BACKUP}"

# ── Step 2: Reset to target commit ───────────────────────────
log "[Step 2/4] Resetting to target commit..."
cd "${APP_DIR}"

if ! su - "${APP_USER}" -c "cd ${APP_DIR} && git reset --hard ${ROLLBACK_TO}" 2>/dev/null; then
    fail "Git reset to ${ROLLBACK_TO} failed."
fi
ok "Code reset to ${ROLLBACK_TO:0:8}"

# ── Step 3: Reinstall deps and rebuild ───────────────────────
log "[Step 3/4] Reinstalling dependencies..."
su - "${APP_USER}" -c "cd ${APP_DIR} && bun install --frozen-lockfile" 2>/dev/null \
    || su - "${APP_USER}" -c "cd ${APP_DIR} && bun install" 2>/dev/null \
    || fail "Dependency installation failed during rollback."
ok "Dependencies installed"

log "  Rebuilding application..."
if ! su - "${APP_USER}" -c "cd ${APP_DIR} && NODE_ENV=production bun run build" 2>&1; then
    fail "Build failed during rollback. Manual intervention required."
fi
ok "Build completed"

# ── Step 4: Restart and health check ─────────────────────────
log "[Step 4/4] Restarting service..."
systemctl restart "${SERVICE_NAME}"

HEALTH_START=$(date +%s)
HEALTHY=false

while [[ $(( $(date +%s) - HEALTH_START )) -lt ${HEALTH_TIMEOUT} ]]; do
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:3011/api/health" 2>/dev/null || echo "000")
        if [[ "${HTTP_CODE}" == "200" ]]; then
            HEALTHY=true
            break
        fi
    fi
    sleep 2
done

if [[ "${HEALTHY}" != "true" ]]; then
    fail "Rollback complete but service is unhealthy. Check: journalctl -u ${SERVICE_NAME} -n 50"
fi

ok "Service is healthy"

# ── Summary ──────────────────────────────────────────────────
log ""
log "============================================================"
log "✅ ROLLBACK COMPLETE"
log "============================================================"
log "From:   ${CURRENT_COMMIT:0:8}"
log "To:     ${ROLLBACK_TO:0:8}"
log ""
log "Safety backup: ${SAFE_BACKUP}"
log "Commands:"
log "  View logs:  journalctl -u ${SERVICE_NAME} -f"