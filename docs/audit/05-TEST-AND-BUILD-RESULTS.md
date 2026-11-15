# Test and Build Results

**Date:** 2026-11-15
**Branch:** `arena/d02e7b8a-alolabs-ai`
**Base:** `ae33423` (Merge PR #38)
**Environment:** Node v22.22.3, npm 10.9.8, 3.9 GB RAM, no outbound access to AI
providers, no Ollama, no Redis, no MySQL.

---

## 1. Summary

| Gate | Result | Detail |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **PASS** | 0 errors |
| `npm run build` | **PASS** | exit 0; `.next/standalone/server.js` emitted |
| `npx vitest run` | **1,850 passed / 14 failed / 15 skipped** | all 14 failures pre-existing |
| New tests added | **31** (plus execution probes in a script) | see §3 |
| Workforce DB verification | **PASS** | 100 / 2,000 / 2,000 |
| Execution probe verification | **PASS** | 14/14 checks |

## 2. Test suite

```
Test Files  5 failed | 153 passed | 1 skipped (159)
     Tests  14 failed | 1850 passed | 15 skipped (1879)
```

### The 14 failures are pre-existing

Reproduced on the **untouched base commit** in a clean worktree:

```
git worktree add /tmp/basecheck ae33423
cd /tmp/basecheck
SANDBOX_SQLITE_SHIM=1 NODE_OPTIONS="--require .../register-sqlite-shim.cjs" \
  npx vitest run __tests__/integration/job-queue-durability.test.ts \
                 __tests__/integration/prisma-foreign-keys.test.ts
→ 5 failed | 9 passed

  ... backup-restore + agent-health-integrity + sqlite-foreign-keys
→ 9 failed | 5 passed
```

Total on base: **14 failed** — identical to this branch. They require a real
native `better-sqlite3` binding, which cannot be compiled in this sandbox
(`node-gyp` header download is blocked). They are **not** caused by this work.

| Failing file | Failing tests | Root cause |
|---|---|---|
| `__tests__/integration/backup-restore.test.ts` | 7 | Spawns the backup script which opens SQLite natively |
| `__tests__/integration/job-queue-durability.test.ts` | 3 | Needs the Prisma SQLite adapter honouring `P2002` from the native driver |
| `__tests__/integration/prisma-foreign-keys.test.ts` | 2 | Expects `P2003`; the shim surfaces `ERR_SQLITE_ERROR` |
| `__tests__/integration/sqlite-foreign-keys.test.ts` | 1 | Runs the schema generator in a subprocess without the shim |
| `__tests__/integration/agent-health-integrity.test.ts` | 1 | Depends on foreign-key error codes |

### New tests (all passing)

| File | Tests | Covers |
|---|---|---|
| `src/__tests__/lib/free-only-mode.test.ts` | 12 | switch parsing + `LOCAL_ONLY` fallback; paid route/ budget/ billing refusal; provider-kind guard |
| `src/__tests__/lib/free-provider-specs.test.ts` | 10 | only-present-credentials; no secret leakage; Cloudflare pair requirement; alias handling; official URLs; catalogue integrity; no false `freeOnly` claim |
| `src/__tests__/lib/weekly-discovery.test.ts` | 9 | no-credentials honesty; unreachable ≠ empty; HTTP error handling; new-model review-only; deprecation detection; `quota_based` labelling; limitations; Monday-03:00 gate |

### Pre-existing suites re-verified (unaffected)

```
ai-router-free-routing            2 passed
ai-provider-timeout-failover      7 passed   (failover on timeout, mid-stream, all-hang)
ai-provider-openai-compatible     9 passed   (retry then succeed, decision recording)
ci-paid-services                 37 passed   (default-deny paid CI)
```

## 3. TypeScript

```
npx tsc --noEmit -p tsconfig.json
→ (no output, exit 0)
```

Note on memory: the build's *internal* type checker is memory-hungry. Under
memory pressure it can abort with "Failed to type check" while standalone `tsc`
reports zero errors — this was observed intermittently during this audit. A
clean `npm run build` run completes successfully. This is a 3.9 GB sandbox
characteristic, not a source error.

## 4. Production build

```
npm run build
→ ✓ Compiled successfully
→ Route list emitted (451 API routes + pages)
→ .next/standalone/server.js present (8,119 bytes)
→ exit 0
```

## 5. Database-backed workforce verification

Provisioning + verification run against a real SQLite database created from
`prisma/schema.prisma` (228 tables):

```
scripts/seed-100-departments.ts --apply        → 100 departments
scripts/provision-workforce.ts --apply         → 2000 agents, 0 drift, 0 orphaned
scripts/provision-ai-employee-identities.ts    → 2000 identities, 0 missing
scripts/verify-2000-workforce.ts --verify      → all checks pass
```

## 6. Execution verification

```
npx tsx scripts/verify-workforce-execution.ts --execute
```

```
PASS  departments.registered             expected=100  actual=100
PASS  agents.registered                  expected=2000 actual=2000
PASS  agents.department_assigned         expected=2000 actual=2000
PASS  agents.system_instructions         expected=2000 actual=2000
PASS  agents.runtime_profile             expected=2000 actual=2000
PASS  agents.tools_permitted             expected=2000 (allowlist or explicit empty)
                                              actual=1644 with tools + 356 least-privilege empty
PASS  employees.identity                 expected=2000 actual=2000
PASS  employees.supervisor               expected=2000 (supervised or department director)
                                              actual=1900 supervised + 100 directors
PASS  agents.model_assignment_resolvable expected=2000 actual=2000
PASS  employees.not_retired              expected=0    actual=0
PASS  execution.healthy_route_completes  expected=probe-ok (1 call) actual=probe-ok (1 call)
PASS  execution.failover_executes_once   expected=probe-ok with exactly 1 fallback call
                                              actual=probe-ok with 1 fallback call
PASS  execution.no_silent_paid_fallback  expected=refused with 0 paid calls
                                              actual=refused with 0 paid calls
PASS  execution.free_only_mode_readable  expected=boolean actual=false
```

### What this does and does not prove

**Proves:** every provisioned employee satisfies the database preconditions for
execution; the router completes a healthy call; a failing primary fails over
**exactly once**; a paid-only candidate set is refused with **zero** provider
calls.

**Does not prove:** that any hosted or local model produced a completion. The
probes use a deterministic in-process provider so the result is reproducible.
Hosted/local inference must be verified with `scripts/verify-inference.ts` against
a live gateway, which was unavailable here.

## 7. Honest accounting of the two "partial" numbers

- **356/2000 agents have an empty tool allowlist.** This is least privilege, not
  a defect: `ROLE_CATALOG` grants tool *categories*, and a category that
  intersects nothing the department owns yields an empty allowlist. The check
  reports both numbers so the figure is not hidden.
- **100/2000 employees have no supervisor.** These are exactly the 100 department
  directors — one per department, by design (`employee-identities.ts`). Every
  other employee has a supervisor.
