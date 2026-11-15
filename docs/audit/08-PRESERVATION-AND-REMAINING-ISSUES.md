# Preservation Report and Remaining Issues

## 1. Preservation report

### Diff scope

```bash
git diff --stat ae33423..HEAD
```

**Modified (11 files)** — every change is additive or a narrowed guard:

| File | Change | Risk |
|---|---|---|
| `src/lib/ai-router/router.ts` | +`isFreeOnlyMode` import; `getAvailableProviders` billing predicate gains a free-only branch (default-off); `estimateCost` returns 0 only when the mode is on | Low — behaviour is identical with the mode off |
| `src/lib/ai-router/provider-registry.ts` | +1 import; loop appending env-derived free specs | Low — skipped when credentials absent |
| `src/lib/ai-router/provider-admin.ts` | +`assertFreeOnlyAllows` guard at the top of `createProviderConfig` | Low — no-op with the mode off |
| `src/lib/ai-router/index.ts` | Re-exports only | None |
| `src/lib/multi-tenant-ai/service.ts` | `paidAllowed` gains `!freeOnlyMode`; `preferLocal` forced when on; optional `idempotencyKey` in options + reserve/release calls | Low — idempotency only runs when a key is supplied |
| `src/lib/cron-jobs.ts` | +`weekly-model-discovery` job + window helper | Low — new job only |
| `src/lib/dashboard/navigation.ts` | +1 nav item, +1 panel mapping | None |
| `deploy/cron/alolabs-cron` | +1 host cron line | Low — additive |
| `.env.example` | +documented `FREE_ONLY_MODE`, `AI_FREE_PROVIDER_TIMEOUT_MS`, `DISCOVERY_REPORT_DIR` | None |
| `.gitignore` | +`docs/discovery/*.json` | None |
| `package.json` | +3 scripts | None |

**Added (13 files):**

```
src/lib/ai-router/free-only-mode.ts
src/lib/ai-router/free-provider-specs.ts
src/lib/multi-tenant-ai/idempotency.ts
src/lib/ai-discovery/weekly-discovery.ts
src/app/api/super-admin/ai/model-center/route.ts
src/components/enterprise/panels/model-control-center.tsx
src/__tests__/lib/free-only-mode.test.ts
src/__tests__/lib/free-provider-specs.test.ts
src/__tests__/lib/weekly-discovery.test.ts
scripts/verify-workforce-execution.ts
scripts/run-model-discovery.ts
scripts/dev/better-sqlite3-shim.cjs
scripts/dev/register-sqlite-shim.cjs
```

**Deleted: none. Renamed: none.**

### Explicit preservation checklist

| Preservation rule | Status |
|---|---|
| No existing working feature deleted | ✅ no deletions |
| Not rebuilt from scratch | ✅ 11 modified + 13 added files in a 316-module `src/lib` |
| Database not replaced | ✅ zero schema delta |
| No tables dropped or reset | ✅ |
| Agents / employees / departments / history intact | ✅ verified: 2,000 / 2,000 / 100, 0 drift, 0 orphaned |
| No routes, APIs, components or dashboards removed | ✅ 451 routes intact; 245 components intact |
| Auth / RBAC not replaced | ✅ untouched |
| Ollama / Groq / gateway preserved | ✅ untouched; Groq still registered, Ollama adapters untouched |
| No working implementation replaced with a mock | ✅ the only mock-like code is a clearly-labelled test probe and a sandbox-only SQLite shim |
| No fake usage statistics or execution records | ✅ Model Control Center reads only real rows; empty states say so |
| No secrets exposed | ✅ tested (`source` never contains the key) |
| Production env not overwritten | ✅ only `.env.example` (empty keys) |
| Nothing deployed | ✅ no deploy performed |
| Additive/backward-compatible migrations | ✅ none needed |
| `better-sqlite3` version not loosened | ✅ reverted an accidental `^11.10.0` to the pinned `11.10.0` |

## 2. Remaining issues and limitations

Ordered by what a reviewer should look at first.

### Blocking verification (need an environment this sandbox lacks)

| # | Issue | What is needed |
|---|---|---|
| L1 | **No live inference was executed.** Neither local (Ollama) nor any hosted free provider was reachable. | Run `npx tsx scripts/verify-inference.ts --base-url http://localhost:11434/v1` on a host with Ollama, and one hosted call per configured free provider. |
| L2 | **No live quota/terms verification for any provider.** | A human must record `AIProviderVerification` + `ProviderQuotaSnapshot` rows per provider (see `03-FREE-PROVIDER-COMPARISON.md` §4). |
| L3 | **Website audit is content-level only.** Console errors, network failures, Lighthouse, mobile rendering, accessibility and live security headers were not measured (no browser, no network egress). | Re-run with a headless browser against https://alolabs.net. |
| L4 | **14 DB-integration tests cannot run here** (native `better-sqlite3` cannot compile). | Run `npm test` in CI or locally where `npm ci` can build native modules. |

### Known functional limitations

| # | Issue | Impact | Mitigation |
|---|---|---|---|
| L5 | Idempotency keys are opt-in per call. Existing callers that do not pass `idempotencyKey` get no duplicate protection. | A duplicated direct AI call is still possible for those callers. | Pass a key; follow-up: make it mandatory for agent-run paths. |
| L6 | `correlationId` is not unique at the DB level. | Idempotency is race-resolved, not index-enforced. | `06-MIGRATIONS.md` §5 proposes a dedicated table. |
| L7 | Weekly discovery is gated to Monday 03:00 UTC inside an hourly job. If the process is down during that hour, the run is skipped until the next Monday. | A missed weekly report. | Run `npm run verify:model-discovery` manually; host cron entry added in `deploy/cron/alolabs-cron`. |
| L8 | Discovery only queries OpenAI-compatible `/models`. Providers with a different discovery shape are reported `unreachable`. | Under-reporting, never over-reporting. | Documented in `report.limitations`. |
| L9 | No per-model health check (only per-provider). | Cannot say "model X is down" independently. | Most providers do not expose a per-model probe. |
| L10 | Workforce Monitor lacks a "current tasks" per agent aggregate. | Cannot see live in-flight work per employee from the new panel. | Agent executions are approval/instance based; needs a new read model. |
| L11 | 356 of 2,000 agents have an empty tool allowlist by design. | A reviewer may read it as a defect. | Reported explicitly in the verification output and in `05-TEST-AND-BUILD-RESULTS.md` §7. |

### Deliberately not done

| # | Item | Reason |
|---|---|---|
| N1 | Website navigation fix (link the orphaned `/site/*` pages) | Changes public branding/navigation; requires owner approval per the preservation rules. Recommendation recorded in `02-WEBSITE-AUDIT.md` §3 W1. |
| N2 | Dependency vulnerability upgrades (12 findings) | Needs a separate reviewed PR; risk of breaking a 451-route app. |
| N3 | Auto-registration of discovered models | Explicitly forbidden by the master prompt. |
| N4 | Any deployment or merge | Explicitly forbidden. |

## 3. What can honestly be claimed as complete

- ✅ Audit performed with file/command/test evidence.
- ✅ 100 departments, 2,000 agents, 2,000 employee identities **verified against a real database**, 0 drift, 0 orphaned.
- ✅ Execution preconditions verified for all 2,000 employees.
- ✅ Router execution, exactly-once failover and refusal of paid fallback verified with deterministic probes.
- ✅ FREE-ONLY mode implemented at four enforcement points, with 12 tests.
- ✅ Seven documented-but-unregistered free providers now register when credentialed.
- ✅ Duplicate AI call prevention implemented.
- ✅ Weekly open-source discovery implemented, read-only, with honest limitations.
- ✅ Model Control Center API + UI added without touching existing panels.
- ✅ Typecheck passes, production build passes, 1,850 tests pass.

## 4. What cannot honestly be claimed

- ❌ "Local AI inference works" — Ollama was unreachable here.
- ❌ "A free external provider works" — no key, no network.
- ❌ "Quota exhaustion handled in production" — handled in code and by tests, not exercised against a real provider.
- ❌ "The website passes performance/accessibility/security-header checks" — not measured.
- ❌ "100% success" for anything. The 14 pre-existing test failures and the two partial counts (356 empty allowlists, 100 unsupervisored directors) are reported with their explanations.

No completion percentage is given, and none should be inferred.
