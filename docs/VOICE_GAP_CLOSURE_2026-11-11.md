# Voice & Contact Center — Master-Prompt Gap Closure (2026-11-11)

Follow-up to `docs/VOICE_CONTACT_CENTER_AUDIT.md`. An audit against the
Universal Enterprise AI Calling Center master specification (22 modules,
§12–§23 requirements) found the control plane solid but several runtime
pieces unwired. This document lists what was built in this pass, per master
prompt section, with the honest remaining-work boundary.

## What was already in place (verified, unchanged)

Call state machine with validated transitions (`call-state.ts`), tenant-scoped
call lifecycle with CallEvent audit + metering (`call-service.ts`), structural
compliance gates — DNC (irremovable customer opt-outs), fail-closed calling
hours, attempt caps, frequency gaps, recording-consent default-deny, voice
clone consent (`consent.ts`, `routing.ts`), honest placeholder STT/TTS engines
(`speech.ts`), usage metering in 8 dimensions (`metering.ts`), telephony
adapter registry with honest `NotConnectedAdapter`s (`telephony/`), and the
Wave-1 ecosystem adapter layer (`src/lib/integrations/`, merged via PR #26).

## Closed in this pass

| Master prompt § | Requirement | Implementation |
| --- | --- | --- |
| §09 | Language detection bn/en/mixed | `src/lib/voice/language.ts` — script-based detection, `mixed` verdict for code-switching, honest `romanized` flag (never pretends ASR capability). Tests: `language.test.ts` |
| §07/§19 | AI identity disclosure | `src/lib/voice/disclosure.ts` — disclosure is prepended to every conversation opening in bn/en; cannot be configured away. Tests: `disclosure.test.ts` |
| §05/§09 | Conversation brain wired into real calls | `conversation-service.ts` — `beginConversation` (answer → greeting + disclosure) and `handleConversationTurn` (handoff rules → responder → persisted turns) are called from `PATCH /api/voice/calls {action:answer}`, the telephony webhook (`answered`) and `/api/voice/conversations/turn`. `runConversationTurn` accepts a per-call responder override; the ONE AI runtime path (`executeCompanyAIChat`, profile `local_fast`) is the LLM responder with the deterministic rule-based fallback (`responder-llm.ts`). |
| §18 | CallTranscript / CallSummary / call_outcomes write path | `finalizeCallArtifacts` runs on EVERY `endCall` path: transcript segments built from persisted turns (nothing invented), summary via LLM with deterministic fact-list fallback, structured outcome JSON (confirmed actions only), campaign feedback (`CampaignCall` status + retry scheduling). Integration-tested in `voice-conversation.test.ts`. |
| §14 | Human handoff execution | `handoff.ts` — `Escalation` model persisted; queue routing via `orderQueueCandidates` + `AgentPresence` (previously dead code); warm transfer through `transferCall`; **callback Task created when no human is available**; resolution route frees presence. Tests: `voice-conversation.test.ts`. |
| §12/§15 | Customer Context Engine | `customers.ts` — BD phone normalization (017…/880…/+880 → E.164), caller identification by **exact normalized-phone match only** (no weak-identity merging), inbound contacts attached to `CallSession.contactId`. Tests: `customers.test.ts`. |
| §13 | Campaign approval lifecycle | `campaign-lifecycle.ts` state machine (draft → pending_approval → approved → running ⇄ paused → completed/cancelled/expired); `PATCH /api/voice/campaigns` and `POST /api/v1/voice/campaigns/:id/actions` implement approve/pause/resume/cancel/start with expiry enforcement. Tests: `campaign-lifecycle.test.ts`. |
| §13 | Duplicate-call prevention | `@@unique([campaignId, destinationNumber])` on CampaignCall + `isDuplicateDestination` normalized check on prepare; migration de-duplicates existing rows safely. |
| §13/§21 | Concurrency limits, quotas, scheduled dialing | `maxConcurrentCalls` + `dailyQuota` on Campaign, enforced by `dialGate` and the dialer; `dialer.ts` picks due contacts (DNC → hours → attempts re-checked at dial time); `queue-worker.ts` runs `voice.campaign.tick` on the durable Prisma queue polled by `src/instrumentation.node.ts` (same lease/retry machinery as AgentOS — no second scheduler). Tests: `dialer-quotas.test.ts`. |
| §19/§23 | Webhook security | `webhook-security.ts` — HMAC-SHA256 over `timestamp.body`, constant-time compare, 5-minute replay window; legacy static-secret header accepted only during the adapter migration window and never overrides a bad HMAC. Spoof/replay/tamper tests: `webhook-security.test.ts`. |
| §22 | Idempotency | `idempotency.ts` + `VoiceIdempotencyKey` model — `Idempotency-Key` header on call POSTs replays the first response for 24h; in-flight keys return conflict instead of double-dialing. |
| §22 | Rate limits | Per-tenant sliding-window limit (30 call starts/min) on `/api/voice/calls` and the v1 surface via the existing `rate-limiter.ts`. |
| §20 | Quotas & budget alerts | `quotas.ts` — per-tenant monthly minute quotas from `Company.metadata.voiceQuota` (or `VOICE_DEFAULT_MONTHLY_MINUTE_QUOTA`), checked against REAL metered usage pre-dial (fail-closed); 80% crossings write a deduped AuditLog alert. Tests: `dialer-quotas.test.ts`. |
| §17/§21 | Observability | `metrics.ts` — `voice_calls_*`, concurrency, escalations, campaign depth, metered minutes exported in Prometheus text format at `/api/metrics/prometheus` (real DB aggregates only). |
| §08 | SIP management / provider registry | `/api/voice/sip-trunks` (register/verify with honest adapter health checks) and `/api/voice/telephony/providers` (`TelephonyProviderConfig` model, capability report, health action). Dangling `IntegrationCredential` reference on `SipTrunkConfig` documented as an external secret-store reference. |
| §12 | Appointments | `Appointment` model + `/api/voice/appointments` CRUD; booking linked to the booking call. |
| §15/§19 | Per-customer consent | `CustomerConsent` model + `/api/voice/customer-consents`; **revocation is permanent and lands on the DNC list automatically** (opt-out can never be un-done by config). |
| §19 | Suppression on manual outbound | POST `/api/voice/calls` outbound dials now pass the same DNC gate as campaigns — customer-request opt-outs are refused unconditionally. |
| §22 | Versioned API surface | `/api/v1/voice/*`: `calls` (GET/POST), `calls/:id` (GET), `calls/:id/transfer`, `calls/:id/end`, `calls/inbound` (identify → answer → conversation), `campaigns` (GET/POST), `campaigns/:id/actions` (approve/pause/resume/cancel/start), `agents` (GET/POST), `analytics`, `health` — auth + `voice:read`/`voice:write` scopes via `v1Handler`. |
| §23 | Tests | New: language, disclosure, webhook security (spoof/replay/tamper), campaign lifecycle, customer matching, quotas, dialer picking, conversation integration (disclosure, handoff, callback task, artifacts, tenant isolation). Suite: 1613 passing. |

## Database changes (additive)

`prisma/schema.prisma` + `prisma/schema.mysql.prisma` (kept in parity, verified
by `verify-mysql-compatibility`):

- `CallSession`: + `language`, + `contactId` (FK → CrmContact)
- `Campaign`: + `approvedById`, `approvedAt`, `expiresAt`, `maxConcurrentCalls`, `dailyQuota`
- `CampaignCall`: unique `(campaignId, destinationNumber)`
- New: `Escalation`, `Appointment`, `CustomerConsent`, `TelephonyProviderConfig`, `VoiceIdempotencyKey`
- Migration: `prisma/migrations/mysql/20261111_voice_gap_closure.sql` (+ rollback)

## Honest remaining boundary (unchanged by design)

1. **Real PSTN connectivity** — adapters for Asterisk/FreeSWITCH/external SIP
   still fail honestly until an authorized carrier/trunk is configured and
   verified by the owner (telecom compliance + paid service approval is an
   owner gate, see `docs/TELEPHONY_ARCHITECTURE.md`).
2. **Media layer** — streaming RTP/WebRTC audio, barge-in, silence detection
   and real Bangla ASR/TTS engines require a deployed media server + model
   hosting; the speech registries stay honest placeholders
   (`docs/BANGLA_VOICE_MODEL_EVALUATION.md`). The conversation loop is fully
   wired end-to-end at the control plane and will carry real audio the moment
   an adapter registers a real media bridge — no second code path needed.
3. **Native-speaker voice quality evaluation** — cannot be claimed from code.

## Verification

- `vitest run`: **1613 passed**, 15 skipped (MySQL-only, need MYSQL_TEST_URL)
- `tsc --noEmit`: clean
- `eslint` on all touched paths: clean
- `prisma validate` both schemas: valid; parity check: 219/219 models, 0 errors
- `validate-route-auth`: OK (all new handlers reference auth helpers)
