-- Phase 2: Private AI-as-a-Service Platform — additive migration
-- Date: 2026-11-11
-- Branch: phase-2/security-first-architecture
--
-- All CREATE TABLE only. No DROP, no destructive ALTER on existing tables.
-- Rollback: see 20261111_phase2_rollback.sql

-- Service catalog (platform-wide, no tenant column by design)
CREATE TABLE IF NOT EXISTS `Service` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'ai',
  `endpoint` VARCHAR(191) NULL,
  `scope` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Service_slug_key` (`slug`),
  INDEX `Service_category_isActive_idx` (`category`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Per-tenant service entitlements
CREATE TABLE IF NOT EXISTS `Entitlement` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `serviceId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `quotaLimit` INT NOT NULL DEFAULT 1000,
  `quotaUsed` INT NOT NULL DEFAULT 0,
  `quotaPeriod` VARCHAR(191) NOT NULL DEFAULT 'monthly',
  `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `revokedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Entitlement_companyId_serviceId_key` (`companyId`, `serviceId`),
  INDEX `Entitlement_companyId_status_idx` (`companyId`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Entitlement_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Project discovery records
CREATE TABLE IF NOT EXISTS `ProjectDiscovery` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(191) NOT NULL,
  `targetUrl` VARCHAR(191) NULL,
  `authorization` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `summary` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ProjectDiscovery_companyId_projectId_idx` (`companyId`, `projectId`),
  INDEX `ProjectDiscovery_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Capability assessments (per discovery)
CREATE TABLE IF NOT EXISTS `CapabilityAssessment` (
  `id` VARCHAR(191) NOT NULL,
  `discoveryId` VARCHAR(191) NOT NULL,
  `capability` VARCHAR(191) NOT NULL,
  `classification` VARCHAR(191) NOT NULL,
  `evidence` TEXT NULL,
  `confidence` FLOAT NOT NULL DEFAULT 0.0,
  `recommendation` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CapabilityAssessment_discoveryId_idx` (`discoveryId`),
  INDEX `CapabilityAssessment_classification_idx` (`classification`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CapabilityAssessment_discoveryId_fkey` FOREIGN KEY (`discoveryId`) REFERENCES `ProjectDiscovery`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Outbound webhook delivery log
CREATE TABLE IF NOT EXISTS `WebhookDeliveryLog` (
  `id` VARCHAR(191) NOT NULL,
  `webhookId` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `payload` TEXT NOT NULL,
  `signature` VARCHAR(191) NOT NULL,
  `targetUrl` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `attempts` INT NOT NULL DEFAULT 0,
  `lastAttemptAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WebhookDeliveryLog_eventId_key` (`eventId`),
  INDEX `WebhookDeliveryLog_companyId_eventType_idx` (`companyId`, `eventType`),
  INDEX `WebhookDeliveryLog_webhookId_status_idx` (`webhookId`, `status`),
  INDEX `WebhookDeliveryLog_status_createdAt_idx` (`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Role migration audit trail
CREATE TABLE IF NOT EXISTS `RoleMigration` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `oldRole` VARCHAR(191) NOT NULL,
  `newRole` VARCHAR(191) NOT NULL,
  `mappedBy` VARCHAR(191) NOT NULL,
  `mappedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `appliedAt` DATETIME(3) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `notes` TEXT NULL,
  UNIQUE INDEX `RoleMigration_userId_oldRole_newRole_key` (`userId`, `oldRole`, `newRole`),
  INDEX `RoleMigration_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
