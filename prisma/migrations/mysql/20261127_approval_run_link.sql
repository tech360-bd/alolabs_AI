-- Give Approval a real run link.
-- Date: 2026-11-27
--
-- Why: `src/lib/runs` found a run's approvals with
--
--     requestJson: { contains: '"runId":"<uuid>"' }
--
-- That is a substring match on a JSON blob standing in for a relation. It is
-- correct for rows this code writes, and wrong in two ways that matter:
--
--   * it cannot use an index, so every approval lookup scans the table; and
--   * a row whose requestJson happens to contain that substring for any other
--     reason is treated as belonging to that run.
--
-- This migration adds the column and indexes it. It is NON-DESTRUCTIVE:
-- nullable, no rewrite, existing rows unaffected.
--
-- Backfill: rows written by requestHumanReview already carry the run id inside
-- requestJson, so the value is derivable exactly. MySQL's JSON_EXTRACT reads it
-- and the assignment is guarded to a valid-looking id, so a malformed blob
-- cannot produce a bogus link. The backfill only sets rows where the column is
-- still NULL, so it can be re-run safely.
--
-- Rollback: 20261127_approval_run_link_rollback.sql

ALTER TABLE `Approval`
  ADD COLUMN `runId` VARCHAR(191) NULL;

CREATE INDEX `Approval_runId_status_idx` ON `Approval` (`runId`, `status`);

-- Only fill rows whose requestJson holds a string runId.
UPDATE `Approval`
   SET `runId` = JSON_UNQUOTE(JSON_EXTRACT(`requestJson`, '$.runId'))
 WHERE `runId` IS NULL
   AND JSON_VALID(`requestJson`)
   AND JSON_TYPE(JSON_EXTRACT(`requestJson`, '$.runId')) = 'STRING'
   AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(`requestJson`, '$.runId'))) BETWEEN 1 AND 64;
