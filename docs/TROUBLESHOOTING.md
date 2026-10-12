# AgentOS troubleshooting

| Symptom | Diagnosis / recovery |
|---|---|
| Run fails with `Configuration required` | No AI provider configured/reachable. Configure a supported provider (or Ollama), verify `/api/v1/health`, then submit a new run. Do not replay a failed run as success. |
| `/api/v1/health` returns 503 | Inspect `checks`: DB and queue may be healthy while model router is degraded. This is expected in the sandbox. |
| Login fails after seed | `SEED_ADMIN_PASSWORD` must be set; seed now uses bcrypt. Rerun seed to repair the old sandbox's SHA-256 hash only. Do not reset a real user's password from the seed script. |
| `GET /api/runs/:id` is 401/403 | Send session Bearer token; select a company membership. v1 API-key scopes are separate from web-session auth. |
| SSE seems idle | Check persisted `RunEvent` rows and poll run detail. SSE live fanout is in-process; cross-replica event fanout is not yet available. |
| Download link returns 401 | The UI uses a token-bearing fetch and blob download. Plain links cannot send the Bearer header. |
| Build has duplicate `.next/dev/types` identifiers | Stop dev server, remove only `.next/dev`, then build again. Do not remove application source/DB. |
| Standalone login returns 401 while dev works | A relative SQLite URL may resolve to the build's copied DB. Set an absolute external-volume `DATABASE_URL` for standalone. |
| Workflow/approval stays paused | Automatic resume after human approval is not implemented; consult the final audit. |
| Prisma engine CDN unavailable | Sandbox-specific `db:generate:client-engine` and `db:push:sqlite` are available. Production migrations still require review. |

For legacy endpoints see `docs/TROUBLESHOOTING.md` and the final audit.

---

## Legacy troubleshooting reference (preserved)

# ALO Labs AIOS — Troubleshooting Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** Developers and system administrators

---

## Table of Contents

1. [Installation Issues](#1-installation-issues)
2. [Database Issues](#2-database-issues)
3. [Authentication Issues](#3-authentication-issues)
4. [API Issues](#4-api-issues)
5. [Performance Issues](#5-performance-issues)
6. [Deployment Issues](#6-deployment-issues)
7. [AI Issues](#7-ai-issues)
8. [Social Media Issues](#8-social-media-issues)
9. [Monitoring Issues](#9-monitoring-issues)
10. [Backup Issues](#10-backup-issues)

---

## 1. Installation Issues

### `bun install` Fails with Native Module Errors

| Field | Detail |
|---|---|
| **Symptom** | `npm ERR! gyp info using node-gyp@...` or `error: cannot find module ...` |
| **Cause** | Missing C++ build toolchain for native modules (bcrypt, sharp) |
| **Solution** | `sudo apt install -y build-essential python3-dev` |
| **Prevention** | Pin Bun version in CI and use `--frozen-lockfile` |

```bash
# Ubuntu/Debian
sudo apt install -y build-essential python3-dev

# macOS
xcode-select --install

# If sharp specifically fails
bun add sharp@latest --force
```

### Prisma Generate Fails

| Field | Detail |
|---|---|
| **Symptom** | `Prisma Client could not be generated` or engine download timeout |
| **Cause** | Network issues downloading Prisma engine binary |
| **Solution** | Retry with cache clear; set `PRISMA_ENGINES_MIRROR` for China |
| **Prevention** | Use `bun.lock` to pin Prisma version |

```bash
rm -rf node_modules/.prisma node_modules/@prisma
bun run db:generate

# If behind a proxy / in China
PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/prisma-engines bun run db:generate
```

### Port 3000 Already in Use

| Field | Detail |
|---|---|
| **Symptom** | `Error: listen EADDRINUSE: address already in use :::3000` |
| **Cause** | Another process (previous dev server, other app) using port 3000 |
| **Solution** | Kill the process or use a different port |

```bash
# Find the process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 bun run dev
```

### `z-ai-web-dev-sdk` Import Errors

| Field | Detail |
|---|---|
| **Symptom** | `Module not found` or TypeScript errors referencing `z-ai-web-dev-sdk` |
| **Cause** | Package not installed or version mismatch |
| **Solution** | Reinstall and clear cache |

```bash
bun add z-ai-web-dev-sdk@latest
rm -rf .next
bun run dev
```

### Bun Version Mismatch

| Field | Detail |
|---|---|
| **Symptom** | `Error: Expected Bun version 1.2.x, got 1.1.x` |
| **Cause** | Dockerfile and local Bun versions differ |
| **Solution** | Update Bun to 1.2.5+ |

```bash
bun upgrade
# Verify
bun -v  # Should be 1.2.x
```

---

## 2. Database Issues

### Connection Refused (SQLite)

| Field | Detail |
|---|---|
| **Symptom** | `Error: SQLITE_CANTOPEN: unable to open database file` |
| **Cause** | Invalid `DATABASE_URL` or missing directory |
| **Solution** | Verify `DATABASE_URL` format and directory exists |

```bash
# Check current DATABASE_URL
echo $DATABASE_URL
# Should be: file:./dev.db

# Ensure the directory exists
mkdir -p prisma
```

### Connection Refused (MariaDB)

| Field | Detail |
|---|---|
| **Symptom** | `connect ECONNREFUSED 127.0.0.1:3306` |
| **Cause** | MariaDB not running or wrong port |
| **Solution** | Start MariaDB and verify connectivity |

```bash
# Check if MariaDB is running
docker compose ps mariadb

# If using native MariaDB
sudo systemctl status mariadb
sudo systemctl start mariadb

# Test connection
mysql -h 127.0.0.1 -u alohub_user -palohub_dev_pass -e "SELECT 1;"
```

### Migration Errors

| Field | Detail |
|---|---|
| **Symptom** | `prisma db push` fails with data loss warning |
| **Cause** | Schema changes that would delete columns/tables |
| **Solution** | Review changes, backup first, use `--accept-data-loss` if intentional |

```bash
# See what would change
bun run db:push --help

# Preview changes (dry run equivalent):
# Compare prisma/schema.prisma with current DB

# Accept data loss if intentional (BACK UP FIRST!)
bun run db:push --accept-data-loss
```

### Database Corruption (SQLite)

| Field | Detail |
|---|---|
| **Symptom** | `SQLITE_CORRUPT` or `database disk image is malformed` |
| **Cause** | Process killed during write, disk full, or filesystem error |
| **Solution** | Run integrity check, export/reimport, restore from backup |

```bash
# Check integrity
sqlite3 dev.db "PRAGMA integrity_check;"

# Export data
sqlite3 dev.db ".dump" > backup.sql

# Create fresh database
rm dev.db
sqlite3 dev.db < backup.sql
```

### Database Lock (SQLite)

| Field | Detail |
|---|---|
| **Symptom** | `database is locked` errors during concurrent requests |
| **Cause** | SQLite allows only one writer at a time |
| **Solution** | Kill conflicting processes; consider MariaDB for production |

```bash
# Kill all bun/next processes
pkill -f "next dev"
pkill -f "bun.*server"

# Remove WAL/SHM files
rm -f dev.db-wal dev.db-shm

# Restart
bun run dev
```

---

## 3. Authentication Issues

### Login Fails with "Invalid email or password"

| Field | Detail |
|---|---|
| **Symptom** | HTTP 401 response from `POST /api/auth/login` |
| **Cause** | Wrong credentials, user not seeded, or password hash issue |
| **Solution** | Verify user exists in database, re-seed if needed |

```bash
# Check if user exists
sqlite3 dev.db "SELECT email, name, role, isActive FROM User;"

# If no users, run seed
bun run scripts/seed-v3.ts
```

### MFA Not Working

| Field | Detail |
|---|---|
| **Symptom** | MFA setup works but verification always fails |
| **Cause** | System clock drift on server |
| **Solution** | Synchronize system time with NTP |

```bash
# Check time sync
timedatectl status

# Enable NTP
sudo timedatectl set-ntp true
```

### Session Expired Immediately

| Field | Detail |
|---|---|
| **Symptom** | Login succeeds but subsequent requests return 401 |
| **Cause** | Session token not being sent correctly, or database issue |
| **Solution** | Verify Authorization header format |

```bash
# Correct format:
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/auth/me

# Wrong format (will fail):
curl -H "Authorization: <token>" http://localhost:3000/api/auth/me
```

### Account is Disabled

| Field | Detail |
|---|---|
| **Symptom** | HTTP 403 "Account is disabled" |
| **Cause** | User's `isActive` flag is `false` in database |
| **Solution** | Re-enable via database or admin panel |

```bash
# Re-enable user
sqlite3 dev.db "UPDATE User SET isActive = 1 WHERE email = 'admin@alolabs.net';"
```

---

## 4. API Issues

### 500 Internal Server Error

| Field | Detail |
|---|---|
| **Symptom** | All or some API endpoints return HTTP 500 |
| **Cause** | Unhandled exception, database connection failure, or misconfiguration |
| **Solution** | Check server logs, verify database connectivity |

```bash
# Check application logs
sudo journalctl -u alolabs-agent-hub -n 50 --no-pager

# Or dev logs
tail -50 dev.log

# Check if it's a specific endpoint
curl -v http://localhost:3004/api/health 2>&1
```

### Rate Limited (HTTP 429)

| Field | Detail |
|---|---|
| **Symptom** | HTTP 429 "Rate limit exceeded" |
| **Cause** | Too many requests from the same IP or API key |
| **Solution** | Wait for the rate limit window to reset (see `Retry-After` header) |

```bash
# Check rate limit headers in response
curl -I http://localhost:3004/api/health

# If using API keys, check your rate limit
# Default: 1000 requests/minute per API key
```

### CORS Errors

| Field | Detail |
|---|---|
| **Symptom** | Browser console: "Access-Control-Allow-Origin" error |
| **Cause** | Frontend origin not in `ALLOWED_ORIGINS` |
| **Solution** | Add your origin to `ALLOWED_ORIGINS` in `.env` |

```env
# .env
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,https://your-domain.com"
```

### Webhook Signature Verification Fails

| Field | Detail |
|---|---|
| **Symptom** | Incoming webhooks rejected with "signature verification failed" |
| **Cause** | `WEBHOOK_SECRET` mismatch between sender and receiver |
| **Solution** | Ensure the same secret is configured in both systems |

---

## 5. Performance Issues

### Slow API Response Times

| Field | Detail |
|---|---|
| **Symptom** | API responses > 2 seconds for simple queries |
| **Cause** | Database queries not optimized, missing indexes, or insufficient resources |
| **Solution** | Enable slow query log, add indexes, increase resources |

```bash
# Check MariaDB slow queries
mysql -h 127.0.0.1 -u alohub_user -p -e "SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;"

# Check application latency
curl -w "Time: %{time_total}s\n" -o /dev/null -s http://localhost:3004/api/health
```

### High Memory Usage (> 4 GB)

| Field | Detail |
|---|---|
| **Symptom** | `MemoryMax` reached, service restarted by systemd |
| **Cause** | Memory leak, large query results, or many concurrent connections |
| **Solution** | Restart service, investigate memory profile, increase limit |

```bash
# Check current memory usage
sudo systemctl show alolabs-agent-hub --property=MemoryCurrent

# Restart to clear memory
sudo systemctl restart alolabs-agent-hub

# Increase memory limit (in systemd service)
# MemoryMax=8G
```

### CPU Spikes

| Field | Detail |
|---|---|
| **Symptom** | CPU usage > 90% for extended periods |
| **Cause** | Long-running AI requests, intensive computation, or infinite loops |
| **Solution** | Review active tasks, check for stuck jobs, add timeouts |

```bash
# Check what the process is doing
sudo strace -p $(pgrep -f "server.js") -c -e trace=network,read,write

# Check active jobs
curl -s http://localhost:3004/api/jobs/stats -H "Authorization: Bearer $TOKEN"
```

---

## 6. Deployment Issues

### Docker Build Fails

| Field | Detail |
|---|---|
| **Symptom** | `docker build` fails at build stage |
| **Cause** | Out of memory during build, missing build context, or Bun version mismatch |
| **Solution** | Increase Docker memory, check Dockerfile |

```bash
# Increase Docker memory (Docker Desktop → Settings → Resources)
# Recommended: 8 GB RAM for building

# Check build context
docker build --no-cache -t alolabs-test .

# If Bun download fails, use a mirror
docker build --build-arg BUN_MIRROR=https://registry.npmmirror.com .
```

### Nginx 502 Bad Gateway

| Field | Detail |
|---|---|
| **Symptom** | Nginx returns 502, application logs show nothing |
| **Cause** | Application not running, wrong upstream port, or SELinux blocking |
| **Solution** | Check application status, verify Nginx upstream config |

```bash
# Check if app is running on expected port
curl -s http://127.0.0.1:3004/api/health
sudo systemctl status alolabs-agent-hub

# Check Nginx upstream config
grep "server" /etc/nginx/sites-enabled/alolabs | head -5

# Check Nginx error log
sudo tail -20 /var/log/nginx/alolabs_main_error.log
```

### SSL Certificate Errors

| Field | Detail |
|---|---|
| **Symptom** | Browser shows "NET::ERR_CERT_AUTHORITY_INVALID" |
| **Cause** | Certificate expired, self-signed in production, or domain mismatch |
| **Solution** | Renew certificate or verify domain configuration |

```bash
# Check certificate expiry
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Test SSL configuration
testssl.sh https://panel.alolabs.net
```

### systemd Service Won't Start

| Field | Detail |
|---|---|
| **Symptom** | `systemctl start alolabs-agent-hub` fails silently |
| **Cause** | Permission issue, missing `.env` file, or incorrect working directory |
| **Solution** | Check journal logs, verify file permissions |

```bash
# View detailed error
sudo journalctl -u alolabs-agent-hub -n 50 --no-pager

# Common fix: ownership
sudo chown -R alohub:alohub /opt/alolabs/agent-hub

# Common fix: .env file
ls -la /opt/alolabs/agent-hub/.env
# Should be: -rw------- (600)
```

---

## 7. AI Issues

### Model Not Responding

| Field | Detail |
|---|---|
| **Symptom** | AI requests hang or timeout |
| **Cause** | Ollama not running, model not loaded, or network issue |
| **Solution** | Check Ollama status, verify model availability |

```bash
# Check Ollama
curl http://localhost:11434/api/tags

# If using OpenRouter, test API key
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models | head -c 200
```

### Token Limit Exceeded

| Field | Detail |
|---|---|
| **Symptom** | `finish_reason: "length"` in AI response |
| **Cause** | Response exceeded model's `maxContext` |
| **Solution** | Reduce input context, use larger model, or split requests |

```bash
# Check model's max context
curl -s http://localhost:3004/api/llm/models | jq '.[] | {id, maxContext}'
```

### Fallback Not Working

| Field | Detail |
|---|---|
| **Symptom** | AI requests fail instead of falling back to another provider |
| **Cause** | Circuit breaker not configured, or only one provider available |
| **Solution** | Configure multiple providers, verify circuit breaker health |

```bash
# Check provider health
curl -s http://localhost:3004/api/infra/status | jq '.services[] | {type, status, lastError}'

# Ensure multiple models are active
curl -s http://localhost:3004/api/llm/models | jq '.[] | select(.status=="active") | .id'
```

### Token Budget Exceeded

| Field | Detail |
|---|---|
| **Symptom** | "Monthly token budget exceeded" or "Daily token budget exceeded" |
| **Cause** | Company token usage exceeded configured budget |
| **Solution** | Increase budget, wait for reset, or contact admin |

```bash
# Check token usage
curl -s http://localhost:3004/api/usage -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 8. Social Media Issues

### OAuth Fails with "redirect_uri_mismatch"

| Field | Detail |
|---|---|
| **Symptom** | OAuth consent screen shows an error after granting permissions |
| **Cause** | Redirect URI in platform developer console doesn't match |
| **Solution** | Update the redirect URI in the platform's developer settings |

```
# Correct format (must match exactly):
https://panel.alolabs.net/api/auth/oauth/{platform}/callback
```

### Token Expired

| Field | Detail |
|---|---|
| **Symptom** | Social media operations fail with 401 |
| **Cause** | Access token expired and refresh failed |
| **Solution** | Re-authenticate the account from the settings panel |

The system automatically attempts token refresh using the stored `refreshToken`. If refresh fails (user revoked access), you must re-authenticate.

### Rate Limited by Platform

| Field | Detail |
|---|---|
| **Symptom** | `RateLimitError` with `HTTP 429` |
| **Cause** | Too many API calls to the social platform |
| **Solution** | Wait for rate limit reset (see error message), reduce publish frequency |

```typescript
// System retries with exponential backoff:
// Attempt 1: wait 1 second
// Attempt 2: wait 2 seconds
// Attempt 3: wait 4 seconds
// After 3 failures: give up
```

### Social Media Post Fails

| Field | Detail |
|---|---|
| **Symptom** | Post status stuck on `failed` |
| **Cause** | Invalid media format, content too long, or platform API change |
| **Solution** | Check post error details, verify media URLs are accessible |

---

## 9. Monitoring Issues

### Prometheus Not Scraping

| Field | Detail |
|---|---|
| **Symptom** | Grafana shows "No data" for ALO Labs metrics |
| **Cause** | Prometheus can't reach `/api/metrics/prometheus`, or application not running |
| **Solution** | Verify application health, check Prometheus targets |

```bash
# Test metrics endpoint directly
curl -s http://127.0.0.1:3004/api/metrics/prometheus | head -10

# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health, lastError}'

# If using Docker, ensure host.docker.internal resolves
# In prometheus.yml, use host.docker.internal:3004
```

### Grafana Shows Blank Dashboards

| Field | Detail |
|---|---|
| **Symptom** | Dashboards load but show no data |
| **Cause** | Data source not configured, wrong query, or time range too short |
| **Solution** | Verify data source, check query in Explore mode |

```
1. Go to Grafana → Configuration → Data Sources
2. Verify Prometheus data source URL: http://prometheus:9090
3. Click "Test" — should show green checkmark
4. Go to Explore → select Prometheus → try: up
```

### Alerts Not Firing

| Field | Detail |
|---|---|
| **Symptom** | Alert rules defined but no notifications sent |
| **Cause** | AlertManager not configured, rules not loading, or notification channel misconfigured |
| **Solution** | Check AlertManager logs, verify alert rules |

```bash
# Check if AlertManager is running
docker compose -f monitoring/docker-compose.monitoring.yml ps alertmanager

# Check AlertManager config
curl -s http://localhost:9093/api/v1/status | jq .

# Test alert manually
curl -X POST http://localhost:9093/api/v1/alerts -d '[{
  "labels": {"alertname": "TestAlert", "severity": "warning"},
  "annotations": {"summary": "Test"}
}]'
```

---

## 10. Backup Issues

### Backup Script Fails

| Field | Detail |
|---|---|
| **Symptom** | Backup cron produces errors in `cron-backup.log` |
| **Cause** | `mysqldump` not found, wrong credentials, or disk full |
| **Solution** | Install MariaDB client, verify `DATABASE_URL`, check disk space |

```bash
# Check if mysqldump is available
which mysqldump

# If missing (standalone app server without MariaDB client)
sudo apt install -y mariadb-client

# Check disk space
df -h /opt/alolabs/agent-hub/backups/
```

### Restore Fails

| Field | Detail |
|---|---|
| **Symptom** | `restore.sh` fails during database import |
| **Cause** | Encrypted backup but wrong key, or database user lacks permissions |
| **Solution** | Verify `BACKUP_ENCRYPTION_KEY`, check database user grants |

```bash
# Test decryption
BACKUP_KEY=$(grep '^BACKUP_ENCRYPTION_KEY=' /opt/alolabs/agent-hub/.env | cut -d= -f2)
echo "$BACKUP_KEY" | openssl enc -d -aes-256-cbc -pbkdf2 \
  -in backups/20250115/database.sql.gz -out /tmp/test.sql.gz -pass stdin

# Check if decryption succeeded
echo $?  # Should be 0
```

### Encryption Errors

| Field | Detail |
|---|---|
| **Symptom** | `openssl enc` fails during backup |
| **Cause** | `BACKUP_ENCRYPTION_KEY` contains special characters or is too short |
| **Solution** | Regenerate key using `openssl rand -base64 48` |

```bash
# Generate a new key
openssl rand -base64 48

# Update .env
# BACKUP_ENCRYPTION_KEY="<new-key>"

# Test encryption/decryption
echo "test" | openssl enc -aes-256-cbc -salt -pbkdf2 \
  -out /tmp/test.enc -pass "pass:$(grep BACKUP_ENCRYPTION_KEY .env | cut -d= -f2)" && \
echo "Encryption works"
```

---

## Quick Diagnostic Commands

```bash
# Full system health check
sudo bash /opt/alolabs/agent-hub/deploy/scripts/health-check.sh

# Security check
sudo bash /opt/alolabs/agent-hub/deploy/scripts/security-check.sh --json

# Database check
sudo bash /opt/alolabs/agent-hub/deploy/scripts/database-check.sh --analyze

# Application health endpoint
curl -sf http://127.0.0.1:3004/api/health | head -c 200

# Service status
sudo systemctl status alolabs-agent-hub

# Docker services
docker compose ps

# Monitoring stack
docker compose -f monitoring/docker-compose.monitoring.yml ps

# Recent errors in logs
sudo journalctl -u alolabs-agent-hub -p err --since "1 hour ago" --no-pager

# Disk and memory
df -h / && free -h
```