# Troubleshooting

## Service Won't Start

1. Check if port 3000 is in use: `ss -tlnp | grep 3000`
2. Check .env exists: `ls -la /opt/alolabs-aismh/shared/.env`
3. Check DATABASE_URL is valid
4. Check logs: `sudo journalctl -u alolabs-aismh -n 50`
5. Check build output exists: `ls /opt/alolabs-aismh/current/.next/standalone/server.js`

## Database Connection Errors

1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Test connectivity: `psql $DATABASE_URL -c "SELECT 1"`
3. Check DATABASE_URL format: `postgresql://user:pass@host:5432/dbname`
4. For SQLite dev: ensure `file:./dev.db` path is writable

## Migration Failures

1. **DO NOT** re-run a failed migration without investigation
2. Check current state: `cd /opt/alolabs-aismh/current && bunx prisma migrate status`
3. Restore from backup if schema is corrupted: `bash scripts/restore.sh <backup>`
4. For forward-fix: create a new migration that fixes the issue

## High Memory Usage

1. Check process: `ps aux | grep bun`
2. Check limits: `systemctl show alolabs-aismh | grep MemoryMax`
3. Restart service: `sudo systemctl restart alolabs-aismh`
4. Review MemoryMax in systemd service file (default: 4G)

## Disk Space Issues

1. Check usage: `df -h /opt/alolabs-aismh`
2. Clean old releases: `ls -la /opt/alolabs-aismh/releases/`
3. Remove old release (keep previous): `rm -rf /opt/alolabs-aismh/releases/<old-timestamp>`
4. Clean old backups: `ls -la /var/backups/alolabs-aismh/`
5. Clean logs: `journalctl --vacuum-size=500M`

## Caddy/HTTPS Issues

1. Validate config: `caddy validate --config /etc/caddy/sites-available/alolabs-aismh.conf`
2. Check Caddy status: `sudo systemctl status caddy`
3. Check DNS: `dig +short your-domain.com`
4. Check ports: `ss -tlnp | grep -E ':80|:443'`
5. Reload: `sudo systemctl reload caddy`

## API Returns 401 Unauthorized

1. Verify token: check `Authorization: Bearer <token>` header
2. Token may be expired — re-login via `/api/auth/login`
3. Check user is active: query Users table
4. Check rate limiter hasn't locked account

## Agent Stuck in Running State

1. Check AgentRun records for the agent
2. Self-healing should auto-recover within 30 seconds
3. Manual recovery: use Self-Healing panel or `/api/self-improvement` endpoint
4. Last resort: update Agent status to `disabled` then `active`

## WhatsApp Webhook Not Receiving

1. Verify WHATSAPP_VERIFY_TOKEN matches Meta dashboard
2. Verify WHATSAPP_ACCESS_TOKEN is valid
3. Check webhook URL is publicly accessible
4. Use Meta Webhook tester in dashboard

## Build Fails

1. Run full verify: `bun run verify`
2. Clear cache: `rm -rf .next && bun run db:generate`
3. Check Node/Bun version: `bun --version` (need >= 1.2.0)
4. Check disk space (need > 2GB free for build)

## Rollback Steps

```bash
# 1. Check current release
ls -la /opt/alolabs-aismh/current

# 2. Rollback
bash scripts/rollback.sh

# 3. Verify
bash scripts/healthcheck.sh

# 4. If rollback fails, manual restore
bash scripts/restore.sh /var/backups/alolabs-aismh/<latest>.tar.gz
```
