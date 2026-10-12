# ALO Labs AI-EOS — Production Deployment Guide

## 1. Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 50 GB SSD | 100+ GB SSD |
| Node.js | 20.x LTS | 22.x LTS |
| Bun | 1.x | Latest stable |

> **Note:** The application serves 2,000+ AI agents, 100 departments, and 251 API routes. Minimum 4 GB RAM is required for production workloads.

---

## 2. Prerequisites

Install the following software on your server before deploying:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git nano ufw nginx sqlite3

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # v20.x.x
npm --version    # 10.x.x

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version    # 1.x

# Install PM2 (process manager)
npm install -g pm2
pm2 --version

# Install Certbot (for Let's Encrypt SSL)
sudo apt install -y certbot python3-certbot-nginx
```

---

## 3. Environment Variables

Copy the provided `.env.example` to `.env` and fill in production values:

```bash
cp .env.example .env
nano .env
```

**Critical variables to set in production:**

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Must be `production` | `production` |
| `APP_SECRET` | Session encryption secret | Generate with `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | Data encryption key | Generate with `openssl rand -base64 32` |
| `CSRF_SECRET` | CSRF protection secret | Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app | `https://alolabs.net` |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins | `https://alolabs.net` |
| `APP_PORT` | Port for the app to listen on | `3000` |

**AI Provider variables:**

| Variable | Description |
|----------|-------------|
| `ZAI_API_KEY` | Z.ai SDK API key (primary AI provider) |
| `GROQ_API_KEY` | Groq API key (fast LPU inference) |
| `OPENROUTER_API_KEY` | OpenRouter API key (multi-model routing) |
| `OLLAMA_ENDPOINT` | Local Ollama server URL |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `MISTRAL_API_KEY` | Mistral AI API key |

**External service URLs:**

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection URL |
| `QDRANT_URL` | Qdrant vector database URL |
| `MINIO_URL` | MinIO object storage URL |

> Refer to `.env.example` for the complete list of all 100+ configurable variables with inline documentation.

---

## 4. Installation Steps

```bash
# 1. Clone the repository
sudo mkdir -p /opt/alo-labs-ai-eos
sudo chown $USER:$USER /opt/alo-labs-ai-eos
cd /opt/alo-labs-ai-eos
git clone https://github.com/YOUR_ORG/alo-labs-ai-eos.git .

# 2. Install dependencies
bun install

# 3. Copy and configure environment
cp .env.example .env
nano .env  # Fill in production values

# 4. Create required directories
mkdir -p /opt/alo-labs-ai-eos/logs
mkdir -p /opt/alo-labs-ai-eos/storage
mkdir -p /opt/alo-labs-ai-eos/backups
```

---

## 5. Database Setup

The application uses SQLite via Prisma ORM:

```bash
cd /opt/alo-labs-ai-eos

# Generate Prisma client
bunx prisma generate

# Push schema to database (creates/updates tables)
bun run db:push

# (Optional) Seed with initial data
bunx tsx scripts/seed-v3.ts
```

> **Note:** The SQLite database file is stored at `db/custom.db` by default. For high-concurrency production workloads, consider switching to PostgreSQL using the `POSTGRES_URL` environment variable.

---

## 6. Build Commands

```bash
cd /opt/alo-labs-ai-eos

# Production build (creates .next/standalone/)
bun run build

# Verify build output
ls -la .next/standalone/server.js  # Should exist
ls -la .next/static/                  # Should contain static assets
```

The `next.config.ts` is configured with `output: "standalone"` for optimized production builds.

---

## 7. Process Startup (PM2)

The project includes `ecosystem.config.js` at the repository root:

```bash
cd /opt/alo-labs-ai-eos

# Start the application with PM2
pm2 start ecosystem.config.js

# Verify it's running
pm2 status
pm2 logs alo-labs-ai-eos --lines 20

# Save PM2 process list for auto-restart on reboot
pm2 save
pm2 startup  # Follow the command it prints
```

**PM2 configuration highlights:**
- Process name: `alo-labs-ai-eos`
- Command: `next start` (production server)
- Max memory restart: 2 GB
- Graceful shutdown: 10s kill timeout
- Log files: `/opt/alo-labs-ai-eos/logs/`

---

## 8. Nginx Configuration

### 8.1 Copy the Nginx Config

A production-ready Nginx template is provided at `deploy/nginx.conf`.

```bash
# Replace YOUR_DOMAIN.com with your actual domain
sudo cp deploy/nginx.conf /etc/nginx/sites-available/alo-labs-ai-eos
sudo sed -i 's/YOUR_DOMAIN.com/your-actual-domain.com/g' /etc/nginx/sites-available/alo-labs-ai-eos

# Enable the site
sudo ln -sf /etc/nginx/sites-available/alo-labs-ai-eos /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 8.2 Test and Reload

```bash
# Test configuration syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
```

### 8.3 Nginx Config Features

- HTTP → HTTPS redirect
- SSL/TLS hardening (TLSv1.2, TLSv1.3)
- Security headers (X-Frame-Options, HSTS, CSP)
- WebSocket upgrade support
- Extended timeouts for AI endpoints (`/api/ai/`, `/api/enterprise/agents/run`)
- Static asset caching (`/_next/static/` with 1-year cache)
- Sensitive path blocking (`.env`, `.git`)
- Gzip compression

> **Advanced:** A multi-domain configuration with rate limiting is available at `deploy/nginx/alolabs.conf` for deployments using `alolabs.net`, `panel.alolabs.net`, and `api.alolabs.net`.

---

## 9. SSL Configuration (Let's Encrypt)

```bash
# Obtain SSL certificate (interactive)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Or non-interactively
sudo certbot --nginx -d your-domain.com --agree-tos --email admin@your-domain.com --redirect

# Test auto-renewal
sudo certbot renew --dry-run

# Certbot auto-renewal is handled by a systemd timer
sudo systemctl status certbot.timer
```

**Alternative: Cloudflare SSL**

If using Cloudflare as a CDN/proxy:
1. Set Cloudflare SSL/TLS mode to **Full** (not "Full (Strict)")
2. Enable "Always Use HTTPS"
3. Enable Universal SSL Certificate
4. The Nginx HTTP→HTTPS redirect still applies for direct server access

---

## 10. Firewall Requirements

```bash
# Configure UFW firewall
sudo ufw allow OpenSSH     # Port 22 — SSH access
sudo ufw allow 'Nginx Full'  # Ports 80 + 443 — HTTP/HTTPS

# Block all other incoming traffic
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Enable firewall
sudo ufw --force enable

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

> **Important:** Never expose port 3000 (Next.js) directly. All traffic must go through Nginx on ports 80/443.

---

## 11. Health Checks

The application provides multiple health check endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Basic health — returns system name, agent/department counts, status |
| `/api/health/ready` | GET | Readiness check — verifies DB connection and critical services |
| `/api/health/live` | GET | Liveness check — lightweight, for load balancer health probes |
| `/api/health/ping` | GET | Minimal ping — returns `pong` |
| `/api/health/deep` | GET | Deep health — checks all subsystems (DB, Redis, Qdrant, storage) |

**Test health:**

```bash
# Local test
curl -s http://localhost:3000/api/health | python3 -m json.tool

# Through Nginx
curl -s https://your-domain.com/api/health | python3 -m json.tool
```

**Monitoring integration:**

```bash
# Cron-based health check (every 5 minutes)
*/5 * * * * curl -sf https://your-domain.com/api/health/live || systemctl restart nginx
```

---

## 12. Backup Strategy

### 12.1 Automated Backups

The backup script is located at `scripts/backup.sh`:

```bash
# Run manually
/opt/alo-labs-ai-eos/scripts/backup.sh

# Schedule daily backup at 2:00 AM
crontab -e
# Add this line:
0 2 * * * /opt/alo-labs-ai-eos/scripts/backup.sh >> /opt/alo-labs-ai-eos/logs/backup.log 2>&1
```

### 12.2 What Gets Backed Up

- **SQLite database** (`db/custom.db`) — copied as `custom_TIMESTAMP.db`
- **Storage directory** (`storage/`) — compressed as `storage_TIMESTAMP.tar.gz`
- **Retention:** Backups older than 30 days are automatically deleted

### 12.3 Backup Location

Backups are stored in `/opt/alo-labs-ai-eos/backups/` by default.

---

## 13. Restore Procedure

### 13.1 List Available Backups

```bash
ls -la /opt/alo-labs-ai-eos/backups/
```

### 13.2 Restore from Backup

```bash
# Restore a specific backup by timestamp
/opt/alo-labs-ai-eos/scripts/restore.sh 20250101_120000

# The script will:
# 1. Confirm the action
# 2. Stop the PM2 process
# 3. Restore the database
# 4. Restore storage (if available)
# 5. Restart the application
```

### 13.3 Emergency Restore

If the application won't start:

```bash
# Stop everything
pm2 stop alo-labs-ai-eos

# Restore database manually
cp /opt/alo-labs-ai-eos/backups/custom_TIMESTAMP.db /opt/alo-labs-ai-eos/db/custom.db

# Restart
pm2 start alo-labs-ai-eos
```

---

## 14. Update Procedure

### 14.1 Standard Update

```bash
cd /opt/alo-labs-ai-eos

# 1. Pull latest code
git pull origin main

# 2. Install dependencies
bun install

# 3. Update database schema
bunx prisma generate
bun run db:push

# 4. Rebuild
bun run build

# 5. Restart application
pm2 restart alo-labs-ai-eos

# 6. Verify
pm2 logs alo-labs-ai-eos --lines 20
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

### 14.2 Zero-Downtime Update (Advanced)

```bash
cd /opt/alo-labs-ai-eos

# Build new version while old one still serves traffic
git pull origin main
bun install
bunx prisma generate
bun run build

# Reload PM2 process gracefully (waits for connections to drain)
pm2 reload alo-labs-ai-eos
```

---

## 15. Rollback Procedure

### 15.1 Git Rollback

```bash
cd /opt/alo-labs-ai-eos

# Check recent commits
git log --oneline -10

# Rollback to a specific commit
git checkout <commit-hash>

# Rebuild and restart
bun install
bunx prisma generate
bun run build
pm2 restart alo-labs-ai-eos

# Switch back to main branch when ready
git checkout main
```

### 15.2 Database Rollback

```bash
# Use the restore script with the backup timestamp from before the update
/opt/alo-labs-ai-eos/scripts/restore.sh 20250101_120000
```

### 15.3 Symlink-Swap Rollback (Recommended for Critical Environments)

```bash
# Set up releases directory
mkdir -p /opt/alo-labs-ai-eos/releases

# Before update, create a release snapshot
cp -r /opt/alo-labs-ai-eos /opt/alo-labs-ai-eos/releases/release_$(date +%Y%m%d_%H%M%S)

# To rollback, swap the symlink
ln -sfn /opt/alo-labs-ai-eos/releases/release_YYYYMMDD_HHMMSS /opt/alo-labs-ai-eos
cd /opt/alo-labs-ai-eos
pm2 restart alo-labs-ai-eos
```

---

## 16. Troubleshooting

### 16.1 Application Won't Start

```bash
# Check PM2 status and error logs
pm2 status
pm2 logs alo-labs-ai-eos --err --lines 50

# Common causes:
# - Missing .env file → copy .env.example and configure
# - Port 3000 already in use → lsof -i :3000
# - Missing dependencies → bun install
# - Database error → bunx prisma generate && bun run db:push
```

### 16.2 502 Bad Gateway

```bash
# Check if Next.js is running on port 3000
curl -s http://localhost:3000/api/health

# If not running:
pm2 restart alo-labs-ai-eos

# Check Nginx configuration
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### 16.3 Port 3000 Already in Use

```bash
# Find what's using port 3000
lsof -i :3000
# or
ss -tlnp | grep 3000

# Kill the process
kill -9 $(lsof -t -i:3000)

# Restart PM2
pm2 restart alo-labs-ai-eos
```

### 16.4 Database Errors

```bash
# Regenerate Prisma client
bunx prisma generate

# Verify database file exists
ls -la /opt/alo-labs-ai-eos/db/custom.db

# Reset and re-seed (DESTRUCTIVE — only if needed)
bunx prisma db push --force-reset
bunx tsx scripts/seed-v3.ts
```

### 16.5 SSL / Certificate Issues

```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Force certificate renewal
sudo certbot renew --force-renewal

# Verify certificate
curl -vI https://your-domain.com 2>&1 | grep 'expire'

# If using Cloudflare, ensure SSL mode is set to "Full"
```

### 16.6 High Memory Usage

```bash
# Check current memory
pm2 monit
free -m

# The app is configured to auto-restart at 2 GB memory
# If it keeps restarting, consider:
# 1. Increasing server RAM
# 2. Reducing concurrent AI operations
# 3. Switching to PostgreSQL for better memory management
```

### 16.7 Permission Denied Errors

```bash
# Fix file ownership
sudo chown -R $USER:$USER /opt/alo-labs-ai-eos

# Fix permissions
sudo chmod -R 755 /opt/alo-labs-ai-eos
chmod 600 /opt/alo-labs-ai-eos/.env
```

---

## 17. Monitoring

### 17.1 PM2 Dashboard

```bash
# Real-time monitoring dashboard
pm2 monit

# Process status
pm2 status
pm2 describe alo-labs-ai-eos

# View logs
pm2 logs alo-labs-ai-eos --lines 100
pm2 logs alo-labs-ai-eos --err  # Errors only
```

### 17.2 Health Endpoints

```bash
# Basic health
curl -s http://localhost:3000/api/health | python3 -m json.tool

# Deep health (all subsystems)
curl -s http://localhost:3000/api/health/deep | python3 -m json.tool

# Prometheus metrics
curl -s http://localhost:3000/api/metrics/prometheus
```

### 17.3 System Resources

```bash
# Disk usage
df -h /opt/alo-labs-ai-eos

# Memory usage
free -m

# Top processes
htop

# Nginx status
sudo systemctl status nginx
sudo nginx -t

# Backup disk usage
du -sh /opt/alo-labs-ai-eos/backups/
```

### 17.4 Log Locations

| Log | Path |
|-----|------|
| PM2 stdout | `/opt/alo-labs-ai-eos/logs/out.log` |
| PM2 stderr | `/opt/alo-labs-ai-eos/logs/error.log` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` |
| Backup log | `/opt/alo-labs-ai-eos/logs/backup.log` |

### 17.5 External Monitoring (Optional)

- **UptimeRobot** (free tier) — monitor `/api/health/live`
- **Grafana + Prometheus** — config provided in `monitoring/` directory
- **PM2 Plus** — `pm2 plus` for cloud monitoring

---

## Quick Reference

```bash
# === FIRST-TIME DEPLOYMENT ===
git clone <repo-url> /opt/alo-labs-ai-eos && cd /opt/alo-labs-ai-eos
cp .env.example .env && nano .env  # Configure environment
bun install && bunx prisma generate && bun run build
pm2 start ecosystem.config.js && pm2 save && pm2 startup
sudo cp deploy/nginx.conf /etc/nginx/sites-available/alo-labs-ai-eos
# Edit domain in nginx config, then:
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable

# === DAILY OPERATIONS ===
pm2 status                    # Check app status
pm2 logs alo-labs-ai-eos     # View logs
curl -s localhost:3000/api/health  # Health check

# === UPDATE ===
cd /opt/alo-labs-ai-eos && git pull && bun install && bun run build
bunx prisma generate && bun run db:push && pm2 restart alo-labs-ai-eos

# === BACKUP & RESTORE ===
/opt/alo-labs-ai-eos/scripts/backup.sh                  # Backup now
/opt/alo-labs-ai-eos/scripts/restore.sh 20250101_120000  # Restore from backup
```
