# ALO Labs AgentOS — Audit Deliverables

Generated 2026-11-15 on branch `arena/d02e7b8a-alolabs-ai` (base `ae33423`).

| # | Deliverable | File |
|---|---|---|
| 1 | Complete repository audit | [01-REPOSITORY-AUDIT.md](./01-REPOSITORY-AUDIT.md) |
| 2 | Public website audit | [02-WEBSITE-AUDIT.md](./02-WEBSITE-AUDIT.md) |
| 3 | Existing functionality preservation | [08-PRESERVATION-AND-REMAINING-ISSUES.md](./08-PRESERVATION-AND-REMAINING-ISSUES.md) §1 |
| 4 | 100-department verification | [01-REPOSITORY-AUDIT.md](./01-REPOSITORY-AUDIT.md) §3.1 |
| 5 | 2,000-agent verification | [01-REPOSITORY-AUDIT.md](./01-REPOSITORY-AUDIT.md) §3.1 |
| 6 | 2,000-employee verification | [01-REPOSITORY-AUDIT.md](./01-REPOSITORY-AUDIT.md) §3.1 |
| 7 | Open-source model comparison | [03-FREE-PROVIDER-COMPARISON.md](./03-FREE-PROVIDER-COMPARISON.md) |
| 8 | Free API provider comparison | [03-FREE-PROVIDER-COMPARISON.md](./03-FREE-PROVIDER-COMPARISON.md) |
| 9 | AI gateway / model routing | [04-FREE-ONLY-AND-ROUTING.md](./04-FREE-ONLY-AND-ROUTING.md) |
| 10 | Automatic fallback | [04-FREE-ONLY-AND-ROUTING.md](./04-FREE-ONLY-AND-ROUTING.md) §5 |
| 11 | Free-only enforcement | [04-FREE-ONLY-AND-ROUTING.md](./04-FREE-ONLY-AND-ROUTING.md) §§2–4 |
| 12 | Missing-feature implementation | [01-REPOSITORY-AUDIT.md](./01-REPOSITORY-AUDIT.md) §4 |
| 13 | Database migration | [06-MIGRATIONS.md](./06-MIGRATIONS.md) |
| 14 | Security and RBAC | [07-SECURITY-AND-RBAC.md](./07-SECURITY-AND-RBAC.md) |
| 15 | Automated test results | [05-TEST-AND-BUILD-RESULTS.md](./05-TEST-AND-BUILD-RESULTS.md) |
| 16 | Production build results | [05-TEST-AND-BUILD-RESULTS.md](./05-TEST-AND-BUILD-RESULTS.md) §4 |
| 17 | GitHub pull request | see PR link in the session summary |
| 18 | Deployment and rollback | [09-DEPLOYMENT-AND-ROLLBACK.md](./09-DEPLOYMENT-AND-ROLLBACK.md) |
| 19 | Remaining issues and limitations | [08-PRESERVATION-AND-REMAINING-ISSUES.md](./08-PRESERVATION-AND-REMAINING-ISSUES.md) §2 |

## Machine-readable evidence

- `evidence/execution-verification.json` — full output of
  `scripts/verify-workforce-execution.ts --execute --json`
  (100 departments, 2,000 agents, 2,000 identities, 14/14 checks).

## Reproduction

```bash
# 1. Database (SQLite dev)
npm ci
./scripts/dev-generate-client.sh
PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npx tsx scripts/sqlite-push.ts

# 2. Workforce
PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npx tsx scripts/provision-workforce.ts --apply
PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npx tsx scripts/provision-ai-employee-identities.ts --apply
PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npx tsx scripts/verify-2000-workforce.ts --verify

# 3. Execution + routing behaviour
PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npx tsx scripts/verify-workforce-execution.ts --execute

# 4. Gates
npx tsc --noEmit -p tsconfig.json
npx vitest run
npm run build
```

If your host cannot build the native `better-sqlite3` addon, prefix DB commands
with:

```bash
SANDBOX_SQLITE_SHIM=1 NODE_OPTIONS="-r ./scripts/dev/register-sqlite-shim.cjs"
```

`scripts/dev/` is a **sandbox-only** compatibility shim over Node's built-in
`node:sqlite`. No application module imports it, and it is inert unless
`SANDBOX_SQLITE_SHIM=1` is set.
