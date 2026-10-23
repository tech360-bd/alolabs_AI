# ALO Labs database recovery and workforce migration runbook

**Status: discovery-only from development checkout. No production DB or credentials were accessed.** This procedure is intentionally gated: inventory → consistent backup → isolated restore → schema comparison → reviewed import/provisioning → release approval. It never treats a source file found by name as a valid backup.

## 1. Read-only production-host inventory

Run from an owner-approved shell on the production host. The script does not print credentials or row contents. It scans only the selected roots, opens SQLite files read-only for integrity/schema/count metadata, and issues `SELECT`-only MySQL counts if a restricted MySQL client defaults file is readable.

```bash
sudo env MYSQL_DEFAULTS_FILE=/root/alolabs-ai-db-credentials \
  bash /path/to/alolabs_AI/deploy/scripts/inventory-data-sources.sh \
  /opt /home /srv /mnt /backup /backups /var/backups /var/lib/alolabs /root
```

The MySQL defaults file must be compatible with the `mysql --defaults-extra-file` client format and readable only by its owner. If the provided credential file has a different format, the inventory reports MySQL counts unavailable; do not `cat`, print, or paste it. Have the database operator create/confirm a protected client option file locally. The helper suppresses MySQL errors rather than risking credential-bearing diagnostics.

The report gives candidate file paths/sizes/timestamps, SQLite integrity/foreign-key checks and counts for relevant tables, MySQL exact counts (if authenticated), and the presence of expected MySQL data directories. It scans at most 300 database/dump/archive candidates by default; narrow or raise the cap explicitly if needed. `find` permission errors are suppressed, so inaccessible paths, unmounted volumes, nonstandard extensions, or a reached candidate cap mean the scan is incomplete—zero results never prove production data is absent. MySQL datadir files are not to be copied while the server is running.

## 2. Preserve source and prove restore

1. Record the inventory output, host identity, timestamp, source revision and approved operator. Treat the report as sensitive operational metadata.
2. For SQLite, take a consistent online backup using SQLite's backup API (include committed WAL state). Verify `PRAGMA integrity_check` on the copy; preserve the source and WAL/SHM files until sign-off.
3. For MySQL, use an approved consistent logical or physical backup. Do not use filesystem copies of live InnoDB files. Keep the backup encrypted and access-controlled; capture checksums and the database/server version without recording secrets.
4. Restore the backup to an isolated staging MySQL instance first. Verify integrity, all table counts, primary/unique keys, foreign-key relations, key ownership, and representative workflow/task/history chains. A checksum-only pass is not a restore test.
5. Start the matching app/worker revision against the restored staging copy and run health, login, read-only data checks and representative synthetic tasks. Preserve before/after reconciliation output and rollback instructions.

No production migration, provisioning apply, or deployment may happen before the restore has been tested and owner approval recorded.

## 3. Schema compatibility and migration gate

- `prisma/schema.prisma` is SQLite; `prisma/schema.mysql.prisma` is the intended MySQL schema. Do not change the datasource provider in place.
- The repository contains six MySQL SQL files (four forward migrations and two rollback scripts). Their existence does not prove they match the current live database. Review the exact baseline schema, SQL modes, MySQL/MariaDB version, indexes, constraints, collation, large text fields and all migration prerequisites on the restored staging copy.
- `npm run verify:mysql` is a static check of SQLite/MySQL model and logical-field-type parity plus MySQL index/relation fields and selected large-text annotations; it is **not** a live server schema diff or migration test. A successful command is not production approval.
- `scripts/migrate-sqlite-to-mysql.ts` is a legacy unsafe importer. Its destructive, non-transactional apply path is disabled in this branch. Do not bypass the guard. A correct data migration needs reviewed table/column mappings, transaction/staging strategy, conflict policy, preserved IDs or explicit ID maps, parent/child ordering, per-table row/hash reconciliation, and rollback/restore evidence. It has not been implemented or run against production.
- Use additive, reviewed migrations only after staging restore/validation. Do not automatically assign legacy rows to a tenant; ownership backfill requires a separate audited mapping.

## 4. Workforce reconciliation and provisioning

Record distinct counts for `Department`, `Agent`, `AIEmployeeIdentity`, tasks, task steps, runs, tool runs and audit rows. Count successful executions independently from configured/active state; an agent is not operational merely because `status='active'`.

If existing records are recovered, preserve their IDs where schema constraints permit and reconcile every relation and tenant owner before changes. If records are irrecoverable, ask the business owner to approve a new managed plan; then use the existing deterministic provisioning process only against the restored staging database:

```bash
npm run provision:workforce:dry-run
npm run provision:ai-employees:dry-run
# After review and explicit change approval, on staging only:
npm run provision:workforce:apply
npm run provision:ai-employees:apply
npm run verify:workforce
npm run verify:ai-employees
```

The agent provisioner detects conflicts and does not overwrite unmanaged or cross-tenant rows. Employee identity provisioning creates separate `AIEmployeeIdentity` records but does not create execution history. Neither provisioning operation demonstrates agent capability.

For execution evidence, use `npm run audit:workforce:json` after staging has a verified local provider and synthetic tenants. Operational counts must come from successful, recent, non-empty real task runs; retain the task/run IDs, model, tool-run records, structured-output validation and audit events. Begin with five approved representatives and bounded concurrency. Expand only after reliability/security checks. Never manufacture `AgentRun`, `ToolRun`, evaluation or completion rows.

## 5. Stop conditions

Stop and do not migrate/provision if the source, ownership mapping, source backup, restore, schema compatibility, row reconciliation, rollback, local inference, tenant isolation, or human-approval gates are unknown or fail. Current development checkout evidence is insufficient to declare any of those production gates passed.
