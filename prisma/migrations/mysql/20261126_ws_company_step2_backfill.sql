-- AI Workspace → Company ownership, step 2 of 3: deterministic backfill.
-- Date: 2026-11-26
--
-- Ownership is derived ONLY from an existing CompanyUser membership row on the
-- workspace owner. It is NOT inferred from slug, name, domain or email —
-- instruction B2 forbids that, and the live data proves why: a company slug may
-- literally contain the word "organisation" while being a Company.
--
-- Only UNAMBIGUOUS owners are backfilled: the owner must be a member of exactly
-- one company. An owner in two companies is left NULL and surfaces as an
-- exception requiring explicit human resolution. Picking one arbitrarily is how
-- a workspace ends up in the wrong tenant forever.
--
-- Idempotent: re-running changes nothing on already-filled rows.
--
-- Rollback: 20261126_ws_company_step2_rollback.sql

UPDATE `AiWorkspace` AS w
JOIN (
  SELECT cu.userId, MIN(cu.companyId) AS companyId, COUNT(*) AS memberships
  FROM `CompanyUser` cu
  GROUP BY cu.userId
  HAVING COUNT(*) = 1
) AS only_membership
  ON only_membership.userId = w.ownerId
SET w.companyId = only_membership.companyId
WHERE w.companyId IS NULL;
