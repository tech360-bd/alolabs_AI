# Phase B2 — Governance Coverage Report

**Date:** 2026-11-25
**Branch:** `arena/56041def-alolabs-ai`
**Scope:** make the Phase B governance engine *usable and binding on real routes*: create bound approvals, consume them once, gate the consequential handlers that were still open, remove the duplicate approval implementation, and enforce temporary-agent expiry.
**Status vocabulary used throughout:** ✅ verified in this repository · 🟨 partial · ⬜ not done.

---

## 1. State before this phase

Phase B had shipped a central, code-defined policy engine with enforcement at
three execution paths (internal tools, command agent, agent runtime) and 69 tests.
It also documented its own largest hole: a `require_approval` decision was a dead
end. Nothing created a bound approval, and the tool path evaluated policy **before**
verification, so a valid approval could never satisfy the decision. Consequential
API handlers did their own local checks:

| Route | Before B2 | Consequence |
| --- | --- | --- |
| `POST /api/email/send` | session + `canManageMail` | outbound mail left the platform with no platform-level approval |
| `POST /api/social/publish` | session + `canManageSocial` | immediate **and scheduled** posts published without approval |
| `POST /api/db/restore` | `requireAuth` + `super_admin` | destructive restore had no approval, no evidence, no tenant scope |
| Temporary agents | expiry stored but never enforced | an expired agent kept `active` status, tool grants and permissions |
| Approvals | two implementations | `Approval` table + in-memory `approval-engine` `Map` (lost on restart) |

## 2. What already worked and was preserved

- `Approval` model and `/api/approvals` (tenant-scoped GET/PUT) — reused, not replaced.
- `src/lib/tools/policy.ts` deny-by-default authorisation, `ToolRun` logging.
- `approval-binding.ts` canonical-JSON digest and pure verification.
- Emergency controls and both historical key namespaces.
- `agent-factory-guard.ts` tenant/role/tool validation (unchanged this phase).
- The Phase B tests: all still pass (91 governance tests before adding the new file).

## 3. Gaps addressed

| Gap | Outcome |
| --- | --- |
| GAP-002 duplicate in-memory approval engine | ✅ deleted `src/lib/approval-engine/index.ts` (6,488 bytes); only the pure risk→action mapping `types.ts` remains for the legacy route |
| GAP-003 ungated external routes | 🟨 email send, social publish, database restore now gated; CRM writes still open; `POST /api/deploy` is a 501 stub |
| GAP-004 approval replay | ✅ single-use consumption with atomic compare-and-set |
| Approval dead end | ✅ `createBoundApproval()` on `require_approval`, plus `POST /api/governance/approvals` to request one up front |
| Temporary-agent expiry never enforced | ✅ hourly `temporary-agent-cleanup` cron, bounded and audited |

## 4. Changes made

| File | Change |
| --- | --- |
| `src/lib/governance/approvals.ts` *(new)* | Creation with SHA-256 payload binding, TTL default 60 min / cap 24 h, reviewer-role resolution, verification wrapper, single-use consumption, approver/type mapping, audit on create and consume |
| `src/lib/governance/http.ts` *(new)* | One route-level gate: verify → enforce → consume-or-create; returns a ready `NextResponse` (403 `GOVERNANCE_DENIED`, 403 `GOVERNANCE_APPROVAL_REQUIRED`, 409 `APPROVAL_CONSUMPTION_FAILED`); tenant resolution helper |
| `src/lib/governance/runtime.ts` | `verifyToolApproval` now delegates to the single implementation |
| `src/lib/governance/index.ts` | Exports the approval lifecycle |
| `src/lib/tools/execute.ts` | **Ordering fixed**: verify approval → policy (approval as evidence) → authorise → atomic consume → execute; creates a bound approval and returns its id when blocked |
| `src/lib/tools/types.ts` | `ToolExecutionResult.approvalId` |
| `src/app/api/governance/approvals/route.ts` *(new)* | `POST` bound-approval request with zod validation, known action-class check, requester-role gate |
| `src/app/api/email/send/route.ts` | `external.communicate` gate; approval bound to account, recipients, subject, attachment names and a SHA-256 of the body |
| `src/app/api/social/publish/route.ts` | `content.publish` gate; scheduled posts governed like immediate ones |
| `src/app/api/db/restore/route.ts` | `data.delete` gate with `backupTaken` + `rollbackPlan` evidence and approval; `verifyOnly` remains a safe read |
| `src/lib/multi-agent-orchestrator/agent-factory.ts` | `archiveExpiredAgents()` bounded (≤500/run), skip-on-corrupt, audited per agent |
| `src/lib/cron-jobs.ts` | Hourly `temporary-agent-cleanup` job + metric |
| `src/components/panels/emergency-panel.tsx` | Enforcement strip: live vs unverified state from `GET /api/governance/status`, suspension badge, approval expectation text |
| `src/lib/approval-engine/index.ts` | **Deleted** (unused; no imports remained) |
| Docs | Governance doc (new §7 approval lifecycle, coverage table, verification, honest gaps), roadmap, capability inventory |

## 5. Agents and departments used

None. This phase is platform engineering, not agent execution: no workforce agent
was instantiated, no temporary agent was created, and no department runtime was
invoked. The agent-factory change only affects *future* temporary agents.

## 6. Tools and providers used

- No AI provider was called; no token spend, no paid provider, no fallback.
- Local tooling only: `vitest`, `eslint`, `tsc`, `git`, `gh`.

## 7. Integrations required

None new. Email still uses the existing SMTP configuration; social still uses the
existing platform tokens; restore still uses the existing local/S3 backup clients.
Every one of those now sits behind the gate.

## 8. Files and APIs changed

- New API: `POST /api/governance/approvals`.
- Governed APIs: `POST /api/email/send`, `POST /api/social/publish`, `POST /api/db/restore`.
- Contract additions: `x-approval-id` request header (or `approvalId` in the body);
  `x-company-id` for callers who belong to more than one organisation;
  `POST /api/db/restore` now requires `confirm: { backupTaken, rollbackPlan }`.
- Deleted module: `src/lib/approval-engine/index.ts`.

## 9. Database and migration impact

**No schema change and no migration.** The phase reuses:

- `Approval.requestJson` — now carries `binding` plus `consumedAt`/`consumedBy`;
- `Approval.expiresAt`, `companyId`, `riskLevel`, `reviewedBy` — already present;
- `ToolRun` — blocked calls still recorded; `Metric` — cleanup counters.

`prisma migrate` was not run. Existing rows remain valid: an old approval without
`binding` is explicitly rejected as "legacy approval" rather than trusted.

## 10. Tests actually run

```bash
npx vitest run __tests__/unit/governance-approvals.test.ts \
  __tests__/unit/governance-runtime.test.ts \
  __tests__/unit/governance-policy-engine.test.ts \
  __tests__/unit/agent-factory-guard.test.ts \
  __tests__/unit/lib/tool-policy.test.ts \
  __tests__/unit/lib/tool-loop.test.ts \
  __tests__/unit/command-agent.test.ts \
  __tests__/api/command-agent.test.ts
```

Result: **135 passed / 8 files** (0 failed), including 22 new cases in
`governance-approvals.test.ts` covering creation, body-not-stored, TTL cap, audit
failure, reviewer-role precedence, payload tampering, cross-tenant, expiry, pending,
single-use consumption, lost compare-and-set and the HTTP gate's three outcomes.

`npx eslint` on every changed file: clean (exit 0).
`npx tsc --noEmit`: 679 errors, all the pre-existing Prisma-client cascade from the
offline sandbox (`binaries.prisma.sh` unreachable); **no new error in any added file**
and the only diagnostics in touched files are the same pre-existing implicit-`any`
callbacks caused by the untyped client. CI generates the client, so CI is the
authoritative type/build result.

## 11. Browser evidence

**None.** No browser session, no screenshot, no deployed preview was used in this
phase. The emergency-panel change is a source change verified by lint/type-check
only; it is not claimed as a verified screen. The route gates were proven by unit
tests against a database double, not by HTTP calls to a running server.

## 12. Security findings

1. **Approval dead end (serious, fixed).** Phase B evaluated policy before
   verification, so `require_approval` could never be satisfied — the documented
   "privileged tools stay blocked" was true for the wrong reason.
2. **Replay window (fixed).** The first version of the HTTP gate consumed an
   approval only when the outcome was `require_approval`; a verified approval made
   the outcome `allow`, so it was never consumed and could be replayed. Caught by
   the new replay test; consumption is now independent of outcome.
3. **Reviewer-role inversion (fixed).** `User.role` previously short-circuited
   tenant membership, so a platform `user` who was an organisation owner could not
   approve, while a platform `admin` could approve tenant publishing. Tenant role is
   now authoritative, with a `super_admin` override.
4. **Restore was under-governed (fixed).** It required `super_admin` but no approval,
   no evidence and no organisation scope. It now needs all three before writing.
5. **Temporary agents outlived their expiry (fixed).** Privilege now decays on
   schedule with an audit event per archived agent.
6. **New gap GAP-020 (open).** Mail accounts live in `Settings` under
   `email:account:<id>` and the send route does not prove the account belongs to the
   caller's organisation. The gate binds the approval to that account but not to a
   tenant-owned record. Needs an `EmailAccount`-style tenant column or a scoped
   account registry before mail is called tenant-isolated.
7. **Multi-organisation callers (mitigated).** The gate refuses to guess a tenant:
   multiple memberships without `x-company-id` is a 403, not a silent pick.

## 13. Cost

**$0.** No model call, no paid API, no cloud resource was created.

## 14. Commit and PR

- Commit: `pending` (this report is committed with the change).
- Pull request: [#60](https://github.com/tech360-bd/alolabs_AI/pull/60) (same branch,
  same PR as Phase B).

## 15. CI status

Pending on push. CI runs the generated Prisma client, so it is the authoritative
`typecheck`/`lint`/`test`/`build` verification. This section will be corrected with
the actual check results; no green status is claimed in advance.

## 16. Deployment status

**Not deployed.** No deploy was attempted or authorised; `POST /api/deploy` remains
a 501 stub. No production data, DNS, migration or infrastructure was touched.

## 17. Limitations

- Consequential **route handlers are not integration-tested**: there is no database
  or HTTP harness in this sandbox, so the proof is unit-level (gate logic) plus code
  review (handler wiring).
- **CRM writes, queue/job entry points** are still not classified; a job that calls a
  governed tool is protected by that tool, but the job itself is not.
- **Email/social account ownership** is not tenant-verified (GAP-020).
- **No UI wiring** in the email/social panels to request or display an approval; the
  flow is API + the existing approvals panel. A user who is blocked receives the
  approval id and the exact next step, but must retry manually.
- **Breaking change:** restore now requires organisation context and explicit
  `confirm` booleans. This is deliberate (destructive operation) and documented, but
  existing scripts will receive `403` until updated.
- Local type-checking is degraded by the missing Prisma client; only CI is authoritative.

## 18. Next phase

**Phase B3** (small, reviewable):

1. Tenant-scope mail/social accounts (GAP-020) so approvals bind to tenant-owned records.
2. Gate `/api/crm/*` writes and add a job-level governance context.
3. Wire approval request/retry into the email and social panels.
4. Tenant policy overrides (`GovernancePolicyOverride`, more restrictive only).

Then **Phase C — unified orchestration** per the roadmap.
