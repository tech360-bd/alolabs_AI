#!/usr/bin/env bash
# ============================================================
# ALO Labs AISMH — Staged Update Script
# Backs up current, deploys new release, switches symlink,
# restarts service. Auto-rolls back on failure.
# Usage: sudo bash update.sh /path/to/new/source.tar.gz
# ============================================================
set -Eeuo pipefail

APP_NAME="alolabs-aismh"
APP_USER="alohub"
APP_GROUP="alohub"
INSTALL_DIR="/opt/alolabs/agent-hub"
BACKUP_DIR="/var/backups/alolabs"
SERVICE_NAME="alolabs-aismh"
TEMP_DIR=""
PREVIOUS_RELEASE=""

# ─── Help ───────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "" ]]; then
  echo "Usage: sudo bash update.sh <source-tarball-or-directory>"
  echo ""
  echo "Arguments:"
  echo "  source-tarball-or-directory  Path to .tar.gz archive or source directory"
  echo ""
  echo "The script will:"
  echo "  1. Backup current database and .env"
  echo "  2. Extract/deploy new release"
  echo "  3. Install dependencies and build"
  echo "  4. Switch current symlink atomically"
  echo "  5. Restart service and health check"
  echo "  6. Auto-rollback on failure"
  exit 0
fi

SOURCE_PATH="$1"

log_info()  { echo "[INFO]  $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_error() { echo "[ERROR] $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }
log_ok()    { echo "[OK]    $(date +%Y-%m-%dT%H:%M:%S%z) $*" >&2; }

rollback() {
  log_error "Rolling back to previous release..."
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE" "$INSTALL_DIR/current" || true
    systemctl restart "$SERVICE_NAME" 2>/dev/null || true
    sleep 3
    log_info "Rolled back to $(basename "$PREVIOUS_RELEASE")"
  fi
  [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"
  echo '{"status":"rolled_back"}'
  exit 1
}

trap rollback ERR

# ─── Validate Input ─────────────────────────────────────────
[[ -z "$SOURCE_PATH" ]] && { echo '{"status":"error","message":"No source path provided"}' >&2; exit 1; }
[[ "$SOURCE_PATH" == *..* ]] && { echo '{"status":"error","message":"Path traversal detected"}' >&2; exit 1; }

if [[ -d "$SOURCE_PATH" ]]; then
  SOURCE_TYPE="dir"
elif [[ -f "$SOURCE_PATH" ]]; then
  SOURCE_TYPE="file"
else
  echo '{"status":"error","message":"Source path does not exist"}' >&2; exit 1
fi

# ─── Record Previous Release ────────────────────────────────
if [[ -L "$INSTALL_DIR/current" ]]; then
  PREVIOUS_RELEASE=$(readlink -f "$INSTALL_DIR/current")
  log_info "Previous release: $PREVIOUS_RELEASE"
fi

# ─── Backup Database ────────────────────────────────────────
log_info "Creating pre-update backup..."
TIMESTAMP=$(date +%Y%m%d%H%M%S)
DB_PATH="$INSTALL_DIR/shared/data/alolabs.db"
BACKUP_FILE="$BACKUP_DIR/pre-update-${TIMESTAMP}.db"
mkdir -p "$BACKUP_DIR"
if [[ -f "$DB_PATH" ]]; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" || { log_error "DB backup failed"; exit 1; }
  sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
  log_ok "Database backed up to $BACKUP_FILE"
fi

# ─── Prepare New Release ────────────────────────────────────
log_info "Preparing new release..."
RELEASE_DIR="$INSTALL_DIR/releases/${TIMESTAMP}"
TEMP_DIR=$(mktemp -d /tmp/alolabs-update.XXXXXX)

if [[ "$SOURCE_TYPE" == "file" ]]; then
  tar xzf "$SOURCE_PATH" -C "$TEMP_DIR" || { log_error "Archive extraction failed"; exit 1; }
  EXTRACTED=$(find "$TEMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)
  [[ -z "$EXTRACTED" ]] && EXTRACTED="$TEMP_DIR"
  mv "$EXTRACTED" "$RELEASE_DIR" || { log_error "Failed to move extracted source"; exit 1; }
else
  cp -r "$SOURCE_PATH" "$RELEASE_DIR" || { log_error "Failed to copy source"; exit 1; }
fi

rm -rf "$RELEASE_DIR/node_modules" "$RELEASE_DIR/.next" "$RELEASE_DIR/db/*.db" 2>/dev/null || true
chown -R "$APP_USER:$APP_GROUP" "$RELEASE_DIR"
log_ok "Release prepared at $RELEASE_DIR"

# ─── Install Dependencies ───────────────────────────────────
log_info "Installing dependencies..."
cd "$RELEASE_DIR" || rollback
su -s /bin/bash -c "cd '$RELEASE_DIR' && bun install --frozen-lockfile" "$APP_USER" || rollback
log_ok "Dependencies installed"

# ─── Generate Prisma Client ─────────────────────────────────
log_info "Generating Prisma client..."
su -s /bin/bash -c "cd '$RELEASE_DIR' && bun run db:generate" "$APP_USER" || rollback
log_ok "Prisma client generated"

# ─── Build ──────────────────────────────────────────────────
log_info "Building application..."
su -s /bin/bash -c "cd '$RELEASE_DIR' && bun run build" "$APP_USER" || rollback
log_ok "Build completed"

# ─── Link Shared Resources ──────────────────────────────────
ln -sfn "$INSTALL_DIR/shared/.env" "$RELEASE_DIR/.env" 2>/dev/null || true
ln -sfn "$INSTALL_DIR/shared/data" "$RELEASE_DIR/db" 2>/dev/null || true
ln -sfn "$INSTALL_DIR/shared/uploads" "$RELEASE_DIR/upload" 2>/dev/null || true

# ─── Database Migration ─────────────────────────────────────
log_info "Running database migration..."
su -s /bin/bash -c "cd '$RELEASE_DIR' && DATABASE_URL='file:$INSTALL_DIR/shared/data/alolabs.db' bun run db:push --skip-generate --accept-data-loss" "$APP_USER" || \
  log_error "Migration warning — manual review may be needed"
log_ok "Database migration completed"

# ─── Switch Symlink ────────────────────────────────────────
log_info "Switching to new release..."
ln -sfn "$RELEASE_DIR" "$INSTALL_DIR/current" || rollback
log_ok "Symlink switched to $(basename "$RELEASE_DIR")"

# ─── Restart Service ───────────────────────────────────────
log_info "Restarting service..."
systemctl restart "$SERVICE_NAME" || rollback
sleep 5

# ─── Health Check ───────────────────────────────────────────
log_info "Running health check..."
HEALTH=$(curl -sf --max-time 15 "http://localhost:3011/api/health" 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"status"'; then
  log_ok "Health check passed"
else
  log_error "Health check failed — rolling back"
  rollback
fi

# ─── Cleanup ───────────────────────────────────────────────
rm -rf "$TEMP_DIR"

# Keep only last 5 releases
RELEASE_COUNT=$(ls -1d "$INSTALL_DIR/releases/"* 2>/dev/null | wc -l)
if [[ "$RELEASE_COUNT" -gt 5 ]]; then
  ls -1d "$INSTALL_DIR/releases/"* | sort | head -n -5 | while read -r old_release; do
    if [[ "$old_release" != "$PREVIOUS_RELEASE" && "$old_release" != "$RELEASE_DIR" ]]; then
      rm -rf "$old_release" && log_info "Removed old release: $(basename "$old_release")"
    fi
  done
fi

trap - ERR

echo "{"
echo "  \"status\": \"updated\","
echo "  \"release\": \"$(basename "$RELEASE_DIR")\","
echo "  \"previousRelease\": \"$(basename "${PREVIOUS_RELEASE:-none}")\","
echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
echo "}"
log_ok "Update complete"
