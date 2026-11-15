# Database Migration Report

## Summary

**This branch introduces zero schema changes and zero migrations.**

`prisma/schema.prisma` and `prisma/schema.mysql.prisma` are byte-identical to
base commit `ae33423`:

```bash
git diff ae33423 -- prisma/ | wc -l
→ 0
```

All new functionality reuses existing tables and columns. This is deliberate:
the master prompt requires additive, backward-compatible migrations and forbids
dropping/rebuilding data.

## 1. Existing tables reused

| Feature | Table(s) used | Column(s) used |
|---|---|---|
| AI idempotency | `ModelUsageRecord` | `correlationId`, `requestId`, `companyId`, `profile`, `status`, `totalTokens`, `completedAt` |
| Weekly discovery metrics | `Metric` | `name`, `value`, `labels`, `unit`, `metricType` (`'ai_discovery'`), `recordedAt` |
| Discovery audit trail | `AuditEvent` | `action='ai.model_discovery.completed'`, `details` JSON |
| Model Control Center | `AIProviderConfig`, `AIProviderVerification`, `ProviderQuotaSnapshot`, `ModelUsageRecord`, `ModelRoutingDecision`, `Metric` | read-only aggregates |
| Free-ONLY mode | none | environment variable only |
| Free provider registration | `AIProviderConfig` (read path) | unchanged |

## 2. New enum-ish value introduced

`Metric.metricType = 'ai_discovery'`. `metricType` is a free-form `String` with a
default of `'general'` — no enum, no constraint, so **no migration is needed**.

## 3. Deployment steps for an existing database

### Development / SQLite

```bash
# nothing to apply
npx tsx scripts/sqlite-push.ts   # only if your local DB is behind the base schema
```

### Production / MySQL

```bash
# Confirm the schema is already in sync with the base commit; this branch adds nothing.
npx prisma migrate status --schema=prisma/schema.mysql.prisma

# If (and only if) status reports drift from pre-existing work, apply it with the
# repository's existing MySQL path — never `migrate reset`:
npx prisma migrate deploy --schema=prisma/schema.mysql.prisma
```

No new file appears under `prisma/migrations/mysql/`.

## 4. Rollback

Removing this branch requires **no database rollback**, because nothing was
written to the schema.

If you also want the discovery metrics removed (optional, cosmetic):

```sql
-- Only affects observability rows created by the weekly job.
DELETE FROM `Metric` WHERE `metricType` = 'ai_discovery';
```

Do **not** delete `ModelUsageRecord` rows: they are the audit trail of AI usage.
If the idempotency reservation rows created by a rolled-back deployment must be
cleared, target only `running` rows that never completed:

```sql
UPDATE `ModelUsageRecord`
SET `status` = 'deferred', `completedAt` = NOW(3)
WHERE `status` = 'running' AND `completedAt` IS NULL;
```

## 5. Follow-up migration recommended (NOT applied)

To make AI idempotency airtight rather than race-resolved:

```sql
-- MySQL: a unique index per (company, correlationId) for the *reservation*
-- cannot be added on ModelUsageRecord because all attempts of one logical call
-- share correlationId. If stronger guarantees are required, introduce a
-- dedicated table:
CREATE TABLE IF NOT EXISTS `AIRequestReservation` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestHash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'running',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NULL,
  UNIQUE INDEX `AIRequestReservation_companyId_idempotencyKey_key` (`companyId`, `idempotencyKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

This was **not** added in this branch because it is a schema change and needs its
own reviewed PR plus a matching SQLite mirror and a `mysql-schema-compatibility`
test update. The current implementation is correct under concurrency (verified by
the deterministic re-read), just less efficient.

## 6. Data preservation statement

| Question | Answer |
|---|---|
| Were any tables dropped? | No |
| Were any columns removed or renamed? | No |
| Were any rows deleted? | No |
| Were existing agents/employees/departments modified? | No — only read for verification |
| Was the database replaced? | No |
| Is the change backward compatible with a database on `ae33423`? | Yes — zero schema delta |
