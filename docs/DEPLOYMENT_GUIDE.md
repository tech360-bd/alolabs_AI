# AgentOS deployment and recovery guide

**Gate: do not deploy this branch to production without completing the FAIL/PARTIAL items in [final audit](../ALO_LABS_AGENTOS_FINAL_AUDIT.md).** This is an operator procedure for a staging validation, not a production-ready certificate.

## Local sandbox

1. Back up source, env and DB before any schema operation. Never commit `.env` or DB files.
2. Install (`npm ci --legacy-peer-deps`), set `DATABASE_URL=file:./db/custom.db`, `PRISMA_SQLITE_ADAPTER=1`, strong `JWT_SECRET` and `STORAGE_SIGNING_SECRET` in `.env`.
3. For this sandbox's engine-less Prisma client: `npm run db:generate:client-engine`; initialize additive tables: `npm run db:push:sqlite`. **This is not a production migration runner.**
4. Set `SEED_ADMIN_PASSWORD` to a unique 12+ character password and run `npm run seed:agentos` (idempotent, never overwrites an existing bcrypt password). Remove any default/test credential before production use.
5. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (stop the dev server first; Next 16 dev/build type stubs in `.next` conflict when run concurrently).
6. Start the standalone server with `PORT=3011 NODE_ENV=production ... node .next/standalone/server.js`. For SQLite, use an **absolute, externally mounted `DATABASE_URL`**, e.g. `file:/srv/alo-data/custom.db`. Relative `file:./db/custom.db` inside standalone may point to a copied build-time database instead of the live volume.
7. Probe `/api/v1/health`: DB/queue should be `ok`; model router `degraded` (503) is expected until provider configuration is supplied.

## Relational migrations

The additive four-model SQL for MySQL is at `prisma/migrations/mysql/20261008_agentos_foundation.sql`. Restore a backup in staging and validate indexes/foreign keys against your exact existing schema and MySQL version before applying. It is not wired into Prisma migration history; record the applied version yourself. `prisma/schema.mysql.prisma` is generated from the SQLite schema. **MySQL migration application and rollback have NOT been verified here.**

## Backup / restore

- SQLite: stop writes or use `sqlite3 .backup`; copy the database, WAL and storage directory consistently, plus encrypted configuration. Test restore into a separate staging instance.
- MySQL: use a consistent transactional dump/physical backup with binlog positions and encrypted object storage backup. Test restore regularly.
- A restart recovers queue items stuck `processing` for >10 minutes on startup. Jobs younger than that threshold, cross-replica SSE and approval resume need hardening. Keep the worker and web server on the same DB.
- Rollback: stop workers, restore DB+storage+configuration from a known-good snapshot, then deploy the matching application build. No destructive rollback SQL is supplied.

`npm audit --omit=dev` currently fails with 9 production dependency findings (5 high, 4 moderate). Triage compatible fixes and rerun the audit before release. Existing Docker/CI files are retained, but a clean staging deployment (database migrations + worker + provider + integration tests) is still required. See the existing `docs/BACKUP-GUIDE.md` and `docs/CI-CD-GUIDE.md` for legacy procedures.
