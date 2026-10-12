#!/usr/bin/env bash
# ============================================================
# ALO Labs Agent Hub — Health Check Script
# Checks: Application, Database, Redis, Nginx, Disk, Memory
# Usage: sudo bash health-check.sh [--json] [--quiet]
# Exit code: 0 = healthy, 1 = unhealthy, 2 = degraded
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_DIR="/opt/alolabs/agent-hub"
SERVICE_NAME="alolabs-agent-hub"
APP_PORT=3011
DB_HOST="127.0.0.1"
DB_PORT=3306
DB_NAME="alohub_production"
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
OUTPUT_JSON=false
QUIET=false

# ── Parse arguments ──────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --json)  OUTPUT_JSON=true ;;
        --quiet) QUIET=true ;;
        --help|-h)
            echo "Usage: sudo bash health-check.sh [--json] [--quiet]"
            echo ""
            echo "  --json   Output results as JSON"
            echo "  --quiet  Only output failures"
            exit 0
            ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────
log()  { [[ "${QUIET}" == "false" ]] && echo -e "\033[0;32m[HEALTH][$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $*" || true; }
warn() { echo -e "\033[1;33m[HEALTH][WARN]\033[0m $*"; }
err()  { echo -e "\033[0;31m[HEALTH][FAIL]\033[0m $*"; }
ok()   { [[ "${QUIET}" == "false" ]] && echo -e "  \033[0;32m✅\033[0m $*" || true; }
fail() { echo -e "  \033[0;31m❌\033[0m $*"; }

# Results collection
RESULTS=()
OVERALL="healthy"

add_result() {
    local name="$1" status="$2" message="$3" latency="${4:-}"
    RESULTS+=("${name}|${status}|${message}|${latency}")
    if [[ "${status}" == "unhealthy" ]]; then
        OVERALL="unhealthy"
    elif [[ "${status}" == "degraded" && "${OVERALL}" != "unhealthy" ]]; then
        OVERALL="degraded"
    fi
}

# ── Run health checks ────────────────────────────────────────
if [[ "${OUTPUT_JSON}" != "true" ]]; then
    log "============================================================"
    log "ALO Labs Agent Hub — Health Check"
    log "============================================================"
fi

# 1. Application Service
if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    UPTIME=$(systemctl show "${SERVICE_NAME}" --property=ActiveEnterTimestamp --value 2>/dev/null || echo "unknown")
    MEMORY=$(systemctl show "${SERVICE_NAME}" --property=MemoryCurrent --value 2>/dev/null || echo "unknown")
    if [[ "${MEMORY}" != "unknown" && "${MEMORY}" -gt 0 ]]; then
        MEMORY_MB=$(( MEMORY / 1048576 ))
        add_result "service" "healthy" "Running since ${UPTIME}, using ${MEMORY_MB}MB RAM"
    else
        add_result "service" "healthy" "Running since ${UPTIME}"
    fi
    ok "Service: active"
else
    add_result "service" "unhealthy" "Service is not running"
    fail "Service: NOT RUNNING"
fi

# 2. Application HTTP
HTTP_START=$(date +%s%N)
HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/health" 2>/dev/null || echo "000")
HTTP_END=$(date +%s%N)
HTTP_LATENCY_MS=$(( (HTTP_END - HTTP_START) / 1000000 ))

if [[ "${HTTP_CODE}" == "200" ]]; then
    add_result "http" "healthy" "HTTP ${HTTP_CODE} in ${HTTP_LATENCY_MS}ms" "${HTTP_LATENCY_MS}"
    ok "HTTP: ${HTTP_CODE} (${HTTP_LATENCY_MS}ms)"
elif [[ "${HTTP_CODE}" =~ ^[45] ]]; then
    add_result "http" "unhealthy" "HTTP ${HTTP_CODE}" "${HTTP_LATENCY_MS}"
    fail "HTTP: ${HTTP_CODE} (server error)"
else
    add_result "http" "unhealthy" "No response (code: ${HTTP_CODE})"
    fail "HTTP: no response"
fi

# 3. Database (MariaDB)
DB_START=$(date +%s%N)
if mysqladmin ping -h "${DB_HOST}" -P "${DB_PORT}" --silent 2>/dev/null; then
    DB_END=$(date +%s%N)
    DB_LATENCY_MS=$(( (DB_END - DB_START) / 1000000 ))

    # Check database exists
    if mysql -h "${DB_HOST}" -P "${DB_PORT}" -e "USE \`${DB_NAME}\`;" &>/dev/null; then
        # Get table count
        TABLE_COUNT=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
        DB_SIZE=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -N -e "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
        add_result "database" "healthy" "MariaDB connected, ${TABLE_COUNT} tables, ${DB_SIZE}MB" "${DB_LATENCY_MS}"
        ok "Database: connected (${TABLE_COUNT} tables, ${DB_SIZE}MB)"
    else
        add_result "database" "unhealthy" "MariaDB responding but database '${DB_NAME}' not found"
        fail "Database: '${DB_NAME}' not found"
    fi
else
    DB_END=$(date +%s%N)
    add_result "database" "unhealthy" "MariaDB not responding"
    fail "Database: NOT RESPONDING"
fi

# 4. Redis
REDIS_START=$(date +%s%N)
if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null | grep -q "PONG"; then
    REDIS_END=$(date +%s%N)
    REDIS_LATENCY_MS=$(( (REDIS_END - REDIS_START) / 1000000 ))

    REDIS_MEMORY=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" INFO memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "?")
    REDIS_KEYS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" DBSIZE 2>/dev/null | grep -o '[0-9]*' || echo "?")
    add_result "redis" "healthy" "PONG in ${REDIS_LATENCY_MS}ms, ${REDIS_MEMORY} used, ${REDIS_KEYS} keys" "${REDIS_LATENCY_MS}"
    ok "Redis: connected (${REDIS_MEMORY}, ${REDIS_KEYS} keys)"
else
    REDIS_END=$(date +%s%N)
    REDIS_LATENCY_MS=$(( (REDIS_END - REDIS_START) / 1000000 ))
    add_result "redis" "degraded" "Redis not responding (non-critical)" "${REDIS_LATENCY_MS}"
    fail "Redis: NOT RESPONDING (non-critical)"
fi

# 5. Nginx
if systemctl is-active --quiet nginx 2>/dev/null; then
    NGINX_TEST=$(nginx -t 2>&1 | tail -1 || echo "error")
    if echo "${NGINX_TEST}" | grep -q "successful"; then
        add_result "nginx" "healthy" "Running, config valid"
        ok "Nginx: active, config valid"
    else
        add_result "nginx" "degraded" "Running but config issues: ${NGINX_TEST}"
        fail "Nginx: config issues"
    fi
else
    add_result "nginx" "degraded" "Nginx not running (non-critical for local dev)"
    warn "Nginx: not running"
fi

# 6. Disk Space
DISK_USAGE=$(df -h "${APP_DIR}" 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%')
DISK_AVAIL=$(df -h "${APP_DIR}" 2>/dev/null | awk 'NR==2{print $4}')
if [[ -n "${DISK_USAGE}" ]]; then
    if [[ "${DISK_USAGE}" -gt 90 ]]; then
        add_result "disk" "unhealthy" "Disk usage ${DISK_USAGE}% (${DISK_AVAIL} free) — CRITICAL"
        fail "Disk: ${DISK_USAGE}% used (${DISK_AVAIL} free) — CRITICAL"
    elif [[ "${DISK_USAGE}" -gt 80 ]]; then
        add_result "disk" "degraded" "Disk usage ${DISK_USAGE}% (${DISK_AVAIL} free)"
        warn "Disk: ${DISK_USAGE}% used (${DISK_AVAIL} free)"
    else
        add_result "disk" "healthy" "Disk usage ${DISK_USAGE}% (${DISK_AVAIL} free)"
        ok "Disk: ${DISK_USAGE}% used (${DISK_AVAIL} free)"
    fi
fi

# 7. Memory
MEM_TOTAL=$(free -m | awk '/Mem:/{print $2}')
MEM_USED=$(free -m | awk '/Mem:/{print $3}')
MEM_PERCENT=$(( MEM_USED * 100 / MEM_TOTAL ))
if [[ "${MEM_PERCENT}" -gt 95 ]]; then
    add_result "memory" "unhealthy" "Memory ${MEM_PERCENT}% (${MEM_USED}/${MEM_TOTAL}MB) — CRITICAL"
    fail "Memory: ${MEM_PERCENT}% (${MEM_USED}/${MEM_TOTAL}MB) — CRITICAL"
elif [[ "${MEM_PERCENT}" -gt 85 ]]; then
    add_result "memory" "degraded" "Memory ${MEM_PERCENT}% (${MEM_USED}/${MEM_TOTAL}MB)"
    warn "Memory: ${MEM_PERCENT}% (${MEM_USED}/${MEM_TOTAL}MB)"
else
    add_result "memory" "healthy" "Memory ${MEM_PERCENT}% (${MEM_USED}/${MEM_TOTAL}MB)"
    ok "Memory: ${MEM_PERCENT}% (${MEM_USED}/${MEM_TOTAL}MB)"
fi

# ── Output ───────────────────────────────────────────────────
if [[ "${OUTPUT_JSON}" == "true" ]]; then
    # JSON output
    echo "{"
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"hostname\": \"$(hostname -f 2>/dev/null || hostname)\","
    echo "  \"overall\": \"${OVERALL}\","
    echo "  \"checks\": ["
    FIRST=true
    for r in "${RESULTS[@]}"; do
        IFS='|' read -r name status message latency <<< "${r}"
        if [[ "${FIRST}" == "true" ]]; then
            FIRST=false
        else
            echo ","
        fi
        printf '    {"name": "%s", "status": "%s", "message": "%s"' "${name}" "${status}" "${message}"
        if [[ -n "${latency}" ]]; then
            printf ', "latency_ms": %d' "${latency}"
        fi
        printf '}'
    done
    echo ""
    echo "  ]"
    echo "}"
else
    log ""
    log "============================================================"
    if [[ "${OVERALL}" == "healthy" ]]; then
        log "✅ OVERALL: HEALTHY"
    elif [[ "${OVERALL}" == "degraded" ]]; then
        log "⚠️  OVERALL: DEGRADED"
    else
        log "❌ OVERALL: UNHEALTHY"
    fi
    log "============================================================"
fi

# ── Exit code ────────────────────────────────────────────────
case "${OVERALL}" in
    healthy)  exit 0 ;;
    degraded) exit 2 ;;
    unhealthy) exit 1 ;;
esac