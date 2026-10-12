# Database evidence update — 2026-10-09 (Asia/Dhaka)

**Overall database gate: FAIL / NOT VERIFIED for production.** This report extends, rather than overwrites, the [previous forensic snapshot](ALO_LABS_DATABASE_FORENSIC_REPORT.md). It is evidence from an ignored sandbox SQLite database and disposable copies only. No live/production migration was performed.

| Check | Before repair | New isolated evidence | Release status |
|---|---|---|---|
| Models/tables | 175 Prisma models and 175 sandbox tables | 175 fresh tables from repaired `scripts/sqlite-push.ts` | PARTIAL |
| Declared FKs | **0 in existing sandbox snapshot** | **144 FK column definitions across 91 tables** in new *empty* scratch database | FAIL in existing DB; new generator PASS locally |
| FK enforcement | No constraints to enforce | `RolePermission` insert referencing missing Role/Permission rejected by SQLite | PASS (new scratch only) |
| Existing data compatibility | Previously untested | Isolated copy of all **175 tables** into FK-enabled schema: row counts matched, but `PRAGMA foreign_key_check` found **one orphan in `AgentHealth`** | FAIL; must resolve data ownership, do not drop or relink silently |
| Existing DB in-place migration | `CREATE TABLE IF NOT EXISTS` could silently leave 0 FKs | Generator now refuses existing tables lacking declared FKs; isolated legacy copy SHA-256 unchanged after refusal | PASS (fail-closed behavior); actual migration NOT VERIFIED |
| Backup/restore | Local SQLite snapshot hash/table counts matched | Backup script separately restored local row + private file + tenant sidecar in an isolated fixture | PARTIAL (local only) |
| MySQL | Additive SQL exists; not applied | No MySQL server/client or production-consistent copy available | NOT VERIFIED |

The FK bug was that relation `fields: [agentId]` and `references: [id]` were parsed as quoted strings only. The corrected parser handles bare identifiers and uses `SET NULL` for optional relation defaults. A new real temp-DB integration test asserts fresh FKs, rejects invalid references, and verifies incompatible preexisting tables fail closed. **Existing sandbox DB was not rebuilt or changed.** Do not use this development helper as a production migration system. A reviewed migration must back up the target, reconcile the orphan with the data owner, rebuild affected tables in a disposable copy, compare row counts and schema, test Prisma/API behavior and rollback, then seek approval. Foreign-key audit on MySQL remains outstanding.
