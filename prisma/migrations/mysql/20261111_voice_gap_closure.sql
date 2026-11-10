-- ALO Labs voice contact-center gap closure (2026-11-11) — ADDITIVE MySQL migration.
--
-- Covers: call language + caller identification (CallSession), campaign
-- lifecycle + duplicate prevention (Campaign/CampaignCall), escalations,
-- appointments, per-customer consent, telephony provider registry and voice
-- idempotency keys.
--
-- Status: UNVERIFIED against a live MySQL server (no MySQL in the build sandbox).
-- Run against a staging copy and the verify-mysql-compatibility script before use.
-- Prerequisites: 20261009_agentos_hardening.sql applied (provides the alo_* helpers).

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

DROP PROCEDURE IF EXISTS alo_add_fk_if_missing $$
CREATE PROCEDURE alo_add_fk_if_missing(IN p_table VARCHAR(64), IN p_fk VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_fk AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

-- ─── CallSession: conversation language + caller identification ─────────────
CALL alo_add_column_if_missing('CallSession', 'language', 'VARCHAR(191) NOT NULL DEFAULT "bn-BD"');
CALL alo_add_column_if_missing('CallSession', 'contactId', 'VARCHAR(191) NULL');
CALL alo_add_index_if_missing('CallSession', 'CallSession_contactId_idx', 'INDEX `CallSession_contactId_idx` (`contactId`)');
CALL alo_add_fk_if_missing('CallSession', 'CallSession_contactId_fkey', 'CONSTRAINT `CallSession_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `CrmContact` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

-- ─── Campaign: lifecycle + guardrails ────────────────────────────────────────
CALL alo_add_column_if_missing('Campaign', 'approvedById', 'VARCHAR(191) NULL');
CALL alo_add_column_if_missing('Campaign', 'approvedAt', 'DATETIME(3) NULL');
CALL alo_add_column_if_missing('Campaign', 'expiresAt', 'DATETIME(3) NULL');
CALL alo_add_column_if_missing('Campaign', 'maxConcurrentCalls', 'INTEGER NOT NULL DEFAULT 2');
CALL alo_add_column_if_missing('Campaign', 'dailyQuota', 'INTEGER NOT NULL DEFAULT 200');

-- ─── CampaignCall: duplicate-call prevention ─────────────────────────────────
-- Newer duplicate rows (same campaign + destination) are cancelled first so
-- the unique index can be created on existing data; the oldest row wins.
UPDATE CampaignCall cc
JOIN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY campaignId, destinationNumber ORDER BY createdAt ASC, id ASC) AS rn
    FROM CampaignCall
  ) ranked
  WHERE ranked.rn > 1
) dup ON cc.id = dup.id
SET cc.status = 'cancelled', cc.outcome = 'duplicate removed by migration 20261111';

CALL alo_add_index_if_missing('CampaignCall', 'CampaignCall_campaignId_destinationNumber_key', 'UNIQUE INDEX `CampaignCall_campaignId_destinationNumber_key` (`campaignId`, `destinationNumber`)');

-- ─── Escalation (human handoff persistence) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `Escalation` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `callSessionId` VARCHAR(191) NOT NULL,
  `trigger` VARCHAR(191) NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `assignedUserId` VARCHAR(191) NULL,
  `queueId` VARCHAR(191) NULL,
  `callbackTaskId` VARCHAR(191) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolutionNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('Escalation', 'Escalation_companyId_status_idx', 'INDEX `Escalation_companyId_status_idx` (`companyId`, `status`)');
CALL alo_add_index_if_missing('Escalation', 'Escalation_callSessionId_idx', 'INDEX `Escalation_callSessionId_idx` (`callSessionId`)');
CALL alo_add_index_if_missing('Escalation', 'Escalation_assignedUserId_status_idx', 'INDEX `Escalation_assignedUserId_status_idx` (`assignedUserId`, `status`)');
CALL alo_add_fk_if_missing('Escalation', 'Escalation_callSessionId_fkey', 'CONSTRAINT `Escalation_callSessionId_fkey` FOREIGN KEY (`callSessionId`) REFERENCES `CallSession` (`id`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('Escalation', 'Escalation_assignedUserId_fkey', 'CONSTRAINT `Escalation_assignedUserId_fkey` FOREIGN KEY (`assignedUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

-- ─── Appointment ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Appointment` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `contactId` VARCHAR(191) NULL,
  `callSessionId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `durationMin` INTEGER NOT NULL DEFAULT 30,
  `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Dhaka',
  `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
  `notes` TEXT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('Appointment', 'Appointment_companyId_scheduledFor_idx', 'INDEX `Appointment_companyId_scheduledFor_idx` (`companyId`, `scheduledFor`)');
CALL alo_add_index_if_missing('Appointment', 'Appointment_contactId_idx', 'INDEX `Appointment_contactId_idx` (`contactId`)');
CALL alo_add_index_if_missing('Appointment', 'Appointment_callSessionId_idx', 'INDEX `Appointment_callSessionId_idx` (`callSessionId`)');
CALL alo_add_fk_if_missing('Appointment', 'Appointment_contactId_fkey', 'CONSTRAINT `Appointment_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `CrmContact` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('Appointment', 'Appointment_callSessionId_fkey', 'CONSTRAINT `Appointment_callSessionId_fkey` FOREIGN KEY (`callSessionId`) REFERENCES `CallSession` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

-- ─── CustomerConsent (per-customer outbound/recording consent) ───────────────
CREATE TABLE IF NOT EXISTS `CustomerConsent` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `contactId` VARCHAR(191) NULL,
  `phoneNumber` VARCHAR(191) NOT NULL,
  `channel` VARCHAR(191) NOT NULL DEFAULT 'voice',
  `purpose` VARCHAR(191) NOT NULL DEFAULT 'outbound_contact',
  `granted` BOOLEAN NOT NULL DEFAULT false,
  `method` VARCHAR(191) NOT NULL DEFAULT 'verbal',
  `evidenceRef` VARCHAR(191) NULL,
  `revokedAt` DATETIME(3) NULL,
  `grantedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `CustomerConsent_companyId_phoneNumber_channel_purpose_key` (`companyId`, `phoneNumber`, `channel`, `purpose`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('CustomerConsent', 'CustomerConsent_companyId_granted_idx', 'INDEX `CustomerConsent_companyId_granted_idx` (`companyId`, `granted`)');

-- ─── TelephonyProviderConfig ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `TelephonyProviderConfig` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `adapter` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'unverified',
  `config` LONGTEXT NOT NULL,
  `capabilities` LONGTEXT NOT NULL,
  `lastCheckedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `TelephonyProviderConfig_companyId_adapter_key` (`companyId`, `adapter`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('TelephonyProviderConfig', 'TelephonyProviderConfig_companyId_status_idx', 'INDEX `TelephonyProviderConfig_companyId_status_idx` (`companyId`, `status`)');

-- ─── VoiceIdempotencyKey ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `VoiceIdempotencyKey` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `responseJson` LONGTEXT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `VoiceIdempotencyKey_companyId_scope_key_key` (`companyId`, `scope`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('VoiceIdempotencyKey', 'VoiceIdempotencyKey_expiresAt_idx', 'INDEX `VoiceIdempotencyKey_expiresAt_idx` (`expiresAt`)');

DROP PROCEDURE IF EXISTS alo_add_column_if_missing;
DROP PROCEDURE IF EXISTS alo_add_index_if_missing;
DROP PROCEDURE IF EXISTS alo_add_fk_if_missing;
