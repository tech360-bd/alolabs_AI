#!/usr/bin/env bash
# ============================================================
# ALO Labs AISMH — Backup Script
# Backs up SQLite DB, .env, uploads. SHA-256 checksums.
# Keeps last 10 backups.
# Usage: sudo bash backup.sh [--db-only]
# ============================================================
set -Eeuo pipefail

APP_NAME="alolabs-aismh"
INSTALL_DIR="/opt/alolabs/agent-hub"
BACKUP_DIR="/var/backups/alolabs"
DB_PATH="$INSTALL_DIR/shared/data/alolabs.db"
RETENTION=10
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${APP_NAME}-${TIMESTAMP}.tar.gz"
DB_ONLY=false

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: sudo bash backup.sh [--db-only]"
  echo ""
  echo "Options:"
  echo "  --db-only  Back up only the database"
  exit 0
fi
[[ "${1:-}" == "--db-only" ]] && DB_ONLY=true

log_info()  { echo "[INFO]  $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_error() { echo "[ERROR] $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_ok()    { echo "[OK]    $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }

mkdir -p "$BACKUP_DIR" || { echo '{"status":"error","message":"Cannot create backup dir"}' >&2; exit 1; }

# ─── Backup Database ────────────────────────────────────────
if [[ -f "$DB_PATH" ]]; then
  log_info "Backing up database..."
  TEMP_DB=$(mktemp /tmp/alolabs-backup-XXXXXX.db)
  sqlite3 "$DB_PATH" ".backup '$TEMP_DB'" || { log_error "Database backup failed"; rm -f "$TEMP_DB"; exit 1; }
  log_ok "Database backed up"
else
  log_error "Database not found at $DB_PATH"
  echo '{"status":"error","message":"Database not found"}'
  exit 1
fi

if [[ "$DB_ONLY" == "true" ]]; then
  cp "$TEMP_DB" "$BACKUP_DIR/${APP_NAME}-db-${TIMESTAMP}.db"
  sha256sum "$BACKUP_DIR/${APP_NAME}-db-${TIMESTAMP}.db" > "${BACKUP_DIR}/${APP_NAME}-db-${TIMESTAMP}.db.sha256"
  rm -f "$TEMP_DB"
  log_ok "Database-only backup complete"
  echo "{\"status\":\"backed_up\",\"type\":\"db_only\",\"file\":\"${APP_NAME}-db-${TIMESTAMP}.db\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  exit 0
fi

# ─── Full Backup ────────────────────────────────────────────
log_info "Creating full backup archive..."
TEMP_DIR=$(mktemp -d /tmp/alolabs-backup-XXXXXX)
mkdir -p "$TEMP_DIR/backup"

cp "$TEMP_DB" "$TEMP_DIR/backup/alolabs.db"
rm -f "$TEMP_DB"

[[ -f "$INSTALL_DIR/shared/.env" ]] && cp "$INSTALL_DIR/shared/.env" "$TEMP_DIR/backup/.env"
[[ -d "$INSTALL_DIR/shared/uploads" ]] && cp -r "$INSTALL_DIR/shared/uploads" "$TEMP_DIR/backup/uploads" 2>/dev/null || true

cp "$INSTALL_DIR/current/package.json" "$TEMP_DIR/backup/package.json" 2>/dev/null || true

# Record version
CURRENT_RELEASE=$(readlink -f "$INSTALL_DIR/current" 2>/dev/null || echo "unknown")
echo "{\"release\":\"$(basename "$CURRENT_RELEASE")\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$TEMP_DIR/backup/metadata.json"

tar czf "$BACKUP_FILE" -C "$TEMP_DIR" backup || { log_error "Archive creation failed"; rm -rf "$TEMP_DIR"; exit 1; }
rm -rf "$TEMP_DIR"

sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
log_ok "Archive created: $BACKUP_FILE"

# ─── Retention ─────────────────────────────────────────────
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/${APP_NAME}-*.tar.gz 2>/dev/null | wc -l)
if [[ "$BACKUP_COUNT" -gt "$RETENTION" ]]; then
  ls -1t "$BACKUP_DIR"/${APP_NAME}-*.tar.gz | tail -n +$((RETENTION + 1)) | while read -r old; do
    rm -f "$old" "${old}.sha256"
    log_info "Removed old backup: $(basename "$old")"
  done
fi

FILESIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo "unknown")
echo "{"
echo "  \"status\": \"backed_up\","
echo "  \"type\": \"full\","
echo "  \"file\": \"$(basename "$BACKUP_FILE")\","
echo "  \"path\": \"$BACKUP_FILE\","
echo "  \"sizeBytes\": $FILESIZE,"
echo "  \"release\": \"$(basename "$CURRENT_RELEASE")\","
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
echo "}"
