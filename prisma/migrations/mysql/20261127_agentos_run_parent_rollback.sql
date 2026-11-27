-- Rollback for 20261127_agentos_run_parent.sql
-- Drops only the index and column that migration added. Nothing else is touched;
-- child runs themselves are ordinary runs and remain valid without the link.

DROP INDEX `AgentOSRun_parentRunId_idx` ON `AgentOSRun`;
ALTER TABLE `AgentOSRun` DROP COLUMN `parentRunId`;
