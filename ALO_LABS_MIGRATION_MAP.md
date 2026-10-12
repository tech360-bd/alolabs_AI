# Current → target migration map

**As of 2026-10-09. Status: BLOCKED at forensic/recovery gates.** No database migration is executed by this document. Preserve all existing models/rows/routes unless a reviewed migration and rollback are approved.

| Current | Intended target | Migration / preservation rule | Verification needed | Status |
|---|---|---|---|---|
| Session/company membership and v1 API-key auth | Explicit tenant selection and resource-level RBAC | Preserve users/sessions/keys; add tenant context and audit without defaulting to a different membership | Cross-tenant and privilege-escalation matrix for all routes/files | PARTIAL |
| Existing Agent/Version, Skill/Version, Tool/ToolRun | Versioned policy-enforced executable registry | Evolve schemas additively; never infer execution from a stored skill ID | Live typed skill/tool execution, permissions, version rollback | PARTIAL |
| AgentExecutionEngine + AIRouter | Provider-agnostic routed execution/fallback | Retain adapters, add contract/health/cost checks | Real configured-provider success + failure injection | NOT VERIFIED |
| AgentOSRun + Task/TaskStep + queue worker | Transactional, recoverable graph scheduler | Retain rows; add leases/idempotency/outbox with migration | Concurrent/restart/cancel/approval-restart tests | PARTIAL |
| Workflow/WorkflowStep/WorkflowRun | Versioned complete workflow engine | Preserve existing definitions; introduce execution-compatible versions, not silent rewrites | Branches, approvals, loops, compensation and restore | PARTIAL |
| Memory/RAG and RunEvent | Scoped evidence-based context and verifiable citations | Preserve data; add explicit scope/source/retention and trusted-content boundaries | Cross-tenant retrieval, prompt injection and claim/source checks | PARTIAL |
| Local storage + DB-backed Markdown Artifact | Tenant-authorized object store and real OOXML/PDF generators | Migrate data with checksum + owner/tenant ACL; keep legacy retrieval until validated | Unauthorized download denial, restore, real generated file inspection | PARTIAL |
| SQLite sandbox + proposed additive MySQL SQL | Migrated production DB with recorded schema versions | Restore prod snapshot to staging; apply reviewed SQL; compare counts/constraints, roll back from snapshot | MySQL staging migration + backup/restore + application smoke | NOT VERIFIED |
| GitHub Actions + deploy/backup scripts | Fail-closed release pipeline | Preserve scripts pending audit; add integration/security/dependency/recovery gates before enabling deploy | Reproducible install, tests, production-mode health and DR drill | PARTIAL |

## Rollback and impact policy

For every future deletion/replacement record original path, reason, replacement, imports/users, DB/API/UI/data impact, migration and rollback **before** the change. No original source file was found missing from HEAD in the 2026-10-09 source inventory. A copied SQLite database is not an adequate production rollback: database, storage, config and matching source/build must be restored together and the restored instance must be exercised.

**STOP:** a verified production data/backup/restore path and the Phase 0 audit gate are absent. Do not execute `db push` or the MySQL SQL on production merely because this map exists.
