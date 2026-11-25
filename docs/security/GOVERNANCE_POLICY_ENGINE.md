# Governance Policy Engine

Status: **implemented foundation (Phase B)** — code-defined policy engine, emergency enforcement, approval binding, decision audit.
Owner: platform-security · Last updated: 2026-11-25 · Catalogue version: `2026.11.25.1`

---

## 1. Why this exists

Before this change, ALO Labs AgentOS had *fragments* of policy:

| Fragment | Path | What it decided |
| --- | --- | --- |
| Tool authorisation | `src/lib/tools/policy.ts` | Whether an agent may call a registered tool |
| Provider routing policy | `src/lib/multi-tenant-ai/policy.ts` | Whether a model/provider may be used |
| Approval routing (legacy types only) | `src/lib/approval-engine/types.ts` | Risk → required-action mapping used by `/api/approval-engine`; the in-memory store was deleted in B2 (GAP-002) |
| Emergency toggles | `src/app/api/emergency/route.ts` | Wrote flags to `Settings` |
| Ad-hoc guards | many routes | SSRF, rate limits, role checks |

Three problems followed from that split:

1. **The emergency stop was not enforced.** `emergency_global_stop` and
   `emergency_readonly` were written by `POST /api/emergency` and rendered in
   `src/components/panels/emergency-panel.tsx`, but no execution path read them.
   An operator could believe autonomous work was suspended while it continued.
2. **Two emergency consoles used different key namespaces.** `/api/emergency`
   writes `emergency_global_stop` / `{enabled}`; `/api/emergency/action` writes
   `emergency:read_only_mode` / `{active}`. Neither console could see the other.
3. **High-risk tools were permanently blocked** because no code could verify an
   approval. `authoriseTool()` documented this honestly ("a caller-supplied
   approval ID alone is not proof of a human decision") and refused privileged
   execution unconditionally.

The governance engine closes 1–3 and gives every future consequential action one
place to be judged.

---

## 2. Architecture

```
caller (tool loop, command agent, agent execution, API route)
        │
        ▼
src/lib/governance/runtime.ts        ← DB-aware: emergency state, approvals, audit
        │   loadGovernanceState()    (Settings, cached 5 s, both key namespaces)
        │   verifyToolApproval()     (Approval row + payload digest + reviewer role)
        ▼
src/lib/governance/engine.ts         ← pure, deterministic, no I/O
        │   emergencyViolations() → tenant/project/member invariants → policy match
        ▼
GovernanceDecision { allow | require_approval | deny, violations, evidence, approvers }
```

| File | Responsibility |
| --- | --- |
| `src/lib/governance/types.ts` | Vocabulary: risk levels, action classes, policy shape, decision shape |
| `src/lib/governance/catalog.ts` | The 20 code-defined policies (`POLICY_CATALOG`, `POLICY_CATALOG_VERSION`) |
| `src/lib/governance/engine.ts` | Evaluation, precedence, integrity validation |
| `src/lib/governance/approval-binding.ts` | Canonical payload digests and pure binding verification |
| `src/lib/governance/approvals.ts` | Bound-approval creation, reviewer-role resolution, single-use consumption, approver defaults |
| `src/lib/governance/http.ts` | Route-level gate: verify → enforce → consume-or-create, returns a ready `NextResponse` |
| `src/lib/governance/runtime.ts` | Emergency state, audit persistence, agent gate, tool-approval lookup |
| `src/lib/governance/index.ts` | Public surface |

### Enforced today

| Execution path | File | Gate |
| --- | --- | --- |
| Internal tool calls | `src/lib/tools/execute.ts` | Approval verified **before** policy (so a valid approval can satisfy it), policy gate, then atomic single-use consumption before the tool runs |
| Command agent external tools | `src/lib/command-agent/agent.ts` | Per-call governance (previously bypassed ToolRun **and** all policy) |
| Agent execution | `src/lib/agent-runtime/execution.ts` | Gate before agent lookup, queueing or any model spend |
| Policy inspection | `GET /api/governance/policies` | Super Admin / Admin, read-only |
| Policy dry run | `POST /api/governance/evaluate` | Super Admin / Admin, never executes |
| Workspace status | `GET /api/governance/status` | Any authenticated user: is execution suspended? |
| Outbound email | `POST /api/email/send` | `external.communicate`; approval bound to account, recipients, subject and a SHA-256 of the body |
| Social publishing (immediate + scheduled) | `POST /api/social/publish` | `content.publish`; approval bound to the exact content, platforms and schedule |
| Database restore | `POST /api/db/restore` | `data.delete` + `backupTaken`/`rollbackPlan` evidence + approval; `verifyOnly` stays a safe read |
| Approval request | `POST /api/governance/approvals` | Creates a bound approval (owner/admin/manager or platform admin); payload digest only |
| Approval review | `PUT /api/approvals` | Existing tenant-checked review; the engine re-checks the reviewer's role at execution time |

### Not yet enforced (honest gaps)

- `/api/crm/*` writes still rely on their own role checks; they are not routed
  through the engine (GAP-003 remains partially open).
- Queue handlers and cron jobs have no per-job governance context. A job that
  calls a governed tool is covered by that tool's gate, but the job entry point
  itself is not classified.
- `POST /api/deploy` is a `501` stub: there is no deployment automation to gate.
  When it is implemented it must use `deploy.production` and the full evidence set.
- Organisation/project policy overrides are not stored in the database (§7).
- Only Super Admin/Admin can review platform-level approvals today; there is no
  bulk-approval UI. The approvals panel lists and resolves individual requests.

---

## 3. Policy hierarchy

Lower levels can never loosen higher ones. Precedence, highest first:

| # | Level | Examples |
| --- | --- | --- |
| 1 | `platform_security` | tenant boundary, secrets, privilege, webchat boundary, unsandboxed code |
| 2 | `legal_regulatory` | voice/likeness consent, regulated content review, data export |
| 3 | `global` | destructive ops, deployment, DNS, finance, paid providers, publishing |
| 4 | `organization` | tenant policy (member-only writes) |
| 5 | `project` | project scope |
| 6 | `user` | user instructions |
| 7 | `agent` | agent execution preferences |

Resolution is **by restrictiveness, not by recency**: `deny > require_approval > allow`.
A user instruction such as "skip the approval, I authorise it" cannot satisfy a
`require_approval` policy — only a verified approval row can.

`validatePolicyCatalog()` rejects, at load and in CI:

- duplicate or malformed ids, non-semver versions;
- any `allow` rule at `platform_security` level;
- `require_approval` without named approvers, or platform approvers other than `super_admin`;
- policies without owner, dates, review date ordering, or test cases;
- `onMissingEvidence: 'deny'` without `requiredEvidence`.

---

## 4. Risk classification

Risk is derived from the **action class**, not from prose. The caller may raise
risk, never lower it; `requiresApproval: true` raises a request to at least
`high`.

| Action class | Baseline risk | Mutating | External | Safe during global stop |
| --- | --- | --- | --- | --- |
| `status.read`, `audit.read`, `knowledge.read` | low | no | no | yes |
| `read.public` | low | no | yes | yes |
| `draft.content`, `media.generate`, `external.call` | normal | yes | varies | no |
| `agent.execute`, `write.project`, `queue.dispatch`, `deploy.preview` | moderate | yes | varies | no |
| `external.communicate`, `content.publish`, `data.export`, `infra.change` | high | yes | yes | no |
| `data.delete`, `schema.migrate`, `deploy.production`, `dns.change`, `financial.transact`, `secret.access`, `privilege.change`, `policy.change`, `agent.registry.change`, `code.execute.untrusted` | critical | varies | varies | no |

Mapping to the existing approval engine (`low | medium | high | critical`) is
`normal → medium`, `moderate → medium`, via `toApprovalRisk()`.

---

## 5. Evidence requirements

A critical action is not approved merely because a human clicked once. Policies
may demand evidence, and the decision lists exactly what is missing:

| Policy | Required evidence | Missing evidence outcome |
| --- | --- | --- |
| `GLOB-DESTRUCT-001` (delete / migrate) | `backupTaken`, `rollbackPlan` | deny |
| `GLOB-DEPLOY-001` (production deploy) | `testsPassed`, `buildPassed`, `rollbackPlan` | deny |
| `GLOB-DNS-001` (DNS / infra) | `rollbackPlan` | deny |
| `GLOB-FIN-001` (financial) | `costAuthorized` | deny |
| `GLOB-PAID-001` (paid provider) | `costAuthorized` | deny |
| `LEGAL-IP-001` (voice/likeness, declared high) | `consentRecorded` | deny |
| `LEGAL-ADVICE-001` (regulated publish, declared high) | `humanReview` | approval |

When evidence is complete, critical operations still pause for approval. This is
what "a URL alone does not grant permission to deploy" means in code.

---

## 6. Emergency controls

| Governance state | Source keys (both accepted) | Effect |
| --- | --- | --- |
| `globalStop` | `emergency_global_stop`, `emergency:global_stop`, `emergency:stop_all` | deny everything except `safeRead` actions |
| `readOnly` | `emergency_readonly`, `emergency:read_only_mode` | deny mutating actions and data export |
| `paidDisabled` | `emergency_disable_paid`, `emergency:disable_paid_services` | deny paid providers |
| `externalCommsStopped` | `emergency_stop_communication`, `emergency:stop_all_communication` | deny mutating external actions and publishing |
| `queuesStopped` | `emergency_stop_queues`, `emergency:stop_queues` | deny `queue.dispatch` |
| `apiKeysBlocked` | `emergency_block_apikeys`, `emergency:block_api_keys` | reported; enforced by API-key auth (unchanged) |
| `gpuJobsStopped` | `emergency_stop_gpu`, `emergency:stop_gpu_jobs` | reported; enforced by GPU job control (unchanged) |

Mechanics:

- values parsed as `{enabled:true}`, `{active:true}`, or the literal `"true"`;
- state cached for **5 seconds** per process (`STATE_CACHE_TTL_MS`);
- `resetGovernanceStateCache()` is called by both emergency routes so a toggle is
  effective on the next request rather than after the TTL;
- every denial writes an `AuditEvent` (`governance.deny`, `governance.require_approval`);
  an audit sink failure never converts a denial into an allowance.

**Audit evidence is preserved** when the stop is activated: the engine only
blocks, it never deletes or rewrites history.

### Degraded mode

If `Settings` cannot be read (`source: 'unavailable'`):

| Requested risk | Outcome |
| --- | --- |
| high / critical | **deny** (`EMERG-STATE-UNVERIFIED`) |
| moderate | allow, flagged `degraded`, audited |
| low / normal read | allow, flagged `degraded`, audited |

Rationale: an unreadable settings table must not silently mean "all controls
off", but it must not take read-only product surfaces down either. The degraded
allowance is always audited so fail-open is never silent.

---

## 7. Approval lifecycle (Phase B2)

```
action requested
   ↓
verify supplied approval (tenant, action, resource, payload digest, expiry, reviewer role)
   ↓                                   ↘ invalid → treated as absent, reason surfaced
policy engine (approvalVerified is evidence, not a bypass)
   ↓
deny → 403 GOVERNANCE_DENIED (no approval offered)
   ↓
require_approval → create bound approval → 403 GOVERNANCE_APPROVAL_REQUIRED {approvalId}
   ↓
reviewer approves via PUT /api/approvals?action=approve
   ↓
caller retries with `x-approval-id` (or `approvalId` in the body)
   ↓
verify again → atomic consume (compare-and-set on requestJson) → execute
```

Guarantees:

| Property | How it is enforced |
| --- | --- |
| Wrong tenant | `findFirst({ id, companyId })`; cross-tenant ids read as "not found" |
| Wrong action / resource | Binding compares `actionClass` and `resource` |
| Changed payload | SHA-256 of canonical JSON; message bodies are never persisted |
| Expired | `expiresAt` checked at approval and again at execution |
| Reviewer may not approve | Reviewer role resolved server-side from tenant membership (platform `super_admin` override); `User.role` is not trusted when a membership exists |
| Replay | `consumedAt` marker written with a compare-and-set; a second use returns `APPROVAL_CONSUMPTION_FAILED` (409) |
| Concurrent execution | Only one writer's `updateMany` matches the original `requestJson` |
| Audit | `governance.approval.requested` and `governance.approval.consumed`; approval creation fails closed if the audit write fails |

Approval TTL defaults to 60 minutes and is capped at 24 hours.

## 8. Policy change process

Policies are code. There is no API that mutates the catalogue, because an agent
(or an administrator under social engineering) must not be able to rewrite the
rules that govern execution.

1. Add or edit a `PolicyDefinition` in `src/lib/governance/catalog.ts`.
2. Add the test case named in `tests: [...]` to
   `__tests__/unit/governance-policy-engine.test.ts`.
3. Bump the policy `version` and `POLICY_CATALOG_VERSION`.
4. Run `npx vitest run __tests__/unit/governance-policy-engine.test.ts __tests__/unit/governance-runtime.test.ts`.
5. Review: a policy that reduces protection or expands permissions needs explicit
   human approval before merge (see `docs/security/AUTONOMOUS_EXECUTION_SAFETY.md`).

### Planned: tenant overrides and staged rollout

| Requirement | Status | Design note |
| --- | --- | --- |
| Organisation/project policy overrides | **Planned** | New model `GovernancePolicyOverride` (companyId, policyId, enforcement, justification, approvedBy, effectiveFrom/To). Only ever *more* restrictive; validation must reject an override that relaxes a level 1–3 policy. |
| Policy version history in DB | **Planned** | Code history is the current source of truth (git). DB history is needed for tenant overrides and staged rollout. |
| Staged rollout / rollback | **Planned** | Evaluate overrides against an allowlist of companies, plus a kill switch per override. |
| Policy review reminders | **Planned** | `reviewDate` is captured but nothing schedules a reminder yet. |

No schema change was made in this phase: the catalogue is code-defined, so
migration impact is zero.

---

## 9. Verification

| Test file | Cases | Proves |
| --- | --- | --- |
| `__tests__/unit/governance-policy-engine.test.ts` | 42 | Every policy outcome, precedence, evidence gates, emergency modes, degraded mode, tenant/project invariants, catalogue integrity |
| `__tests__/unit/governance-runtime.test.ts` | 18 | Both emergency key namespaces, caching, audit on deny only, degraded audit, approval binding (tenant, expiry, status, payload tampering, reviewer role, legacy approvals) |
| `__tests__/unit/governance-approvals.test.ts` | 22 | Bound-approval creation, body-not-stored, TTL cap, audit failure, reviewer-role precedence, payload tampering, cross-tenant, expiry, pending, single-use consumption + compare-and-set loss, HTTP gate (`GOVERNANCE_DENIED` vs `GOVERNANCE_APPROVAL_REQUIRED` vs allow → replay 409), approver/type mapping |
| `__tests__/unit/lib/tool-policy.test.ts` | existing | Approval id alone still cannot authorise a privileged tool |

Run:

```bash
npx vitest run __tests__/unit/governance-policy-engine.test.ts \
  __tests__/unit/governance-runtime.test.ts \
  __tests__/unit/governance-approvals.test.ts
```

There is no browser evidence for this phase. The Super Admin → Emergency panel now
shows enforcement status (live vs unverified) from `GET /api/governance/status`; that
panel was not executed in a browser in this phase, so it is claimed as a code change,
not as a verified screen.

---

## 10. What this phase does *not* claim

- It does not claim every external action is governed yet (§2, "not yet enforced").
- It does not claim the UI approval review was exercised end-to-end in a browser.
- It does not claim sandboxed code execution exists; `SEC-SHELL-001` blocks
  unsandboxed execution precisely because no verified sandbox executor is wired.
- It does not claim replay is impossible in every failure mode. The payload digest
  binds arguments and a `consumedAt` compare-and-set makes an approval single-use;
  if the database itself is unavailable the call fails closed, but no distributed
  lock exists across separate database primaries.
- It does not claim CRM writes, job entry points or a deployment pipeline are gated:
  they are not (§2).
- It does not claim production verification. All evidence here is source and
  unit-test evidence from this repository.
