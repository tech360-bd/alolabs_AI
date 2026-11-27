-- Environment & API-key manager: four new tables (see prisma/schema.mysql.prisma).
-- Additive only. No existing table, column, index or row is touched.
--
-- Columns typed LONGTEXT are the ones the schema generator annotates with
-- @db.LongText (nullable/opaque strings). Ciphertext columns are LONGTEXT because
-- they are opaque base64 blobs, not searchable values.

CREATE TABLE IF NOT EXISTS `ProjectEnvironment` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectSlug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `createdBy` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProjectEnvironment_companyId_projectSlug_name_key` (`companyId`, `projectSlug`, `name`),
  INDEX `ProjectEnvironment_companyId_projectSlug_idx` (`companyId`, `projectSlug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EnvironmentVariable` (
  `id` VARCHAR(191) NOT NULL,
  `environmentId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `updatedBy` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EnvironmentVariable_environmentId_key_key` (`environmentId`, `key`),
  INDEX `EnvironmentVariable_environmentId_idx` (`environmentId`),
  CONSTRAINT `EnvironmentVariable_environmentId_fkey` FOREIGN KEY (`environmentId`) REFERENCES `ProjectEnvironment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Sealed secrets. `masked` is the only representation the API may return;
-- `ciphertext`/`dek*` are AES-256-GCM envelope output and are never decrypted on a
-- read path.
CREATE TABLE IF NOT EXISTS `EnvironmentSecret` (
  `id` VARCHAR(191) NOT NULL,
  `environmentId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `masked` LONGTEXT NOT NULL,
  `kekId` VARCHAR(191) NOT NULL,
  `dekCiphertext` LONGTEXT NOT NULL,
  `dekIv` LONGTEXT NOT NULL,
  `dekTag` LONGTEXT NOT NULL,
  `ciphertext` LONGTEXT NOT NULL,
  `iv` LONGTEXT NOT NULL,
  `tag` LONGTEXT NOT NULL,
  `algorithm` LONGTEXT NOT NULL DEFAULT 'aes-256-gcm',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdBy` LONGTEXT NULL,
  `rotatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EnvironmentSecret_environmentId_key_key` (`environmentId`, `key`),
  INDEX `EnvironmentSecret_environmentId_idx` (`environmentId`),
  INDEX `EnvironmentSecret_kekId_idx` (`kekId`),
  CONSTRAINT `EnvironmentSecret_environmentId_fkey` FOREIGN KEY (`environmentId`) REFERENCES `ProjectEnvironment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EnvironmentConfigVersion` (
  `id` VARCHAR(191) NOT NULL,
  `environmentId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `changeSummary` LONGTEXT NOT NULL,
  `variablesJson` LONGTEXT NOT NULL,
  `secretKeysJson` LONGTEXT NOT NULL,
  `checksum` VARCHAR(191) NOT NULL,
  `rollbackOf` INTEGER NULL,
  `createdBy` LONGTEXT NULL,
  `approvedBy` LONGTEXT NULL,
  `approvedAt` DATETIME(3) NULL,
  `appliedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EnvironmentConfigVersion_environmentId_version_key` (`environmentId`, `version`),
  INDEX `EnvironmentConfigVersion_environmentId_status_idx` (`environmentId`, `status`),
  CONSTRAINT `EnvironmentConfigVersion_environmentId_fkey` FOREIGN KEY (`environmentId`) REFERENCES `ProjectEnvironment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EnvironmentApply` (
  `id` VARCHAR(191) NOT NULL,
  `environmentId` VARCHAR(191) NOT NULL,
  `versionId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `stage` LONGTEXT NULL,
  `detail` LONGTEXT NULL,
  `healthCheck` LONGTEXT NULL,
  `hostRef` LONGTEXT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestedBy` LONGTEXT NULL,
  `approvedBy` LONGTEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EnvironmentApply_idempotencyKey_key` (`idempotencyKey`),
  INDEX `EnvironmentApply_environmentId_status_idx` (`environmentId`, `status`),
  INDEX `EnvironmentApply_createdAt_idx` (`createdAt`),
  CONSTRAINT `EnvironmentApply_environmentId_fkey` FOREIGN KEY (`environmentId`) REFERENCES `ProjectEnvironment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EnvironmentApply_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `EnvironmentConfigVersion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
