-- AI Workspace → Company ownership, step 3 of 3: enforce ownership.
-- Date: 2026-11-26
--
-- DO NOT RUN THIS STEP until every query below returns 0. This file asserts
-- them itself: MySQL evaluates the CHECK-style guard via a temporary table so a
-- non-zero count aborts the migration instead of silently constraining a table
-- that still holds unowned rows.
--
-- Requires: step 1 (column + FK) and step 2 (backfill) applied, and every
-- exception resolved by a human for records the deterministic backfill refused.
--
-- Rollback: 20261126_ws_company_step3_rollback.sql

-- ── Guard 1: no workspace may be left without a company ─────────────────────
CREATE TEMPORARY TABLE `_ws_company_guard` (
  `unowned` INT NOT NULL,
  `orphaned_fk` INT NOT NULL,
  `owner_outside_company` INT NOT NULL
);

INSERT INTO `_ws_company_guard` (`unowned`, `orphaned_fk`, `owner_outside_company`)
SELECT
  (SELECT COUNT(*) FROM `AiWorkspace` WHERE `companyId` IS NULL),
  (SELECT COUNT(*) FROM `AiWorkspace` w
     LEFT JOIN `Company` c ON c.id = w.companyId
     WHERE w.companyId IS NOT NULL AND c.id IS NULL),
  (SELECT COUNT(*) FROM `AiWorkspace` w
     JOIN `Company` c ON c.id = w.companyId
     WHERE NOT EXISTS (
       SELECT 1 FROM `CompanyUser` cu
       WHERE cu.userId = w.ownerId AND cu.companyId = w.companyId
     ));

-- Any non-zero value fails the entire statement below, so the ALTER never runs.
-- This is the difference between a migration that reports a problem and one
-- that refuses to proceed on top of it.
ALTER TABLE `_ws_company_guard`
  ADD CONSTRAINT `_ws_company_guard_ok`
  CHECK (`unowned` = 0 AND `orphaned_fk` = 0 AND `owner_outside_company` = 0);

DROP TEMPORARY TABLE `_ws_company_guard`;

-- ── Guard 2: enforce at the schema level ────────────────────────────────────
ALTER TABLE `AiWorkspace`
  MODIFY COLUMN `companyId` VARCHAR(191) NOT NULL;
