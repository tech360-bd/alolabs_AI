-- Rollback for 20261126_ws_company_step1.sql
-- Drops only the FK, index and column that step 1 added. No other data touched.
-- Safe at any point before step 3 (the NOT NULL constraint).

ALTER TABLE `AiWorkspace` DROP FOREIGN KEY `AiWorkspace_companyId_fkey`;
DROP INDEX `AiWorkspace_companyId_idx` ON `AiWorkspace`;
ALTER TABLE `AiWorkspace` DROP COLUMN `companyId`;
