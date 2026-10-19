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

### Deployment bridge configuration

Two jobs run before anything is transferred or executed:

1. `quality-and-safety` — the code gates above.
2. `deployment-config` — `.github/scripts/validate-production-secrets.sh`.

`deploy` needs both. The configuration job opens no connection; it only checks
that the bridge is usable, so a configuration problem is reported by name
before a single SSH attempt is made, and it is distinguishable in the Actions
UI from a deployment failure.

The validator checks all four values in one pass, writes the findings to the
step summary with copy-paste `gh secret set` commands, and emits a workflow
annotation. It never prints, logs or writes a secret **value** — only names —
so it is safe on a public repository.

Required GitHub production-environment secrets:

| Secret | Valid value |
| --- | --- |
| `PRODUCTION_HOST` | Bare hostname or IP address. No scheme, path, `user@` or `:port`. |
| `PRODUCTION_USER` | Login name only, e.g. `aloedu`. |
| `PRODUCTION_SSH_KEY` | The entire private key file including the `-----BEGIN`/`-----END` lines, LF line endings, no passphrase. |
| `PRODUCTION_PORT` | Digits only, 1–65535. |

No value may carry a leading space, trailing space or trailing newline: those
survive copy/paste into the secret form and then fail opaquely inside the SSH
action. The public half of the key must be in the operator account's
`~/.ssh/authorized_keys`, and the account needs passwordless `sudo -n`.

```bash
gh secret set PRODUCTION_HOST  --env production --repo tech360-bd/alolabs_AI --body '203.0.113.10'
gh secret set PRODUCTION_USER  --env production --repo tech360-bd/alolabs_AI --body 'aloedu'
gh secret set PRODUCTION_PORT  --env production --repo tech360-bd/alolabs_AI --body '22'
gh secret set PRODUCTION_SSH_KEY --env production --repo tech360-bd/alolabs_AI < ~/.ssh/alo_deploy_ed25519
```

The same four secrets are required by the scheduled backup workflow, which
runs the same validation step before it connects.

Both workflows run in the `production` environment (`environment: production`).
Environment values take precedence over repository values, and **an environment
secret that exists but is empty shadows a populated repository secret** — the
state behind run `39247113793` on `main`, where `PRODUCTION_HOST` expanded to an
empty string while the other three values resolved. Delete the empty entry
before relying on a repository-level value.

`PRODUCTION_APP_DIR` is an optional **repository variable**, not a secret. When
it is unset, both workflows probe `/opt` and `/home/aloedu/alolabs_AI` for
`deploy/scripts/backup.sh`.

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
