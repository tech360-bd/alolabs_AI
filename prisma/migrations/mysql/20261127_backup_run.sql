-- Platform-level backup attempt records (see prisma/schema.mysql.prisma, model BackupRun).
-- Additive only: no existing column, index or row is touched.
CREATE TABLE IF NOT EXISTS `BackupRun` (
  `id` VARCHAR(191) NOT NULL,
  `environment` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `stage` LONGTEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `durationMs` INTEGER NULL,
  `databaseProvider` LONGTEXT NULL,
  `artifactPath` LONGTEXT NULL,
  `artifactBytes` BIGINT NULL,
  `checksum` LONGTEXT NULL,
  `restoreTested` BOOLEAN NOT NULL DEFAULT false,
  `restoreVerifiedAt` DATETIME(3) NULL,
  `commit` LONGTEXT NULL,
  `failureExcerpt` TEXT NULL,
  `source` LONGTEXT NOT NULL,
  `metadata` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `BackupRun_environment_finishedAt_idx` (`environment`, `finishedAt`),
  INDEX `BackupRun_status_idx` (`status`),
  INDEX `BackupRun_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
