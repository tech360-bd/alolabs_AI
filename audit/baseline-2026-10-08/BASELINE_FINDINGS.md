# Pre-repair baseline — 2026-10-08

Recorded BEFORE any source modification on branch `arena/93bcbf36-alolabs-net-ai`
(from `main` @ `89d7b1b71c23351970d4c142103830000cf3fd63`).

Files in this directory:

| File | Content |
|---|---|
| `commit.txt` / `branch.txt` | Git commit and branch at baseline |
| `tracked-files.txt` | 1,171 tracked paths |
| `tracked-file-hashes.sha256` | SHA-256 of every tracked file |
| `schema-hashes.sha256` | SHA-256 of both Prisma schemas and the MySQL migration SQL |
| `typecheck.log` | `npm run typecheck` output at baseline |
| `tests-summary.log` | `npx vitest run` summary at baseline |

## Environment used for all verification in this session

- Node v22.22.3, npm 10.9.8, 2 vCPU, 3.9 GB RAM, Linux 6.1
- No Bun installed (lockfile `bun.lock` is present but unused here)
- Outbound network restricted to github.com / registry.npmjs.org / pypi.org.
  **No AI-provider endpoints, no Prisma engine CDN, no MySQL binaries are reachable.**
- `better-sqlite3` was compiled from source against the local Node headers.
- Prisma client generated with `engineType = "client"` (WASM query compiler +
  better-sqlite3 driver adapter) via `scripts/dev-generate-client.sh`.

## Baseline results (reality, not the previous report)

| Check | Result | Detail |
|---|---|---|
| `npm ci` | **FAIL** | `package-lock.json` out of sync with `package.json` (magicast, picomatch) |
| `npm run typecheck` | **FAIL** | 4 errors — `src/lib/storage/index.ts` imports `./local-storage`, which is **not in the repository** |
| `npx vitest run` | **FAIL** | 3 test files fail to import `@/lib/storage/local-storage`; 698 tests in 50 files pass |
| `npm run build` | not attempted (typecheck fails) | — |

### Root cause of the missing file

`.gitignore` contains the pattern `local-*`. It matches `src/lib/storage/local-storage.ts`,
so the file that the previous hardening pass created and tested locally was never committed.
The previous report's "727/727 tests" and "typecheck 0" were true in that sandbox and false
for the committed tree. The pattern also silently ignores any future `local-*.ts` source file.

### Other repository-hygiene findings at baseline

- A tracked binary named `--timeout` (34,946 bytes, PNG screenshot saved under a flag name).
- Three tracked Git LFS pointer files (`zi3wlUqn`, `ziC7a7L3`, `zirgKgT5`) whose 160–173 MB
  objects are not present; they reference nothing in the application.
- A 2.4 MB `project-production.zip` committed at the repository root although every prior
  audit concluded the system was not production-ready.
- Two lockfiles (`bun.lock`, `package-lock.json`) that disagree with `package.json`.

### Orphan `AgentHealth` record — root cause (code, not data)

`src/lib/agent-runtime/health.ts` keys its in-memory records by the agent **business id**
(`Agent.agentId`, e.g. `AGENT-0001`) because `AgentExecutionEngine` calls
`recordSuccess/recordFailure(task.agentId, …)`. `upsertAgentHealthDB()` then writes that
business id into `AgentHealth.agentId`, which the schema declares as a foreign key to
`Agent.id` (the cuid primary key). In a database without enforced foreign keys this silently
creates orphan rows; with foreign keys enforced the upsert is rejected. The intended
relationship is `AgentHealth.agentId → Agent.id`; the fix is to resolve the business id to
the primary key before persisting and to reconcile existing rows by mapping
`AgentHealth.agentId` through `Agent.agentId`. See `scripts/db-integrity-audit.ts`.
