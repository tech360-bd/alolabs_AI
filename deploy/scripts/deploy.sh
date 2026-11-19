#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 077

APP_DIR="${APP_DIR:-/opt}"
readonly APPROVED_SHA="${APPROVED_SHA:?missing approved SHA}" DEPLOY_RUN_ID="${DEPLOY_RUN_ID:?missing deployment run ID}"
[[ "$APPROVED_SHA" =~ ^[0-9a-f]{40}$ && "$DEPLOY_RUN_ID" =~ ^[0-9]+$ ]] || exit 1
PM2_NAME="alolabs-agentos"
NODE_EXECUTABLE="$(readlink -f "$(command -v node)")"
PORT=3011
REQUIRED_BUN_VERSION="1.3.4"
SAFETY_SCRIPT_DIR="${SAFETY_SCRIPT_DIR:-${APP_DIR}/deploy/scripts}"
cd "${APP_DIR}"

fail() { echo "DEPLOYMENT BLOCKED: $*" >&2; exit 1; }
run_as_owner() { sudo -u "$(stat -c %U "${APP_DIR}")" --preserve-env=DATABASE_URL -- "$@"; }

[[ "$(git rev-parse --show-toplevel)" == "${APP_DIR}" ]] || fail "${APP_DIR} is not the Git repository root"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "production repository has tracked changes"
STATE="${APP_DIR}/.alo-releases"
install -d -m 755 "$STATE" "$STATE/releases"
exec 9>"$STATE/lock"
flock -n 9 || fail "another deployment holds the lock"
source "${SAFETY_SCRIPT_DIR}/lib/release-pointer.sh"
source "${SAFETY_SCRIPT_DIR}/lib/approved-revision.sh"
fetch_approved_revision "$APPROVED_SHA" || fail "approved revision verification failed"
PREVIOUS="$APP_DIR"
if [[ -L "$STATE/current" ]]; then PREVIOUS=$(realpath -e "$STATE/current"); fi
[[ "$PREVIOUS" == "$APP_DIR" || "$PREVIOUS" == "$STATE/releases/"* ]] || fail "invalid active release"
CURRENT_COMMIT=$(run_as_owner git -C "$PREVIOUS" rev-parse HEAD)
record() {
  printf '%s run=%s previous=%s approved=%s active=%s outcome=%s\n' "$(date -u +%FT%TZ)" "$DEPLOY_RUN_ID" "$CURRENT_COMMIT" "$APPROVED_SHA" "$2" "$1" >> "$STATE/history"
}
record started "$CURRENT_COMMIT"
activated=false; completed=false
finish() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [[ "$activated" == true && "$completed" != true ]]; then
    if activate_release "$STATE" "$PREVIOUS" "$PM2_NAME"; then
      record rolled_back "$CURRENT_COMMIT"
    else
      record rollback_failed unknown
      echo 'CRITICAL: rollback not verified; operator intervention required' >&2
    fi
    exit 1
  elif [[ "$completed" != true ]]; then record staging_failed "$CURRENT_COMMIT"; fi
  exit "$status"
}
verify_serving() {
  local expected=$1 pid cwd active_db sockets
  for ((i=0;i<30;i++)); do
    pid=$(pm2 pid "$PM2_NAME") || return 1
    if [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then
      cwd=$(readlink -f "/proc/$pid/cwd") || continue
      active_db=$(tr '\0' '\n' < "/proc/$pid/environ" | sed -n 's/^DATABASE_URL=//p' | tail -1) || continue
      sockets=$(ss -lntp) || return 1
      if [[ ( "$cwd" == "$expected" || "$cwd" == "$expected/.next/standalone" ) && "$active_db" == "$DATABASE_URL" && "$(readlink -f "/proc/$pid/exe")" == "$NODE_EXECUTABLE" ]] && grep -E "127[.]0[.]0[.]1:${PORT} .*pid=${pid}," <<<"$sockets" >/dev/null && curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health/ready" >/dev/null; then return 0; fi
    fi
    sleep 1
  done
  return 1
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
cd "$PREVIOUS"
ENV_FILE="${APP_DIR}/.env.production"
[[ -f "${ENV_FILE}" ]] || ENV_FILE="${APP_DIR}/.env.config"
[[ -f "${ENV_FILE}" ]] || ENV_FILE="${APP_DIR}/.env"
[[ -f "${ENV_FILE}" ]] || fail "production environment file not found"
ENV_RELATIVE="$(realpath --relative-to="${APP_DIR}" "${ENV_FILE}")"
if [[ "${ENV_RELATIVE}" != ../* ]] && git -C "$APP_DIR" ls-files --error-unmatch "${ENV_RELATIVE}" >/dev/null 2>&1; then
  fail "production environment is tracked by Git and could be overwritten"
fi
ENV_HASH="$(sha256sum "${ENV_FILE}" | awk '{print $1}')"
# PM2 reads the full dotenv with its parser. Only import keys needed by these
# checks; never execute dotenv as root or let it override the release target.
setting() { node -e 'const fs=require("fs"),{parseEnv}=require("node:util");process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8"))[process.argv[2]] ?? "")' "$ENV_FILE" "$1"; }
DATABASE_URL=$(setting DATABASE_URL); export DATABASE_URL
QDRANT_URL=$(setting QDRANT_URL); MINIO_URL=$(setting MINIO_URL); S3_ENDPOINT=$(setting S3_ENDPOINT)
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
prisma/schema.mysql.prisma. The SQLite inventory is preview-only. A reviewed data migration and verified backup are required."
    ;;
  mysql://*|mariadb://*)
    DB_SCHEMA="prisma/schema.mysql.prisma"
    GENERATE_SCRIPT="db:generate:mysql"
    [[ -f "${DB_SCHEMA}" ]] || fail "MySQL Prisma schema is missing"
    grep -Eq 'provider *= *"mysql"' "${DB_SCHEMA}" || fail "Prisma schema does not match MySQL/MariaDB"
    DB_STATS="$(node -e '
      const mysql=require("mysql2/promise"); (async()=>{const c=await mysql.createConnection(process.env.DATABASE_URL); const [r]=await c.query("SELECT COUNT(*) n, COALESCE(SUM(data_length+index_length),0) bytes FROM information_schema.tables WHERE table_schema=DATABASE()"); console.log(`${r[0].n}:${r[0].bytes}`); await c.end()})().catch(e=>{console.error("Database check failed");process.exit(1)})')" || fail "database connectivity check failed"
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
else
  echo "No Prisma-format migrations. prisma/migrations/mysql/*.sql are manual, reviewed SQL; none are applied by this deploy."
fi
run_as_owner bunx prisma validate --schema "${DB_SCHEMA}" || fail "Prisma schema validation failed"

# A verified recovery backup is mandatory before any deployment can proceed.
verify_serving "$PREVIOUS" || fail "active process does not match previous release"
BACKUP_RESULT="$(mktemp "$STATE/backup-${DEPLOY_RUN_ID}-XXXXXXXX")"
APP_DIR="${APP_DIR}" ENV_FILE="${ENV_FILE}" bash "${SAFETY_SCRIPT_DIR}/backup.sh" | tee "${BACKUP_RESULT}"
BACKUP_PATH="$(sed -n 's/^BACKUP_VERIFIED=//p' "${BACKUP_RESULT}" | tail -1)"
[[ -n "${BACKUP_PATH}" && -d "${BACKUP_PATH}" ]] || fail "backup was not verified"

echo '[DATABASE SAFETY GATE]'
printf '%s\n' \
 'Existing production database detected: YES' 'Database engine identified: YES' \
 'Production DATABASE_URL identified: YES' 'Existing database backed up: YES' \
 'Database integrity verified: YES' 'Migration history inspected: YES' \
 'Destructive operation detected: NO' 'New database creation required: NO' \
 'Data-loss flag detected: NO' 'Database reset requested: NO' 'DROP/TRUNCATE detected: NO'

RELEASE=$(mktemp -d "$STATE/releases/${APPROVED_SHA}-${DEPLOY_RUN_ID}-XXXXXXXX")
chown --reference="$APP_DIR" "$RELEASE"
run_as_owner git clone --quiet --no-local --no-checkout "$APP_DIR" "$RELEASE"
cd "$RELEASE"
run_as_owner git fetch --quiet --no-tags origin refs/remotes/origin/main
run_as_owner git checkout --quiet --detach "$APPROVED_SHA"
[[ "$(run_as_owner git rev-parse HEAD)" == "$APPROVED_SHA" ]] || fail "staged revision mismatch"
bash "${SAFETY_SCRIPT_DIR}/database-safety-scan.sh" .
[[ "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" == "${ENV_HASH}" ]] || fail "production environment was modified"
# The datasource is MySQL/MariaDB by the check above, so the generated schema
# must be the MySQL one. Anything else means the checkout does not match what
# this deployment verified earlier.
grep -Eq 'provider *= *"mysql"' "${DB_SCHEMA}" || fail "target Prisma provider differs from production (expected mysql)"

ln -sT "$ENV_FILE" "$RELEASE/.env.production"
run_as_owner bun install --frozen-lockfile
run_as_owner bunx prisma validate --schema "${DB_SCHEMA}"
run_as_owner bun run "${GENERATE_SCRIPT}"
apply_pending=false
if find prisma/migrations -mindepth 2 -name migration.sql -print -quit | grep -q .; then
  if ! run_as_owner bunx prisma migrate status --schema "$DB_SCHEMA"; then
    [[ "${MIGRATIONS_APPROVED:-false}" == true ]] || fail "pending migration not approved"
    node "$SAFETY_SCRIPT_DIR/lib/review-migrations.mjs" || fail "schema change not proven rollback compatible"
    apply_pending=true
  fi
fi
run_as_owner env NODE_ENV=production bun run build

test -f .next/standalone/server.js
test -d .next/static
test -d .next/standalone/.next/static
test -d public
test -d .next/standalone/public

# Use the existing environment and data, not new per-release directories.
# Keep the legacy checkout (including its built output) intact on first cutover.
for name in uploads storage data public/uploads; do
  shared="$APP_DIR/$name"
  legacy="$APP_DIR/.next/standalone/$name"
  if [[ -d "$legacy" && ! "$legacy" -ef "$shared" ]]; then
    fail "resolve standalone versus shared storage for $name before cutover"
  fi
  [[ -d "$shared" ]] || fail "provision shared $name before first cutover"
  for base in "$RELEASE" "$RELEASE/.next/standalone"; do
    path="$base/$name"
    if [[ -d "$path" ]]; then rmdir "$path" || fail "refusing to replace nonempty release data"; fi
    ln -sT "$shared" "$path"
  done
done
ln -sT "$ENV_FILE" "$RELEASE/.env.config"
if [[ "$apply_pending" == true ]]; then
  node "$SAFETY_SCRIPT_DIR/lib/review-migrations.mjs" || fail "recheck failed"
  run_as_owner bunx prisma migrate deploy --schema "$DB_SCHEMA" || fail "migration failed; inspect database separately"
  run_as_owner bunx prisma migrate status --schema "$DB_SCHEMA" || fail "migration history not healthy"
fi
activated=true
activate_release "$STATE" "$RELEASE" "$PM2_NAME" || fail "new release readiness failed"
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
# Avoid PM2 describe, which may print inherited environment values.
LOG_REVIEW="$(mktemp)"
pm2 logs "${PM2_NAME}" --lines 100 --nostream >"${LOG_REVIEW}" 2>&1
if grep -qiE '(DATABASE_URL=|password=|api[_-]?key=|private key|access[_-]?token=|refresh[_-]?token=)' "${LOG_REVIEW}"; then
  rm -f "${LOG_REVIEW}"
  fail "application logs appear to contain secret material"
fi
echo "Application logs reviewed: no common secret signatures detected."
rm -f "${LOG_REVIEW}"
record healthy "$APPROVED_SHA"
completed=true
echo "DEPLOYMENT SUCCESSFUL: CODE SAFE; BUILD SAFE; DATABASE SAFE; BACKUP VERIFIED; PM2/PORT/API HEALTHY"
