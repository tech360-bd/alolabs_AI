#!/usr/bin/env bash
# ============================================================
# ALO Labs AISMH — Health Check Script
# Checks app process, API health, DB, Redis. Outputs JSON.
# Usage: bash healthcheck.sh
# ============================================================
set -Eeuo pipefail

APP_USER="alohub"
INSTALL_DIR="/opt/alolabs/agent-hub"
DB_PATH="$INSTALL_DIR/shared/data/alolabs.db"
HEALTH_URL="http://localhost:3011/api/health"
APP_OK=false
DB_OK=false
REDIS_OK=false
ERRORS=[]

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: bash healthcheck.sh"
  echo "Checks application, database, and Redis health. Returns JSON."
  exit 0
fi

# ─── Application Process ────────────────────────────────────
if pgrep -u "$APP_USER" -f "server.js" >/dev/null 2>&1; then
  APP_OK=true
fi

# ─── HTTP Health Endpoint ─────────────────────────────────
HTTP_BODY=$(curl -sf --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "")
if [[ -n "$HTTP_BODY" ]]; then
  APP_OK=true
else
  APP_OK=false
  ERRORS=$(echo "$ERRORS" | jq --arg e "HTTP health endpoint unreachable" '. + [$e]' 2>/dev/null || echo '["HTTP health endpoint unreachable"]')
fi

# ─── Database ─────────────────────────────────────────────
if [[ -f "$DB_PATH" ]]; then
  DB_CHECK=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null || echo "error")
  if echo "$DB_CHECK" | grep -q "ok"; then
    DB_OK=true
  else
    ERRORS=$(echo "$ERRORS" | jq --arg e "Database integrity check: $DB_CHECK" '. + [$e]' 2>/dev/null || echo '["Database check failed"]')
  fi
else
  ERRORS=$(echo "$ERRORS" | jq --arg e "Database file not found" '. + [$e]' 2>/dev/null || echo '["Database not found"]')
fi

# ─── Redis ────────────────────────────────────────────────
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    REDIS_OK=true
  else
    ERRORS=$(echo "$ERRORS" | jq --arg e "Redis not responding" '. + [$e]' 2>/dev/null || echo '["Redis not responding"]')
  fi
else
  REDIS_OK="unavailable"
fi

# ─── Overall Status ────────────────────────────────────────
if [[ "$APP_OK" == "true" && "$DB_OK" == "true" ]]; then
  STATUS="healthy"
else
  STATUS="unhealthy"
fi

# ─── Release Info ──────────────────────────────────────────
RELEASE="unknown"
VERSION="unknown"
if [[ -f "$INSTALL_DIR/current/package.json" ]]; then
  VERSION=$(grep '"version"' "$INSTALL_DIR/current/package.json" | head -1 | grep -oP '"\K[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
fi
if [[ -L "$INSTALL_DIR/current" ]]; then
  RELEASE=$(basename "$(readlink -f "$INSTALL_DIR/current")")
fi

echo "{}" | \
  jq --arg status "$STATUS" \
      --arg app "$APP_OK" \
      --arg db "$DB_OK" \
      --arg redis "$REDIS_OK" \
      --arg version "$VERSION" \
      --arg release "$RELEASE" \
      --arg errors "$ERRORS" \
      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{status: $status, application: $app, database: $db, redis: $redis, version: $version, release: $release, errors: ($errors | fromjson), timestamp: $timestamp}'

[[ "$STATUS" == "healthy" ]] && exit 0 || exit 1
