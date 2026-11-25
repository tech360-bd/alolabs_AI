# ALO Labs — Public / Admin Security Boundaries

> Generated: 2026-11-25 · Baseline: `main @ 689739e`. Verified mechanisms cited with paths; unverified items flagged honestly.

## 1. Two experiences, one boundary rule

PUBLIC (`/site/*`, public webchat, `/api/public/*`) and SUPER ADMIN/INTERNAL (`/dashboard`, `/api/*` admin routes, command center, coding workspace) are separate experiences. The rule: **authorization is server-side; a hidden URL, hidden button or client-side check is never authorization.**

## 2. Verified mechanisms on this commit

| Mechanism | Verified evidence |
|---|---|
| Tenant auth helper | `requireCompanyAuth` in `src/lib/api-auth.ts` — used by `/api/chat/route.ts` |
| Rate limiting | `checkEndpointLimit` in `src/lib/security/rate-limiter.ts` — applied per endpoint (chat included) |
| In-query tenant scoping | conversation queries filter `userId` + `companyId` in SQL (not trusted from client) |
| Zod schema validation | strict request schemas on chat routes (`PostSchema.strict()`) |
| Secret redaction posture | failed-turn honesty contract; secrets in `.env.example` only (169 keys documented); gitleaks config at repo root |
| Audit trail | `src/lib/audit-events.ts` + `/api/audit-logs`, `agent-runs` |
| Approval engine | `src/lib/approval-engine/` — gate for sensitive operations |
| Free-only spend control | `src/lib/ai-router/free-only-mode.ts` + `free-only-admin.ts` + quota tracker |
| SSRF hardening | PR #50 (SSRF hardening) merged; AI provider endpoint normalization hardened with tests (`7627729`) |
| Session lifecycle | Prisma-backed JWT auth (PR #46) |
| CSRF | Next.js server routes with strict JSON bodies; session-based admin actions must add CSRF tokens for state-changing admin forms (flag for PR C/E) — **partial, verify per-route** |

## 3. Boundary requirements per surface

### Public (anonymous)
- Only `/api/public/*` endpoints: `contact` (verified) and, after PR B, `public/chat`.
- Fixed internal tenant; visitors can never pass company/user ids.
- No tool access; no memory writes; approved-knowledge system prompt; secret redaction on outputs.
- Rate limits per IP and per session; abuse monitoring surfaced to admin config only.
- Never expose: provider API keys, Super Admin routes, internal project memory, other customers' data.

### Super Admin (authenticated)
- Strong auth (server sessions/JWT) + role checks server-side; admin-only APIs never callable from public surfaces.
- Coding workspace: sandboxed, branch-only, PR-only, no direct `main` push, no destructive git ops, no reset/drop/truncate of databases.
- Approval engine gates (non-bypassable by prompt): production deploys, destructive ops, DB migrations, DNS/infra changes, paid API spend, external customer communications, permission changes, deletions, high-impact merges/releases.
- Full audit of agent actions; execution events are the only progress claims.

## 4. Approved actions requiring human approval (canonical list)

1. Production deployments 2. Destructive operations 3. Database migrations 4. DNS/infrastructure changes 5. Paid API usage 6. External customer communication 7. Financial/legal commitments 8. Permission changes 9. Data deletion 10. High-impact merges/releases.

## 5. Verification plan (tests that must exist before PR C ships)

1. Public probe of an admin API returns 401/403 (cross-surface isolation test).
2. Cross-tenant conversation id probe fails (extend the verified in-query scoping test).
3. Paid-provider invocation without approval is refused in free-only mode.
4. Approval-required action without a decision never executes (approval-engine test).
5. Rate-limit behavior on public chat (429, honest messaging).
6. Secrets never present in any client payload (redaction test).
7. CSRF token required for admin state-changing forms.
8. Full suite + typecheck + lint + build exit 0.

## 6. Known gaps (honest)

- MCP integration (when added) needs its own boundary spec before shipping.
- Admin UI authorization is verified at the API layer; each admin page must be re-verified for server-side role checks during PR C/E.
- Live production posture (TLS, WAF, key rotation) is infra-side and requires owner-authorized verification; no production changes were made in this audit.
