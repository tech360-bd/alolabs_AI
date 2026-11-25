-- Rollback for 20261125_super_admin_console.sql
-- Removes only the two tables that migration created. No other data touched.

DROP TABLE IF EXISTS `SiteDoctorProbe`;
DROP TABLE IF EXISTS `SiteContentBlock`;
