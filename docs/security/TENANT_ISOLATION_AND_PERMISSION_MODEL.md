# Tenant Isolation and Permission Model

Status: implemented patterns + known gaps · 2026-11-25

## 1. Principles

1. **Server-side only.** Hiding a button is not authorisation. Every route resolves
   the caller with `src/lib/api-auth.ts` and scopes every query by `companyId`.
2. **Deny by default.** Missing permission, missing membership, missing agent grant
   or missing tool grant all deny.
3. **Two independent axes.** Platform role (`User.role`) and tenant role
   (`CompanyUser.role`) are resolved separately; a tenant role never grants platform
   capability and vice versa.
4. **Knowingly shared data is explicit.** Shared agents need
   `AgentCompanyAccess` with `execute`/`full`; `read` cannot execute.
   Shared knowledge needs explicit metadata ownership or verified tenant department.

## 2. Enforcement points

| Layer | Mechanism | File |
| --- | --- | --- |
| Authentication | Session token verification, expiry, idle timeout | `src/lib/auth.ts`, `session-*.ts` |
| Authorisation | `requireAuth`, `requireCompanyAuth`, `requireCompanyRole`, `requireRole`, `canManageCompany` | `src/lib/api-auth.ts` |
| Tenant role checks | `CompanyRole`, `CompanyPermission`, role migration | `src/lib/role-migration/`, `scripts/migrate-roles.ts` |
| Agent visibility | ownership or executable grant | `src/lib/agent-access.ts` |
| Knowledge visibility | fail-closed metadata ownership | `src/lib/tenant-knowledge.ts` |
| Files/artifacts | tenant ACL + storage scoping | `src/lib/storage/`, `Artifact` |
| Tool use | allow/forbid lists, no wildcards | `src/lib/tools/policy.ts` |
| Cross-tenant actions | `SEC-TENANT-001` (absolute deny) | `src/lib/governance/engine.ts` |
| Project scope | `PROJ-SCOPE-001` | same |
| Public surface | `SEC-WEBCHAT-001` + `src/lib/access/surfaces.ts` | governance + access |
| Rate limits | atomic Redis Lua or documented single-instance window | `src/lib/security/rate-limiter.ts` |
| Webhooks | signature validation, SSRF guard | `src/lib/webhooks/`, SSRF tests |
| Audit | append-only, redacting | `src/lib/audit-events.ts` |

## 3. Role matrix

| Capability | public_visitor | standard_user | developer | project_manager | org_owner | admin | super_admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public site / public knowledge | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Workspace chat | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Run agents in own org | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create temporary specialist | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve publishing | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approve data export | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Approve production deploy | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Approve privilege / policy / registry change | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Emergency stop | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Read governance catalogue | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

The matrix reflects governance policy (`approvers`) plus route guards; where the
two disagree the more restrictive one wins (enforced by engine ordering).

## 4. Isolation tests that exist

| Test | Scope |
| --- | --- |
| `__tests__/api/f2-scope-authorization.test.ts` | Role/scope authorisation (env-blocked in this sandbox) |
| `__tests__/api/f6-webhook-delivery-tenant-isolation.test.ts` | Webhook tenant isolation |
| `__tests__/unit/governance-policy-engine.test.ts` → `tenant-boundary-deny` | Cross-tenant denial including super admin |
| `__tests__/unit/governance-policy-engine.test.ts` → `project-mismatch-deny` | Project scope |
| `__tests__/unit/governance-runtime.test.ts` → approval tenant mismatch | Approval cannot cross tenants |
| `__tests__/unit/agent-factory-guard.test.ts` | Department ownership, role gating |

Scenario 4 of the specification ("Customer A attempts to access Customer B") is
covered at the engine level and must be extended to a live two-tenant E2E test
once a database is available.

## 5. Known gaps

| ID | Gap | Risk |
| --- | --- | --- |
| GAP-015 | `AgentFactory.cloneAgent` copied grants from a source agent without tenant scope before this phase; now scoped by `findFirst` with company or access filter — add a live test | Privilege copying |
| GAP-016 | Some routes resolve tenant from a request body in addition to session; a mismatched body should be ignored, not trusted | Cross-tenant write |
| GAP-017 | Support/customer-service roles are not yet restricted to "assigned records" | Over-broad support access |
| GAP-018 | No automated multi-tenant E2E suite in CI (requires seeded two-tenant fixture) | Regression risk |
| GAP-019 | File ACL verified by script, not by CI assertion | Silent regression |

## 6. Rules for new code

1. Resolve the tenant from the session, never from the payload.
2. Put `companyId` in the `where` clause of every read and write.
3. For a cross-tenant or cross-project action, call governance **first**.
4. Return 404 rather than 403 when a resource belongs to another tenant (do not
   confirm existence).
5. Audit privileged writes; fail closed if the audit write fails.
