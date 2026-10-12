#!/usr/bin/env bash
set -Eeuo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# ALO Labs AISMH — Rollback Script
# Reverts to the previous release
# ═══════════════════════════════════════════════════════════════════════════

readonly APP_NAME="alolabs-aismh"
readonly APP_USER="alolabs"
readonly DEPLOY_BASE="/opt/${APP_NAME}"
readonly SERVICE_NAME="${APP_NAME}"
readonly SCRIPT_NAME="rollback.sh"

json_output() {
  local success="$1" status="$2" message="$3"
  printf '{"success":%s,"status":%d,"message":"%s","timestamp":"%s"}\n' \
    "${success}" "${status}" "${message}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

log_action() {
  printf '[rollback] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >&2
}

cmd_help() {
  cat <<EOF
Usage: bash ${SCRIPT_NAME} [OPTIONS]

Rollback ALO Labs AISMH to the previous release.

OPTIONS:
  --target <release-dir>  Rollback to a specific release directory
  --check                 Non-destructive validation
  --help                  Show this help message

ROLLBACK FLOW:
  1. Identify previous release (or use --target)
  2. Validate target release has required files
  3. Switch current symlink to target
  4. Restart service
  5. Verify health
  6. Log rollback event

NOTE: Database migrations are NOT automatically rolled back.
      Use forward-fix migrations for any schema changes.
EOF
}

validate_release_dir() {
  local dir="$1"

  if [[ ! -d "${dir}" ]]; then
    printf 'ERROR: Release directory not found: %s\n' "${dir}" >&2
    return 1
  fi

  for file in package.json .next/standalone/server.js; do
    if [[ ! -f "${dir}/${file}" ]]; then
      printf 'ERROR: Target release missing required file: %s\n' "${file}" >&2
      return 1
    fi
  done

  return 0
}

find_previous_release() {
  local current_target=""
  if [[ -L "${DEPLOY_BASE}/current" ]]; then
    current_target="$(readlink -f "${DEPLOY_BASE}/current")"
  fi

  local previous=""
  local latest_ts=0

  for dir in "${DEPLOY_BASE}/releases"/*/; do
    [[ -d "${dir}" ]] || continue
    dir="${dir%/}"

    # Skip current release
    if [[ "${dir}" == "${current_target}" ]]; then
      continue
    fi

    local ts
    ts="$(stat -c %Y "${dir}" 2>/dev/null || echo 0)"
    if [[ "${ts}" -gt "${latest_ts}" ]]; then
      latest_ts="${ts}"
      previous="${dir}"
    fi
  done

  echo "${previous}"
}

verify_health() {
  local retries=5
  local delay=3

  for i in $(seq 1 "${retries}"); do
    if curl -sf --max-time 10 "http://localhost:3000/api/health" 2>/dev/null | grep -q '"status":"healthy"'; then
      log_action "Health check passed (attempt ${i}/${retries})"
      return 0
    fi
    sleep "${delay}"
  done

  return 1
}

# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

CHECK_MODE=false
TARGET_RELEASE=""

for arg in "$@"; do
  case "${arg}" in
    --target)  shift; TARGET_RELEASE="${1:-}" ;;
    --check)   CHECK_MODE=true ;;
    --help|-h) cmd_help; exit 0 ;;
 esac
done

if [[ "${CHECK_MODE}" == true ]]; then
  local prev=""
  prev="$(find_previous_release)"
  if [[ -z "${prev}" ]]; then
    json_output false 1 "No previous release available for rollback"
    exit 1
  fi
  json_output true 200 "Rollback target: ${prev} (check mode)"
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  printf 'ERROR: This script must be run as root.\n' >&2
  exit 1
fi

if [[ -n "${TARGET_RELEASE}" ]]; then
  ROLLBACK_TARGET="${TARGET_RELEASE}"
else
  ROLLBACK_TARGET="$(find_previous_release)"
fi

if [[ -z "${ROLLBACK_TARGET}" ]]; then
  json_output false 1 "No previous release available for rollback"
  exit 1
fi

log_action "Rolling back to: ${ROLLBACK_TARGET}"

if ! validate_release_dir "${ROLLBACK_TARGET}"; then
  json_output false 1 "Target release validation failed"
  exit 1
fi

# Switch symlink
ln -sfn "${ROLLBACK_TARGET}" "${DEPLOY_BASE}/current"
log_action "Switched current symlink to ${ROLLBACK_TARGET}"

# Restart service
systemctl restart "${SERVICE_NAME}" 2>&1 || true
sleep 3

# Verify
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  log_action "Service is active"

  if verify_health; then
    log_action "Rollback completed successfully"
    json_output true 200 "Rollback to ${ROLLBACK_TARGET} successful"
    exit 0
  else
    log_action "WARNING: Service is active but health check failed"
    json_output false 1 "Rollback completed but health check failed"
    exit 1
  fi
else
  printf 'CRITICAL: Service failed to start after rollback. Manual intervention required.\n' >&2
  systemctl logs "${SERVICE_NAME}" --no-pager -n 20 >&2
  json_output false 1 "Service failed to start after rollback"
  exit 1
fi
