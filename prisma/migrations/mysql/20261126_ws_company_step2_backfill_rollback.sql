-- Rollback for 20261126_ws_company_step2_backfill.sql
-- The column is still nullable at this stage, so the backfill is fully
-- reversible. After step 3 this rollback must be preceded by dropping the
-- NOT NULL constraint (see step 3 rollback).

UPDATE `AiWorkspace` SET `companyId` = NULL;
