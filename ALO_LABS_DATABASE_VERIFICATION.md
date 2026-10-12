# Database verification — 2026-10-09

**Follow-up finding:** A consistent local SQLite backup and isolated restore matched 175 tables, 268 indexes, 186 records and Prisma connectivity; however the sandbox schema has **zero declared foreign keys**. That is not a PASS for relational constraints or production data preservation. See [`ALO_LABS_DATABASE_FORENSIC_REPORT.md`](ALO_LABS_DATABASE_FORENSIC_REPORT.md) and [`ALO_LABS_DATABASE_RESTORE_TEST.md`](ALO_LABS_DATABASE_RESTORE_TEST.md).

**Overall: PARTIAL / NOT VERIFIED for production.**

| Check | Status | Evidence / limitation |
|---|---|---|
| Models/tables | PASS (sandbox only) | 175 Prisma models in `prisma/schema.prisma`; previous SQLite sandbox schema push made 175 tables. |
| Relations/CRUD | PARTIAL | Previous Prisma adapter round-trip created/read/updated and cleaned up a small set of related User/Company/Project/Artifact/Task/Workflow/RunEvent records. Not exhaustive. |
| Indexes and constraints | NOT VERIFIED (production) | Additive indexes/FKs in `prisma/migrations/mysql/20261008_agentos_foundation.sql`; no live MySQL application or full constraint comparison. |
| Migration history | FAIL (production gate) | MySQL additive SQL is not integrated with Prisma migration history; SQLite `db:push:sqlite` is sandbox-only and not a rollback mechanism. |
| Seeds | PARTIAL | `scripts/seed-agentos.ts` previously ran against sandbox SQLite with bcrypt password from environment. Existing tenant/data preservation in production NOT VERIFIED. |
| Tenant isolation | PARTIAL | Some v1/run/project/artifact tests; legacy routes and per-file storage ACLs unverified. |
| Data preservation/recovery | NOT VERIFIED | No production database backup, staged restore, row-count comparison, binlog/PITR or full storage/config rollback proof in this environment. |

**Stop condition:** do not run `prisma db push`, a schema migration, or seeds against the production database until target schema inventory, consistent backup and isolated staged restore with matching code/worker have been independently verified. See [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md). Ignored local `db/*.db*` files are not Git-tracked and were not migrated in this audit.
