# AgentOS — AI Provider Operations

Date: 2026-11-19 · Branch `arena/304ea66d-alolabs-ai`
Evidence level: **implemented + locally verified against stubs**; a real provider was
**never** called from this environment (`BLOCKED_EXTERNAL_DEPENDENCY`: no provider key, no
Ollama, no outbound access to provider APIs from the sandbox).

Related: `AGENTOS_SECURITY_AUDIT.md` SA-06, `AGENTOS_CRM_CONNECTOR_OPERATIONS.md` §5,
`AGENTOS_STAGING_ACTIVATION_RUNBOOK.md`.

---

## 1. The one rule that matters

> **Registered ≠ ready. Initialized ≠ ready. A passing health check ≠ successful inference.**

`ai_provider` passes in preflight only when a **real** `provider.healthCheck()` returns
`isHealthy: true` for a provider that is (a) initialized, (b) not circuit-open, (c) has no init
error, and (d) is unscoped or scoped to the requesting company. The check is bounded at
**4 000 ms**; a timeout is a failure, not a pass.

`preflight.ts` exposes `provider_probe`:

| Value | Meaning |
|---|---|
| `router` | the default path — providers came from the real router registry and each was health-checked |
| `injected_simulated` | a test injected a fake probe. **Never** acceptable as staging evidence |

The evidence JSON records `provider_probe`, so a reader can tell which happened.

## 2. How providers get registered

Two sources, both reconciled into the router on `ensureRouterSynced()`:

1. **Environment** (`src/lib/ai-router/provider-registry.ts`): `OPENAI_API_KEY` +
   `OPENAI_BASE_URL` (any OpenAI-compatible endpoint), `GROQ_API_KEY`, `DEEPSEEK_API_KEY`,
   `MISTRAL_API_KEY`, `QWEN_API_KEY`, `OPENROUTER_API_KEY`, a local gateway
   (`LOCAL_INFERENCE_API_KEY` + gateway URL). Presence of a key registers the adapter — it does
   **not** prove the endpoint answers.
2. **Database** (`AIProviderConfig` rows): name, provider, baseUrl, encrypted apiKey,
   `isLocal`, `isActive`, optional `companyId`. These are the company-scoped providers a
   customer can add in the dashboard.

Env-configured providers are unscoped (usable by any company); DB providers scoped to a
company are visible only to that company plus the unscoped ones.

Sync is cached for `AI_PROVIDER_SYNC_MS` (default 30 s). **Preflight forces a re-sync**
(`ensureRouterSynced({ force: true })`) so a just-added or just-removed provider is reflected
in the readiness decision instead of a stale registry.

## 3. Readiness pipeline

```
credential row ─┐
provider env/db ─┴─► ensureRouterSynced(force) ─► providers: initialized? circuitOpen? initError?
                                                 └─► healthCheck() (4 s cap) ─► ready | not ready
                                                       └─► ai_provider check
```

`getReadyProviderSummaries()` returns only initialized, non-circuit-open providers without an
init error. Preflight then health-checks each and keeps the survivors; `providers` and `models`
in the response are derived from survivors only.

If **no** provider survives, `ai_provider` fails with a precise reason and
`workflow_execution_ready` is `false`. The run API refuses to dispatch. No placeholder text is
generated.

## 4. Configuration

```bash
# minimal real-provider configuration (staging)
OPENAI_API_KEY=sk-...            # or GROQ_API_KEY / DEEPSEEK_API_KEY / ...
OPENAI_BASE_URL=https://api.openai.com/v1   # omit for the default
AI_PROVIDER_SYNC_MS=30000        # registry cache

# local only (tests / on-prem): a trusted loopback gateway
LOCAL_INFERENCE_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_INFERENCE_API_KEY=...
```

Company-scoped providers are written through the provider-admin API; keys are encrypted with
AES-256-GCM before storage and never returned by any read endpoint (presence + masked hint
only). Switching a provider to `isActive: false` removes it from readiness on the next sync.

## 5. Failure modes → operator action

| Symptom in preflight | Cause | Action |
|---|---|---|
| `ai_provider: "no providers configured"` | no key/env row and no active DB provider | configure one |
| `"provider X failed health check within 4s"` | key invalid, endpoint down, egress blocked, wrong baseUrl | test the endpoint out-of-band; rotate key |
| `"initialization failed: …"` | adapter rejected config at init | fix config |
| `circuitOpen` | repeated failures tripped the breaker | fix root cause; wait for reset |
| provider exists but is scoped to another company | wrong tenant | add a provider for this company |
| Works locally, fails in staging | loopback gateway not reachable from the app host | point at a reachable endpoint |

Health-check failures are logged as integration events without the key. **Do not** treat a
`200` on `/healthz` or a successful TCP connect as inference proof.

## 6. Verifying honestly

```bash
# unit/integration: router + preflight semantics (stub provider)
npx vitest run __tests__/integration/crm-staging-simulation.test.ts --maxWorkers=1
npx vitest run __tests__/api/crm-preflight.test.ts --maxWorkers=1   # if present
# type-level check of the router and provider admin paths
npm run typecheck
```

What the tests prove: registration alone does not satisfy `ai_provider`; a failing/absent
health check blocks the workflow; a healthy stub unblocks it and the workflow then produces
real drafts from the stub's deterministic output.

What they do **not** prove: that a paid provider answers, what it costs, what it does with the
lead PII, whether its output is good Bengali, or whether it rate-limits. Those require the real
key and are recorded as `BLOCKED_EXTERNAL_DEPENDENCY` in the acceptance report.

## 7. Cost, privacy and safety notes

- The five-lead workflow sends each lead's name/email/phone/notes to the provider. That is a
  PII transfer to a third party; the operator must confirm the provider's data policy before
  staging acceptance.
- Free-only mode (`FREE_ONLY` env) restricts routing to providers whose adapter enforces a $0
  upstream; enabling it may make `ai_provider` fail if only paid providers exist. That is
  correct behaviour, not a bug.
- Prompt injection: lead text is data. The workflow validates the returned JSON against a
  schema, drops unknown keys, and has no tool-calling step, so a hostile lead cannot cause a
  side effect.
- There is no automatic retry loop across providers for this workflow beyond the router's
  existing failover; a failed generation fails the run visibly.

## 8. Evidence status

| Claim | Status |
|---|---|
| Registration/health-check gating implemented | implemented |
| Gating behaviour tested (stub provider, real health-check interface) | locally verified |
| Workflow generates drafts from a healthy provider | locally verified with a deterministic stub |
| Real provider inference, latency, cost, Bengali quality | **not tested** — `BLOCKED_EXTERNAL_DEPENDENCY` |
| Provider key rotation in staging | **not tested** |
