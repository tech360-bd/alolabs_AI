# Authentication and Authorization Unification

**Goal:** two authentication towers, one tenant boundary, identical outcomes.
**Date:** 2026-11-26 · **Status:** Phase 1 design; no auth code changed.
**Constraint:** do not disable, replace or weaken either existing system.

---

## 1. The two towers as they exist

| | Tower A — company | Tower B — platform |
|---|---|---|
| Entry | `src/lib/api-auth.ts` → `requireAuth` / `requireCompanyAuth` | `src/lib/platform/principal.ts` → `principalFromSession` / `principalFromApiKey` |
| Wrapper | `src/lib/api/secure-route.ts` (`secureRoute`) | `src/lib/platform/http.ts` (`platformRoute`) |
| Tenant resolved from | `CompanyUser` membership | `AiWorkspaceMember` membership |
| Client-supplied tenant | validated, `tenant_mismatch` on disagreement | not applicable |
| Unit of scope | `companyId` | `workspaceId` |
| Routes | **16** wrapped; **197** call `requireAuth`/`requireCompanyAuth` directly | **19** under `/api/v1/platform/**` |
| Consulted by | CRM, call centre, agents, runs | AI platform, chat, models, keys, usage |

Both towers authenticate correctly. They differ only in what they consider a
tenant, and neither knows about the other. That difference — not a bug in either
— is what produces T-3 and T-4.

---

## 2. Unification strategy: one resolver, two adapters

Do **not** merge the towers into one file. They serve different surfaces with
different session lifetimes and different cookies, and merging them is a
high-risk rewrite of working auth.

Instead, introduce a **single tenant-resolution function** that both towers call,
and keep their authentication adapters separate.

```
                  ┌─────────────────────────────────────────┐
  secureRoute ───►│ resolveTenantContext(principal)          │◄─── platformRoute
  (Tower A)       │                                         │      (Tower B)
                  │  1. user id                              │
                  │  2. CompanyUser → companyId + role       │
                  │  3. AiWorkspace.companyId === companyId  │
                  │  4. AiWorkspaceMember → role             │
                  │  5. no company  → fail closed            │
                  │     no workspace → fail closed (scoped)  │
                  └─────────────────────────────────────────┘
```

### Contract of `resolveTenantContext`

| Field | Rule |
|---|---|
| `companyId` | **Required.** From `CompanyUser`. Never from the request. |
| `companyRole` | From `CompanyUser.role`. |
| `workspaceId` | Optional. If present, `AiWorkspace.companyId` **must** equal `companyId`. |
| `workspaceRole` | From `AiWorkspaceMember`. Narrows `companyRole`, never widens. |
| `isSystem` | Separate flag; only for operations with their own audit obligation. |

Failure modes, all closed:

- no authenticated principal → `401`
- authenticated but no `CompanyUser` → `403 tenant_required`
- claimed company ≠ resolved company → `403 tenant_mismatch`
- workspace not owned by the company → `403 tenant_mismatch`
- workspace requested but no membership → `403 forbidden`

These names already exist in `secure-route.ts`. Tower B adopts the same
vocabulary so a client sees identical errors from both.

### Why this ordering

`Company` first, then workspace. Reversing it reproduces T-3 (a workspace
membership with no company membership granting access). The prerequisite
relationship is the whole point of the decision.

---

## 3. Background workers, SSE and internal APIs

The approval requires that these "obtain and validate tenant identity". Today
they do not (T-1, T-5).

| Caller | Today | Required |
|---|---|---|
| Queue dispatcher | no tenant check | job payload carries `companyId`; assert against the run before executing; refuse on mismatch |
| Scheduled jobs | no tenant check | same; jobs are tenant-scoped rows, not global |
| SSE stream | checks at subscribe only | attach `companyId` per event; drop mismatched events at delivery |
| Internal APIs | shared secret, no tenant | internal calls must name a tenant explicitly and be audited; a shared secret is authentication, not authorization |

**Rule:** a worker may only act on behalf of the tenant recorded in its own
enqueued payload, and must prove it still owns the target row.

---

## 4. What must not change

- Session cookies, their audiences, and the `/platform` shared-path guard in
  `src/proxy.ts` are working and are **not** modified by this plan.
- API key hashing, scopes and rate limiting are unchanged.
- `super_admin` continues to work; it gains a separate audit path, it does not
  lose capability.
- No route is deleted or moved. Tower B gains a *check*; it does not change shape.

---

## 5. Migration ordering (no behaviour change without a test)

1. Land tests that encode the required outcomes (they fail — proof of the gap).
2. Introduce `resolveTenantContext` and call it from **Tower A only**. Nothing
   should change: Tower A already conforms. This proves the new function agrees
   with the old one before it is trusted anywhere else.
3. Call it from **Tower B**. Tower B tests flip from fail to pass.
4. Remove the `'default-company'` fallbacks and the empty-`workspaceId` default.
5. Only then propose the schema change (`AiWorkspace.companyId`).

Step 2 is deliberate: a shared resolver that has never been cross-checked against
the system it replaces is just a second opinion.

---

## 6. Rollback

Each step is independently revertible and nothing in steps 1–2 changes observable
behaviour. Steps 3–4 are guarded by the test matrix; a revert restores the prior
(authorising, but under-scoped) behaviour rather than a broken one. The schema
change in step 5 is proposed separately and has its own rollback in
`docs/roadmap/tenant-migration-plan.md`.
