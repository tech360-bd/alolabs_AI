-- Rollback for 20261127_approval_run_link.sql
-- Drops only the index and column that migration added. No data is modified:
-- the run id remains inside requestJson, which is where it came from.

DROP INDEX `Approval_runId_status_idx` ON `Approval`;
ALTER TABLE `Approval` DROP COLUMN `runId`;
