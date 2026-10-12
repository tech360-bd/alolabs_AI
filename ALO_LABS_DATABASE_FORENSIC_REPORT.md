# Local database forensic report

Capture: 2026-10-08T18:55:23.874201+00:00 UTC. **This is the configured sandbox SQLite DB**, not an independently identified production database. Database host/name for production, production data preservation and MySQL migration state: **NOT VERIFIED**. No credentials are included.

Engine/version: SQLite 3.40.1. Local path `db/custom.db`; journal mode in backup `wal`. `PRAGMA user_version`: 0 (not a Prisma migration version). Runtime: `PRISMA_SQLITE_ADAPTER=1` in sandbox; Prisma schema models 175. MySQL schema file and additive SQL exist, **not applied**.

Snapshot objects: {'table': 175, 'index': 268, 'trigger': 0, 'view': 0}; foreign-key definitions: **0 (critical schema gap in this sandbox)**; unique index definitions: 235; `PRAGMA foreign_key_check`: 0 violations **but cannot prove referential integrity without declared foreign keys**; `PRAGMA integrity_check`: `ok`; schema SHA-256 `ec48131865684fcf639551c09907a0f815767e70e16dc173beb96b84f9c1c5bb`. SQLite stored procedures: not applicable; triggers/views: 0 in this snapshot. Host for SQLite: local filesystem, not a network DB.

## Category counts (isolated backup and restore)

| Category | Tables counted | Backup count | Restored count | Difference | Status |
|---|---|---:|---:|---:|---|
| Users | User | 2 | 2 | 0 | PASS (local snapshot only) |
| Organizations | Company, CompanyUser | 3 | 3 | 0 | PASS (local snapshot only) |
| Agents | Agent, AgentVersion | 5 | 5 | 0 | PASS (local snapshot only) |
| Skills | Skill, SkillVersion | 8 | 8 | 0 | PASS (local snapshot only) |
| Tools | ToolRun | 0 | 0 | 0 | PASS (local snapshot only) |
| Models | ModelRegistry | 0 | 0 | 0 | PASS (local snapshot only) |
| Workflows | Workflow, WorkflowStep, WorkflowRun | 6 | 6 | 0 | PASS (local snapshot only) |
| Tasks | Task, TaskStep | 4 | 4 | 0 | PASS (local snapshot only) |
| Runs | AgentOSRun, AgentRun | 3 | 3 | 0 | PASS (local snapshot only) |
| Memory | AgentMemory, CompanyMemory, DepartmentMemory, MemoryShortTerm, MemoryLongTerm | 1 | 1 | 0 | PASS (local snapshot only) |
| Knowledge | KnowledgeNode, RagDocument | 0 | 0 | 0 | PASS (local snapshot only) |
| Documents | RagDocument | 0 | 0 | 0 | PASS (local snapshot only) |
| Artifacts | Artifact | 3 | 3 | 0 | PASS (local snapshot only) |
| Approvals | Approval | 0 | 0 | 0 | PASS (local snapshot only) |
| Audit logs | AuditLog | 16 | 16 | 0 | PASS (local snapshot only) |
| Usage | UsageLog, TokenUsage | 0 | 0 | 0 | PASS (local snapshot only) |
| Costs | CostEstimate | 0 | 0 | 0 | PASS (local snapshot only) |
| Integrations | WebhookConfig, McpServer | 0 | 0 | 0 | PASS (local snapshot only) |

This count comparison uses a consistent SQLite backup and separate restored copy, NOT two production systems or the MySQL SQL. Unknown tables/categories are not interpreted as zero. Restore preserved all 175 table counts (186 total rows), 268 indexes, zero FK violations, and schema hash. Actual production migration counts remain **NOT VERIFIED**. See `ALO_LABS_DATABASE_RESTORE_TEST.md`.
