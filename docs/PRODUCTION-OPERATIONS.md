# ALO Labs AgentOS production operations

## Authoritative topology

- Repository and application root: `/opt`
- PM2 application: `agentos-app`
- Runtime: `/usr/local/bin/bun`
- Entrypoint: `/opt/.next/standalone/server.js`
- Listener: `0.0.0.0:3011`
- Health endpoint: `http://127.0.0.1:3011/api/health`

Production secrets remain in the server environment and GitHub production environment. They must never be copied into the repository or deployment logs.

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`. TypeScript, tests, lint, build, standalone-artifact checks, shell validation, and the database-command scan must all pass. GitHub then transfers the reviewed safety scripts to a run-specific temporary directory. The live deployment script verifies the current process and exact database connection, backs up the existing database, and only then fetches target code.

Required GitHub production-environment secrets:

- `PRODUCTION_HOST`
- `PRODUCTION_USER`
- `PRODUCTION_SSH_KEY`
- `PRODUCTION_PORT`

Pending production migrations block normal push deployments. A reviewed migration requires a manual workflow dispatch with `migrations_approved` explicitly enabled. Client generation does not authorize migration.

## Database recovery boundary

Deployment rollback restores application code only. It does not reverse, initialize, replace, or otherwise recover a database. Database recovery is a separate, manually reviewed incident procedure using a verified backup. The legacy automatic provisioning, engine-conversion, and restore entrypoints intentionally fail closed.

Verified backups are stored under `/opt/backups`. Each set includes commit metadata, a consistent database backup, and application-owned storage when present. At least 14 verified sets are retained; older sets are eligible for pruning only after a newer valid set exists.

## PM2 and health verification

```bash
cd /opt
pm2 status
pm2 describe agentos-app
PID="$(pm2 pid agentos-app)"
readlink -f "/proc/${PID}/cwd"
readlink -f "/proc/${PID}/exe"
ss -lntp | grep ':3011'
curl -fsS --max-time 15 http://127.0.0.1:3011/api/health
```

Expected runtime results are `/opt`, `/usr/local/bin/bun`, and a healthy listener owned by the PM2 PID. Do not print the process environment because it contains secrets.

## Server verification status

Repository controls can be validated in CI, but the actual server, database, firewall, SSH daemon, Qdrant, MinIO, disk capacity, credentials, grants, and live health can only be verified through the configured GitHub production deployment bridge. Until that workflow succeeds against the actual server, production status is **BLOCKED / NOT VERIFIED**, not production-ready.
