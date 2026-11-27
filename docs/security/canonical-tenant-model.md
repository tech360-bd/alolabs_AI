# Canonical Tenant Model — Evidence and Ownership Classification

**Decision:** `Company` is the canonical tenant root (approved 2026-11-26).
**Purpose:** Prove the decision against real data before any schema change, and
classify every tenant-owned data category.
**Date:** 2026-11-26 · Database: local SQLite (dev/test). **No production data was read or written.**

> Instruction #4 required that `organisationId` not be assumed equivalent to
> `Company.id`. It is **not** equivalent, and the difference mattered — see §2.

---

## 1. Evidence method

Every figure below came from a probe executed in this session against the live
local schema and database, not from reading a README:

- `grep`/regex over `prisma/schema.prisma` (266 models)
- `db.*.findMany()` probes via `tsx` against `db/custom.db`
- route/module inspection for tenant reads and writes

Probe scripts are reproducible; the queries are recorded in §7.

---

## 2. `organisationId` is NOT `Company.id` — verified

This was the single most important thing to check, and the assumption in the
brief would have been wrong.

```
model AiWorkspace {
  organisationId String?                        // nullable
  organisation   AiOrganisation? @relation(...)  // → AiOrganisation, NOT Company
}
```

Findings:

| Check | Result |
|---|---|
| Does a model named `Organisation`/`Organization` exist? | **No** |
| Does `AiOrganisation` exist? | **Yes** — 8 fields, owner is a `User` |
| Does `AiOrganisation` reference `Company`? | **No** |
| Do **any** of the 14 `Ai*` models reference `Company`? | **NONE** |
| `AiWorkspace.organisationId` non-null rows | **0 of 5** |
| `AiOrganisation` rows | **0** |

So `organisationId` pointed at a table that is empty, nullable, and unrelated to
`Company`. It was never a tenant identifier in practice.

**Classification:** `AiOrganisation` is a **dangling structural shell**. It is
not a tenant, not a security boundary, and holds no data.

---

## 3. Schema shape: the three levels that actually exist

```
Level 1 (security)   Company ── CompanyUser, CompanyPermission, CompanyApiKey
                     └─ referenced by 266 models / 345 occurrences

Level 2 (operational) AiWorkspace ── ownerId → User, organisationId → AiOrganisation (NULL)

Level 3 (content)     AiProject, AiConversation, AiApiKey, AiFile, AiJob,
                      AiUsageRecord, AiNotification, AiFallbackEvent
```

`AiWorkspace` currently hangs off a **User**, not off any tenant. That is the
root cause of the two-tower split.

---

## 4. Live data inventory (dev DB, measured)

### Companies — 6

| id | slug | accountType |
|---|---|---|
| `cmwxh4m9f0000wpnzhj8vb8ah` | `t-1795692797509` | client |
| `cmwxi5ycj00011enzayd3y5nf` | `e2e-tester-s-organisation-02ddcd70` | client |
| `cmwxi7c5n000d1enzf9imdz6n` | `other-tenant-s-organisation-c7679cf7` | client |
| `cmwxic8c7000lqqnz7sa8n1jw` | `isolation-probe-s-organisation-f1f81494` | client |
| `cmwxicbyz000vqqnzddt54ih4` | `isolation-two-s-organisation-90f36985` | client |
| `0600e367-9722-4e3e-8a0c-70dd1e26229d` | `alo-labs` | **internal** |

### Workspaces — 5, all with `organisationId = NULL`

| workspace | owner | resolved Company | basis |
|---|---|---|---|
| `e2e-tester-workspace` | platform-e2e@example.com | `e2e-tester-s-…-02ddcd70` | unique `CompanyUser` membership |
| `other-tenant-workspace` | platform-e2e-b@example.com | `other-tenant-s-…-c7679cf7` | unique membership |
| `isolation-probe-workspace` | isolation-probe@example.com | `isolation-probe-s-…-f1f81494` | unique membership |
| `isolation-two-workspace` | isolation-probe2@example.com | `isolation-two-s-…-90f36985` | unique membership |
| `alo-admin-workspace` | admin@alolabs.net | `alo-labs` (internal) | unique membership |

### Attribution result

```
unambiguous       5 / 5   (each owner has exactly 1 CompanyUser row)
ambiguous         0
orphan (no membership)  0
workspaces with organisationId set  0
```

**Every workspace maps to exactly one Company, on evidence.** No workspace
requires an inferred owner, and nothing here depends on guessing from a name,
domain or email pattern — the basis is an existing `CompanyUser` row in every
case.

### Secondary orphan (does not block)

One `User` has zero `CompanyUser` rows: **`b1795692797627@x.io`**. It owns no
workspace, so no workspace attribution depends on it. It is recorded as an
exception requiring explicit resolution if that user is ever given a workspace.

---

## 5. Data ownership classification

Every tenant-owned category, classified by the boundary that must protect it.

### A. Company-rooted (existing, no change needed)

| Category | Models | Boundary |
|---|---|---|
| Tenancy | `Company`, `CompanyUser`, `CompanyRole`, `CompanyPermission` | Company |
| Credentials | `CompanyApiKey`, `CompanyIpAllowlist`, `CompanyDomain` | Company |
| Policy/limits | `CompanySettings`, `CompanyBudget`, `CompanyModelPermission`, `CompanyUsageSummary` | Company |
| CRM | `Contact`, `Lead`, `Opportunity`, pipeline/stage models, `Conversation`, `ConversationMessage`, `CustomerConsent` | Company |
| Agents | `Agent`, `AgentVersion`, `AgentPermission`, `AgentCompanyAccess`, `AgentResourceBudget` | Company (+ explicit cross-company grants) |
| Knowledge | `CompanyKnowledgeDocument`, `CompanyMemory` | Company |
| Runs | `AgentOSRun` (has `companyId`), `RunEvent` (via run) | Company |

### B. Workspace-rooted (need `companyId` added or inherited)

| Category | Models | Change |
|---|---|---|
| Workspace | `AiWorkspace` | **+ `companyId` (required)** |
| Membership | `AiWorkspaceMember` | inherits via workspace |
| Projects | `AiProject` | inherits via workspace |
| Conversations | `AiConversation` | inherits via workspace |
| Keys | `AiApiKey` | inherits via workspace |
| Files | `AiFile` | inherits via workspace |
| Jobs | `AiJob` | inherits via workspace |
| Usage | `AiUsageRecord`, `AiFallbackEvent` | inherits via workspace |
| Notifications | `AiNotification` | inherits via workspace |

### C. Superseded

| Table | Status |
|---|---|
| `AiOrganisation` | Empty. Retire by abandonment; **do not delete** in this phase. |
| `AiOrgMember` | Empty. Same. |

### D. System-scoped (must never be tenant-addressable)

| Category | Models | Rule |
|---|---|---|
| Operator surface | `SubscriptionPlan`, `Subscription` | Platform-level; separate privilege |
| Global catalog | `AgentCatalogItem` | Shared reference data, read-only to tenants |

---

## 6. Impact on routes and workers

| Surface | Count | Tenant handling today | Gap |
|---|---|---|---|
| All API routes | 541 | mixed | See columns below |
| `secureRoute`-wrapped | **16** | `tenant_required` / `tenant_mismatch`, never trusts client `companyId` | **Correct pattern** |
| `/api/v1/platform/**` | **19** | `platformRoute` → `principal.ts`, workspace-only, **never checks `Company`** | **Gap G-A** |
| `runs/[id]/events` SSE | 1 | `run.companyId !== user.companyId` → 403 | Correct for company runs; see G-B |
| Queue dispatcher | 1 | **no tenant check at all** | **Gap G-C** |
| Ad-hoc auth (`requireAuth`/`requireCompanyAuth` in route files) | **197** | per-route checks, no shared policy | Pre-existing debt; do not add more |

---

## 7. Reproducible queries

```sql
-- Workspace → Company attribution (no inference)
SELECT w.id, w.slug, w.organisationId, cu."companyId", cu.role
FROM AiWorkspace w
LEFT JOIN CompanyUser cu ON cu."userId" = w."ownerId";

-- Orphans: workspaces whose owner has no membership
SELECT w.slug FROM AiWorkspace w
WHERE NOT EXISTS (SELECT 1 FROM CompanyUser cu WHERE cu."userId" = w."ownerId");

-- Ambiguity: owners with more than one company
SELECT w.slug, COUNT(cu."companyId") AS companies
FROM AiWorkspace w JOIN CompanyUser cu ON cu."userId" = w."ownerId"
GROUP BY w.slug HAVING COUNT(cu."companyId") > 1;

-- Pseudo-tenant leakage
SELECT COUNT(*) FROM AgentOSRun WHERE "companyId" IS NULL OR "companyId" = 'default-company';

-- Dangling organisation references
SELECT COUNT(*) FROM AiWorkspace WHERE "organisationId" IS NOT NULL;
```

Expected after backfill: 0 orphans, 0 ambiguous, 0 pseudo-tenant, 0 dangling.

---

## 8. Exceptions requiring explicit resolution

| # | Exception | Blocking? | Owner decision needed |
|---|---|---|---|
| X-1 | `User b1795692797627@x.io` has no `CompanyUser` row | No | Assign to a company, or confirm it is a service/test account |
| X-2 | `AiOrganisation`/`AiOrgMember` are live tables with 0 rows | No | Approve abandonment (recommended) or a later deletion |
| X-3 | Company `t-1795692797509` has test-shaped slug | No | Confirm it is disposable dev data |
| X-4 | 5 of 6 companies are E2E fixtures | No | Confirm dev DB only; production counts will differ |

**No record was deleted, reassigned or merged to produce this report.**
