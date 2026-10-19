-- ALO Labs multi-company AI control plane (2026-10-19) — additive MySQL migration.
--
-- This file is NOT applied automatically by deploy.sh. Do not run it against a
-- production database until a verified backup has been made and restored in a
-- staging environment. It preserves existing rows: new tenant columns are
-- nullable and no legacy/global record is automatically assigned to a tenant.
--
-- Prerequisites: MySQL 8.0+ / MariaDB with InnoDB; existing AgentOS schema.
-- Validation must include schema comparison, foreign-key/index inspection,
-- tenant-isolation tests, and a restore test before production approval.

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

-- ─── Additive tenant attribution to existing records ───────────────────────
CALL alo_add_column_if_missing('Task', 'companyId', 'VARCHAR(191) NULL');
CALL alo_add_index_if_missing('Task', 'Task_companyId_createdAt_idx', 'INDEX `Task_companyId_createdAt_idx` (`companyId`, `createdAt`)');
CALL alo_add_fk_if_missing('Task', 'Task_companyId_fkey', 'CONSTRAINT `Task_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

CALL alo_add_column_if_missing('AgentUsageSummary', 'companyId', 'VARCHAR(191) NULL');
CALL alo_add_index_if_missing('AgentUsageSummary', 'AgentUsageSummary_companyId_agentId_period_idx', 'INDEX `AgentUsageSummary_companyId_agentId_period_idx` (`companyId`, `agentId`, `period`)');
CALL alo_add_fk_if_missing('AgentUsageSummary', 'AgentUsageSummary_companyId_fkey', 'CONSTRAINT `AgentUsageSummary_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

CALL alo_add_column_if_missing('KnowledgeNode', 'companyId', 'VARCHAR(191) NULL');
CALL alo_add_index_if_missing('KnowledgeNode', 'KnowledgeNode_companyId_type_domain_idx', 'INDEX `KnowledgeNode_companyId_type_domain_idx` (`companyId`, `type`, `domain`)');
CALL alo_add_fk_if_missing('KnowledgeNode', 'KnowledgeNode_companyId_fkey', 'CONSTRAINT `KnowledgeNode_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE');

-- Explicit and duplicate-friendly indexes on central identity membership queries.
CALL alo_add_index_if_missing('CompanyUser', 'CompanyUser_userId_idx', 'INDEX `CompanyUser_userId_idx` (`userId`)');
CALL alo_add_index_if_missing('CompanyUser', 'CompanyUser_companyId_role_idx', 'INDEX `CompanyUser_companyId_role_idx` (`companyId`, `role`)');

-- Provider configuration flags default to conservative values for all existing configs.
CALL alo_add_column_if_missing('AIProviderConfig', 'isLocal', 'BOOLEAN NOT NULL DEFAULT false');
CALL alo_add_column_if_missing('AIProviderConfig', 'fallbackEligible', 'BOOLEAN NOT NULL DEFAULT false');

-- ─── Tenant defaults and controls ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `CompanySettings` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `logoUrl` LONGTEXT NULL,
  `primaryColor` VARCHAR(191) NOT NULL DEFAULT '#003ABC',
  `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
  `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Dhaka',
  `externalDataProcessingApproved` BOOLEAN NOT NULL DEFAULT false,
  `confidentialDataExternalAllowed` BOOLEAN NOT NULL DEFAULT false,
  `dataProcessingPolicyUrl` LONGTEXT NULL,
  `settings` LONGTEXT NOT NULL,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CompanySettings_companyId_key` (`companyId`),
  CONSTRAINT `CompanySettings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CompanyBudget` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `monthlyTokenBudget` INTEGER NOT NULL DEFAULT 1000000,
  `dailyTokenBudget` INTEGER NOT NULL DEFAULT 50000,
  `maxPaidBudgetUsd` DOUBLE NOT NULL DEFAULT 0,
  `paidApiAllowed` BOOLEAN NOT NULL DEFAULT false,
  `autoBillingEnabled` BOOLEAN NOT NULL DEFAULT false,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CompanyBudget_companyId_key` (`companyId`),
  CONSTRAINT `CompanyBudget_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CompanyRole` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` LONGTEXT NULL,
  `permissions` LONGTEXT NOT NULL,
  `isSystem` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `company_role_name_uniq` (`companyId`, `name`),
  INDEX `company_role_company_idx` (`companyId`),
  CONSTRAINT `CompanyRole_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CompanyInvitation` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `role` VARCHAR(191) NOT NULL DEFAULT 'employee',
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `invitedBy` VARCHAR(191) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CompanyInvitation_tokenHash_key` (`tokenHash`),
  INDEX `company_invite_company_accepted_idx` (`companyId`, `acceptedAt`),
  INDEX `company_invite_email_idx` (`email`),
  CONSTRAINT `CompanyInvitation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CompanyKnowledgeDocument` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL DEFAULT 'text/plain',
  `classification` VARCHAR(191) NOT NULL DEFAULT 'confidential',
  `uploadedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `company_knowledge_company_created_idx` (`companyId`, `createdAt`),
  CONSTRAINT `CompanyKnowledgeDocument_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── Provider verification, tenant grants, policies and usage ledger ────────
CREATE TABLE IF NOT EXISTS `CompanyModelPermission` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `providerConfigId` VARCHAR(191) NOT NULL,
  `modelId` VARCHAR(191) NOT NULL,
  `isAllowed` BOOLEAN NOT NULL DEFAULT false,
  `allowPaid` BOOLEAN NOT NULL DEFAULT false,
  `grantedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `company_model_permission_uniq` (`companyId`, `providerConfigId`, `modelId`),
  INDEX `company_model_permission_company_allowed_idx` (`companyId`, `isAllowed`),
  CONSTRAINT `CompanyModelPermission_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CompanyModelPermission_providerConfigId_fkey` FOREIGN KEY (`providerConfigId`) REFERENCES `AIProviderConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ModelRoutingPolicy` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `profile` VARCHAR(191) NOT NULL,
  `allowedProviderConfigIds` LONGTEXT NOT NULL,
  `preferLocal` BOOLEAN NOT NULL DEFAULT true,
  `allowVerifiedFree` BOOLEAN NOT NULL DEFAULT true,
  `allowPaid` BOOLEAN NOT NULL DEFAULT false,
  `externalDataAllowed` BOOLEAN NOT NULL DEFAULT false,
  `fallbackBehavior` VARCHAR(191) NOT NULL DEFAULT 'defer',
  `maxOutputTokens` INTEGER NOT NULL DEFAULT 4096,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `model_routing_policy_company_profile_uniq` (`companyId`, `profile`),
  INDEX `model_routing_policy_company_profile_idx` (`companyId`, `profile`),
  CONSTRAINT `ModelRoutingPolicy_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AIProviderVerification` (
  `id` VARCHAR(191) NOT NULL,
  `providerConfigId` VARCHAR(191) NOT NULL,
  `officialDocsUrl` LONGTEXT NULL,
  `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `freeTierEligibility` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `verifiedModels` LONGTEXT NOT NULL,
  `pricingEvidenceUrl` LONGTEXT NULL,
  `pricingVerifiedAt` DATETIME(3) NULL,
  `verifiedModelCosts` LONGTEXT NOT NULL DEFAULT ('[]'),
  `commercialUse` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `rateLimitRequestsPerMinute` INTEGER NULL,
  `rateLimitTokensPerMinute` INTEGER NULL,
  `dailyQuotaTokens` INTEGER NULL,
  `monthlyQuotaTokens` INTEGER NULL,
  `quotaPeriod` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `apiCompatibility` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `dataRetention` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `billingBehavior` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `authenticationRequirements` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `notes` LONGTEXT NULL,
  `verifiedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ai_provider_verification_config_date_idx` (`providerConfigId`, `verifiedAt`),
  CONSTRAINT `AIProviderVerification_providerConfigId_fkey` FOREIGN KEY (`providerConfigId`) REFERENCES `AIProviderConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CALL alo_add_column_if_missing('AIProviderVerification', 'pricingEvidenceUrl', 'LONGTEXT NULL');
CALL alo_add_column_if_missing('AIProviderVerification', 'pricingVerifiedAt', 'DATETIME(3) NULL');
CALL alo_add_column_if_missing('AIProviderVerification', 'verifiedModelCosts', 'LONGTEXT NOT NULL DEFAULT (''[]'')');

CREATE TABLE IF NOT EXISTS `ProviderQuotaSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `providerConfigId` VARCHAR(191) NOT NULL,
  `quotaKind` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `quotaPeriod` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `limitRequests` INTEGER NULL,
  `limitTokens` INTEGER NULL,
  `remainingRequests` INTEGER NULL,
  `remainingTokens` INTEGER NULL,
  `estimatedUsedRequests` INTEGER NULL,
  `estimatedUsedTokens` INTEGER NULL,
  `resetAt` DATETIME(3) NULL,
  `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `officialSource` LONGTEXT NULL,
  `notes` LONGTEXT NULL,
  `recordedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `provider_quota_config_captured_idx` (`providerConfigId`, `capturedAt`),
  INDEX `provider_quota_kind_captured_idx` (`quotaKind`, `capturedAt`),
  CONSTRAINT `ProviderQuotaSnapshot_providerConfigId_fkey` FOREIGN KEY (`providerConfigId`) REFERENCES `AIProviderConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ModelUsageRecord` (
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NULL,
  `correlationId` VARCHAR(191) NULL,
  `companyId` VARCHAR(191) NULL,
  `departmentId` VARCHAR(191) NULL,
  `userId` VARCHAR(191) NULL,
  `agentId` VARCHAR(191) NULL,
  `workflowId` VARCHAR(191) NULL,
  `providerConfigId` VARCHAR(191) NULL,
  `provider` VARCHAR(191) NULL,
  `model` VARCHAR(191) NULL,
  `profile` VARCHAR(191) NOT NULL DEFAULT 'free_general',
  `status` VARCHAR(191) NOT NULL DEFAULT 'running',
  `inputTokens` INTEGER NOT NULL DEFAULT 0,
  `outputTokens` INTEGER NOT NULL DEFAULT 0,
  `totalTokens` INTEGER NOT NULL DEFAULT 0,
  `usageSource` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `estimatedCostUsd` DOUBLE NULL,
  `confirmedCostUsd` DOUBLE NULL,
  `providerReportedCostUsd` DOUBLE NULL,
  `latencyMs` INTEGER NULL,
  `rateLimitResponse` BOOLEAN NOT NULL DEFAULT false,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `model_usage_company_created_idx` (`companyId`, `createdAt`),
  INDEX `model_usage_department_created_idx` (`departmentId`, `createdAt`),
  INDEX `model_usage_user_created_idx` (`userId`, `createdAt`),
  INDEX `model_usage_agent_created_idx` (`agentId`, `createdAt`),
  INDEX `model_usage_workflow_created_idx` (`workflowId`, `createdAt`),
  INDEX `model_usage_provider_model_created_idx` (`provider`, `model`, `createdAt`),
  INDEX `model_usage_correlation_idx` (`correlationId`),
  CONSTRAINT `ModelUsageRecord_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ModelUsageRecord_providerConfigId_fkey` FOREIGN KEY (`providerConfigId`) REFERENCES `AIProviderConfig` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── Encrypted tenant integrations, audit trail and backup ledger ──────────
CREATE TABLE IF NOT EXISTS `IntegrationCredential` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `integrationType` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `baseUrl` LONGTEXT NULL,
  `encryptedSecret` LONGTEXT NULL,
  `secretFingerprint` VARCHAR(191) NULL,
  `settings` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'configured',
  `createdBy` VARCHAR(191) NULL,
  `lastVerifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `integration_credential_tenant_type_name_uniq` (`companyId`, `integrationType`, `name`),
  INDEX `integration_credential_company_type_idx` (`companyId`, `integrationType`),
  CONSTRAINT `IntegrationCredential_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AuditEvent` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NULL,
  `actorUserId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `resource` VARCHAR(191) NOT NULL,
  `resourceId` VARCHAR(191) NULL,
  `requestId` VARCHAR(191) NULL,
  `details` LONGTEXT NOT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `audit_event_company_created_idx` (`companyId`, `createdAt`),
  INDEX `audit_event_actor_created_idx` (`actorUserId`, `createdAt`),
  INDEX `audit_event_action_created_idx` (`action`, `createdAt`),
  CONSTRAINT `AuditEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BackupRecord` (
  `id` VARCHAR(191) NOT NULL,
  `backupId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `status` VARCHAR(191) NOT NULL DEFAULT 'created',
  `location` VARCHAR(191) NOT NULL,
  `manifest` LONGTEXT NOT NULL,
  `checksum` VARCHAR(191) NOT NULL DEFAULT '',
  `sizeBytes` BIGINT NOT NULL DEFAULT 0,
  `appVersion` VARCHAR(191) NULL,
  `commit` VARCHAR(191) NULL,
  `schemaVersion` VARCHAR(191) NULL,
  `verifiedAt` DATETIME(3) NULL,
  `restoreTestedAt` DATETIME(3) NULL,
  `retentionUntil` DATETIME(3) NULL,
  `createdBy` VARCHAR(191) NULL,
  `error` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BackupRecord_backupId_key` (`backupId`),
  INDEX `BackupRecord_status_idx` (`status`),
  INDEX `BackupRecord_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── Distinct logical AI employee identities (not model workers) ───────────
-- No rows are seeded here. The read-only/dry-run workforce tool must first
-- verify existing managed agents and tenant ownership. Provisioning later adds
-- one identity per approved primary agent and leaves every row provisioned;
-- only execution evidence plus an authorized lifecycle transition can activate.
CREATE TABLE IF NOT EXISTS `AIEmployeeIdentity` (
  `id` VARCHAR(191) NOT NULL,
  `employeeKey` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NOT NULL,
  `agentDbId` VARCHAR(191) NOT NULL,
  `roleKey` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `responsibilities` LONGTEXT NOT NULL,
  `modelPolicy` VARCHAR(191) NOT NULL,
  `allowedTools` LONGTEXT NOT NULL DEFAULT ('[]'),
  `permissionProfile` LONGTEXT NOT NULL DEFAULT ('{}'),
  `memoryScope` LONGTEXT NOT NULL DEFAULT ('{}'),
  `resourceLimits` LONGTEXT NOT NULL DEFAULT ('{}'),
  `approvalPolicy` LONGTEXT NOT NULL DEFAULT ('{}'),
  `status` VARCHAR(191) NOT NULL DEFAULT 'provisioned',
  `statusReason` LONGTEXT NULL,
  `managedBy` VARCHAR(191) NULL,
  `planVersion` VARCHAR(191) NULL,
  `configurationHash` VARCHAR(191) NOT NULL,
  `supervisorEmployeeKey` VARCHAR(191) NULL,
  `lastVerifiedAt` DATETIME(3) NULL,
  `lastVerificationExecutionId` VARCHAR(191) NULL,
  `createdBy` VARCHAR(191) NULL,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ai_employee_company_employee_key_uniq` (`companyId`, `employeeKey`),
  UNIQUE INDEX `ai_employee_company_agent_uniq` (`companyId`, `agentDbId`),
  UNIQUE INDEX `ai_employee_verification_execution_uniq` (`lastVerificationExecutionId`),
  INDEX `ai_employee_company_department_status_idx` (`companyId`, `departmentId`, `status`),
  INDEX `ai_employee_company_status_updated_idx` (`companyId`, `status`, `updatedAt`),
  INDEX `ai_employee_supervisor_idx` (`supervisorEmployeeKey`),
  CONSTRAINT `AIEmployeeIdentity_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AIEmployeeIdentity_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AIEmployeeIdentity_agentDbId_fkey` FOREIGN KEY (`agentDbId`) REFERENCES `Agent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AIEmployeeIdentity_lastVerificationExecutionId_fkey` FOREIGN KEY (`lastVerificationExecutionId`) REFERENCES `AgentExecution` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Deliberately no UPDATE/backfill: Task, AgentUsageSummary, KnowledgeNode, and
-- legacy documents without a company owner remain unassigned until an operator
-- reviews provenance and performs an explicitly authorized, audited backfill.
