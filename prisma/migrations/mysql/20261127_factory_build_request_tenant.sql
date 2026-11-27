-- Tenant ownership for the three factory build-request logs.
-- Date: 2026-11-27
--
-- Why: GET /api/agent-factory/build listed AgentBuildRequest rows with no
-- company filter, and the model had no company column to filter on, so every
-- caller saw every tenant's build requests (agent names, department ids,
-- config payloads, results). The route's `where: tenantWhere(tenant)` could
-- never have worked: Prisma rejects a companyId filter on a model without the
-- field, which is exactly what CI reported.
--
-- Same shape as 20261126_ws_company_step1: NULLABLE and NON-BREAKING.
--   * no existing row becomes invalid;
--   * the column is added without a table rewrite and without a lock on data;
--   * the route filters `companyId = <caller's company>`, which excludes NULL,
--     so legacy rows fail closed and are not shown to any tenant.
--
-- There is deliberately NO backfill. These rows carry no company reference
-- anywhere (no relation, no denormalised id), so assigning an owner from
-- application data would be a guess, and a wrong guess hands one tenant's
-- build history to another. Legacy rows stay NULL and unread.
--
-- Rollback: 20261127_factory_build_request_tenant_rollback.sql

ALTER TABLE `AgentBuildRequest`
  ADD COLUMN `companyId` VARCHAR(191) NULL;

CREATE INDEX `AgentBuildRequest_companyId_createdAt_idx`
  ON `AgentBuildRequest` (`companyId`, `createdAt`);

ALTER TABLE `AgentBuildRequest`
  ADD CONSTRAINT `AgentBuildRequest_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE `SkillBuildRequest`
  ADD COLUMN `companyId` VARCHAR(191) NULL;

CREATE INDEX `SkillBuildRequest_companyId_createdAt_idx`
  ON `SkillBuildRequest` (`companyId`, `createdAt`);

ALTER TABLE `SkillBuildRequest`
  ADD CONSTRAINT `SkillBuildRequest_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE `WorkflowBuildRequest`
  ADD COLUMN `companyId` VARCHAR(191) NULL;

CREATE INDEX `WorkflowBuildRequest_companyId_createdAt_idx`
  ON `WorkflowBuildRequest` (`companyId`, `createdAt`);

ALTER TABLE `WorkflowBuildRequest`
  ADD CONSTRAINT `WorkflowBuildRequest_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
