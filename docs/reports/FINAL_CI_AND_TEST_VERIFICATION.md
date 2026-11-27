# Final CI and test verification

**Run:** 2026-11-27, working tree of `arena/5010a0d6-alolabs-ai`, re-measured after
the Command Center and browser-guard work. Nothing below is copied from an earlier
report; each line is a command that was executed.

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript (source) | `npm run typecheck` | **PASS** — 0 errors (`next typegen` + `tsgo`) |
| TypeScript (tests) | `npm run typecheck:tests` | **PASS** — 0 errors |
| Lint | `npm run lint` | **PASS** — 0 errors |
| Route classification | `npm run verify:security` | **PASS** — 546/546 route files classified, 0 unclassified |
| Migration safety | `npm run verify:migrations` | **PASS** — 15 forward / 12 rollback, all paired, 0 destructive DDL |
| Route auth audit | `node scripts/validate-route-auth.mjs` | **PASS** — 546 files, 860 non-public handlers, 21 allowlist entries, 2 documented exceptions |
| Link coverage | `npm run verify:links` | **PASS** — 88 links, 277/277 evidence paths found, 0 missing |
| Dual-schema parity | `npm run verify:mysql` | **PASS** — 266/266 models (unchanged this session; no schema edits) |
| Unit/integration matrix | `npx vitest run` | **PASS** — 249 files passed, 1 skipped; **2,788 tests passed**, 0 failed, 15 skipped |
| Operator runtime probe | `npm run verify:operator` | **PASS** — 15/15 checks against real SQLite |
| Browser capability probe | `npm run verify:browser` | **PASS (capability reported unavailable)** — 10 destinations blocked, 0 leaks, 2 allowed, 0 false positives |
| Production build | `PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run build` | **PASS** — exit 0; compile + generate + standalone packaging + CJS mini-services; `verify-standalone` 11,408 files, no leaked secrets or DBs |
| Packaged mini-services load | `node -e "require('./.next/standalone/mini-services/*.cjs')"` (timeout 25 s) | **PASS** — `queue-service.cjs` ("Database connected"), `realtime-service.cjs` ("authenticated socket listening on 3005") |

## Skipped tests

15 tests in `__tests__/integration/mysql-compatibility.test.ts` are skipped because
no live MySQL instance is reachable (`MYSQL_TEST_URL` unset). They are **not**
counted as passed. Their static counterpart `npm run verify:mysql` (266/266 models,
schema parity) runs on every gate and passes.

## New tests added this session

| Suite | Count | Focus |
| --- | --- | --- |
| `__tests__/unit/lib/operator-intents.test.ts` | 17 | risk table, classification, injection resistance, gated vocabulary, attachments |
| `__tests__/api/super-admin-command.test.ts` | 14 | 401/403/429, dispatch, approval gate, preview, queue failure, tenant boundaries, history scoping |
| `__tests__/unit/lib/browser-navigation-guard.test.ts` | 30 | SSRF matrix incl. octal/hex/decimal IPv4 and IPv4-mapped IPv6 |
| **Total** | **61** | |

## CI (GitHub Actions)

Five required checks run on the PR: *TypeScript, tests, lint, and build* ·
*Login and MFA (isolated Chromium)* · *MySQL schema, client, and real read/write* ·
*Dependency Audit* · *Secret Scan*. Results for the commit of this session are
recorded in the PR body and in the final response; they are not asserted here
before they have reported.

## What these gates cannot prove

A green suite is not a working product. Specifically **not** covered:

- no agent executed a plan end-to-end (no provider credentials in this
  environment);
- no browser opened a page (no Chromium);
- no deployment, migration or secret rotation was performed;
- no capacity/load test was run on the shared host.
