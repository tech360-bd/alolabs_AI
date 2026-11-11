# Test Baseline — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification.

## Test framework

- **Vitest** 4.1.10, Testing Library, jsdom environment.
- Config: `vitest.config.ts` — `include: ['__tests__/**/*.{test,spec}.{ts,tsx}', 'src/__tests__/**/*.{test,spec}.{ts,tsx}']`.
- Coverage provider: v8; reporters: text, json, html.
- Setup: `__tests__/setup.ts` — mocks `next/navigation`, paid-services guard on `fetch`.

## Test file inventory (144 total)

| Category | Count | Location |
|---|---|---|
| Unit (libs) | ~80 | `__tests__/unit/lib/`, `src/__tests__/` |
| API (route handlers) | ~30 | `__tests__/api/` |
| Integration | ~15 | `__tests__/integration/` |
| E2E | ~5 | `__tests__/e2e/` |
| Component | ~14 | `__tests__/unit/components/` |

## Security-relevant test files

| File | Lines | Coverage |
|---|---|---|
| `__tests__/unit/lib/api-security.test.ts` | 496 | `secureRoute` decision logic; tenant mismatch, scope denial, role denial, rate-limit, redact function |
| `__tests__/api/route-authorization.test.ts` | 336 | role-based access matrix across routes |
| `__tests__/api/route-hardening.test.ts` | — | route hardening |
| `__tests__/api/security.test.ts` | — | security |
| `__tests__/unit/agentos-v1-auth.test.ts` | 160 | v1 auth + sha256 hashing + scope check |
| `__tests__/unit/agentos-v1-boundaries.test.ts` | 66 | v1 boundaries |
| `__tests__/unit/lib/voice/webhook-security.test.ts` | — | HMAC verification for inbound telephony webhooks |
| `__tests__/unit/lib/multi-tenant-ai-policy.test.ts` | — | multi-tenant AI policy |
| `__tests__/unit/lib/ai-employee-identities.test.ts` | — | AI employee identities |
| `__tests__/api/public-contact.test.ts` | 228 (PR #28) | contact API: validation, honeypot, rate limit, CRM capture, SMTP, 502 |

## Spec acceptance tests (Section 23) — current coverage

| Spec test | Status | Evidence |
|---|---|---|
| TEST 1: Authorized customer creates project + connects via API | PARTIAL | `/v1/projects` POST exists; no "connect" flow beyond CRUD |
| TEST 2: ALO LABS discovers approved existing AI capabilities | **NOT TESTED** | discovery system does not exist |
| TEST 3: Identifies missing capabilities + generates recommendation | **NOT TESTED** | recommendation engine does not exist |
| TEST 4: Customer sends task, private AI executes, returns result | PARTIAL | `/v1/agents/execute` + `/v1/agents/:id/run` exist; response not sanitized |
| TEST 5: External users cannot retrieve internal agent count | **NOT TESTED** (would FAIL — count is exposed) | no test asserts the count is hidden |
| TEST 6: External users cannot access internal prompts/models/tools/workforce | **NOT TESTED** (would FAIL — all exposed) | no test asserts prompts are hidden |
| TEST 7: External users cannot access Super Admin endpoints | PARTIAL | `route-authorization.test.ts` covers some |
| TEST 8: Tenant cannot access another tenant's data | PARTIAL | `api-security.test.ts` covers `secureRoute`; v1 surface less covered |
| TEST 9: Revoked API key immediately loses authorization | **NOT TESTED** | no api-keys revocation test |
| TEST 10: Approved external action requires correct permission + approval | PARTIAL | approval model exists; no end-to-end test |
| TEST 11: Knowledge retrieval respects tenant permissions | PARTIAL | RAG models have `companyId`; no dedicated cross-tenant RAG test |
| TEST 12: Predictive model performance compared with baseline | **NOT TESTED** | no predictive model exists |
| TEST 13: Infrastructure failure detected and logged | PARTIAL | `/v1/health` exists; no failure-injection test |
| TEST 14: Customer views own usage without seeing another customer's | **NOT TESTED** | `/v1/usage` does not exist |
| TEST 15: Existing ALO LABS functionality continues to work | PARTIAL | broad unit coverage; no regression suite run in this audit |

## Missing test files (gaps)

| Missing test file | Why needed |
|---|---|
| `__tests__/api/v1-response-sanitization.test.ts` | assert no agent count / prompts / model names / traces in public responses |
| `__tests__/api/v1-api-keys-revocation.test.ts` | assert revoked key fails immediately |
| `__tests__/api/v1-api-keys-tenant-scoping.test.ts` | assert key management is tenant-scoped (currently FAILS) |
| `__tests__/api/v1-rate-limit-per-key.test.ts` | assert `CompanyApiKey.rateLimit` enforced (currently not) |
| `__tests__/integration/outbound-webhook-delivery.test.ts` | assert HMAC-signed delivery to customer URL |
| `__tests__/api/v1-cross-tenant-rag.test.ts` | assert RAG retrieval cannot cross tenants |
| `__tests__/api/v1-7-role-rbac.test.ts` | assert 7 spec roles enforced (currently roles don't exist) |
| `__tests__/api/v1-service-entitlements.test.ts` | assert entitlements gate service access (currently no model) |

## CI status

- `.github/workflows/mysql.yml` — MySQL compatibility + URL validation.
- `.github/workflows/backup-portability.yml` — backup portability + secret scanning (gitleaks).
- PR #28 CI: all 3 checks green (Dependency Audit, TypeScript/tests/lint/build, Secret Scan).
- No dedicated security-test workflow; no load-test workflow; no information-leak fuzzing workflow.
