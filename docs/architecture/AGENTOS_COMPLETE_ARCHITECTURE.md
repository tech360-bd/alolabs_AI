# AgentOS Complete Architecture

Status: current-state description with target annotations · 2026-11-25
Supersedes nothing: `docs/ARCHITECTURE.md`, `docs/MASTER_ARCHITECTURE.md` and
`docs/architecture/UNIFIED_AI_EXECUTION_ARCHITECTURE.md` remain the deep dives for
their areas. This document is the map that ties them to the governance layer.

Every claim below is backed by a path in this repository. Anything not backed by a
path is marked **target**.

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Surfaces                                                                  │
│  public site (src/app/site)   customer dashboard (src/app/dashboard)      │
│  client portal (src/app/portal)   Super Admin panels (src/components/…)   │
├──────────────────────────────────────────────────────────────────────────┤
│ HTTP API — 509 route handlers under src/app/api/**/route.ts               │
│  auth: src/lib/api-auth.ts (requireAuth / requireCompanyAuth /             │
│        requireCompanyRole / requireRole) — server-side on every route     │
├──────────────────────────────────────────────────────────────────────────┤
│ Governance & policy — src/lib/governance/*                                │
│  emergency state · action taxonomy · policy catalogue · approval binding   │
│  decision audit  →  enforced in tools, command agent, agent execution      │
├──────────────────────────────────────────────────────────────────────────┤
│ Orchestration                                                             │
│  src/lib/orchestrator.ts · src/lib/multi-agent-orchestrator/              │
│  src/lib/runs/planner.ts · src/lib/workflow-engine/                       │
├──────────────────────────────────────────────────────────────────────────┤
│ Execution                                                                 │
│  src/lib/agent-runtime/execution.ts (AgentExecutionEngine)                │
│  src/lib/agent-runtime/tool-loop.ts · src/lib/tools/                      │
│  src/lib/job-queue.ts (durable, lease-based) · src/lib/event-bus/          │
├──────────────────────────────────────────────────────────────────────────┤
│ Intelligence                                                              │
│  src/lib/ai-router/ · src/lib/multi-tenant-ai/ (tenant gateway+policy)     │
│  src/lib/model-registry.ts · src/lib/open-source-models.ts                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Knowledge                                                                 │
│  src/lib/rag-engine.ts · src/lib/qdrant.ts · src/lib/memory/               │
│  src/lib/tenant-knowledge.ts · src/lib/context-engine.ts                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Data — prisma/schema.prisma (250 models), prisma/migrations                 │
│  MySQL mirror: prisma/schema.mysql.prisma (generated, checked in CI)      │
└──────────────────────────────────────────────────────────────────────────┘
```

## 2. Request lifecycle (text answer)

1. Route authenticates and resolves the tenant (`requireCompanyAuth`).
2. Optional governance gate (`enforceGovernance`) for consequential actions.
3. Agent is resolved **with tenant scope**: `agentCompanyScope()` in
   `src/lib/agent-access.ts` requires ownership or an executable
   `AgentCompanyAccess` grant.
4. Task classification (`classifyTask` in `src/lib/agent-runtime/pipeline.ts`).
5. Model routing (`src/lib/multi-tenant-ai/service.ts` → `ai-router`) with
   free-only/default policy, quota freshness, budget checks and fail-closed
   outcomes. Paid providers require explicit authorisation.
6. Retrieval (`hybridSearch`, `buildAgentContext`) with tenant-visible knowledge
   only (`isKnowledgeVisibleToCompany`).
7. Generation, then a bounded tool loop (`runToolLoop`) where **every** tool call
   is governed, authorised and persisted to `ToolRun`.
8. Validation (`src/lib/ai-security/validator.ts`), memory write
   (`storeExecutionMemory`), usage metering (`ModelUsageRecord`, `TokenUsage`).
9. Audit (`AuditEvent` / `AuditLog`) and events (`EventBus`).

Fail-closed routing outcomes (`NO_AUTHORIZED_MODEL`, `QUOTA_UNKNOWN_OR_EXHAUSTED`,
`EXTERNAL_DATA_NOT_AUTHORIZED`, …) are retained as deferred tasks rather than
reported as success — see `DEFERRED_ROUTING_CODES` in
`src/lib/agent-runtime/execution.ts`.

## 3. Identity, tenancy and permissions

| Concern | Implementation |
| --- | --- |
| Session | `src/lib/auth.ts`, `src/lib/session-*.ts`, `Session` model; Bearer token, mirrored cookie for SSR only |
| Roles | `User.role` (platform) + `CompanyUser.role` (tenant); `Role`, `Permission`, `RolePermission` |
| Tenant scoping | `Company`, `CompanyUser`, `CompanyDomain`, `CompanyIpAllowlist`; queries filter by `companyId` in the where-clause |
| Agent visibility | `agentCompanyScope()` (`view` / `execute`); read-only grants cannot execute |
| Knowledge visibility | `isKnowledgeVisibleToCompany()` — fail-closed parsing of metadata ownership |
| Files | `File`/`Artifact` tenant ACL + `src/lib/storage/`; see `ALO_LABS_FILE_TENANT_ACL_TEST.md` |
| Public boundary | `src/lib/access/surfaces.ts` (`isInternalRole`), plus `SEC-WEBCHAT-001` in governance |

## 4. Execution status vocabulary

`AgentRun`, `AgentExecution`, `WorkflowRun`, `AgentOSRun` and `QueueItem` use a
status string rather than an enum. The canonical meanings used by the UI:

`planned` → `queued` → `running` → `waiting_approval` → `completed` /
`partially_completed` / `failed` / `cancelled`.

Governance introduces two additional terminal reasons for a refused action:
`blocked_by_governance` and `approval_required`. Callers must not translate a
denial into "completed with no output".

## 5. Where capability actually stops today

| Area | State | Consequence |
| --- | --- | --- |
| Repository access (GitHub/GitLab) | **Missing** | No code change can be made on a customer project |
| Browser automation | **Missing** | No website analysis, no UI verification by agents |
| Sandboxed code execution | **Missing** | `SEC-SHELL-001` blocks execution by policy |
| Website/project discovery | **Models unused** | `ProjectDiscovery`, `CapabilityAssessment` exist with no code |
| Public WebChat | **Missing** | Only authenticated internal chat exists |
| Helpdesk | **Partial** | Client portal tickets, no SLA/assignment/escalation |
| Media generation | **Partial→Implemented** | Image/voice code exists; external providers unverified here |
| Governance | **Implemented (this phase)** | Enforced for tools, command agent, agent execution; route/queue coverage pending |

These are the honest boundaries. Any product statement that promises repository
edits, website redesign or automatic publishing would currently be unsupported.

## 6. Deployment topology (from repository, not verified live)

- Next.js standalone build (`npm run build` → `.next/standalone`),
  Dockerfile + `docker-compose.yml` / `docker-compose.prod.yml`.
- Optional inference compose (`docker-compose.inference.yml`).
- Caddy/nginx examples (`Caddyfile`, `nginx.conf.example`), PM2 (`ecosystem.config.js`).
- MySQL production schema and SQLite development schema share one source of truth
  (`scripts/generate-mysql-schema.ts`, `npm run verify:mysql`).
- Health endpoints: `/api/health`, `/api/health/live|ready|deep|ping`.

No deployment was performed in this phase.

## 7. Extension points (use these, do not duplicate)

| Need | Use | Do not create |
| --- | --- | --- |
| New tool | `src/lib/tools/registry.ts` + tests | a second tool executor |
| New policy | `src/lib/governance/catalog.ts` + policy test | route-local permission checks |
| New model/provider | `AIProviderConfig` + `ai-provider-catalog.ts` | a second router |
| New workflow | `Workflow` + `workflows/definitions/*.json` + lint script | a bespoke scheduler |
| New background job | `src/lib/job-queue.ts` handler registry | `setTimeout` loops |
| New memory scope | `Memory*` models + `src/lib/memory/` | ad-hoc JSON columns |
| New connector | `src/lib/integrations/` registry + `IntegrationCredential` | raw fetch with inline keys |
| New audit record | `writeAuditEvent()` | `console.log` |

## 8. Known architectural debts

1. `src/lib/approval-engine/` is an in-memory duplicate of the `Approval` table
   workflow (GAP-002).
2. Two emergency consoles with different key namespaces (now both read by
   governance; consolidation still pending).
3. `AgentFactory` originally created tenant-less agents (fixed in this phase for
   the create path; audit the clone path in review).
4. Status fields are free-form strings across execution models.
5. `docs/` contains many historical audit reports; the authoritative set is this
   file, the governance doc and the roadmap.
