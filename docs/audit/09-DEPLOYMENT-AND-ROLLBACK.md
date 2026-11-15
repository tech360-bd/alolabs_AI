# Deployment and Rollback Instructions

> **Nothing was deployed.** This branch is a pull request for review only, per the
> master prompt: *"Do not merge or deploy before successful verification and
> approval."*

## 1. Pre-deployment state recorded (for rollback)

| Item | Value |
|---|---|
| Base commit (pre-change) | `ae334232586ee53205efd2e67052ca2e0d5e9aff` (Merge PR #38) |
| Working branch | `arena/d02e7b8a-alolabs-ai` |
| Base branch | `main` |
| Schema delta | **none** |
| Migration files added | **none** |
| Config delta | 3 optional env vars (all default-off / non-breaking) |

## 2. Environment variables

All three are **optional**. Omitting them reproduces the exact pre-change
behaviour.

| Variable | Default | Effect |
|---|---|---|
| `FREE_ONLY_MODE` | unset → falls back to `LOCAL_ONLY` | Global $0 external-inference ceiling |
| `AI_FREE_PROVIDER_TIMEOUT_MS` | `60000` | Timeout for free hosted adapters |
| `DISCOVERY_REPORT_DIR` | `docs/discovery` | Where weekly reports are written |

Newly *honoured* (previously documented but unused) provider keys — set only if
you want that provider registered:

```
GEMINI_API_KEY, CEREBRAS_API_KEY, CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID,
SAMBANOVA_API_KEY, NVIDIA_API_KEY, HF_TOKEN, GITHUB_MODELS_TOKEN
```

> Registering a key is **not** the same as making the provider eligible. See
> `03-FREE-PROVIDER-COMPARISON.md` §4 — a human must record a verification row
> and a fresh quota snapshot before any traffic can route to it.

## 3. Deployment procedure (when approved)

### 3.1 Pre-flight

```bash
# 1. Confirm you are on the reviewed commit
git log --oneline -1

# 2. Schema: this branch adds nothing, so status should show no pending delta
npx prisma migrate status --schema=prisma/schema.mysql.prisma

# 3. Typecheck + build gates
npx tsc --noEmit -p tsconfig.json
npm run build

# 4. Tests (needs a host that can build native better-sqlite3)
npm test
```

### 3.2 Deploy

Use the repository's existing path — do not invent a new one.

**Docker Compose (existing topology: app on 3011 behind Caddy):**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build app
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
```

**PM2 (existing `ecosystem.config.js`):**

```bash
npm ci --omit=dev
npm run build
pm2 reload ecosystem.config.js --update-env
pm2 status
```

### 3.3 Post-deploy smoke checks

```bash
# Health
curl -fsS https://<host>/api/health/live
curl -fsS https://<host>/api/health/ready

# Free-only mode is reported correctly (Super Admin session required)
curl -fsS -H "Cookie: <session>" https://<host>/api/super-admin/ai/model-center \
  | jq '.mode'

# Workforce still intact (read-only)
npx tsx scripts/verify-2000-workforce.ts --verify

# Router behaviour
npx tsx scripts/verify-workforce-execution.ts --execute
```

Expected: `departments 100 / agents 2000 / identities 2000`, `14/14 checks pass`.

### 3.4 Local inference smoke test (requires Ollama)

```bash
npx tsx scripts/verify-inference.ts --base-url http://localhost:11434/v1
```

This is a **real** completion per tier and exits non-zero if any tier fails. It
never falls back to a paid provider.

## 4. Rollback

### 4.1 Immediate rollback (no data loss possible)

Because the schema is unchanged, rollback is purely a code revert.

**Docker:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down app
git checkout <previous-release-tag-or-sha>
docker compose -f docker-compose.yml -f docker-compose.prod.yml build app
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app
```

**PM2:**

```bash
git checkout ae33423
npm ci --omit=dev
npm run build
pm2 reload ecosystem.config.js --update-env
```

**Git-level revert of this branch's single commit (if merged):**

```bash
git revert --no-edit <merge-commit-or-commit-sha>
# then redeploy with the procedure above
```

> Do **not** run `git reset --hard`, `prisma migrate reset`, `docker system
> prune --volumes`, or any command that drops tables. They are unnecessary here
> and would destroy data.

### 4.2 Feature-level rollback (no code change needed)

Each new capability can be switched off independently:

| Capability | Disable by |
|---|---|
| FREE-ONLY mode | `FREE_ONLY_MODE=false` (or unset `LOCAL_ONLY`) + restart |
| Free provider registration | Remove the provider's env key + restart |
| AI idempotency | Stop passing `idempotencyKey` (existing callers already don't) |
| Weekly discovery | Comment out the cron line in `deploy/cron/alolabs-cron`; the in-process job self-gates to Monday 03:00 UTC |
| Model Control Center | Leave the panel unvisited; it is read-only and writes nothing |

### 4.3 Data cleanup after rollback (optional)

```sql
-- Discovery metrics only (observability, safe to delete)
DELETE FROM `Metric` WHERE `metricType` = 'ai_discovery';

-- Reservations left running by an aborted deploy; never delete usage history
UPDATE `ModelUsageRecord`
SET `status` = 'deferred', `completedAt` = NOW(3)
WHERE `status` = 'running' AND `completedAt` IS NULL;
```

## 5. Rollback verification

After a rollback, confirm the pre-change baseline still holds:

```bash
npx tsx scripts/verify-2000-workforce.ts --verify   # 100 / 2000 / 2000, 0 drift
curl -fsS https://<host>/api/health/ready
```

If the workforce counts still read 100 / 2,000 / 2,000, no historical data was
lost.

## 6. Risk assessment of this change

| Area | Risk | Why |
|---|---|---|
| Schema / data | **None** | Zero schema delta, no writes to existing rows |
| Routing defaults | **Very low** | All new branches are gated on `FREE_ONLY_MODE` (default off) or on a caller-supplied `idempotencyKey` |
| Provider list | **Very low** | New specs register only when their env key is present; if absent, the provider list is identical to before |
| Cron load | **Low** | One extra hourly no-op that runs real work only on Mondays at 03:00 UTC |
| UI | **Very low** | One new nav entry + one new read-only panel; existing panels untouched |
| Build size | **Low** | +1 panel, +1 route |
