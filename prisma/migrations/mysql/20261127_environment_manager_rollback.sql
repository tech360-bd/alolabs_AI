-- Rollback for 20261127_environment_manager.sql.
-- Drops only the five tables that migration created, children first.
-- Nothing else references them, and no existing table is altered.
DROP TABLE IF EXISTS `EnvironmentApply`;
DROP TABLE IF EXISTS `EnvironmentConfigVersion`;
DROP TABLE IF EXISTS `EnvironmentSecret`;
DROP TABLE IF EXISTS `EnvironmentVariable`;
DROP TABLE IF EXISTS `ProjectEnvironment`;
