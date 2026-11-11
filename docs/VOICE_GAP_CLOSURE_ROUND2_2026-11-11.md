# Voice Gap-Closure Round 2 — 2026-11-11

Round 1 (`VOICE_GAP_CLOSURE_2026-11-11.md`) built the calling-center control plane. This round closes the gaps the Phase-0 audit still listed as PARTIAL/MISSING, against the Universal Enterprise AI Calling Center master prompt. Every item below is implemented, typed, tested and wired through the ONE runtime — no second execution paths, no fabricated data.

## What was missing → what was built

| # | Gap (audit finding) | Built in this round | Files |
|---|---|---|---|
| 1 | `VoiceAgent.knowledgeScope` was dead config — the conversation loop never read it | **Knowledge Engine wiring**: per-turn tenant-scoped retrieval (RagCollections + `doc:<id>` CompanyKnowledgeDocuments), snippets injected into the LLM system prompt with a hard "answer only from these facts" rule; fail-soft (a knowledge error never breaks a live call) and audited on the turn payload | `src/lib/voice/knowledge.ts`, `conversation-service.ts`, `responder-llm.ts` |
| 2 | `CallRecording` model existed but nothing wrote it | **Recording pipeline**: consent gate (`recordingAllowed`, default-deny) → `adapter.record(on)` on answer/terminal → CallRecording row + `recording_storage_mb` metering **only from real adapter metadata** (new optional adapter hook). Sandbox reports no metadata → no fake rows. Every decision (start/blocked/stop/error) audited as CallEvents | `src/lib/voice/recording.ts`, `call-service.ts`, `telephony/sandbox-adapter.ts` |
| 3 | No billing layer above metering (spec §20 `billing_records`) | **Usage → Billing**: per-period `VoiceBillingRecord` rows from real `VoiceUsageEntry` aggregates, tenant price book (`TenantConfig.config.voicePriceBook`, default all-zero = informational), simulated usage reported but never billed, idempotent generate + immutable `issue` | `src/lib/voice/billing.ts`, `schema.prisma`, `/api/v1/voice/billing` |
| 4 | Voice agents had no versioning (spec §10 Version + Audit history) | **`VoiceAgentVersion`**: immutable JSON snapshot per create/update, monotonic per agent, no-op writes skipped, exposed via `/api/v1/voice/agents/[id]/versions` | `src/lib/voice/agent-versions.ts`, both agent routes |
| 5 | Callback task was promised but never executed (spec §14) | **Callback scheduler**: `Escalation.callbackDueAt` deadline → `voice.callback.due` durable queue job re-dials the customer through `startCall` (same compliance path), new call linked via `parentCallId`, bounded retries, honest cancel on missing data; operator API `/api/voice/callbacks` | `src/lib/voice/callbacks.ts`, `handoff.ts`, `queue-worker.ts` |
| 6 | No barge-in / silence handling (spec §07/§09) | **Turn-taking layer** (audio-plane agnostic, server-side policy): noise-filtered barge-in classification → `barge_in` CallEvents, silence evaluation → Bangla/English nudge → polite hang-up after max nudges; nudges counted from durable turn payloads, not process memory | `src/lib/voice/turn-taking.ts`, `conversation-service.ts`, conversation routes |
| 7 | Presence never returned to `available` after handoff | Presence auto-release on call end when the human has no other active calls | `call-service.ts` |
| 8 | `holdSeconds` never written | Real hold-time accumulation from hold/unhold audit events | `call-service.ts` |
| 9 | Daily quota window used UTC midnight, could overshoot the campaign's local day by up to 6h | `localDayStartUtc(at, campaignTz)` — DST-safe (two-pass Intl), quota day now matches the calling-hours timezone; unknown tz falls back to UTC | `campaigns.ts`, `dialer.ts` |
| 10 | Quota alerts were audit-only (invisible to operators) | 80% quota alerts now also create a tenant Notification row (deduped) | `quotas.ts` |
| 11 | `Company.metadata` quota/price source did not exist — tenant config was silently ignored (latent bug) | Quota + price book now read `TenantConfig.config` (the real tenant JSON store) | `quotas.ts`, `billing.ts` |
| 12 | Campaign status schema comment drifted from `CAMPAIGN_STATUSES` | Comment fixed in both dialect schemas | `schema.prisma`, `schema.mysql.prisma` |
| 13 | Prometheus had no callback visibility | `voice_escalations_callback_scheduled` gauge | `metrics.ts` |

## New API surface

| Method + Path | Purpose |
|---|---|
| GET `/api/v1/voice/billing?periodKey=YYYY-MM` | Billing records + totals for a period (voice:read) |
| POST `/api/v1/voice/billing` `{action:"generate"\|"issue", periodKey?}` | Aggregate usage → draft records / freeze them (voice:write) |
| GET `/api/v1/voice/agents/[id]/versions` | Immutable agent version history (voice:read) |
| PATCH `/api/v1/voice/agents` | Update a profile + version snapshot (voice:write) |
| GET `/api/voice/callbacks` | Callback queue with overdue flags |
| POST `/api/voice/callbacks` `{action:"run"\|"schedule"}` | Execute a callback tick now / (re)schedule one |

Conversation turn APIs (`/api/voice/conversations/turn`, `/api/v1/voice/calls/inbound`) now accept `bargeIn`, `customerSpeechDurationMs`, `silenceMs`, and an empty `utterance` (silence turn).

## Schema changes (both dialects)

- `VoiceAgentVersion` (agent config snapshots, `@@unique([agentId, version])`)
- `VoiceBillingRecord` (`@@unique([companyId, periodKey, dimension])`)
- `Escalation.callbackDueAt`
- Campaign status/dailyQuota comments corrected

Applied to the dev SQLite store via `prisma db push`; MySQL parity regenerated (`npm run db:generate:schema`) and asserted by `mysql-schema-compatibility.test.ts` (221 models).

## Honest limits (unchanged by design)

- Real PSTN/SIP media, deployed Bangla STT/TTS engines and streaming audio remain deployment milestones — the sandbox is still simulated and every simulated record is flagged. See `TELEPHONY_ARCHITECTURE.md` and `BANGLA_VOICE_MODEL_EVALUATION.md`.
- `CallRecording` rows appear only when a real telephony adapter reports actual media metadata.
- The default price book bills nothing; operators must configure real prices deliberately.

## Verification

- `vitest` full suite: **1,649 passed / 0 failed / 15 skipped** (voice unit suite: 161 across 15 files; new tests for knowledge, turn-taking, billing, agent versions, callbacks, TZ day window)
- `tsc --noEmit`: 0 errors · `eslint` (voice lib + routes): 0 problems
- Prisma: both schemas valid, MySQL parity test green
