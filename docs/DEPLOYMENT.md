# ALO Labs Agent Hub — Deployment Guide

> **Version:** Production  
> **Last Updated:** 2025  
> **Target Platform:** Ubuntu 22.04 LTS

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Installation](#2-installation)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Setup](#4-database-setup)
5. [Nginx Configuration](#5-nginx-configuration)
6. [SSL Setup](#6-ssl-setup-with-certbot)
7. [Systemd Service](#7-systemd-service-configuration)
8. [First Login](#8-first-login)
9. [Upgrade Procedure](#9-upgrade-procedure)
10. [Backup and Restore](#10-backup-and-restore)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. System Requirements

### Minimum Hardware

| Resource   | Minimum        | Recommended   |
|------------|----------------|---------------|
| CPU        | 2 cores        | 4+ cores      |
| RAM        | 4 GB           | 8 GB          |
| Storage    | 20 GB SSD      | 50 GB SSD     |
| Network    | 10 Mbps        | 100 Mbps      |

### Software Dependencies

| Software          | Version         | Purpose                          |
|-------------------|-----------------|----------------------------------|
| Ubuntu            | 22.04 LTS       | Host OS                          |
| Bun               | 1.2.5+          | JavaScript runtime               |
| MariaDB           | 10.11+          | Primary database                 |
| Redis             | 7+              | Caching and session store        |
| Nginx             | 1.24+           | Reverse proxy / TLS termination  |
| Certbot           | Latest          | Let's Encrypt SSL certificates   |
| Git               | 2.x             | Source code management           |

### Network Requirements

| Port | Protocol | Purpose                        |
|------|----------|--------------------------------|
| 22   | TCP      | SSH (remote administration)    |
| 80   | TCP      | HTTP (redirect to HTTPS)       |
| 443  | TCP      | HTTPS (application traffic)    |
| 3004 | TCP      | Internal — Next.js app server  |
| 6379 | TCP      | Internal — Redis (localhost)   |
| 3306 | TCP      | Internal — MariaDB (localhost) |

> **Important:** Ports 3004, 6379, and 3306 are internal-only. The UFW firewall blocks all external access to these ports.

---

## 2. Installation

### 2.1 Automated Installation (Recommended)

The installation script automates the entire setup process:

```bash
# Clone the repository
git clone -b main https://github.com/alolabs/agent-hub.git /opt/alolabs/agent-hub

# Run the installer (requires root)
cd /opt/alolabs/agent-hub
sudo bash deploy/scripts/install.sh
```

**Installer flags:**

| Flag            | Description                              |
|-----------------|------------------------------------------|
| `--skip-db`     | Skip MariaDB installation                |
| `--skip-redis`  | Skip Redis installation                  |
| `--skip-bun`    | Skip Bun installation (use existing)     |
| `--help`        | Show usage information                   |

**What the installer does (9 steps):**

1. Updates system packages (`apt-get upgrade`, `dist-upgrade`)
2. Installs essential packages (curl, wget, git, build-essential, nginx, ufw, fail2ban, logrotate)
3. Installs Bun runtime (v1.2.5) system-wide
4. Installs and secures MariaDB 10.11 (creates database + user, optimizes config)
5. Installs and hardens Redis (localhost-only binding, dangerous commands disabled, 256MB limit)
6. Creates the `alohub` system user
7. Clones repository and installs npm dependencies
8. Generates `.env` from `.env.example` with cryptographically random secrets
9. Sets file permissions, installs systemd service, configures logrotate and UFW firewall

### 2.2 Manual Installation

If you prefer a manual approach or are installing on a non-standard system:

```bash
# 1. Create application user
sudo useradd -r -m -d /opt/alolabs/agent-hub -s /bin/bash -g alohub alohub

# 2. Install Bun
curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.5"
sudo ln -sf /root/.bun/bin/bun /usr/local/bin/bun
sudo ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx

# 3. Install MariaDB 10.11
sudo apt-get install -y mariadb-server mariadb-client
sudo mysql_secure_installation

# 4. Install Redis
sudo apt-get install -y redis-server

# 5. Install Nginx
sudo apt-get install -y nginx

# 6. Clone and install
cd /opt/alolabs/agent-hub
bun install

# 7. Create .env (see Section 3)
cp .env.example .env
# Edit .env with your values...

# 8. Push database schema
bun run db:push

# 9. Seed initial data (optional)
bun run db:seed

# 10. Build the application
NODE_ENV=production bun run build

# 11. Install and start the service
sudo cp deploy/systemd/alolabs-agent-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now alolabs-agent-hub
```

---

## 3. Environment Configuration

The `.env` file is the single source of truth for all configuration. It is generated automatically by the installer, but must be reviewed before first use.

> **Security:** The `.env` file has `600` permissions (owner-read/write only). Never commit it to version control.

### Variable Reference

#### Application

| Variable                    | Default                            | Description                                      |
|-----------------------------|------------------------------------|--------------------------------------------------|
| `NODE_ENV`                  | `production`                       | Runtime environment                              |
| `NEXT_PUBLIC_APP_NAME`      | `ALO Labs Agent Hub`               | Display name in the UI                           |
| `NEXT_PUBLIC_APP_URL`       | `https://alolabs.net`              | Public-facing main domain                        |
| `NEXT_PUBLIC_PANEL_URL`     | `https://panel.alolabs.net`        | Admin panel URL                                  |
| `NEXT_PUBLIC_API_URL`       | `https://api.alolabs.net`          | API gateway URL                                  |

#### Server

| Variable                    | Default        | Description                        |
|-----------------------------|----------------|------------------------------------|
| `HOSTNAME`                  | `127.0.0.1`    | Bind address (keep localhost)      |
| `PORT`                      | `3004`         | Application listen port            |

#### Database (MariaDB)

| Variable                    | Format                                  | Description                    |
|-----------------------------|-----------------------------------------|--------------------------------|
| `DATABASE_URL`              | `mysql://user:pass@host:port/dbname`   | Full MariaDB connection string |

**Example:**
```
DATABASE_URL="mysql://alohub_user:s3cur3P@ss!@127.0.0.1:3306/alohub_production"
```

#### Redis

| Variable      | Default                         | Description               |
|---------------|---------------------------------|---------------------------|
| `REDIS_URL`   | `redis://127.0.0.1:6379/0`      | Redis connection string   |

#### Authentication

| Variable                | Generated By     | Description                                  |
|-------------------------|------------------|----------------------------------------------|
| `NEXTAUTH_URL`          | —                | Must match panel domain (for cookie domain)  |
| `NEXTAUTH_SECRET`       | `openssl rand`   | 32-byte secret for NextAuth/JWT signing      |
| `AUTH_OWNER_EMAIL`      | —                | Initial super-admin email                    |
| `AUTH_OWNER_PASSWORD`   | —                | Initial super-admin password (**must set**)  |

#### API Gateway

| Variable                  | Generated By     | Description                            |
|---------------------------|------------------|----------------------------------------|
| `API_GATEWAY_SECRET`      | `openssl rand`   | HMAC signing secret for API gateway    |
| `API_KEY_ENCRYPTION_KEY`  | `openssl rand`   | 32-byte hex key for API key encryption |

#### Security

| Variable                     | Default | Description                                    |
|------------------------------|---------|------------------------------------------------|
| `CSRF_SECRET`                | Auto    | CSRF token signing secret                      |
| `SESSION_ENCRYPTION_KEY`     | Auto    | Session payload encryption key                 |
| `RATE_LIMIT_WINDOW_MS`       | `60000` | Rate limit window in milliseconds              |
| `RATE_LIMIT_MAX_REQUESTS`    | `100`   | Max requests per window per client             |

#### TOTP / MFA

| Variable        | Default                | Description                   |
|-----------------|------------------------|-------------------------------|
| `TOTP_ISSUER`   | `ALO Labs Agent Hub`   | TOTP issuer shown in authenticator app |

#### Webhooks

| Variable          | Generated By     | Description                         |
|-------------------|------------------|-------------------------------------|
| `WEBHOOK_SECRET`  | `openssl rand`   | HMAC secret for webhook verification |

#### AI Model Configuration

| Variable                  | Default   | Description                                |
|---------------------------|-----------|--------------------------------------------|
| `DEFAULT_MODEL`           | `local`   | Default LLM model for agent inference      |
| `PAID_AI_API_ALLOWED`     | `false`   | Allow routing to paid AI APIs              |
| `LOCAL_FIRST`             | `true`    | Prefer local models before external APIs   |

#### Global Operating Rules

| Variable                      | Default  | Description                                      |
|-------------------------------|----------|--------------------------------------------------|
| `PRIVATE_AI_AGENTS`           | `true`   | Agents are private to the deploying company      |
| `PRIVATE_SKILLS_ONLY`         | `true`   | Only private skills are enabled                  |
| `PUBLIC_SKILLS_DISABLED`      | `true`   | Public skill marketplace disabled                |
| `PAYMENT_GUARD_ENABLED`       | `true`   | Enforce payment checks before paid operations    |
| `PROTECTION_MODE_ENABLED`     | `true`   | Enable 18-category protection rule engine        |
| `SELF_IMPROVEMENT_ENABLED`    | `true`   | Allow agents to self-improve based on feedback   |
| `PRODUCTIVITY_MODE_ENABLED`   | `true`   | Enable productivity tracking and reporting       |
| `OWNER_APPROVAL_REQUIRED`     | `true`   | Require owner approval for critical actions      |
| `CROSS_COMPANY_DATA_ACCESS`   | `false`  | **Never** allow cross-company data leakage       |
| `EXTERNAL_AGENT_EXPORT`       | `false`  | Allow exporting agent configs externally         |
| `PUBLIC_AGENT_DOWNLOAD`       | `false`  | Allow public downloading of agent packages       |

#### Logging

| Variable                      | Default  | Description                                 |
|-------------------------------|----------|---------------------------------------------|
| `LOG_LEVEL`                   | `info`   | Application log level (debug/info/warn/error) |
| `AUDIT_LOG_RETENTION_DAYS`    | `365`    | Days to retain audit logs                    |
| `SECURITY_LOG_RETENTION_DAYS` | `730`    | Days to retain security event logs           |

#### Backup

| Variable                 | Default          | Description                         |
|--------------------------|------------------|-------------------------------------|
| `BACKUP_ENCRYPTION_KEY`  | Auto-generated   | AES-256 key for encrypting backups  |
| `BACKUP_RETENTION_DAYS`  | `90`             | Days to keep local backups          |
| `BACKUP_SCHEDULE`        | `0 2 * * *`      | Cron expression for auto-backups    |

#### CORS

| Variable           | Default                                                      | Description               |
|--------------------|--------------------------------------------------------------|---------------------------|
| `ALLOWED_ORIGINS`  | `https://alolabs.net,https://panel.alolabs.net,...`          | Comma-separated allowed origins for CORS |

---

## 4. Database Setup

### 4.1 MariaDB Installation

MariaDB is installed and secured automatically by the installer. If doing it manually:

```bash
# Install
sudo apt-get install -y mariadb-server

# Secure installation
sudo mysql_secure_installation

# Verify
sudo systemctl status mariadb
mysql --version
```

### 4.2 Database and User Creation

The installer automatically creates the database and user with a generated strong password. The password is displayed once during installation — **save it immediately**.

If creating manually:

```sql
-- Connect as root
sudo mysql

-- Create database
CREATE DATABASE IF NOT EXISTS alohub_production
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create user (replace with strong password)
CREATE USER IF NOT EXISTS 'alohub_user'@'localhost'
  IDENTIFIED BY 'your-strong-password-here';

-- Grant privileges
GRANT ALL PRIVILEGES ON `alohub_production`.* TO 'alohub_user'@'localhost';
FLUSH PRIVILEGES;
```

Update your `.env`:
```
DATABASE_URL="mysql://alohub_user:your-strong-password-here@127.0.0.1:3306/alohub_production"
```

### 4.3 MariaDB Tuning

The installer creates `/etc/mysql/mariadb.conf.d/99-alolabs.cnf` with optimized settings:

```ini
[mysqld]
max_connections = 200
max_allowed_packet = 64M
innodb_buffer_pool_size = 512M
innodb_log_file_size = 128M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
query_cache_type = 0
slow_query_log = 1
slow_query_log_file = /var/log/mysql/mariadb-slow.log
long_query_time = 2
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

### 4.4 Schema Migration (Prisma)

```bash
cd /opt/alolabs/agent-hub

# Push schema to database (creates/updates tables)
bun run db:push

# For production with potential schema changes:
bun run db:push --accept-data-loss
```

### 4.5 Seed Data

The seed script populates the database with initial data:

- **1 super-admin user** (configured via `AUTH_OWNER_EMAIL` / `AUTH_OWNER_PASSWORD`)
- **100 departments** across 12 categories (Executive, Finance, HR, Legal, Engineering, AI/ML, Security, Marketing, CRM/Sales, Design, Education, Admin)
- **2,000 agents** (20 per department) with role-specific protocols
- **5 job queues** (default, ai-inference, email, reports, maintenance)
- **4 subscription plans** (Starter, Professional, Business, Enterprise)
- **13 marketplace listings** with reviews

```bash
cd /opt/alolabs/agent-hub
bun run db:seed
```

### 4.6 Migrating from SQLite to MariaDB

A migration script is provided for transitioning from the development SQLite database:

```bash
sudo bash deploy/scripts/db-migrate-mariadb.sh
```

---

## 5. Nginx Configuration

### 5.1 Three-Domain Architecture

| Domain                | Purpose                          | Rate Limit   |
|-----------------------|----------------------------------|--------------|
| `alolabs.net`         | Main website / landing page      | 30 req/min   |
| `panel.alolabs.net`   | Admin control panel              | 30 req/min   |
| `api.alolabs.net`     | Public API gateway               | 60 req/min   |
| `www.alolabs.net`     | Redirects to `alolabs.net`       | —            |

### 5.2 Install Configuration

```bash
# Copy the configuration
sudo cp deploy/nginx/alolabs.conf /etc/nginx/sites-available/

# Enable the site
sudo ln -sf /etc/nginx/sites-available/alolabs.conf /etc/nginx/sites-enabled/

# Remove default site (if present)
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

### 5.3 Configuration Highlights

The Nginx configuration (`deploy/nginx/alolabs.conf`) includes:

- **HTTP → HTTPS redirect** for all domains
- **Rate limiting** at three levels (API, panel, auth endpoints)
- **WebSocket proxying** for Socket.IO queue service at `/socket.io/`
- **Internal endpoint protection** — `/api/debug`, `/api/internal`, `/api/health`, `/api/metrics` restricted to private IPs only
- **Gzip compression** for JSON, CSS, JS, SVG, and XML
- **Static asset caching** with 1-year `Cache-Control` for `/_next/static/`
- **Upload size limit** of 50MB for API endpoints
- **Proxy timeouts** tuned per endpoint type (60s for pages, 120s for API)

### 5.4 Security Headers (via snippets)

Two Nginx snippets are installed by the SSL setup script:

**`/etc/nginx/snippets/ssl-params.conf`** — TLS configuration:
- TLS 1.2 and 1.3 only
- Modern cipher suite (ECDHE with AES-GCM)
- OCSP stapling enabled
- 2048-bit DH parameters

**`/etc/nginx/snippets/security-headers.conf`** — Response headers:
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone, geolocation disabled)
- `Content-Security-Policy` (full CSP with frame-ancestors self)
- `Strict-Transport-Security` (HSTS with 2-year max-age, includeSubDomains, preload)

### 5.5 Upstream Configuration

```nginx
upstream alolabs_backend {
    server 127.0.0.1:3004;
    keepalive 64;
}
```

All three domains proxy to the same Next.js backend on port 3004. Domain-based routing is handled by the application internally.

---

## 6. SSL Setup with Certbot

### 6.1 Automated Setup

The SSL setup script handles everything:

```bash
sudo bash deploy/nginx/ssl-setup.sh
```

**Flags:**

| Flag        | Description                                            |
|-------------|--------------------------------------------------------|
| `--staging` | Use Let's Encrypt staging (no rate limits, untrusted)  |
| `--email`   | Email for certificate notifications                    |
| `--help`    | Show usage                                             |

**What the script does:**

1. Installs certbot and the nginx plugin
2. Creates ACME webroot at `/var/www/certbot`
3. Generates 2048-bit DH parameters
4. Creates SSL parameters snippet (TLS 1.2/1.3, modern ciphers, OCSP)
5. Creates security headers snippet
6. Creates temporary HTTP config for certificate validation
7. Obtains certificates for all four domains via webroot challenge
8. Activates the full HTTPS Nginx configuration
9. Sets up automatic renewal cron job (daily at 3:00 AM)
10. Verifies all certificates and reloads Nginx

### 6.2 Manual Certificate Management

```bash
# Obtain a certificate
sudo certbot certonly --webroot -w /var/www/certbot \
  -d alolabs.net -d panel.alolabs.net -d api.alolabs.net

# Test renewal (dry run)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
sudo openssl x509 -in /etc/letsencrypt/live/alolabs.net/fullchain.pem \
  -noout -enddate
```

### 6.3 Auto-Renewal

The setup script configures a cron job for automatic renewal:

```cron
0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'
```

Verify it exists:
```bash
crontab -l | grep certbot
```

---

## 7. Systemd Service Configuration

### 7.1 Service File

The service is defined in `deploy/systemd/alolabs-agent-hub.service`:

```ini
[Unit]
Description=ALO Labs Agent Hub — Next.js Application Server
Documentation=https://github.com/alolabs/agent-hub
After=network-online.target mariadb.service redis.service
Wants=network-online.target

[Service]
Type=simple
User=alohub
Group=alohub
WorkingDirectory=/opt/alolabs/agent-hub
EnvironmentFile=/opt/alolabs/agent-hub/.env
ExecStart=/usr/local/bin/bun .next/standalone/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30

# Process limits
LimitNOFILE=65535
LimitNPROC=4096

# Resource limits
MemoryMax=4G
CPUQuota=200%
```

### 7.2 Security Hardening

The systemd service applies the following security restrictions:

| Directive                 | Value              | Purpose                                |
|---------------------------|--------------------|----------------------------------------|
| `NoNewPrivileges`         | `true`             | Prevent privilege escalation           |
| `ProtectSystem`           | `strict`           | Read-only filesystem (except app dir)  |
| `ProtectHome`             | `true`             | No access to /home                     |
| `ReadWritePaths`          | `/opt/alolabs/agent-hub` | Only writable directory            |
| `PrivateTmp`              | `true`             | Isolated /tmp                          |
| `PrivateDevices`          | `true`             | No access to physical devices          |
| `ProtectKernelTunables`   | `true`             | No kernel parameter modification       |
| `ProtectKernelModules`    | `true`             | No kernel module loading               |
| `ProtectControlGroups`    | `true`             | No cgroup modification                 |
| `RestrictAddressFamilies` | `AF_INET AF_INET6 AF_UNIX` | Only TCP/UDP/Unix sockets     |
| `RestrictRealtime`        | `true`             | No real-time scheduling                |
| `SystemCallFilter`        | `@system-service`  | Restrict syscalls to essential set     |

### 7.3 Service Management

```bash
# Start / stop / restart
sudo systemctl start alolabs-agent-hub
sudo systemctl stop alolabs-agent-hub
sudo systemctl restart alolabs-agent-hub

# Enable on boot
sudo systemctl enable alolabs-agent-hub

# Check status
sudo systemctl status alolabs-agent-hub

# View live logs
sudo journalctl -u alolabs-agent-hub -f

# View logs since boot
sudo journalctl -u alolabs-agent-hub -b

# View logs from last hour
sudo journalctl -u alolabs-agent-hub --since "1 hour ago"
```

---

## 8. First Login

### 8.1 Initial Super Admin

The first user is created during the seed process using `AUTH_OWNER_EMAIL` and `AUTH_OWNER_PASSWORD` from `.env`.

1. **Before seeding**, ensure you have set these values in `.env`:
   ```
   AUTH_OWNER_EMAIL=your-email@example.com
   AUTH_OWNER_PASSWORD=a-very-strong-password
   ```

2. **Run the seed** (if not already done):
   ```bash
   cd /opt/alolabs/agent-hub
   bun run db:seed
   ```

3. **Log in** at `https://panel.alolabs.net` with the owner credentials.

### 8.2 Post-Login Checklist

After your first login, complete these steps:

1. **Enable MFA** — Navigate to Auth Center → MFA tab, enable TOTP-based two-factor authentication
2. **Create API keys** — Navigate to API Management to generate keys for programmatic access
3. **Review roles** — Check the Roles panel and assign appropriate permissions
4. **Configure alerts** — Set up monitoring alerts in the Observatory panel
5. **Test the API** — Verify API access at `https://api.alolabs.net/api/health`
6. **Review protection rules** — Verify the 18-category protection engine is active in the Protection panel
7. **Set up backups** — Verify the backup cron job and test a manual backup

---

## 9. Upgrade Procedure

### 9.1 Automated Upgrade (Recommended)

The upgrade script handles the complete process with automatic rollback on failure:

```bash
sudo bash deploy/scripts/upgrade.sh
```

**Flags:**

| Flag              | Description                                   |
|-------------------|-----------------------------------------------|
| `--branch NAME`   | Git branch to upgrade to (default: `main`)    |
| `--skip-backup`   | Skip pre-upgrade backup                       |
| `--no-rollback`   | Disable automatic rollback on failure         |
| `--help`          | Show usage                                    |

**Upgrade process (6 steps):**

1. **Pre-flight health check** — Verifies the service is currently healthy
2. **Pre-upgrade backup** — Creates a timestamped backup (unless `--skip-backup`)
3. **Pull code** — `git fetch` + `git reset --hard origin/{branch}`
4. **Install dependencies** — `bun install --frozen-lockfile` (falls back to `bun install`)
5. **Database migration** — `bun run db:push --accept-data-loss`
6. **Build and restart** — `bun run build` → `systemctl restart` → health check (90s timeout)

If any step fails and rollback is enabled (default), the script automatically reverts to the previous commit.

### 9.2 Manual Upgrade

```bash
cd /opt/alolabs/agent-hub

# 1. Create backup
sudo bash deploy/scripts/backup.sh --id "pre_manual_upgrade"

# 2. Pull latest code
sudo -u alohub git pull origin main

# 3. Install dependencies
sudo -u alohub bun install

# 4. Migrate database
sudo -u alohub bun run db:push

# 5. Build
sudo -u alohub NODE_ENV=production bun run build

# 6. Restart
sudo systemctl restart alolabs-agent-hub

# 7. Verify
curl -sf http://127.0.0.1:3004/api/health | jq .
```

### 9.3 Rollback

If the upgrade causes issues:

```bash
# Automatic rollback to previous commit
sudo bash deploy/scripts/rollback.sh

# Rollback to a specific commit
sudo bash deploy/scripts/rollback.sh --commit abc12345

# Rollback using a backup ID
sudo bash deploy/scripts/rollback.sh --backup-id pre_upgrade_20250101_120000
```

---

## 10. Backup and Restore

### 10.1 Backup

#### Manual Backup

```bash
# Full backup (database + files)
sudo bash deploy/scripts/backup.sh

# Custom backup ID
sudo bash deploy/scripts/backup.sh --id "weekly_2025w01"

# Database only
sudo bash deploy/scripts/backup.sh --db-only

# Files only
sudo bash deploy/scripts/backup.sh --files-only

# Quiet mode (for cron)
sudo bash deploy/scripts/backup.sh --quiet

# Backup with offsite upload
sudo bash deploy/scripts/backup.sh --upload "aws s3 cp {} s3://my-bucket/backups/"
```

#### Automated Backup (Cron)

A cron job is included in `deploy/cron/alolabs-cron`. Install it:

```bash
sudo cp deploy/cron/alolabs-cron /etc/cron.d/alolabs-cron
sudo chmod 644 /etc/cron.d/alolabs-cron
```

Default schedule: **Daily at 2:00 AM** (configurable via `BACKUP_SCHEDULE` in `.env`).

#### What Gets Backed Up

| Item                | Description                                |
|---------------------|--------------------------------------------|
| `database.sql.gz`   | MariaDB dump (encrypted if key is set)     |
| `next-build.tar.gz` | `.next/` build output                      |
| `data.tar.gz`       | Uploaded files and data directory          |
| `logs.tar.gz`       | Application log files                      |
| `.env.bak`          | Environment configuration (secrets)        |
| `commit.txt`        | Git commit SHA at time of backup           |
| `MANIFEST.json`     | Backup metadata (timestamp, size, files)   |

#### Backup Encryption

If `BACKUP_ENCRYPTION_KEY` is set in `.env`, the database dump is encrypted with AES-256-CBC before storage.

### 10.2 Restore

```bash
# Restore a specific backup (full)
sudo bash deploy/scripts/restore.sh --backup-id 20250101_020000

# Restore database only
sudo bash deploy/scripts/restore.sh --backup-id 20250101_020000 --db-only

# Restore files only (skip database)
sudo bash deploy/scripts/restore.sh --backup-id 20250101_020000 --files-only

# Partial match (finds backup starting with ID prefix)
sudo bash deploy/scripts/restore.sh --backup-id weekly_2025
```

**Restore process:**

1. Displays backup manifest
2. **Requires confirmation** — type `RESTORE` to proceed
3. Creates a pre-restore safety backup
4. Stops the service
5. Restores files (`.env`, `.next/`, `data/`, `logs/`)
6. Drops and recreates the database, then imports the dump
7. Restarts the service

> **Warning:** The restore process is destructive. It overwrites the current database and files. Always verify the backup ID before proceeding.

### 10.3 Retention

Backups older than `BACKUP_RETENTION_DAYS` (default: 90 days) are automatically cleaned up after each backup run.

---

## 11. Troubleshooting

### 11.1 Service Won't Start

```bash
# Check service status
sudo systemctl status alolabs-agent-hub

# Check detailed logs
sudo journalctl -u alolabs-agent-hub -n 100 --no-pager

# Common causes:
# 1. .env file missing or misconfigured
ls -la /opt/alolabs/agent-hub/.env

# 2. Database connection failed
sudo -u alohub bash -c 'cd /opt/alolabs/agent-hub && bun run db:push'

# 3. Build output missing
ls -la /opt/alolabs/agent-hub/.next/standalone/server.js

# 4. Port already in use
ss -tlnp | grep 3004

# 5. Permission issues
sudo -u alohub ls /opt/alolabs/agent-hub/.env
```

### 11.2 Database Connection Errors

```bash
# Test MariaDB connectivity
mysql -u alohub_user -p -h 127.0.0.1 alohub_production -e "SELECT 1"

# Check MariaDB status
sudo systemctl status mariadb

# Check for slow queries
sudo tail -50 /var/log/mysql/mariadb-slow.log

# Verify DATABASE_URL format in .env
grep DATABASE_URL /opt/alolabs/agent-hub/.env
```

### 11.3 Nginx Issues

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -50 /var/log/nginx/alolabs_panel_error.log
sudo tail -50 /var/log/nginx/alolabs_api_error.log

# Verify SSL certificates
sudo certbot certificates

# Check if port 80/443 are in use
sudo ss -tlnp | grep -E ':80|:443'

# Common: missing snippets directory
ls /etc/nginx/snippets/
```

### 11.4 High Memory Usage

```bash
# Check process memory
ps aux --sort=-%mem | head -10

# Check systemd memory limit
systemctl show alolabs-agent-hub | grep MemoryMax

# Adjust memory limit in service file
# Edit /etc/systemd/system/alolabs-agent-hub.service
# MemoryMax=6G  (increase from default 4G)
sudo systemctl daemon-reload
sudo systemctl restart alolabs-agent-hub
```

### 11.5 SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Verify SSL (external test)
curl -Iv https://alolabs.net 2>&1 | grep -E "SSL|certificate|expire"

# Test with SSL Labs
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=alolabs.net
```

### 11.6 Queue Service (Socket.IO) Not Connecting

```bash
# Verify the queue mini-service is running
# Check for processes on port 3004 (shared with main app)

# Check WebSocket proxy in Nginx
sudo nginx -t

# Check browser console for:
# - "ECONNREFUSED" → backend not running
# - "403" → CORS or auth issue
# - "400" → transport mismatch
```

### 11.7 Performance Issues

```bash
# Check MariaDB slow queries
sudo tail -100 /var/log/mysql/mariadb-slow.log

# Check Redis memory usage
redis-cli info memory

# Check application logs for errors
sudo journalctl -u alolabs-agent-hub --since "1 hour ago" | grep -i error

# Run database health check
sudo bash deploy/scripts/database-check.sh

# Run security check
sudo bash deploy/scripts/security-check.sh

# Run full health check
sudo bash deploy/scripts/health-check.sh
```

### 11.8 Failed Upgrade / Rollback Needed

```bash
# Check the upgrade log
sudo journalctl -u alolabs-agent-hub --since "10 minutes ago"

# List available backups
ls -la /opt/alolabs/agent-hub/backups/

# Rollback to previous version
sudo bash deploy/scripts/rollback.sh

# Rollback to specific commit
sudo bash deploy/scripts/rollback.sh --commit <SHA>

# If rollback fails, restore from backup
sudo bash deploy/scripts/restore.sh --backup-id pre_upgrade_<timestamp>
```

### 11.9 Useful Diagnostic Commands

```bash
# Full system health check
sudo bash deploy/scripts/health-check.sh

# Database connectivity and schema check
sudo bash deploy/scripts/database-check.sh

# Security configuration audit
sudo bash deploy/scripts/security-check.sh

# Verify all services
systemctl is-active mariadb redis-server nginx alolabs-agent-hub fail2ban

# Check firewall rules
sudo ufw status verbose

# Check fail2ban
sudo fail2ban-client status

# Disk usage
df -h /opt/alolabs/agent-hub
du -sh /opt/alolabs/agent-hub/backups/*
du -sh /opt/alolabs/agent-hub/logs/*
```