# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

> Existing, longer-form guide: [`AI_AGENT_GUIDE.md`](AI_AGENT_GUIDE.md).
> This file is the short, canonical checklist an agent should read first.

## What this repository is

ALO Labs AgentOS — a Next.js 16 / React 19 / Prisma monolith serving an
internal operations console, a client portal, and a `/api/v1` automation
surface. ~250 Prisma models, ~500 API routes, ~2,100 tests.

## Non-negotiables

1. **Do not replace or rebuild the app.** All changes are additive and must
   preserve existing routes, schema, auth, RBAC and tenant isolation.
2. **Never reset a database.** No `prisma migrate reset`, no `db push --force-reset`,
   no `DROP`/`TRUNCATE` against a real database.
3. **Every `/api` route must be authenticated.** Use one of the wrappers below —
   never export a bare `export async function GET` from `src/app/api/**`.
4. **Typecheck must stay at zero errors.** Do not silence a new error with
   `@ts-ignore`; fix the type.
5. **A passing build is not verification.** Run the tests.

## Commands

```bash
bun install --frozen-lockfile     # install (bun is the committed package manager)
npm run dev                       # dev server on :3011 (0.0.0.0)
npm run typecheck                 # tsc, must be 0 errors
npm run lint                      # eslint
npm test                          # vitest (unit + integration)
```

### Database

Development/CI uses **SQLite** (`prisma/schema.prisma`). Production uses
**MySQL** (`prisma/schema.mysql.prisma`). They are separate files — a model
added to one must be added to the other.

```bash
npm run db:generate               # generate client from prisma/schema.prisma
npm run db:generate:client-engine # engine-less client for air-gapped dev
DATABASE_URL=file:./db/custom.db npm run db:push:sqlite
PRISMA_SQLITE_ADAPTER=1 npm test  # tests that touch the DB need this
```

Tests that create a real SQLite database require `PRISMA_SQLITE_ADAPTER=1`
**and** an installed `better-sqlite3` native binding. If you see
`Could not locate the bindings file`, run:

```bash
cd node_modules/better-sqlite3 && npx node-gyp rebuild --release --nodedir=/usr/local
```

## Route authorization — pick a wrapper

| Surface | Wrapper | File |
|---|---|---|
| Internal console (role-checked) | `secureRoute` / `secureCrud` | `src/lib/api/secure-route.ts`, `src/lib/api/secure-crud.ts` |
| Client portal | `clientRoute` | `src/lib/portal/auth.ts` |
| Staff-on-client-work | `internalRoute` | `src/lib/internal/auth.ts` |
| Public API `/api/v1` | `v1Handler` | `src/lib/v1.ts` |
| Company-scoped endpoints | `requireCompanyAuth` | `src/lib/api-auth.ts` |

Guard order inside a handler: authenticate → authorise (role) → **scope every
query by `companyId`** → rate limit → audit.

## Conventions that have caused real bugs

- **Audit writes must not fail the request.** Wrap `db.auditLog.create(...)` in
  `try { … } catch { /* best-effort */ }`. A failed audit write turning a 200
  into a 500 has already happened once in `api/social/analytics`.
- **Rate limiting has one implementation.** Use `checkRateLimit` from
  `src/lib/rate-limiter.ts` (Redis-atomic via `security/rate-limiter.ts`).
  Do not add another limiter, and do not do read-then-write counting.
- **FREE-ONLY / local-only modes** are read at call time from the environment.
  There is one predicate: `isFreeOnlyMode()` in `src/lib/ai-router/free-only-mode.ts`.
  `FREE_ONLY_MODE` is canonical; `FREE_ONLY` and `LOCAL_ONLY` are accepted aliases
  and must resolve identically.
- **No `.generated.ts` file may be edited by hand**; they are produced by
  `scripts/sync-agent-skills.mjs` etc. Re-run the generator instead.
- **Timestamps/secret handling**: never log tokens, API keys or full request
  bodies. Use `fingerprint()` for credentials.

## Before opening a PR

```bash
npm run typecheck
npm run lint
PRISMA_SQLITE_ADAPTER=1 npx vitest run
```

Include in the PR description: root cause, files changed, database impact,
security impact, the commands you ran and their real output, and any remaining
blocker. Do not claim a feature works without a command's output to back it.
