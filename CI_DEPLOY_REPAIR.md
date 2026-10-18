# CI / deployment / backup repair — 2026-10-18

Scope: the two red workflows on `tech360-bd/alolabs_AI@main` and the daily backup
schedule. Everything below was checked against the real repository, not inferred
from file names.

**Outcome (branch `arena/8cc412a3-alolabs-ai`, PR #1):** CI is green end to end for
the first time — advisory gate, `prisma generate`, delegate reconciliation,
`tsc --noEmit`, full test suite, ESLint, production build, standalone-artifact
checks and database command safety (run `39071242003`). Secret Scan
(`39071242028`) and the macOS + Ubuntu backup/restore integration
(`39071241977`) pass on the PR. The advisory gate that blocked every deploy is
cleared without changing the gate. The production **deploy job itself has still
never run** — it only triggers on a push to `main`.

## What GitHub actually reported

| Run | Workflow | Conclusion | Failing step |
|---|---|---|---|
| 38323910737 | CI (`push`) | failure | Production dependency advisory gate (`npm audit --omit=dev --audit-level=moderate`) |
| 38323910705 | Production database-safe deployment | failure | same gate — `Deploy production` was **skipped** |
| 38994252870 + 4 earlier | Verified production database backup (`0 2 * * *`) | failure ×5 | Run verified server-side backup |
| 38323910714 | Security Scan | success | — |
| 38323910709 | Backup script portability | success | — |

Raw logs are unavailable: `gh run view --log-failed` returns `EOF` from
`results-receiver.actions.githubusercontent.com` for every run, so only job and
step names could be read. No cause is invented below for anything that could
not be observed.

## 1. Advisory gate — fixed and verified locally

`npm audit --omit=dev` reproduced the exact CI failure: 8 advisories
(4 high, 4 moderate) from two chains.

### `minio` chain (4 moderate) — dependency removed

`minio@8.0.7` hard-requires `stream-json/src/jsonl/Parser.js`, which no patched
`stream-json` release provides. Verified, not assumed:

```
$ npm i minio@8.0.7   # with overrides { "stream-json": "^3.7.0" }
$ node -e "require('minio')"
MODULE_NOT_FOUND: Cannot find module '.../stream-json/src/jsonl/Parser.js'
```

Downgrading is not a fix either: `minio@7.1.3` still pins `query-string@7` →
`decode-uri-component@0.2.2`, which is inside the advisory range.

`src/lib/minio.ts` now wraps `@aws-sdk/client-s3` and
`@aws-sdk/s3-request-presigner`. Exported functions, fallback-to-local
behaviour, and the `infraService` bookkeeping are unchanged. Path-style
addressing is used for IP/localhost endpoints (matching the old client),
virtual-hosted for DNS endpoints, with `S3_FORCE_PATH_STYLE=true` as an
override.

Two real defects were found while replacing it:

1. **S3 restore never worked.** `src/app/api/db/restore/route.ts` did
   `const { MinioClient } = await import('minio')`; the package exports `Client`,
   not `MinioClient`. `new MinioClient(...)` threw `TypeError`, was caught, and
   surfaced as `S3 read failed: …`. Both call sites now use the shared client.
2. **Path traversal in the local fallback.** Object keys came straight from the
   request body (`path.join(LOCAL_STORAGE_DIR, key)`), so `key=../../x` wrote
   outside the storage root. `sanitizeObjectKey()` now rejects traversal,
   absolute keys and empty segments.

### Prisma tooling chain (4 high) — dependency scope corrected

`prisma` is a CLI, not runtime code. The Dockerfile installs everything in the
builder (`npm ci`), runs `npx prisma generate`, and copies only the standalone
build plus `node_modules/.prisma` into the runner. `deploy.sh` runs
`bunx prisma …` after a dev-inclusive `bun install`. The CLI therefore moved to
`devDependencies`; `@prisma/client` stays in `dependencies`.

`@prisma/client` declares `peerDependencies: { prisma: "*" }`, so npm still
resolved and audited it. `overrides` pin the two vulnerable transitives to
patched releases: `deepmerge-ts` 7.1.5 → 8.0.2, `effect` 3.18.4 → 3.22.3.
`@prisma/config` — the only consumer of both — was loaded against a config file
and resolved a schema path successfully under those versions.

### Result

```
$ npm audit --omit=dev --audit-level=moderate
found 0 vulnerabilities
$ echo $?
0
```

The gate and its `--audit-level=moderate` threshold are unchanged.

## 2. Backup schedule — made diagnosable, not yet proven fixed

Five consecutive failures with no readable log. Two defects were visible in the
workflow itself:

- It ran `cd /opt` and `sudo APP_DIR=/opt`. The production path reported for
  this platform is `/home/aloedu/alolabs_AI`. If `/opt` is not that checkout (or
  not a symlink to it), the step dies at `cd` with an error that says nothing
  about the actual problem.
- `sudo` without `-n`: if passwordless sudo is not configured, the step hangs or
  fails opaquely inside the SSH action.

Changes:

- `.github/workflows/backup.yml` resolves the directory instead of assuming it:
  `vars.PRODUCTION_APP_DIR` → `/opt` → `/home/aloedu/alolabs_AI`, failing with
  the list of paths it checked.
- `sudo -n` so a sudo-password requirement fails immediately and explicitly.
- New `deploy/scripts/backup.sh --preflight` reports every prerequisite
  separately: application directory, `.git`, env file, `DATABASE_URL` provider,
  database file presence/size, `sqlite3`/`python3`/`mysqldump`/`node`
  availability, backup-directory writability and free space.
- The scheduled run now executes preflight before the backup, so the next
  failure names its cause. `command_timeout: 30m` and `script_stop: true` added.
- `.github/workflows/deploy.yml` uses the same resolution (and `sudo -n`).

**This is not a claim that the backup now passes.** The failing prerequisite
could not be observed from here; if it is, for example, a missing `mysqldump` or
an unset `DATABASE_URL`, preflight will say so on the next scheduled run instead
of returning an opaque exit code.

## Verification performed

| Check | Result |
|---|---|
| `npm audit --omit=dev --audit-level=moderate` | **0 vulnerabilities**, exit 0 |
| `npm ci --dry-run` / `npm ci --omit=dev --dry-run` | lockfile accepted, no sync error |
| `bun install --frozen-lockfile --lockfile-only` (clean dir) | exit 0, lockfile byte-identical |
| `s3-client.test.ts` against an in-process S3 endpoint | 9/9 |
| `tool-policy.test.ts`, `tool-loop.test.ts`, `s3-client.test.ts` | 34/34 |
| `tsc --noEmit` on the new client + test (`strict`, `skipLibCheck`) | clean |
| esbuild parse sweep, `src/` + `scripts/` + `__tests__/` | 966 files, 0 failures |
| `bash -n deploy/scripts/backup.sh` | clean |
| Backup → restore with a real SQLite DB (3 rows) | snapshot, checksums, manifest, `integrity_check: ok`, 3 rows restored |
| `backup.sh --preflight` pass and fail cases | correct exit codes, per-item output |
| Workflow YAML parse (`yaml` parser) | both valid, env plumbing present |

## Latent failures this uncovered

Neither of these could be seen before, because CI never reached the test step:

- `src/app/api/stats/route.ts` filtered `User` by `companyId`, a column the model
  does not have (`TS2353`). The dashboard route counted commands for the
  signed-in user instead.
- `__tests__/unit/agentos-v1-auth.test.ts` used `'REDACTED_EXAMPLE_CREDENTIAL'`
  as its fixture API key. `authenticateV1` routes a bearer token to the API-key
  path only when it starts with `alo_`, so the test exercised the session path
  and got `null`. The fixture is now assembled at runtime from parts, which also
  keeps secret scanners quiet.

## Verified by CI (not just locally)

- `prisma generate` and `check:prisma-delegates` pass with the `overrides` on
  `deepmerge-ts`/`effect`, so the CLI is functional on the patched versions.
- Full `tsc --noEmit`, the complete test suite, ESLint, `next build`, standalone
  artifact checks and `database-safety-scan.sh` all pass.
- Backup/restore integration test passes on **macOS and Ubuntu**.

## Still not verified

- Any behaviour on the production host: secrets, sudo policy, database
  provider, and whether `/opt` or `/home/aloedu/alolabs_AI` exists there. The
  scheduled backup cannot be dispatched with this token (`HTTP 403` on
  `actions:write`), so its next evidence is the next scheduled run — whose
  failure will now carry annotations naming the missing prerequisite.
- Whether the deploy job succeeds once unblocked. It has never run: it was
  skipped behind the audit gate. Merging to `main` is what exercises it.
