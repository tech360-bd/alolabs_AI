#!/usr/bin/env bash
# ============================================================
# ALO Labs Agent Hub — Security Audit Script
# Checks: permissions, exposed ports, SSL, headers, file integrity
# Usage: sudo bash security-check.sh [--json] [--fix]
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
APP_DIR="/opt/alolabs/agent-hub"
APP_USER="alohub"
SERVICE_NAME="alolabs-agent-hub"
DOMAINS=("alolabs.net" "panel.alolabs.net" "api.alolabs.net")
OUTPUT_JSON=false
AUTO_FIX=false
FINDINGS=()
CRITICAL=0
WARNING=0
PASS=0

# ── Parse arguments ──────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --json) OUTPUT_JSON=true ;;
        --fix)  AUTO_FIX=true ;;
        --help|-h)
            echo "Usage: sudo bash security-check.sh [--json] [--fix]"
            echo ""
            echo "  --json   Output as JSON"
            echo "  --fix    Auto-fix common issues (permissions)"
            exit 0
            ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root."
    exit 1
fi

# ── Helpers ──────────────────────────────────────────────────
log()    { echo -e "\033[0;34m[SEC][$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $*"; }
ok()     { PASS=$(( PASS + 1 )); [[ "${OUTPUT_JSON}" != "true" ]] && echo -e "  \033[0;32m✅ PASS\033[0m $*"; FINDINGS+=("PASS|$*"); }
warn()   { WARNING=$(( WARNING + 1 )); echo -e "  \033[1;33m⚠️  WARN\033[0m $*"; FINDINGS+=("WARN|$*"); }
crit()   { CRITICAL=$(( CRITICAL + 1 )); echo -e "  \033[0;31m🔒 CRIT\033[0m $*"; FINDINGS+=("CRITICAL|$*"); }
fix()    { echo -e "  \033[0;36m🔧 FIX\033[0m Fixing: $*"; }

# ── Run checks ───────────────────────────────────────────────
if [[ "${OUTPUT_JSON}" != "true" ]]; then
    log "============================================================"
    log "ALO Labs Agent Hub — Security Audit"
    log "============================================================"
fi

# ── 1. File Permissions ──────────────────────────────────────
log "[1/10] Checking file permissions..."

# .env must be 600 and owned by app user
if [[ -f "${APP_DIR}/.env" ]]; then
    ENV_PERMS=$(stat -c '%a' "${APP_DIR}/.env")
    ENV_OWNER=$(stat -c '%U:%G' "${APP_DIR}/.env")
    if [[ "${ENV_PERMS}" != "600" ]]; then
        if [[ "${AUTO_FIX}" == "true" ]]; then
            chmod 600 "${APP_DIR}/.env"
            fix ".env permissions: ${ENV_PERMS} → 600"
        else
            warn ".env has permissions ${ENV_PERMS} (should be 600)"
        fi
    else
        ok ".env permissions: 600"
    fi
    if [[ "${ENV_OWNER}" != "${APP_USER}:${APP_USER}" ]]; then
        if [[ "${AUTO_FIX}" == "true" ]]; then
            chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
            fix ".env ownership: ${ENV_OWNER} → ${APP_USER}:${APP_USER}"
        else
            warn ".env owned by ${ENV_OWNER} (should be ${APP_USER}:${APP_USER})"
        fi
    else
        ok ".env ownership: ${APP_USER}:${APP_USER}"
    fi
else
    crit ".env file not found at ${APP_DIR}/.env"
fi

# App directory should not be world-writable
APP_DIR_PERMS=$(stat -c '%a' "${APP_DIR}")
if [[ "${APP_DIR_PERMS: -1}" -ge 6 ]]; then
    if [[ "${AUTO_FIX}" == "true" ]]; then
        chmod o-w "${APP_DIR}"
        fix "App directory world-writable bit removed"
    else
        warn "App directory is world-writable (${APP_DIR_PERMS})"
    fi
else
    ok "App directory permissions: ${APP_DIR_PERMS}"
fi

# Secret files should not be in git
if cd "${APP_DIR}" 2>/dev/null && git ls-files --error-unmatch .env 2>/dev/null; then
    crit ".env is tracked by git! Remove it: git rm --cached .env; echo '.env' >> .gitignore"
else
    ok ".env is not tracked by git"
fi

# ── 2. Exposed Ports ─────────────────────────────────────────
log "[2/10] Checking exposed ports..."

# Check if MariaDB is listening on external interfaces
if ss -tlnp 2>/dev/null | grep -q ":3306.*0.0.0.0"; then
    crit "MariaDB listening on 0.0.0.0:3306 (exposed to network). Bind to 127.0.0.1 only."
elif ss -tlnp 2>/dev/null | grep -q ":3306.*127.0.0.1"; then
    ok "MariaDB bound to 127.0.0.1:3306 (localhost only)"
else
    warn "MariaDB not detected on port 3306"
fi

# Check Redis
if ss -tlnp 2>/dev/null | grep -q ":6379.*0.0.0.0"; then
    crit "Redis listening on 0.0.0.0:6379 (exposed to network). Bind to 127.0.0.1 only."
elif ss -tlnp 2>/dev/null | grep -q ":6379.*127.0.0.1"; then
    ok "Redis bound to 127.0.0.1:6379 (localhost only)"
else
    warn "Redis not detected on port 6379"
fi

# Check app port
if ss -tlnp 2>/dev/null | grep -q ":3011.*0.0.0.0"; then
    warn "App listening on 0.0.0.0:3011 (should be behind Nginx, consider binding to 127.0.0.1)"
elif ss -tlnp 2>/dev/null | grep -q ":3011"; then
    ok "App listening on port 3011"
fi

# ── 3. SSL Certificate Checks ────────────────────────────────
log "[3/10] Checking SSL certificates..."
CERT_DIR="/etc/letsencrypt/live"
for domain in "${DOMAINS[@]}"; do
    CERT_PATH="${CERT_DIR}/${domain}/fullchain.pem"
    if [[ -f "${CERT_PATH}" ]]; then
        # Check expiry
        EXPIRY_EPOCH=$(openssl x509 -in "${CERT_PATH}" -noout -enddate 2>/dev/null | cut -d= -f2)
        if [[ -n "${EXPIRY_EPOCH}" ]]; then
            EXPIRY_TS=$(date -d "${EXPIRY_EPOCH}" +%s 2>/dev/null || echo "0")
            NOW_TS=$(date +%s)
            DAYS_LEFT=$(( (EXPIRY_TS - NOW_TS) / 86400 ))
            if [[ ${DAYS_LEFT} -lt 7 ]]; then
                crit "${domain}: SSL expires in ${DAYS_LEFT} days — CRITICAL"
            elif [[ ${DAYS_LEFT} -lt 30 ]]; then
                warn "${domain}: SSL expires in ${DAYS_LEFT} days"
            else
                ok "${domain}: SSL valid for ${DAYS_LEFT} more days"
            fi
        fi

        # Check key strength
        KEY_SIZE=$(openssl x509 -in "${CERT_PATH}" -noout -text 2>/dev/null | grep "Public-Key:" | grep -o '[0-9]*')
        if [[ -n "${KEY_SIZE}" ]] && [[ "${KEY_SIZE}" -lt 2048 ]]; then
            warn "${domain}: Weak RSA key size (${KEY_SIZE} bit)"
        fi
    else
        warn "${domain}: No SSL certificate found at ${CERT_PATH}"
    fi
done

# ── 4. HTTP Security Headers ─────────────────────────────────
log "[4/10] Checking HTTP security headers..."
HEADER_DOMAIN="alolabs.net"
HEADERS=$(curl -sI "https://${HEADER_DOMAIN}" 2>/dev/null || echo "")

check_header() {
    local header="$1" expected="$2" description="$3" severity="${4:-WARN}"
    if echo "${HEADERS}" | grep -qi "${header}"; then
        if [[ -n "${expected}" ]]; then
            VALUE=$(echo "${HEADERS}" | grep -i "${header}" | head -1 | tr -d '\r' | sed 's/.*: //')
            if echo "${VALUE}" | grep -qi "${expected}"; then
                ok "${description}: present (${VALUE})"
            else
                if [[ "${severity}" == "CRITICAL" ]]; then
                    crit "${description}: present but value may be insufficient (${VALUE})"
                else
                    warn "${description}: present but value may be insufficient (${VALUE})"
                fi
            fi
        else
            ok "${description}: present"
        fi
    else
        if [[ "${severity}" == "CRITICAL" ]]; then
            crit "${description}: MISSING"
        else
            warn "${description}: MISSING"
        fi
    fi
}

check_header "strict-transport-security" "max-age" "HSTS" "CRITICAL"
check_header "x-content-type-options" "nosniff" "X-Content-Type-Options" "CRITICAL"
check_header "x-frame-options" "" "X-Frame-Options" "CRITICAL"
check_header "x-xss-protection" "" "X-XSS-Protection"
check_header "content-security-policy" "" "Content-Security-Policy"
check_header "referrer-policy" "" "Referrer-Policy"
check_header "permissions-policy" "" "Permissions-Policy"

# Check for server version disclosure
if echo "${HEADERS}" | grep -qi "server:.*nginx/[0-9]"; then
    warn "Server version header disclosed (consider: server_tokens off;)"
else
    ok "Server version not disclosed"
fi

# ── 5. UFW Firewall ─────────────────────────────────────────
log "[5/10] Checking firewall rules..."
if command -v ufw &>/dev/null; then
    if ufw status | grep -q "Status: active"; then
        ok "UFW firewall is active"

        # Check that only needed ports are open
        OPEN_PORTS=$(ufw status numbered 2>/dev/null | grep -oP '\d+(?=/tcp)' | sort -n | tr '\n' ',' | sed 's/,$//')
        ok "Open ports: ${OPEN_PORTS}"

        # Warn if dangerous ports are open
        for port in 3306 6379 27017 5432; do
            if ufw status | grep -q "${port}"; then
                crit "Port ${port} is open in UFW — database ports should NOT be exposed"
            fi
        done
    else
        crit "UFW firewall is NOT active"
    fi
else
    warn "UFW not installed"
fi

# ── 6. SSH Security ─────────────────────────────────────────
log "[6/10] Checking SSH configuration..."
SSHD_CONFIG="/etc/ssh/sshd_config"
if [[ -f "${SSHD_CONFIG}" ]]; then
    # Check root login
    if grep -qi "^PermitRootLogin.*yes" "${SSHD_CONFIG}"; then
        crit "SSH root login is permitted (PermitRootLogin yes)"
    elif grep -qi "^PermitRootLogin.*no\|^PermitRootLogin.*prohibit-password" "${SSHD_CONFIG}"; then
        ok "SSH root login disabled/restricted"
    else
        warn "SSH PermitRootLogin not explicitly set (defaults may allow)"
    fi

    # Check password auth
    if grep -qi "^PasswordAuthentication.*yes" "${SSHD_CONFIG}"; then
        warn "SSH password authentication enabled (consider key-only auth)"
    elif grep -qi "^PasswordAuthentication.*no" "${SSHD_CONFIG}"; then
        ok "SSH password authentication disabled"
    fi
fi

# ── 7. Fail2Ban ──────────────────────────────────────────────
log "[7/10] Checking Fail2Ban..."
if systemctl is-active --quiet fail2ban 2>/dev/null; then
    ok "Fail2Ban is active"
    JAILS=$(fail2ban-client status 2>/dev/null | grep "Jail list" | sed 's/.*: //' || echo "none")
    ok "Active jails: ${JAILS}"
else
    warn "Fail2Ban is not running"
fi

# ── 8. System Updates ────────────────────────────────────────
log "[8/10] Checking for security updates..."
if command -v apt &>/dev/null; then
    PENDING_UPDATES=$(apt list --upgradable 2>/dev/null | grep -c "upgradable" || echo "0")
    SECURITY_UPDATES=$(apt list --upgradable 2>/dev/null | grep -ci "security" || echo "0")
    if [[ "${SECURITY_UPDATES}" -gt 0 ]]; then
        warn "${SECURITY_UPDATES} security updates pending"
    else
        ok "No pending security updates"
    fi
fi

# ── 9. Sensitive File Checks ─────────────────────────────────
log "[9/10] Checking sensitive files..."

# Check for default credentials in .env
if [[ -f "${APP_DIR}/.env" ]]; then
    if rg -i "CHANGE_ME" "${APP_DIR}/.env" &>/dev/null; then
        CHANGES=$(rg -i "CHANGE_ME" "${APP_DIR}/.env" | wc -l)
        crit ".env contains ${CHANGES} 'CHANGE_ME' placeholder(s) — secrets not configured!"
    else
        ok ".env has no default placeholder values"
    fi
fi

# Check log files aren't world-readable
if [[ -d "${APP_DIR}/logs" ]]; then
    WORLD_READABLE=$(find "${APP_DIR}/logs" -perm -o=r -type f 2>/dev/null | wc -l)
    if [[ "${WORLD_READABLE}" -gt 0 ]]; then
        if [[ "${AUTO_FIX}" == "true" ]]; then
            chmod -R o-r "${APP_DIR}/logs/"
            fix "Removed world-read permissions from log files"
        else
            warn "${WORLD_READABLE} log file(s) are world-readable"
        fi
    else
        ok "Log files have restricted permissions"
    fi
fi

# ── 10. Process & User Checks ────────────────────────────────
log "[10/10] Checking process security..."

# App should not run as root
if pgrep -u root -f "next\|node\|bun" &>/dev/null; then
    crit "Application process running as root!"
else
    ok "Application not running as root"
fi

# Check for debugging in production
if [[ -f "${APP_DIR}/.env" ]]; then
    NODE_ENV=$(grep "^NODE_ENV=" "${APP_DIR}/.env" | cut -d= -f2)
    if [[ "${NODE_ENV}" == "development" ]]; then
        crit "NODE_ENV=development in production .env!"
    elif [[ "${NODE_ENV}" == "production" ]]; then
        ok "NODE_ENV=production"
    else
        warn "NODE_ENV not set explicitly"
    fi
fi

# ── Summary ──────────────────────────────────────────────────
if [[ "${OUTPUT_JSON}" == "true" ]]; then
    echo "{"
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"hostname\": \"$(hostname -f 2>/dev/null || hostname)\","
    echo "  \"critical\": ${CRITICAL},"
    echo "  \"warnings\": ${WARNING},"
    echo "  \"passed\": ${PASS},"
    echo "  \"findings\": ["
    FIRST=true
    for f in "${FINDINGS[@]}"; do
        IFS='|' read -r severity detail <<< "${f}"
        if [[ "${FIRST}" == "true" ]]; then FIRST=false; else echo ","; fi
        printf '    {"severity": "%s", "detail": "%s"}' "${severity}" "${detail}"
    done
    echo ""
    echo "  ]"
    echo "}"
else
    log ""
    log "============================================================"
    if [[ ${CRITICAL} -gt 0 ]]; then
        echo -e "\033[0;31m🔒 ${CRITICAL} CRITICAL | ${WARNING} WARNINGS | ${PASS} PASSED\033[0m"
    elif [[ ${WARNING} -gt 0 ]]; then
        echo -e "\033[1;33m⚠️  0 CRITICAL | ${WARNING} WARNINGS | ${PASS} PASSED\033[0m"
    else
        echo -e "\033[0;32m✅ ALL ${PASS} CHECKS PASSED\033[0m"
    fi
    log "============================================================"
fi

[[ ${CRITICAL} -eq 0 ]] || exit 1