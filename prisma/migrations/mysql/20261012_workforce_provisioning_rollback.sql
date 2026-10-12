-- ROLLBACK for 20261012_workforce_provisioning.sql
--
-- Removes the tenant ownership and runtime profile columns added for workforce
-- provisioning. Roll back the application release FIRST (the provisioner and
-- verifier read these columns). Dropping the columns discards tenant ownership
-- and provisioning profiles; take a backup before running this file.
-- Agents and departments themselves are NOT deleted.

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

DROP PROCEDURE IF EXISTS alo_drop_fk_if_exists $$
CREATE PROCEDURE alo_drop_fk_if_exists(IN p_table VARCHAR(64), IN p_fk VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_fk AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` DROP FOREIGN KEY `', p_fk, '`');
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

CALL alo_drop_fk_if_exists('Agent', 'Agent_companyId_fkey');
CALL alo_drop_fk_if_exists('Department', 'Department_companyId_fkey');
CALL alo_drop_index_if_exists('Agent', 'Agent_companyId_departmentId_idx');
CALL alo_drop_index_if_exists('Department', 'Department_companyId_idx');
CALL alo_drop_column_if_exists('Agent', 'runtimeProfile');
CALL alo_drop_column_if_exists('Agent', 'systemInstructions');
CALL alo_drop_column_if_exists('Agent', 'companyId');
CALL alo_drop_column_if_exists('Department', 'runtimeProfile');
CALL alo_drop_column_if_exists('Department', 'companyId');
