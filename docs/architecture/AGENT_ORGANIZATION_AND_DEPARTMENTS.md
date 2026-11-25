# Agent Organization and Departments

Status: current-state + target mapping · 2026-11-25

## 1. What exists

| Concept | Model / code | Notes |
| --- | --- | --- |
| Department | `Department` (`prisma/schema.prisma`), `src/lib/department-registry/` | Optional `companyId`: `null` = platform catalogue department, set = tenant-owned |
| Agent | `Agent` + `AgentVersion`, `AgentPermission`, `AgentHealth`, `AgentStatusHistory` | Rich definition: role, skills, tools, schemas, protection/approval/handoff rules, runtime profile, version |
| Workforce identity | `AIEmployeeIdentity` | Company-owned software-employee record; provisioning creates `provisioned` state only, activation needs a completed quality-checked execution |
| Instances | `AgentInstance` | A running worker instance for an agent |
| Evolution | `AgentEvolution*`, `AgentLearningCycle`, `AgentImprovementProposal`, `AgentProtectiveMode` | Self-improvement machinery, bounded by `AgentEvolutionPolicy` |
| Governance events | `AgentGovernanceEvent`, `BlockedAction` | Audit of agent-level governance decisions |
| Provisioning | `scripts/provision-workforce.ts`, `scripts/seed-100-departments.ts`, `scripts/verify-workforce-execution.ts` | Seeded from department specs, not hard-coded in application code |

There is **no 82-process hard-coded org chart**, and that is correct: departments
and agents are registry data. The specification's 82 roles are a *design
vocabulary*; the platform expresses them as agent definitions with tools, skills
and permission scopes.

## 2. Departments in the specification → capability coverage today

The table maps each requested department to what the codebase can actually do.
"Coverage" describes *agent capability*, not a claim that a named agent exists.

| Department (spec §3) | Coverage today | Evidence / blocker |
| --- | --- | --- |
| A. Executive & orchestration | **Partial** | Orchestrator, planner, delegation, QC and approval plumbing exist (`src/lib/orchestrator.ts`, `src/lib/runs/planner.ts`, `QualityAssessment`). Business-analyst / solution-architect roles are definitions, not implemented specialist logic. |
| B. Software engineering | **Missing for real work** | No repository connection, no sandbox, no diff/PR pipeline. `SEC-SHELL-001` blocks execution. Everything in this department is blocked on Phase E/F. |
| C. Browser research & intelligence | **Missing** | No browser automation or crawler. Research *skills content* exists in `src/lib/agent-skills/content/*`, but there is no execution surface. |
| D. Design & creative | **Partial** | Image generation/editing routes exist (`/api/image-studio/generate`, `src/lib/media-generation/`), brand model (`Brand`), voice/TTS (`src/lib/voice/`). Video is provider-dependent and unverified. |
| E. Marketing & growth | **Partial** | SEO helpers (`src/lib/seo/`), marketing kit, blog/content generation through the AI gateway; publishing and scheduling not certified. |
| F. Business operations | **Partial** | CRM (models + `/api/crm/*`), email (`/api/email/*`), documents (`/api/documents`), automation triggers/actions models. Helpdesk is a ticket list only. |
| G. Education & professional services | **Partial** | University models (`University*`), education routes, CV/document generation surfaces; no verified admissions workflows. |
| H. Infrastructure & security | **Partial** | Deploy/backup/DR/monitoring code exists; production deployment is gated by policy but not wired to a real deployer in this repo. |

## 3. Agent definition contract

Every agent row already carries the fields the specification asks for, or has a
model for them:

| Required attribute | Field / relation |
| --- | --- |
| Unique identity | `Agent.agentId` (`AGENT-0001`), `slug` |
| Version | `Agent.version`, `AgentVersion` |
| Department | `departmentId`, `departmentName` |
| Description / purpose | `purpose`, `systemInstructions` |
| Capabilities | `allowedSkills`, `allowedTools` |
| I/O schemas | `inputSchema`, `outputSchema` |
| Permission scope | `AgentPermission`, `AgentCompanyAccess`, `allowedTools`/`forbiddenTools` |
| Allowed models/providers | `runtimeProfile` (modelPolicy, allowedProviders) |
| Execution limits | `runtimeProfile` (budget, timeouts), `AgentResourceBudget` |
| Memory scope | `runtimeProfile.memoryProfile`, `AgentMemory` |
| Timeout / retry | `src/lib/agent-runtime/timeout.ts`, queue retry policy |
| Approval requirements | `approvalRules`, governance catalogue |
| Evaluation criteria | `qualityChecklist`, `AgentEvaluation`, `QualityAssessment` |
| Audit history | `AgentStatusHistory`, `AgentGovernanceEvent`, `AgentRun`, `ToolRun` |
| Enable/disable | `status` (`active` / `paused` / archived) |

Gap: these fields are **not validated as a coherent contract** at creation time.
A definition can declare a tool that the runtime denies (good: deny wins) but it
can also declare nonsense schemas. `validateAgentFactoryScope()` now validates the
dynamic path; a registry-level validator is planned.

## 4. Agent classes (required distinction)

| Class | Where it lives today | Governance |
| --- | --- | --- |
| Official system agents | Seeded `Agent` rows with `companyId: null` | Cannot be created by customers; only Super Admin tooling |
| Organisation agents | `Agent.companyId = <tenant>` | Owner/admin can create through the factory within tool allowlist |
| Project agents | **Planned** — no `projectId` on `Agent` | Requires schema addition + policy `PROJ-SCOPE-001` validation |
| Temporary execution agents | `AgentFactory.createAgent` → `type: 'temporary'`, `expiresAt` in `runtimeProfile` | Tenant-stamped, tool allowlisted, ≤ 24 h, audited |
| User assistants | **Planned** — conversation-scoped, no row today | Would inherit user permissions only |

Important: temporary agents persist in `Agent` with `status: 'active'` until they
expire. Nothing currently archives them automatically (`archiveAgent` exists but
no scheduler calls it). Until a cleanup job exists, the creation cap
(`MAX_TEMPORARY_AGENTS_PER_COMPANY = 25`) is what prevents accumulation.

## 5. Department selection at runtime

`src/lib/workforce/plan.ts` builds a workforce plan from department capability
metadata; `src/lib/agent-runtime/execution.ts` resolves the agent with tenant scope
and refuses inactive or unauthorised agents. Delegation depth is bounded
(`MAX_DELEGATION_DEPTH`) so an orchestrator cannot recurse without limit.

## 6. Target organisation model

1. Keep departments as data.
2. Add `projectId` (nullable) to `Agent` for project-level assistants, plus a
   policy check that a project agent cannot act outside its project.
3. Add a scheduled `archiveExpiredAgents()` job.
4. Add a registry validator that rejects definitions referencing unknown
   tools/skills at write time, not at call time.
5. Map the specification's 82 roles to a seeded catalogue of **role templates**
   (name, department, default tools, default skills) rather than 82 processes —
   then any tenant can instantiate the roles it is licensed for.

No schema change was made in this phase.
