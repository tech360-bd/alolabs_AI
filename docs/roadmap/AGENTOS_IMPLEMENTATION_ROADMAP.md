# AgentOS Implementation Roadmap

Last updated: 2026-11-25 · Baseline: `main` @ `51d20f9` · Current phase: **B (foundation shipped)**

The roadmap is ordered by **risk reduction per unit of work**, not by feature
attractiveness. Enabling autonomous external action before isolation and governance
are enforced would be the single worst sequencing mistake available.

Legend for status: ✅ done · 🟨 in progress · ⬜ not started · ⛔ blocked by a prerequisite.

---

## Phase A — Discovery and architecture ✅ (this session)

| Deliverable | Status |
| --- | --- |
| Capability inventory with status, paths, tests | ✅ `docs/audits/AGENTOS_CAPABILITY_INVENTORY_2026-11-25.md` |
| Architecture map | ✅ `docs/architecture/AGENTOS_COMPLETE_ARCHITECTURE.md` |
| Governance gap analysis | ✅ `docs/security/GOVERNANCE_POLICY_ENGINE.md` §1, inventory §7 |
| Tenant/permission model review | ✅ `docs/security/TENANT_ISOLATION_AND_PERMISSION_MODEL.md` |
| Data/API review of the 30 conceptual models | ✅ roadmap §"Data model decisions" |

Findings that shaped everything below: emergency stop unenforced; two emergency key
namespaces; approvals unverifiable; agent factory tenant-less and over-permissive;
no repository/browser/sandbox/public-chat capability.

## Phase B — Governance foundation 🟨

| Work item | Status | Evidence |
| --- | --- | --- |
| Central policy engine (code-defined, versioned) | ✅ | `src/lib/governance/{types,catalog,engine}.ts`, 42 tests |
| Risk taxonomy + escalation | ✅ | `types.ts` `ACTION_CLASSES`, engine tests |
| Emergency enforcement (both namespaces, cache invalidation) | ✅ | `runtime.ts`, 18 tests |
| Approval binding (tenant, payload, expiry, reviewer role) | ✅ | `approval-binding.ts`, 9 approval tests |
| Decision audit | ✅ | `runtime.ts` → `writeAuditEvent`; audited denials and degraded allowances |
| Dynamic-agent hardening (tenant stamping, tool allowlist, role gate) | ✅ | `agent-factory-guard.ts`, route, 9 tests |
| Governance API (catalogue, dry run, status) | ✅ | `/api/governance/{policies,evaluate,status}` |
| **B2**: gate remaining external-action routes (deploy, email, social, CRM writes) | ⬜ | Plan: add `enforceGovernance` at each handler with the right action class |
| **B2**: gate queue handlers and cron jobs | ⬜ | Add a `GovernanceJobContext` to the job registry |
| **B2**: create bound approvals when a decision is `require_approval` | ⬜ | Write `Approval.requestJson.binding`; add a UI approval card |
| **B2**: consolidate `approval-engine/` into the `Approval` table | ⬜ | Remove the in-memory duplicate (GAP-002) |
| **B3**: tenant policy overrides + staged rollout | ⬜ | Needs `GovernancePolicyOverride` model (more restrictive only) |
| **B3**: single-use approval consumption | ⬜ | Persist a consumption marker (GAP-004) |
| **B3**: archive expired temporary agents | ⬜ | Scheduled job using `expiresAt` |
| **B3**: delete redundant emergency route or map it to canonical keys | ⬜ | One console, one namespace |

Exit criteria for Phase B: every route that can send, publish, deploy, delete,
change privileges or spend money calls the engine; a test proves each one denies
without approval.

## Phase C — Unified orchestration ⬜

- Capability diff (registry vs requirement) with an explicit "missing specialist"
  result; no invention.
- Project-aware memory and run state (project cockpit).
- Handoff contracts between agents with typed artifacts.
- Execution tracing UI from real `RunEvent` rows.
- Retry/failure recovery surfaced as `partially_completed`, never as success.

Prerequisite: B2 complete. Estimated 2–3 focused PRs.

## Phase D — Browser and research ⛔→⬜

Blocked on: an isolated browser worker service (not an in-process Playwright).

- Tier-1 SSRF-guarded fetch with robots policy and budgets.
- Tier-2 browser worker: rendered DOM, console, screenshots; sanitised artifacts.
- `ResearchSource` / `ResearchFinding` with confidence, verifiedAt, expiresAt.
- Untrusted-content rule test: a page cannot change a governance decision.
- Citation requirement in every research answer.

## Phase E — Customer project connections ⛔→⬜

Order matters:

1. `ProjectRepository` model + GitHub App OAuth + encrypted tokens + revocation.
2. Read-only source analysis (framework, routes, schema, tests, env **names**).
3. Website intake using Phase D tier-1/2 (public analysis only).
4. `ProjectDiscovery` / `CapabilityAssessment` code (models exist, unused).
5. Per-project preview environments.

Exit criteria: no repository write is possible without a repository binding; a
revoked token fails closed; a URL alone can never deploy.

## Phase F — Autonomous software engineering ⛔→⬜

Blocked on: E (repository access) and a sandbox runner.

- Sandbox with CPU/mem/time/disk limits, default-deny egress, no host mounts.
- `VerificationResult` capture for lint/typecheck/test/build.
- Diff generation, PR creation, CI polling.
- `deploy.production` flow requiring evidence + approval (`GLOB-DEPLOY-001`).
- Policy amendment for `code.execute.untrusted` **only after** sandbox verification
  exists and is tested; the amendment itself needs approval.

## Phase G — Business and creative workspace ⬜

- Brand profile extension (tone, messaging, restrictions).
- CV/document studio with templates and real export.
- Media studios surfacing provider capability state (available/needs account).
- Campaign orchestration state machine (draft → review → approved → scheduled →
  confirmed/failed) with provider confirmation ids.
- Public WebChat (restricted agent + `SEC-WEBCHAT-001` surface) — can be pulled
  forward if trust work is prioritised; it is small and self-contained.

## Phase H — Connector marketplace ⬜

- Generic OAuth broker (state+PKCE, scope diff, refresh single-flight, revoke).
- Connector state vocabulary (`available` … `requires_paid_account`) replacing the
  free-form `IntegrationCredential.status`.
- Scheduled health checks; usage metering per connector.
- Marketplace listing with licence/terms and audit requirements.

## Phase I — Helpdesk and customer operations ⬜

- Reconcile ticket models; add messages with internal/public visibility.
- Assignment, SLA, escalation, CSAT.
- AI triage and approval-driven reply; never fabricate resolution.
- Support-role scoping to assigned records (GAP-017).

## Phase J — Production verification ⬜

Requires a real staging environment with credentials — not available in this
session. Matrix:

| Area | Test |
| --- | --- |
| Tenant isolation | Two-tenant seeded E2E, including cross-tenant attack attempts |
| Permissions | Role matrix per route (automated) |
| Governance | Emergency stop during a live run; decision audit completeness |
| Approval | Approve/reject/expire/tamper/replay attempts |
| Provider failover | Free provider unavailable → honest limitation, no silent paid |
| Billing/quota | Quota exhaustion pauses work and explains options |
| Browser E2E | Public + authenticated flows on preview |
| Performance | Load test of chat + agent execution |
| Deployment/rollback | Deploy, verify, roll back, verify |

---

## Data model decisions (spec §22)

The specification lists 30 conceptual models. None exist under those names; most
have equivalents. **Do not create parallel models without a migration plan.**

| Concept | Existing equivalent | Decision |
| --- | --- | --- |
| AgentDefinition / AgentVersion | `Agent` / `AgentVersion` | Reuse; add validation |
| AgentExecution | `AgentExecution`, `AgentRun`, `AgentOSRun` | Reuse `AgentExecution` for execution, `AgentRun` for runs; do not add a fourth |
| AgentPermission | `AgentPermission`, `AgentCompanyAccess`, `allowedTools` | Reuse |
| Organization / OrganizationMember | `Company` / `CompanyUser` | Reuse (naming difference only) |
| Project / ProjectResource | `Project`, `ClientProject`, `ProjectUpload` | Reuse; add `ProjectRepository` (new, needed) |
| ProjectConversation | `Conversation` (+ `companyId`) | Reuse with projectId column if needed |
| ProjectMemory | `AgentMemory`, `CompanyMemory`, `DepartmentMemory`, `MemoryLongTerm` | Reuse; add scope column if a project scope is required |
| Task / TaskStep | `Task` / `TaskStep` | Reuse |
| Workflow / WorkflowRun | `Workflow` / `WorkflowRun` | Reuse |
| Connector | `IntegrationCredential` + registry | Reuse; add state vocabulary |
| ConnectorCredential | `IntegrationCredential.encryptedSecret` | Reuse |
| ToolPermission | `AgentPermission`, tool allow/forbid lists, governance | Reuse |
| Approval | `Approval` | Reuse; add binding + consumption marker |
| Policy / PolicyVersion | Code catalogue (`src/lib/governance`) | Code for now; DB only for tenant overrides |
| AuditEvent | `AuditEvent`, `AuditLog`, `SecurityEvent` | Reuse `AuditEvent` |
| BrowserSession | **none** | New (Phase D) |
| ResearchSource | **none** | New (Phase D) |
| Artifact | `Artifact`, `Output`, `File` | Reuse |
| UsageRecord | `UsageLog`, `TokenUsage`, `ModelUsageRecord` | Reuse |
| SupportTicket / SupportMessage | `ClientSupportTicket` (+ new message) | Extend, do not duplicate |
| BrandProfile | `Brand` | Extend columns |
| MediaAsset | `Artifact` + media job metadata | Reuse; add provenance columns if needed |
| PublishingJob | **none** | New (Phase G) |
| Quota | `TokenBudget`, `CompanyBudget`, `AgentResourceBudget` | Reuse |

Every new model requires: purpose, ownership, tenant scope, relationships,
authorization, validation, indexes, retention, migration impact, tests.

---

## Sequencing summary

```
B2 governance coverage ──► C orchestration polish
        │
        ├──► G public webchat (small, independent, trust win)
        │
        └──► D browser ──► E repository ──► F coding ──► J production verification
                                   │
                                   └──► H connectors (parallel after E auth patterns)
G business studios / I helpdesk can proceed in parallel if they do not claim
repository or publishing capability they do not have.
```

## Definition of done (every phase)

1. Code + tests + docs updated in the same PR.
2. No capability advertised before it is verified.
3. Security review for any new permission or external action.
4. Migration with backup + rollback instructions, or explicitly no schema change.
5. Execution report with evidence (see `docs/releases/PHASE_B_GOVERNANCE_FOUNDATION_REPORT.md`
   for the template).
