-- Give AgentOSRun a real parent link so multi-agent fan-out is a relation.
-- Date: 2026-11-27
--
-- Why: an orchestrated command creates child runs, one per subtask. Without a
-- column, "which runs belong to this parent" would have to be recovered from the
-- event stream or from an objective string prefix — neither is a relation, both
-- are guesses, and cancellation (which must stop every child of a cancelled
-- parent) cannot be written as a query.
--
-- This migration is NON-DESTRUCTIVE: the column is nullable, existing rows keep
-- their value (NULL = a root run), and the index is additive.
--
-- Backfill: not applicable. Existing runs are roots by definition — no historical
-- run was produced by the coordinator, which did not exist before this change.
--
-- Rollback: 20261127_agentos_run_parent_rollback.sql

ALTER TABLE `AgentOSRun`
  ADD COLUMN `parentRunId` VARCHAR(191) NULL;

CREATE INDEX `AgentOSRun_parentRunId_idx` ON `AgentOSRun` (`parentRunId`);
