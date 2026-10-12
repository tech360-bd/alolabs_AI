# P2b: Fix API Routes — Task Report

## Task 1: Fix routes using db.settings instead of their Prisma models

### Files Modified
1. **`src/app/api/brands/route.ts`** — Rewrote from `db.settings` (key-value store) to `db.brand` (dedicated Brand model). Added GET with pagination, POST with Zod validation, PUT, DELETE. Added `requireAuth()` and audit logs.
2. **`src/app/api/mcp-servers/route.ts`** — Rewrote from `db.settings` to `db.mcpServer` (McpServer model). Full CRUD with pagination, Zod schemas, auth, and audit logs.
3. **`src/app/api/workers/route.ts`** — Rewrote from `db.settings` to `db.workerNode` (WorkerNode model). Full CRUD with pagination, Zod schemas, auth, and audit logs.
4. **`src/app/api/incidents/route.ts`** — Rewrote from `db.settings` to `db.incident` (Incident model). Full CRUD with pagination, filter support (status/severity/type/companyId), Zod schemas, auth, and audit logs.
5. **`src/app/api/incidents/[id]/route.ts`** — Rewrote from `db.settings` to `db.incident`. GET/PUT/DELETE by ID with Zod validation, auth, and audit logs.

## Task 2: Fill missing CRUD operations

### Files Modified
1. **`src/app/api/roles/route.ts`** — Added POST (create role with permissions), PUT (update role, replace permissions), DELETE. Added pagination to GET. Zod schemas, auth, audit logs.
2. **`src/app/api/commands/route.ts`** — Added GET (paginated list), PUT (update status/result), DELETE. Zod schemas, auth, audit logs.
3. **`src/app/api/notifications/route.ts`** — Added PUT (mark read, update fields), DELETE. Added pagination to GET. Zod schemas, auth, audit logs.
4. **`src/app/api/quality/route.ts`** — Added PUT (update assessment), DELETE. Refactored GET to use pagination helpers. Zod schemas, auth, audit logs.
5. **`src/app/api/token-budget/route.ts`** — Added PUT (update budget fields), DELETE. Refactored auth to use `requireAuth()`. Zod schemas, auth, audit logs.
6. **`src/app/api/metrics/route.ts`** — Added PUT (update metric by id). Refactored auth to use `requireAuth()`. Added audit logs to all operations.
7. **`src/app/api/tenant-admin/config/route.ts`** — Added PUT (update config), DELETE. Refactored auth to use `requireAuth()`. Zod schemas, auth, audit logs.

## TypeScript Result

`npx tsc --noEmit` — **0 errors** ✅

## Total Files Modified: 12
- `src/app/api/brands/route.ts`
- `src/app/api/mcp-servers/route.ts`
- `src/app/api/workers/route.ts`
- `src/app/api/incidents/route.ts`
- `src/app/api/incidents/[id]/route.ts`
- `src/app/api/roles/route.ts`
- `src/app/api/commands/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/quality/route.ts`
- `src/app/api/token-budget/route.ts`
- `src/app/api/metrics/route.ts`
- `src/app/api/tenant-admin/config/route.ts`
