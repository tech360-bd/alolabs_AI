#!/usr/bin/env bash
# ============================================================
# ALO Labs AgentOS — verified application backup
#
# Cross-platform: Linux (GNU coreutils) and macOS (BSD userland). Every
# GNU-only construct was removed — `realpath -m`, `realpath --relative-to`,
# `readlink -f`, `find -printf`, `stat -c` and `sha256sum` are provided by
# `lib/portable-coreutils.sh`, which reproduces their semantics with tools
# that exist on both platforms. Path canonicalization and the traversal
# protections that depend on it are unchanged.
#
# The script never creates, resets or replaces a database: it reads the
# active database with SQLite's online backup API (or a transactional
# mysqldump) and writes a NEW snapshot directory.
# ============================================================
set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/portable-coreutils.sh
source "${SCRIPT_DIR}/lib/portable-coreutils.sh"
alo_checksum_init

APP_DIR="${APP_DIR:-/opt}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.production}"

# Canonicalize before ANY comparison: on macOS `/tmp` is a symlink into
# `/private/tmp`, so comparing raw paths would report a storage directory as
# "outside" the application directory when it is not.
APP_DIR="$(alo_canonical_path "${APP_DIR}")"
BACKUP_DIR="$(alo_canonical_path "${BACKUP_DIR}")"

[[ -f "${ENV_FILE}" ]] || ENV_FILE="${APP_DIR}/.env.config"
[[ -f "${ENV_FILE}" ]] || ENV_FILE="${APP_DIR}/.env"
[[ -f "${ENV_FILE}" ]] || { echo "ERROR: production environment file not found" >&2; exit 1; }
ENV_FILE="$(alo_canonical_path "${ENV_FILE}")"

# Read only required keys as data; production dotenv is not a shell program.
read_setting() {
  node -e 'const fs=require("node:fs"),{parseEnv}=require("node:util");const k=process.argv[2];process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8"))[k] ?? process.env[k] ?? "")' "$ENV_FILE" "$1"
}
DATABASE_URL="$(read_setting DATABASE_URL)"; export DATABASE_URL
STORAGE_LOCAL_PATH="$(read_setting STORAGE_LOCAL_PATH)"
STORAGE_PROVIDER="$(read_setting STORAGE_PROVIDER)"
[[ -n "${DATABASE_URL:-}" ]] || { echo "ERROR: DATABASE_URL is not configured" >&2; exit 1; }

# ─── Preflight ───────────────────────────────────────────────────────────────
# `--preflight` answers one question: is this host able to produce a verified
# backup right now, and if not, exactly which prerequisite is missing? The
# scheduled workflow runs this before the backup so a failure names its cause
# instead of collapsing into a non-zero exit code.
preflight() {
  local failures=0
  ok()   { printf 'PREFLIGHT OK   %s\n' "$*"; }
  warn() { printf 'PREFLIGHT WARN %s\n' "$*"; }
  bad()  { printf 'PREFLIGHT FAIL %s\n' "$*" >&2; failures=$((failures + 1)); }

  printf 'PREFLIGHT app_dir=%s\n' "${APP_DIR}"
  printf 'PREFLIGHT backup_dir=%s\n' "${BACKUP_DIR}"
  printf 'PREFLIGHT env_file=%s\n' "${ENV_FILE}"
  case "$DATABASE_URL" in mysql:*|mariadb:*|file:*) printf 'PREFLIGHT database_provider=%s\n' "${DATABASE_URL%%:*}" ;; *) echo 'PREFLIGHT database_provider=unknown' ;; esac
  command -v python3 >/dev/null || bad "python3 required for verified atomic publication"

  [[ -d "${APP_DIR}" ]] && ok "application directory exists" || bad "application directory is missing"
  if [[ -d "${APP_DIR}/.git" ]]; then
    ok "git repository detected (commit ${preflight_commit})"
  else
    warn "no .git directory — the backup records 'unknown' as its commit"
  fi

  case "${DATABASE_URL}" in
    file:*)
      local db="${DATABASE_URL#file:}"
      [[ "${db}" = /* ]] || db="${APP_DIR}/${db#./}"
      if [[ -f "${db}" && -s "${db}" ]]; then
        ok "SQLite database present ($(wc -c < "${db}") bytes)"
      else
        bad "SQLite database missing or empty at ${db}"
      fi
      if command -v sqlite3 >/dev/null; then
        ok "sqlite3 available ($(sqlite3 --version 2>/dev/null | head -n 1))"
      elif command -v python3 >/dev/null; then
        ok "python3 available for the SQLite online-backup fallback"
      else
        bad "neither sqlite3 nor python3 is installed"
      fi
      ;;
    mysql://*|mariadb://*)
      if command -v mysqldump >/dev/null; then
        ok "mysqldump available ($(mysqldump --version 2>/dev/null | head -n 1))"
      else
        bad "mysqldump is not installed"
      fi
      command -v node >/dev/null && ok "node available (DATABASE_URL parsing)" || bad "node is not installed"
      ;;
    *)
      bad "unsupported database provider in DATABASE_URL"
      ;;
  esac

  if install -d -m 700 "${BACKUP_DIR}" 2>/dev/null && [[ -w "${BACKUP_DIR}" ]]; then
    ok "backup directory is writable"
    local available_kb required_kb
    available_kb="$(df -Pk "${BACKUP_DIR}" 2>/dev/null | awk 'NR==2 {print $4}')"
    # A verified snapshot needs room for the database dump + compressed storage
    # archive at the same time. The old 512 MiB floor passed preflight on hosts
    # where the dump could not possibly fit, and the failure then surfaced as a
    # truncated backup instead of a clear message. Require 2 GiB by default;
    # override with ALO_BACKUP_MIN_FREE_MB on unusually small databases.
    required_kb=$(( ${ALO_BACKUP_MIN_FREE_MB:-2048} * 1024 ))
    if [[ "${available_kb:-0}" =~ ^[0-9]+$ ]] && (( available_kb >= required_kb )); then
      ok "free disk space: $(( available_kb / 1024 )) MiB (need $(( required_kb / 1024 )) MiB)"
    else
      warn "free disk space is below $(( required_kb / 1024 )) MiB or could not be measured (${available_kb:-unknown} KiB)"
    fi
  else
    bad "backup directory is not writable"
  fi

  if (( failures > 0 )); then
    printf 'PREFLIGHT FAILED: %d prerequisite(s) missing\n' "${failures}" >&2
    return 1
  fi
  printf 'PREFLIGHT PASSED\n'
  return 0
}

if [[ "${1:-}" == "--preflight" ]]; then
  preflight_commit="$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  preflight
  exit $?
fi

# ─── Options ─────────────────────────────────────────────────────────────────
# `--no-verify-restore` skips the isolated restore check. It exists for hosts whose
# database cannot be restored in place (a MySQL dump needs a scratch server); the
# default is to verify, because "uploaded" is not the same as "recoverable".
verify_restore=true
for arg in "$@"; do
  case "$arg" in
    --verify-restore) verify_restore=true ;;
    --no-verify-restore) verify_restore=false ;;
    *) echo "ERROR: unknown option ${arg}" >&2; exit 2 ;;
  esac
done

# ─── Status reporting ────────────────────────────────────────────────────────
# When ALO_OPS_STATUS_URL and BACKUP_INGEST_TOKEN are configured, every attempt is
# reported to the application so that a backup cannot fail unobserved. Reporting is
# best-effort: a good backup is never discarded because the report failed, and a
# failed report is printed (not swallowed) so it can be fixed.
STAGE="start"
report() {
  local status="$1" excerpt="${2:-}"
  [[ -n "${ALO_OPS_STATUS_URL:-}" && -n "${BACKUP_INGEST_TOKEN:-}" ]] || return 0
  ALO_STATUS="$status" ALO_STAGE="$STAGE" ALO_EXCERPT="$excerpt" ALO_MANIFEST="${manifest_path:-}" \
  ALO_CHECKSUM="${ALO_CHECKSUM:-}" \
  python3 - <<'PYREPORT' || printf 'WARN: backup status report failed (see HTTP status above)\n' >&2
import json, os, time
manifest = {}
path = os.environ.get('ALO_MANIFEST') or ''
if path and os.path.exists(path):
    try:
        manifest = json.load(open(path))
    except Exception:
        manifest = {}
size = manifest.get('artifact_bytes')
payload = {
    'status': os.environ['ALO_STATUS'],
    'stage': os.environ['ALO_STAGE'],
    'source': 'manual',
    'startedAt': os.environ.get('ALO_STARTED_AT') or None,
    'finishedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'commit': manifest.get('commit') or os.environ.get('ALO_COMMIT') or None,
    'databaseProvider': manifest.get('database_provider') or None,
    'artifactPath': manifest.get('artifact_path') or None,
    'artifactBytes': size if isinstance(size, int) else None,
    'checksum': os.environ.get('ALO_CHECKSUM') or None,
    'restoreTested': bool(manifest.get('restore_tested')),
}
if manifest.get('restore_verified_at'):
    payload['restoreVerifiedAt'] = manifest['restore_verified_at']
excerpt = os.environ.get('ALO_EXCERPT') or ''
if excerpt:
    payload['failureExcerpt'] = excerpt[-1500:]
payload = {k: v for k, v in payload.items() if v is not None}
import urllib.request
request = urllib.request.Request(
    os.environ['ALO_OPS_STATUS_URL'].rstrip('/') + '/api/ops/backups/ingest',
    data=json.dumps(payload).encode(),
    headers={'content-type': 'application/json', 'authorization': 'Bearer ' + os.environ['BACKUP_INGEST_TOKEN']},
    method='POST',
)
try:
    with urllib.request.urlopen(request, timeout=15) as response:
        print('BACKUP_STATUS_REPORTED=%s' % response.status)
except Exception as error:
    print('WARN: backup status report failed: %s' % error, flush=True)
    raise SystemExit(1)
PYREPORT
}

on_error() {
  local code=$?
  report failed "backup failed during stage ${STAGE} (exit ${code})"
  exit "${code}"
}
trap on_error ERR

ALO_STARTED_AT="$(date -u +%FT%TZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
command -v python3 >/dev/null || { echo "ERROR: python3 required for snapshot publication" >&2; exit 1; }
install -d -m 700 "${BACKUP_DIR}"
dest="$(mktemp -d "${BACKUP_DIR}/.stage-${stamp}-XXXXXXXX")"
final="${BACKUP_DIR}/${dest##*/.stage-}"
trap '[[ ! -d "$dest" ]] || alo_remove_tree "$dest" "$BACKUP_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
revision_dir=$APP_DIR
if [[ -L "$APP_DIR/.alo-releases/current" ]]; then revision_dir="$APP_DIR/.alo-releases/current"; fi
printf '%s\n' "$(git -C "$revision_dir" rev-parse HEAD 2>/dev/null || echo unknown)" > "${dest}/commit.txt"

STAGE="dump"
case "${DATABASE_URL}" in
  file:*)
    db="${DATABASE_URL#file:}"
    [[ "${db}" = /* ]] || db="${APP_DIR}/${db#./}"
    db="$(alo_canonical_path "${db}")"
    [[ -f "${db}" && -s "${db}" ]] || { echo "ERROR: active SQLite database is missing or empty" >&2; exit 1; }
    # The online SQLite backup API includes committed WAL data. Python is an
    # explicit fallback for hosts without the sqlite3 command-line program.
    if command -v sqlite3 >/dev/null; then
      [[ "$(sqlite3 "${db}" 'PRAGMA integrity_check;')" == "ok" ]] || { echo "ERROR: SQLite integrity check failed" >&2; exit 1; }
      sqlite3 "${db}" ".backup '${dest}/database.sqlite'"
      [[ -s "${dest}/database.sqlite" ]] || { echo "ERROR: SQLite backup verification failed" >&2; exit 1; }
      sqlite3 "${dest}/database.sqlite" 'PRAGMA integrity_check;' | grep -qx ok
    else
      command -v python3 >/dev/null || { echo "ERROR: SQLite backup requires sqlite3 or python3" >&2; exit 1; }
      python3 - "${db}" "${dest}/database.sqlite" <<'PYSQL'
import sqlite3, sys
from pathlib import Path
source, destination = sys.argv[1:]
with sqlite3.connect(f'file:{source}?mode=ro', uri=True) as original:
    if original.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('SQLite source integrity check failed')
    with sqlite3.connect(destination) as backup:
        original.backup(backup)
with sqlite3.connect(f'file:{destination}?mode=ro', uri=True) as backup:
    if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('SQLite backup integrity check failed')
PYSQL
    fi
    ;;
  mysql://*|mariadb://*)
    command -v mysqldump >/dev/null || { echo "ERROR: mysqldump is unavailable" >&2; exit 1; }
    node "${SCRIPT_DIR}/lib/mysql-dump.mjs" options | node "${SCRIPT_DIR}/lib/mysql-dump.mjs" | gzip -9 > "${dest}/database.sql.gz"
    gzip -t "${dest}/database.sql.gz"
    [[ -s "${dest}/database.sql.gz" ]] || { echo "ERROR: database dump is empty" >&2; exit 1; }
    gzip -cd "${dest}/database.sql.gz" | wc -c | grep -Eq '[1-9]' || { echo "ERROR: empty database dump" >&2; exit 1; }
    ;;
  *) echo "ERROR: unsupported production database provider" >&2; exit 1 ;;
esac

STAGE="storage"
# Preserve the provider's data AND .metadata ownership records. The previous
# archive omitted the local provider's default `uploads/` directory.
check_storage_root() {
  local path
  path=$(alo_canonical_path "$1")
  case "$path/" in "$BACKUP_DIR/"*) echo 'ERROR: storage points into backup directory' >&2; return 1 ;; esac
  case "$BACKUP_DIR/" in "$path/"*) echo 'ERROR: storage contains backup directory' >&2; return 1 ;; esac
  case "$APP_DIR/" in "$path/"*) echo 'ERROR: storage contains application configuration' >&2; return 1 ;; esac
}
storage_paths=()
for candidate in storage data public/uploads uploads; do
  if [[ -d "${APP_DIR}/${candidate}" ]]; then
    check_storage_root "${APP_DIR}/${candidate}"
    [[ ! -L "${APP_DIR}/${candidate}" ]] || { echo 'ERROR: shared storage mapping needs independent snapshot' >&2; exit 1; }
    storage_paths+=("${candidate}")
  fi
done
external_storage=false
if [[ "${STORAGE_PROVIDER:-local}" == local ]]; then
  configured="${STORAGE_LOCAL_PATH:-./uploads}"
  [[ "${configured}" = /* ]] || configured="${APP_DIR}/${configured#./}"
  configured="$(alo_canonical_path "${configured}")"
  if [[ -d "${configured}" ]]; then
    check_storage_root "$configured"
    # `realpath --relative-to` equivalent — both sides are canonical.
    relative="$(alo_relative_path "${APP_DIR}" "${configured}")"
    if [[ "${relative}" == ../* || "${relative}" == .. ]]; then
      tar -C "${configured}" -czf "${dest}/configured-storage.tar.gz" .
      tar -tzf "${dest}/configured-storage.tar.gz" >/dev/null
      external_storage=true
    elif [[ "${relative}" != . ]]; then
      already=false
      for candidate in ${storage_paths[@]+"${storage_paths[@]}"}; do
        [[ "${candidate}" == "${relative}" || "${relative}" == "${candidate}/"* ]] && already=true
      done
      [[ "${already}" == true ]] || storage_paths+=("${relative}")
    fi
  fi
fi
if (( ${#storage_paths[@]} > 0 )); then
  tar -C "${APP_DIR}" -czf "${dest}/application-storage.tar.gz" "${storage_paths[@]}"
  tar -tzf "${dest}/application-storage.tar.gz" >/dev/null
fi

STAGE="restore"
# ─── Isolated restore verification ───────────────────────────────────────────
# A snapshot is only proven recoverable by restoring it somewhere else and reading
# it back. For a single-file SQLite database that is cheap and always possible; for
# a MySQL dump it needs a scratch server, which the deploy host does not have, so the
# dump is verified for completeness and the manifest says plainly that a restore was
# not performed instead of implying it was.
restore_tested=false
restore_detail="skipped"
restore_verified_at=""
if [[ "${verify_restore}" == true ]]; then
  case "${DATABASE_URL}" in
    file:*)
      restore_dir="$(mktemp -d "${BACKUP_DIR}/.restore-${stamp}-XXXXXXXX")"
      trap 'alo_remove_tree "${restore_dir:-/nonexistent}" "${BACKUP_DIR}" 2>/dev/null || true' EXIT
      cp "${dest}/database.sqlite" "${restore_dir}/restored.sqlite"
      chmod 600 "${restore_dir}/restored.sqlite"
      if command -v sqlite3 >/dev/null; then
        [[ "$(sqlite3 "${restore_dir}/restored.sqlite" 'PRAGMA integrity_check;')" == "ok" ]] \
          || { echo "ERROR: restored database failed its integrity check" >&2; exit 1; }
        tables="$(sqlite3 "${restore_dir}/restored.sqlite" "SELECT count(*) FROM sqlite_master WHERE type='table';")"
      else
        tables="$(python3 - "${restore_dir}/restored.sqlite" <<'PYRESTORE'
import sqlite3, sys
with sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True) as restored:
    if restored.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise SystemExit('restored database failed its integrity check')
    print(restored.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0])
PYRESTORE
)"
      fi
      [[ "${tables:-0}" =~ ^[0-9]+$ ]] && (( tables > 0 )) \
        || { echo "ERROR: restored database contains no tables" >&2; exit 1; }
      restore_tested=true
      restore_detail="restored into an isolated directory and read back: ${tables} tables, integrity ok"
      restore_verified_at="$(date -u +%FT%TZ)"
      alo_remove_tree "${restore_dir}" "${BACKUP_DIR}" 2>/dev/null || true
      restore_dir=""
      ;;
    mysql://*|mariadb://*)
      restore_detail="not performed: a MySQL restore needs a scratch server (run deploy/scripts/restore.sh against one)"
      printf 'WARN: %s\n' "${restore_detail}" >&2
      ;;
  esac
fi

STAGE="publish"
# Checksums detect corruption of the captured files; a separate, isolated
# restore and application smoke test are still mandatory for release.
# `sha256sum` (GNU) / `shasum -a 256` (macOS) both emit "<hex>  <file>".
ALO_COMMIT_VALUE="$(cat "${dest}/commit.txt")" \
ALO_STORAGE_INCLUDED="$( (( ${#storage_paths[@]} > 0 )) && echo true || echo false )" \
ALO_EXTERNAL_STORAGE="${external_storage}" \
ALO_RESTORE_TESTED="${restore_tested}" \
ALO_RESTORE_DETAIL="${restore_detail}" \
ALO_RESTORE_AT="${restore_verified_at}" \
ALO_ARTIFACT_BYTES="$(wc -c < "${dest}/database.sqlite" 2>/dev/null || wc -c < "${dest}/database.sql.gz")" \
ALO_DB_PROVIDER="$(case "${DATABASE_URL}" in file:*) echo sqlite ;; mysql://*) echo mysql ;; mariadb://*) echo mariadb ;; *) echo unknown ;; esac)" \
python3 - "${dest}/manifest.json" "${final}" <<'PYMANIFEST'
import json, os, sys, time
manifest = {
    'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'commit': os.environ['ALO_COMMIT_VALUE'],
    'database_backup_verified': True,
    'storage_included': os.environ['ALO_STORAGE_INCLUDED'] == 'true',
    'external_storage_included': os.environ['ALO_EXTERNAL_STORAGE'] == 'true',
    'checksum_manifest': 'SHA256SUMS',
    'database_provider': os.environ['ALO_DB_PROVIDER'],
    'artifact_bytes': int(os.environ.get('ALO_ARTIFACT_BYTES') or 0),
    'artifact_path': sys.argv[2],
    'restore_tested': os.environ['ALO_RESTORE_TESTED'] == 'true',
    'restore_detail': os.environ['ALO_RESTORE_DETAIL'],
}
if os.environ.get('ALO_RESTORE_AT'):
    manifest['restore_verified_at'] = os.environ['ALO_RESTORE_AT']
with open(sys.argv[1], 'w') as handle:
    json.dump(manifest, handle, sort_keys=True)
    handle.write('\n')
PYMANIFEST
(
  cd "${dest}"
  for file in manifest.json commit.txt database.sqlite database.sql.gz application-storage.tar.gz configured-storage.tar.gz; do
    [[ ! -f "${file}" ]] || alo_sha256 "${file}"
  done
) > "${dest}/SHA256SUMS"
[[ -s "${dest}/SHA256SUMS" ]] || { echo "ERROR: no backup checksum was recorded" >&2; exit 1; }
alo_sha256_verify "${dest}" SHA256SUMS >/dev/null
STAGE="publish"
python3 "${SCRIPT_DIR}/lib/publish-snapshot.py" "$dest" "$final"
manifest_path="${final}/manifest.json"
# One value that changes whenever any artifact, or the artifact list, changes.
ALO_CHECKSUM="$(alo_sha256 "${final}/SHA256SUMS" | awk '{print $1}')"
STAGE="report"
report succeeded
echo "BACKUP_VERIFIED=${final}"
