# Telephony and Real-Time Voice Architecture

**Status:** Phase 0 proposal — not deployed or load-tested
**Date:** 2026-10-31
**Parent audit:** [VOICE_CONTACT_CENTER_AUDIT.md](VOICE_CONTACT_CENTER_AUDIT.md)

## 1. Decision summary

Build a communications bounded context inside the existing ALO Labs AgentOS application. Keep Next.js/TypeScript as the control plane and user interface, MySQL/MariaDB as the verified existing production database policy, and the existing durable job mechanism for non-real-time work. Add dedicated telephony and media processes rather than running calls inside HTTP requests.

**Recommended pilot:**

- Asterisk 22 LTS family for SIP registration, carrier trunks, dialplan/ARI control, bridges, queues, and media attachment.
- SIP.js over SIP-over-WSS for the browser softphone; DTLS-SRTP media, ICE, and coturn where NAT traversal requires relay.
- An ARI event/command adapter that normalizes provider events into tenant-bound call records.
- A separate media worker using Asterisk ARI `externalMedia`, initially RTP/16-kHz linear PCM on an isolated private network, for AI audio.
- Local-first ASR/TTS/LLM adapters behind explicit capability and health checks.
- Carrier adapters for authorized SIP connectivity and, only if separately justified, hosted voice APIs.

**Not recommended for the first pilot:** deploying Asterisk, FreeSWITCH, and Kamailio together; migrating the existing database to PostgreSQL; building a custom SIP stack; or treating a hosted foreign number as permission to terminate traffic in Bangladesh.

Asterisk 22 is an LTS family with published full support through 2028-10-16 and security support through 2029-10-16. The upstream version table listed 24 as pre-release at inspection; do not select it merely because it is newer. Pin a reviewed, supported patch/release and rehearse upgrades. [Upstream lifecycle](https://github.com/asterisk/documentation/blob/main/docs/About-the-Project/Asterisk-Versions.md).

## 2. Non-negotiable boundaries

1. **PSTN is external infrastructure.** Asterisk can route internal SIP calls without a carrier. Calls to/from ordinary mobile and landline numbers require authorized carrier connectivity and lawful numbering/interconnection.
2. **No real number, trunk, recording, or outbound campaign is enabled by this proposal.** Those require separate owner approvals and the [compliance gates](SECURITY_AND_COMPLIANCE.md).
3. **No fabricated operational data.** Empty inventories show empty states. Sandbox calls are labeled `environment=sandbox`; they never contribute to production usage, billing, or success metrics.
4. **Tenant identity is server-derived.** A caller ID, SIP display name, request body, or unverified webhook field is not a tenant authorization credential.
5. **Provider capabilities are explicit.** Unsupported transfer, parking, recording, or media operations return `unsupported`, not a simulated success.
6. **Human safety overrides automation.** Sensitive actions, repeated recognition failure, customer requests, and policy exceptions route to an approved human process.

Bangladesh's published IPTSP guidelines describe licensed IP-telephony operation and routing international calls through licensed ICX/IGW paths; they are not a blanket authorization for arbitrary overseas VoIP termination. The published document is older and must be read with current law/directives and the carrier's actual authority. [1](https://lims.btrc.gov.bd/uploads/service_guideline/IPTSP%20Guideline.pdf)

## 3. Engine comparison and selection

| Technology | Role and strengths | Costs/limitations | Decision |
|---|---|---|---|
| Asterisk | Mature PBX, SIP channels, dialplan, ARI, bridges, queues, voicemail, conferencing, recording, external-media attachment | Media/transcoding and conferencing consume resources; ARI state/reconnect behavior needs careful engineering; clustering is not automatic | **Pilot PBX and media-control engine** |
| FreeSWITCH | Flexible media engine, Event Socket control, bridges/conferencing, carrier-oriented deployments | Different operational model; packaged binaries require a SignalWire account/PAT although source remains open; review actual component licenses and streaming modules | **Alternative if media benchmarks or carrier requirements favor it; not a second parallel PBX** |
| Kamailio | SIP proxy/registrar/load distributor, trunk concentration, edge routing; pairs with media engines | Does not replace a PBX or AI media application; configuration/operations expertise required; typically paired with rtpengine for media anchoring | **Add at measured scale/security boundary, not day-one complexity** |
| rtpengine | RTP/SRTP/ICE mediation and media anchoring, commonly with Kamailio | Another media plane to monitor and scale; GPL-3.0; kernel acceleration optional, not required for correctness | **Optional production border/scaling component** |
| SIP.js | Browser SIP over WebSocket and WebRTC sessions | Browser permissions, secure origin, codecs, device changes and NAT behavior must be tested; it is not a PSTN provider | **Browser endpoint library candidate** |
| coturn | STUN/TURN relay for WebRTC NAT traversal | Public relay needs hardening, ephemeral credentials, bandwidth and abuse controls | **Deploy when endpoint network tests require it; recommended for production reachability** |
| Hosted voice API | Can reduce PBX/carrier integration effort | External data path, recurring cost, country restrictions, provider-specific media/control semantics | **Replaceable adapter, not a mandatory core dependency** |

Upstream evidence: Asterisk's ARI specification exposes `POST /channels/externalMedia` as an external media source/sink and describes UDP/RTP, TCP/AudioSocket, and WebSocket transport options. The exact transport/format must be validated on the pinned release. [ARI source](https://github.com/asterisk/asterisk/blob/b9c14b15109cb9e9051cf679ea98c9ed2d8ad66f/rest-api/api-docs/channels.json). FreeSWITCH's official installation guide distinguishes token-authenticated binary packages from token-free source builds. [2](https://developer.signalwire.com/freeswitch/foundations/getting-started/). Kamailio, rtpengine, SIP.js, and coturn roles/licenses are recorded in [PROVIDER_COMPATIBILITY.md](PROVIDER_COMPATIBILITY.md).

Selection is conditional on a test-SIP proof of capability. No engine has been installed or benchmarked in Phase 0.

## 4. Logical topology

```text
Browser agent / supervisor
  HTTPS + authenticated application WebSocket (control/events only)
  SIP.js: SIP over WSS + WebRTC media
                 |
         TLS/WSS border + ICE/TURN
                 |
Authorized carrier <--- SIP/TLS + SRTP where supported ---> telephony border
                 |                                             |
                 +----------------------> Asterisk PBX / ARI <---+
                                           |       |       |
                                           |       |       +--> human endpoints
                                           |       +----------> queues / IVR / bridges
                                           |
                                  ARI events + commands
                                           |
                              Telephony adapter / call coordinator
                               |                 |                 |
                       MySQL call state     durable outbox     media-session manager
                               |                 |                 |
                         AgentOS APIs       workers/CRM       isolated media worker
                                                                 |
                                               RTP/audio frames + generation control
                                                                 |
                                           VAD -> streaming ASR -> dialogue policy
                                                        |                |
                                              tenant knowledge/tools <- local LLM
                                                        |
                                                 streaming TTS
                                                        |
                                             paced playout -> Asterisk

Consented recording path -> encrypted tenant-scoped object storage
Post-call jobs -> transcript correction, evidence-backed summary, CRM tasks, usage reconciliation
```

The application WebSocket is **not** the telephone audio transport. Socket.IO/JSON events can update screens and agent presence; RTP/WebRTC carries audio. Do not send PCM through the existing general-purpose room service.

### 4.1 Trust zones

- Public web zone: HTTPS/WSS only; no database, ARI, or carrier credentials in browser code.
- SIP/media edge: strict carrier ACLs, certificate validation, rate/fraud limits, topology hiding where appropriate.
- Telephony control zone: ARI and internal command APIs restricted to service identities; never publicly exposed.
- AI zone: outbound egress policy, model artifact allowlist, tenant-bound tool credentials, no raw carrier secrets.
- Data zone: MySQL, object storage, vector index, backup keys; least-privilege service accounts.

Raw RTP external media is not assumed encrypted. Keep the pilot media worker on the same host or an isolated, access-controlled private network. If audio crosses an untrusted boundary, select and test a protected transport/tunnel rather than exposing plaintext RTP. TLS on ARI does not automatically encrypt RTP.

## 5. Control-plane integration with AgentOS

### 5.1 Reuse, do not duplicate

- `Company` remains the tenant root; `CompanyUser`/roles remain membership foundations.
- Add a **human agent/endpoint registry** distinct from the existing AI `Agent` model.
- Add a **voice-agent profile** that references approved AgentOS policies/models rather than replacing the agent registry.
- Reuse `IntegrationCredential` patterns for provider secrets, with verified encryption and secret references.
- Reuse durable queue leases/retries for post-call work, campaigns, indexing, and webhook delivery.
- Reuse CRM and knowledge services only after tenant hardening and contract tests.
- Keep existing AgentOS conversations intact; introduce separate customer communication threads/channel identities.

### 5.2 Additive data model (proposal only)

| Aggregate | Purpose / essential fields |
|---|---|
| `TelephonyProviderAccount` | Tenant/provider/environment, secret reference, region, status, verified capabilities, health evidence |
| `PhoneNumber` + `NumberAssignment` | Real provider number ID, E.164 value, country/type, entitlement evidence, assignment interval, routing target, lifecycle |
| `SipTrunk` / `SipEndpoint` | Provider or human endpoint binding, tenant, transport/codec policy, credential reference, registration state |
| `Call` / `CallLeg` / `CallParticipant` | Tenant, direction, environment, provider IDs, caller/callee, bridge/queue/agent, timestamps, disposition, consent state |
| `CallEvent` | Provider event ID, normalized type, sequence, occurred/received times, sanitized payload, call version |
| `CallCommand` | Tenant-scoped idempotency key, command type, requested/approved by, provider request ID, state, result/error |
| `RoutingPlan` / `IvrMenu` / `RingGroup` / `CallQueue` | Versioned routing, business hours/holidays, priorities, overflow, human fallback |
| `VoiceAgentProfile` | Language/voice, greeting, instructions, knowledge/tool scopes, escalation/termination rules, limits, deployment version |
| `MediaSession` | Call/leg, transport, codec/sample rate, worker lease, generation counter, state, failure reason |
| `RecordingAsset` / `Transcript` / `TranscriptSegment` | Consent reference, encrypted object key/checksum, duration, speakers/legs, timestamps, correction/version history |
| `VoiceAsset` / `VoiceConsent` | Owner, provenance, model/voice rights, permitted uses, verification, expiry/revocation, derived-artifact lineage |
| `Campaign` / `CampaignContact` / `CallAttempt` | Lawful basis, suppression result, timezone/window, attempt caps, schedule, outcome, opt-out |
| `ContactChannel` / `CommunicationThread` / `Message` | Normalized phone/email/WhatsApp identities, tenant, consent, assignment, provider message IDs |
| `UsageEvent` / `UsageAdjustment` | Immutable source event, measured quantity/unit, provider cost evidence, tenant, period, correction lineage |
| `OutboxEvent` / `WebhookEndpoint` / `WebhookDeliveryAttempt` | Transactional event publication, signature key reference, attempt/retry/dead-letter evidence |

Every tenant-owned table needs an explicit owner and tenant-leading indexes. Child records must not reference a parent from another business. Where practical use composite references such as `(companyId, parentId)` against `(companyId, id)` and test them directly in MySQL.

MySQL does not provide PostgreSQL-style row-level security. Database-layer protection here means constraints, composite ownership keys, restricted grants, and optionally separate schemas/databases for stronger isolation; application repositories still must enforce row access. If the owner requires native RLS for every communications row, that is a separate architecture decision—not a reason to silently migrate the existing AgentOS database.

### 5.3 Tenant binding rules

- Inbound PSTN: verified provider account + destination number + active assignment interval → tenant.
- Browser call: authenticated session + explicit selected company + endpoint membership → tenant.
- Outbound: approved campaign/agent + assigned trunk/number + contact consent → tenant.
- Provider webhook: verified signature + provider account/number mapping → tenant; unknown mappings are rejected/quarantined.
- Recording download: authenticated tenant/resource permission → short-lived signed URL; never a public bucket URL.
- AI tool call: tenant and actor derived from the call/session, not model-generated arguments.

## 6. Provider adapter contract

The adapter is a replaceable boundary, not a lowest-common-denominator promise.

```ts
// PROPOSED contract; no implementation in Phase 0.
interface TelephonyAdapter {
  capabilities(): Promise<ProviderCapabilities>;
  health(): Promise<ProviderHealth>;
  originate(command: OriginateCommand): Promise<ProviderCommandReceipt>;
  answer(command: CallCommand): Promise<ProviderCommandReceipt>;
  hangup(command: CallCommand): Promise<ProviderCommandReceipt>;
  hold(command: CallCommand): Promise<ProviderCommandReceipt>;
  resume(command: CallCommand): Promise<ProviderCommandReceipt>;
  transfer(command: TransferCommand): Promise<ProviderCommandReceipt>;
  conference(command: ConferenceCommand): Promise<ProviderCommandReceipt>;
  park(command: ParkCommand): Promise<ProviderCommandReceipt>;
  retrieve(command: RetrieveCommand): Promise<ProviderCommandReceipt>;
  sendDtmf(command: DtmfCommand): Promise<ProviderCommandReceipt>;
  recording(command: RecordingCommand): Promise<ProviderCommandReceipt>;
  attachMedia(command: MediaAttachCommand): Promise<MediaSessionReceipt>;
  detachMedia(command: MediaDetachCommand): Promise<ProviderCommandReceipt>;
  reconcile(call: ProviderCallReference): Promise<NormalizedCallSnapshot>;
}
```

Number ordering/release, porting, emergency-service configuration, and trunk creation are privileged operations with separate approval workflows. They are not silently invoked by an agent builder.

Required semantics:

- Commands have tenant + operation + idempotency-key uniqueness and a request-body hash.
- A receipt means **accepted by provider**, not call answered or action completed.
- Events and reconciliation confirm final state. Timeouts enter `unknown/reconciling`, never automatic success.
- Retry a read/reconcile safely; do not blindly repeat an originate/transfer/payment-like side effect after an ambiguous timeout.
- Normalize cause codes while retaining the original provider cause for audit.
- Rate-limit and circuit-break per provider/tenant; preserve human fallback when AI fails.
- Store CDRs and provider usage separately from derived analytics so billing can be reconciled.

## 7. Call state and event model

Use separate **call**, **leg**, **media**, and **recording** state machines. A caller can remain connected while an AI media session fails.

Proposed call flow:

```text
created -> routing -> ringing -> answered
                         |          |-> human_active
                         |          |-> ai_active
                         |          |-> ivr / queued
                         |          |-> transferring -> human_active / queued
                         |-> failed / rejected / no_answer
answered paths -> ending -> ended -> post_processing -> completed
                                                |-> post_processing_failed
```

Rules:

- Persist a monotonic call version; apply transitions with compare-and-set.
- Deduplicate events by provider account/event ID; retain out-of-order events for reconciliation.
- A stale `ringing` event must not overwrite `ended`.
- Leg hangup does not necessarily end a conference or surviving transfer leg.
- Transfer is announced as successful only after the target leg/bridge is confirmed.
- AI-to-human handoff carries call ID, verified customer context, consent state, transcript summary, reason, and pending tasks.
- Failed handoff follows configured queue/callback/safe termination policy; the AI must not claim a human joined when none did.
- Post-call failure must not erase the fact that a call occurred or its provider usage.

## 8. Real-time AI audio path

### 8.1 Media formats and buffering

- Negotiate carrier/browser codecs independently: PCMU/PCMA where required, Opus for WebRTC where supported; avoid unnecessary transcoding and licensed codec dependencies.
- AI interface: mono 16-kHz signed linear PCM in 20-ms frames is a proposed starting point, subject to engine/model tests.
- Maintain RTP sequence/timestamp validation, bounded jitter buffer, packet-loss concealment, and playout pacing.
- Keep input and output generations separate. Every TTS chunk carries `callId`, `mediaSessionId`, and `generationId`.
- Bound queues. Under overload, degrade to a short apology/human fallback rather than accumulating unbounded audio and latency.

### 8.2 Turn taking and barge-in

1. VAD detects customer speech and distinguishes likely backchannel from a real interruption using tested thresholds.
2. Media worker marks a new input turn and cancels obsolete LLM/TTS work.
3. Stop playout and flush queued audio for the old generation; increment generation ID.
4. Ignore late chunks from the old generation.
5. Preserve the fact that some audio was already heard; cancellation cannot retract sound already delivered.
6. Resume only after endpointing/turn policy permits it.

Browser echo cancellation/noise suppression should be enabled where appropriate, but PSTN/server echo and double-talk still require measurement. Do not treat a VAD library as a complete barge-in solution.

### 8.3 Streaming speech recognition

Whisper-family models are fundamentally offline models used with incremental policy; faster-whisper alone is not a native streaming ASR protocol. Evaluate SimulStreaming/LocalAgreement-style wrappers and IndicConformer CTC/RNNT behavior separately. The upstream WhisperStreaming README says it is being superseded by SimulStreaming; license revisions must be pinned because older releases carried different terms. [1](https://github.com/ufal/SimulStreaming) [2](https://github.com/ufal/whisper_streaming).

Partial hypotheses may update live captions, but business actions use sufficiently stable text plus verification. Low confidence, repeated no-input, or conflicting hypotheses trigger clarification/human handoff.

### 8.4 Dialogue, knowledge, and tools

- Local-first LLM through the existing provider policy/router after model authorization and Bangla task evaluation.
- Retrieve only tenant-approved knowledge with source IDs and versions.
- Treat retrieved documents and caller speech as untrusted content; they cannot grant permissions or change system policy.
- Use typed, allowlisted tools for CRM lookup, appointment booking, order status, and suppression updates.
- Sensitive account changes, payment disputes, legal/safety issues, and policy exceptions require human approval.
- Never invent prices, policies, availability, customer identity, or completed actions.
- Persist structured outcomes with evidence spans and tool receipts; sentiment/emotion estimates are labeled uncertain indicators, not facts about a person.

### 8.5 Streaming TTS and failure behavior

Generate the first short sentence/chunk rather than waiting for a full answer. Validate text normalization, especially Bengali numbers, currency, dates, names, and Bangla-English switches. Pace audio to the telephony clock.

On ASR/LLM/TTS failure: stop the affected generation, play an approved fallback if possible, and transfer or end safely. On media-worker loss, the call coordinator reconciles the PBX state and avoids duplicate responses. On total AI failure, ordinary human/PBX routing should remain available where designed and tested.

## 9. PBX and contact-center feature design

| Capability | Proposed implementation | Verification required |
|---|---|---|
| Inbound calls | Carrier trunk → verified DID assignment → routing plan | Real authorized trunk, caller/destination mapping, failure routes |
| Outbound calls | Approved command/campaign → compliant trunk/CLI → call attempt | Consent, suppression, CLI entitlement, provider receipt/CDR |
| SIP accounts | Tenant-bound endpoint credentials, WSS/TLS policy | Registration, auth denial, credential rotation, NAT |
| Forwarding | Routing action to verified endpoint/number | Loop limits, consent/cost controls, failure |
| Blind/attended transfer | ARI/provider transfer with target confirmation | Both modes, target busy/no-answer, caller state |
| Hold/resume | PBX bridge/media control | Music/announcement, media timeout, resume |
| Call waiting | Queue/endpoint policy | Concurrent arrival, no lost leg |
| Park/retrieve | PBX parking lot with tenant authorization | Cross-tenant retrieval denial, timeout recall |
| Three-way/conference | Explicit bridge participants/roles | Join/leave, mute, recording disclosure, capacity |
| Voicemail | Consent-aware mailbox storage and notification | Access control, retention, transcription failure |
| Business hours/holidays | Tenant timezone + versioned calendar | Midnight/DST boundary where applicable, overrides |
| IVR | DTMF and optional speech menu with human escape | Invalid/no input, timeout, language selection |
| Ring groups/queues | Priority, skills, longest-idle/round-robin policy, overflow | Fairness, abandoned calls, agent disconnect |
| Caller ID | Verified owned/assigned CLI only | Provider authorization, rejection of spoofed CLI |
| Missed calls | Event-derived notification/callback task | Deduplication, opt-out, correct tenant |
| Dispositions | Required outcome taxonomy + notes | No invented outcome, correction audit |
| Recording | Separate consented bridge/leg recording path | Start/stop, disclosure, ACL, retention, restore |
| History/reports | Normalized call/leg/CDR records | Provider reconciliation, unavailable metrics labeled |

Human agent states: offline, available, ringing, busy, after-call work, break. Supervisor monitoring, whisper/barge, and recording access are distinct permissions with notices/consent and audit; they are not automatically granted to all administrators.

## 10. Outbound campaign safety

Outbound automation remains disabled until the owner, counsel, and carrier approve the use case and jurisdiction.

Before reservation and again immediately before origination:

1. Validate tenant/campaign status, lawful basis, purpose-specific consent, and recipient suppression/opt-out state.
2. Check current national/local registry requirements through the authorized process. If a required check is unavailable, fail closed for the affected campaign.
3. Evaluate recipient IANA timezone, local calling window, holidays, frequency caps, and attempt limits. Asia/Dhaka is a default for Bangladesh, not a universal assumption for every contact.
4. Atomically reserve an attempt under the campaign/contact cap.
5. Select an entitled number/trunk and approved caller identity.
6. Disclose AI identity and recording where required; provide a human path and opt-out.
7. Record provider acceptance, answer outcome, duration, disposition, and actual cost evidence separately.

Retry only permitted outcomes such as busy/no-answer within approved limits. Never retry a consent refusal or suppression match. An opt-out tool must confirm the suppression write before telling the caller it succeeded; otherwise escalate. Do not build spam, deceptive impersonation, harassment, or unauthorized robocalling workflows.

## 11. Deployment, resilience, and capacity

### 11.1 Stages

- **S0 — offline contracts:** schema/adapter/state-machine tests; no audio or external service.
- **S1 — isolated SIP lab:** two or more internal extensions, local Asterisk, browser softphone, no PSTN. Explicit sandbox labeling.
- **S2 — authorized carrier staging:** owner-approved test numbers/trunks, tiny allowlist, consented testers, spend/attempt caps.
- **S3 — controlled production pilot:** separate explicit approval, compliance evidence, measured capacity, on-call and rollback plan.

### 11.2 Host roles

Separate control-plane/app workers, PBX/media edge, AI inference, database, and object storage according to measured load. CPU-only batch speech may be feasible; real-time concurrency is unmeasured. The observed 2-vCPU/3.8-GiB audit sandbox is not a production sizing recommendation.

For a benchmark host, record CPU model/cores, RAM, NUMA, GPU/VRAM, disk IOPS, NIC, OS/kernel, network path, model hashes/quantization, engine versions, codecs, and power limits. Do not publish a supported call count before ramp/soak testing.

### 11.3 Failure and recovery

- ARI disconnect: reconnect with backoff, resubscribe, snapshot/reconcile active channels; avoid replaying stale commands.
- Worker crash: media-session lease expires; coordinator stops orphan media and follows call fallback policy.
- Database outage: stop new privileged actions; PBX emergency/basic routing behavior must be explicitly designed and tested, not assumed.
- Provider outage: circuit breaker, approved alternate route only if lawful/configured, human notification, no fabricated completion.
- Network impairment: bounded jitter buffers, loss concealment, reconnect policy, measurable degradation.
- Node drain: stop assigning new calls, allow active calls to finish or transfer safely, then stop.
- PBX failover: existing calls may drop unless a supported state/media replication design is proven. Design carrier reroute for new calls and disclose this limitation.
- Region failure: approved DR location, data-residency constraints, restored credentials/keys, carrier rerouting and recovery drill.

A single Asterisk pilot is a single point of failure. Production HA requires redundant hosts/paths and tested carrier behavior; adding Kamailio alone does not preserve an existing RTP conversation.

## 12. Latency and performance measurement

Define latency from **customer end-of-speech to first audible AI audio**, not model-token speed. Also measure greeting time separately.

Proposed pilot targets, subject to owner approval and hardware baseline:

- p50 turn-to-first-audio ≤ 1.2 s; p95 ≤ 2.0 s.
- p95 barge-in playout stop ≤ 250 ms after validated interruption.
- No unbounded audio queues; explicit loss/timeout/error rates.
- Sustained concurrent-call capacity is the highest tested load meeting agreed latency, quality, CPU/RAM/GPU, and failure thresholds—not a guessed number.

Instrument these timestamps: RTP receive, VAD endpoint, first/final ASR hypothesis, retrieval start/end, LLM first token/first sentence, TTS request/first chunk, first RTP playout, cancellation/flush, transfer request/confirmed bridge. Report p50/p95/p99, real-time factor, packet loss/jitter, CPU/RAM/GPU, memory growth, and failure causes.

Run a ramp such as 1, 2, 4, 8, 16 calls and continue only while healthy, followed by a sustained soak and fault injection. Include narrowband audio, code-switching, interruptions, provider timeout, worker restart, and human handoff. These are test procedures, not results.

## 13. Architecture acceptance gates

The architecture is not accepted for production until evidence exists for:

- Internal SIP registration/calling and browser device/NAT behavior.
- Authorized real inbound and outbound test calls with correct tenant/number mapping.
- Hold, transfer, queue, conference/parking behavior for each advertised capability.
- Streaming duplex audio, barge-in cancellation, echo/double-talk behavior, and network recovery.
- Bangla TTS/ASR evaluation in [BANGLA_VOICE_MODEL_EVALUATION.md](BANGLA_VOICE_MODEL_EVALUATION.md).
- Human handoff with context and confirmed target state.
- Consent-aware recording, secure playback, transcript/summary linkage, and CRM updates.
- Provider outage/ambiguous-timeout reconciliation without duplicate calls or charges.
- Tenant A/B negative tests across calls, recordings, transcripts, events, knowledge, and credentials.
- Measured capacity, monitored failure rates, backup restoration, and carrier/region failover.
- Separate owner approval for production deployment.

**Current status: design complete for review; implementation and operational verification have not started.**
