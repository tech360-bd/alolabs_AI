#!/bin/bash
# ============================================================
# ALO Labs AI-EOS — Restore Script
# Usage: ./restore.sh <backup_timestamp>
# Example: ./restore.sh 20250101_120000
# ============================================================
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: ./restore.sh <backup_timestamp>"
    echo "Example: ./restore.sh 20250101_120000"
    echo ""
    echo "Available backups:"
    ls -1 /opt/alo-labs-ai-eos/backups/*.db 2>/dev/null | sed 's/.*custom_\(.*\)\.db/  \1/' || echo "  (none found)"
    exit 1
fi

APP_DIR="/opt/alo-labs-ai-eos"
BACKUP_DIR="/opt/alo-labs-ai-eos/backups"
TIMESTAMP="$1"
DB_PATH="$APP_DIR/db/custom.db"

# ── Verify backup exists ──────────────────────────────────────
DB_BACKUP="$BACKUP_DIR/custom_${TIMESTAMP}.db"
SQL_BACKUP="$BACKUP_DIR/custom_${TIMESTAMP}.sql.gz"

if [ ! -f "$DB_BACKUP" ] && [ ! -f "$SQL_BACKUP" ]; then
    echo "ERROR: No backup found for timestamp $TIMESTAMP"
    echo "Looked for: $DB_BACKUP or $SQL_BACKUP"
    exit 1
fi

# ── Confirmation ──────────────────────────────────────────────
echo "WARNING: This will restore the database and storage to timestamp $TIMESTAMP"
echo "Current data will be replaced!"
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# ── Stop Application ──────────────────────────────────────────
echo "Stopping application..."
cd "$APP_DIR"
if command -v pm2 &>/dev/null; then
    pm2 stop alo-labs-ai-eos 2>/dev/null || echo "PM2 process not running — skipping stop"
else
    echo "PM2 not found — ensure the app is stopped manually"
fi

# ── Restore Database ──────────────────────────────────────────
echo "Restoring database..."

# Prefer SQL dump (more reliable across SQLite versions)
if [ -f "$SQL_BACKUP" ]; then
    # Backup current DB before overwriting
    [ -f "$DB_PATH" ] && cp "$DB_PATH" "${DB_PATH}.pre-restore.bak"
    rm -f "$DB_PATH"
    gunzip -c "$SQL_BACKUP" | sqlite3 "$DB_PATH"
    echo "Database restored from SQL dump."
elif [ -f "$DB_BACKUP" ]; then
    [ -f "$DB_PATH" ] && cp "$DB_PATH" "${DB_PATH}.pre-restore.bak"
    cp "$DB_BACKUP" "$DB_PATH"
    echo "Database restored from binary copy."
fi

# ── Restore Storage ───────────────────────────────────────────
STORAGE_BACKUP="$BACKUP_DIR/storage_${TIMESTAMP}.tar.gz"
if [ -f "$STORAGE_BACKUP" ]; then
    echo "Restoring storage..."
    rm -rf "$APP_DIR/storage"
    tar xzf "$STORAGE_BACKUP" -C "$APP_DIR"
    echo "Storage restored."
else
    echo "No storage backup found for this timestamp — skipping storage restore."
fi

# ── Restart Application ───────────────────────────────────────
echo "Restarting application..."
if command -v pm2 &>/dev/null; then
    pm2 start alo-labs-ai-eos 2>/dev/null || pm2 restart alo-labs-ai-eos 2>/dev/null || echo "Manual restart required"
else
    echo "PM2 not found — restart the application manually"
fi

echo "Restore complete."
