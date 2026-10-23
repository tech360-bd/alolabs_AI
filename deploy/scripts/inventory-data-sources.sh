#!/usr/bin/env bash
# Read-only recovery inventory for a production host. Never prints credential
# contents or business-row contents; it reports paths, metadata, schema and counts.
set -euo pipefail
umask 077

DB_NAME="${ALO_DB_NAME:-alolabs_ai_prod}"
MYSQL_DEFAULTS_FILE="${MYSQL_DEFAULTS_FILE:-/root/alolabs-ai-db-credentials}"
MAX_FILES="${MAX_INVENTORY_FILES:-300}"
ROOTS=("${@:-}")
if (( ${#ROOTS[@]} == 0 )) || [[ -z "${ROOTS[0]}" ]]; then
  ROOTS=(/opt /home /srv /mnt /backup /backups /var/backups /var/lib/alolabs /root)
fi

printf 'ALO Labs data-source inventory (READ ONLY)\n'
printf 'database_name=%s\n' "$DB_NAME"
printf 'credential_contents=never displayed or copied\n'
printf 'search_roots=%s\n' "${ROOTS[*]}"
printf '\nSQLite files, SQL dumps and backup archives:\n'

mapfile -d '' -t candidate_files < <(
  find "${ROOTS[@]}" -type f \( \
    -iname '*.db' -o -iname '*.sqlite' -o -iname '*.sqlite3' -o \
    -iname '*.db-wal' -o -iname '*.sqlite-wal' -o \
    -iname '*.sql' -o -iname '*.sql.gz' -o -iname '*.dump' -o \
    -iname '*.bak' -o -iname '*.backup' -o -iname '*.tar.gz' -o -iname '*.tgz' \
  \) -print0 2>/dev/null | head -z -n "$MAX_FILES"
)

if (( ${#candidate_files[@]} == 0 )); then
  echo 'file_candidates=0 (no matching files in the requested roots)'
else
  for file in "${candidate_files[@]}"; do
    [[ -f "$file" ]] || continue
    bytes=$(stat -c '%s' -- "$file" 2>/dev/null || stat -f '%z' -- "$file" 2>/dev/null || echo unknown)
    modified=$(stat -c '%y' -- "$file" 2>/dev/null || stat -f '%Sm' -- "$file" 2>/dev/null || echo unknown)
    printf 'FILE path=%q bytes=%s modified=%q\n' "$file" "$bytes" "$modified"

    case "${file,,}" in
      *.db|*.sqlite|*.sqlite3)
        if command -v python3 >/dev/null 2>&1; then
          python3 - "$file" <<'PY'
import sqlite3, sys
from pathlib import Path
path = sys.argv[1]
try:
    uri = Path(path).resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True, timeout=3) as con:
        integrity = con.execute('PRAGMA integrity_check').fetchone()[0]
        fk_violations = con.execute('SELECT COUNT(*) FROM pragma_foreign_key_check').fetchone()[0]
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        migration = None
        if '_prisma_migrations' in tables:
            row = con.execute('SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1').fetchone()
            migration = row[0] if row else None
        counts = {}
        for table in ('Department','Agent','AIEmployeeIdentity','Task','TaskStep','Workflow','AgentRun','AgentExecution','AgentOSRun','RunEvent','ToolRun','AuditEvent'):
            match = next((t for t in tables if t.lower() == table.lower()), None)
            if match:
                q = '"' + match.replace('"', '""') + '"'
                counts[table] = con.execute(f'SELECT COUNT(*) FROM {q}').fetchone()[0]
        if any(t.lower() == 'agentrun' for t in tables):
            table = next(t for t in tables if t.lower() == 'agentrun')
            cols = {r[1].lower(): r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
            if 'status' in cols and 'output' in cols:
                q = '"' + table.replace('"', '""') + '"'
                s, o = '"'+cols['status']+'"', '"'+cols['output']+'"'
                counts['AgentRun.completed_nonempty_output'] = con.execute(
                    f"SELECT COUNT(*) FROM {q} WHERE {s}='completed' AND {o} IS NOT NULL AND TRIM({o})<>''"
                ).fetchone()[0]
    print('  SQLITE integrity=%s foreign_key_violations=%s tables=%d latest_prisma_migration=%s' % (integrity, fk_violations, len(tables), migration or 'none'))
    print('  SQLITE counts=' + ' '.join(f'{k}:{v}' for k,v in counts.items()))
except Exception as exc:
    # Deliberately do not include exception text that could reveal sensitive paths/data.
    print('  SQLITE inspection=failed (file may be locked, encrypted, corrupt, or unsupported)')
PY
        else
          echo '  SQLITE inspection=unavailable (python3 not installed)'
        fi
        ;;
    esac
  done
fi

printf '\nMySQL data-directory indicators:\n'
for dir in "/var/lib/mysql/${DB_NAME}" "/var/lib/mysql/${DB_NAME,,}"; do
  if [[ -d "$dir" ]]; then
    printf 'MYSQL_DATADIR path=%q exists=true (do not copy live InnoDB files)\n' "$dir"
  fi
done

printf '\nMySQL read-only table counts:\n'
if ! command -v mysql >/dev/null 2>&1; then
  echo 'MYSQL query=unavailable (mysql client not installed)'
elif [[ ! -r "$MYSQL_DEFAULTS_FILE" ]]; then
  echo 'MYSQL query=unavailable (secure MySQL client defaults file not readable; no credentials were used)'
else
  mode=$(stat -c '%a' -- "$MYSQL_DEFAULTS_FILE" 2>/dev/null || stat -f '%Lp' -- "$MYSQL_DEFAULTS_FILE" 2>/dev/null || echo unknown)
  if [[ "$mode" == unknown ]] || (( (8#$mode & 077) != 0 )); then
    echo 'MYSQL query=refused (defaults file must be readable only by its owner)'
  else
    mysql_cmd=(mysql --defaults-extra-file="$MYSQL_DEFAULTS_FILE" --database="$DB_NAME" --batch --skip-column-names --connect-timeout=5)
    if "${mysql_cmd[@]}" --execute='SELECT 1' >/dev/null 2>&1; then
      echo 'MYSQL connection=ok; exact counts below; query-only; no data changes'
      tables=(Department Agent AIEmployeeIdentity Task TaskStep Workflow AgentRun AgentExecution AgentOSRun RunEvent ToolRun AuditEvent)
      for table in "${tables[@]}"; do
        # Table identifiers come only from this fixed allowlist.
        result=$("${mysql_cmd[@]}" --execute="SELECT COUNT(*) FROM ${table}" 2>/dev/null) || result='MISSING_OR_DENIED'
        printf 'MYSQL table=%s count=%s\n' "$table" "$result"
      done
      result=$("${mysql_cmd[@]}" --execute="SELECT COUNT(*) FROM AgentRun WHERE status='completed' AND output IS NOT NULL AND TRIM(output)<>''" 2>/dev/null) || result='MISSING_OR_DENIED'
      printf 'MYSQL table=AgentRun.completed_nonempty_output count=%s\n' "$result"
    else
      echo 'MYSQL connection=failed (client defaults format, access, host or database unavailable; details suppressed)'
    fi
  fi
fi

cat <<'EOF'

IMPORTANT:
- This is an inventory, not a backup, restore test, migration, or health certification.
- SQLite integrity/count reads are opened read-only. MySQL statements are SELECT-only.
- Do not copy active MySQL datadir files. Use a consistent MySQL backup (for example,
  mysqldump --single-transaction, or an approved physical backup) to protected storage.
- Restore the backup into an isolated staging MySQL instance, verify integrity and
  table/relationship counts there, then test the application against staging.
- Keep reports protected: file paths and database counts are operational metadata.
EOF
