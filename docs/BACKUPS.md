# Backups & restore

**Status:** implemented and unit-verified for dump generation/validation. Database round-trip
(create → restore against a live SQLite/MySQL instance) is **not** verified in this checkout — there
is no database and no `node_modules` here. Nothing in this document claims a live restore was run.

## What was wrong before

`DatabaseManager.backup()` produced a file containing table names, `CREATE TABLE` statements (MySQL
only) and row **counts** — never the rows themselves. `POST /api/db/backup` stored that file and
reported success. The Backup panel, meanwhile, called `/api/backups`, which did not exist, so the
panel could not even list anything. A backup you cannot restore is not a backup; this replaces it.

## What exists now

| Piece | Path |
|---|---|
| Pure dump renderer / validator | `src/lib/backups/dump.ts` |
| Driver-backed sources + replay targets | `src/lib/backups/sources.ts` |
| Engine (create / list / config / restore) | `src/lib/backups/index.ts` |
| Panel API (`GET`, `POST update_config`) | `src/app/api/backups/route.ts` |
| Create | `src/app/api/backups/create/route.ts` |
| Restore | `src/app/api/backups/restore/route.ts` |
| Existing endpoint, now backed by the engine | `src/app/api/db/backup/route.ts` |
| Tests | `__tests__/unit/lib/backup-dump.test.ts` (13 tests) |

### Dump format

Portable SQL with a dialect preamble, one `CREATE TABLE` per table (when the catalog exposes one)
and batched multi-row `INSERT`s (100 rows per statement, column names quoted per dialect):

```sql
-- ALO Labs AgentOS logical backup
-- Dialect: sqlite
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
CREATE TABLE "agents" (...);
INSERT INTO "agents" ("id", "name") VALUES
  ('a1', 'Ada'),
  ('a2', 'Bo');
```

Value handling: `NULL`, finite numbers, `bigint`, booleans (`1/0`, `TRUE/FALSE` for PostgreSQL),
ISO timestamps for `Date`, hex literals for bytes (`X'..'`, `0x..`, `decode(..)`), JSON for plain
objects, and dialect-correct quote/backslash escaping. Unrepresentable values (NaN, functions,
NUL bytes) throw instead of being silently coerced.

### Restore safety model

1. `backupId` must be registered and match a filename already on disk.
2. The dump is structurally validated: at least one `CREATE TABLE`/`INSERT`, no NUL bytes, ≤512 MiB.
3. A **safety backup of the current database is taken first**. If that fails, restore refuses.
4. The verified dump is copied to `db/restore-staging/`.
5. In-place replay (drop the dumped tables, then execute the dump) runs only when
   `BACKUP_RESTORE_IN_PLACE=1`. Otherwise the API returns `applied: false` with the staged path.

The panel shows "Backup verified" when `applied` is false and "Restored" only when it is true.

### Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:` (SQLite), `mysql:`, or `postgresql:` — required |
| `BACKUP_RESTORE_IN_PLACE` | `1` enables destructive in-place replay (default off) |
| `STORAGE_PROVIDER` | unrelated; backups are written to `db/backups/` |

Drivers, loaded lazily: `better-sqlite3`, `mysql2`, `pg` (all declared in `package.json`).

## Verification performed

- `__tests__/unit/lib/backup-dump.test.ts` — **13/13 pass** (esbuild + vitest 4.1.10 run against the
  repository source).
- Assertions cover dialect quoting, escaping (including backslashes and `E''` strings), binary/date
  literals, rejected values, batching (250 rows → 3 inserts), validation of generated and legacy
  stub dumps, and drop-statement ordering.
- Endpoint and engine wiring was syntax-checked with esbuild; it was **not** executed, because
  Prisma Client is not generated in this checkout.

## Known limits

- The MySQL/PostgreSQL dumps do not emit `CREATE TABLE` for PostgreSQL (the catalog does not expose
  a one-statement definition); replay against an empty PostgreSQL database therefore relies on the
  schema already existing or being applied separately.
- Dumps are materialised in memory per table before writing; very large tables will need a streaming
  writer (the batching boundary is already in place).
- Retention settings (`retentionDays`) are stored and editable but no pruning job is scheduled yet —
  the panel exposes the schedule, the scheduler is a separate piece of work.
