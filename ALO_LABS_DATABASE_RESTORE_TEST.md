# Isolated SQLite backup and restore test — 2026-10-09 (Asia/Dhaka)

**Scope: local configured sandbox SQLite only. Production backup/restore remains NOT VERIFIED.** No production data or migration was touched. `db/custom.db` was copied via SQLite's online backup API (not raw `cp` of a live WAL database) into a newly created ignored directory with mode 0700; backup and restored DB files have mode 0600. The original DB remained in place. Backup contents include local users and must remain private; do not upload/commit them.

| Evidence | Result |
|---|---|
| Captured UTC | 2026-10-08T18:45:11Z (local calendar date 2026-10-09) |
| Engine/version | SQLite 3.40.1, local sandbox; Prisma client-engine adapter 6.19.2 |
| Backup location | `backups/agentos-local-restore-20261008T184511Z-4b5727fb/sandbox-snapshot.sqlite` (Git-ignored) |
| Backup size | 2,981,888 bytes |
| Backup SHA-256 | `864e1f32595719eb327dc098fd059ec193fb14b3113fee03be24a2b26bf1bf26` |
| Schema SHA-256 (`sqlite_master`) | `ec48131865684fcf639551c09907a0f815767e70e16dc173beb96b84f9c1c5bb` |
| Integrity/readability | Both backup and separate `isolated-restored.sqlite`: `PRAGMA integrity_check = ok`. Source copy produced with `sqlite3.Connection.backup`. |
| Schema/data comparison | 175 tables, 268 indexes, 186 total records; every table count and schema hash matched backup ↔ restore. |
| Foreign keys | `foreign_key_check` found 0 violations, **but the sandbox schema declares 0 foreign keys**; relationship constraints therefore cannot be considered verified. |
| Application connection | Real Prisma client + `PrismaBetterSQLite3` opened restored copy: 2 users, 2 companies, 5 agents, 1 AgentOSRun, 3 artifacts and 1 QueueItem were queryable. |
| Migration history | SQLite `user_version=0`; MySQL migration history/application NOT VERIFIED. |
| Production data/storage/config | NOT VERIFIED: actual production DB not identified, object storage/config backup and encrypted/offsite restore not tested. |

**Decision:** local SQLite DB backup→restore procedure and count integrity **PASS (isolated only)**; overall Backup/Restore release gate **NOT VERIFIED**. No source/config or object-storage restore, no MySQL restore, no production row reconciliation. Metadata and local test DB remain ignored under `backups/` and are not deliverable files. See `BACKUP_RECOVERY.md` for the required production drill.
