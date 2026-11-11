-- Phase 2 rollback — drop only the Phase 2 additive tables.
-- Run only if Phase 2 must be rolled back. Existing tables are NOT affected.
-- Order: child tables first (FK constraints), then parent tables.

DROP TABLE IF EXISTS `RoleMigration`;
DROP TABLE IF EXISTS `WebhookDeliveryLog`;
DROP TABLE IF EXISTS `CapabilityAssessment`;
DROP TABLE IF EXISTS `ProjectDiscovery`;
DROP TABLE IF EXISTS `Entitlement`;
DROP TABLE IF EXISTS `Service`;
DROP TABLE IF EXISTS `IdempotencyKey`;
