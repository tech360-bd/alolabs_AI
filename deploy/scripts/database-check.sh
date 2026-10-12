#!/usr/bin/env bash
# ============================================================
# ALO Labs Agent Hub — Database Health & Integrity Check
# Usage: sudo bash database-check.sh [--json] [--repair] [--analyze]
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_DIR="/opt/alolabs/agent-hub"
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_USER="alohub_user"
DB_PASS=""
DB_NAME="alohub_production"
OUTPUT_JSON=false
RUN_REPAIR=false
RUN_ANALYZE=false
ISSUES=0

# ── Parse arguments ──────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --json)   OUTPUT_JSON=true ;;
        --repair) RUN_REPAIR=true ;;
        --analyze) RUN_ANALYZE=true ;;
        --help|-h)
            echo "Usage: sudo bash database-check.sh [--json] [--repair] [--analyze]"
            echo ""
            echo "  --json    Output results as JSON"
            echo "  --repair  Run REPAIR TABLE on all tables"
            echo "  --analyze Run ANALYZE TABLE on all tables"
            exit 0
            ;;
    esac
done

# ── Helpers ──────────────────────────────────────────────────
log()  { echo -e "\033[0;32m[DB-CHECK][$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $*"; }
warn() { echo -e "  \033[1;33m⚠️\033[0m $*"; }
fail() { echo -e "  \033[0;31m❌\033[0m $*"; }
ok()   { echo -e "  \033[0;32m✅\033[0m $*"; }

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root."
    exit 1
fi

# Extract DB credentials from .env
if [[ -f "${APP_DIR}/.env" ]]; then
    source "${APP_DIR}/.env" 2>/dev/null || true
    if [[ -n "${DATABASE_URL:-}" ]]; then
        DB_USER=$(echo "${DATABASE_URL}" | sed -n 's|mysql://\([^:]*\):\([^@]*\)@\([^:]*\):\([0-9]*\)/\(.*\)|\1|p')
        DB_PASS=$(echo "${DATABASE_URL}" | sed -n 's|mysql://\([^:]*\):\([^@]*\)@\([^:]*\):\([0-9]*\)/\(.*\)|\2|p')
        DB_HOST=$(echo "${DATABASE_URL}" | sed -n 's|mysql://\([^:]*\):\([^@]*\)@\([^:]*\):\([0-9]*\)/\(.*\)|\3|p')
        DB_PORT=$(echo "${DATABASE_URL}" | sed -n 's|mysql://\([^:]*\):\([^@]*\)@\([^:]*\):\([0-9]*\)/\(.*\)|\4|p')
        DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's|mysql://\([^:]*\):\([^@]*\)@\([^:]*\):\([0-9]*\)/\(.*\)|\5|p')
    fi
fi

MYSQL_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASS} ${DB_NAME}"

# ── Pre-flight ───────────────────────────────────────────────
if ! mysqladmin ping -h "${DB_HOST}" -P "${DB_PORT}" --silent 2>/dev/null; then
    fail "MariaDB is not responding. Cannot run database check."
    exit 1
fi

log "============================================================"
log "ALO Labs Agent Hub — Database Health Check"
log "============================================================"
log "Host: ${DB_HOST}:${DB_PORT}"
log "Database: ${DB_NAME}"
log ""

# ── 1. Connection & Version ──────────────────────────────────
log "[1/7] Checking connection and version..."
VERSION=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" -N -e "SELECT VERSION();" 2>/dev/null || echo "unknown")
UPTIME=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" -N -e "SHOW GLOBAL STATUS LIKE 'Uptime';" 2>/dev/null | awk '{print $2}' || echo "unknown")
if [[ "${UPTIME}" != "unknown" ]]; then
    UPTIME_STR="$(( UPTIME / 86400 ))d $(( (UPTIME % 86400) / 3600 ))h $(( (UPTIME % 3600) / 60 ))m"
fi
ok "MariaDB ${VERSION} (uptime: ${UPTIME_STR:-unknown})"

# ── 2. Database exists and is accessible ─────────────────────
log "[2/7] Checking database accessibility..."
DB_EXISTS=$(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" -N -e \
    "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${DB_NAME}';" 2>/dev/null || echo "0")
if [[ "${DB_EXISTS}" -eq 1 ]]; then
    ok "Database '${DB_NAME}' exists and is accessible"
else
    fail "Database '${DB_NAME}' not found or not accessible"
    exit 1
fi

# ── 3. Table overview ────────────────────────────────────────
log "[3/7] Enumerating tables..."
TABLE_COUNT=$(${MYSQL_CMD} -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "0")
DB_SIZE_MB=$(${MYSQL_CMD} -N -e \
    "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "?")
ok "${TABLE_COUNT} tables, total size: ${DB_SIZE_MB}MB"

# ── 4. Check table engines ───────────────────────────────────
log "[4/7] Checking table engines..."
NON_INNODB=$(${MYSQL_CMD} -N -e \
    "SELECT GROUP_CONCAT(table_name) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND engine != 'InnoDB' AND engine IS NOT NULL;" 2>/dev/null || echo "")
if [[ -n "${NON_INNODB}" ]]; then
    warn "Non-InnoDB tables found: ${NON_INNODB}"
    ISSUES=$(( ISSUES + 1 ))
else
    ok "All tables use InnoDB engine"
fi

# ── 5. Check for MyISAM tables (need repair after crash) ─────
log "[5/7] Checking for MyISAM tables needing repair..."
MYISAM_TABLES=$(${MYSQL_CMD} -N -e \
    "SELECT table_name FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND engine='MyISAM';" 2>/dev/null || echo "")
if [[ -n "${MYISAM_TABLES}" ]]; then
    warn "MyISAM tables found (consider migrating to InnoDB): ${MYISAM_TABLES}"
    ISSUES=$(( ISSUES + 1 ))
else
    ok "No MyISAM tables"
fi

# ── 6. Table check (CHECK TABLE) ─────────────────────────────
log "[6/7] Running CHECK TABLE on all tables..."
TABLE_LIST=$(${MYSQL_CMD} -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null)
CORRUPT=0
CHECKED=0

for table in ${TABLE_LIST}; do
    CHECKED=$(( CHECKED + 1 ))
    RESULT=$(${MYSQL_CMD} -N -e "CHECK TABLE \`${table}\` QUICK;" 2>/dev/null | awk '{print $3}' | tail -1)
    if [[ "${RESULT}" != "OK" ]]; then
        fail "Table \`${table}\`: ${RESULT}"
        CORRUPT=$(( CORRUPT + 1 ))
        ISSUES=$(( ISSUES + 1 ))
    fi
done

if [[ ${CORRUPT} -eq 0 ]]; then
    ok "All ${CHECKED} tables passed CHECK TABLE"
else
    fail "${CORRUPT}/${CHECKED} tables have issues!"
    if [[ "${RUN_REPAIR}" == "true" ]]; then
        log "  Running REPAIR TABLE on corrupted tables..."
        for table in ${TABLE_LIST}; do
            RESULT=$(${MYSQL_CMD} -N -e "CHECK TABLE \`${table}\` QUICK;" 2>/dev/null | awk '{print $3}' | tail -1)
            if [[ "${RESULT}" != "OK" ]]; then
                REPAIR_RESULT=$(${MYSQL_CMD} -N -e "REPAIR TABLE \`${table}\`;" 2>/dev/null | awk '{print $3}' | tail -1)
                if [[ "${REPAIR_RESULT}" == "OK" ]]; then
                    ok "Repaired: \`${table}\`"
                else
                    fail "Repair failed: \`${table}\` (${REPAIR_RESULT})"
                fi
            fi
        done
    else
        warn "Run with --repair to attempt automatic repair"
    fi
fi

# ── 7. Analyze tables (optional) ─────────────────────────────
if [[ "${RUN_ANALYZE}" == "true" ]]; then
    log "[7/7] Running ANALYZE TABLE on all tables..."
    for table in ${TABLE_LIST}; do
        ${MYSQL_CMD} -e "ANALYZE TABLE \`${table}\`;" 2>/dev/null | tail -1
    done
    ok "All tables analyzed"
else
    log "[7/7] Skipping ANALYZE TABLE (use --analyze to run)"
fi

# ── 8. Connection pool stats ─────────────────────────────────
log "Connection statistics:"
THREADS_CONNECTED=$(${MYSQL_CMD} -N -e "SHOW GLOBAL STATUS LIKE 'Threads_connected';" 2>/dev/null | awk '{print $2}' || echo "?")
MAX_CONNECTIONS=$(${MYSQL_CMD} -N -e "SHOW GLOBAL VARIABLES LIKE 'max_connections';" 2>/dev/null | awk '{print $2}' || echo "?")
CONNECTION_ERRORS=$(${MYSQL_CMD} -N -e "SHOW GLOBAL STATUS LIKE 'Connection_errors_max_connections';" 2>/dev/null | awk '{print $2}' || echo "0")
SLOW_QUERIES=$(${MYSQL_CMD} -N -e "SHOW GLOBAL STATUS LIKE 'Slow_queries';" 2>/dev/null | awk '{print $2}' || echo "0")

log "  Threads connected: ${THREADS_CONNECTED}/${MAX_CONNECTIONS}"
if [[ "${CONNECTION_ERRORS}" -gt 0 ]]; then
    warn "Connection errors (max reached): ${CONNECTION_ERRORS}"
    ISSUES=$(( ISSUES + 1 ))
else
    ok "No connection limit errors"
fi

if [[ "${SLOW_QUERIES}" -gt 100 ]]; then
    warn "Slow queries since startup: ${SLOW_QUERIES}"
else
    ok "Slow queries: ${SLOW_QUERIES}"
fi

# ── Summary ──────────────────────────────────────────────────
log ""
log "============================================================"
if [[ ${ISSUES} -eq 0 ]]; then
    log "✅ DATABASE HEALTHY — No issues found"
else
    log "⚠️  ${ISSUES} issue(s) found — review output above"
fi
log "============================================================"
log "Tables: ${TABLE_COUNT} | Size: ${DB_SIZE_MB}MB | Version: ${VERSION}"

[[ ${ISSUES} -eq 0 ]] || exit 1