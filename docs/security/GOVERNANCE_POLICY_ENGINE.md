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
| Approval routing (in-memory) | `src/lib/approval-engine/` | Which risk level needs review |
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
| `src/lib/governance/approval-binding.ts` | Canonical payload digests and approval verification |
| `src/lib/governance/runtime.ts` | Emergency state, audit persistence, approval lookup, agent gate |
| `src/lib/governance/index.ts` | Public surface |

### Enforced today

| Execution path | File | Gate |
| --- | --- | --- |
| Internal tool calls | `src/lib/tools/execute.ts` | `enforceGovernance()` before authorisation, plus verified-approval lookup for privileged tools |
| Command agent external tools | `src/lib/command-agent/agent.ts` | Per-call governance (previously bypassed ToolRun **and** all policy) |
| Agent execution | `src/lib/agent-runtime/execution.ts` | Gate before agent lookup, queueing or any model spend |
| Policy inspection | `GET /api/governance/policies` | Super Admin / Admin, read-only |
| Policy dry run | `POST /api/governance/evaluate` | Super Admin / Admin, never executes |
| Workspace status | `GET /api/governance/status` | Any authenticated user: is execution suspended? |

### Not yet enforced (honest gaps)

- API routes that perform their own external actions (`/api/deploy`, `/api/email/send`,
  `/api/social/*`, `/api/crm/*`) do not call the engine yet. Phase B2 work.
- Queue handlers and cron jobs (`src/lib/cron-jobs.ts`, `src/lib/job-queue.ts`)
  are not gated per job.
- The `Approval` workflow does not yet *create* bound approvals (with
  `requestJson.binding`) when a policy returns `require_approval`. Until it does,
  privileged tools stay blocked — which is the safe direction.
- Organisation/project policy overrides are not stored in the database. See §7.

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

## 7. Policy change process

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

## 8. Verification

| Test file | Cases | Proves |
| --- | --- | --- |
| `__tests__/unit/governance-policy-engine.test.ts` | 42 | Every policy outcome, precedence, evidence gates, emergency modes, degraded mode, tenant/project invariants, catalogue integrity |
| `__tests__/unit/governance-runtime.test.ts` | 18 | Both emergency key namespaces, caching, audit on deny only, degraded audit, approval binding (tenant, expiry, status, payload tampering, reviewer role, legacy approvals) |
| `__tests__/unit/lib/tool-policy.test.ts` | existing | Approval id alone still cannot authorise a privileged tool |

Run:

```bash
npx vitest run __tests__/unit/governance-policy-engine.test.ts __tests__/unit/governance-runtime.test.ts
```

There is no browser evidence for this phase: the engine is server-side. A UI
panel for the catalogue (Super Admin → Governance Policies) is **planned** and was
deliberately not shipped ahead of the enforcement it would display.

---

## 9. What this phase does *not* claim

- It does not claim every external action is governed yet (§2, "not yet enforced").
- It does not claim sandboxed code execution exists; `SEC-SHELL-001` blocks
  unsandboxed execution precisely because no verified sandbox executor is wired.
- It does not claim approval replay is impossible. The payload digest binds
  arguments, so replay cannot authorise a *different* call, but single-use
  consumption needs a persistence marker (GAP-004).
- It does not claim production verification. All evidence here is source and
  unit-test evidence from this repository.
