#!/bin/bash
# ============================================================
# ALO Labs AI-EOS — Production Backup Script
# Performs SQLite dump, storage backup, 30-day retention cleanup
#
# Cron-ready: Add to crontab for daily backups at 2 AM:
#   0 2 * * * /opt/alo-labs-ai-eos/scripts/backup.sh >> /opt/alo-labs-ai-eos/logs/backup.log 2>&1
# ============================================================
set -euo pipefail

APP_DIR="/opt/alo-labs-ai-eos"
BACKUP_DIR="/opt/alo-labs-ai-eos/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30
DB_PATH="$APP_DIR/db/custom.db"

mkdir -p "$BACKUP_DIR"

# ── 1. SQLite Database Dump ───────────────────────────────────
echo "[$(date)] Starting backup — timestamp: $TIMESTAMP"

if [ -f "$DB_PATH" ]; then
    echo "[$(date)] Dumping SQLite database..."
    sqlite3 "$DB_PATH" ".dump" > "$BACKUP_DIR/custom_${TIMESTAMP}.sql" 2>/dev/null

    # Also create a binary copy for faster restore
    cp "$DB_PATH" "$BACKUP_DIR/custom_${TIMESTAMP}.db"

    # Compress the SQL dump
    gzip "$BACKUP_DIR/custom_${TIMESTAMP}.sql"

    echo "[$(date)] Database backup complete (sql.gz + db copy)"
else
    echo "[$(date)] WARNING: Database file not found at $DB_PATH — skipping DB backup"
fi

# ── 2. Storage Backup ─────────────────────────────────────────
echo "[$(date)] Backing up storage..."
if [ -d "$APP_DIR/storage" ]; then
    tar czf "$BACKUP_DIR/storage_${TIMESTAMP}.tar.gz" -C "$APP_DIR" storage/
    echo "[$(date)] Storage backup complete"
else
    echo "[$(date)] WARNING: Storage directory not found — skipping storage backup"
fi

# ── 3. Cleanup — Remove Backups Older Than $KEEP_DAYS Days ───
echo "[$(date)] Cleaning backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "*.db"        -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "*.sql.gz"    -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "*.tar.gz"    -mtime +"$KEEP_DAYS" -delete

echo "[$(date)] Backup complete: $BACKUP_DIR/*_${TIMESTAMP}*"
