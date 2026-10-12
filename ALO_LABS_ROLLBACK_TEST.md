# Isolated rollback exercise — 2026-10-09

**Status: PARTIAL (local SQLite rehearsal). Production and MySQL rollback: NOT VERIFIED.** This was performed on a third *copy* of the restored sandbox database, `backups/agentos-local-restore-20261008T184511Z-4b5727fb/migration-rollback-test.sqlite`. No source database or production service was changed.

| Stage | Actual observation |
|---|---|
| Baseline | 175 tables; canonical SQLite schema SHA-256 `ec48131865684fcf639551c09907a0f815767e70e16dc173beb96b84f9c1c5bb` |
| Controlled migration | Created `__agentos_rollback_probe` with primary key and inserted one isolated test row; committed and read it back; schema hash changed. This is an exercise, **not** the AgentOS/MySQL migration. |
| Rollback | Dropped only the probe table on the isolated copy; committed. |
| Verification | Table count returned to 175; canonical schema SHA-256 returned to the baseline value; `PRAGMA integrity_check = ok`. No original baseline table touched. |

**Limit:** This does not validate rollback of `prisma/migrations/mysql/20261008_agentos_foundation.sql`, restoration of data changed by a real migration, workflow/worker state, storage, backups in production, or transactional safety under concurrent writes. Production rollback remains **NOT VERIFIED**; an actual staged MySQL restore and application smoke are mandatory.
