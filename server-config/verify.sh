#!/usr/bin/env bash
# ============================================================
# ALO Labs AISMH — Pre-Deployment Verification Script
# Validates all prerequisites before deployment.
# Usage: bash verify.sh
# ============================================================
set -Eeuo pipefail

PASS=0
FAIL=0
WARN=0
RESULTS=[]

log_pass() { RESULTS=$(echo "$RESULTS" | jq --arg t "$1" '. + [{status:"pass",check:$t}]' 2>/dev/null); PASS=$((PASS+1)); }
log_fail() { RESULTS=$(echo "$RESULTS" | jq --arg t "$1" --arg r "${2:-}" '. + [{status:"fail",check:$t,reason:$r}]' 2>/dev/null); FAIL=$((FAIL+1)); }
log_warn() { RESULTS=$(echo "$RESULTS" | jq --arg t "$1" --arg r "${2:-}" '. + [{status:"warn",check:$t,reason:$r}]' 2>/dev/null); WARN=$((WARN+1)); }

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: bash verify.sh"
  echo "Runs all pre-deployment checks. Outputs JSON report."
  exit 0
fi

DIR="${1:-.}"

# ─── Bun Version ──────────────────────────────────────────
if command -v bun >/dev/null 2>&1; then
  BUN_VERSION=$(bun --version 2>/dev/null || echo "unknown")
  log_pass "bun version: $BUN_VERSION"
else
  log_fail "bun runtime" "bun not found in PATH"
fi

# ─── package.json ────────────────────────────────────────
if [[ -f "$DIR/package.json" ]]; then
  PKG_NAME=$(jq -r '.name // "unknown"' "$DIR/package.json")
  PKG_VERSION=$(jq -r '.version // "unknown"' "$DIR/package.json")
  log_pass "package.json (name=$PKG_NAME, version=$PKG_VERSION)"
  [[ "$PKG_NAME" == "alolabs-aismh" ]] || log_warn "package.json name" "Expected alolabs-aismh, got $PKG_NAME"
else
  log_fail "package.json" "Not found at $DIR/package.json"
fi

# ─── Lockfile ───────────────────────────────────────────
if [[ -f "$DIR/bun.lock" ]]; then
  log_pass "bun.lock exists"
else
  log_fail "bun.lock" "No lockfile found"
fi

# ─── .env.example ───────────────────────────────────────
if [[ -f "$DIR/.env.example" ]]; then
  log_pass ".env.example exists"
else
  log_warn ".env.example" "Not found — cannot validate environment variables"
fi

# ─── .env (actual) ─────────────────────────────────────
if [[ -f "$DIR/.env" ]]; then
  log_pass ".env exists"
  # Check required vars
  for VAR in DATABASE_URL ENCRYPTION_KEY CSRF_SECRET; do
    if grep -qP "^${VAR}=" "$DIR/.env" 2>/dev/null; then
      log_pass ".env $VAR is set"
    else
      log_fail ".env $VAR" "Missing required variable: $VAR"
    fi
  done
else
  log_warn ".env" "No .env file found (expected in production)"
fi

# ─── Prisma Schema ──────────────────────────────────────
if [[ -f "$DIR/prisma/schema.prisma" ]]; then
  log_pass "prisma/schema.prisma exists"
  PROVIDER=$(grep 'provider' "$DIR/prisma/schema.prisma" | head -1 | grep -oP '"\K[^"]+' || echo "unknown")
  log_pass "Database provider: $PROVIDER"
else
  log_fail "prisma/schema.prisma" "Not found"
fi

# ─── TypeScript Config ──────────────────────────────────
if [[ -f "$DIR/tsconfig.json" ]]; then
  log_pass "tsconfig.json exists"
else
  log_fail "tsconfig.json" "Not found"
fi

# ─── Dockerfile ─────────────────────────────────────────
if [[ -f "$DIR/Dockerfile" ]]; then
  log_pass "Dockerfile exists"
else
  log_warn "Dockerfile" "Not found (required for container deployment)"
fi

# ─── systemd Service ────────────────────────────────────
if [[ -f "$DIR/server-config/alolabs-aismh.service" || -f "$DIR/deploy/systemd/alolabs-agent-hub.service" ]]; then
  log_pass "systemd service file exists"
else
  log_warn "systemd service" "Not found in server-config/ or deploy/systemd/"
fi

# ─── Deploy Scripts ─────────────────────────────────────
for SCRIPT in install.sh update.sh rollback.sh backup.sh restore.sh healthcheck.sh verify.sh; do
  if [[ -f "$DIR/server-config/$SCRIPT" ]]; then
    bash -n "$DIR/server-config/$SCRIPT" 2>/dev/null && log_pass "server-config/$SCRIPT syntax" || log_fail "server-config/$SCRIPT" "Syntax error"
  else
    log_warn "server-config/$SCRIPT" "Not found"
  fi
done

# ─── Lint ───────────────────────────────────────────────
if command -v bun >/dev/null 2>&1 && [[ -d "$DIR/node_modules" ]]; then
  if bun run lint --quiet 2>/dev/null; then
    log_pass "eslint passes"
  else
    log_fail "eslint" "Lint errors detected"
  fi
else
  log_warn "eslint" "Skipped (deps not installed or bun not available)"
fi

# ─── Summary ─────────────────────────────────────────────
OVERALL="pass"
[[ "$FAIL" -gt 0 ]] && OVERALL="fail"

echo "{}" | \
  jq --arg overall "$OVERALL" \
      --argjson pass "$PASS" \
      --argjson fail "$FAIL" \
      --argjson warn "$WARN" \
      --argjson results "$RESULTS" \
      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{overall: $overall, passed: $pass, failed: $fail, warnings: $warn, results: $results, timestamp: $timestamp}'

[[ "$OVERALL" == "pass" ]] && exit 0 || exit 1
