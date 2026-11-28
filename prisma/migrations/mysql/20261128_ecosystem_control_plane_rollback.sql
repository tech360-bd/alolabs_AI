-- Rollback for 20261128_ecosystem_control_plane.sql (children first)
DROP TABLE IF EXISTS `IntegrationHealth`;
DROP TABLE IF EXISTS `WorkflowIntegration`;
DROP TABLE IF EXISTS `MeetingSession`;
DROP TABLE IF EXISTS `ToolRegistry`;
DROP TABLE IF EXISTS `AgentSession`;
DROP TABLE IF EXISTS `AgentHarness`;
DROP TABLE IF EXISTS `SecurityReview`;
DROP TABLE IF EXISTS `LicenseRecord`;
DROP TABLE IF EXISTS `IntegrationVersion`;
DROP TABLE IF EXISTS `Integration`;
DROP TABLE IF EXISTS `ExternalAsset`;
DROP TABLE IF EXISTS `ExternalSource`;
