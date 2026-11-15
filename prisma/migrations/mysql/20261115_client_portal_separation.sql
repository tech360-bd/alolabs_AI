-- ALO Labs client-portal separation (2026-11-15) — ADDITIVE MySQL migration.
--
-- Separates the two audiences of the product at the data layer:
--   * Company.accountType  — 'internal' (an AgentOS tenant: ALO Labs or one of
--     its operating companies) or 'client' (a customer account).
--   * ClientAccount + Client* tables — everything a customer may see in the
--     client portal (projects, milestones, messages, documents, deliverables,
--     quotations, invoices, payments, support tickets, notifications).
--   * ServiceOffering — the published service catalogue.
--   * ClientProjectExecution — INTERNAL bridge from a client project to the
--     AgentOS run that produces it. Never exposed to the portal.
--
-- Every Client* table carries a mandatory companyId; all portal queries are
-- scoped by it (src/lib/portal/tenant-db.ts).
--
-- Status: UNVERIFIED against a live MySQL server (no MySQL in the build sandbox).
-- The DDL below was derived from prisma/schema.mysql.prisma; run it against a
-- staging copy and `npx tsx scripts/verify-mysql-compatibility.ts` before use.
-- Requires MySQL >= 8.0.13 (expression defaults on LONGTEXT columns).
-- Self-contained: (re)creates the alo_* helper procedures it uses.
-- Idempotent: safe to re-run.
--
-- ┌─ OPERATOR ACTION REQUIRED AFTER THIS MIGRATION ─────────────────────────────┐
-- │ 1. Review the Company backfill in step 1 below BEFORE running.             │
-- │ 2. Logins whose role is not an internal role (see INTERNAL_ROLES in        │
-- │    src/lib/access/surfaces.ts) lose access to the internal platform. Staff │
-- │    holding a legacy role (viewer / operator / manager) must be given an    │
-- │    internal role by a Super Admin. Step 3 lists the affected logins.       │
-- │ 3. Every session issued before this release that belongs to a non-internal │
-- │    login is rejected on first use; those users sign in again.              │
-- └────────────────────────────────────────────────────────────────────────────┘

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

-- ─── 1. Company.accountType ──────────────────────────────────────────────────
-- The column defaults to 'client' so that a company created by any path that
-- does not state its type can never be treated as internal (fail closed).
--
-- Backfill: the client-account concept did not exist before this migration.
-- Every Company row that already exists was provisioned by a Super Admin as an
-- AgentOS tenant (POST /api/companies or a seed script), so existing rows are
-- classified 'internal'. The backfill runs ONLY when the column is first added,
-- so re-running this file never reclassifies a customer account created later.
--
-- REVIEW: if any existing Company row is in fact a customer, reclassify it
-- right after this migration:
--   UPDATE `Company` SET `accountType` = 'client' WHERE `slug` IN ('…');
-- and create its ClientAccount through POST /api/internal/clients.

SET @alo_account_type_missing = (
  SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'accountType'
);

CALL alo_add_column_if_missing('Company', 'accountType', 'VARCHAR(191) NOT NULL DEFAULT ''client''');
CALL alo_add_index_if_missing('Company', 'Company_accountType_idx', 'INDEX `Company_accountType_idx` (`accountType`)');

SET @ddl = IF(@alo_account_type_missing,
  'UPDATE `Company` SET `accountType` = ''internal''',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 2. Client-services tables ───────────────────────────────────────────────

-- ─── ClientAccount ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientAccount` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `accountManagerName` VARCHAR(191) NULL,
  `accountManagerTitle` VARCHAR(191) NULL,
  `accountManagerEmail` VARCHAR(191) NULL,
  `accountManagerPhone` VARCHAR(191) NULL,
  `billingEmail` VARCHAR(191) NULL,
  `billingAddress` LONGTEXT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `internalNotes` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientAccount', 'ClientAccount_companyId_key', 'UNIQUE INDEX `ClientAccount_companyId_key` (`companyId`)');
CALL alo_add_index_if_missing('ClientAccount', 'ClientAccount_status_idx', 'INDEX `ClientAccount_status_idx` (`status`)');

-- ─── ServiceOffering ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ServiceOffering` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'general',
  `summary` LONGTEXT NOT NULL DEFAULT (''),
  `description` LONGTEXT NOT NULL DEFAULT (''),
  `benefits` LONGTEXT NOT NULL DEFAULT ('[]'),
  `deliverables` LONGTEXT NOT NULL DEFAULT ('[]'),
  `scope` LONGTEXT NOT NULL DEFAULT (''),
  `pricingModel` VARCHAR(191) NOT NULL DEFAULT 'quote',
  `priceAmount` DOUBLE NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `billingInterval` VARCHAR(191) NULL,
  `deliveryTimeframe` VARCHAR(191) NOT NULL DEFAULT '',
  `terms` LONGTEXT NOT NULL DEFAULT (''),
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `internalFulfilment` LONGTEXT NOT NULL DEFAULT ('{}'),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ServiceOffering', 'ServiceOffering_slug_key', 'UNIQUE INDEX `ServiceOffering_slug_key` (`slug`)');
CALL alo_add_index_if_missing('ServiceOffering', 'ServiceOffering_isActive_sortOrder_idx', 'INDEX `ServiceOffering_isActive_sortOrder_idx` (`isActive`, `sortOrder`)');
CALL alo_add_index_if_missing('ServiceOffering', 'ServiceOffering_category_idx', 'INDEX `ServiceOffering_category_idx` (`category`)');

-- ─── ClientProject ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientProject` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(191) NOT NULL,
  `serviceOfferingId` VARCHAR(191) NULL,
  `serviceName` VARCHAR(191) NOT NULL DEFAULT '',
  `title` VARCHAR(191) NOT NULL,
  `requirements` LONGTEXT NOT NULL DEFAULT (''),
  `status` VARCHAR(191) NOT NULL DEFAULT 'requested',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `pendingClientAction` LONGTEXT NULL,
  `targetDate` DATETIME(3) NULL,
  `requestedByUserId` VARCHAR(191) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientProject', 'ClientProject_reference_key', 'UNIQUE INDEX `ClientProject_reference_key` (`reference`)');
CALL alo_add_index_if_missing('ClientProject', 'ClientProject_companyId_status_idx', 'INDEX `ClientProject_companyId_status_idx` (`companyId`, `status`)');
CALL alo_add_index_if_missing('ClientProject', 'ClientProject_companyId_createdAt_idx', 'INDEX `ClientProject_companyId_createdAt_idx` (`companyId`, `createdAt`)');

-- ─── ClientProjectMilestone ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientProjectMilestone` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` LONGTEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `dueDate` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientProjectMilestone', 'ClientProjectMilestone_companyId_projectId_idx', 'INDEX `ClientProjectMilestone_companyId_projectId_idx` (`companyId`, `projectId`)');

-- ─── ClientMessage ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientMessage` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `threadType` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NOT NULL,
  `senderType` VARCHAR(191) NOT NULL,
  `senderName` VARCHAR(191) NOT NULL,
  `senderUserId` VARCHAR(191) NULL,
  `body` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientMessage', 'ClientMessage_companyId_threadType_threadId_idx', 'INDEX `ClientMessage_companyId_threadType_threadId_idx` (`companyId`, `threadType`, `threadId`)');

-- ─── ClientDocument ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientDocument` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `ticketId` VARCHAR(191) NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'requirement',
  `fileName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL DEFAULT 'application/octet-stream',
  `size` INTEGER NOT NULL DEFAULT 0,
  `checksum` VARCHAR(191) NOT NULL DEFAULT '',
  `storageKey` VARCHAR(191) NOT NULL,
  `uploadedByType` VARCHAR(191) NOT NULL DEFAULT 'client',
  `uploadedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientDocument', 'ClientDocument_companyId_projectId_idx', 'INDEX `ClientDocument_companyId_projectId_idx` (`companyId`, `projectId`)');
CALL alo_add_index_if_missing('ClientDocument', 'ClientDocument_companyId_ticketId_idx', 'INDEX `ClientDocument_companyId_ticketId_idx` (`companyId`, `ticketId`)');

-- ─── ClientDeliverable ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientDeliverable` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` LONGTEXT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'document',
  `version` INTEGER NOT NULL DEFAULT 1,
  `isFinal` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(191) NOT NULL DEFAULT 'delivered',
  `documentId` VARCHAR(191) NULL,
  `downloadUrl` LONGTEXT NULL,
  `revisionNote` LONGTEXT NULL,
  `deliveredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,
  `reviewedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientDeliverable', 'ClientDeliverable_companyId_projectId_idx', 'INDEX `ClientDeliverable_companyId_projectId_idx` (`companyId`, `projectId`)');
CALL alo_add_index_if_missing('ClientDeliverable', 'ClientDeliverable_companyId_status_idx', 'INDEX `ClientDeliverable_companyId_status_idx` (`companyId`, `status`)');

-- ─── ClientActivity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientActivity` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `summary` LONGTEXT NOT NULL,
  `actorType` VARCHAR(191) NOT NULL DEFAULT 'service_team',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientActivity', 'ClientActivity_companyId_projectId_createdAt_idx', 'INDEX `ClientActivity_companyId_projectId_createdAt_idx` (`companyId`, `projectId`, `createdAt`)');
CALL alo_add_index_if_missing('ClientActivity', 'ClientActivity_companyId_entityType_entityId_idx', 'INDEX `ClientActivity_companyId_entityType_entityId_idx` (`companyId`, `entityType`, `entityId`)');

-- ─── ClientQuotation ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientQuotation` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `number` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `lineItems` LONGTEXT NOT NULL DEFAULT ('[]'),
  `subtotal` DOUBLE NOT NULL DEFAULT 0,
  `tax` DOUBLE NOT NULL DEFAULT 0,
  `total` DOUBLE NOT NULL DEFAULT 0,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `status` VARCHAR(191) NOT NULL DEFAULT 'sent',
  `validUntil` DATETIME(3) NULL,
  `notes` LONGTEXT NULL,
  `terms` LONGTEXT NULL,
  `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `respondedAt` DATETIME(3) NULL,
  `respondedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientQuotation', 'ClientQuotation_number_key', 'UNIQUE INDEX `ClientQuotation_number_key` (`number`)');
CALL alo_add_index_if_missing('ClientQuotation', 'ClientQuotation_companyId_status_idx', 'INDEX `ClientQuotation_companyId_status_idx` (`companyId`, `status`)');
CALL alo_add_index_if_missing('ClientQuotation', 'ClientQuotation_companyId_projectId_idx', 'INDEX `ClientQuotation_companyId_projectId_idx` (`companyId`, `projectId`)');

-- ─── ClientInvoice ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientInvoice` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `quotationId` VARCHAR(191) NULL,
  `number` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL DEFAULT '',
  `lineItems` LONGTEXT NOT NULL DEFAULT ('[]'),
  `subtotal` DOUBLE NOT NULL DEFAULT 0,
  `tax` DOUBLE NOT NULL DEFAULT 0,
  `total` DOUBLE NOT NULL DEFAULT 0,
  `amountPaid` DOUBLE NOT NULL DEFAULT 0,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `status` VARCHAR(191) NOT NULL DEFAULT 'issued',
  `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dueDate` DATETIME(3) NOT NULL,
  `paidAt` DATETIME(3) NULL,
  `notes` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientInvoice', 'ClientInvoice_number_key', 'UNIQUE INDEX `ClientInvoice_number_key` (`number`)');
CALL alo_add_index_if_missing('ClientInvoice', 'ClientInvoice_companyId_status_idx', 'INDEX `ClientInvoice_companyId_status_idx` (`companyId`, `status`)');
CALL alo_add_index_if_missing('ClientInvoice', 'ClientInvoice_companyId_projectId_idx', 'INDEX `ClientInvoice_companyId_projectId_idx` (`companyId`, `projectId`)');

-- ─── ClientPayment ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientPayment` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `invoiceId` VARCHAR(191) NOT NULL,
  `receiptNumber` VARCHAR(191) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `method` VARCHAR(191) NOT NULL DEFAULT 'bank_transfer',
  `reference` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
  `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `recordedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientPayment', 'ClientPayment_receiptNumber_key', 'UNIQUE INDEX `ClientPayment_receiptNumber_key` (`receiptNumber`)');
CALL alo_add_index_if_missing('ClientPayment', 'ClientPayment_companyId_invoiceId_idx', 'INDEX `ClientPayment_companyId_invoiceId_idx` (`companyId`, `invoiceId`)');

-- ─── ClientSupportTicket ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientSupportTicket` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'general',
  `priority` VARCHAR(191) NOT NULL DEFAULT 'normal',
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `projectId` VARCHAR(191) NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `firstResponseAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolutionSummary` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientSupportTicket', 'ClientSupportTicket_reference_key', 'UNIQUE INDEX `ClientSupportTicket_reference_key` (`reference`)');
CALL alo_add_index_if_missing('ClientSupportTicket', 'ClientSupportTicket_companyId_status_idx', 'INDEX `ClientSupportTicket_companyId_status_idx` (`companyId`, `status`)');
CALL alo_add_index_if_missing('ClientSupportTicket', 'ClientSupportTicket_companyId_createdAt_idx', 'INDEX `ClientSupportTicket_companyId_createdAt_idx` (`companyId`, `createdAt`)');

-- ─── ClientNotification ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientNotification` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `message` LONGTEXT NOT NULL,
  `link` VARCHAR(191) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientNotification', 'ClientNotification_companyId_userId_readAt_idx', 'INDEX `ClientNotification_companyId_userId_readAt_idx` (`companyId`, `userId`, `readAt`)');
CALL alo_add_index_if_missing('ClientNotification', 'ClientNotification_companyId_createdAt_idx', 'INDEX `ClientNotification_companyId_createdAt_idx` (`companyId`, `createdAt`)');

-- ─── ClientProjectExecution ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClientProjectExecution` (
  `id` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `workflowId` VARCHAR(191) NULL,
  `objective` LONGTEXT NOT NULL DEFAULT (''),
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `reviewedByUserId` VARCHAR(191) NULL,
  `reviewNotes` LONGTEXT NULL,
  `startedByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL alo_add_index_if_missing('ClientProjectExecution', 'ClientProjectExecution_projectId_idx', 'INDEX `ClientProjectExecution_projectId_idx` (`projectId`)');
CALL alo_add_index_if_missing('ClientProjectExecution', 'ClientProjectExecution_runId_idx', 'INDEX `ClientProjectExecution_runId_idx` (`runId`)');
CALL alo_add_index_if_missing('ClientProjectExecution', 'ClientProjectExecution_status_idx', 'INDEX `ClientProjectExecution_status_idx` (`status`)');

-- ─── Foreign keys (added after every table exists) ──────────────────────
CALL alo_add_fk_if_missing('ClientAccount', 'ClientAccount_companyId_fkey', 'CONSTRAINT `ClientAccount_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientProject', 'ClientProject_companyId_fkey', 'CONSTRAINT `ClientProject_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientProjectMilestone', 'ClientProjectMilestone_companyId_fkey', 'CONSTRAINT `ClientProjectMilestone_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientMessage', 'ClientMessage_companyId_fkey', 'CONSTRAINT `ClientMessage_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientDocument', 'ClientDocument_companyId_fkey', 'CONSTRAINT `ClientDocument_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientDeliverable', 'ClientDeliverable_companyId_fkey', 'CONSTRAINT `ClientDeliverable_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientActivity', 'ClientActivity_companyId_fkey', 'CONSTRAINT `ClientActivity_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientQuotation', 'ClientQuotation_companyId_fkey', 'CONSTRAINT `ClientQuotation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientInvoice', 'ClientInvoice_companyId_fkey', 'CONSTRAINT `ClientInvoice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientPayment', 'ClientPayment_companyId_fkey', 'CONSTRAINT `ClientPayment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientSupportTicket', 'ClientSupportTicket_companyId_fkey', 'CONSTRAINT `ClientSupportTicket_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');
CALL alo_add_fk_if_missing('ClientNotification', 'ClientNotification_companyId_fkey', 'CONSTRAINT `ClientNotification_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `ClientAccount` (`companyId`) ON DELETE CASCADE ON UPDATE CASCADE');

-- ─── 3. Review queries (read-only) ───────────────────────────────────────────
-- Logins that are NOT internal personnel after this release. Each is either a
-- customer (give them a client account via POST /api/internal/clients) or a
-- staff member on a legacy role (assign an internal role via PUT /api/users/:id).
SELECT `id`, `email`, `role`, `isActive`
FROM `User`
WHERE `role` NOT IN (
  'super_admin', 'admin', 'platform_super_admin', 'ai_workforce_admin',
  'ai_model_admin', 'security_admin', 'infrastructure_admin', 'account_manager'
)
ORDER BY `role`, `email`;

-- Classification of every company after the backfill.
SELECT `accountType`, COUNT(*) AS companies FROM `Company` GROUP BY `accountType`;

DROP PROCEDURE IF EXISTS alo_add_column_if_missing;
DROP PROCEDURE IF EXISTS alo_add_index_if_missing;
DROP PROCEDURE IF EXISTS alo_add_fk_if_missing;
