# API Inventory — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification. 444 route.ts files under `src/app/api/**`.

## 1. Public gateway surface — `/api/v1/**` (39 routes)

These are the externally-addressable versioned endpoints. Auth: `X-API-Key` or `Bearer alo_*`; tenant resolved server-side from key hash.

| Endpoint | Method | File | Tenant-scoped? | Notes |
|---|---|---|---|---|
| `/v1/agents` | GET, POST | `src/app/api/v1/agents/route.ts` | YES (`agentCompanyScope`) | **EXPOSES agent count (`total`) and full agent list — violates hidden-workforce requirement** |
| `/v1/agents/[id]` | GET, PATCH, DELETE | `src/app/api/v1/agents/[id]/route.ts` | YES | **EXPOSES `systemInstructions` (prompt) + `runtimeProfile` (model config)** |
| `/v1/agents/[id]/run` | POST | `src/app/api/v1/agents/[id]/run/route.ts` | YES | **EXPOSES `agentId`, `agentName`, `model`, validation scores** |
| `/v1/agents/execute` | POST | `src/app/api/v1/agents/execute/route.ts` | YES | Uses `secureRoute` (rate-limited) |
| `/v1/approvals` | GET, POST | `src/app/api/v1/approvals/route.ts` | YES | |
| `/v1/approvals/[id]` | GET, PATCH | `src/app/api/v1/approvals/[id]/route.ts` | YES | |
| `/v1/artifacts` | GET, POST | `src/app/api/v1/artifacts/route.ts` | YES | |
| `/v1/artifacts/[id]` | GET | `src/app/api/v1/artifacts/[id]/route.ts` | YES | |
| `/v1/command` | POST | `src/app/api/v1/command/route.ts` | YES | |
| `/v1/events` | GET | `src/app/api/v1/events/route.ts` | YES | **EXPOSES `RunEvent` rows (orchestration trace)** |
| `/v1/health` | GET | `src/app/api/v1/health/route.ts` | N/A (public) | Returns DB/router/queue status |
| `/v1/memory` | GET, POST | `src/app/api/v1/memory/route.ts` | YES | |
| `/v1/models` | GET | `src/app/api/v1/models/route.ts` | YES | **EXPOSES model catalog + live provider health/latency/errorRate** |
| `/v1/projects` | GET, POST | `src/app/api/v1/projects/route.ts` | YES | Plain CRUD, no discovery |
| `/v1/projects/[id]` | GET | `src/app/api/v1/projects/[id]/route.ts` | YES | |
| `/v1/providers` | GET, POST | `src/app/api/v1/providers/route.ts` | YES | |
| `/v1/providers/[id]` | GET | `src/app/api/v1/providers/[id]/route.ts` | YES | |
| `/v1/providers/[id]/test` | POST | `src/app/api/v1/providers/[id]/test/route.ts` | YES | |
| `/v1/providers/decisions` | POST | `src/app/api/v1/providers/decisions/route.ts` | YES | |
| `/v1/runs` | GET, POST | `src/app/api/v1/runs/route.ts` | YES | |
| `/v1/runs/[id]` | GET | `src/app/api/v1/runs/[id]/route.ts` | YES | Cross-tenant → 403 |
| `/v1/skills` | GET | `src/app/api/v1/skills/route.ts` | YES | |
| `/v1/tasks` | GET, POST | `src/app/api/v1/tasks/route.ts` | YES | **Denies API keys (403) — external consumers cannot retrieve task history** |
| `/v1/tasks/[id]` | GET | `src/app/api/v1/tasks/[id]/route.ts` | YES | |
| `/v1/tools` | GET | `src/app/api/v1/tools/route.ts` | YES | **EXPOSES internal tool registry** |
| `/v1/voice/agents` | GET | `src/app/api/v1/voice/agents/route.ts` | YES | **EXPOSES full VoiceAgent rows incl. `systemInstructions`** |
| `/v1/voice/agents/[id]/versions` | GET | `.../voice/agents/[id]/versions/route.ts` | YES | |
| `/v1/voice/analytics` | GET | `.../voice/analytics/route.ts` | YES | |
| `/v1/voice/billing` | GET | `.../voice/billing/route.ts` | YES | |
| `/v1/voice/calls` | GET, POST | `.../voice/calls/route.ts` | YES | Ad-hoc rate limit |
| `/v1/voice/calls/[id]` | GET | `.../voice/calls/[id]/route.ts` | YES | |
| `/v1/voice/calls/[id]/end` | POST | `.../voice/calls/[id]/end/route.ts` | YES | |
| `/v1/voice/calls/[id]/transfer` | POST | `.../voice/calls/[id]/transfer/route.ts` | YES | |
| `/v1/voice/calls/inbound` | POST | `.../voice/calls/inbound/route.ts` | YES | |
| `/v1/voice/campaigns` | GET, POST | `.../voice/campaigns/route.ts` | YES | |
| `/v1/voice/campaigns/[id]/actions` | POST | `.../voice/campaigns/[id]/actions/route.ts` | YES | |
| `/v1/voice/health` | GET | `.../voice/health/route.ts` | YES | |
| `/v1/workflows` | GET, POST | `src/app/api/v1/workflows/route.ts` | YES | |
| `/v1/workflows/[id]/run` | POST | `src/app/api/v1/workflows/[id]/run/route.ts` | YES | |

## 2. Spec-required `/v1/ai/**` endpoints — NONE EXIST

| Spec endpoint | Status | Closest existing |
|---|---|---|
| `POST /v1/ai/chat` | **MISSING** | `/api/ai/chat` (session-only, no API keys) |
| `POST /v1/ai/completions` | **MISSING** | — |
| `POST /v1/ai/tasks` | **MISSING** | `/v1/tasks` (denies API keys) |
| `POST /v1/ai/agents/execute` | **MISSING** | `/v1/agents/execute` (exists, not under `/ai/`) |
| `POST /v1/ai/content/generate` | **MISSING** | — |
| `POST /v1/ai/knowledge/search` | **MISSING** | `/api/rag/search` (session-only) |
| `POST /v1/ai/automation/execute` | **MISSING** | — |
| `POST /v1/ai/voice/sessions` | **MISSING** | `/v1/voice/calls` (different shape) |
| `POST /v1/ai/analysis` | **MISSING** | — |
| `POST /v1/ai/predictions` | **MISSING** | — |
| `GET /v1/tasks/{id}` | PASS | `/v1/tasks/[id]` |
| `GET /v1/usage` | **MISSING** | `/api/dashboard/usage` (admin-only) |
| `GET /v1/services` | **MISSING** | — |
| `GET /v1/health` | PASS | `/v1/health` |
| `POST /v1/projects/discover` | **MISSING** | — |

## 3. Auth wrapper contracts

| Wrapper | Used by | Auth | RBAC | Tenant | Zod | Audit | Rate limit |
|---|---|---|---|---|---|---|---|
| `secureRoute` / `secureCrud` (`src/lib/api/secure-route.ts`, `secure-crud.ts`) | 204 of 444 routes | YES | YES | YES | YES | YES | YES |
| `v1Handler` (`src/lib/v1.ts:37-74`) | 39 v1 routes | YES (API key) | NO (scope-derived only) | YES | NO (manual) | NO | **NO** (field exists, never enforced) |
| Inline `verifySessionToken` | ~97 legacy routes | YES | NO | NO (varies) | NO | NO | NO |

## 4. Public unauthenticated surface (edge allowlist)

`src/proxy.ts:21-35`:
- `/api/health`, `/api/health/ping`, `/api/v1/health`, `/api/ping`, `/api/infra/ping` (GET)
- `/api/whatsapp/webhook`, `/api/voice/telephony/webhook` (GET, POST) — inbound receivers, signature-verified
- `/api/public/` (GET, POST, PUT, DELETE) — only `/api/public/contact` exists today

## 5. Information-leak hotspots (must be sanitized before public exposure)

| Route | Leaks | File |
|---|---|---|
| `/v1/agents` GET | agent count (`total`), full agent list | `src/app/api/v1/agents/route.ts:34` |
| `/v1/agents/[id]` GET | `systemInstructions` (prompt), `runtimeProfile` (model config, knowledge scope, memory policy) | `src/app/api/v1/agents/[id]/route.ts:11-17` |
| `/v1/agents/[id]/run` POST | `agentId`, `agentName`, `model`, `tokens`, `latencyMs`, validation scores | `src/app/api/v1/agents/[id]/run/route.ts:64-78` |
| `/v1/models` GET | model catalog, provider health/latency/errorRate | `src/app/api/v1/models/route.ts:13-50` |
| `/v1/events` GET | `RunEvent` rows (orchestration trace) | `src/app/api/v1/events/route.ts:10-42` |
| `/v1/tools` GET | internal tool registry | `src/app/api/v1/tools/route.ts` |
| `/v1/voice/agents` GET | full `VoiceAgent` rows incl. `systemInstructions` | `src/app/api/v1/voice/agents/route.ts:13-23` |
