#!/usr/bin/env bash
# ============================================================
# ALO Labs AIOS — Comprehensive Health Check (Ubuntu 24.04)
# Checks: Next.js app, Database, Redis, Qdrant, MinIO, Disk, Memory, Docker
# Usage: sudo bash healthcheck.sh [--json] [--quiet]
# Exit code: 0 = healthy, 1 = unhealthy, 2 = degraded
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_URL="${HEALTHCHECK_APP_URL:-http://127.0.0.1:3011}"
HEALTH_ENDPOINT="${HEALTHCHECK_ENDPOINT:-/api/health}"
DB_HOST="${HEALTHCHECK_DB_HOST:-127.0.0.1}"
DB_PORT="${HEALTHCHECK_DB_PORT:-3306}"
DB_NAME="${HEALTHCHECK_DB_NAME:-alohub_production}"
DB_USER="${HEALTHCHECK_DB_USER:-alohub_user}"
DB_PASS="${HEALTHCHECK_DB_PASS:-}"
REDIS_HOST="${HEALTHCHECK_REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${HEALTHCHECK_REDIS_PORT:-6379}"
REDIS_PASS="${HEALTHCHECK_REDIS_PASS:-}"
QDRANT_URL="${HEALTHCHECK_QDRANT_URL:-http://127.0.0.1:6333}"
MINIO_URL="${HEALTHCHECK_MINIO_URL:-http://127.0.0.1:9000}"
DISK_WARN=${HEALTHCHECK_DISK_WARN:-80}
DISK_CRIT=${HEALTHCHECK_DISK_CRIT:-90}
MEM_WARN=${HEALTHCHECK_MEM_WARN:-85}
MEM_CRIT=${HEALTHCHECK_MEM_CRIT:-95}
CHECK_DIR="${HEALTHCHECK_CHECK_DIR:-/}"

OUTPUT_JSON=false
QUIET=false

# ── Parse arguments ──────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --json)  OUTPUT_JSON=true ;;
        --quiet) QUIET=true ;;
        --help|-h)
            echo "Usage: sudo bash healthcheck.sh [--json] [--quiet]"
            echo ""
            echo "  --json   Output results as JSON for monitoring integration"
            echo "  --quiet  Only output failures"
            echo ""
            echo "Environment variables:"
            echo "  HEALTHCHECK_APP_URL    App base URL (default: http://127.0.0.1:3011)"
            echo "  HEALTHCHECK_DB_HOST    Database host (default: 127.0.0.1)"
            echo "  HEALTHCHECK_REDIS_HOST Redis host (default: 127.0.0.1)"
            echo "  HEALTHCHECK_QDRANT_URL Qdrant URL (default: http://127.0.0.1:6333)"
            echo "  HEALTHCHECK_MINIO_URL  MinIO URL (default: http://127.0.0.1:9000)"
            echo "  HEALTHCHECK_DISK_WARN  Disk warn %% (default: 80)"
            echo "  HEALTHCHECK_DISK_CRIT  Disk critical %% (default: 90)"
            exit 0
            ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────
log()  { [[ "${QUIET}" == "false" ]] && echo -e "\033[0;32m[HEALTH][$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $*" || true; }
warn() { [[ "${QUIET}" == "false" ]] && echo -e "\033[1;33m[HEALTH][WARN]\033[0m $*" || true; }
err()  { echo -e "\033[0;31m[HEALTH][FAIL]\033[0m $*" >&2; }
ok()   { [[ "${QUIET}" == "false" ]] && echo -e "  \033[0;32m✅\033[0m $*" || true; }
fail() { echo -e "  \033[0;31m❌\033[0m $*" >&2; }

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

# ── Header ──────────────────────────────────────────────────
if [[ "${OUTPUT_JSON}" != "true" ]]; then
    log "============================================================"
    log "ALO Labs AIOS — Comprehensive Health Check"
    log "============================================================"
fi

# ── 1. Next.js Application ─────────────────────────────────
HTTP_START=$(date +%s%N)
HTTP_BODY=$(curl -sf --max-time 10 "${APP_URL}${HEALTH_ENDPOINT}" 2>/dev/null || echo "")
HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 10 "${APP_URL}${HEALTH_ENDPOINT}" 2>/dev/null || echo "000")
HTTP_END=$(date +%s%N)
HTTP_LATENCY_MS=$(( (HTTP_END - HTTP_START) / 1000000 ))

if [[ "${HTTP_CODE}" == "200" ]]; then
    # Try to extract status from JSON response
    APP_STATUS=$(echo "${HTTP_BODY}" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','healthy'))" 2>/dev/null || echo "healthy")
    if [[ "${APP_STATUS}" == "healthy" ]]; then
        add_result "app" "healthy" "HTTP ${HTTP_CODE} (${HTTP_LATENCY_MS}ms)" "${HTTP_LATENCY_MS}"
        ok "App: HTTP ${HTTP_CODE} (${HTTP_LATENCY_MS}ms)"
    else
        add_result "app" "degraded" "HTTP ${HTTP_CODE} but status='${APP_STATUS}'" "${HTTP_LATENCY_MS}"
        warn "App: HTTP ${HTTP_CODE} but status='${APP_STATUS}'"
    fi
elif [[ "${HTTP_CODE}" =~ ^[45] ]]; then
    add_result "app" "unhealthy" "HTTP ${HTTP_CODE} (server error)" "${HTTP_LATENCY_MS}"
    fail "App: HTTP ${HTTP_CODE} (server error)"
else
    add_result "app" "unhealthy" "No response (code: ${HTTP_CODE})"
    fail "App: no response (code: ${HTTP_CODE})"
fi

# ── 2. Database Connectivity ───────────────────────────────
DB_START=$(date +%s%N)
DB_CONNECTED=false
DB_INFO=""

if command -v mysqladmin &>/dev/null; then
    if mysqladmin ping -h "${DB_HOST}" -P "${DB_PORT}" --silent 2>/dev/null; then
        DB_CONNECTED=true
        # Try to get table count and size
        if [[ -n "${DB_PASS}" ]]; then
            TABLE_COUNT=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
            DB_SIZE=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" -N -e "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
        else
            TABLE_COUNT=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
            DB_SIZE=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -N -e "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
        fi
        DB_INFO="${TABLE_COUNT} tables, ${DB_SIZE}MB"
    fi
elif command -v pg_isready &>/dev/null; then
    if pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -t 5 &>/dev/null; then
        DB_CONNECTED=true
        DB_INFO="PostgreSQL connected"
    fi
fi

DB_END=$(date +%s%N)
DB_LATENCY_MS=$(( (DB_END - DB_START) / 1000000 ))

if [[ "${DB_CONNECTED}" == "true" ]]; then
    add_result "database" "healthy" "Connected, ${DB_INFO}" "${DB_LATENCY_MS}"
    ok "Database: connected (${DB_INFO})"
else
    add_result "database" "unhealthy" "Database not responding on ${DB_HOST}:${DB_PORT}"
    fail "Database: NOT RESPONDING on ${DB_HOST}:${DB_PORT}"
fi

# ── 3. Redis Connectivity ──────────────────────────────────
REDIS_START=$(date +%s%N)
REDIS_CONNECTED=false
REDIS_INFO=""

if command -v redis-cli &>/dev/null; then
    REDIS_PING=""
    if [[ -n "${REDIS_PASS}" ]]; then
        REDIS_PING=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASS}" --no-auth-warning ping 2>/dev/null || echo "")
    else
        REDIS_PING=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping 2>/dev/null || echo "")
    fi

    if [[ "${REDIS_PING}" == "PONG" ]]; then
        REDIS_CONNECTED=true
        if [[ -n "${REDIS_PASS}" ]]; then
            REDIS_MEMORY=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASS}" --no-auth-warning INFO memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "?")
            REDIS_KEYS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASS}" --no-auth-warning DBSIZE 2>/dev/null | tr -d '\r' || echo "?")
        else
            REDIS_MEMORY=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" INFO memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "?")
            REDIS_KEYS=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" DBSIZE 2>/dev/null | tr -d '\r' || echo "?")
        fi
        REDIS_INFO="${REDIS_MEMORY} used, ${REDIS_KEYS} keys"
    fi
fi

REDIS_END=$(date +%s%N)
REDIS_LATENCY_MS=$(( (REDIS_END - REDIS_START) / 1000000 ))

if [[ "${REDIS_CONNECTED}" == "true" ]]; then
    add_result "redis" "healthy" "PONG (${REDIS_LATENCY_MS}ms), ${REDIS_INFO}" "${REDIS_LATENCY_MS}"
    ok "Redis: connected (${REDIS_INFO})"
else
    add_result "redis" "degraded" "Redis not responding (non-critical)" "${REDIS_LATENCY_MS}"
    warn "Redis: NOT RESPONDING (non-critical)"
fi

# ── 4. Qdrant (Vector DB) ─────────────────────────────────
QDRANT_START=$(date +%s%N)
QDRANT_OK=false

if command -v curl &>/dev/null; then
    QDRANT_STATUS=$(curl -sf --max-time 5 "${QDRANT_URL}/healthz" 2>/dev/null || echo "")
    if [[ -n "${QDRANT_STATUS}" ]]; then
        QDRANT_OK=true
    fi
fi

QDRANT_END=$(date +%s%N)
QDRANT_LATENCY_MS=$(( (QDRANT_END - QDRANT_START) / 1000000 ))

if [[ "${QDRANT_OK}" == "true" ]]; then
    add_result "qdrant" "healthy" "Connected (${QDRANT_LATENCY_MS}ms)" "${QDRANT_LATENCY_MS}"
    ok "Qdrant: connected (${QDRANT_LATENCY_MS}ms)"
else
    add_result "qdrant" "degraded" "Qdrant not responding (non-critical)" "${QDRANT_LATENCY_MS}"
    warn "Qdrant: NOT RESPONDING (non-critical)"
fi

# ── 5. MinIO (Object Storage) ─────────────────────────────
MINIO_START=$(date +%s%N)
MINIO_OK=false

if command -v curl &>/dev/null; then
    # MinIO health check via /minio/health/live
    MINIO_STATUS=$(curl -sf --max-time 5 "${MINIO_URL}/minio/health/live" 2>/dev/null || echo "")
    if [[ "${MINIO_STATUS}" == *"alive"* || ${#MINIO_STATUS} -eq 0 ]] && [[ $(curl -sf -o /dev/null -w '%{http_code}' --max-time 5 "${MINIO_URL}/minio/health/live" 2>/dev/null || echo "000") == "200" ]]; then
        MINIO_OK=true
    fi
fi

MINIO_END=$(date +%s%N)
MINIO_LATENCY_MS=$(( (MINIO_END - MINIO_START) / 1000000 ))

if [[ "${MINIO_OK}" == "true" ]]; then
    add_result "minio" "healthy" "Connected (${MINIO_LATENCY_MS}ms)" "${MINIO_LATENCY_MS}"
    ok "MinIO: connected (${MINIO_LATENCY_MS}ms)"
else
    add_result "minio" "degraded" "MinIO not responding (non-critical)" "${MINIO_LATENCY_MS}"
    warn "MinIO: NOT RESPONDING (non-critical)"
fi

# ── 6. Disk Space ─────────────────────────────────────────
DISK_USAGE=$(df "${CHECK_DIR}" 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%')
DISK_AVAIL=$(df -h "${CHECK_DIR}" 2>/dev/null | awk 'NR==2{print $4}')
DISK_TOTAL=$(df -h "${CHECK_DIR}" 2>/dev/null | awk 'NR==2{print $2}')

if [[ -n "${DISK_USAGE}" ]]; then
    if [[ "${DISK_USAGE}" -gt "${DISK_CRIT}" ]]; then
        add_result "disk" "unhealthy" "Disk usage ${DISK_USAGE}% (${DISK_AVAIL}/${DISK_TOTAL} free) — CRITICAL"
        fail "Disk: ${DISK_USAGE}% used (${DISK_AVAIL} free) — CRITICAL"
    elif [[ "${DISK_USAGE}" -gt "${DISK_WARN}" ]]; then
        add_result "disk" "degraded" "Disk usage ${DISK_USAGE}% (${DISK_AVAIL}/${DISK_TOTAL} free) — WARNING"
        warn "Disk: ${DISK_USAGE}% used (${DISK_AVAIL} free) — WARNING"
    else
        add_result "disk" "healthy" "Disk usage ${DISK_USAGE}% (${DISK_AVAIL}/${DISK_TOTAL} free)"
        ok "Disk: ${DISK_USAGE}% used (${DISK_AVAIL} free)"
    fi
else
    add_result "disk" "degraded" "Unable to determine disk usage"
    warn "Disk: unable to determine usage"
fi

# ── 7. Memory Usage ───────────────────────────────────────
MEM_TOTAL_KB=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo "0")
MEM_AVAIL_KB=$(awk '/MemAvailable/{print $2}' /proc/meminfo 2>/dev/null || echo "0")

if [[ "${MEM_TOTAL_KB}" -gt 0 ]]; then
    MEM_USED_KB=$(( MEM_TOTAL_KB - MEM_AVAIL_KB ))
    MEM_TOTAL_MB=$(( MEM_TOTAL_KB / 1024 ))
    MEM_USED_MB=$(( MEM_USED_KB / 1024 ))
    MEM_PERCENT=$(( MEM_USED_KB * 100 / MEM_TOTAL_KB ))

    if [[ "${MEM_PERCENT}" -gt "${MEM_CRIT}" ]]; then
        add_result "memory" "unhealthy" "Memory ${MEM_PERCENT}% (${MEM_USED_MB}/${MEM_TOTAL_MB}MB) — CRITICAL"
        fail "Memory: ${MEM_PERCENT}% (${MEM_USED_MB}/${MEM_TOTAL_MB}MB) — CRITICAL"
    elif [[ "${MEM_PERCENT}" -gt "${MEM_WARN}" ]]; then
        add_result "memory" "degraded" "Memory ${MEM_PERCENT}% (${MEM_USED_MB}/${MEM_TOTAL_MB}MB) — WARNING"
        warn "Memory: ${MEM_PERCENT}% (${MEM_USED_MB}/${MEM_TOTAL_MB}MB) — WARNING"
    else
        add_result "memory" "healthy" "Memory ${MEM_PERCENT}% (${MEM_USED_MB}/${MEM_TOTAL_MB}MB)"
        ok "Memory: ${MEM_PERCENT}% (${MEM_USED_MB}/${MEM_TOTAL_MB}MB)"
    fi
else
    add_result "memory" "degraded" "Unable to determine memory usage"
    warn "Memory: unable to determine usage"
fi

# ── 8. Docker Container Status ────────────────────────────
if command -v docker &>/dev/null; then
    DOCKER_RUNNING=false
    DOCKER_INFO=""

    if docker info &>/dev/null; then
        DOCKER_RUNNING=true
        # Check expected containers
        EXPECTED_CONTAINERS=("alolabs-app" "alolabs-mariadb" "alolabs-redis" "alolabs-minio" "alolabs-qdrant")
        RUNNING=0
        STOPPED=0
        MISSING=()

        for container in "${EXPECTED_CONTAINERS[@]}"; do
            STATUS=$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || echo "")
            if [[ "${STATUS}" == "running" ]]; then
                RUNNING=$(( RUNNING + 1 ))
            elif [[ "${STATUS}" == "exited" || "${STATUS}" == "dead" ]]; then
                STOPPED=$(( STOPPED + 1 ))
                MISSING+=("${container} (stopped)")
            else
                MISSING+=("${container} (not found)")
            fi
        done

        if [[ ${#MISSING[@]} -eq 0 ]]; then
            DOCKER_INFO="All ${RUNNING} containers running"
            add_result "docker" "healthy" "${DOCKER_INFO}"
            ok "Docker: ${DOCKER_INFO}"
        else
            DOCKER_INFO="${RUNNING} running, ${STOPPED} stopped, ${#MISSING[@]} missing"
            STOPPED_LIST=$(IFS=', '; echo "${MISSING[*]}")
            add_result "docker" "degraded" "${DOCKER_INFO} [${STOPPED_LIST}]"
            warn "Docker: ${DOCKER_INFO}"
        fi
    else
        add_result "docker" "degraded" "Docker daemon not running"
        warn "Docker: daemon not running"
    fi
else
    add_result "docker" "degraded" "Docker not installed (non-critical for bare-metal)"
    # Don't warn in quiet mode since Docker is optional
fi

# ── JSON Output ───────────────────────────────────────────
if [[ "${OUTPUT_JSON}" == "true" ]]; then
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
        # Escape quotes in message
        message_escaped=$(echo "${message}" | sed 's/"/\\"/g')
        printf '    {"name": "%s", "status": "%s", "message": "%s"' "${name}" "${status}" "${message_escaped}"
        if [[ -n "${latency}" ]]; then
            printf ', "latency_ms": %d' "${latency}"
        fi
        printf '}'
    done
    echo ""
    echo "  ]"
    echo "}"
else
    # ── Human-readable summary ─────────────────────────────
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

# ── Exit code ─────────────────────────────────────────────
case "${OVERALL}" in
    healthy)   exit 0 ;;
    degraded)  exit 2 ;;
    unhealthy) exit 1 ;;
esac