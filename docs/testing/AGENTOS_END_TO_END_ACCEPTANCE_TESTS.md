# AgentOS End-to-End Acceptance Tests

Last updated: 2026-11-25

These are the specification's nine real-world scenarios, mapped to what this
repository can actually execute today. A scenario is only "passing" when every
step has recorded evidence; "blocked" means a prerequisite capability does not
exist and **no claim of support may be made**.

Evidence types: `unit` (vitest), `e2e` (browser/HTTP against a running environment),
`manual` (operator with an authorised test account), `record` (audit/DB row).

---

## Scenario 1 — Existing website repair

| Step | Prerequisite | Status today |
| --- | --- | --- |
| Accept a URL and analyse public pages | Phase D tier-1/2 | ⛔ blocked (no crawler) |
| Identify defects and produce a plan | Phase C/D | ⛔ blocked |
| Connect an authorised repository | Phase E GitHub App | ⛔ blocked |
| Generate an architecture map | Phase E | ⛔ blocked |
| Implement changes on a feature branch | Phase F sandbox | ⛔ blocked |
| Run tests + browser verification | Phase F | ⛔ blocked |
| Preview + PR | Phase F | ⛔ blocked |
| Deployment requires authorisation | Governance `GLOB-DEPLOY-001` | ✅ policy proven by unit test (`deploy-requires-evidence`, `deploy-with-evidence-needs-approval`) |

Expected end state: no step may report success without the listed evidence.

## Scenario 2 — Missing specialist agent

| Step | Implementation | Status |
| --- | --- | --- |
| Orchestrator identifies a missing capability | capability diff | ⬜ planned (Phase C) |
| Search existing agents/skills/tools | `/api/agent-capabilities`, `/api/agents` | ✅ available |
| Create a temporary/project specialist | agent factory | ✅ temporary only; project agents ⬜ |
| Permission checks | `validateAgentFactoryScope()` | ✅ unit-tested (9 cases) |
| Persistent global agent requires Super Admin | `SEC-POLICY-001` | ✅ unit-tested |
| Test capability, complete or report blocker | — | ⬜ |

Automated coverage: `__tests__/unit/agent-factory-guard.test.ts`,
`__tests__/unit/governance-policy-engine.test.ts` (`policy-change-requires-super-admin`).

## Scenario 3 — Marketing campaign

| Step | Status |
| --- | --- |
| Research | ⛔ blocked (Phase D) |
| Strategy + copy | ✅ generation available; quality not acceptance-tested |
| Image assets | 🧪 provider-dependent (`/api/image-studio/generate`) |
| Video assets | 🧪 provider-dependent, unverified |
| Platform-specific captions | ✅ generation |
| Brand review | 🟨 `Brand` model lacks tone/messaging |
| Approval | ✅ `GLOB-COMMS-001` policy tests |
| Publishing with confirmation | ⛔ not certified; must record provider confirmation id |
| Performance report | ⛔ requires analytics connector |

Rule: a campaign is `draft` until approval; `published` only with a provider
confirmation id; otherwise `scheduled_unconfirmed` / `failed`.

## Scenario 4 — Cross-platform customer isolation

| Attempt | Expected | Status |
| --- | --- | --- |
| Read another tenant's project | 404, no data, audit | ✅ engine unit test; ⬜ live E2E |
| Read another tenant's memory | denied | 🟨 query scoping; no E2E |
| Use another tenant's agent | denied | ✅ `agentCompanyScope` + shared-grant rules |
| Open another tenant's repository | impossible today | ⛔ capability absent |
| Reuse another tenant's approval | denied | ✅ `verifyToolApproval` tenant test |
| Cross-tenant on public surface | denied | ✅ `SEC-WEBCHAT-001` + `SEC-TENANT-001` |

Automated: `governance-policy-engine.test.ts` (`tenant-boundary-deny`),
`governance-runtime.test.ts` (approval tenant mismatch),
`__tests__/api/f6-webhook-delivery-tenant-isolation.test.ts` (existing).
Missing: a seeded two-tenant HTTP E2E suite.

## Scenario 5 — Public WebChat attack attempt

Blocked today because **no public WebChat exists** (internal chat requires auth).

| Attempt | Expected | Status |
| --- | --- | --- |
| Reveal internal prompts/agents | refusal, no data | ⛔ surface missing; engine boundary ✅ |
| Reveal credentials | refusal | ✅ `SEC-SECRET-001` test |
| Reach Super Admin tools | refusal | ✅ `SEC-WEBCHAT-001` test |
| Direct call to internal chat API | 401 | ✅ auth |

Do not mark this scenario passing until the public endpoint exists and has its own
tests.

## Scenario 6 — Unknown technical problem

| Step | Status |
| --- | --- |
| Research official docs with citations | ⛔ no browser/research subsystem |
| Version/licence verification | ⬜ planned data model (`ResearchFinding`) |
| Sandbox proof of concept | ⛔ no sandbox |
| Record sources and limitations | ⬜ |
| Ask for help when evidence is insufficient | 🟨 must be enforced in prompt + UX |

Today the honest behaviour is: answer from tenant/platform knowledge, state
uncertainty, and do not invent references.

## Scenario 7 — Dangerous operation (delete production database)

Automated, passing at the policy level:

```bash
npx vitest run __tests__/unit/governance-policy-engine.test.ts
# destructive-missing-backup-deny      → deny without backup/rollback
# destructive-requires-backup          → approval even with evidence
# privilege-change-requires-super-admin
```

| Step | Status |
| --- | --- |
| Risk classified critical | ✅ (`data.delete` baseline) |
| Authorisation + policy check | ✅ |
| Blocked pending approval | ✅ |
| Backup + rollback verified | ✅ evidence gate |
| Audited | ✅ `governance.deny` audit test |
| Unauthorised user cannot bypass | ✅ approver role + approval binding |

Remaining: the actual destructive route must call the engine (B2), and an
`Approval` must be creatable with a binding (B2).

## Scenario 8 — Paid-provider fallback

| Step | Status |
| --- | --- |
| Free provider unavailable → try other eligible free providers | ✅ `orderEligibleCandidates` + failover tests |
| Never silently use paid | ✅ routing policy + `GLOB-PAID-001` tests |
| Pause and explain if no authorised option | ✅ deferred routing codes (`NO_AUTHORIZED_MODEL`, `QUOTA_UNKNOWN_OR_EXHAUSTED`) |
| Emergency paid disable | ✅ `EMERG-PAID-DISABLED` test |

## Scenario 9 — Connector revocation

| Step | Status |
| --- | --- |
| Revoke/invalidate tokens | 🟨 `IntegrationCredential` supports delete; provider revoke ⬜ |
| Future actions fail safely | 🟨 connector call sites must treat missing credential as unavailable |
| Audit records remain | ✅ append-only `AuditEvent` |
| Reconnect through a fresh authorisation flow | ⛔ OAuth broker missing |

Automated coverage today: none. Add `__tests__/api/connector-revocation.test.ts`
with the OAuth broker in Phase H.

---

## Cross-cutting suites to run on every PR

```bash
npx vitest run \
  __tests__/unit/governance-policy-engine.test.ts \
  __tests__/unit/governance-runtime.test.ts \
  __tests__/unit/agent-factory-guard.test.ts \
  __tests__/unit/lib/tool-policy.test.ts \
  __tests__/unit/lib/tool-loop.test.ts
```

Full suite (requires a generated Prisma client, a built `better-sqlite3` binding
and, for integration tests, a real database):

```bash
npm run db:generate
npx vitest run
```

Environment note (2026-11-25, this sandbox): `npx prisma generate` cannot reach
`binaries.prisma.sh`, and dependencies were installed with `--ignore-scripts`, so
28 files fail at import/binding time. Product-logic tests: 2,101 passing / 8
failing, all 8 in those environment-bound files.

## Rules for writing new acceptance tests

1. Test accounts are isolated test tenants; never use customer data.
2. Every external action test asserts either a provider confirmation id or an
   explicit refusal — never an assumed success.
3. Browser tests capture console and network evidence, not only screenshots.
4. A test that cannot run in CI must be labelled and tracked, not silently skipped.
5. Never weaken a governance test to make a feature pass.
