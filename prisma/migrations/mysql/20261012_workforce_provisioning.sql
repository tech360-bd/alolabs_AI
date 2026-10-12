-- ALO Labs workforce provisioning (2026-10-12) — ADDITIVE MySQL migration.
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


-- ─── Workforce provisioning: tenant ownership + runtime profile ─────────────
-- Additive only. Existing rows keep companyId NULL (legacy, unowned). The
-- provisioner refuses to adopt unowned rows, so no tenant is assigned here.
-- Backfill of ownership is a separate, reviewed operator step.

CALL alo_add_column_if_missing('Department', 'companyId', 'VARCHAR(191) NULL');
CALL alo_add_column_if_missing('Department', 'runtimeProfile', 'LONGTEXT NOT NULL');
CALL alo_add_index_if_missing('Department', 'Department_companyId_idx', 'INDEX `Department_companyId_idx` (`companyId`)');
CALL alo_add_fk_if_missing('Department', 'Department_companyId_fkey', 'CONSTRAINT `Department_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

CALL alo_add_column_if_missing('Agent', 'companyId', 'VARCHAR(191) NULL');
CALL alo_add_column_if_missing('Agent', 'systemInstructions', 'LONGTEXT NOT NULL');
CALL alo_add_column_if_missing('Agent', 'runtimeProfile', 'LONGTEXT NOT NULL');
CALL alo_add_index_if_missing('Agent', 'Agent_companyId_departmentId_idx', 'INDEX `Agent_companyId_departmentId_idx` (`companyId`, `departmentId`)');
CALL alo_add_fk_if_missing('Agent', 'Agent_companyId_fkey', 'CONSTRAINT `Agent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

UPDATE `Department` SET `runtimeProfile` = '{}' WHERE `runtimeProfile` = '' OR `runtimeProfile` IS NULL;
UPDATE `Agent` SET `runtimeProfile` = '{}' WHERE `runtimeProfile` = '' OR `runtimeProfile` IS NULL;
