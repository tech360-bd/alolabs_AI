#!/usr/bin/env bash
# ============================================================
# Name:        healthcheck.sh
# Description: Health monitoring script for ALO Labs Agent Hub.
#              Checks PM2 process, HTTP health endpoint, disk
#              space, memory usage, database size, and Caddy.
#              Exits 0 if all checks pass, 1 if any fail.
# Usage:       bash scripts/healthcheck.sh
#              Intended for cron or manual monitoring.
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
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }

# Track overall health — any failure flips this to 1
HEALTH_OK=0

# Print a green ✓ or red ✗ with a label
check_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
check_fail() { echo -e "  ${RED}✗${NC} $1"; HEALTH_OK=1; }
check_warn() { echo -e "  ${YELLOW}!${NC} $1"; HEALTH_OK=1; }

# ── Project directory ───────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Configuration ───────────────────────────────────────────────
PM2_APP_NAME="agentos"
HEALTH_URL="http://localhost:3000/api/health"
DB_FILE="${PROJECT_DIR}/db/custom.db"
DISK_WARN_THRESHOLD=80

# ============================================================
# 1. Check PM2 Process
# ============================================================
check_pm2() {
    if ! command -v pm2 &>/dev/null; then
        check_fail "PM2 is not installed"
        return
    fi

    if pm2 describe "$PM2_APP_NAME" &>/dev/null; then
        # Verify the process is actually in 'online' status
        STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    if p.get('name') == '${PM2_APP_NAME}':
        print(p.get('pm2_env', {}).get('status', 'unknown'))
        break
" 2>/dev/null || echo "unknown")

        if [[ "$STATUS" == "online" ]]; then
            PID=$(pm2 pid "$PM2_APP_NAME" 2>/dev/null || echo "?")
            check_pass "PM2 process '${PM2_APP_NAME}' is running (PID: ${PID})"
        else
            check_fail "PM2 process '${PM2_APP_NAME}' status: ${STATUS}"
        fi
    else
        check_fail "PM2 process '${PM2_APP_NAME}' not found"
    fi
}

# ============================================================
# 2. Check HTTP Health Endpoint
# ============================================================
check_http() {
    if command -v curl &>/dev/null; then
        HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
        if [[ "$HTTP_CODE" =~ ^2 ]]; then
            check_pass "HTTP health endpoint: ${HTTP_CODE} (${HEALTH_URL})"
        else
            check_fail "HTTP health endpoint returned ${HTTP_CODE} (${HEALTH_URL})"
        fi
    elif command -v wget &>/dev/null; then
        if wget -q --spider --timeout=10 "$HEALTH_URL" 2>/dev/null; then
            check_pass "HTTP health endpoint is reachable (${HEALTH_URL})"
        else
            check_fail "HTTP health endpoint is unreachable (${HEALTH_URL})"
        fi
    else
        check_warn "Neither curl nor wget available — cannot check HTTP"
    fi
}

# ============================================================
# 3. Check Disk Space
# ============================================================
check_disk() {
    # Get the disk usage percentage of the filesystem containing the project
    DISK_USAGE=$(df -P "${PROJECT_DIR}" | awk 'NR==2 {print $5}' | tr -d '%')
    DISK_USAGE=${DISK_USAGE:-0}

    if [[ "$DISK_USAGE" -gt "$DISK_WARN_THRESHOLD" ]]; then
        check_fail "Disk usage at ${DISK_USAGE}% (threshold: ${DISK_WARN_THRESHOLD}%)"
    else
        check_pass "Disk usage: ${DISK_USAGE}% (threshold: ${DISK_WARN_THRESHOLD}%)"
    fi
}

# ============================================================
# 4. Check Memory Usage
# ============================================================
check_memory() {
    # Read memory info from /proc/meminfo
    if [[ -f /proc/meminfo ]]; then
        MEM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
        MEM_AVAIL_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
        MEM_TOTAL_KB=${MEM_TOTAL_KB:-1}
        MEM_AVAIL_KB=${MEM_AVAIL_KB:-0}

        # Calculate used percentage
        MEM_USED_KB=$((MEM_TOTAL_KB - MEM_AVAIL_KB))
        MEM_PERCENT=$((MEM_USED_KB * 100 / MEM_TOTAL_KB))

        # Convert to human-readable
        MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
        MEM_AVAIL_MB=$((MEM_AVAIL_KB / 1024))

        if [[ "$MEM_PERCENT" -gt 90 ]]; then
            check_fail "Memory usage: ${MEM_PERCENT}% (${MEM_AVAIL_MB}MB available of ${MEM_TOTAL_MB}MB)"
        else
            check_pass "Memory usage: ${MEM_PERCENT}% (${MEM_AVAIL_MB}MB available of ${MEM_TOTAL_MB}MB)"
        fi
    else
        check_warn "Cannot read /proc/meminfo — skipping memory check"
    fi
}

# ============================================================
# 5. Check SQLite Database Size
# ============================================================
check_database() {
    if [[ -f "$DB_FILE" ]]; then
        DB_SIZE=$(du -h "$DB_FILE" 2>/dev/null | cut -f1)
        DB_SIZE=${DB_SIZE:-"unknown"}
        check_pass "SQLite database size: ${DB_SIZE} (${DB_FILE})"
    else
        check_warn "SQLite database not found at ${DB_FILE}"
    fi
}

# ============================================================
# 6. Check Caddy Service
# ============================================================
check_caddy() {
    if ! command -v caddy &>/dev/null; then
        check_warn "Caddy is not installed"
        return
    fi

    if systemctl is-active --quiet caddy 2>/dev/null; then
        check_pass "Caddy service is running"
    else
        check_fail "Caddy service is not running"
    fi
}

# ============================================================
# Run All Checks
# ============================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ALO Labs Agent Hub — Health Check${NC}"
echo -e "${GREEN}  $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""

check_pm2
check_http
check_disk
check_memory
check_database
check_caddy

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
if [[ "$HEALTH_OK" -eq 0 ]]; then
    echo -e "${GREEN}  All checks passed${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}  Some checks failed — review output above${NC}"
    echo -e "${RED}═══════════════════════════════════════════${NC}"
    echo ""
    exit 1
fi
