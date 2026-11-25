# ALO Labs AgentOS — Capability Inventory (Phase A discovery)

Date: 2026-11-25 · Branch: `arena/56041def-alolabs-ai` (from `main` @ `51d20f9`)
Method: repository inspection only. **No production, staging or customer
environment was accessed from this session**, so no capability is marked
`Verified Live`. Test evidence comes from `npx vitest run` in this checkout.

Status legend

| Status | Meaning |
| --- | --- |
| **Verified Live** | Proven to work in the deployed environment (requires runtime evidence this session could not collect) |
| **Implemented** | Exists in source with tests; production behaviour not re-verified here |
| **Partial** | Some functions work, others are missing or only in-memory |
| **Planned** | Documented or modelled, not implemented |
| **Missing** | No implementation found |
| **Broken** | Existing functionality fails verification |

Repository scale at audit time: **250 Prisma models**, **509 API routes**
(`src/app/api/**/route.ts`), **1,299 source files** under `src/`, **221 test
files**, `npx vitest run` → 2,101 passed / 8 failed / 113 skipped. All 8 failures
are environment-bound (missing generated Prisma client and a missing native
SQLite binding in this sandbox), not assertion failures in product logic — see
§6.

---

## 1. Executive and orchestration

| Capability | Status | Evidence (source → route → model → test) |
| --- | --- | --- |
| Agent execution engine | Implemented | `src/lib/agent-runtime/execution.ts` (`class AgentExecutionEngine`, `execute`, `delegate`, `runTask`), `tool-loop.ts`; API `/api/agents/run`-family; models `AgentRun`, `AgentExecution`; `__tests__/unit/lib/tool-loop.test.ts`, `__tests__/unit/agentos-runs-pipeline.test.ts` |
| Orchestrator / task delegation | Implemented | `src/lib/orchestrator.ts`, `src/lib/multi-agent-orchestrator/`; `/api/enterprise/orchestrator*`; `AgentCommunication`, `AgentLineage`; `__tests__/unit/agentos-planner.test.ts` |
| Planning (deterministic + LLM) | Implemented | `src/lib/runs/planner.ts`; `AgentOSRun`, `RunEvent`; pipeline test above |
| Governance decision layer | **Implemented (new in this phase)** | `src/lib/governance/*`; `/api/governance/policies`, `/api/governance/evaluate`, `/api/governance/status`; `__tests__/unit/governance-policy-engine.test.ts` (42), `governance-runtime.test.ts` (18) |
| Department registry / AI workforce | Implemented | `src/lib/department-registry/`, `src/lib/workforce/`, `src/lib/ai-workforce/`; `Department`, `AIEmployeeIdentity`; provisioning + activation scripts (`scripts/provision-workforce.ts`, `scripts/activate-workforce.ts`); `__tests__/integration/workforce-provisioning.test.ts` |
| Fixed 82-agent org chart from the specification | Outside source-of-truth | The repo seeds department-based agents (`scripts/seed-100-departments.ts`, `AGENT-000x` identities) rather than the document's numbered list. Roles exist as configurable registry data, not as 82 hard-coded processes — which matches the specification's intent, but the two lists are not mapped 1:1 anywhere. |

## 2. Models, routing and free-first resources

| Capability | Status | Evidence |
| --- | --- | --- |
| AIRouter + provider registry | Implemented | `src/lib/ai-router/`, `src/lib/multi-tenant-ai/`, `src/lib/ai-provider-catalog.ts`; models `AIProviderConfig`, `ModelRegistry`, `ModelRoutingDecision`, `AIProviderVerification`, `ProviderQuotaSnapshot`; routes `/api/models`, `/api/llm`, `/api/model-hub`; `__tests__/unit/ai-router-free-routing.test.ts` |
| Verified-free-only routing, no silent paid fallback | Implemented | `src/lib/multi-tenant-ai/policy.ts` (`isFreeTierVerified`, `assessCandidate`, `orderEligibleCandidates`); `/api/ai-router` admin config; `__tests__/unit/ai-router-free-only-mode.test.ts`; `docs/AGENTOS_AI_PROVIDER_OPERATIONS.md` |
| Paid-provider authorisation gate | **Implemented (new)** | `GLOB-PAID-001` in `src/lib/governance/catalog.ts` + tests |
| Provider health, quotas, failover | Implemented | `src/lib/model-registry.ts`, `ModelHealth`, `ProviderQuotaSnapshot`; `scripts/verify-inference.ts`; `__tests__/unit/ai-provider-timeout-failover.test.ts` |
| Local inference (Ollama etc.) | Partial | `docker-compose.inference.yml`, `src/app/api/gpu-monitor`; requires operator-provisioned inference host — not verifiable here |

## 3. Tools, skills, workflows, jobs

| Capability | Status | Evidence |
| --- | --- | --- |
| Tool registry | Implemented | `src/lib/tools/` — 5 tools (`search_knowledge`, `crm_lookup_contact`, `crm_pipeline_summary`, `department_directory`, `calculate`), all read-only, deny-by-default authorisation; `__tests__/unit/lib/tool-policy.test.ts`, `tools-registry.test.ts` |
| Tool governance + audit | Implemented | `src/lib/tools/execute.ts` → `enforceGovernance()`; every call persisted to `ToolRun` (blocked calls included) |
| Approval binding for privileged tools | Implemented | `src/lib/governance/approval-binding.ts`, `verifyToolApproval()`; tests cover tenant, expiry, status, payload tamper, reviewer role, legacy approvals |
| Skill registry | Implemented | `Skill`, `SkillVersion`, `SkillPermission`, `SkillValidationLog`; `src/lib/agent-skills/` (generated catalogue + guard); `scripts/sync-agent-skills.mjs`, `verify-agent-skills.mjs`; `docs/AI_SKILLS_LIBRARY.md` |
| Workflow engine | Implemented | `src/lib/workflow-engine/index.ts`; `Workflow`, `WorkflowStep`, `WorkflowRun`; 9 JSON definitions in `workflows/definitions`; canonicalisation + lint scripts; `docs/WORKFLOW_DEFINITIONS_CHECK.md` |
| Durable job queue | Implemented | `src/lib/job-queue.ts` (atomic claim, lease reclaim, backoff, idempotency); `JobQueue`, `QueueItem`; `__tests__/integration/job-queue-durability.test.ts` (fails here: native SQLite binding absent) |
| Event bus | Implemented | `src/lib/event-bus/`; `EnterpriseEvent` |
| Cron / scheduled jobs | Partial | `src/lib/cron-jobs.ts`, `/api/cron`; no per-job governance gate yet |

## 4. Memory, knowledge and RAG

| Capability | Status | Evidence |
| --- | --- | --- |
| Scoped memory | Implemented | `AgentMemory`, `DepartmentMemory`, `CompanyMemory`, `MemoryShortTerm`, `MemoryLongTerm`, `MemoryStaticRule`; `src/lib/memory/`; `docs/MEMORY_ARCHITECTURE.md` |
| RAG (chunk, embed, answer, feedback) | Implemented | `src/lib/rag-engine.ts`, `src/lib/qdrant.ts`; `RagCollection`, `RagDocument`, `RagChunk`, `RagQuery`, `RagAnswer`, `RagFeedback`; `/api/rag*` |
| Tenant visibility of knowledge | Implemented | `src/lib/tenant-knowledge.ts` (fail-closed `isKnowledgeVisibleToCompany`); `CompanyKnowledgeDocument` |
| Memory scope enforcement inside governance | Partial | Governance blocks cross-tenant and public-surface access, but memory reads are not yet routed through a per-scope policy check |

## 5. Business, media and customer-facing surfaces

| Capability | Status | Evidence |
| --- | --- | --- |
| Multi-tenant orgs, membership, roles | Implemented | `Company`, `CompanyUser`, `CompanyRole`, `CompanyPermission`, `CompanyDomain`, `CompanyIpAllowlist`, `TenantConfig`; `src/lib/api-auth.ts`, `src/lib/agent-access.ts`; `__tests__/api/f2-scope-authorization.test.ts` (env-failing) |
| Authentication, sessions, MFA, rate limits | Implemented | `src/lib/auth.ts`, `src/lib/session-*.ts`, `src/lib/security/rate-limiter.ts`; `/api/auth/*`; `__tests__/api/auth-*.test.ts` |
| Projects and artifacts | Implemented | `Project`, `Artifact`, `ProjectUpload`, `File`; `src/lib/projects/index.ts`, `src/lib/artifacts/`; `/api/artifacts`, `/api/outputs` |
| CRM | Implemented | `CrmContact`, `CrmDeal`, `CrmPipeline*`, `CrmActivity`, `CrmNote`, `CrmLeadScore`; `/api/crm/*`; `src/lib/integrations/connectors/crm/`; `tests/browser/crm-panel.test.mjs` |
| Helpdesk / support tickets | Partial | `ClientSupportTicket`, `/portal/support` pages exist for client accounts; no ticket queue, SLA, agent assignment or escalation workflow found in source. See `docs/product/HELPDESK_AND_CUSTOMER_SUPPORT.md` |
| Public WebChat widget | **Missing** | `/api/chat` requires `requireCompanyAuth()` and serves the internal unified chat (`src/components/chat/unified-chat.tsx`). No public, unauthenticated chat widget or public-safe agent exists. Boundary policy `SEC-WEBCHAT-001` is ready for when it is built |
| Super Admin command centre | Partial | `/dashboard` + `src/components/panels/*`, `/api/command-agent` (real tool loop over `executeCompanyAIChat`); `docs/architecture/SUPER_ADMIN_AI_COMMAND_CENTER.md` describes the target. Streaming UI, per-project repo selection and approval panel are not complete |
| Image generation / editing | Implemented | `src/lib/media-generation/`, `/api/image-studio/generate`, `Image`-related provider config; `MediaAsset`-style storage in `Artifact`; `docs/MEDIA_GENERATION.md` |
| Video generation / editing | Partial | `/api/video-studio`, `/api/video-hub`; depends on external provider configuration that is not verified here |
| Audio / voice / TTS / ASR | Implemented | `src/lib/voice/`, `/api/voice*`, `/api/avatar-voice`, `/api/music-studio`; `TtsJob`, `AsrJob`, `VoiceConsent`, `CallSession`; `docs/BANGLA_SPEECH_ENGINE.md` |
| Social publishing | Partial | `src/lib/social/`, `docs/SOCIAL-INTEGRATION-GUIDE.md`; no channel connector is certified in this environment, so publishing cannot be claimed operational |
| SEO / blog / marketing workflows | Partial | `src/lib/seo/`, `src/lib/marketing-kit/`, workflow definitions for `digital-marketing`; generation exists, publish/schedule does not |
| Website analysis of a customer URL | **Missing** | Model `ProjectDiscovery` / `CapabilityAssessment` exist in `prisma/schema.prisma` with **no code references**. No crawler, audit or browser-based analysis is implemented |
| Browser automation / research agent | **Missing** | No Playwright/Puppeteer dependency in the application (`tests/browser/package.json` has Playwright for regression tests only). No agent-controlled browser session, no `BrowserSession` usage |
| GitHub / GitLab repository connection | **Missing** | No GitHub/GitLab OAuth, app, client or webhook code in `src/`. Only documentation and skill *content* mentions |
| Autonomous coding engine (branch, diff, PR, CI) | **Missing** | No repository checkout, sandbox executor, diff or PR code found. `SEC-SHELL-001` blocks unsandboxed execution by design |
| Connector marketplace | Partial | `src/lib/integrations/` registry + `IntegrationCredential`, `/api/integrations`, `/api/marketplace`; connector families cover content/CRM/media/messaging. No OAuth broker, revocation audit or health dashboard verified |
| Billing, quotas, usage metering | Implemented | `Subscription`, `SubscriptionPlan`, `Invoice`, `Payment`, `UsageLog`, `TokenBudget`, `CompanyBudget`, `ModelUsageRecord`; `/api/billing`, `/api/dashboard/usage`; `docs/FREE_TIER_OPERATIONS.md` |
| Approvals (persisted) | Implemented | `Approval` model, `/api/approvals` (GET/PUT with tenant + role checks), `resolveRunApproval` resumption; bound approvals are created by `src/lib/governance/approvals.ts`; the in-memory duplicate was deleted (GAP-002) |
| Audit trail | Implemented | `AuditEvent`, `AuditLog`, `SecurityEvent`, `BlockedAction`, `PaymentGuardLog`; `src/lib/audit-events.ts` (redacting, append-only) |
| Emergency stop | **Broken before this phase, now Implemented** | Flags were written but never enforced; two consoles used different key namespaces. Now read by `src/lib/governance/runtime.ts` and enforced in tool, command-agent and agent-execution paths |
| Backups / restore / DR | Implemented | `src/lib/backups/`, `BackupRecord`, `RecoveryRun`, `DisasterRecoveryConfig`; `scripts/backup.sh`, `restore.sh`, `rollback.sh`; integration tests (env-failing here) |
| Observability / metrics | Implemented | `Metric`, `HealthCheck`, `ErrorLog`, `ServerLog`, `/api/metrics`, `/api/health/*`, `src/lib/prometheus-text.ts` |
| Public website + lead forms | Implemented | `src/app/site/*` (services, solutions, pricing, contact, start-a-project); `/api/v1/leads` contract in `docs/ALO_LEAD_API_V1_CONTRACT.md` |
| Feature flags | Implemented | `FeatureFlag`, `/api/feature-flags` |

---

## 6. Test-run evidence (this checkout)

```
npx vitest run
Test Files  28 failed | 185 passed | 1 skipped (214)
Tests       8 failed | 2101 passed | 113 skipped (2222)
```

Why the failures are environmental, not product regressions:

- 23 of the 28 failing files fail at **import time** with
  `Cannot find module '.prisma/client/default'`. `npx prisma generate` cannot run
  in this sandbox because `binaries.prisma.sh` is unreachable (only the npm
  registry is allow-listed).
- The remaining failures (`backup-restore`, `sqlite-foreign-keys`,
  `job-queue-durability`, `prisma-foreign-keys`, `agent-health-integrity`,
  `run-resume`, `workforce-provisioning`) require the `better-sqlite3` native
  binding, which was not built because dependencies were installed with
  `--ignore-scripts`.
- The suites covering the code changed in this phase pass:
  `governance-policy-engine` (42), `governance-runtime` (18),
  `tool-policy`, `tools-registry`, `tool-loop`, `command-agent`,
  `agentos-planner`, `agentos-runs-pipeline`.

Not verified: production routes, provider connectivity, OAuth flows, media
providers, deployment and DNS. Any claim of `Verified Live` requires a staging
run with real credentials, which this session did not have.

---

## 7. Gap register (ranked)

| ID | Gap | Severity | Evidence | Phase |
| --- | --- | --- | --- | --- |
| GAP-001 | Emergency stop unenforced / dual key namespaces | Critical — **fixed** | `src/lib/governance/runtime.ts`, tests | B (done) |
| GAP-002 | ~~`approval-engine/` is a second in-memory approval implementation~~ **Fixed in B2**: in-memory store deleted; only the pure risk→action mapping (`types.ts`) remains | High | — | B2 ✅ |
| GAP-003 | No governance gate on routes that perform their own external actions. **Mostly fixed in B2**: email send (`external.communicate`), social publish (`content.publish`) and database restore (`data.delete` + evidence) now gate. CRM writes remain ungated; `POST /api/deploy` is a 501 stub with nothing to gate. | High | route inspection (§2 of governance doc) | B2 🟨 |
| GAP-004 | ~~Approvals are not single-use~~ **Fixed in B2**: `consumeApproval()` writes a `consumedAt` marker with a compare-and-set on `requestJson`; a replay returns 409 | Moderate | — | B2 ✅ |
| GAP-005 | `ProjectDiscovery` / `CapabilityAssessment` models are unused; no website or repo discovery | High (blocks Phase E) | schema vs `grep` results | E |
| GAP-006 | No browser automation / research subsystem | High (blocks Phase D) | no Playwright in app deps | D |
| GAP-007 | No GitHub/GitLab connection, so no authorised repository access | Critical for coding claims | no code | E |
| GAP-008 | No sandbox executor for code execution | Critical | `SEC-SHELL-001` denies by design | F |
| GAP-009 | No public WebChat surface, and no public-safe agent profile | High (blocks Section 14A) | `/api/chat` requires auth | G |
| GAP-010 | Helpdesk is a client-portal ticket list, not an operational helpdesk | Moderate | `/portal/support` inspection | I |
| GAP-011 | Tenant policy overrides / staged rollout for governance | Moderate | governance doc §7 | B3 |
| GAP-012 | Media/social providers not certified in any environment | Moderate | provider config inspection | H |

---

## 8. What this audit changes about the roadmap

The specification asks for Phase A→J. On the evidence above, the blocking order is:

1. **Finish governance enforcement** (routes, queues) — cheap, prevents future
   dangerous autonomy. No repository work can be safely enabled before this.
2. **Public WebChat with a restricted agent** — small, fully within existing
   infrastructure, and closes a security boundary the spec treats as critical.
3. **Connector + repository access (GitHub OAuth) before any coding claims.**
   Without an authorised source connection the platform must keep saying "a URL
   only enables public analysis".
4. Browser/discovery only after (3), because repository access is the prerequisite
   for every implementation step.

Detailed sequencing: `docs/roadmap/AGENTOS_IMPLEMENTATION_ROADMAP.md`.
