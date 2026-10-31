# Deployment and database safety discovery runbook

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Status

Planning checklist only. No production deployment, SSH access, database connection, migration, backup or restore was performed. Existing deployment/recovery scripts and documentation are preserved. This underscore-named file supplements, not replaces, `DEPLOYMENT-RUNBOOK.md` and existing recovery docs.

## Before any production operation

1. Obtain separate explicit operation approval and maintenance window; record actor, scope, target and rollback owner.
2. Verify actual server/database engine/version/capacity/topology and environment separation. Do not confuse the SQLite development schema with production MySQL/MariaDB.
3. Inventory schema, row counts, constraints, uploads/object storage and required configuration without exposing credentials to agents.
4. Create a consistent encrypted backup and immutable manifest; verify checksums and encryption keys under operator custody.
5. Restore into a fresh isolated target of the actual engine/version. Compare rows, constraints, critical relationships, file hashes/ACLs and application reads. A backup command exiting zero is not restore verification.
6. Test proposed migration against the disposable restore, assess downtime/locks/data compatibility and compare post-migration counts/constraints. Review rollback and non-reversible changes explicitly.
7. Obtain migration-specific approval after results; no `db push`, reset, seed, truncate or unreviewed import against production. Legacy migration safety blocks must not be bypassed.
8. Run locked CI tests/typecheck/lint/build/license/security gates; approve exact artifact/commit and reviewed diff.
9. Confirm human-protected deployment environment and required SSH secrets via names/presence only. Static workflow validation does not verify GitHub environment reviewer enforcement.
10. Deploy through approved existing pipeline with controlled health checks, smoke tests and audit; abort/rollback on breach. Document recovery time and retained artifacts.

## Rollback and incident constraints

Application rollback and database rollback are different. Never restore a database over new production writes without explicit loss assessment and approval. Prefer reversible compatible app changes and controlled DB remediation after backup verification. Isolate a compromised worker, revoke its grants, preserve forensic evidence and rotate secrets only with authorization. Do not destroy data to make a health check green.

Encrypted offsite backup and demonstrated restore are mandatory production-readiness gates. No deployment is authorized by Phase 0 or by approval of Phase 1 design.
