-- Platform-level backup attempt records (see prisma/schema.mysql.prisma, model BackupRun).
-- Additive only: no existing column, index or row is touched.
CREATE TABLE IF NOT EXISTS `BackupRun` (
  `id` VARCHAR(191) NOT NULL,
  `environment` VARCHAR(191) NOT NULL DEFAULT 'production',
  `status` VARCHAR(191) NOT NULL,
  `stage` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `durationMs` INTEGER NULL,
  `databaseProvider` VARCHAR(191) NULL,
  `artifactPath` VARCHAR(191) NULL,
  `artifactBytes` BIGINT NULL,
  `checksum` VARCHAR(191) NULL,
  `restoreTested` BOOLEAN NOT NULL DEFAULT false,
  `restoreVerifiedAt` DATETIME(3) NULL,
  `commit` VARCHAR(191) NULL,
  `failureExcerpt` TEXT NULL,
  `source` VARCHAR(191) NOT NULL DEFAULT 'workflow',
  `metadata` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `BackupRun_environment_finishedAt_idx` (`environment`, `finishedAt`),
  INDEX `BackupRun_status_idx` (`status`),
  INDEX `BackupRun_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
