-- Rollback for 20261127_factory_build_request_tenant.sql
-- Drops only the columns, indexes and foreign keys that migration added.
-- Nothing else is touched; no application data is modified by this file.

ALTER TABLE `AgentBuildRequest` DROP FOREIGN KEY `AgentBuildRequest_companyId_fkey`;
DROP INDEX `AgentBuildRequest_companyId_createdAt_idx` ON `AgentBuildRequest`;
ALTER TABLE `AgentBuildRequest` DROP COLUMN `companyId`;

ALTER TABLE `SkillBuildRequest` DROP FOREIGN KEY `SkillBuildRequest_companyId_fkey`;
DROP INDEX `SkillBuildRequest_companyId_createdAt_idx` ON `SkillBuildRequest`;
ALTER TABLE `SkillBuildRequest` DROP COLUMN `companyId`;

ALTER TABLE `WorkflowBuildRequest` DROP FOREIGN KEY `WorkflowBuildRequest_companyId_fkey`;
DROP INDEX `WorkflowBuildRequest_companyId_createdAt_idx` ON `WorkflowBuildRequest`;
ALTER TABLE `WorkflowBuildRequest` DROP COLUMN `companyId`;
