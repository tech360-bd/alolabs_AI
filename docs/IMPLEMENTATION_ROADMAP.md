# ALO Labs Voice & Contact Center — Implementation Roadmap

**Status:** Phase 0 deliverable for owner review
**Date:** 2026-10-31
**Baseline:** `a13dd7a806866a7581d764548b089eff630e241f`
**Authorization boundary:** Phase 0 only. **Do not begin Phase 1 until the owner explicitly approves it. Production deployment needs separate explicit approval.**

Related documents: [audit](VOICE_CONTACT_CENTER_AUDIT.md) · [telephony](TELEPHONY_ARCHITECTURE.md) · [Bangla speech](BANGLA_VOICE_MODEL_EVALUATION.md) · [providers](PROVIDER_COMPATIBILITY.md) · [security/compliance](SECURITY_AND_COMPLIANCE.md).

## 1. Delivery strategy

Build inside the existing AgentOS repository and preserve its data and working surfaces. Add a communications bounded context with tenant-safe contracts, a replaceable telephony boundary, local-first speech adapters, and honest operational evidence. Do not create a separate fake call-center app or populate production screens with static demo calls.

Recommended sequence:

1. Stabilize and verify the existing baseline; harden tenancy/auth before new sensitive data.
2. Prove internal SIP/browser calling and call-state reconciliation without PSTN.
3. Evaluate and implement real Bangla speech in a studio/worker path.
4. Add AI calling and human handoff over authorized staging connectivity.
5. Complete CRM, omnichannel, supervision and evidence-backed intelligence.
6. Add measured billing, developer APIs/webhooks and platform administration.
7. Validate production-like load, failures, recovery, security and legal gates before a controlled pilot.

No calendar duration or concurrent-call capacity is promised. Relative sizes below are planning labels, not estimates of measured work. Each phase requires owner approval to enter, and regulated capabilities require additional gates even if earlier software phases are complete.

## 2. Phase and gate overview

| Phase | Objective | Relative size | Entry condition | Exit evidence |
|---|---|---:|---|---|
| G0 — Audit/design | Establish facts, architecture, rights, risks and plan | M | Current authorization | Six core documents plus external intake register; owner decision recorded |
| G1 — Secure foundation | Preserve baseline; additive contracts, tenancy, auth, jobs, storage, CI | L | Owner approval; approved isolated environment; DB inventory/backup plan | Green baseline + tenant/auth suite; reviewed migrations; backup baseline |
| G2 — Internal telephony | SIP lab, browser softphone, PBX adapter, call state/events | L | G1; isolated lab approval | Internal calls, controls, reconciliation, NAT/security tests; no PSTN |
| G3 — Speech studio | Authorized bn-BD evaluation, local TTS/ASR, voice library/consent | L/XL | G1; model/voice rights; benchmark hardware/reviewers | Native review, measured WER/MOS/latency, real exports/jobs, consent controls |
| G4 — AI + human calling | Inbound/outbound AI, barge-in, queues, human handoff | XL | G2 + G3; counsel/carrier approval for staging PSTN | Real authorized test calls, interruption/handoff, suppression, failure recovery |
| G5 — Customer operations | CRM 360, shared inbox, supervision, QA, intelligence | L | G1/G4 contracts; provider approvals per channel | Tenant-correct threads/CRM/transcripts, assignments, evidence-backed analytics |
| G6 — Commercial/developer | Usage/billing, APIs, webhooks, admin/observability | L | G4/G5 real usage sources | Reconciled ledger, signed/idempotent APIs, tenant-safe admin, cost evidence |
| G7 — Production pilot | Load/fault/security/recovery/legal validation | L | All required prior gates; separate production approval | Measured capacity, restore drill, monitoring/on-call, signed release checklist |

G3 may begin its offline corpus/license work in parallel with G2 after G1, but streaming integration waits for both. No phase may bypass tenant isolation or legal gates for schedule reasons.

## 3. G0 — Phase 0 audit and design (current)

### Completed deliverables

- `docs/VOICE_CONTACT_CENTER_AUDIT.md`
- `docs/TELEPHONY_ARCHITECTURE.md`
- `docs/BANGLA_VOICE_MODEL_EVALUATION.md`
- `docs/PROVIDER_COMPATIBILITY.md`
- `docs/SECURITY_AND_COMPLIANCE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/EXTERNAL_PROJECT_INTAKE.md` — owner-supplied projects/links recorded, deduplicated, resolved where possible, and triaged without cloning/installing/merging
- `docs/AGENT_SKILLS.md` — later owner-directed instruction-only skill import connected to the Command Agent; no telephony Phase 1 approval implied

### Evidence actually available

Source/config/schema inspection; dependency-free validators; shell syntax checks; GitHub run metadata; upstream source/license review; indexed official Bangladesh legal sources. No application test, build, database operation, model inference, live call, provider activation or deployment was performed.

### Owner decision required

Approve/reject/revise:

- Retaining Next.js/TypeScript and MySQL/MariaDB production policy.
- Asterisk-first pilot with SIP.js and replaceable carrier/media/speech adapters.
- Phase 1 scope, isolated environment, read-only production inventory and backup/restore procedure.
- Bangladesh counsel/carrier engagement and speech benchmark resources.
- Default-off recording, cloning, outbound automation and privileged deployment gates.
- Whether the external intake register is catalog-only, or whether selected candidates may enter a later approved evaluation/integration phase.

**Stop here after documentation review. Do not install the proposed stack or alter code/schema/infrastructure yet.**

## 4. G1 — Secure additive foundation

### Objectives

Make the existing application safe enough to add communications data without regressing AgentOS or exposing cross-tenant records.

### Work packages

1. **Baseline reproduction:** approved isolated install using one authoritative lock path; run lint/typecheck/tests/build and resolve the current CI failure with evidence. Reconcile Bun/npm lock differences and pin reviewed actions/images.
2. **Production inventory:** read-only engine/version/schema/migration/ownership/storage/backup inventory. No production mutation. Identify stale reports and actual target topology.
3. **Additive data contracts:** design migrations for the aggregates in the telephony architecture, exact money/usage types, composite ownership constraints and indexes. Expand-first; no destructive migration.
4. **Tenant/auth hardening:** explicit tenant context, secure-CRUD `tenantField: null` review, CRM/webhook/WhatsApp/realtime fixes, scoped API keys, MFA and shared rate limits.
5. **Secrets/storage/audit:** encrypted provider references, private recording/object ACL design, durable audit/outbox, key rotation and redacted logs.
6. **Worker topology:** separate durable jobs from real-time media; define leases, drain, retries, idempotency and reconciliation. Keep existing AgentOS workers functioning.
7. **Feature flags and contracts:** default-off communications flags, versioned API schemas, capability registry and honest unavailable states.
8. **Regression/security suite:** existing AgentOS smoke tests plus tenant A/B negative tests, auth/role tests, migration/backfill tests and backup baseline.
9. **Third-party intake gate:** review [EXTERNAL_PROJECT_INTAKE.md](EXTERNAL_PROJECT_INTAKE.md); no external repository is cloned/forked/installed/merged without a fit decision, license review, security review, and owner approval. Dify/Hypit/Rescript/AGPL/unclear-license items remain held or rejected unless counsel clears them.

### Likely touchpoints after approval

`prisma/schema*.prisma`, additive migration files, `src/lib/api/secure-crud.ts`, `src/lib/api-auth.ts`, `src/lib/v1-auth.ts`, `src/proxy.ts`, CRM/webhook/realtime modules, `src/lib/job-queue.ts`, storage/secret helpers, CI/compose configuration, and tests. New communications modules should live under a clearly named domain such as `src/lib/communications/` and versioned API routes; exact paths are a Phase 1 design decision.

### Acceptance evidence

- Green baseline CI, including the previously skipped build/lint/safety gates; exact failing-test cause documented and fixed.
- Migration plan reviewed against a restored copy; no data loss or ambiguous ownership assignment.
- Tenant A cannot access B's contacts, calls, recordings, transcripts, knowledge, credentials, jobs, rooms or exports by direct ID or forged selector.
- Privileged operations require the correct role/MFA/approval and produce durable audit events.
- Provider secrets are encrypted; browser bundles and logs contain no secrets.
- Backup created in the approved environment and restoration procedure exercised on an isolated target, or an explicit unresolved blocker remains and prevents G7.
- Existing AgentOS pages/APIs/workflows pass regression checks.

### Stop conditions

No production DB access, destructive migration, bulk dependency installation, or infrastructure change without the specific owner approval. If the actual database cannot be inventoried/recovered safely, stop schema rollout rather than guessing.

## 5. G2 — Internal telephony and browser softphone

### Objectives

Prove the PBX/control/media boundary without buying numbers or touching production carriers.

### Work packages

- Isolated Asterisk lab with `chan_pjsip`, ARI and a pinned configuration; no public carrier trunk.
- SIP.js softphone: registration, device selection, microphone permission, mute/hold, DTMF, incoming/outgoing internal calls and reconnect states.
- Scoped WSS/DTLS-SRTP/ICE/TURN configuration; update microphone Permissions-Policy only on the calling surface.
- Telephony adapter, normalized call/leg/event/command ledger, idempotency and reconciliation.
- Basic routing, ring group/queue, transfer, conference/parking and voicemail contracts where supported; unsupported capabilities remain disabled.
- Human endpoint registry, presence and assignment; separate call-control WebSocket from general realtime rooms.
- Sandbox labeling, fake-provider contract fixtures for tests only, and strict separation from production usage/billing.

### Acceptance evidence

- Two or more internal extensions complete real audio calls in the lab; browser device/NAT tests recorded.
- Hold/resume, DTMF, blind/attended transfer, queue and conference/parking tests pass for advertised capabilities.
- Duplicate/out-of-order events and ambiguous timeouts reconcile without duplicate calls or false success.
- Cross-tenant endpoint/room/call access is denied.
- PBX/worker restart and network impairment behavior is measured; existing-call limitations documented.
- No PSTN, number purchase or paid provider activation occurred.

## 6. G3 — Bangla speech evaluation and studio

### Objectives

Replace queued-only voice UI with real, rights-cleared local speech and a measurable quality gate.

### Work packages

- Artifact/license/provenance register and owner-approved corpus/consent process.
- Batch TTS candidates: Indic Parler, Rasa VITS; Piper only with an authorized Bangla voice; Kokoro as non-Bangla comparator. Exclude restrictive/unresolved models from commercial release.
- Evaluate owner-supplied Voicebox/VoiceStudio as studio/workflow references only after code/model/voice license review, AGPL decision, consent/revocation design, and bn-BD native evaluation; they are not automatic model approvals.
- ASR candidates: faster-whisper/Whisper, IndicConformer; evaluate incremental policy separately. VAD calibration and optional diarization.
- Native-speaker blind evaluation, WER/CER/entity metrics, code-switch/noise/codec coverage and hardware benchmarks.
- Real studio jobs, voice library, pronunciation dictionary, supported controls, WAV/MP3/subtitle exports and correction workflow.
- Streaming worker contract with generation IDs, cancellation, backpressure and measured first-audio latency.
- Consent-backed voice design/cloning design; cloning remains off until separate approval.

### Acceptance evidence

- Exact model/code/voice/output rights reviewed; no unresolved license in the enabled path.
- Locked bn-BD test set and native reviewer report meet owner-ratified thresholds, or the capability remains experimental/unavailable.
- Real audio outputs and transcripts exist; no client-side fabricated duration/transcript fallback.
- Batch/streaming jobs survive retry/restart without cross-tenant leakage or duplicate side effects.
- Measured latency/RTF/concurrency on selected hardware; no guessed capacity.
- Consent creation/verification/revocation and private voice-asset ACL tests pass before any cloning flag is enabled.

## 7. G4 — AI calling, inbound/outbound control and human handoff

### Objectives

Connect approved speech to real call flows with safe automation and human escalation.

### Work packages

- Media-session manager and Asterisk external-media transport on an isolated/protected path.
- VAD → ASR → dialogue/knowledge/tools → TTS → paced playout; barge-in cancellation and stale-generation rejection.
- Inbound receptionist, IVR/business hours, queue/overflow, voicemail and human fallback.
- Outbound campaign engine with lawful basis, consent/suppression, timezone/window/attempt caps, entitled CLI, budget and emergency stop.
- Voice-agent profiles/versioning, grounded answers, typed tools, approval gates and verified action receipts.
- AI-to-human handoff with context, consent, transcript summary, reason and confirmed target state.
- Authorized carrier staging adapter, number assignment, CDR reconciliation and provider outage handling.
- Recording default-off, disclosure/consent, secure storage and retention policy where approved.

### Acceptance evidence

- Real authorized inbound and outbound staging calls with consented testers and correct tenant/number mapping.
- Bangla conversation quality/latency measured on the telephone path; interruption and double-talk tests pass.
- Human handoff succeeds only when confirmed; failure routes are safe and accurately described.
- Opt-out/suppression is durable before success is claimed; prohibited retries are blocked.
- Provider timeout/outage and worker crash do not create duplicate calls, invented transfers or false billing.
- Recording start/stop, disclosure, ACL, retention and transcript linkage pass tests.
- Counsel/carrier approvals and owner staging approval are recorded. Production remains off.

## 8. G5 — CRM, omnichannel, supervision and call intelligence

### Objectives

Make communications useful to human teams without leaking data or inventing customer facts.

### Work packages

- Tenant-hardened CRM 360: normalized phones/emails/WhatsApp identities, contacts/companies/deals/tasks/notes, duplicate/import workflows and call association.
- Shared inbox: voice tasks, WhatsApp, SMS, email and web chat threads; assignment, SLA, templates/approvals, delivery/retry and opt-out.
- Human agent workspace: softphone, screen-pop, dispositions, after-call work, callbacks and knowledge.
- Supervisor workspace: live queues, team presence, authorized monitoring/whisper/barge, QA review and coaching.
- Recording/transcription workspaces: secure playback, correction, redaction, export and retention evidence.
- Call intelligence: summaries, outcomes, topics, evidence spans, tool receipts and uncertain sentiment indicators; no definitive emotion/truth claims.
- Permissioned knowledge ingestion/retrieval, citations, versions, deletion/re-index and retrieval audit.

### Acceptance evidence

- Calls/messages create the correct tenant's CRM/inbox records; no default-company fallback for unknown channels.
- Agents see only assigned/permitted data; supervisors have explicit monitoring permissions and audit.
- Transcript corrections preserve lineage; summaries cite real evidence and distinguish unknowns.
- Channel provider webhooks are verified, deduplicated and reconciled; credentials never cross tenants.
- Knowledge retrieval cannot return another tenant's documents, including through prompt injection.
- Existing CRM/AgentOS behavior passes regression tests.

## 9. G6 — Billing, developer platform and administration

### Objectives

Commercialize only measured usage and expose safe, replaceable APIs.

### Work packages

- Immutable usage events from real call/media/storage sources; provider cost evidence and invoice reconciliation.
- Exact minor-unit/decimal money, currency/tax/FX policy, credits/refunds/adjustments with dual approval.
- Subscription/number/minute/storage/user plans as configuration; no invented rates or margins.
- Versioned communications APIs, scoped keys, idempotency, pagination, rate limits and error contracts.
- Signed webhooks with replay protection, durable delivery attempts, retries/dead-letter and tenant-safe management.
- Super-admin/provider health, tenant suspension, fraud/spend controls, audit, backup/restore status and unavailable-data states.
- SDK/examples and migration/export tooling only after contracts stabilize.

### Acceptance evidence

- Usage reconciles to provider CDR/invoices within documented rounding rules; discrepancies are visible.
- Duplicate events/commands do not double-charge; adjustments preserve immutable lineage.
- API/webhook tenant A/B tests, signature/replay tests and ambiguous-timeout tests pass.
- Payment status reflects verified provider evidence; pending invoices are not presented as collected revenue.
- Admin actions require MFA/approval and produce durable audit; support access does not expose recordings by default.

## 10. G7 — Production validation and controlled pilot

### Entry requirements

All prior required gates, counsel/carrier approvals, production-like hardware, encrypted backups/keys, monitoring/on-call, incident plan, rollback plan and **separate explicit owner production approval**.

### Validation matrix

| Area | Required evidence |
|---|---|
| Real calls | Authorized inbound/outbound calls, CLI/number mapping, CDR reconciliation, transfer/queue/handoff |
| Bangla speech | Native-approved TTS, measured ASR/entity errors, code-switch/noise results, telephone-path latency |
| Duplex behavior | Barge-in stop time, stale-audio rejection, echo/double-talk, jitter/loss and reconnect tests |
| Human operations | Agent/supervisor permissions, monitoring notices, dispositions, callbacks and QA workflow |
| Data isolation | A/B tests across calls, recordings, transcripts, CRM, knowledge, credentials, jobs, exports and restored backups |
| Outbound safety | Consent/suppression, hours/frequency, opt-out, campaign stop and complaint handling |
| Recording/privacy | Disclosure/consent, secure playback, retention/deletion/legal hold, processor/transfer review |
| Billing | Measured usage, exact arithmetic, provider reconciliation, refunds/adjustments and audit |
| Resilience | Provider outage, worker/PBX restart, DB/storage failure, carrier reroute, region/DR drill |
| Capacity | Ramp and soak results meeting agreed latency/quality/resource thresholds; supported concurrency stated only from evidence |
| Recovery | Isolated restore with schema/ownership/ACL/media checks, measured RPO/RTO, key recovery |
| Security | Dependency/SBOM/license review, secret rotation, penetration/negative tests, audit integrity |
| Documentation | Runbooks, operator limits, known failures, legal register, provider contracts and accurate capability matrix |

### Rollout

1. Internal production-like rehearsal with synthetic/consented test data.
2. One approved tenant, tiny number/call/recipient allowlist, recording/cloning/outbound off unless specifically approved.
3. Observe quality, latency, reconciliation, complaints and cost; expand only after review.
4. Enable each sensitive flag separately with owner/counsel evidence.
5. Keep a tested emergency stop and app-only rollback; never roll back by deleting customer data.

## 11. Twenty-workspace coverage map

This is a proposed grouping into exactly 20 workspaces. Existing panel names are reuse anchors, not proof of working communications features.

| # | Workspace | Existing anchor | Main gap | Phase / acceptance focus |
|---:|---|---|---|---|
| 1 | Super Admin / Platform | `super-admin-command-center.tsx`, `companies-panel.tsx`, `system-health-panel.tsx` | Real communications health, privileged approvals, tenant-safe support | G6/G7: audited break-glass, real metrics, outage controls |
| 2 | Company Admin / Tenant Settings | `tenant-admin-panel.tsx`, `company-access-panel.tsx`, `settings-panel.tsx` | Explicit tenant context, communications policies, consent/retention | G1: role/MFA and A/B isolation |
| 3 | Voice Studio | `voice-system-panel.tsx`, `media-studio-panel.tsx` | Real local TTS, supported controls, exports, contract fix | G3: native-reviewed audio and durable jobs |
| 4 | Voice Library & Consent | `media-library-panel.tsx`, media request contracts | Voice provenance, owner verification, revocation, private assets | G3: rights/ACL/consent tests; cloning off by default |
| 5 | Transcription Studio | Disabled transcription helpers, output/subtitle code | Real ASR, timestamps, correction, code-switch evaluation | G3: measured WER/CER and real transcript lineage |
| 6 | AI Voice Agent Builder | `agent-factory-panel.tsx`, `agents-registry-panel.tsx`, `prompt-vault-panel.tsx` | Voice profiles, media policy, grounded tools, publish approval | G4: versioned agent and verified action receipts |
| 7 | Numbers & SIP Trunks | `integration-manager-panel.tsx`, credential patterns | Real provider inventory, entitlement, assignment lifecycle | G2/G4: no fake numbers; carrier reconciliation |
| 8 | Routing / IVR / Queues | `queue-panel.tsx` is not verified call routing; workflow foundations | Call-specific routing, hours, IVR, ring groups, overflow | G2/G4: state-machine and failure-route tests |
| 9 | Inbound AI Center | Agent/knowledge foundations | DID routing, receptionist, consent, human fallback | G4: authorized inbound test calls |
| 10 | Outbound Campaigns | Generic campaign/task/CRM patterns | Lawful basis, suppression, windows, attempts, CLI, stop | G4: consent/suppression and real staging calls |
| 11 | Live Calls / Call Control | Realtime primitives | Tenant-safe call events, legs, commands, media state | G2/G4: duplicate/out-of-order reconciliation |
| 12 | Human Agent Workspace | `contacts-panel.tsx`, `tasks-panel.tsx`, realtime code | Softphone, screen-pop, presence, dispositions, callbacks | G4/G5: assigned-call permissions and handoff |
| 13 | Supervisor / QA | `agent-evaluation-panel.tsx`, audit/approval patterns | Team monitoring, whisper/barge, coaching, consent/audit | G5: explicit permission and notice tests |
| 14 | Recordings | Storage adapters, media library | Consented capture, encryption, playback ACL, retention | G4/G5: secure download and deletion evidence |
| 15 | Call Intelligence / Analytics | `agent-intelligence-panel.tsx`, usage panels | Real transcripts, evidence spans, outcomes, calibrated indicators | G5/G6: no fabricated analytics; provider reconciliation |
| 16 | Knowledge Base | `rag-panel.tsx`, `document-system-panel.tsx`, `memory-panel.tsx` | Permissioned ingestion/retrieval, citations, deletion/re-index | G1/G5: cross-tenant and prompt-injection tests |
| 17 | CRM / Customer 360 | `web-crm-dashboard.tsx`, `crm-deals-panel.tsx`, `contacts-panel.tsx` | Tenant hardening, channel identities, call linkage, import/dedupe | G1/G5: correct tenant records and regression suite |
| 18 | Omnichannel Shared Inbox | `sms-panel.tsx`, WhatsApp/email code, `tickets-panel.tsx` | Official adapters, unified threads, assignment, delivery/retry | G5: verified webhooks and no credential fallback |
| 19 | Billing & Usage | `billing-panel.tsx`, `usage-panel.tsx`, `cost-estimate-panel.tsx` | Immutable measured events, exact money, invoice reconciliation | G6: no guessed rates/margins; audited adjustments |
| 20 | Developer APIs / Webhooks / Settings | `api-keys-panel.tsx`, `webhooks-panel.tsx`, settings | Scoped communications API, signed delivery, idempotency, secrets | G1/G6: A/B, replay, rotation and conformance tests |

The owner may rename/group navigation differently, but every capability needs a permissioned route, real data contract, empty/error/loading states, audit and acceptance evidence. A panel is not complete because it renders.

## 12. Data migration and preservation strategy

1. **Inventory:** read-only production schema/data/ownership/storage/backup report.
2. **Design review:** additive tables/columns/indexes, exact types, constraints, backfill and rollback plan.
3. **Restore rehearsal:** apply to an isolated restored copy; measure impact and verify existing AgentOS queries.
4. **Expand:** deploy additive schema and dual-read/write compatibility where needed; feature flags remain off.
5. **Backfill:** batched, idempotent, resumable jobs with progress/checkpoints and orphan quarantine. Never guess a default tenant for customer data.
6. **Validate:** counts, ownership, foreign-key/composite integrity, sample reads, performance and regression tests.
7. **Switch:** enable scoped reads/writes per tenant after evidence; keep old data intact.
8. **Contract later:** destructive cleanup is a separate future approval, not part of this roadmap's default execution.

Rollback is primarily application/flag rollback. Existing rollback SQL contains destructive statements and must not be run automatically. Production database reset/overwrite is prohibited.

## 13. Feature flags and demo separation

Proposed default-off flags:

```text
communications.foundation
communications.sip.lab
communications.pstn.staging
communications.pstn.production
communications.ai.inbound
communications.ai.outbound
communications.recording
communications.monitoring
communications.voice.cloning
communications.billing.enforcement
```

Each flag is tenant/environment scoped, has an owner, approval evidence, health dependency and emergency stop. Sandbox fixtures are labeled and excluded from production metrics/billing. Empty production inventories show real empty states; unavailable providers/models show why and what approval is needed.

## 14. Testing and evidence registry

| Test layer | Examples | Evidence artifact |
|---|---|---|
| Unit | state transitions, normalization, exact money, suppression, consent expiry | test report and coverage of critical branches |
| Contract | UI/API schemas, adapter capabilities, webhook signatures, idempotency | versioned fixtures and conformance report |
| Integration | MySQL constraints, storage ACLs, queue leases, vector filters, provider sandbox | isolated environment logs and assertions |
| End-to-end | internal SIP call, authorized staging call, handoff, CRM/inbox update | redacted call IDs, timestamps, recordings where consented |
| Security | tenant A/B, role escalation, replay, SSRF, prompt injection, secret leakage | negative-test report and remediation evidence |
| Speech | native MOS, WER/CER/entity errors, latency, code-switch/noise | locked corpus manifest and reviewer/benchmark report |
| Performance | ramp/soak, RTP loss/jitter, CPU/RAM/GPU, queue depth | measured capacity envelope and failure thresholds |
| Resilience | provider outage, worker/PBX restart, DB/storage failure, carrier reroute | fault-injection and reconciliation report |
| Recovery | backup restore, key recovery, ACL verification, RPO/RTO | signed restore drill report |
| Legal/commercial | counsel memo, carrier authority, model/voice rights, provider invoice | restricted compliance/contract register |

Proposed future evidence location: `docs/evidence/phase-N/` for redacted reports and manifests; large audio/backups remain in approved encrypted external storage, not Git. Do not create fabricated evidence files in Phase 0.

## 15. Ownership, dependencies and critical path

| Role | Responsibility |
|---|---|
| Owner/product sponsor | Scope, approvals, budget, risk acceptance, production decision |
| Engineering lead | Architecture, additive migrations, contracts, regression and CI |
| Backend/security | Tenant/auth, secrets, audit, APIs/webhooks, billing integrity |
| Telephony/SRE | PBX/carrier adapters, media transport, network, monitoring, recovery |
| ML/speech lead | Artifact rights, local inference, benchmarks, streaming and model registry |
| Bangla linguists/native reviewers | Corpus, pronunciation/prosody review, code-switch and acceptance scoring |
| Frontend/product design | Accessible workspaces, real states, microphone UX, Bangla localization |
| QA | Contract/E2E/security/load/fault tests and evidence registry |
| Bangladesh counsel | Current law, licences, consent/recording/outbound/transfer/retention matrix |
| Finance/provider owner | Quotes, contracts, invoices, usage reconciliation and adjustment approval |

Critical path: **owner approval → safe baseline/tenancy → internal SIP + speech evaluation → authorized AI calling/handoff → customer operations → measured billing/APIs → production validation**. Carrier/legal approval and voice-rights/native review can run in parallel but cannot be skipped.

External dependencies requiring explicit approval: production/staging access, benchmark hardware, speaker recruitment/compensation, counsel, carrier accounts/test numbers, optional hosted providers, payment gateway and production hosting/DR. No purchase or activation is authorized by this roadmap.

## 16. Production definition of done

The product may be described as production-ready only when evidence exists for:

- Real authorized inbound and outbound calls through the approved carrier path.
- Native-speaker-approved Bangladeshi Bangla TTS and measured Bangla ASR on telephone audio.
- Interruption/barge-in, low-confidence handling and confirmed human handoff.
- Working human agent/supervisor flows with correct permissions and notices.
- Secure, consent-aware recordings and tenant-correct transcripts/CRM/knowledge.
- Tested metering/billing, provider reconciliation and tenant isolation.
- Safe provider/model/network outage behavior without fabricated success.
- Verified monitoring, encrypted backups and an actual restoration drill.
- Current legal/carrier/model/voice-rights approvals and accurate operator documentation.
- Measured capacity and explicit known limitations; no invented numbers, usage, analytics or margins.
- Separate owner approval for the production release and each sensitive capability.

## 17. Immediate next action

Review the Phase 0 documents (six core deliverables plus the external project intake register) and record an owner decision:

```text
Decision: APPROVE PHASE 1 / APPROVE WITH CHANGES / HOLD
Approved scope and environment:
Database inventory/backup authorization:
Carrier/counsel engagement authorization:
Speech hardware/reviewer authorization:
Conditions and excluded actions:
Owner / date / evidence reference:
```

Until that decision is explicit, the correct state is **Phase 0 complete, implementation not started, production not approved**.
