# Backup and recovery gate — operator runbook

**Status: BLOCKED / NOT VERIFIED for production.** Follow-up on 2026-10-09: the backup script now includes the default local `uploads/` and configured `STORAGE_LOCAL_PATH` (including owner metadata), writes checksums and was exercised with a one-row SQLite DB and real file in an isolated restore. See [`ALO_LABS_BACKUP_RESTORE.md`](ALO_LABS_BACKUP_RESTORE.md). This does not verify production recovery. The existence of `deploy/scripts/backup.sh` and `.github/workflows/backup.yml` alone is not a successful restore test. This file is a procedure for an approved staging exercise, **not** evidence that production backups are usable. Do not paste credentials or DB URLs into audit reports.

## Before any migration or release

1. Identify the **actual production** database engine, storage path/bucket, config/secret-manager references, workflow/queue state, source revision and worker topology. Obtain owner approval and a maintenance/rollback window. Do not assume the ignored sandbox SQLite DB is production data.
2. Create an encrypted, access-controlled, consistent database snapshot (SQLite online backup/checkpoint, or MySQL transactional/physical backup with binlog coordinates); preserve agents, versions, skills, workflows, memory, users, tenants and queue records.
3. Snapshot object/filesystem storage **with tenant ACL metadata**, config/environment template and protected secret-manager backup, deployment manifests and exact Git revision/build. Record checksums, timestamps, encryption key custody, retention and offsite location. **Historical finding:** before this follow-up, `deploy/scripts/backup.sh` captured only `storage`, `data`, `public/uploads` and omitted the local provider's default `uploads/`. That omission is fixed and isolated file+metadata restore tested. Full production storage/config/source recovery, encryption and object ACL restoration remain NOT VERIFIED.
4. Restore all components into an **isolated staging environment**, never over the source. Compare table counts, key relations, constraints, artifact hashes/permissions and company boundaries to the source snapshot; boot the matching web and worker code; run representative login, queued workflow, approval, file and artifact retrieval tests (using staging credentials). Test cancellation/recovery for in-flight jobs.
5. Apply the reviewed additive migration in staging, record applied version, compare before/after counts, run regression and actual end-to-end provider/tool tests. For rollback, stop workers, restore DB+storage+config together, redeploy matching source/build and validate resumed workflow state. Do not use destructive SQL as an automatic rollback.
6. Sign off evidence with operation ID, environment, backup manifest/checksums, restored counts, observed HTTP/status transitions, RPO/RTO, reviewer and timestamps. Mask all credentials and private data.

## Gate evidence in this sandbox

| Requirement | State |
|---|---|
| Production DB backup + restore | NOT VERIFIED |
| Source/config/secret backup + restore | NOT VERIFIED |
| Artifact/file ACL + checksum recovery | NOT VERIFIED |
| Workflow/queue recovery after restart | PARTIAL (startup stale-job logic exists; restore drill absent) |
| MySQL migration rollback on restored copy | NOT VERIFIED |
| Backup tooling runs on macOS (BSD userland) as well as Linux | VERIFIED for `deploy/scripts/backup.sh` by [`__tests__/integration/backup-restore.test.ts`](__tests__/integration/backup-restore.test.ts) — see [`ALO_LABS_BACKUP_PORTABILITY_REPAIR.md`](ALO_LABS_BACKUP_PORTABILITY_REPAIR.md). `scripts/restore.sh` and `deploy/scripts/deploy.sh` still contain GNU-only constructs (follow-up). |

**Decision: STOP.** See [`ALO_LABS_FORENSIC_AUDIT.md`](ALO_LABS_FORENSIC_AUDIT.md) and the existing legacy [`docs/BACKUP-GUIDE.md`](docs/BACKUP-GUIDE.md). Never treat a manifest flag such as `database_backup_verified: true` as proof of successful restore.
