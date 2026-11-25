# Unified Customer Workspace

Status: partial · 2026-11-25

## 1. What exists

| Surface | Path | Notes |
| --- | --- | --- |
| Public website | `src/app/site/*`, `src/app/page.tsx` | Services, solutions, pricing, projects, insights, contact, start-a-project |
| Auth | `src/app/login` | Session + rate limiting |
| Customer dashboard | `src/app/dashboard/*` | Shared shell with Super Admin panels; navigation is filtered by role |
| Client portal | `src/app/portal/*` | Client accounts, projects, support tickets, invoices, deliverables |
| Unified chat | `src/components/chat/unified-chat.tsx`, `/api/chat` | Authenticated, tenant-scoped, real gateway; no fabricated results |
| Command agent | `/api/command-agent`, `src/lib/command-agent/` | Super Admin/Admin tool loop over the same gateway |
| Brand assets | `Brand` model, `src/app/brand` | Tenant brand profile storage exists |

## 2. Navigation requested vs available

The specification lists 18 workspace destinations. Current state:

| Requested | Status | Where / blocker |
| --- | --- | --- |
| Overview | Implemented | `/dashboard`, `/api/dashboard/stats` |
| AI Workspace | Partial | Unified chat + command agent; no project-scoped workspace |
| My Projects | Partial | `Project` model + `/api/projects`; client portal shows projects, no unified project cockpit |
| Website and App Analysis | Missing | No crawler/discovery (models unused) |
| AI Coding | Missing | No repository access or sandbox |
| Agents | Partial | `/api/agents`, `/api/ai-workforce`, dashboard panels |
| Workflows | Partial | `Workflow` engine + `/api/enterprise/workflows`; no customer-facing builder |
| Integrations | Partial | `/api/integrations`, `/api/company/integrations`, connector registry |
| Image Studio | Partial | `/api/image-studio/*`; provider configuration required |
| Video Studio | Partial | `/api/video-studio`, `/api/video-hub`; unverified providers |
| Audio and Voice | Implemented | `/api/voice*`, `/api/avatar-voice`, `/api/music-studio` |
| Documents and CV | Partial | `/api/documents`; no dedicated CV editor flow verified |
| Marketing Studio | Partial | SEO/marketing libraries; no unified studio |
| Social Media | Partial | `src/lib/social/`; publishing not certified |
| Knowledge and Files | Implemented | `/api/rag*`, `/api/artifacts`, `/api/outputs`, `src/lib/storage/` |
| Helpdesk | Partial | `/portal/support` list/detail only |
| Usage and Billing | Implemented | `/api/billing`, `/api/dashboard/usage`, `UsageLog`, `TokenBudget` |
| Settings | Implemented | `/api/settings`-family, `CompanySettings`, `TenantConfig` |

The navigation must only expose destinations the plan and permissions allow. Today
role filtering exists (`src/lib/access/surfaces.ts`, dashboard nav data) but there
is no capability-flag driven menu; a link can exist for a feature whose provider is
unconfigured. That is why `docs/LINK-STATUS.md` / `verify-link-coverage.ts` exist.

## 3. Execution transparency contract

Every task surface must show, from real records:

| Field | Source of truth |
| --- | --- |
| Current task / steps | `Task`, `TaskStep`, `AgentOSRun`, `RunEvent` |
| Assigned specialists | `AgentRun.agentId`, `AgentExecution` |
| Completed steps | status transitions in `AgentExecution` / `WorkflowRun` |
| Pending approvals | `Approval` (status `pending`) |
| Errors and blockers | `TaskError`, `ErrorLog`, governance decision |
| Generated files | `Artifact`, `Output`, `File` |
| Usage and cost | `TokenUsage`, `ModelUsageRecord`, `UsageLog`, `CompanyUsageSummary` |

Rules:

- No optimistic progress. A step is `running` only when a worker claimed it.
- A governance denial is surfaced as `blocked_by_governance` with the policy id and
  the explanation from `GovernanceDecision`, not as a generic error.
- A tool result of "blocked" is shown as blocked, never as empty success.

## 4. Governance touchpoints in the workspace

| Action | Governance class | Outcome |
| --- | --- | --- |
| Chat / read knowledge | `knowledge.read` | allowed, survives global stop |
| Run an agent | `agent.execute` | blocked by global stop / read-only |
| Create a temporary specialist | `write.project` | blocked by stop, tenant-checked |
| Publish content | `content.publish` | requires approval |
| Export data | `data.export` | requires approval |
| Deploy | `deploy.production` | requires evidence + approval |
| See why work is suspended | `GET /api/governance/status` | available to every authenticated user |

## 5. Gaps that block "one workspace" claims

1. No project cockpit that aggregates runs, artifacts, approvals and cost per project.
2. No website/repository discovery, so the workspace cannot start from a customer URL.
3. Media/video/social studios depend on providers that are not certified.
4. No public webchat widget (see `docs/security/PUBLIC_WEBCHAT_SECURITY_BOUNDARIES.md`).
5. Helpdesk lacks assignment, SLA and escalation.

## 6. Next increments (ordered)

1. Project cockpit page backed by existing models (no schema change).
2. Governance status banner (uses `/api/governance/status`) — cheap trust win.
3. Capability flags on navigation entries (`FeatureFlag` / `Entitlement`) so an
   unconfigured studio is not advertised as operational.
4. Public webchat with a restricted agent profile.
5. Repository connection (Phase E) before advertising coding capabilities.
