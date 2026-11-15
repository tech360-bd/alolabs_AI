# Free-Only Enforcement, Routing and Failover

**Scope:** what this branch adds on top of the existing router/gateway, and how
the pieces compose. Existing behaviour is described only where needed to explain
a new interaction.

---

## 1. Layered cost control (innermost → outermost)

```
per-model permission        CompanyModelPermission(modelId)
  → per-company budget      CompanyBudget { paidApiAllowed, maxPaidBudgetUsd, autoBillingEnabled }
    → per-company policy    ModelRoutingPolicy { allowPaid, allowVerifiedFree, preferLocal, externalDataAllowed }
      → routing profile     free_general / free_coding / … / approved_paid
        → GLOBAL FREE-ONLY  FREE_ONLY_MODE  ← new, sits above everything
```

FREE-ONLY MODE can only ever *remove* eligibility. It can never grant a route
that the layers below deny.

## 2. `src/lib/ai-router/free-only-mode.ts` (new)

| Export | Behaviour |
|---|---|
| `isFreeOnlyMode(env)` | `FREE_ONLY_MODE` truthy → true; falsy → false; unset → falls back to `LOCAL_ONLY`. Default **off**. |
| `effectivePaidBudgetUsd(ceiling)` | Returns `0` when the mode is on. |
| `paidApiAllowedInMode(perCompany)` | Always `false` when the mode is on. |
| `autoBillingAllowedInMode()` | `false` when the mode is on (assertion for audits; no purchase code path exists). |
| `freeOnlyAllowsRouteKind(kind)` | `paid` → false; `local` / `verified_free` → true. |
| `FREE_ONLY_PAID_PROVIDER_KINDS` | Metered kinds that may not be added/enabled: `openai`, `openrouter`, `groq`, `deepseek`, `mistral`, `qwen`, `cohere`, `sambanova`, `nvidia`, `zai-sdk`. |
| `freeOnlyModeDescription()` | Human string for the UI; explicitly says **external AI inference** only. |

The mode is read from the environment **at call time**, not cached at import, so
an operator can flip it without a code change.

## 3. Enforcement points (all four, so there is no bypass)

### 3.1 Router candidate filter — `AIRouter.getAvailableProviders`

```ts
const freeOnlyMode = isFreeOnlyMode();
const permittedByBilling = isLocal ||
  (!freeOnlyMode && context.allowPaid === true && explicitlyAllowed) ||
  (freeOnlyMode
    ? (context.allowVerifiedFree !== false && freeEligible)
    : (context.allowVerifiedFree === true && (freeEligible || explicitlyAllowed)));
```

Consequence: a caller that sets `allowPaid: true` still reaches **no** paid
provider while the mode is on. Local providers remain eligible; adapters with a
strict upstream $0 pricing gate remain eligible.

### 3.2 Cost attribution — `AIRouter.estimateCost`

Returns `0` in FREE-ONLY mode. Recorded `costUsd` for a free-only platform is
therefore $0 by construction rather than by trusting a catalogue.

### 3.3 Company AI service — `buildPreparedRouting`

```ts
const freeOnlyMode = isFreeOnlyMode();
const paidAllowed = !freeOnlyMode && policy.allowPaid && profile === 'approved_paid' &&
  company.paidApiAllowed && budget.paidApiAllowed &&
  budget.maxPaidBudgetUsd > 0 && !budget.autoBillingEnabled;
if (freeOnlyMode) policy.preferLocal = true;
```

`paidAllowed` feeds `assessCandidate({ allowPaid })`, so no candidate can be
classified `paid` while the ceiling is on.

### 3.4 Provider administration — `assertFreeOnlyAllows`

Refuses to create or re-enable a metered provider kind, with error code
`FREE_ONLY_MODE_PAID_PROVIDER_BLOCKED` (HTTP 403). Disabling a provider is always
allowed.

## 4. What happens when nothing free is available

The existing deferral path is unchanged and is the required behaviour:

| Situation | Result | Code |
|---|---|---|
| No authorized model at all | deferred, no call | `NO_AUTHORIZED_MODEL` |
| Free provider quota unknown/exhausted | deferred | `QUOTA_UNKNOWN_OR_EXHAUSTED` |
| Free-tier verification stale | deferred | `FREE_TIER_STATUS_UNKNOWN` |
| External data not authorized | deferred | `EXTERNAL_DATA_NOT_AUTHORIZED` |
| Token budget exhausted | blocked | `TOKEN_BUDGET_EXHAUSTED` |
| Rate limited on the last route | deferred | `RATE_LIMITED_DEFERRED` |
| All authorized routes failed | error, **no paid fallback** | `AUTHORIZED_ROUTE_FAILED` |

A task is never silently upgraded to a paid provider. There is no code path that
purchases credit or starts a subscription.

## 5. Failover guarantees

| Guarantee | Mechanism |
|---|---|
| Bounded attempts | `MAX_ROUTE_ATTEMPTS = 4` in the service; router failover is bounded by the candidate list |
| No infinite retry | `provider-base.withRetry` has `MAX_RETRIES` with jittered exponential backoff; 429 is **not** retried |
| Circuit breaker | 5 consecutive failures → 60 s open, half-open probe after |
| No duplicate execution on switch | streaming failover stops after the first emitted token; non-streaming returns on first success and re-throws after the last candidate |
| No duplicate logical call | **new** idempotency reservation (`multi-tenant-ai/idempotency.ts`) |
| Context preserved across switch | `requestId`/`correlationId` and the data-classification context are carried into every attempt |
| Privacy preserved | `externalDataAllowed` is computed per request from data classification + company settings; a switch never widens it |
| Capability preserved | candidates are filtered by required capability and context length before selection |

## 6. Idempotency (new)

`src/lib/multi-tenant-ai/idempotency.ts`

```ts
reserveAIIdempotencyKey({ companyId, idempotencyKey, profile })
```

- Stores the key on `ModelUsageRecord.correlationId` for the first attempt.
- A duplicate call whose key is **running or succeeded** is refused with
  `409 DUPLICATE_AI_REQUEST` — before any provider request starts.
- Failover inside one logical call **reuses the reservation**; switching provider
  is not a duplicate.
- Deferred / failed / blocked endings **release** the reservation, so an operator
  can deliberately retry.
- Concurrency: after insert, the oldest `running|success` row wins; the losing
  insert is deleted.

Known limitation: `ModelUsageRecord.correlationId` has no unique index. The
race is resolved by a deterministic re-read. A unique partial index would be
stronger and is listed as a follow-up migration (see `06-MIGRATIONS.md`).

## 7. Weekly discovery (new)

`src/lib/ai-discovery/weekly-discovery.ts` + `scripts/run-model-discovery.ts`

- Probes only providers whose credentials exist; a provider that fails is
  reported `unreachable`, never guessed.
- Compares live `/models` against the configured catalogue to report
  **new** models (review candidates) and **deprecated** models.
- Marks live models from quota-metered vendors as `quota_based`, never
  `verified_zero_price`.
- Writes `docs/discovery/model-discovery-<date>.json` + `Metric`
  (`metricType='ai_discovery'`) + an audit event with
  `activatedAnyModel: false`.
- Schedule: registered hourly and gated to **Monday 03:00 UTC**
  (`isWeeklyDiscoveryWindow`), because the in-process cron parser supports fixed
  intervals only. A host-level cron entry is added in `deploy/cron/alolabs-cron`.
- It never registers, activates or reroutes a model.

## 8. How to turn FREE-ONLY MODE on

```bash
# .env (or the deployment secret store)
FREE_ONLY_MODE=true
LOCAL_ONLY=true
```

Then verify:

```bash
npx tsx scripts/verify-workforce-execution.ts --execute
# execution.free_only_mode_readable should report true
```

and confirm in the UI: **Infrastructure → Model Control Center** shows
`FREE-ONLY MODE ON` and the description string.

To turn it off, a Super Admin sets `FREE_ONLY_MODE=false` and restarts. That is
the only way; there is no runtime API that flips it, so the switch cannot be
changed by a compromised tenant admin.
