# ALO Labs AIOS — Production Deployment Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** DevOps engineers and system administrators

---

## Table of Contents

1. [Server Requirements](#1-server-requirements)
2. [Production Environment Setup](#2-production-environment-setup)
3. [Database Migration (SQLite to MariaDB/PostgreSQL)](#3-database-migration)
4. [SSL Certificate Setup](#4-ssl-certificate-setup)
5. [Nginx Reverse Proxy](#5-nginx-reverse-proxy)
6. [systemd Service Setup](#6-systemd-service-setup)
7. [Firewall Configuration](#7-firewall-configuration)
8. [Log Management](#8-log-management)
9. [Performance Tuning](#9-performance-tuning)
10. [Scaling Strategies](#10-scaling-strategies)

---

## 1. Server Requirements

### Minimum Production Server

| Resource | Minimum | Recommended | Notes |
|---|---|---|---|
| **CPU** | 2 cores | 4 cores | Bun is single-threaded; cores help with I/O |
| **RAM** | 4 GB | 8 GB | Next.js + MariaDB + Redis |
| **Disk** | 25 GB SSD | 50 GB SSD | SSD required for database performance |
| **OS** | Ubuntu 22.04 | Ubuntu 24.04 LTS | Long-term support required |
| **Network** | 100 Mbps | 1 Gbps | Depends on expected traffic |

### Recommended Stack

```
┌─────────────────────────────────────────────────┐
│                  Nginx (443)                    │
│            Reverse Proxy + SSL                   │
├─────────────────────────────────────────────────┤
│            ALO Labs AIOS (3004)                  │
│         Next.js via Bun Runtime                  │
├────────────┬────────────┬───────────────────────┤
│ MariaDB    │  Redis 7   │  MinIO (optional)     │
│  (3306)    │  (6379)    │  (9000)               │
└────────────┴────────────┴───────────────────────┘
```

---

## 2. Production Environment Setup

### Step 1: Run the Installer

The project includes an automated install script at `deploy/scripts/install.sh`:

```bash
sudo bash deploy/scripts/install.sh
```

This script:
- Creates the `alohub` system user
- Installs Bun to `/usr/local/bin/bun`
- Creates `/opt/alolabs/agent-hub`
- Sets directory permissions
- Installs the systemd service unit
- Installs cron jobs
- Installs Nginx configuration

### Step 2: Manual Setup (if preferred)

```bash
# Create application user
sudo useradd -r -s /bin/bash -m -d /opt/alolabs alohub

# Clone repository
sudo git clone <repo-url> /opt/alolabs/agent-hub
sudo chown -R alohub:alohub /opt/alolabs/agent-hub

# Create required directories
sudo -u alohub mkdir -p /opt/alolabs/agent-hub/{logs,backups,data,storage}

# Install dependencies
cd /opt/alolabs/agent-hub
sudo -u alohub bun install --frozen-lockfile
```

### Step 3: Configure Production `.env`

```bash
sudo -u alohub nano /opt/alolabs/agent-hub/.env
```

**Critical production variables:**

```env
NODE_ENV=production
PORT=3004

# Database (MariaDB — see Section 3)
DATABASE_URL="mysql://alohub_user:STRONG_DB_PASSWORD@127.0.0.1:3306/alohub_production"

# Authentication
NEXTAUTH_SECRET="$(openssl rand -base64 48)"
AUTH_OWNER_EMAIL="admin@your-domain.com"
AUTH_OWNER_PASSWORD="$(openssl rand -base64 24)"

# API Gateway
API_GATEWAY_SECRET="$(openssl rand -base64 48)"
API_KEY_ENCRYPTION_KEY="$(openssl rand -base64 48)"
CSRF_SECRET="$(openssl rand -base64 32)"
SESSION_ENCRYPTION_KEY="$(openssl rand -base64 48)"
WEBHOOK_SECRET="$(openssl rand -base64 32)"
BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 48)"

# Redis
REDIS_URL="redis://127.0.0.1:6379"

# CORS — production domains only
ALLOWED_ORIGINS="https://alolabs.net,https://panel.alolabs.net,https://api.alolabs.net"
```

**Secure the `.env` file:**

```bash
sudo chmod 600 /opt/alolabs/agent-hub/.env
sudo chown alohub:alohub /opt/alolabs/agent-hub/.env
```

---

## 3. Database Migration (SQLite to MariaDB/PostgreSQL)

The default development setup uses SQLite. Production requires MariaDB or PostgreSQL.

### Option A: MariaDB (Recommended with Docker)

```bash
# Start MariaDB via Docker Compose
docker compose up -d mariadb

# Update DATABASE_URL in .env
# DATABASE_URL="mysql://alohub_user:strong_password@127.0.0.1:3306/alohub_production"
```

### Option B: MariaDB (Native Install)

```bash
# Install MariaDB
sudo apt install -y mariadb-server mariadb-client

# Secure installation
sudo mysql_secure_installation

# Create database and user
sudo mysql -e "
  CREATE DATABASE alohub_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'alohub_user'@'127.0.0.1' IDENTIFIED BY 'STRONG_DB_PASSWORD';
  GRANT ALL PRIVILEGES ON alohub_production.* TO 'alohub_user'@'127.0.0.1';
  FLUSH PRIVILEGES;
"

# Configure MariaDB
sudo cp deploy/docker/mariadb-custom.cnf /etc/mysql/mariadb.conf.d/99-custom.cnf
sudo systemctl restart mariadb
```

### Option C: PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql -c "
  CREATE USER alohub_user WITH PASSWORD 'STRONG_DB_PASSWORD';
  CREATE DATABASE alohub_production OWNER alohub_user;
"

# Update DATABASE_URL
# DATABASE_URL="postgresql://alohub_user:strong_password@127.0.0.1:5432/alohub_production"

# Update Prisma schema provider
# Change: provider = "sqlite"  →  provider = "postgresql"
```

### Push Schema and Build

```bash
cd /opt/alolabs/agent-hub
sudo -u alohub bun run db:push
sudo -u alohub NODE_ENV=production bun run build
```

---

## 4. SSL Certificate Setup

### Using Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificates for all domains
sudo certbot certonly --nginx \
  -d alolabs.net \
  -d www.alolabs.net \
  -d panel.alolabs.net \
  -d api.alolabs.net

# Certificates will be at:
# /etc/letsencrypt/live/alolabs.net/fullchain.pem
# /etc/letsencrypt/live/alolabs.net/privkey.pem
```

### Auto-Renewal

Certbot installs a systemd timer automatically. Verify:

```bash
sudo systemctl list-timers | grep certbot
```

Or use the project's `deploy/nginx/ssl-setup.sh`:

```bash
sudo bash deploy/nginx/ssl-setup.sh --domains "alolabs.net,panel.alolabs.net,api.alolabs.net"
```

---

## 5. Nginx Reverse Proxy

### Install Nginx

```bash
sudo apt install -y nginx
```

### Deploy Configuration

The project provides a complete Nginx config at `deploy/nginx/alolabs.conf`:

```bash
# Copy the configuration
sudo cp deploy/nginx/alolabs.conf /etc/nginx/sites-available/alolabs
sudo ln -sf /etc/nginx/sites-available/alolabs /etc/nginx/sites-enabled/alolabs

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Create SSL params snippet
sudo mkdir -p /etc/nginx/snippets
sudo tee /etc/nginx/snippets/ssl-params.conf > /dev/null <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
EOF

# Create security headers snippet
sudo tee /etc/nginx/snippets/security-headers.conf > /dev/null <<'EOF'
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
EOF

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

### Nginx Rate Limits

The configuration includes three rate-limiting zones:

| Zone | Limit | Applied To |
|---|---|---|
| `api_limit` | 60 requests/minute | `/api/*` endpoints |
| `panel_limit` | 30 requests/minute | Panel pages |
| `auth_limit` | 5 requests/minute | `/api/auth/*` endpoints |

---

## 6. systemd Service Setup

### Install Service File

```bash
sudo cp deploy/systemd/alolabs-agent-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable alolabs-agent-hub
```

### Service Configuration

The service file includes:

| Setting | Value | Purpose |
|---|---|---|
| `User` | `alohub` | Non-root execution |
| `MemoryMax` | `4G` | Memory cap |
| `CPUQuota` | `200%` | CPU limit |
| `LimitNOFILE` | `65535` | File descriptor limit |
| `Restart` | `on-failure` | Auto-restart on crash |
| `RestartSec` | `10` | Seconds between restarts |
| `NoNewPrivileges` | `true` | Security hardening |
| `ProtectSystem` | `strict` | Filesystem protection |

### Service Management

```bash
# Start / stop / restart
sudo systemctl start alolabs-agent-hub
sudo systemctl stop alolabs-agent-hub
sudo systemctl restart alolabs-agent-hub

# Check status
sudo systemctl status alolabs-agent-hub

# View logs
sudo journalctl -u alolabs-agent-hub -f

# View last 100 lines
sudo journalctl -u alolabs-agent-hub -n 100
```

---

## 7. Firewall Configuration (UFW)

```bash
# Install UFW
sudo apt install -y ufw

# Default: deny incoming, allow outgoing
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (adjust port if custom)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status verbose
```

**Expected output:**

```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere
80/tcp (v6)                ALLOW IN    Anywhere
443/tcp (v6)               ALLOW IN    Anywhere
```

> **Important:** Do NOT open ports 3004 (app), 3306 (DB), or 6379 (Redis) to the public. These must remain accessible only from `127.0.0.1`.

---

## 8. Log Management

### Application Logs

```bash
# systemd journal logs
sudo journalctl -u alolabs-agent-hub -f

# Application log file (from bun run start)
tail -f /opt/alolabs/agent-hub/server.log

# Dev log
tail -f /opt/alolabs/agent-hub/dev.log
```

### Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/alolabs_main_access.log
sudo tail -f /var/log/nginx/alolabs_panel_access.log
sudo tail -f /var/log/nginx/alolabs_api_access.log

# Error logs
sudo tail -f /var/log/nginx/alolabs_main_error.log
```

### Log Rotation

The cron job at `deploy/cron/alolabs-cron` handles log cleanup:

```
# Clean up old cron logs (keep 30 days)
0 0 * * * root find /opt/alolabs/agent-hub/logs -name "cron-*.log" -mtime +30 -delete
```

### Journal Rotation

```bash
# Configure journald to limit logs
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/size-limit.conf > /dev/null <<'EOF'
[Journal]
SystemMaxUse=500M
SystemMaxFileSize=100M
MaxRetentionSec=30day
EOF
sudo systemctl restart systemd-journald
```

---

## 9. Performance Tuning

### System-Level Tuning

```bash
# Increase file descriptor limits
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf

# Optimize TCP stack
sudo tee -a /etc/sysctl.d/99-alolabs.conf > /dev/null <<'EOF'
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 1024 65535
EOF
sudo sysctl --system
```

### MariaDB Tuning

```bash
# Apply the included MariaDB config
sudo cp deploy/docker/mariadb-custom.cnf /etc/mysql/mariadb.conf.d/99-custom.cnf
sudo systemctl restart mariadb
```

Key settings in the config:
- `max-connections=200`
- `innodb-buffer-pool-size=256M`
- `slow-query-log=1` with `long-query-time=2`

### Next.js/Bun Tuning

```env
# In .env
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# Increase Bun heap if needed (in systemd service)
# Environment="BUN_HEAP_MAX=4096"
```

### Redis Tuning

```bash
# In docker-compose.yml, the Redis config includes:
# --maxmemory 128mb
# --maxmemory-policy allkeys-lru
# --save 900 1 / 300 10 / 60 10000
# --appendonly yes
```

---

## 10. Scaling Strategies

### Vertical Scaling

Increase server resources and adjust:

1. **RAM → 16 GB**: Increase `MemoryMax` to `8G`, MariaDB buffer pool to `1G`
2. **CPU → 8 cores**: Increase `CPUQuota` to `400%`
3. **Disk → SSD with high IOPS**: Critical for database performance

### Horizontal Scaling

#### Multi-Process with PM2

```bash
# Install PM2
npm install -g pm2

# Start with 4 instances
cd /opt/alolabs/agent-hub
pm2 start .next/standalone/server.js -i 4 --name alolabs

# Configure upstream in Nginx for multiple ports
```

#### Load Balancer Architecture

```
                ┌──────────────┐
                │  Load Balancer│
                │   (Nginx/HA) │
                └──────┬───────┘
           ┌───────────┼───────────┐
           ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ App #1   │ │ App #2   │ │ App #3   │
     │ :3004    │ │ :3005    │ │ :3006    │
     └────┬─────┘ └────┬─────┘ └────┬─────┘
          │            │            │
     ┌────┴────────────┴────────────┴────┐
     │    MariaDB Primary    │  Replica  │
     │         :3306          │  :3307   │
     └───────────────────────┴──────────┘
```

#### Redis as Session Store

For multi-instance deployments, configure Redis for session storage:

```env
REDIS_URL="redis://redis-host:6379"
```

The application's Redis adapter (`src/lib/redis.ts`) automatically handles sessions, caching, and rate limiting across instances.

### Database Scaling

- **Read replicas:** Configure MariaDB replication for read-heavy workloads
- **Connection pooling:** Adjust `maxConnections` in PostgreSQL config
- **Query optimization:** Enable slow query log and review regularly

---

## Quick Deploy Checklist

- [ ] Server provisioned with Ubuntu 24.04 LTS
- [ ] Firewall configured (UFW: 22, 80, 443 only)
- [ ] MariaDB installed and secured
- [ ] Redis installed (Docker or native)
- [ ] Bun installed at `/usr/local/bin/bun`
- [ ] Application cloned to `/opt/alolabs/agent-hub`
- [ ] `.env` configured with all production secrets
- [ ] `.env` permissions set to `600`
- [ ] Database schema pushed (`bun run db:push`)
- [ ] Application built (`NODE_ENV=production bun run build`)
- [ ] systemd service installed and enabled
- [ ] SSL certificates obtained (Let's Encrypt)
- [ ] Nginx configured and tested
- [ ] Backups configured (cron + off-site)
- [ ] Monitoring stack started (Prometheus + Grafana)
- [ ] Health check passing (`curl http://127.0.0.1:3004/api/health`)

---

## Next Steps

- [Backup Guide](./BACKUP-GUIDE.md) — Configure automated backups
- [Monitoring Guide](./MONITORING-GUIDE.md) — Set up observability
- [CI/CD Guide](./CI-CD-GUIDE.md) — Automate deployments
- [Security Guide](./SECURITY-GUIDE.md) — Harden your production instance