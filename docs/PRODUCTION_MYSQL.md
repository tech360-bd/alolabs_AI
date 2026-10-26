# Production MySQL/MariaDB + https://www.alolabs.net

Mandatory production target for ALO Labs AgentOS:

| Concern | Value |
| --- | --- |
| OS | Ubuntu 22.04 LTS (or the existing compatible Ubuntu host) |
| Runtime | Node.js 22+ (Bun is **not** required in production) |
| App output | Next.js standalone (`output: "standalone"` in `next.config.ts`) |
| Process manager | PM2, process name `agentos-app` |
| Port | `3011`, bound to loopback only |
| Reverse proxy / TLS | Caddy, `https://www.alolabs.net` → `127.0.0.1:3011` |
| Database | **MySQL / MariaDB only** |
| ORM | Prisma, client generated from `prisma/schema.mysql.prisma` |

**SQLite is not a production datasource, not a fallback, and not an alternative
production mode.** Three independent layers enforce that — see
[Enforcement](#enforcement).

---

## Enforcement

| Layer | File | Behaviour |
| --- | --- | --- |
| Datasource policy | `src/lib/production-database.ts` | Pure, testable rules. `assertProductionDatasource()` throws unless `DATABASE_URL` is `mysql://`/`mariadb://` **and** `PRISMA_SQLITE_ADAPTER` is unset. |
| Prisma singleton | `src/lib/db.ts` | Resolves the client lazily through a proxy and calls the assert before opening any connection. |
| Server startup | `src/instrumentation.node.ts` | Asserts on boot, before the queue worker starts polling. Logs `provider=` and the redacted URL. |
| Readiness | `src/app/api/health/ready/route.ts` | 503 unless the policy passes **and** a real `SELECT 1` succeeds. |
| Deployment | `deploy/scripts/deploy.sh` | Aborts on a `file:`/`*.db` `DATABASE_URL` with the fix spelled out. |

`next build` is deliberately unaffected: Next.js does not call `register()`
during a build, and CI builds with `NODE_ENV=production` and a throw-away
`DATABASE_URL=file:./ci.db`. The assert fires on server start and on first
database use, not at import.

### Why a proxy in `db.ts`

Constructing (or asserting) at module load would break every `next build`,
because Next.js imports `@/lib/db` while collecting page data. The exported `db`
is therefore a thin `Proxy` that resolves the real `PrismaClient` on first
property access.

---

## Configuration

`deploy/env.production.example` is the reference. The values that matter:

```ini
NODE_ENV=production
PORT=3011
HOSTNAME=127.0.0.1                      # keeps 3011 off the network

NEXT_PUBLIC_APP_URL=https://www.alolabs.net
NEXT_PUBLIC_BASE_URL=https://www.alolabs.net
SITE_URL=https://www.alolabs.net
ALLOWED_ORIGINS=https://www.alolabs.net,https://alolabs.net,https://panel.alolabs.net,https://api.alolabs.net

DATABASE_URL=mysql://agentos_app:<password>@127.0.0.1:3306/alolabs_prod?connection_limit=10
```

No `http://` origin and no wildcard is permitted in `ALLOWED_ORIGINS`.

### Database and restricted account

```sql
CREATE DATABASE alolabs_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'agentos_app'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP,
      REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE,
      CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, TRIGGER
  ON alolabs_prod.* TO 'agentos_app'@'localhost';
FLUSH PRIVILEGES;
```

Deliberately **not** granted: `GRANT OPTION`, `SUPER`, `FILE`, `PROCESS`,
`SHUTDOWN`, `RELOAD`. `FILE` in particular would allow reading server-side
files through SQL.

`utf8mb4` is required, not cosmetic: the schema stores 4-byte characters
(emoji, and Bengali text in agent content). With `utf8mb3` those inserts fail
or silently truncate.

---

## Schema and migrations

- `prisma/schema.mysql.prisma` — authoritative production schema. **179 models**,
  `provider = "mysql"`, with `@db.LongText` on the large JSON/text columns that
  would otherwise hit MySQL's row-size and index-length limits.
- `prisma/schema.prisma` — the SQLite schema, for local development and tests
  only. Never generate the production client from it.
- `prisma/migrations/mysql/` — reviewed, version-controlled SQL, each with a
  matching `*_rollback.sql`.

```bash
npm run db:generate:mysql    # prisma generate --schema=prisma/schema.mysql.prisma
npm run verify:mysql         # static schema compatibility check
```

Never run `prisma migrate reset`, and never run an unreviewed `prisma db push`,
against production. `deploy/scripts/deploy.sh` runs `prisma migrate status` and
only applies migrations when `MIGRATIONS_APPROVED=true` is passed explicitly.

---

## Moving existing SQLite data

`scripts/migrate-sqlite-to-mysql.ts` is repeatable and non-destructive.

```bash
# 1. Preview. Reads the source, writes nothing.
npx tsx scripts/migrate-sqlite-to-mysql.ts db/custom.db "$DATABASE_URL" --dry-run

# 2. Migrate into an EMPTY database.
npx tsx scripts/migrate-sqlite-to-mysql.ts db/custom.db "$DATABASE_URL"
```

Guarantees:

- The source SQLite file is opened **read-only** (`{ readonly: true }`) and is
  never modified.
- It **refuses to run against a non-empty target** unless `--allow-overwrite`
  is passed, and reports the target's table and row counts first. Production is
  never overwritten by an unattended run.
- Foreign-key dependencies are handled by suspending enforcement for the load
  (`SET FOREIGN_KEY_CHECKS = 0`) and re-enabling it afterwards — safer than
  deriving a table order from a possibly partially-migrated schema.
- Batched, parameter-bound inserts; booleans, timestamps and JSON are converted.
- Per-table source and destination row counts, plus a summary of
  successful / skipped / errored tables. Errors are reported, not skipped
  silently.
- No hardcoded default connection URL: it must be supplied explicitly.

---

## Deployment

```bash
# On the Ubuntu host, from the application directory (/opt):
git fetch --all --prune
git checkout <reviewed-commit>

set -a; source .env.production; set +a
npm ci --omit=dev            # or: bun install --frozen-lockfile
npm run db:generate:mysql
npm run build                # Next.js standalone output

pm2 reload agentos-app --update-env
```

`deploy/scripts/deploy.sh` automates this and additionally:

1. Verifies the working tree is clean and the directory is the repo root.
2. Verifies the running PM2 process and that its live `DATABASE_URL` matches the
   environment file — so a deploy cannot silently retarget a database.
3. Rejects a SQLite `DATABASE_URL` outright.
4. Connects to MySQL and reports engine version, database name, table count and
   size before changing anything.
5. Runs `prisma validate` and `prisma migrate status`; applies migrations only
   with `MIGRATIONS_APPROVED=true`.
6. Reloads PM2 only after the build and pre-checks succeed, then re-verifies the
   new PID.

### Rollback

Application rollback is a git operation, **never** a destructive database
rollback:

```bash
cd /opt
git checkout <previous-good-commit>
npm ci --omit=dev && npm run db:generate:mysql && npm run build
pm2 reload agentos-app --update-env
curl -fsS http://127.0.0.1:3011/api/health/ready
```

If a migration was applied, use its paired `prisma/migrations/mysql/*_rollback.sql`
after taking a backup — and only after confirming no newer data depends on the
rolled-back columns.

### Backups

```bash
sudo APP_DIR=/opt bash deploy/scripts/backup.sh      # checksummed, verified
bash deploy/scripts/restore.sh <backup>              # restore path
```

---

## Caddy / domain

`deploy/caddy/alolabs.net.Caddyfile` serves `www.alolabs.net` and proxies to
`127.0.0.1:3011`, with TLS obtained automatically by Caddy.

`deploy/caddy/alolabs-apex-redirect.Caddyfile` is a **separate, opt-in** file
that 308-redirects `alolabs.net` → `www.alolabs.net`. It is not imported by the
main file, because enabling it requires checking live DNS and routing first.

Before enabling either:

```bash
sudo ss -ltnp '( sport = :443 or sport = :80 )'   # only ONE process may bind these
dig +short alolabs.net
dig +short www.alolabs.net
curl -sI https://alolabs.net
```

This repository also ships `deploy/nginx/alolabs.conf`, which serves
`alolabs.net`, `www.`, `panel.` and `api.`. **Running both nginx and Caddy for
the same names fails with `EADDRINUSE` and can take the site down.** Disable the
overlapping nginx server blocks first, or keep using nginx.

`panel.alolabs.net` and `api.alolabs.net` are deliberately not claimed by the
new Caddy file, so existing subdomains keep working wherever they are served
today.

Validate and reload:

```bash
caddy validate --config /etc/caddy/alolabs.net.Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### Verifying it is actually live

Do not treat configuration as proof. From outside the host:

```bash
curl -fsS https://www.alolabs.net/api/health        # expect HTTP 200, status healthy
curl -fsS https://www.alolabs.net/api/health/ready  # expect {"ready":true}
curl -s  https://www.alolabs.net/api/health | jq .datasource
#   .provider should be "mysql"; production_policy_ok should be true
```

Port `3011` must **not** be reachable from the internet:

```bash
nc -vz <public-ip> 3011     # expect refused/timeout
```

---

## Health endpoints

`GET /api/health` now derives its headline `status` from the actual checks
instead of asserting `healthy`, returns **503** when the database check fails,
and reports the datasource:

```json
"datasource": {
  "provider": "mysql",
  "url": "mysql://agentos_app:****@127.0.0.1:3306/alolabs_prod",
  "production_policy_enforced": true,
  "production_policy_ok": true,
  "production_policy_reason": "ok"
}
```

Previously `checkDatabase()` skipped the query when `db.$queryRaw` was not a
function and returned `healthy` anyway — reporting a healthy database on an
unverified connection. That is now `unhealthy`.

---

## CI verification

`.github/workflows/mysql.yml` runs against the MySQL service container that
GitHub-hosted runners provide — a local container on the runner, **not** a paid
third-party service, so it needs no credentials and no `SKIP_PAID_SERVICES`
opt-in. It gates:

- `prisma validate --schema=prisma/schema.mysql.prisma`
- `prisma generate` from the MySQL schema (never the SQLite one)
- the database charset is `utf8mb4`
- `__tests__/integration/mysql-compatibility.test.ts` — real connect,
  autoincrement, unique constraints, boolean round-trip, JSON, LONGTEXT,
  `DATETIME(3)` precision, transaction commit **and** rollback, `LIMIT/OFFSET`
  pagination, concurrent InnoDB writes, and the exact `SELECT 1` the readiness
  probe issues
- a final step that **fails the job if that suite silently skipped**

Locally:

```bash
MYSQL_TEST_URL='mysql://root:root@127.0.0.1:3306/alolabs_test' \
  npx vitest run __tests__/integration/mysql-compatibility.test.ts
```

Without `MYSQL_TEST_URL` the suite reports 15 SKIPPED with a reason rather than
passing.

`bun run lint:workflows` validates every workflow: SHA-pinned actions,
least-privilege `permissions:`, `timeout-minutes`, and GitHub's
context-availability rules (for example `secrets` is not usable in
`jobs.<job_id>.if`).

---

## Remaining blockers

These require server access or an explicit decision and could not be done from
the repository:

1. **Provision the MySQL database and restricted account**, and set the real
   `DATABASE_URL` in `/opt/.env.production`.
2. **Run the initial migration** (`prisma migrate deploy` with
   `MIGRATIONS_APPROVED=true`) after a verified backup.
3. **Resolve the nginx/Caddy conflict** on the host before enabling the new
   Caddyfile.
4. **Decide on the apex redirect** after checking live DNS.
5. **GitHub Actions billing** — every workflow currently fails before starting
   with "recent account payments have failed or your spending limit needs to be
   increased". No CI check, including the MySQL job, can run until that is
   fixed.
