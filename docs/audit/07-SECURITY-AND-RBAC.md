# Security and RBAC Report

## 1. Verified existing controls (unchanged by this branch)

| Control | Implementation | Evidence |
|---|---|---|
| Password hashing | bcrypt, 12 rounds | `src/lib/auth.ts` |
| Session tokens | Opaque, SHA-256 hashed at rest, TTL + idle timeout, legacy migration | `src/lib/auth.ts`, `src/__tests__/lib/session-manager.test.ts` |
| JWT secret policy | ≥32 characters enforced in production | `src/lib/auth.ts` |
| Provider credentials | AES-256-GCM `v1:iv:tag:ct`; only `hasApiKey` + `keyFingerprint` leave the server | `src/lib/security/field-encryption.ts`, `provider-admin.describeProviderConfig` |
| SSRF on provider baseUrl | Blocks metadata host, `169.254.*`, `::`, `fe80:`, `ff*`, credentials-in-URL, query/hash | `provider-admin.ts` `BaseUrlSchema` |
| Local endpoint trust | Must be literal loopback or RFC1918/ULA; arbitrary hostnames never treated as local | `src/lib/ai-provider-catalog.ts` `isTrustedLocalInferenceEndpoint` |
| Tool authorization | Deny-by-default, no wildcards, high-risk/approval tools blocked until an approved record exists | `src/lib/tools/policy.ts`, `src/lib/approval-engine` |
| Prompt injection | Validator flags injection, secrets and PII with a risk score | `src/lib/ai-security/validator.ts` |
| CSRF | Double-submit token | `proxy.ts` |
| Rate limiting | Per-IP: login 10/min, public 100/min, ai-chat 60/min, agent-run 30/min | `proxy.ts` |
| Public route allowlist | Explicit list; the old `?health=true` bypass was removed | `proxy.ts` `PUBLIC_API_ROUTES` |
| Super Admin surface | Server-side `requireRole('super_admin')` on every `/api/super-admin/*` route | see §3 |
| Tenant isolation | Provider configs scoped by `companyId`; cross-tenant existence not revealed (404 not 403) | `provider-admin.loadOwned` |
| Global provider scope | Super-Admin only | `provider-admin.createProviderConfig` |

## 2. What this branch adds

| Control | Implementation | Test |
|---|---|---|
| Global FREE-ONLY ceiling | Router candidate filter, service `paidAllowed` gate, provider-registration guard | `free-only-mode.test.ts` (12) |
| No cost attribution in free-only | `AIRouter.estimateCost` returns 0 | `execution.no_silent_paid_fallback` probe |
| Metered provider blocked | `FREE_ONLY_MODE_PAID_PROVIDER_BLOCKED` (403) | `free-only-mode.test.ts` |
| Duplicate AI call refused | `DUPLICATE_AI_REQUEST` (409) before any provider request | `idempotency.ts` (release on defer/fail) |
| Secret non-leakage in new code | Env spec `source` field carries variable *names* only; tested | `free-provider-specs.test.ts` asserts `source` never contains the key |
| Fail-closed discovery | Unreachable provider → `unreachable`, never an assumed catalogue; unknown facts reported as `unknown` | `weekly-discovery.test.ts` |
| Discovery cannot activate | Writes files + metrics + audit with `activatedAnyModel: false`; no config write path | code review + audit event payload |
| New Super Admin endpoint | `requireRole('super_admin')` first statement in `GET` | `model-center/route.ts` |

### The switch cannot be flipped by a tenant admin

`FREE_ONLY_MODE` is an environment variable read at call time. There is **no API
route** that writes it. Changing it requires server/deployment access plus a
restart, which is Super Admin / operator territory by definition.

## 3. Super Admin endpoints touched or added

| Route | Method | Authorization | Change |
|---|---|---|---|
| `/api/super-admin/ai/model-center` | GET | `requireRole('super_admin')` | **new**, read-only |
| `/api/super-admin/ai/providers` | * | existing | untouched |
| `/api/super-admin/ai/usage` | GET | existing | untouched |
| `/api/v1/providers` | GET/POST | existing admin roles | `createProviderConfig` now also enforces FREE-ONLY |

## 4. Data-classification behaviour under failover

Unchanged and re-verified by reading `service.ts`:

- `dataClassification` defaults to `confidential` (never `public`).
- `externalDataAllowed` = policy flag **AND** company-level
  `externalDataProcessingApproved` **AND** (for confidential/restricted)
  `confidentialDataExternalAllowed`.
- A failover attempt cannot widen this: the same computed context is passed to
  every candidate, and candidates failing the check are filtered out before
  selection.
- Restricted-data workloads can therefore only use local inference or a company
  that has explicitly approved external confidential processing.

## 5. Findings requiring action (not fixed here)

| # | Finding | Severity | Why not fixed |
|---|---|---|---|
| F1 | `npm ci` reports 12 vulnerabilities (11 moderate, 1 high) in the dependency tree. | Medium | Transitive upgrades can break a 451-route app; needs its own PR with full test runs. |
| F2 | `ModelUsageRecord.correlationId` has no unique index, so idempotency relies on a deterministic race re-read. | Low | Schema change; see `06-MIGRATIONS.md` §5. |
| F3 | Live security headers (HSTS, CSP, X-Frame-Options) could not be confirmed on the wire — the sandbox has no route to alolabs.net. | **Unknown** | Must be checked from a networked environment. Headers are declared in `next.config.ts`; whether the edge proxy preserves them is unverified. |
| F4 | 14 integration tests that assert foreign-key error codes cannot run in this sandbox. Those assertions are security-relevant (referential integrity) and should be executed in CI with a native SQLite or MySQL instance. | Low (CI coverage gap) | Environmental. |

## 6. What was explicitly NOT done

- No secret was printed, logged, or committed. The only place a credential
  appears is in-memory inside an adapter constructor.
- No `.env` file was created or modified; only `.env.example` gained documented,
  empty keys.
- No authentication or RBAC mechanism was replaced.
- No route was removed.
- No production deployment was touched.
