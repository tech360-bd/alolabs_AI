-- Super Admin Console: natural-language operations + self-healing
-- Date: 2026-11-25
-- Branch: feat/super-admin-console
--
-- All CREATE TABLE only. No DROP, no destructive ALTER on existing tables.
-- Rollback: see 20261125_super_admin_console_rollback.sql

-- DB-backed website content blocks, editable only through the audited
-- supervisor tool `set_site_content` (super_admin, AuditEvent on every write).
CREATE TABLE IF NOT EXISTS `SiteContentBlock` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `page` VARCHAR(191) NOT NULL,
  `blockKey` VARCHAR(191) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SiteContentBlock_companyId_page_blockKey_key` (`companyId`, `page`, `blockKey`),
  INDEX `SiteContentBlock_page_idx` (`page`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Immutable probe history of the site doctor (internet-facing self-healing).
-- One row per attempt; repairs are recorded as additional probes with
-- attempt = 2, never overwriting the original result.
CREATE TABLE IF NOT EXISTS `SiteDoctorProbe` (
  `id` VARCHAR(191) NOT NULL,
  `target` VARCHAR(500) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `httpStatus` INTEGER NULL,
  `latencyMs` INTEGER NULL,
  `detail` TEXT NULL,
  `attempt` INTEGER NOT NULL DEFAULT 1,
  `escalated` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SiteDoctorProbe_target_createdAt_idx` (`target`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
