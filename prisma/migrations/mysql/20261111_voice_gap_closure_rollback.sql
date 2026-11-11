-- ALO Labs voice contact-center gap closure (2026-11-11) — ROLLBACK.
--
-- Removes the additive structures created by 20261111_voice_gap_closure.sql.
-- Column/table drops are DESTRUCTIVE: run only after confirming no live data
-- depends on them. CallSession.language / contactId and the Campaign lifecycle
-- columns are kept (dropping them would lose conversation evidence); remove
-- manually if a full schema revert is required.

DROP TABLE IF EXISTS `VoiceIdempotencyKey`;
DROP TABLE IF EXISTS `TelephonyProviderConfig`;
DROP TABLE IF EXISTS `CustomerConsent`;
DROP TABLE IF EXISTS `Appointment`;
DROP TABLE IF EXISTS `Escalation`;

-- Remove the duplicate-prevention index (rows stay; uniqueness no longer
-- enforced until the forward migration is re-applied).
SET @ddl = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `CampaignCall` DROP INDEX `CampaignCall_campaignId_destinationNumber_key`',
    'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CampaignCall'
    AND INDEX_NAME = 'CampaignCall_campaignId_destinationNumber_key'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
