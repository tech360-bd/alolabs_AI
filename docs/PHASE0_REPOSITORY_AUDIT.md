# Phase 0 repository audit and owner review

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Executive disposition

**Do not rebuild or replace this application. Preserve existing modules and data.** The useful next step is to reconcile execution and governance paths and prove a small end-to-end pilot, not add another swarm framework or populate more agent rows. Current status is **Phase 0 assessed with evidence gaps; production readiness not established**. Approval for Phase 1 design is requested; implementation remains unauthorized.

## Method and preservation

- Working branch: `arena/bd79faf4-alolabs-ai`; starting working tree clean; baseline HEAD `d6774c0c131d460cae08b55ccde7eedc984843d1`.
- Read repository manifests, Prisma providers/models, orchestration/worker/approval/tool/audit/memory/model modules, health code, workflow checks, and prior audit reports. Prior reports are historical claims, not fresh runtime evidence.
- 410 `src/app/**/route.ts` files; 236 files under `src/components`; 192 `model` declarations in primary Prisma schema. These are source inventory counts, not live endpoints, users, agents, throughput or operational status.
- No node_modules present; no installation performed. No database file found by the checkout file search. Remote/production databases, volumes and backups were not searched or connected. No `.env` or production secret file was opened.
- Only new audit documentation/evidence and an appended reassessment in the existing roadmap are intended changes. No application/config/dependency/schema file changed; no data manipulation, infrastructure changes, server startup, commit, push, merge or deployment.

## Existing feature inventory

| Capability | Source evidence | Assessment and missing proof |
|---|---|---|
| Web/admin UI | `src/components`, `src/app`, Next config | Substantial panels exist; no fresh browser/accessibility/visual tests; preserve all panels. |
| Agent lifecycle/scheduling | `src/lib/agent-runtime/*` | Code present; lifecycle and configured identities do not equal verified operational agents. |
| Orchestration | `src/lib/multi-agent-orchestrator/*`, `src/lib/orchestrator.ts` | Structured company/user task and dependency types exist; multiple paths require reconciliation. |
| Durable queue | `src/lib/job-queue.ts` | Prisma-backed atomic claim/leases/retry/idempotency code and integration tests exist; restart guarantees not rerun here. |
| Alternate workers | `src/lib/workers/queue.ts` | In-memory Map-backed queue also exists; do not advertise universal task durability. |
| Approvals | `src/lib/approval-engine/index.ts`, approval routes/models | In-memory request/rule maps exist alongside other paths; persistence and universal human gate not established. |
| Tool permissions | `src/lib/tools/policy.ts`, `execute.ts` | Explicit allow/deny with deny precedence. Policy checks approval ID presence, not approval validity. Executor permissions optional. |
| Tool activity logs | `src/lib/tools/execute.ts` | ToolRun writes exist but errors are caught/logged; this path is not fail-closed auditable execution. |
| General audit | `src/lib/audit-events.ts` | DB event writes and key-name redaction present; no signatures/hash-chain in this helper. Nested arrays/arbitrary text need stronger redaction. |
| Memory/RAG | `src/lib/memory/*`, `tenant-knowledge.ts`, `rag-engine.ts`, `qdrant.ts` | DB-backed memory and scope mapping exist. Mandatory per-item project/provenance/confidence and leakage resistance not proven. |
| Models | `src/lib/ai-router/*`, `ai-gateway/*` | Ollama/OpenAI-compatible and external provider adapters exist; no configured local inference was tested. |
| DB policy | `src/lib/db.ts`, `production-database.ts`, both Prisma schemas | Production code requires MySQL/MariaDB; dev SQLite. Actual environment engine/version/data remain unknown. |
| Factory/workflows | `workflows/definitions`, workflow services, GitHub Actions | 17 definitions validate statically. No agent-generated feature→test→review→PR pipeline executed. |
| QA/security | `__tests__`, `src/__tests__`, `.github/workflows` | Existing unit/integration suites and guard scripts; full suite not run in this no-install audit. |
| Backups/deployment | `deploy/scripts`, backup/deploy workflows, recovery docs | Procedures and safety scripts exist; no fresh production backup, restore or deployment test. |
| Creative/communications | media services/panels, social/telephony documentation | Existing assets retained; provider/device consent and actual execution unverified. |
| Lab isolation | candidate resource and proposed worker boundary | Hostile-code containment, egress denial, Android/Ghidra runtime and disposal not verified. |

## Newly reproduced static validation

See [validation-evidence.json](phase0/validation-evidence.json) for exact output and exit codes.

1. `node scripts/check-workflow-definitions.mjs`: PASS, 17 definitions, zero errors/warnings.
2. `node scripts/validate-route-auth.mjs`: PASS, 410 route files, 636 non-public handlers reference known auth helpers, 16 allowlist entries, 2 documented exceptions. Query-param bypasses `action=ping` and `health=true` explicitly **not analyzed**. This regex/static check does not prove authentication, authorization or tenant isolation.
3. `node scripts/validate-workflow-security.mjs`: PASS, 8 workflows and 30 pinned action references. Does not verify GitHub environment protection, secret presence or deployment approval configuration.
4. `git diff --check`: PASS at validation time; final documentation check recorded separately in owner summary.

Not run: unit/integration/E2E tests, dependency advisories, build, lint, typecheck, real DB reads/writes, inference, load/security/restore tests. No historical test counts are presented as current results.

## Highest-priority findings

- Approval ID truthiness and optional executor permissions require privileged call-path review; not a proven externally exploitable bypass, but insufficient as a universal security boundary.
- Multiple queue/approval/orchestrator implementations mean durability and governance are path-dependent.
- Audit failure handling differs across helpers; cryptographic signing and replay-safe approval consumption not established.
- Health code treats registered providers as ready and has healthy local-RAG fallbacks; those signals are not inference/retrieval proof.
- Production database, capacity, backups and network are unverified; historical reports cannot certify today’s state.
- Upstream custom/noncommercial terms and paid data sources prevent indiscriminate integration.

## Deliverable navigation

- [Architecture](MASTER_ARCHITECTURE.md), [resources](RESOURCE_AUDIT.md), [compatibility](RESOURCE_COMPATIBILITY_MATRIX.md), [licenses](LICENSE_COMPLIANCE.md).
- [Security](SECURITY_ARCHITECTURE.md), [agents](AGENT_SYSTEM.md), [lab](REVERSE_ENGINEERING_LAB.md), [factory](AUTONOMOUS_SOFTWARE_FACTORY.md).
- [QA](QA_AND_TESTING.md), [memory](MEMORY_ARCHITECTURE.md), [infrastructure](INFRASTRUCTURE_PLAN.md), [deployment](DEPLOYMENT_RUNBOOK.md).
- [Risk register](RISK_REGISTER.md), [roadmap](IMPLEMENTATION_ROADMAP.md).

## Owner decisions required

Approve proceeding to **Phase 1 design only**, select a five-agent pilot and initial adapter scope, provide missing exact resource links/permitted website evidence, and authorize read-only infrastructure inventory if desired. Production access, migrations, untrusted software installation, external publication and deployment need separate explicit approvals. Unresolved resources remain F; the audit is not a claim all required evaluations or acceptance tests are complete.
