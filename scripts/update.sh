#!/usr/bin/env bash
set -Eeuo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# ALO Labs AISMH — Staged Update Deployment Script
# Deploys a new release with rollback capability
# ═══════════════════════════════════════════════════════════════════════════

readonly APP_NAME="alolabs-aISMH"
readonly APP_USER="alolabs"
readonly DEPLOY_BASE="/opt/${APP_NAME}"
readonly SERVICE_NAME="${APP_NAME}"
readonly RELEASES_DIR="${DEPLOY_BASE}/releases"
readonly SHARED_DIR="${DEPLOY_BASE}/shared"
readonly SCRIPT_NAME="update.sh"
readonly TEMP_DIR_BASE="/tmp/alolabs-deploy"

MAX_ROLLBACK_WAIT=30

json_output() {
  local success="$1" status="$2" message="$3"
  printf '{"success":%s,"status":%d,"message":"%s","timestamp":"%s"}\n' \
    "${success}" "${status}" "${message}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

log_action() {
  printf '[update] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >&2
}

cmd_help() {
  cat <<EOF
Usage: bash ${SCRIPT_NAME} [OPTIONS] <archive-path>

Deploy a new release of ALO Labs AISMH.

ARGUMENTS:
  archive-path    Path to the release archive (.tar.gz)

OPTIONS:
  --check         Non-destructive validation (no deployment)
  --help          Show this help message

DEPLOYMENT FLOW:
  1. Verify archive and checksum
  2. Extract to new release directory
  3. Install dependencies (bun install --frozen-lockfile)
  4. Generate Prisma client
  5. Run lint, typecheck, tests
  6. Build production bundle
  7. Apply database migrations
  8. Link shared resources
  9. Atomically switch current symlink
  10. Restart service and verify health
  11. Auto-rollback on failure

ROLLBACK:
  If health check fails after deployment, the previous release is
   automatically restored within ${MAX_ROLLBACK_WAIT}s.
EOF
}

validate_archive() {
  local archive="$1"

  if [[ ! -f "${archive}" ]]; then
    printf 'ERROR: Archive not found: %s\n' "${archive}" >&2
    return 1
  fi

  if [[ ! -r "${archive}" ]]; then
    printf 'ERROR: Archive not readable: %s\n' "${archive}" >&2
    return 1
  fi

  # Check for path traversal
  case "${archive}" in
    ../*) printf 'ERROR: Path traversal detected in archive path.\n' >&2; return 1 ;;
  esac

  # Verify checksum if .sha256 file exists
  local sha_file="${archive}.sha256"
  if [[ -f "${sha_file}" ]]; then
    log_action "Verifying SHA-256 checksum..."
    if ! (cd "$(dirname "${archive}")" && sha256sum -c "$(basename "${sha_file}")" --quiet 2>/dev/null); then
      printf 'ERROR: Archive checksum mismatch.\n' >&2
      return 1
    fi
    log_action "Checksum verified"
  else
    log_action "No .sha256 file found — skipping checksum verification"
  fi
}

create_release_dir() {
  local timestamp
  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  local release_dir="${RELEASES_DIR}/${timestamp}"
  mkdir -p "${release_dir}"
  echo "${release_dir}"
}

extract_archive() {
  local archive="$1" release_dir="$2"
  local temp_extract

  temp_extract="${TEMP_DIR_BASE}/extract_$(date +%s)"
  mkdir -p "${temp_extract}"

  log_action "Extracting archive..."
  tar xzf "${archive}" -C "${temp_extract}" 2>/dev/null

  # Find the top-level directory (archive should have one)
  local top_dir
  top_dir="$(find "${temp_extract}" -mindepth 1 -maxdepth 1 -type d | head -1)"

  if [[ -z "${top_dir}" ]]; then
    printf 'ERROR: Archive is empty or has unexpected structure.\n' >&2
    rm -rf "${temp_extract}"
    return 1
  fi

  # Move contents to release dir
  cp -a "${top_dir}/." "${release_dir}/"
  rm -rf "${temp_extract}"

  log_action "Extracted to ${release_dir}"
}

validate_release() {
  local release_dir="$1"
  local errors=0

  for file in package.json bun.lock prisma/schema.prisma src/app/page.tsx; do
    if [[ ! -f "${release_dir}/${file}" ]]; then
      printf 'ERROR: Missing required file: %s\n' "${file}" >&2
      errors=$((errors + 1))
    fi
  done

  if [[ ! -f "${release_dir}/scripts/seed.ts" ]]; then
    printf 'WARNING: Seed script not found.\n' >&2
  fi

  return "${errors}"
}

install_dependencies() {
  local release_dir="$1"
  log_action "Installing dependencies..."
  (cd "${release_dir}" && bun install --frozen-lockfile --production=false 2>&1) | while IFS= read -r line; do
    log_action "  ${line}"
  done
}

generate_prisma() {
  local release_dir="$1"
  log_action "Generating Prisma client..."
  (cd "${release_dir}" && bunx prisma generate 2>&1)
}

run_quality_checks() {
  local release_dir="$1"
  log_action "Running quality checks..."

  log_action "  Lint..."
  (cd "${release_dir}" && bun run lint 2>&1) || {
    printf 'ERROR: Lint check failed.\n' >&2
    return 1
  }

  log_action "  Typecheck..."
  (cd "${release_dir}" && bun run typecheck 2>&1) || {
    printf 'ERROR: Typecheck failed.\n' >&2
    return 1
  }

  log_action "  Tests..."
  (cd "${release_dir}" && bun run test 2>&1) || {
    printf 'ERROR: Tests failed.\n' >&2
    return 1
  }
}

build_application() {
  local release_dir="$1"
  log_action "Building production bundle..."
  (cd "${release_dir}" && bun run build 2>&1) || {
    printf 'ERROR: Build failed.\n' >&2
    return 1
  }

  if [[ ! -f "${release_dir}/.next/standalone/server.js" ]]; then
    printf 'ERROR: Production entry file not found after build.\n' >&2
    return 1
  fi
}

apply_migrations() {
  local release_dir="$1"
  log_action "Applying database migrations..."

  if [[ ! -f "${SHARED_DIR}/.env" ]]; then
    printf 'ERROR: No .env file found at %s. Cannot migrate without DATABASE_URL.\n' "${SHARED_DIR}/.env" >&2
    return 1
  fi

  (cd "${release_dir}" && \
    source_env && bunx prisma migrate deploy 2>&1) || {
    printf 'ERROR: Database migration failed.\n' >&2
    return 1
  }
}

source_env() {
  if [[ -f "${SHARED_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${SHARED_DIR}/.env"
    set +a
  fi
}

link_shared_resources() {
  local release_dir="$1"

  # Link .env
  ln -sf "${SHARED_DIR}/.env" "${release_dir}/.env"

  # Link storage
  if [[ -d "${release_dir}/storage" ]]; then
    rm -rf "${release_dir}/storage"
  fi
  ln -sf "${SHARED_DIR}/storage" "${release_dir}/storage"

  # Link logs
  mkdir -p "${SHARED_DIR}/logs"
  if [[ -d "${release_dir}/logs" ]]; then
    rm -rf "${release_dir}/logs"
  fi
  ln -sf "${SHARED_DIR}/logs" "${release_dir}/logs"

  chown -R "${APP_USER}:${APP_USER}" "${release_dir}"

  log_action "Linked shared resources"
}

switch_symlink() {
  local new_release="$1"
  local current_link="${DEPLOY_BASE}/current"
  local previous="${DEPLOY_BASE}/previous"

  # Save current as previous
  if [[ -L "${current_link}" ]]; then
    local current_target
    current_target="$(readlink -f "${current_link}")"
    rm -f "${previous}"
    ln -sf "${current_target}" "${previous}"
  fi

  # Atomic symlink switch
  ln -sfn "${new_release}" "${current_link}"

  log_action "Switched current symlink to ${new_release}"
}

restart_service() {
  log_action "Restarting ${SERVICE_NAME}..."
  systemctl restart "${SERVICE_NAME}" 2>&1
  sleep 3

  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    log_action "Service is active"
    return 0
  else
    printf 'ERROR: Service failed to start.\n' >&2
    systemctl logs "${SERVICE_NAME}" --no-pager -n 20 >&2
    return 1
  fi
}

verify_health() {
  local retries=5
  local delay=3

  for i in $(seq 1 "${retries}"); do
    if curl -sf --max-time 10 "http://localhost:3000/api/health" 2>/dev/null | grep -q '"status":"healthy"'; then
      log_action "Health check passed (attempt ${i}/${retries})"
      return 0
    fi
    log_action "Health check failed (attempt ${i}/${retries}) — retrying in ${delay}s..."
    sleep "${delay}"
  done

  printf 'ERROR: Health check failed after %d attempts.\n' "${retries}" >&2
  return 1
}

perform_rollback() {
  local previous="${DEPLOY_BASE}/previous"

  if [[ ! -L "${previous}" ]] || [[ ! -d "$(readlink -f "${previous}")" ]]; then
    printf 'ERROR: No previous release available for rollback.\n' >&2
    return 1
  fi

  log_action "PERFORMING AUTO-ROLLBACK..."

  ln -sfn "$(readlink -f "${previous}")" "${DEPLOY_BASE}/current"
  systemctl restart "${SERVICE_NAME}" 2>&1 || true
  sleep 3

  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    log_action "Rollback successful — previous release restored"
  else
    printf 'CRITICAL: Rollback failed. Manual intervention required.\n' >&2
  fi
}

# ═══════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════

CHECK_MODE=false
ARCHIVE_PATH=""

for arg in "$@"; do
  case "${arg}" in
    --check)   CHECK_MODE=true ;;
    --help|-h) cmd_help; exit 0 ;;
 -*)         printf 'Unknown option: %s\nUse --help for usage.\n' "${arg}" >&2; exit 1 ;;
    *)         ARCHIVE_PATH="${arg}" ;;
  esac
done

if [[ "${CHECK_MODE}" == true ]]; then
  if [[ -z "${ARCHIVE_PATH}" ]]; then
    json_output false 1 "Archive path required for check mode"
    exit 1
  fi
  validate_archive "${ARCHIVE_PATH}"
  json_output true 200 "Archive validation passed (check mode)"
  exit 0
fi

if [[ -z "${ARCHIVE_PATH}" ]]; then
  printf 'ERROR: Archive path required.\nUse --help for usage.\n' >&2
  json_output false 1 "Missing archive path"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  printf 'ERROR: This script must be run as root.\n' >&2
  exit 1
fi

trap 'rm -rf "${TEMP_DIR_BASE:-/tmp/alolabs-deploy}" 2>/dev/null; true' EXIT

log_action "Starting staged deployment..."

validate_archive "${ARCHIVE_PATH}" || {
  json_output false 1 "Archive validation failed"
  exit 1
}

RELEASE_DIR="$(create_release_dir)"
log_action "Release directory: ${RELEASE_DIR}"

extract_archive "${ARCHIVE_PATH}" "${RELEASE_DIR}" || {
  json_output false 1 "Archive extraction failed"
  exit 1
}

validate_release "${RELEASE_DIR}" || {
  json_output false 1 "Release validation failed"
  exit 1
}

install_dependencies "${RELEASE_DIR}" || {
  json_output false 1 "Dependency installation failed"
  exit 1
}

generate_prisma "${RELEASE_DIR}" || {
  json_output false 1 "Prisma client generation failed"
  exit 1
}

run_quality_checks "${RELEASE_DIR}" || {
  json_output false 1 "Quality checks failed"
  exit 1
}

build_application "${RELEASE_DIR}" || {
  json_output false 1 "Build failed"
  exit 1
}

apply_migrations "${RELEASE_DIR}" || {
  json_output false 1 "Database migration failed"
  exit 1
}

link_shared_resources "${RELEASE_DIR}"
switch_symlink "${RELEASE_DIR}"

if ! restart_service; then
  perform_rollback
  json_output false 1 "Deployment failed — rolled back to previous release"
  exit 1
fi

if ! verify_health; then
  perform_rollback
  json_output false 1 "Health check failed — rolled back to previous release"
  exit 1
fi

log_action "Deployment completed successfully"
json_output true 200 "Deployment successful — release ${RELEASE_DIR} is live"
exit 0
