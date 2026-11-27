-- Rollback for 20261126_ws_company_step3_require.sql
-- Returns the column to nullable. Does not touch data, so it can be re-applied
-- (step 3) once the underlying exception is resolved.

ALTER TABLE `AiWorkspace`
  MODIFY COLUMN `companyId` VARCHAR(191) NULL;
