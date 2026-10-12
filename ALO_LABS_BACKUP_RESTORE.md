# Backup and restore hardening evidence — 2026-10-09

**Production backup/restore: NOT VERIFIED.** The earlier local SQLite snapshot was independently restored (175 table counts, 186 records, 268 indexes and Prisma read). This pass improved the existing `deploy/scripts/backup.sh`; no production backup was run.

## Fixed local-scope gap

The old archive gathered `storage`, `data` and `public/uploads` but **omitted the local provider's default `uploads/`**, including `.metadata` sidecars that encode tenant ownership. The script now includes `uploads/` and a configured `STORAGE_LOCAL_PATH` (including a separate archive for an existing external path), verifies tar readability, produces `SHA256SUMS`, and records `restore_tested:false` rather than claiming restoration. On hosts without the `sqlite3` CLI, it uses Python's SQLite online backup API (with integrity checks), so committed WAL data is included. The script never resets a database.

## Isolated execution (not a production rehearsal)

A disposable application directory contained a real one-row SQLite database, a file uploaded by `LocalStorageProvider` with owner and tenant metadata, and a non-secret `.env`. Running `deploy/scripts/backup.sh` produced `database.sqlite`, `application-storage.tar.gz`, `SHA256SUMS` and `manifest.json`. Both checksum entries verified. The archive was extracted into a separate directory; the restored database returned its expected row and passed `integrity_check`. The restored file's bytes matched its persisted checksum, and `.metadata` retained its company and owner. This was repeated by the **real filesystem integration test** `__tests__/integration/backup-restore.test.ts` (no database or file mocks). Evidence artifacts are private and Git-ignored under `backups/backup-script-exercise/`.

**Not proven:** production DB identity, consistent snapshot of all external object stores, encryption/offsite retention and key custody, source/config/secret-manager recovery, concurrent backup under production load, restored worker/queue/application topology, permissions across all files, MySQL dump/restore, recovery point/time objectives, or production rollback. Archives must never be extracted over live data without a reviewed recovery plan. A checksum and a local row/file test cannot promote the overall gate to PASS. See [recovery runbook](BACKUP_RECOVERY.md).

## Cross-platform repair — 2026-10-11

`deploy/scripts/backup.sh` only ran on GNU coreutils. On macOS it aborted with
`realpath: illegal option -- m`, and four further GNU-only constructs
(`readlink -f`, `realpath --relative-to`, `find -printf`, `sha256sum`,
`mapfile`, `rm --one-file-system`) would have failed after it. All of them are
now provided by `deploy/scripts/lib/portable-coreutils.sh`, which reproduces
the GNU semantics — including the symlink resolution the traversal protections
depend on — with tools that exist on both platforms. The integration test
exercises the macOS code path on Linux too, through a BSD-userland emulation,
and `.github/workflows/backup-portability.yml` runs the same test on
`macos-latest` and `ubuntu-latest`. Full change list and evidence:
[ALO_LABS_BACKUP_PORTABILITY_REPAIR.md](ALO_LABS_BACKUP_PORTABILITY_REPAIR.md).
