#!/usr/bin/env bash
set -euo pipefail
# ALO Labs AIOS - Environment Validator
# Validates all required environment variables are set

cd "$(dirname "$0")/../.."

REQUIRED_VARS=(
    "DATABASE_URL"
    "NEXTAUTH_SECRET"
    "API_GATEWAY_SECRET"
    "AUTH_OWNER_EMAIL"
    "AUTH_OWNER_PASSWORD"
)

OPTIONAL_VARS=(
    "REDIS_URL"
    "POSTGRES_URL"
    "QDRANT_URL"
    "MINIO_URL"
    "NODE_ENV"
    "PORT"
    "ALLOWED_ORIGINS"
    "SMTP_HOST"
    "CSRF_SECRET"
    "SESSION_ENCRYPTION_KEY"
    "WEBHOOK_SECRET"
    "BACKUP_ENCRYPTION_KEY"
    "API_KEY_ENCRYPTION_KEY"
)

ERRORS=0
WARNINGS=0

echo "╔════════════════════════════════════════╗"
echo "║  ALO Labs AIOS - Environment Validator ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Load .env
if [ -f .env ]; then
    set -a
    source .env
    set +a
    echo "✅ Loaded .env file"
else
    echo "❌ No .env file found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "--- Required Variables ---"
for var in "${REQUIRED_VARS[@]}"; do
    if [ -n "${!var:-}" ]; then
        # Mask secrets
        val="${!var}"
        if [[ "$var" == *"SECRET"* || "$var" == *"PASSWORD"* || "$var" == *"KEY"* ]]; then
            echo "✅ $var = ******** ($(echo -n "$val" | wc -c) chars)"
        else
            echo "✅ $var = $val"
        fi
    else
        echo "❌ $var = (not set)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "--- Optional Variables ---"
for var in "${OPTIONAL_VARS[@]}"; do
    if [ -n "${!var:-}" ]; then
        echo "✅ $var = (set)"
    else
        echo "⚠️  $var = (not set)"
        WARNINGS=$((WARNINGS + 1))
    fi
done

echo ""
echo "--- Infrastructure Checks ---"
# Check database
if [ -n "${DATABASE_URL:-}" ]; then
    if [[ "$DATABASE_URL" == file:* ]]; then
        DB_PATH="${DATABASE_URL#file:}"
        if [ -f "$DB_PATH" ]; then
            SIZE=$(du -sh "$DB_PATH" | cut -f1)
            echo "✅ SQLite database: $SIZE"
        else
            echo "⚠️  SQLite database file not found: $DB_PATH"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
fi

# Check Redis
if [ -n "${REDIS_URL:-}" ]; then
    if command -v redis-cli &>/dev/null; then
        if redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
            echo "✅ Redis: connected"
        else
            echo "⚠️  Redis: connection failed"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo "⚠️  Redis CLI not installed"
    fi
fi

# Check ports
echo ""
echo "--- Port Availability ---"
for port in 3000 5432 6379 6333 9000 9090 3001; do
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        echo "⚠️  Port $port: in use"
    else
        echo "✅ Port $port: available"
    fi
done

echo ""
echo "════════════════════════════════════════"
if [ "$ERRORS" -gt 0 ]; then
    echo "❌ FAILED: $ERRORS error(s), $WARNINGS warning(s)"
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    echo "⚠️  PASSED with $WARNINGS warning(s)"
    exit 0
else
    echo "✅ ALL CHECKS PASSED"
    exit 0
fi