# AgentOS operator guide

**Status:** experimental. Read the [final audit](../ALO_LABS_AGENTOS_FINAL_AUDIT.md) before deployment.

## One-command workflow

1. Authenticate with `/api/auth/login`, then send `Authorization: Bearer <session>` (or create a company API key with the required v1 scope).
2. `POST /api/runs` with `{ "objective": "Research UK universities and prepare a cited report." }` returns `202`, `runId`, `detailUrl`, and `eventsUrl`.
3. The DB queue worker runs the plan. Poll `GET /api/runs/:id` or stream `GET /api/runs/:id/events` (SSE with Bearer token).
4. Inspect `run.status`, `run.error`, `tasks`, `events`, `approvals` and `artifacts`. Download reports using authenticated `GET /api/artifacts/:id/download`.

Alternative: `POST /api/v1/command` with the same objective. API-key scopes: `runs:execute`; `runs:read` and `runs:write` for the other routes.

## Result semantics

- `completed`: all planned steps completed. QC passed each completed step.
- `failed`: at least one step failed. The report is a **diagnostic** artifact, not a successful deliverable.
- `waiting_approval`: automated repair exhausted; human review requested. Approval decisions are recorded, but **automatic continuation is not yet available**.
- `cancelled`: cancellation recorded; an in-flight model call may finish before the worker observes cancellation.
- Without provider credentials, the heuristic plan can be recorded, but model execution fails with **Configuration required**. No response is fabricated.

## Local setup

Use Node >=20, npm >=10. Install with `npm ci --legacy-peer-deps` (local sandbox may require native SQLite build). In this air-gapped sandbox, the generated Prisma **client-engine** variant uses `PRISMA_SQLITE_ADAPTER=1`, `DATABASE_URL=file:./db/custom.db`, `npm run db:generate:client-engine`, and `npm run db:push:sqlite`. The latter is an additive schema initialization helper, **not** a production migration system. Set `SEED_ADMIN_PASSWORD` (12+ characters) and run `npm run seed:agentos`. For live models configure a supported provider using its own environment variables. Run `npm run dev` on port 3011.

See [API documentation](API_DOCUMENTATION.md), [deployment](DEPLOYMENT_GUIDE.md) and [security](SECURITY.md).
