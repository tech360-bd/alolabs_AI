-- Rollback for 20261127_agent_build_request_company.sql
-- Removes only the FK, index and column added by 20261127_agent_build_request_company.sql.

ALTER TABLE `AgentBuildRequest` DROP FOREIGN KEY `AgentBuildRequest_companyId_fkey`;
DROP INDEX `AgentBuildRequest_companyId_idx` ON `AgentBuildRequest`;
ALTER TABLE `AgentBuildRequest` DROP COLUMN `companyId`;
