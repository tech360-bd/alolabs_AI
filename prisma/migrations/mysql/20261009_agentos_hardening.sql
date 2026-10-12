-- ALO Labs AgentOS hardening (2026-10-09) — ADDITIVE MySQL migration.
--
-- Prerequisites
--   * MySQL 8.0+ / InnoDB, utf8mb4.
--   * 20261008_agentos_foundation.sql has been applied.
--   * A verified backup exists (deploy/scripts/backup.sh) — this file never
--     drops or rewrites existing data, but every schema change must be
--     reversible from a backup.
--
-- Idempotency
--   Every statement is guarded so the file can be re-run safely. MySQL has no
--   `ADD COLUMN IF NOT EXISTS`, so column additions use a stored procedure
--   that checks information_schema first.
--
-- Rollback: 20261009_agentos_hardening_rollback.sql
-- Validation: scripts/mysql-migration-test.ts (requires a disposable MySQL)

DELIMITER $$

DROP PROCEDURE IF EXISTS alo_add_column_if_missing $$
CREATE PROCEDURE alo_add_column_if_missing(
  IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS alo_add_index_if_missing $$
CREATE PROCEDURE alo_add_index_if_missing(
  IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

-- ─── Task: precise run linkage ───────────────────────────────────────────────
CALL alo_add_column_if_missing('Task', 'runId', 'VARCHAR(191) NULL');
CALL alo_add_index_if_missing('Task', 'Task_runId_idx', 'INDEX `Task_runId_idx` (`runId`)');
CALL alo_add_index_if_missing('Task', 'Task_status_idx', 'INDEX `Task_status_idx` (`status`)');

-- ─── QueueItem: leases, idempotency, result persistence ──────────────────────
CALL alo_add_column_if_missing('QueueItem', 'result', 'LONGTEXT NULL');
CALL alo_add_column_if_missing('QueueItem', 'idempotencyKey', 'VARCHAR(191) NULL');
CALL alo_add_column_if_missing('QueueItem', 'lockedBy', 'VARCHAR(191) NULL');
CALL alo_add_column_if_missing('QueueItem', 'lockExpiresAt', 'DATETIME(3) NULL');
CALL alo_add_column_if_missing('QueueItem', 'heartbeatAt', 'DATETIME(3) NULL');
CALL alo_add_index_if_missing('QueueItem', 'QueueItem_idempotencyKey_key', 'UNIQUE INDEX `QueueItem_idempotencyKey_key` (`idempotencyKey`)');
CALL alo_add_index_if_missing('QueueItem', 'QueueItem_queueId_status_scheduledAt_idx', 'INDEX `QueueItem_queueId_status_scheduledAt_idx` (`queueId`, `status`, `scheduledAt`)');
CALL alo_add_index_if_missing('QueueItem', 'QueueItem_status_lockExpiresAt_idx', 'INDEX `QueueItem_status_lockExpiresAt_idx` (`status`, `lockExpiresAt`)');

-- ─── Approval: expiry ────────────────────────────────────────────────────────
CALL alo_add_column_if_missing('Approval', 'expiresAt', 'DATETIME(3) NULL');

-- ─── AgentOSRun: resumable checkpoint ────────────────────────────────────────
CALL alo_add_column_if_missing('AgentOSRun', 'checkpoint', 'LONGTEXT NOT NULL');
CALL alo_add_column_if_missing('AgentOSRun', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
UPDATE `AgentOSRun` SET `checkpoint` = '{}' WHERE `checkpoint` = '' OR `checkpoint` IS NULL;

-- ─── OutputVersion ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `OutputVersion` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NULL,
  `version` INTEGER NOT NULL,
  `content` LONGTEXT NOT NULL,
  `model` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NOT NULL DEFAULT 'initial',
  `qcPassed` BOOLEAN NULL,
  `qcScore` DOUBLE NULL,
  `qcIssues` LONGTEXT NOT NULL,
  `assessmentId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `OutputVersion_taskId_version_key` (`taskId`, `version`),
  INDEX `OutputVersion_runId_idx` (`runId`),
  CONSTRAINT `OutputVersion_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── AIProviderConfig ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `AIProviderConfig` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `provider` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `baseUrl` LONGTEXT NULL,
  `encryptedApiKey` LONGTEXT NULL,
  `keyFingerprint` VARCHAR(191) NULL,
  `models` LONGTEXT NOT NULL,
  `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  `priority` INTEGER NOT NULL DEFAULT 100,
  `timeoutMs` INTEGER NOT NULL DEFAULT 60000,
  `maxRetries` INTEGER NOT NULL DEFAULT 2,
  `lastHealthStatus` VARCHAR(191) NULL,
  `lastHealthAt` DATETIME(3) NULL,
  `lastHealthLatencyMs` INTEGER NULL,
  `lastError` LONGTEXT NULL,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AIProviderConfig_companyId_name_key` (`companyId`, `name`),
  INDEX `AIProviderConfig_provider_idx` (`provider`),
  INDEX `AIProviderConfig_isEnabled_priority_idx` (`isEnabled`, `priority`),
  CONSTRAINT `AIProviderConfig_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── ModelRoutingDecision ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ModelRoutingDecision` (
  `id` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `companyId` VARCHAR(191) NULL,
  `agentId` VARCHAR(191) NULL,
  `requestedModel` VARCHAR(191) NOT NULL,
  `taskType` VARCHAR(191) NULL,
  `selectedProvider` VARCHAR(191) NULL,
  `selectedModel` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NOT NULL DEFAULT '',
  `candidates` LONGTEXT NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 1,
  `fallbackFrom` VARCHAR(191) NULL,
  `success` BOOLEAN NOT NULL DEFAULT false,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` LONGTEXT NULL,
  `latencyMs` INTEGER NULL,
  `promptTokens` INTEGER NULL,
  `completionTokens` INTEGER NULL,
  `costUsd` DOUBLE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ModelRoutingDecision_runId_idx` (`runId`),
  INDEX `ModelRoutingDecision_companyId_createdAt_idx` (`companyId`, `createdAt`),
  INDEX `ModelRoutingDecision_selectedProvider_idx` (`selectedProvider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── BackupRecord ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `BackupRecord` (
  `id` VARCHAR(191) NOT NULL,
  `backupId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `status` VARCHAR(191) NOT NULL DEFAULT 'created',
  `location` LONGTEXT NOT NULL,
  `manifest` LONGTEXT NOT NULL,
  `checksum` VARCHAR(191) NOT NULL DEFAULT '',
  `sizeBytes` BIGINT NOT NULL DEFAULT 0,
  `appVersion` VARCHAR(191) NULL,
  `commit` VARCHAR(191) NULL,
  `schemaVersion` VARCHAR(191) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `restoreTestedAt` DATETIME(3) NULL,
  `retentionUntil` DATETIME(3) NULL,
  `createdBy` VARCHAR(191) NULL,
  `error` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BackupRecord_backupId_key` (`backupId`),
  INDEX `BackupRecord_status_idx` (`status`),
  INDEX `BackupRecord_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── Migration ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `_alo_schema_migrations` (
  `name` VARCHAR(191) NOT NULL,
  `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `checksum` VARCHAR(191) NOT NULL DEFAULT '',
  PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT IGNORE INTO `_alo_schema_migrations` (`name`) VALUES ('20261008_agentos_foundation');
INSERT IGNORE INTO `_alo_schema_migrations` (`name`) VALUES ('20261009_agentos_hardening');

DROP PROCEDURE IF EXISTS alo_add_column_if_missing;
DROP PROCEDURE IF EXISTS alo_add_index_if_missing;
