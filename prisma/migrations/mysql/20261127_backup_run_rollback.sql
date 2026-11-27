-- Rollback for 20261127_backup_run.sql.
-- Drops only the table that migration created; no other schema object is affected.
DROP TABLE IF EXISTS `BackupRun`;
