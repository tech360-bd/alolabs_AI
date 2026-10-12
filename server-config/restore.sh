#!/usr/bin/env bash
# ============================================================
# ALO Labs AISMH — Restore Script
# Restores from a backup archive. Validates checksum first.
# Usage: sudo bash restore.sh <backup-file>
# ============================================================
set -Eeuo pipefail

APP_NAME="alolabs-aismh"
INSTALL_DIR="/opt/alolabs/agent-hub"
SERVICE_NAME="alolabs-aismh"
DB_PATH="$INSTALL_DIR/shared/data/alolabs.db"

log_info()  { echo "[INFO]  $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_error() { echo "[ERROR] $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_ok()    { echo "[OK]    $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }

if [[ "${1:-}" == "--help" || -z "${1:-}" ]]; then
  echo "Usage: sudo bash restore.sh <backup-file.tar.gz>"
  echo ""
  echo "Validates checksum, stops service, restores DB and .env, restarts."
  exit 0
fi

BACKUP_FILE="$1"

# ─── Validate ──────────────────────────────────────────────
[[ ! -f "$BACKUP_FILE" ]] && { log_error "Backup file not found: $BACKUP_FILE"; exit 1; }
[[ "$BACKUP_FILE" == *..* ]] && { log_error "Path traversal detected"; exit 1; }

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  log_info "Verifying checksum..."
  sha256sum -c "${BACKUP_FILE}.sha256" --status || { log_error "Checksum mismatch"; exit 1; }
  log_ok "Checksum verified"
else
  log_error "No .sha256 file found — cannot verify backup integrity"
  exit 1
fi

# ─── Stop Service ──────────────────────────────────────────
log_info "Stopping service..."
systemctl stop "$SERVICE_NAME" 2>/dev/null || log_info "Service was not running"

# ─── Extract Backup ───────────────────────────────────────
TEMP_DIR=$(mktemp -d /tmp/alolabs-restore.XXXXXX)
log_info "Extracting backup..."
tar xzf "$BACKUP_FILE" -C "$TEMP_DIR" || { log_error "Extraction failed"; rm -rf "$TEMP_DIR"; systemctl start "$SERVICE_NAME"; exit 1; }

BACKUP_CONTENT="$TEMP_DIR/backup"
[[ ! -d "$BACKUP_CONTENT" ]] && { log_error "Invalid backup structure"; rm -rf "$TEMP_DIR"; systemctl start "$SERVICE_NAME"; exit 1; }

# ─── Restore Database ──────────────────────────────────────
if [[ -f "$BACKUP_CONTENT/alolabs.db" ]]; then
  log_info "Restoring database..."
  mkdir -p "$INSTALL_DIR/shared/data"
  cp "$BACKUP_CONTENT/alolabs.db" "${DB_PATH}.restoring" || { log_error "DB copy failed"; rm -rf "$TEMP_DIR"; systemctl start "$SERVICE_NAME"; exit 1; }
  mv "${DB_PATH}.restoring" "$DB_PATH"
  sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok" && log_ok "Database integrity verified" || log_error "Database integrity check failed"
else
  log_error "No database in backup"
  rm -rf "$TEMP_DIR"
  systemctl start "$SERVICE_NAME"
  exit 1
fi

# ─── Restore .env ─────────────────────────────────────────
if [[ -f "$BACKUP_CONTENT/.env" ]]; then
  log_info "Restoring .env..."
  mkdir -p "$INSTALL_DIR/shared"
  cp "$BACKUP_CONTENT/.env" "$INSTALL_DIR/shared/.env"
  chmod 600 "$INSTALL_DIR/shared/.env"
  log_ok ".env restored"
fi

# ─── Restore Uploads ───────────────────────────────────────
if [[ -d "$BACKUP_CONTENT/uploads" ]]; then
  log_info "Restoring uploads..."
  mkdir -p "$INSTALL_DIR/shared/uploads"
  cp -r "$BACKUP_CONTENT/uploads/"* "$INSTALL_DIR/shared/uploads/" 2>/dev/null || true
  log_ok "Uploads restored"
fi

rm -rf "$TEMP_DIR"

# ─── Start Service ────────────────────────────────────────
log_info "Starting service..."
systemctl start "$SERVICE_NAME"
sleep 3

# ─── Health Check ───────────────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME"; then
  log_ok "Service is running"
  echo "{"
  echo "  \"status\": \"restored\","
  echo "  \"backup\": \"$(basename "$BACKUP_FILE")\","
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
  echo "}"
  exit 0
fi

log_error "Service failed to start after restore"
echo '{"status":"error","message":"Service not running after restore"}'
exit 1
