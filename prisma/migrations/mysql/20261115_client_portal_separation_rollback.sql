-- ALO Labs client-portal separation (2026-11-15) — ROLLBACK.
--
-- Removes the structures created by 20261115_client_portal_separation.sql.
--
-- DESTRUCTIVE: dropping the Client* tables deletes every client project,
-- message, document record, deliverable, quotation, invoice, payment, ticket
-- and notification. Export them first. Uploaded files in object storage are
-- NOT removed by this script.
--
-- SECURITY: rolling back the schema does not, and must not, be paired with
-- rolling the application back to a build that lets customer logins into the
-- internal platform. `Company.accountType` is deliberately KEPT: it is the
-- column the application uses to refuse customer API keys on the internal API,
-- and dropping it while customer companies exist would make them
-- indistinguishable from internal tenants. Remove it manually only after every
-- 'client' company has been deleted or reclassified:
--   ALTER TABLE `Company` DROP INDEX `Company_accountType_idx`, DROP COLUMN `accountType`;
--
-- Status: UNVERIFIED against a live MySQL server.

-- Children first (they reference ClientAccount.companyId).
DROP TABLE IF EXISTS `ClientProjectExecution`;
DROP TABLE IF EXISTS `ClientNotification`;
DROP TABLE IF EXISTS `ClientSupportTicket`;
DROP TABLE IF EXISTS `ClientPayment`;
DROP TABLE IF EXISTS `ClientInvoice`;
DROP TABLE IF EXISTS `ClientQuotation`;
DROP TABLE IF EXISTS `ClientActivity`;
DROP TABLE IF EXISTS `ClientDeliverable`;
DROP TABLE IF EXISTS `ClientDocument`;
DROP TABLE IF EXISTS `ClientMessage`;
DROP TABLE IF EXISTS `ClientProjectMilestone`;
DROP TABLE IF EXISTS `ClientProject`;
DROP TABLE IF EXISTS `ClientAccount`;
DROP TABLE IF EXISTS `ServiceOffering`;
