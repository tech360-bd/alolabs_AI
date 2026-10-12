# ALO Labs AIOS — Backup & Restore Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** System administrators and DevOps engineers

---

## Table of Contents

1. [Backup Types](#1-backup-types)
2. [Automated Backup Schedule](#2-automated-backup-schedule)
3. [Manual Backup Execution](#3-manual-backup-execution)
4. [Backup Encryption](#4-backup-encryption)
5. [Restore Procedures](#5-restore-procedures)
6. [Backup Retention Policy](#6-backup-retention-policy)
7. [Off-Site Backup (S3/MinIO)](#7-off-site-backup-s3minio)
8. [Disaster Recovery Procedure](#8-disaster-recovery-procedure)
9. [Backup Verification](#9-backup-verification)
10. [RPO/RTO Targets](#10-rporto-targets)

---

## 1. Backup Types

### Full Backup

A full backup includes:
- **Database dump** (compressed, optionally encrypted)
- **Build artifacts** (`.next/` directory)
- **Application files** (`.env`, configuration)
- **Data directory** (uploads, storage)
- **Log files**
- **Manifest** (JSON with metadata)

### Database-Only Backup

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh --db-only
```

Skips file backup. Useful for frequent database-only snapshots.

### Files-Only Backup

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh --files-only
```

Skips database dump. Useful when you only need configuration and build artifacts.

### Backup Structure

```
/opt/alolabs/agent-hub/backups/
└── 20250115_020000/
    ├── MANIFEST.json          # Backup metadata
    ├── database.sql.gz        # Compressed DB dump (or .gz.enc if encrypted)
    ├── next-build.tar.gz      # .next/ build output
    ├── data.tar.gz            # data/ directory
    ├── logs.tar.gz            # logs/ directory
    ├── .env.bak               # Environment configuration
    ├── commit.txt             # Git commit hash
    ├── branch.txt             # Git branch name
    └── timestamp.txt          # ISO 8601 timestamp
```

---

## 2. Automated Backup Schedule

### Cron Configuration

The backup cron is defined in `deploy/cron/alolabs-cron`:

```cron
# Daily database and file backup at 2:00 AM
0 2 * * * alohub /opt/alolabs/agent-hub/deploy/scripts/backup.sh --quiet \
  >> /opt/alolabs/agent-hub/logs/cron-backup.log 2>&1
```

### Install Cron Jobs

```bash
sudo cp deploy/cron/alolabs-cron /etc/cron.d/alolabs-hub
sudo chmod 644 /etc/cron.d/alolabs-hub
sudo systemctl restart cron
```

### Verify Cron Installation

```bash
# List ALO Labs cron jobs
sudo crontab -l | grep alolabs
cat /etc/cron.d/alolabs-hub
```

### Additional Schedules

Add more frequent backups by appending to the cron file:

```cron
# Hourly database-only backup
0 * * * * alohub /opt/alolabs/agent-hub/deploy/scripts/backup.sh --db-only --quiet \
  >> /opt/alolabs/agent-hub/logs/cron-backup-hourly.log 2>&1

# Weekly full backup on Sunday at 1:00 AM
0 1 * * 0 alohub /opt/alolabs/agent-hub/deploy/scripts/backup.sh --quiet \
  >> /opt/alolabs/agent-hub/logs/cron-backup-weekly.log 2>&1
```

---

## 3. Manual Backup Execution

### Full Backup

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh
```

### With Custom ID

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh --id pre-upgrade
```

### Database Only

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh --db-only
```

### Files Only

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh --files-only
```

### With Upload to S3/MinIO

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh \
  --upload "aws s3 cp --recursive {} s3://alolabs-backups/"
```

### With Upload to MinIO

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/backup.sh \
  --upload "mc cp --recursive {} minio/backups/"
```

### Expected Output

```
[BACKUP][2025-01-15 02:00:00] ============================================================
[BACKUP][2025-01-15 02:00:00] ALO Labs Agent Hub — Backup: 20250115_020000
[BACKUP][2025-01-15 02:00:00] ============================================================
[BACKUP][2025-01-15 02:00:00] [Step 1/3] Backing up database...
  ✅ Database backup encrypted and compressed (12M → encrypted)
[BACKUP][2025-01-15 02:00:05] [Step 2/3] Backing up application files...
  ✅ Build artifacts backed up (85M)
  ✅ Data directory backed up
  ✅ Logs backed up
[BACKUP][2025-01-15 02:00:12] [Step 3/3] Creating backup manifest...
  ✅ Manifest created
[BACKUP][2025-01-15 02:00:12] Cleaning up backups older than 90 days...

[BACKUP][2025-01-15 02:00:12] ============================================================
[BACKUP][2025-01-15 02:00:12] ✅ BACKUP COMPLETE
[BACKUP][2025-01-15 02:00:12] ============================================================
[BACKUP][2025-01-15 02:00:12] ID:       20250115_020000
[BACKUP][2025-01-15 02:00:12] Path:     /opt/alolabs/agent-hub/backups/20250115_020000
[BACKUP][2025-01-15 02:00:12] Size:     98M
[BACKUP][2025-01-15 02:00:12] Duration: 12s
```

---

## 4. Backup Encryption

### Enabling Encryption

Set the `BACKUP_ENCRYPTION_KEY` in your `.env` file:

```env
BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 48)"
```

### How It Works

When `BACKUP_ENCRYPTION_KEY` is set, the backup script:

1. Creates a compressed database dump (`database.sql.gz`)
2. Encrypts it using **AES-256-CBC** with PBKDF2 key derivation
3. Replaces the unencrypted file with the encrypted version
4. The encrypted file has the same name (`database.sql.gz`)

### Manual Encryption/Decryption

```bash
# Encrypt a backup manually
BACKUP_KEY="your-backup-encryption-key"
openssl enc -aes-256-cbc -salt -pbkdf2 \
  -in database.sql.gz \
  -out database.sql.gz.enc \
  -pass "pass:${BACKUP_KEY}"

# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in database.sql.gz.enc \
  -out database.sql.gz \
  -pass "pass:${BACKUP_KEY}"
```

### Store the Encryption Key Safely

- **Never** commit the key to version control
- Store in a password manager (1Password, Bitwarden, etc.)
- Keep an offline copy in a secure location
- Rotate the key annually

---

## 5. Restore Procedures

### Full Restore

Restores database, files, build artifacts, and configuration:

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/restore.sh \
  --backup-id 20250115_020000
```

You will be prompted to type `RESTORE` to confirm.

### Database-Only Restore

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/restore.sh \
  --backup-id 20250115_020000 --db-only
```

### Files-Only Restore

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/restore.sh \
  --backup-id 20250115_020000 --files-only
```

### Partial Match

You can use a partial backup ID:

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/restore.sh \
  --backup-id pre-upgrade
```

The script will find the first backup matching `pre-upgrade*`.

### What the Restore Script Does

1. **Validates** the backup exists
2. **Shows** the backup manifest (if available)
3. **Prompts** for confirmation (`RESTORE` keyword required)
4. **Creates** a safety backup of current state
5. **Stops** the application service
6. **Restores files** (`.env`, `.next/`, `data/`, `logs/`)
7. **Restores database** (drops and recreates, then imports dump)
8. **Restarts** the service
9. **Reports** duration and safety backup location

### Restoring Encrypted Backups

If the backup database dump is encrypted (`.enc` extension), the restore script automatically:
1. Reads `BACKUP_ENCRYPTION_KEY` from the current `.env`
2. Decrypts the dump to a temporary file
3. Imports it into the database
4. Deletes the temporary decrypted file

---

## 6. Backup Retention Policy

### Default Retention

| Parameter | Value |
|---|---|
| **Retention period** | 90 days |
| **Configurable via** | `BACKUP_RETENTION_DAYS` env var |
| **Cleanup** | Automatic on each backup run |

### Custom Retention

```bash
# Keep backups for 30 days only
BACKUP_RETENTION_DAYS=30 sudo bash deploy/scripts/backup.sh

# Keep backups for 1 year
BACKUP_RETENTION_DAYS=365 sudo bash deploy/scripts/backup.sh
```

### Manual Cleanup

```bash
# List all backups
ls -la /opt/alolabs/agent-hub/backups/

# Delete backups older than 30 days
find /opt/alolabs/agent-hub/backups/ -maxdepth 1 -mindepth 1 -type d -mtime +30 -exec rm -rf {} +

# Check total backup size
du -sh /opt/alolabs/agent-hub/backups/
```

---

## 7. Off-Site Backup (S3/MinIO)

### Option A: AWS S3

```bash
# Install AWS CLI
sudo apt install -y awscli

# Configure credentials
aws configure
# AWS Access Key ID: [your-key]
# AWS Secret Access Key: [your-secret]
# Default region: us-east-1

# Manual upload
aws s3 sync /opt/alolabs/agent-hub/backups/ s3://alolabs-backups/ --delete

# Scheduled upload (add to cron)
0 3 * * * root aws s3 sync /opt/alolabs/agent-hub/backups/ s3://alolabs-backups/ --quiet 2>&1
```

### Option B: MinIO (Self-Hosted)

```bash
# Install MinIO Client
wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Configure alias
mc alias set minio https://minio.your-server.com minioadmin your-secret-key

# Create backup bucket
mc mb minio/backups

# Upload
mc mirror /opt/alolabs/agent-hub/backups/ minio/backups/
```

### Option C: Backup with Upload Flag

Use the built-in `--upload` flag:

```bash
# Add to cron for automatic off-site upload
0 2 * * * alohub /opt/alolabs/agent-hub/deploy/scripts/backup.sh --quiet \
  --upload "aws s3 cp --recursive {} s3://alolabs-backups/" \
  >> /opt/alolabs/agent-hub/logs/cron-backup.log 2>&1
```

---

## 8. Disaster Recovery Procedure

### Scenario 1: Server Completely Lost

1. **Provision a new server** (same OS: Ubuntu 24.04)
2. **Install prerequisites** (Bun, MariaDB/Redis)
3. **Clone the repository** to `/opt/alolabs/agent-hub`
4. **Download the latest backup** from S3/MinIO
5. **Install the application:**

```bash
sudo bash deploy/scripts/install.sh
```

6. **Restore from backup:**

```bash
sudo bash deploy/scripts/restore.sh --backup-id <latest-backup-id>
```

7. **Verify health:**

```bash
curl http://127.0.0.1:3004/api/health
sudo bash deploy/scripts/health-check.sh
```

### Scenario 2: Database Corruption

1. **Stop the service:**

```bash
sudo systemctl stop alolabs-agent-hub
```

2. **Restore database only:**

```bash
sudo bash deploy/scripts/restore.sh --backup-id <id> --db-only
```

3. **Restart and verify:**

```bash
sudo systemctl start alolabs-agent-hub
sudo bash deploy/scripts/health-check.sh
```

### Scenario 3: Accidental Data Deletion

1. **Immediately stop the service** to prevent further writes
2. **Identify the most recent backup before the deletion**
3. **Restore from that backup** (full or database-only)
4. **Review audit logs** to identify what was deleted

---

## 9. Backup Verification

### Automated Verification

Add a weekly verification cron job:

```cron
# Every Sunday at 6:00 AM — verify latest backup
0 6 * * 0 root /opt/alolabs/agent-hub/deploy/scripts/backup-verify.sh >> /opt/alolabs/agent-hub/logs/cron-verify.log 2>&1
```

### Manual Verification

```bash
# 1. Check backup manifest
cat /opt/alolabs/agent-hub/backups/20250115_020000/MANIFEST.json | jq .

# 2. Verify backup integrity (check file sizes)
du -sh /opt/alolabs/agent-hub/backups/20250115_020000/*

# 3. Test database dump decompression
gunzip -t /opt/alolabs/agent-hub/backups/20250115_020000/database.sql.gz

# 4. Test encrypted dump decryption
BACKUP_KEY=$(grep '^BACKUP_ENCRYPTION_KEY=' /opt/alolabs/agent-hub/.env | cut -d= -f2)
echo "$BACKUP_KEY" | openssl enc -d -aes-256-cbc -pbkdf2 \
  -in /opt/alolabs/agent-hub/backups/20250115_020000/database.sql.gz \
  -out /tmp/test-restore.sql.gz -pass stdin && \
  gunzip -t /tmp/test-restore.sql.gz && \
  echo "✅ Backup verified" && rm /tmp/test-restore.sql.gz
```

### Backup Health Check

```bash
# Count recent backups
echo "Backups in last 7 days:"
find /opt/alolabs/agent-hub/backups/ -maxdepth 1 -mindepth 1 -type d -mtime -7 | wc -l

# Check for any backup failures in cron log
tail -20 /opt/alolabs/agent-hub/logs/cron-backup.log | grep -i error
```

---

## 10. RPO/RTO Targets

### Recovery Point Objective (RPO)

| Scenario | RPO | Notes |
|---|---|---|
| **Database** | 24 hours | Daily backup at 2:00 AM |
| **Database (with hourly)** | 1 hour | Add hourly `--db-only` cron |
| **Configuration files** | 24 hours | Included in daily backup |
| **User-uploaded files** | 24 hours | Included in daily backup |

### Recovery Time Objective (RTO)

| Scenario | RTO | Notes |
|---|---|---|
| **Application crash** | < 1 minute | Automatic restart via systemd |
| **Database restore** | 5–15 minutes | Depends on dump size |
| **Full server restore** | 30–60 minutes | New server provision + restore |
| **Complete disaster recovery** | 2–4 hours | Including DNS, SSL, monitoring |

### Improving RPO/RTO

| Action | RPO Improvement | RTO Improvement |
|---|---|---|
| Add hourly DB-only backups | 24h → 1h | — |
| Enable database replication | Near-zero | — |
| Use database snapshots (EBS) | < 5 min | 10–15 min |
| Pre-provision standby server | — | 5–10 min |

---

## Backup Checklist

- [ ] Backup cron job installed and running
- [ ] `BACKUP_ENCRYPTION_KEY` set in `.env`
- [ ] First manual backup completed and verified
- [ ] Backup retention policy configured
- [ ] Off-site backup destination configured (S3/MinIO)
- [ ] Restore procedure tested at least once
- [ ] Backup encryption key stored in password manager
- [ ] Weekly backup verification cron job installed