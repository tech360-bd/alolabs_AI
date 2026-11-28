-- Ecosystem Control Plane, Asset Vault, Coding Harnesses, Tools, Meetings & Workflow Integrations
-- Date: 2026-11-28
-- Additive only. Paired rollback: 20261128_ecosystem_control_plane_rollback.sql

CREATE TABLE IF NOT EXISTS `ExternalSource` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `url` LONGTEXT NOT NULL,
  `sourceKind` VARCHAR(191) NOT NULL DEFAULT 'repository',
  `displayName` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `availability` VARCHAR(191) NOT NULL DEFAULT 'verified',
  `paginationTotal` INTEGER NOT NULL DEFAULT 1,
  `reposDiscovered` INTEGER NOT NULL DEFAULT 1,
  `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notes` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ExternalSource_slug_key` (`slug`),
  INDEX `ExternalSource_sourceKind_category_idx` (`sourceKind`, `category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ExternalAsset` (
  `id` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'repository',
  `defaultBranch` VARCHAR(191) NOT NULL DEFAULT 'main',
  `headSha` VARCHAR(191) NULL,
  `stars` INTEGER NOT NULL DEFAULT 0,
  `language` VARCHAR(191) NULL,
  `archived` BOOLEAN NOT NULL DEFAULT false,
  `licenseSpdx` VARCHAR(191) NULL,
  `compatibilityStatus` VARCHAR(191) NOT NULL DEFAULT 'candidate',
  `integrationPattern` VARCHAR(191) NOT NULL DEFAULT 'API_INTEGRATE',
  `assetCategory` VARCHAR(191) NOT NULL DEFAULT 'general',
  `isPinned` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `metadataJson` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ExternalAsset_url_key` (`url`),
  INDEX `ExternalAsset_sourceId_idx` (`sourceId`),
  INDEX `ExternalAsset_compatibilityStatus_assetCategory_idx` (`compatibilityStatus`, `assetCategory`),
  INDEX `ExternalAsset_licenseSpdx_idx` (`licenseSpdx`),
  CONSTRAINT `ExternalAsset_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ExternalSource` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Integration` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NULL,
  `companyId` VARCHAR(191) NULL,
  `strategy` VARCHAR(191) NOT NULL DEFAULT 'API_INTEGRATE',
  `licenseClass` VARCHAR(191) NOT NULL DEFAULT 'permissive',
  `status` VARCHAR(191) NOT NULL DEFAULT 'configured',
  `activeVersionId` VARCHAR(191) NULL,
  `isPinned` BOOLEAN NOT NULL DEFAULT true,
  `configJson` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Integration_slug_key` (`slug`),
  INDEX `Integration_category_status_idx` (`category`, `status`),
  INDEX `Integration_companyId_idx` (`companyId`),
  INDEX `Integration_assetId_idx` (`assetId`),
  CONSTRAINT `Integration_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `ExternalAsset` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `IntegrationVersion` (
  `id` VARCHAR(191) NOT NULL,
  `integrationId` VARCHAR(191) NOT NULL,
  `version` VARCHAR(191) NOT NULL,
  `pinnedRef` VARCHAR(191) NOT NULL,
  `sha256` LONGTEXT NULL,
  `sbomJson` LONGTEXT NULL,
  `changelog` LONGTEXT NULL,
  `rollbackFromId` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT false,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `IntegrationVersion_integrationId_version_key` (`integrationId`, `version`),
  INDEX `IntegrationVersion_integrationId_isActive_idx` (`integrationId`, `isActive`),
  CONSTRAINT `IntegrationVersion_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LicenseRecord` (
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `spdxId` VARCHAR(191) NOT NULL,
  `licenseFile` VARCHAR(191) NULL,
  `verifiedBy` VARCHAR(191) NOT NULL DEFAULT 'github-api-license-check',
  `copyleftScope` VARCHAR(191) NOT NULL DEFAULT 'none',
  `commercialAllowed` BOOLEAN NOT NULL DEFAULT true,
  `redistributionAllowed` BOOLEAN NOT NULL DEFAULT true,
  `boundaryRequired` VARCHAR(191) NOT NULL DEFAULT 'none',
  `verdict` VARCHAR(191) NOT NULL DEFAULT 'approved',
  `summary` LONGTEXT NULL,
  `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `LicenseRecord_assetId_verdict_idx` (`assetId`, `verdict`),
  INDEX `LicenseRecord_spdxId_idx` (`spdxId`),
  CONSTRAINT `LicenseRecord_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `ExternalAsset` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SecurityReview` (
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `riskLevel` VARCHAR(191) NOT NULL DEFAULT 'low',
  `ssrfChecked` BOOLEAN NOT NULL DEFAULT true,
  `credentialEncryption` BOOLEAN NOT NULL DEFAULT true,
  `sandboxRequired` BOOLEAN NOT NULL DEFAULT false,
  `approverId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'approved',
  `findingsJson` LONGTEXT NULL,
  `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `SecurityReview_assetId_status_idx` (`assetId`, `status`),
  INDEX `SecurityReview_riskLevel_idx` (`riskLevel`),
  CONSTRAINT `SecurityReview_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `ExternalAsset` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AgentHarness` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `harnessType` VARCHAR(191) NOT NULL DEFAULT 'coding',
  `upstreamRepo` VARCHAR(191) NULL,
  `licenseSpdx` VARCHAR(191) NOT NULL DEFAULT 'MIT',
  `sandboxMode` VARCHAR(191) NOT NULL DEFAULT 'isolated_worktree',
  `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  `requiresApproval` BOOLEAN NOT NULL DEFAULT true,
  `healthStatus` VARCHAR(191) NOT NULL DEFAULT 'untested',
  `companyId` VARCHAR(191) NULL,
  `configJson` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AgentHarness_slug_key` (`slug`),
  INDEX `AgentHarness_harnessType_isEnabled_idx` (`harnessType`, `isEnabled`),
  INDEX `AgentHarness_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AgentSession` (
  `id` VARCHAR(191) NOT NULL,
  `harnessId` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `workspacePath` VARCHAR(191) NOT NULL,
  `branchName` VARCHAR(191) NOT NULL,
  `sandboxMode` VARCHAR(191) NOT NULL DEFAULT 'isolated_worktree',
  `status` VARCHAR(191) NOT NULL DEFAULT 'awaiting_approval',
  `requiresApproval` BOOLEAN NOT NULL DEFAULT true,
  `approvedBy` VARCHAR(191) NULL,
  `approvedAt` DATETIME(3) NULL,
  `modelUsed` VARCHAR(191) NULL,
  `providerUsed` VARCHAR(191) NULL,
  `tokenUsage` INTEGER NOT NULL DEFAULT 0,
  `promptSummary` LONGTEXT NULL,
  `diffSummaryJson` LONGTEXT NULL,
  `errorMessage` LONGTEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `AgentSession_companyId_status_idx` (`companyId`, `status`),
  INDEX `AgentSession_harnessId_startedAt_idx` (`harnessId`, `startedAt`),
  INDEX `AgentSession_userId_idx` (`userId`),
  CONSTRAINT `AgentSession_harnessId_fkey` FOREIGN KEY (`harnessId`) REFERENCES `AgentHarness` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ToolRegistry` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'agent',
  `companyId` VARCHAR(191) NULL,
  `requiresApproval` BOOLEAN NOT NULL DEFAULT false,
  `readOnly` BOOLEAN NOT NULL DEFAULT true,
  `optimizationPolicy` VARCHAR(191) NOT NULL DEFAULT 'dedupe_and_compact',
  `batchCapable` BOOLEAN NOT NULL DEFAULT true,
  `schemaJson` LONGTEXT NULL,
  `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  `callsCount` INTEGER NOT NULL DEFAULT 0,
  `tokensSaved` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ToolRegistry_slug_key` (`slug`),
  INDEX `ToolRegistry_category_isEnabled_idx` (`category`, `isEnabled`),
  INDEX `ToolRegistry_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MeetingSession` (
  `id` VARCHAR(191) NOT NULL,
  `roomCode` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `providerKind` VARCHAR(191) NOT NULL DEFAULT 'livekit',
  `companyId` VARCHAR(191) NOT NULL,
  `hostUserId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
  `meetingUrl` LONGTEXT NULL,
  `participantsJson` LONGTEXT NULL,
  `recordingState` VARCHAR(191) NOT NULL DEFAULT 'idle',
  `obsScene` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MeetingSession_roomCode_key` (`roomCode`),
  INDEX `MeetingSession_companyId_status_idx` (`companyId`, `status`),
  INDEX `MeetingSession_hostUserId_idx` (`hostUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WorkflowIntegration` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `engineKind` VARCHAR(191) NOT NULL DEFAULT 'activepieces',
  `companyId` VARCHAR(191) NULL,
  `endpointUrl` LONGTEXT NULL,
  `healthStatus` VARCHAR(191) NOT NULL DEFAULT 'unconfigured',
  `licenseVerdict` VARCHAR(191) NOT NULL DEFAULT 'approved',
  `requiresApproval` BOOLEAN NOT NULL DEFAULT false,
  `isEnabled` BOOLEAN NOT NULL DEFAULT false,
  `policyJson` LONGTEXT NULL,
  `lastTestedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `WorkflowIntegration_slug_key` (`slug`),
  INDEX `WorkflowIntegration_engineKind_isEnabled_idx` (`engineKind`, `isEnabled`),
  INDEX `WorkflowIntegration_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `IntegrationHealth` (
  `id` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL,
  `latencyMs` INTEGER NULL,
  `detail` LONGTEXT NULL,
  `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `IntegrationHealth_targetType_targetId_idx` (`targetType`, `targetId`),
  INDEX `IntegrationHealth_companyId_checkedAt_idx` (`companyId`, `checkedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
