-- AgentBuildRequest tenant ownership: add nullable companyId + FK + index.
-- Date: 2026-11-27
--
-- Ensures /api/agent-factory/build scopes every build request and created agent
-- to the caller's Company. Nullable so existing rows remain valid without downtime.
-- Rollback: 20261127_agent_build_request_company_rollback.sql

ALTER TABLE `AgentBuildRequest`
  ADD COLUMN `companyId` VARCHAR(191) NULL;

CREATE INDEX `AgentBuildRequest_companyId_idx` ON `AgentBuildRequest` (`companyId`);

ALTER TABLE `AgentBuildRequest`
  ADD CONSTRAINT `AgentBuildRequest_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
