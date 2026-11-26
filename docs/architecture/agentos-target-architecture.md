# ALO Labs AgentOS — Target Architecture

**Decision record:** `Company` is the canonical tenant root. `AiWorkspace` becomes a Company-owned operational workspace.
**Status:** Phase 1 design. No schema change executed.
**Evidence base:** `docs/audits/global-platform-consolidation-audit.md` plus the live schema and data probes recorded in `docs/security/canonical-tenant-model.md`.
**Date:** 2026-11-26

---

## 1. The architecture we are moving to

```
Company  ← the security and isolation boundary. Everything tenant-owned descends from here.
├── CompanyUser                (membership, role — already exists)
├── CompanyPermission          (role grants — already exists)
├── CompanyApiKey              (already exists)
├── AiWorkspace  ──┐           (operational workspace; gains companyId)
│   ├── AiWorkspaceMember      (already exists)
│   ├── AiProject              (already exists)
│   ├── AiConversation         (already exists)
│   ├── AiApiKey               (already exists)
│   ├── AiFile                 (already exists)
│   ├── AiJob                  (already exists)
│   └── AiUsageRecord          (already exists)
├── AgentOSRun                 (already has companyId)
├── RunEvent                   (tenant via run)
├── CRM records                (already companyId-scoped)
└── Agent / Tool / Workflow    (already companyId-scoped)
```

Two relationships change. Nothing else in the hierarchy is invented.

| Change | From | To | Why |
|---|---|---|---|
| `AiWorkspace` | `organisationId → AiOrganisation` (nullable, unused) | `companyId → Company` (required) | Makes the workspace inherit the existing security boundary |
| `AiOrganisation` | Free-standing root owned by a `User` | *Superseded* — see §4 | It duplicates `Company` with no security role |

---

## 2. Why `Company` and not `AiOrganisation`

The approval names `Company`, and the evidence agrees independently:

| Property | `Company` | `AiOrganisation` |
|---|---|---|
| Models scoped by it | **266** (`companyId` appears 345×) | 2 (`AiOrganisation`, `AiOrgMember`) |
| `AiWorkspace`-descendant models scoped | 0 today | 2 |
| Live rows (dev DB) | **6** | **0** |
| Non-null references from `AiWorkspace` | 0 | **0 of 5** |
| Has an internal/client `accountType` | **Yes** | No |
| Has permissions, API keys, budgets, IP allowlists | **Yes** | No |
| Enforced by a hardened route wrapper | **Yes** (`secureRoute`, `tenant_mismatch`) | No |

`AiOrganisation` is a *structurally empty shell*: two tables, zero rows, zero
references. `Company` is where every real security control already lives.

**Consequence:** there is no "migration" of workspace ownership in the sense of
moving data between two populated roots. There is only a **backfill** of a new
column, because the old column is universally `NULL`. That is a much smaller and
much safer operation than the brief anticipated, and it is the single most
important fact in this plan.

---

## 3. Company-level vs workspace-level permission

Two distinct questions, deliberately kept apart:

| Question | Answered by | Scope |
|---|---|---|
| *May this user act for this tenant at all?* | `CompanyUser` row + `role` | Company |
| *May this user act inside this workspace?* | `AiWorkspaceMember` row + `role` | Workspace |

Rules:

1. **Company membership is a prerequisite.** A user with no `CompanyUser` row for
   a workspace's owning company has **no** workspace access, regardless of any
   `AiWorkspaceMember` row. This closes the existing gap where
   `platform/principal.ts` authorises purely on `AiWorkspaceMember` and never
   consults `Company`.
2. **Workspace permission narrows, never widens.** `AiWorkspaceMember.role` may
   restrict what company membership would otherwise allow; it may never grant
   more.
3. **Company administrators are not automatically workspace administrators.**
   A `CompanyUser.role` of `admin` grants the right to *manage* workspaces
   (create, archive, assign), not the right to read a workspace's content unless
   company policy says so. Enforcement of that distinction is Phase 1
   implementation work, after the schema change is approved.
4. `super_admin` is a **system** role, not a tenant role, and carries separate
   audit obligations (see threat model T-7).

Existing role vocabulary is reused. No new role names are introduced.

---

## 4. Contradiction found — reported, not silently resolved

The approval states:

> *"One Company may own multiple AiWorkspaces."*
> *"An AiWorkspace must belong to exactly one Company unless an explicitly documented exception is approved."*

The schema today supports a **three-level** hierarchy in which a user-owned
`AiOrganisation` groups multiple `AiWorkspace` rows. A `Company → AiWorkspace`
model collapses that organisation tier.

Per instruction #9 (*"Stop and report if the actual schema or ownership data
contradicts this decision"*), this is the contradiction, and it is soft rather
than blocking:

- **It does not block the migration.** All data is consistent with the
  Company-rooted model: `AiOrganisation` has 0 rows, so `Company → AiWorkspace`
  describes 100% of live workspaces correctly.
- **It does block a permanent decision on `AiOrganisation`.** Deleting those
  tables is a destructive schema change and is **not** proposed here.

**Recommendation: retire `AiOrganisation` by abandonment, not by deletion.**
Leave the tables in place, stop creating rows, and add a guard so a workspace
cannot be assigned to both a company and an organisation. Removal becomes a
separate, explicitly-approved cleanup with its own rollback. This keeps the
rollback path intact and touches no data.

---

## 5. What is deliberately not built

| Not built | Reason |
|---|---|
| A new run engine | One exists (1,121 LOC + 3,575 LOC runtime). The brief forbids competing implementations. |
| A new event/SSE system | `RunEvent` + `/api/runs/[id]/events` already replay and stream. |
| A new approval mechanism | `resolveRunApproval` + `waiting_approval` exist. |
| A new permissions language | `CompanyPermission` + `AiWorkspaceMember.role` cover both scopes. |
| Developer cloud / autoscaling | Phases 4–5; genuinely greenfield and out of scope for Phase 1. |
| Any schema change | Phase 1 is design + non-destructive tests only. Changes are proposed in `docs/roadmap/tenant-migration-plan.md`. |

---

## 6. Target request path (both towers, one boundary)

```
Request
  │
  ├─ authenticate            (session cookie or API key)
  │
  ├─ resolve Company         ← ALWAYS from the principal. A client-supplied
  │                             companyId is a *claim*, never authority.
  │
  ├─ authorise tenant        CompanyUser membership must exist
  │                          └─ fail → tenant_required / tenant_mismatch (fail closed)
  │
  ├─ resolve workspace       (if workspace-scoped)
  │                          AiWorkspace.companyId === resolved company
  │                          AND AiWorkspaceMember row exists
  │
  └─ handler
```

Today the left half of this diagram is implemented in `secureRoute` (`api-auth.ts`
tower, 16 routes) and the right half is absent from `platformRoute`
(`principal.ts` tower, 19 routes).
Unifying them is the subject of
`docs/architecture/authentication-authorization-unification.md`.

---

## 7. Invariants the architecture guarantees

1. Every tenant-owned row is reachable only from one `Company`.
2. No request may widen its own tenant scope by supplying an identifier.
3. A background job carries its tenant and revalidates it before acting.
4. An SSE subscription is ownership-checked *before* replay, not after.
5. An absent or ambiguous tenant context fails closed.
6. System-privileged operations are separate from tenant operations and audited.

Invariant 3 and 4 are **not true today**; see the threat model T-1 and T-2.
