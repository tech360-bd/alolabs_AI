-- ROLLBACK for 20261009_agentos_hardening.sql
--
-- Reverses every schema object the forward migration added. Application
-- releases that depend on these columns/tables must be rolled back FIRST
-- (deploy/scripts/rollback.sh) — otherwise the previous release's code keeps
-- working but the current release would fail.
--
-- Data note: dropping OutputVersion / ModelRoutingDecision / BackupRecord /
-- AIProviderConfig discards audit and provider-configuration rows that did not
-- exist before the forward migration. Take a backup before running this file.

DELIMITER $$

DROP PROCEDURE IF EXISTS alo_drop_column_if_exists $$
CREATE PROCEDURE alo_drop_column_if_exists(IN p_table VARCHAR(64), IN p_column VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP COLUMN `', p_column, '`');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS alo_drop_index_if_exists $$
CREATE PROCEDURE alo_drop_index_if_exists(IN p_table VARCHAR(64), IN p_index VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

DROP TABLE IF EXISTS `OutputVersion`;
DROP TABLE IF EXISTS `AIProviderConfig`;
DROP TABLE IF EXISTS `ModelRoutingDecision`;
DROP TABLE IF EXISTS `BackupRecord`;

CALL alo_drop_index_if_exists('Task', 'Task_runId_idx');
CALL alo_drop_index_if_exists('Task', 'Task_status_idx');
CALL alo_drop_column_if_exists('Task', 'runId');

CALL alo_drop_index_if_exists('QueueItem', 'QueueItem_idempotencyKey_key');
CALL alo_drop_index_if_exists('QueueItem', 'QueueItem_queueId_status_scheduledAt_idx');
CALL alo_drop_index_if_exists('QueueItem', 'QueueItem_status_lockExpiresAt_idx');
CALL alo_drop_column_if_exists('QueueItem', 'result');
CALL alo_drop_column_if_exists('QueueItem', 'idempotencyKey');
CALL alo_drop_column_if_exists('QueueItem', 'lockedBy');
CALL alo_drop_column_if_exists('QueueItem', 'lockExpiresAt');
CALL alo_drop_column_if_exists('QueueItem', 'heartbeatAt');

CALL alo_drop_column_if_exists('Approval', 'expiresAt');

CALL alo_drop_column_if_exists('AgentOSRun', 'checkpoint');
CALL alo_drop_column_if_exists('AgentOSRun', 'attempts');

DELETE FROM `_alo_schema_migrations` WHERE `name` = '20261009_agentos_hardening';

DROP PROCEDURE IF EXISTS alo_drop_column_if_exists;
DROP PROCEDURE IF EXISTS alo_drop_index_if_exists;
