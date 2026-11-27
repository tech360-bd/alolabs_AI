-- AI Workspace → Company ownership, step 1 of 3: add the column.
-- Date: 2026-11-26
--
-- Canonical tenant root is Company (approved 2026-11-26). An AiWorkspace must
-- belong to exactly one Company.
--
-- This step is deliberately NON-DESTRUCTIVE and NON-BREAKING:
--   * the column is NULLABLE, so no existing row becomes invalid;
--   * nothing reads it until the application change lands;
--   * it can be removed with one ALTER if anything goes wrong.
--
-- The NOT NULL constraint is step 3 and is applied only after the backfill
-- (step 2) and the integrity checks prove zero unresolved rows.
--
-- Rollback: 20261126_ws_company_step1_rollback.sql

ALTER TABLE `AiWorkspace`
  ADD COLUMN `companyId` VARCHAR(191) NULL;

CREATE INDEX `AiWorkspace_companyId_idx` ON `AiWorkspace` (`companyId`);

-- Restrict, not Cascade: deleting a Company must never silently take its
-- workspaces, runs, conversations and files with it. The FK is added here so
-- the constraint exists from the first step, even while the column is null.
ALTER TABLE `AiWorkspace`
  ADD CONSTRAINT `AiWorkspace_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
