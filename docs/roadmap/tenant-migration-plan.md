# Tenant Migration Plan — Proposal Only

**Status: NOT EXECUTED. NOT APPROVED.**
Per approval §7 and §8, this phase authorises documentation, inspection and
non-destructive tests only. Nothing in this document has been run against any
database, and **no schema change has been made**.

**Date:** 2026-11-26

---

## 1. Proposed schema change (for approval)

One column, one relation. Nothing else.

```prisma
model AiWorkspace {
  id             String  @id @default(cuid())
  // … existing fields unchanged …
  companyId      String                      // NEW — required
  // organisationId stays for now (see §6); unused, not removed

  company        Company @relation(fields: [companyId], references: [id], onDelete: Restrict)  // NEW
  // … existing relations unchanged …

  @@index([companyId])                       // NEW
}
```

```prisma
model Company {
  // … existing fields unchanged …
  aiWorkspaces   AiWorkspace[]               // NEW back-relation
}
```

### Why `onDelete: Restrict`

Deleting a `Company` must **not** silently cascade into workspaces, runs,
conversations and files. `Restrict` forces an explicit, audited decision. Cascade
is the wrong default for a tenant root and is how data-loss incidents happen.

### Why `companyId` is required, not nullable

A nullable tenant column is exactly what produced T-2 (`'default-company'`).
Making it required means "a workspace without a company" is unrepresentable
rather than merely discouraged. The backfill (§3) proves this is achievable
before the constraint is applied.

---

## 2. Migration strategy — three ordered steps

Following the repository's existing pattern in `prisma/migrations/mysql/`
(15 ordered files, 6 with rollback pairs), **not** `prisma migrate`, which does
not track these files.

| Step | File | Effect |
|---|---|---|
| 1 | `20261126_ws_company_nullable.sql` | `ADD COLUMN companyId VARCHAR(191) NULL` + index. No reads depend on it. Rollback: drop column. |
| 2 | `20261126_ws_company_backfill.sql` | Populate from §3 mapping. Idempotent. Rollback: `SET companyId = NULL`. |
| 3 | `20261126_ws_company_require.sql` | Verify 0 nulls, then `ALTER … NOT NULL`. **Only after §5 verification passes.** |

Each step is independently revertible. Steps 1–2 are non-breaking; the
application does not read `companyId` until the code phase that follows.

---

## 3. Existing-record mapping strategy

**Measured basis (dev DB):** 5 workspaces, 6 companies.

| workspace | → company | Basis |
|---|---|---|
| `e2e-tester-workspace` | `e2e-tester-s-…-02ddcd70` | owner's single `CompanyUser` row |
| `other-tenant-workspace` | `other-tenant-s-…-c7679cf7` | owner's single `CompanyUser` row |
| `isolation-probe-workspace` | `isolation-probe-s-…-f1f81494` | owner's single `CompanyUser` row |
| `isolation-two-workspace` | `isolation-two-s-…-90f36985` | owner's single `CompanyUser` row |
| `alo-admin-workspace` | `alo-labs` (internal) | owner's single `CompanyUser` row |

**Rule:** derive from the owner's `CompanyUser` membership. Do **not** infer from
`slug`, `name`, `domain` or email — instruction #4 explicitly forbids it, and the
slugs above show why: `isolation-probe-s-organisation-…` contains "organisation"
but is a `Company`. Name-based inference would have produced the wrong table
family and, worse, the wrong confidence.

### Backfill query (step 2)

```sql
UPDATE AiWorkspace
SET companyId = (
  SELECT cu.companyId FROM CompanyUser cu
  WHERE cu.userId = AiWorkspace.ownerId
  LIMIT 1
)
WHERE companyId IS NULL
  AND (SELECT COUNT(*) FROM CompanyUser cu WHERE cu.userId = AiWorkspace.ownerId) = 1;
```

The `= 1` clause is deliberate: **only unambiguous owners are backfilled.** A user
in two companies is left `NULL` and surfaces as an exception rather than being
resolved by picking one.

---

## 4. Orphan and conflict report

| Class | Count (dev) | Handling |
|---|---|---|
| Unambiguous (1 membership) | **5 / 5** | backfill |
| Ambiguous (2+ memberships) | **0** | — |
| Orphan (0 memberships) | **0** | — |
| Dangling `organisationId` | **0** | — |
| `AgentOSRun` with null/`default-company` | **0** | — |
| Users with no `CompanyUser` rows | **1** (`b1795692797627@x.io`) | exception X-1; owns no workspace |

**Production numbers will differ and must be measured before step 2.** The dev
database is dominated by E2E fixtures (5 of 6 companies). A production orphan
count above zero **stops the migration** and requires per-record resolution.

---

## 5. Data-integrity verification (gate before step 3)

All must return 0 before the `NOT NULL` constraint is applied:

```sql
SELECT COUNT(*) FROM AiWorkspace WHERE companyId IS NULL;                       -- must be 0
SELECT w.slug FROM AiWorkspace w
  LEFT JOIN Company c ON c.id = w.companyId
  WHERE c.id IS NULL;                                                           -- orphaned FK
SELECT w.slug, COUNT(cu.companyId) FROM AiWorkspace w
  JOIN CompanyUser cu ON cu.userId = w.ownerId
  GROUP BY w.slug HAVING COUNT(cu.companyId) > 1;                               -- ambiguity
SELECT COUNT(*) FROM AiWorkspace w
  JOIN Company c ON c.id = w.companyId
  WHERE w.ownerId NOT IN (SELECT userId FROM CompanyUser WHERE companyId = c.id); -- owner not in company
```

The last query is the important one: it catches a workspace assigned to a company
its owner does not belong to — the exact condition that would make T-3 permanent.

---

## 6. What this plan deliberately does not do

| Not done | Reason |
|---|---|
| Delete `AiOrganisation` / `AiOrgMember` | Destructive; 0 rows but live tables. Abandon them instead (§7). |
| Merge or reassign any record | Forbidden by approval §7. |
| Make `AgentOSRun.companyId` required | Needs its own orphan analysis after the backfill. Separate approval. |
| Touch `User` | It has no `companyId` by design; membership is the join. |
| Change any production database | Forbidden by approval §8. |

---

## 7. `AiOrganisation` retirement (recommended, separate approval)

Leave both tables in place, add a guard, remove later:

1. Stop creating `AiOrganisation` rows (already true: 0 exist).
2. Add a check constraint or application guard: a workspace may not have both
   `companyId` and `organisationId` set.
3. Deletion becomes a standalone cleanup with its own rollback and its own PR.

Deleting live tables to tidy a diagram is not worth the rollback risk.

---

## 8. Expected impact on models and routes

| Surface | Impact |
|---|---|
| `AiWorkspace` | +1 column, +1 relation, +1 index |
| `Company` | +1 back-relation (no column) |
| 9 workspace-descendant models | **none** — they inherit via `AiWorkspace`; unchanged |
| `AgentOSRun` | none in this migration |
| 19 `/api/v1/platform/**` routes | none at schema level; behaviour changes when `resolveTenantContext` lands |
| 16 `secureRoute` routes | none |
| 197 ad-hoc-auth routes | none at schema level; unchanged debt |

---

## 9. Migration test strategy

| Layer | Test |
|---|---|
| Unit | backfill query selects only unambiguous owners |
| Integration | against a fixture DB: 1-membership → filled; 2-membership → null + exception; 0-membership → null + exception |
| Idempotency | running step 2 twice yields identical rows |
| Rollback | steps 3→2→1 restore the exact pre-migration shape |
| Integrity | §5 queries all return 0 before step 3 |
| Application | full suite green after each step (baseline 2,562 passed) |

---

## 10. Rollback plan

| Step reached | Rollback |
|---|---|
| 1 only | `ALTER TABLE AiWorkspace DROP COLUMN companyId` |
| 2 (backfill) | `UPDATE AiWorkspace SET companyId = NULL` — column is nullable until step 3 |
| 3 (`NOT NULL`) | `ALTER TABLE AiWorkspace MODIFY companyId VARCHAR(191) NULL`, then step 2 rollback |

No step deletes data. A rollback at any point restores the pre-migration shape
exactly, which is why the column is added nullable first rather than made
required in one statement.

---

## 11. Approvals required before execution

1. Approve the schema change in §1.
2. Approve running **production** orphan measurement (§4) read-only.
3. Approve steps 1–2.
4. Review §5 verification output.
5. Approve step 3.
6. Approve the code phase that consumes `companyId`.

Steps 3 and 6 are separate because a schema that is ahead of the code is
harmless; code that is ahead of the schema is an outage.
