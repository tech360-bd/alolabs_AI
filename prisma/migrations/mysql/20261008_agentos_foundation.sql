-- ALO Labs AgentOS foundation (2026-10-08) — ADDITIVE MySQL migration.
-- Apply ONLY after taking a consistent backup of the existing database.
-- No existing table is dropped or renamed. Existing Agent/Skill/Task/Workflow/
-- Approval/Memory rows are untouched. Requires MySQL 8.0+ / InnoDB.
-- Production operators should validate this migration against a restored
-- staging copy first, then record it in their deployment migration ledger.

CREATE TABLE IF NOT EXISTS `Project` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `objective` LONGTEXT NOT NULL,
  `description` LONGTEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `settings` LONGTEXT NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `ownerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Project_companyId_idx` (`companyId`),
  INDEX `Project_ownerId_idx` (`ownerId`),
  INDEX `Project_status_idx` (`status`),
  INDEX `Project_createdAt_idx` (`createdAt`),
  CONSTRAINT `Project_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Project_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Artifact` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'text',
  `content` LONGTEXT NOT NULL,
  `storagePath` LONGTEXT NULL,
  `mimeType` VARCHAR(191) NOT NULL DEFAULT 'text/plain',
  `size` INTEGER NOT NULL DEFAULT 0,
  `checksum` VARCHAR(191) NOT NULL DEFAULT '',
  `version` INTEGER NOT NULL DEFAULT 1,
  `metadata` LONGTEXT NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `runId` VARCHAR(191) NULL,
  `agentId` VARCHAR(191) NULL,
  `companyId` VARCHAR(191) NULL,
  `createdBy` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Artifact_projectId_idx` (`projectId`),
  INDEX `Artifact_taskId_idx` (`taskId`),
  INDEX `Artifact_runId_idx` (`runId`),
  INDEX `Artifact_companyId_idx` (`companyId`),
  INDEX `Artifact_type_idx` (`type`),
  INDEX `Artifact_createdAt_idx` (`createdAt`),
  CONSTRAINT `Artifact_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Artifact_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Artifact_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RunEvent` (
  `id` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL DEFAULT 'system',
  `agentId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `data` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `RunEvent_runId_idx` (`runId`),
  INDEX `RunEvent_runId_createdAt_idx` (`runId`, `createdAt`),
  INDEX `RunEvent_type_idx` (`type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AgentOSRun` (
  `id` VARCHAR(191) NOT NULL,
  `objective` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `plan` LONGTEXT NOT NULL,
  `summary` LONGTEXT NULL,
  `error` LONGTEXT NULL,
  `commandId` VARCHAR(191) NULL,
  `projectId` VARCHAR(191) NULL,
  `workflowId` VARCHAR(191) NULL,
  `companyId` VARCHAR(191) NULL,
  `userId` VARCHAR(191) NULL,
  `priority` VARCHAR(191) NOT NULL DEFAULT 'normal',
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AgentOSRun_companyId_idx` (`companyId`),
  INDEX `AgentOSRun_userId_idx` (`userId`),
  INDEX `AgentOSRun_projectId_idx` (`projectId`),
  INDEX `AgentOSRun_workflowId_idx` (`workflowId`),
  INDEX `AgentOSRun_status_idx` (`status`),
  INDEX `AgentOSRun_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
