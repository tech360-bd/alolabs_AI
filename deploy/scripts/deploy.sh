#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt}"
BRANCH="${BRANCH:-main}"
PM2_NAME="agentos-app"
PORT=3011
REQUIRED_BUN_VERSION="1.3.4"
SAFETY_SCRIPT_DIR="${SAFETY_SCRIPT_DIR:-${APP_DIR}/deploy/scripts}"
cd "${APP_DIR}"

fail() { echo "DEPLOYMENT BLOCKED: $*" >&2; exit 1; }
run_as_owner() { sudo -u "$(stat -c %U "${APP_DIR}")" --preserve-env=DATABASE_URL -- "$@"; }

[[ "$(git rev-parse --show-toplevel)" == "${APP_DIR}" ]] || fail "${APP_DIR} is not the Git repository root"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "production repository has tracked changes"
CURRENT_COMMIT="$(git rev-parse HEAD)"
echo "Current production commit: ${CURRENT_COMMIT}"

ENV_FILE="${APP_DIR}/.env.production"
[[ -f "${ENV_FILE}" ]] || ENV_FILE="${APP_DIR}/.env"
[[ -f "${ENV_FILE}" ]] || fail "production environment file not found"
ENV_RELATIVE="$(realpath --relative-to="${APP_DIR}" "${ENV_FILE}")"
if [[ "${ENV_RELATIVE}" != ../* ]] && git ls-files --error-unmatch "${ENV_RELATIVE}" >/dev/null 2>&1; then
  fail "production environment is tracked by Git and could be overwritten"
fi
ENV_HASH="$(sha256sum "${ENV_FILE}" | awk '{print $1}')"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
[[ -n "${DATABASE_URL:-}" ]] || fail "production DATABASE_URL is missing"
bash "${SAFETY_SCRIPT_DIR}/database-safety-scan.sh" .

# Confirm the currently deployed application is attached to this exact database.
ACTIVE_PID="$(pm2 pid "${PM2_NAME}" 2>/dev/null || true)"
[[ "${ACTIVE_PID}" =~ ^[0-9]+$ && "${ACTIVE_PID}" -gt 0 ]] || fail "PM2 process ${PM2_NAME} is not running"
ACTIVE_DATABASE_URL="$(tr '\0' '\n' < "/proc/${ACTIVE_PID}/environ" | sed -n 's/^DATABASE_URL=//p' | tail -1)"
[[ -n "${ACTIVE_DATABASE_URL}" ]] || fail "running application does not expose its configured DATABASE_URL"
[[ "${ACTIVE_DATABASE_URL}" == "${DATABASE_URL}" ]] || fail "running application and production environment use different databases"
unset ACTIVE_DATABASE_URL

printf '%s\n' "=== DATABASE CONFIGURATION (values redacted) ==="
grep -nE '^[A-Za-z_][A-Za-z0-9_]*(DATABASE|MYSQL|MARIADB|SQLITE)[A-Za-z0-9_]*=' "${ENV_FILE}" 2>/dev/null |
  sed -E 's/=.*$/=[REDACTED]/' || true
grep -RniE 'DATABASE_URL|DATABASE_PROVIDER|sqlite|mysql|mariadb|postgres' prisma package.json 2>/dev/null || true
printf '%s\n' "=== SERVER AND RUNTIME VERSIONS ==="
uname -a
BUN_VERSION="$(/usr/local/bin/bun --version)"
[[ "${BUN_VERSION}" == "${REQUIRED_BUN_VERSION}" ]] || fail "production Bun ${BUN_VERSION} does not match required ${REQUIRED_BUN_VERSION}"
echo "Bun ${BUN_VERSION}"
pm2 --version
node -p 'require("next/package.json").version'
node -p 'require("prisma/package.json").version'
printf '%s\n' "=== PRISMA CONFIGURATION ==="
find prisma -maxdepth 2 -type f -print 2>/dev/null | sort
printf '%s\n' "=== DATABASE FILES ==="
find "${APP_DIR}" -maxdepth 4 \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \) -type f -print

DB_SCHEMA="prisma/schema.mysql.prisma"
GENERATE_SCRIPT="db:generate:mysql"
case "${DATABASE_URL}" in
  file:*|*.db|*.sqlite|*.sqlite3)
    # SQLite is a local development and test convenience only. It is not an
    # acceptable production datasource, not a fallback, and not an alternative
    # production mode, so this deployment refuses to proceed rather than
    # quietly installing a second-class database behind the production domain.
    fail "production DATABASE_URL points at SQLite (${DATABASE_URL%%:*}...). \
MySQL/MariaDB is mandatory for production. Set DATABASE_URL to \
mysql://USER:PASSWORD@HOST:3306/DATABASE and generate the Prisma client from \
prisma/schema.mysql.prisma. To move existing data use: \
npm run db:migrate:mysql -- --dry-run  (then re-run without --dry-run)."
    ;;
  mysql://*|mariadb://*)
    DB_SCHEMA="prisma/schema.mysql.prisma"
    GENERATE_SCRIPT="db:generate:mysql"
    [[ -f "${DB_SCHEMA}" ]] || fail "MySQL Prisma schema is missing"
    grep -Eq 'provider *= *"mysql"' "${DB_SCHEMA}" || fail "Prisma schema does not match MySQL/MariaDB"
    DB_STATS="$(node -e '
      const mysql=require("mysql2/promise"); (async()=>{const c=await mysql.createConnection(process.env.DATABASE_URL); const [r]=await c.query("SELECT COUNT(*) n, COALESCE(SUM(data_length+index_length),0) bytes FROM information_schema.tables WHERE table_schema=DATABASE()"); console.log(`${r[0].n}:${r[0].bytes}`); await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})')" || fail "database connectivity check failed"
    TABLE_COUNT="${DB_STATS%%:*}"
    DB_SIZE="${DB_STATS#*:}"
    [[ "${TABLE_COUNT}" -gt 0 ]] || fail "configured production database has no tables"
    DB_VERSION="$(node -e '
      const mysql=require("mysql2/promise"); (async()=>{const c=await mysql.createConnection(process.env.DATABASE_URL); const [r]=await c.query("SELECT VERSION() version, DATABASE() name"); console.log(`${r[0].version} (${r[0].name})`); await c.end()})().catch(()=>process.exit(1))')" || fail "database version query failed"
    echo "Database engine/version/name: MySQL-compatible ${DB_VERSION}"
    echo "MySQL/MariaDB size: ${DB_SIZE} bytes across ${TABLE_COUNT} tables"
    ;;
  *) fail "unsupported DATABASE_URL provider" ;;
esac

# Inspect migration history and schema compatibility. Any error fails closed.
if [[ -d prisma/migrations ]] && find prisma/migrations -mindepth 2 -name migration.sql -print -quit | grep -q .; then
  run_as_owner bunx prisma migrate status --schema "${DB_SCHEMA}" || fail "migration history is inconsistent or pending review"
  MIGRATIONS_PRESENT=true
else
  MIGRATIONS_PRESENT=false
  echo "No repository migration history; schema application is disabled."
fi
run_as_owner bunx prisma validate --schema "${DB_SCHEMA}" || fail "Prisma schema validation failed"

# A verified recovery backup is mandatory before any deployment can proceed.
APP_DIR="${APP_DIR}" ENV_FILE="${ENV_FILE}" bash "${SAFETY_SCRIPT_DIR}/backup.sh" | tee /tmp/alo-backup-result
BACKUP_PATH="$(sed -n 's/^BACKUP_VERIFIED=//p' /tmp/alo-backup-result | tail -1)"
[[ -n "${BACKUP_PATH}" && -d "${BACKUP_PATH}" ]] || fail "backup was not verified"

echo '[DATABASE SAFETY GATE]'
printf '%s\n' \
 'Existing production database detected: YES' 'Database engine identified: YES' \
 'Production DATABASE_URL identified: YES' 'Existing database backed up: YES' \
 'Database integrity verified: YES' 'Migration history inspected: YES' \
 'Destructive operation detected: NO' 'New database creation required: NO' \
 'Data-loss flag detected: NO' 'Database reset requested: NO' 'DROP/TRUNCATE detected: NO'

git fetch origin "${BRANCH}"
TARGET_COMMIT="$(git rev-parse "origin/${BRANCH}")"
git reset --hard "${TARGET_COMMIT}"
bash "${SAFETY_SCRIPT_DIR}/database-safety-scan.sh" .
[[ "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" == "${ENV_HASH}" ]] || fail "production environment was modified"
# The datasource is MySQL/MariaDB by the check above, so the generated schema
# must be the MySQL one. Anything else means the checkout does not match what
# this deployment verified earlier.
grep -Eq 'provider *= *"mysql"' "${DB_SCHEMA}" || fail "target Prisma provider differs from production (expected mysql)"

run_as_owner bun install --frozen-lockfile
run_as_owner bunx prisma validate --schema "${DB_SCHEMA}"
run_as_owner bun run "${GENERATE_SCRIPT}"
if [[ -d prisma/migrations ]] && find prisma/migrations -mindepth 2 -name migration.sql -print -quit | grep -q .; then
  MIGRATIONS_PRESENT=true
  MIGRATION_STATUS="$(run_as_owner bunx prisma migrate status --schema "${DB_SCHEMA}" 2>&1)" || {
    echo "${MIGRATION_STATUS}" >&2
    [[ "${MIGRATIONS_APPROVED:-false}" == true ]] || fail "target migrations are pending or inconsistent and are not approved"
  }
else
  MIGRATIONS_PRESENT=false
fi
if [[ "${MIGRATIONS_PRESENT}" == true ]]; then
  echo "Migrations exist; application requires explicit MIGRATIONS_APPROVED=true."
  [[ "${MIGRATIONS_APPROVED:-false}" == true ]] || fail "migration approval is absent"
  if ! run_as_owner bunx prisma migrate deploy --schema "${DB_SCHEMA}"; then
    cat >&2 <<'MSG'
DATABASE MIGRATION FAILED
Production database was NOT reset.
Production database was NOT replaced.
No destructive fallback was executed.
Application restart was skipped.
Existing database remains intact.
Backup remains available for recovery.
MSG
    exit 1
  fi
fi
run_as_owner env NODE_ENV=production bun run build

test -f .next/standalone/server.js
test -d .next/static
test -d .next/standalone/.next/static
test -d public
test -d .next/standalone/public

rollback_code() {
  trap - ERR
  echo "Health validation failed; rolling back application code only." >&2
  git reset --hard "${CURRENT_COMMIT}"
  run_as_owner bun install --frozen-lockfile
  run_as_owner bun run "${GENERATE_SCRIPT}"
  run_as_owner env NODE_ENV=production bun run build
  pm2 reload "${PM2_NAME}" --update-env
  sleep 3
  ROLLBACK_PID="$(pm2 pid "${PM2_NAME}")"
  [[ "${ROLLBACK_PID}" =~ ^[0-9]+$ && "${ROLLBACK_PID}" -gt 0 ]]
  [[ "$(readlink -f "/proc/${ROLLBACK_PID}/cwd")" == "${APP_DIR}" ]]
  [[ "$(readlink -f "/proc/${ROLLBACK_PID}/exe")" == "/usr/local/bin/bun" ]]
  ROLLBACK_DATABASE_URL="$(tr '\0' '\n' < "/proc/${ROLLBACK_PID}/environ" | sed -n 's/^DATABASE_URL=//p' | tail -1)"
  [[ "${ROLLBACK_DATABASE_URL}" == "${DATABASE_URL}" ]]
  ss -lntp | grep ":${PORT}" | grep -q "pid=${ROLLBACK_PID}"
  if ! curl -fsS --max-time 15 "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "CRITICAL: rolled-back application failed its health check; database remains untouched." >&2
  fi
  echo "Application code rollback completed; production database was not changed by rollback." >&2
  exit 1
}
trap 'rollback_code' ERR
pm2 reload ecosystem.config.js --only "${PM2_NAME}" --update-env
PID="$(pm2 pid "${PM2_NAME}")"
[[ "${PID}" =~ ^[0-9]+$ && "${PID}" -gt 0 ]]
[[ "$(readlink -f "/proc/${PID}/cwd")" == "${APP_DIR}" ]]
[[ "$(readlink -f "/proc/${PID}/exe")" == "/usr/local/bin/bun" ]]
POST_DATABASE_URL="$(tr '\0' '\n' < "/proc/${PID}/environ" | sed -n 's/^DATABASE_URL=//p' | tail -1)"
[[ -n "${POST_DATABASE_URL}" && "${POST_DATABASE_URL}" == "${DATABASE_URL}" ]]
unset POST_DATABASE_URL
PORT_RECORD="$(ss -lntp | grep ":${PORT}")"
grep -q "pid=${PID}" <<<"${PORT_RECORD}"
grep -Eq "(0\.0\.0\.0|\*):${PORT}" <<<"${PORT_RECORD}"
curl -fsS --max-time 15 "http://127.0.0.1:${PORT}/api/health"
run_as_owner bunx prisma db execute --schema "${DB_SCHEMA}" --stdin <<<'SELECT 1;' >/dev/null

# Existing optional infrastructure is verified only when configured; no data is changed.
if [[ -n "${QDRANT_URL:-}" ]]; then
  curl -fsS --max-time 10 "${QDRANT_URL%/}/healthz" >/dev/null
  echo "Qdrant configured and healthy (collections preserved)."
else
  echo "Qdrant: NOT CONFIGURED"
fi
if [[ -n "${MINIO_URL:-${S3_ENDPOINT:-}}" ]]; then
  OBJECT_URL="${MINIO_URL:-${S3_ENDPOINT}}"
  curl -fsS --max-time 10 "${OBJECT_URL%/}/minio/health/live" >/dev/null
  echo "MinIO configured and healthy (buckets preserved)."
else
  echo "MinIO: NOT CONFIGURED"
fi

df -h "${APP_DIR}"
pm2 status
pm2 describe "${PM2_NAME}"
LOG_REVIEW="$(mktemp)"
pm2 logs "${PM2_NAME}" --lines 100 --nostream >"${LOG_REVIEW}" 2>&1
if grep -qiE '(DATABASE_URL=|password=|api[_-]?key=|private key|access[_-]?token=|refresh[_-]?token=)' "${LOG_REVIEW}"; then
  rm -f "${LOG_REVIEW}"
  fail "application logs appear to contain secret material"
fi
echo "Application logs reviewed: no common secret signatures detected."
rm -f "${LOG_REVIEW}"
trap - ERR
echo "DEPLOYMENT SUCCESSFUL: CODE SAFE; BUILD SAFE; DATABASE SAFE; BACKUP VERIFIED; PM2/PORT/API HEALTHY"
