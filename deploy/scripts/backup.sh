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
set -euo pipefail

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

[[ -f "${ENV_FILE}" ]] || ENV_FILE="${APP_DIR}/.env"
[[ -f "${ENV_FILE}" ]] || { echo "ERROR: production environment file not found" >&2; exit 1; }
ENV_FILE="$(alo_canonical_path "${ENV_FILE}")"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "ERROR: DATABASE_URL is not configured" >&2; exit 1; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="${BACKUP_DIR}/${stamp}"
install -d -m 700 "${dest}"
printf '%s\n' "$(git -C "${APP_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)" > "${dest}/commit.txt"

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
    node -e '
      const u=new URL(process.env.DATABASE_URL);
      for (const [k,v] of Object.entries({host:u.hostname,port:u.port||"3306",user:decodeURIComponent(u.username),pass:decodeURIComponent(u.password),name:u.pathname.slice(1)}))
        process.stdout.write(`${k}=${JSON.stringify(v)}\n`)' > "${dest}/db.env"
    # shellcheck disable=SC1090
    source "${dest}/db.env"
    MYSQL_PWD="${pass}" mysqldump --single-transaction --routines --triggers \
      -h "${host}" -P "${port}" -u "${user}" "${name}" | gzip -9 > "${dest}/database.sql.gz"
    gzip -t "${dest}/database.sql.gz"
    [[ -s "${dest}/database.sql.gz" ]] || { echo "ERROR: database dump is empty" >&2; exit 1; }
    rm -f "${dest}/db.env"
    ;;
  *) echo "ERROR: unsupported production database provider" >&2; exit 1 ;;
esac

# Preserve the provider's data AND .metadata ownership records. The previous
# archive omitted the local provider's default `uploads/` directory.
storage_paths=()
for candidate in storage data public/uploads uploads; do
  [[ -d "${APP_DIR}/${candidate}" ]] && storage_paths+=("${candidate}")
done
external_storage=false
if [[ "${STORAGE_PROVIDER:-local}" == local ]]; then
  configured="${STORAGE_LOCAL_PATH:-./uploads}"
  [[ "${configured}" = /* ]] || configured="${APP_DIR}/${configured#./}"
  configured="$(alo_canonical_path "${configured}")"
  if [[ -d "${configured}" ]]; then
    # `realpath --relative-to` equivalent — both sides are canonical.
    relative="$(alo_relative_path "${APP_DIR}" "${configured}")"
    if [[ "${relative}" == ../* || "${relative}" == .. ]]; then
      [[ "${configured}" != "${BACKUP_DIR}"* ]] || { echo "ERROR: storage points into backup directory" >&2; exit 1; }
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

# Checksums detect corruption of the captured files; a separate, isolated
# restore and application smoke test are still mandatory for release.
# `sha256sum` (GNU) / `shasum -a 256` (macOS) both emit "<hex>  <file>".
(
  cd "${dest}"
  for file in database.sqlite database.sql.gz application-storage.tar.gz configured-storage.tar.gz; do
    [[ ! -f "${file}" ]] || alo_sha256 "${file}"
  done
) > "${dest}/SHA256SUMS"
[[ -s "${dest}/SHA256SUMS" ]] || { echo "ERROR: no backup checksum was recorded" >&2; exit 1; }
alo_sha256_verify "${dest}" SHA256SUMS >/dev/null
printf '{"created_at":"%s","commit":"%s","database_backup_verified":true,"storage_included":%s,"external_storage_included":%s,"checksum_manifest":"SHA256SUMS","restore_tested":false}\n' \
  "$(date -u +%FT%TZ)" "$(cat "${dest}/commit.txt")" \
  "$( (( ${#storage_paths[@]} > 0 )) && echo true || echo false )" \
  "${external_storage}" > "${dest}/manifest.json"
chmod -R go-rwx "${dest}"

# Conservative retention: retain at least the 14 newest verified backups and
# only prune older verified sets after a newer verified set exists.
# `find -printf` is GNU-only; sort by the portable epoch mtime instead.
verified_backups=()
while IFS= read -r item; do
  [[ -n "${item}" ]] || continue
  [[ -s "${item}/manifest.json" ]] || continue
  [[ -s "${item}/database.sqlite" || -s "${item}/database.sql.gz" ]] || continue
  verified_backups+=("${item}")
done < <(
  find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null |
    while IFS= read -r entry; do
      printf '%s\t%s\n' "$(alo_file_mtime "${entry}")" "${entry}"
    done | sort -rn | cut -f2-
)
if (( ${#verified_backups[@]} > 14 )); then
  for old in "${verified_backups[@]:14}"; do
    [[ "$(find "${old}" -maxdepth 0 -mtime +14 -print)" == "${old}" ]] || continue
    alo_remove_tree "${old}" "${BACKUP_DIR}"
  done
fi

echo "BACKUP_VERIFIED=${dest}"
