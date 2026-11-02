# Enterprise Overview check — 2026-11-02

## Scope and evidence

This is a targeted source and test review, **not** a certification of all AgentOS systems. The supplied screen reported `Failed to fetch` for both metrics and activity. In this checkout the panel uses same-origin `/api/enterprise/stats` and `/api/enterprise/activity`, and the endpoints query tenant-scoped database records. The exact cause of the reported network error is not established: browser/network/server logs and the affected deployment are not available here. Do not substitute zeroes or synthetic health for a failed request.

## Changes

- Failed metrics are now shown as **Unavailable**, not as evidence that every system is unmeasured or that the tenant has no departments.
- The API Gateway panel contained hard-coded endpoint counts, uptime, request rates, latency and status. Those invented figures were removed; the panel now displays the existing tenant-scoped recorded-usage telemetry and explicitly states what it does not measure. The Agent Command Center's hard-coded active System Pulse indicators now say **Not measured**.
- Overview and observability panels remount on selected tenant or user change, clearing stale results and aborting in-flight requests instead of showing/exporting a previous tenant's data in the new context.
- The unused legacy `/api/enterprise/overview` endpoint queried global counts and tasks after optional route-level authentication. The proxy normally requires credentials, but any authenticated caller could receive global data. The route now requires company authentication and returns HTTP 410 with a pointer to `/api/enterprise/stats`; callers of the legacy response must migrate. The route no longer returns global information.

## Checks run

- Focused Vitest suite: 11 tests passed across overview and gateway UI, legacy endpoint, stats and activity. These use mocked fetch/auth/database; they do not prove production connectivity or full tenant isolation end-to-end.
- ESLint passed on the changed source and test files.
- `npm run skills:verify` passed for the committed instruction catalog; this does not verify live agents or integrations.

## Remaining work

Investigate the affected deployment's browser network errors, reverse proxy, authentication/selected-company context and server/database logs; then validate both endpoints in a real tenant session. Full system verification requires real provider, tenant database, worker, integration and recovery tests. See `../ALO_LABS_UNVERIFIED_CAPABILITIES.md` and `../ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md` for existing, time-stamped gaps; those documents are prior evidence, not a fresh verification of every module. In particular, this change does not implement the previously requested REA sandbox or establish live self-learning, MCP execution, or production readiness.
