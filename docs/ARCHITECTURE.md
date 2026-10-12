# AgentOS architecture (2026-10-08)

**Status:** implementation under development; not certified for production. See [`ALO_LABS_AGENTOS_FINAL_AUDIT.md`](../ALO_LABS_AGENTOS_FINAL_AUDIT.md).

## Execution graph

```text
HTTP POST /api/runs (or /api/v1/command)
  → AgentOSRun + RunEvent (durable)
  → JobQueue/QueueItem (Prisma database)
  → instrumentation.node worker polls `agentos` queue
  → planner: provider-backed JSON plan, otherwise labelled heuristic plan
  → each step: orchestrator.routeTask (DB-scoped candidate agents)
  → Task + TaskStep
  → AgentExecutionEngine (permission/validation) → AIRouter → provider
  → QualityAssessment → bounded repair (max 2) → Approval if needed
  → Artifact report (SHA-256, version) + episodic memory
  → RunEvent + event bus → authenticated SSE → Command Center UI
```

The planner's deterministic fallback produces a plan, **not a fake result**. With no provider, task execution fails with **Configuration required**. The failure is persisted with events and a diagnostic report artifact.

## Existing components preserved

The existing Agent/AgentVersion, Skill/SkillVersion, Task/TaskStep, Workflow/WorkflowStep/WorkflowRun, AgentRun, Approval, QualityAssessment, memory, RAG, provider router, security, agent runtime, event bus and queue models remain in place. Four additional models are additive: `Project`, `Artifact`, `RunEvent`, `AgentOSRun`.

## Data flow and isolation

Company membership is resolved by `src/lib/api-auth.ts`; v1 additionally accepts SHA-256-hashed company API keys with scoped permissions. New run/project/artifact detail handlers reject records from another company. The queue and SSE use run IDs, but the UI can access SSE only after session auth. **Legacy endpoints and storage access controls need additional penetration testing**; see the final audit.

## Persistence and recovery

The worker boots from `src/instrumentation.ts` (node-only implementation in `instrumentation.node.ts`). Jobs are database-backed and claimed atomically with an `updateMany` compare-and-set. Old `processing` jobs older than 10 minutes are requeued at worker startup; automatic recovery of recent in-flight jobs after abrupt failure is incomplete.

## Known architecture limits

- Workflow engine executes persisted steps sequentially; parallel branches, loops, compensation and reliable resume after approval are **not implemented**.
- Repair QC uses heuristic validator and model-based repair; source-level fact verification is **not guaranteed**.
- Agent/skill/tool registries exist, but per-step skills/tools are hints; universal typed tool contracts and sandboxed browser/computer execution are **not wired into this path**.
- Artifact reports are Markdown in DB. Merely declaring `docx`, `xlsx`, `pptx` MIME types does not create OOXML binaries.
- In-process event bus/SSE cannot fan out across replicas; persisted event replay works after reconnect.
