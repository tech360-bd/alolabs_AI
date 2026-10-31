# ALO Labs AI Voice & Contact Center — Phase 0 Audit

**Audit date:** 2026-10-31 (UTC)
**Repository:** `tech360-bd/alolabs_AI`
**Baseline:** `a13dd7a806866a7581d764548b089eff630e241f` (`main` and this checkout's starting commit)
**Working branch:** `arena/af56beb2-alolabs-ai`
**Decision status:** Phase 0 documentation only. **Owner approval is required before Phase 1. Production deployment is not approved.**

## 1. Executive conclusion

ALO Labs already has a substantial AgentOS application. The correct approach is an **additive communications domain inside that application**, not a replacement repository, a second competing tenant system, or a cosmetic call-center dashboard.

The existing foundation includes Next.js/React/TypeScript, Prisma, a MySQL/MariaDB production policy, company memberships and API keys, durable database-backed jobs, agent execution/routing, CRM and messaging code, storage adapters, and governance records. These are reuse candidates, not certificates of production readiness.

There is **no verified PSTN gateway, SIP trunk integration, browser softphone, real-time call-media bridge, working Bangla TTS engine, or streaming Bangla ASR pipeline in this checkout**. Existing voice screens and job records must not be represented as working speech services. Media generation and direct transcription provider calls are deliberately disabled pending governed capabilities.

The principal blockers are:

1. The baseline GitHub CI test step fails; its build and later gates were skipped.
2. Production data, actual database schema, deployment topology, backups, and carrier arrangements are unavailable for verification.
3. Several legacy routes authenticate users without consistently enforcing tenant ownership.
4. The legacy voice UI/API contracts disagree, and its queued jobs have no demonstrated speech worker.
5. The production compose override still specifies SQLite although runtime policy requires MySQL/MariaDB.
6. Browser microphone permission is currently denied by security headers.
7. Bangladesh's legal framework changed in 2025–2026. Current telecom, privacy, call-center, recording, voice-rights, and outbound-calling requirements need qualified local review.
8. No authorized Bangladeshi Bangla evaluation dataset, native-speaker results, speech benchmarks, or concurrent-call capacity measurement exists here.

**Recommended direction:** retain the existing application and production database family; use Asterisk for the initial PBX/media-control pilot, SIP.js for browser endpoints, and a separately isolated media/AI worker. Keep carrier connectivity behind adapters. Add Kamailio/rtpengine only when measured scale, trunk concentration, or edge-security requirements justify them. Evaluate Indic TTS/ASR locally before selecting production models. See [telephony architecture](TELEPHONY_ARCHITECTURE.md), [voice evaluation](BANGLA_VOICE_MODEL_EVALUATION.md), and [provider compatibility](PROVIDER_COMPATIBILITY.md).

## 2. Scope, evidence rules, and actions not taken

Evidence labels used throughout these documents:

- **SOURCE:** read directly at the baseline commit.
- **STATIC:** dependency-free local check executed; not an application or integration test.
- **REMOTE:** GitHub metadata read through the authenticated GitHub CLI.
- **EXTERNAL:** upstream documentation, source, license, or indexed official legal text reviewed.
- **PROPOSED:** design or acceptance target, not implemented or measured.
- **NOT VERIFIED:** insufficient evidence; never equivalent to zero usage or a failed production system.

This audit inspected source, schemas, configuration, tests as text, historical reports, current GitHub run metadata, upstream projects, and public regulatory sources. It did not inspect a production host or private deployment account.

**Not performed:** dependency installation; project cloning; model download/inference; database creation/query/migration; backup or restore execution; application startup; paid-service activation; number purchase; carrier configuration; production deployment; live call; customer-data processing; or destructive operation. No credentials were requested or copied into these documents. Environment files were checked for presence and key names only.

The worktree was clean before documentation. The intended implementation diff is limited to the six Phase 0 documents.

## 3. Current repository inventory

| Item | Observed result | Evidence/boundary |
|---|---:|---|
| Tracked files at baseline | 1,454 | `git ls-files`; not a quality measure |
| API `route.ts` files | 410 | `src/app/api/**/route.ts` |
| Next.js page files | 5 | Most product UI is composed from panels, not 20 independently verified workspaces |
| Panel components | 89 | `src/components/panels/*.tsx` |
| Test files | 113 | 100 under root `__tests__`, 13 under `src/__tests__`; not executed locally in Phase 0 |
| Prisma models | 192 in each schema | SQLite and MySQL model-name sets match; semantic/runtime parity is not established |
| Models with direct `companyId` | 76 of 192 | Other rows may inherit ownership, be global, or lack a clear owner |
| MySQL SQL files | 6 | 4 forward/additive scripts and 2 explicit rollback scripts; not six applied migrations |
| Local database files | None found | Historical database reports refer to other snapshots |
| Local `.env`, `.env.local`, `.env.production` | Absent | Production configuration remains unknown |
| Speech/telephony runtime dependencies | None found in reviewed manifests | No Asterisk, FreeSWITCH, SIP.js, Whisper, Piper, or media-streaming runtime installed by the app manifest |

### 3.1 Actual application stack

SOURCE: `package.json`, `package-lock.json`, `bun.lock`, `next.config.ts`, `tsconfig.json`.

- Next.js manifest range `^16.4.3`; both lockfiles resolve Next `16.4.3`.
- React/React DOM `19.2.3`; TypeScript `5.9.3`; Tailwind CSS 4; Radix UI; Zustand; Zod; Recharts.
- Prisma/client `6.19.2`; `mysql2`, `better-sqlite3`, and `pg` are present.
- Authentication uses bcrypt and opaque database-backed sessions; JWT helpers also exist.
- `ioredis`, S3 clients, Socket.IO client, and separate realtime/queue mini-services exist.
- CI uses Bun `1.3.4` with `bun.lock`; the Dockerfile uses npm and `package-lock.json`.
- Manifest dependency ranges agree with the npm lock's root declarations. Most sampled resolved versions agree, but `pg` resolves to `8.23.1` in npm and `8.22.0` in Bun. This is a reproducibility issue, not evidence of a runtime failure.

**Decision:** preserve this stack. Do not replace MySQL with PostgreSQL merely because a PostgreSQL adapter exists. Do not introduce a second frontend/backend framework. Choose one authoritative installation path per environment and prove lockfile reproducibility in Phase 1.

### 3.2 Database and preservation boundary

SOURCE: `prisma/schema.prisma`, `prisma/schema.mysql.prisma`, `src/lib/production-database.ts`, `src/lib/db.ts`, `docs/PRODUCTION_MYSQL.md`.

- Default Prisma schema: SQLite for development/tests.
- Production schema: MySQL; runtime policy permits MySQL/MariaDB and rejects SQLite and the SQLite driver-adapter override.
- `src/lib/db-adapters/postgres-adapter.ts` is not an authoritative Prisma production schema or a tested PostgreSQL migration path.
- Existing `Company` is the tenant root. `CompanyUser`, `CompanyApiKey`, `CompanyRole`, `CompanySettings`, budgets, knowledge, and credentials provide a foundation to extend.
- Many older domain rows have nullable `companyId`; some child records inherit tenancy through parents. `Settings` is a globally keyed table.
- `Conversation` is an existing AgentOS conversation model, not a verified omnichannel customer thread. Do not repurpose it destructively.
- CRM, billing, usage, webhook, and audit models exist, but telephony-grade call legs, number assignments, media sessions, consent scopes, immutable usage events, and contact-channel identities need an additive design.
- Money fields currently include `Float`; a billing ledger should use integer minor units or exact decimals, with tested rounding and currency handling.

Historical reports describe a 175-model SQLite snapshot with no declared foreign keys and older MySQL documentation describes 179 models. Those numbers are stale relative to the current 192-model source. They are **not current production findings**.

Before any schema work, the owner must supply an approved, read-only inventory of the actual target: engine/version, schema checksum, migration history, row counts, orphan counts, storage locations, and a recoverable backup. Backfill ambiguous ownership into a quarantined/review state; never silently assign legacy customer data to a default business.

### 3.3 Authentication and permissions

SOURCE: `src/lib/auth.ts`, `src/lib/api-auth.ts`, `src/lib/v1-auth.ts`, `src/lib/route-auth.ts`, `src/proxy.ts`, `src/lib/api/secure-crud.ts`.

Reusable controls include:

- bcrypt password hashes; random opaque session tokens hashed at rest; absolute and idle expiry; revocation helpers.
- Explicit company selection through `x-company-id`/`x-company-slug` in `api-auth`, with membership checks.
- Company API keys hashed at rest, expiry, active-company checks, and explicit scopes.
- Role/company-role helpers, a validated secure-CRUD factory, field encryption, CSRF helpers, and audit records.
- Optional MFA fields and a pending-MFA login path. Enforcement for every privileged account is not established.

Important limitations:

- The edge proxy mostly checks credential **presence**. Route-level verification remains essential.
- `PUBLIC_QUERY_PARAMS` (`action=ping`, `health=true`) bypasses the proxy's credential-presence gate for any API path. The static validator explicitly does not analyze this bypass.
- V1 session identity selects the oldest membership rather than an explicit tenant selector. This is unsuitable for ambiguous multi-business call operations.
- `withAuth` establishes identity, not tenant authorization.
- Secure CRUD supports parent ownership, but `tenantField: null` can produce an unfiltered query if no ownership relation is configured. Twenty-one route files use that option; each needs a global-resource versus tenant-resource decision and negative tests.
- Audit writes in the generic CRUD helper are best-effort. Privileged telecommunications operations require durable audit/outbox semantics, not silently missing audit records.

### 3.4 Existing voice and media functionality

SOURCE: `src/app/api/voice-system/route.ts`, `src/components/panels/voice-system-panel.tsx`, `src/lib/media-generation/*`, `src/app/api/avatar-voice/generate-voice/route.ts`.

| Area | Source finding | Operational classification |
|---|---|---|
| Legacy voice API | Reads/writes `Settings` keys prefixed `voice_system:`; no tenant owner in keys or records | Partial persistence only; isolation not established |
| Legacy voice UI GET | Expects top-level `models`, `voices`, `ttsHistory`, `sttResults`; API returns nested `data.voiceModels`, etc. | Contract mismatch |
| Legacy TTS UI | Sends action `tts`; API supports `start_tts_job` | Contract mismatch |
| Legacy STT UI | Sends multipart action `stt`; API expects JSON `start_stt_transcription` and `audioUrl` | Contract mismatch |
| TTS/STT jobs | Persist `queued`, null output/transcript; no speech worker found | Not working speech generation/recognition |
| UI history | Can synthesize a duration from text length and a fallback “Transcription completed” string | Must not be used as production evidence or usage data |
| Governed media path | Company-scoped request records, but generation defers to central policy | Honest disabled capability, not a TTS engine |
| Direct transcription | `transcribe()` throws because direct provider calls are disabled | Helper contracts/SRT/VTT code only |
| Voice cloning | Library labels and consent booleans exist; no verified owner-verification/revocation/training pipeline | Not an authorized cloning implementation |
| Bangla quality | No bn-BD model artifact, authorized test corpus, or native review | NOT VERIFIED |

The newer governed media path is a better security starting point than the legacy Settings-based voice route. Preserve existing records; do not delete them. Phase 1/3 should introduce versioned contracts and a reviewed ownership map while keeping unsupported operations visibly unavailable.

### 3.5 CRM, omnichannel, and developer platform

- CRM contacts/deals/pipelines/activities/notes exist. `src/app/api/crm/contacts/route.ts` verifies a session but does not constrain reads/writes to the caller's company. This is a **source-level isolation gap**, not a live exploit test.
- SMS code stores pending messages in global Settings keys and creates notifications/audit entries. No functioning SMS carrier adapter was found. Its fallback sender value is not an owned number and must never be displayed as provisioned inventory.
- WhatsApp client, inbox, number configuration, and HMAC webhook verification code exist. Number/token resolution still uses global Settings and default-company fallbacks. Unknown inbound numbers must not fall back to another tenant. Live Meta integration is unverified.
- Email uses custom raw SMTP/IMAP implementations, not an established mail library. Treat MIME parsing, TLS verification, protocol edge cases, attachments, and threading as high-risk until tested.
- Webhook management verifies sessions but accepts a company selector without a demonstrated membership check, stores generated secrets in plaintext, and returns the secret at creation. Delivery-attempt schema/read endpoints exist; a complete signed-delivery/retry worker was not identified.
- The realtime mini-service has optional authentication and client-selected room joins without a shown tenant-membership authorization step. It cannot safely carry call events or transcripts without redesign and tests.
- API key/scope foundations exist, but the requested communications API, idempotent call commands, signed webhooks, SDKs, and per-resource authorization matrix remain to be built.

### 3.6 Jobs, knowledge, storage, and operations

- `src/lib/job-queue.ts` has atomic compare-and-set claims, leases, heartbeats, bounded retries, dead-letter behavior, and unique idempotency keys. Reuse the mechanism, but scope new communications idempotency by tenant and operation and define side-effect reconciliation. A queue lease alone does not make an external call or payment exactly-once.
- `src/instrumentation.node.ts` starts an in-process worker. Production needs an explicit worker topology and graceful drain; real-time media must not run inside a Next.js request handler.
- RAG models and a tenant visibility helper exist. Nullable ownership, metadata-based visibility, source permissions, vector-store filters, deletion propagation, and citation correctness require end-to-end verification.
- Local/S3 storage code exists. Recording-specific encryption, retention, legal hold, signed-download ACLs, and restore drills are not established.
- `deploy/scripts/backup.sh` creates checksummed snapshots and explicitly records `restore_tested: false`. Encryption is not established by that checksum. `deploy/scripts/restore.sh` intentionally refuses automated production restore.
- Compose defines Redis, Qdrant, MinIO, Caddy, Prometheus/Grafana, Adminer, and MariaDB; a separate inference compose defines MySQL, Ollama, Qdrant, and n8n. These are configurations, not running services here.
- `docker-compose.prod.yml:29` sets a SQLite URL, conflicting with the production runtime guard. Inference compose uses mutable `latest` tags and an explicit model-pull service. Reconcile and pin only after approval; do not start these stacks in Phase 0.

## 4. Infrastructure observed in this audit sandbox

| Resource | Observation | Implication |
|---|---|---|
| CPU | 2 visible CPUs, x86-64 | Insufficient basis for a production concurrency claim |
| RAM | Approximately 3.8 GiB | Not a suitable combined PBX + ASR + LLM + TTS benchmark host |
| Disk | Approximately 21 GiB total, 20 GiB available at inspection | No model-library or recording-capacity commitment |
| GPU | No NVIDIA/DRI device or `nvidia-smi` observed | Local speech performance unmeasured |
| Runtime | Node 22.22.3, npm 10.9.8, Python 3.11.2 | Runtime presence only |
| Missing tools/services | Bun, Docker, database clients, FFmpeg, Asterisk, FreeSWITCH, Kamailio; no `node_modules` | No live stack or speech test run |
| Network | Restricted outbound host policy | Carrier/model-host reachability and production network behavior unverified |

These are sandbox facts, **not production capacity**. No inference endpoint, SIP account, trunk, phone number, or production database was made available. Hardware sizing must follow measured workload and residency requirements.

## 5. Checks actually executed

### 5.1 Local static checks

| Check | Result | What it does not prove |
|---|---|---|
| `node scripts/validate-route-auth.mjs` | PASS: 410 route files, 636 non-public handlers, 16 allowlist entries, 2 exceptions | Helper presence is not valid authorization; query-param bypass not analyzed |
| `node scripts/validate-compose.mjs` | PASS: 9 base services, 7 production overrides, port 3011 contract | Does not prove compose boots, datasource policy is satisfied, or services are healthy |
| `node scripts/check-workflow-definitions.mjs` | PASS: 17 definitions, 109 steps, 40 referenced agents, 0 errors/warnings | Not a real agent execution or workflow recovery test |
| `bash -n` on backup, restore, deploy scripts | PASS | Syntax only; no backup/deploy executed |
| Schema/model/lockfile inspection | Completed | No database connection or client generation |

### 5.2 Current GitHub evidence (REMOTE)

- `main` resolved to the baseline SHA during inspection.
- [CI run 40282410138](https://github.com/tech360-bd/alolabs_AI/actions/runs/40282410138), created 2026-10-26, **failed at “Complete test suite.”** Locked install, production dependency advisory gate, Prisma generation/delegate reconciliation, and TypeScript passed. Lint, build, artifact checks, and subsequent safety validators were skipped.
- Detailed failed-test logs could not be retrieved because the GitHub log download host was unreachable under the sandbox policy. The exact failing assertion is **NOT VERIFIED**; do not invent a cause.
- [Deployment run 40282410090](https://github.com/tech360-bd/alolabs_AI/actions/runs/40282410090) failed at the same test gate; deployment jobs were skipped.
- [Backup run 41160463846](https://github.com/tech360-bd/alolabs_AI/actions/runs/41160463846), 2026-10-31, failed at production SSH-secret validation; backup was skipped. The preceding four daily backup runs inspected also failed. This does not establish whether an independently operated backup exists.
- A Security Scan run succeeded, but that is not a tenant-isolation, telephony, privacy, or production-readiness certificate.

No GitHub workflow was triggered or changed during this audit.

## 6. Module-level reuse and gap assessment

| Module | Existing foundation | Missing before operational use |
|---|---|---|
| A — Cloud phone system | Storage, jobs, settings, provider patterns | SIP/PBX, carrier adapters, numbers, call legs/state, routing, IVR/queues, transfer/conference/parking, recording, CDR reconciliation |
| B — AI voice agents | Agent registry, execution policies, model router, approvals | Voice-specific profiles, media orchestration, barge-in, verified tool actions, telephony deployment, handoff and execution history |
| C — Voice studio | Media request contracts, UI panels, subtitle helpers | Actual local TTS, bn-BD evaluation, streaming/batch workers, real controls, consent-backed voice library/cloning |
| D — Speech-to-text | Disabled transcription contract and formatting helpers | Local ASR, streaming policy, timestamps/confidence, correction workflow, Bangla/code-switch benchmarks |
| E — Inbound AI center | CRM/knowledge/agent foundations | Authorized inbound trunk, DID routing, receptionist, consent, queue/human fallback, post-call workflow |
| F — Outbound AI calling | Generic campaigns/jobs/contacts | Lawful-basis/consent engine, suppression, calling windows, attempt ledger, carrier origination, opt-out and audit |
| G — Human contact center | Users, realtime primitives, panels | Secure softphone, endpoint registry, presence/queue assignment, call controls, supervisor authorization, lawful monitoring |
| H — CRM/customer 360 | CRM models/routes/UI | Tenant hardening, normalized phones/consent, call association, duplicate/import workflows, tasks and verified connectors |
| I — Omnichannel | WhatsApp/email code, SMS persistence | Carrier adapters, official Meta validation, unified threads, assignment, approval, delivery/retry, web chat |
| J — Call intelligence | Agent analysis/usage patterns | Real transcripts, evidence spans, outcome taxonomy, review workflow, calibrated quality indicators |
| K — Knowledge base | RAG/company knowledge models | Permissioned ingestion, tenant-safe retrieval, citations, versions, deletion/re-index, retrieval audit |
| L — Super admin | Company/admin panels, audit/usage/billing models | Real communications metrics, provider health, tenant-safe administration, privileged approvals, unavailable-data states |

A route, panel, model, or workflow definition is not evidence that its feature works. The roadmap assigns implementation and verification phases rather than marking these modules complete.

## 7. What can run locally versus what needs external infrastructure

**Potentially local/self-hosted after implementation and testing:** the web/control plane, MySQL/MariaDB, object storage, durable workers, permissioned knowledge retrieval, approved local ASR/TTS/LLM inference, internal SIP-extension calls, analytics over real records, and development/test adapters explicitly labeled as non-production.

**Requires an external authorized service or owner-provided infrastructure:** PSTN origination/termination, legally assigned numbers, carrier SIP connectivity, public SMS delivery, WhatsApp Business access, email delivery beyond a local test server, payment collection, and any production hosting/residency/DR arrangement not already owned.

**Cannot be certified locally in this sandbox:** real Bangladesh calls, number entitlement, carrier failover, native Bangla quality, production concurrency, legal compliance, backup restoration, or production security.

## 8. Risk register

Severity is delivery/security impact, not a claim that an incident occurred. “Gate” is the earliest phase that must resolve or formally contain the risk.

| ID | Severity | Risk and evidence | Mitigation / owner | Gate |
|---|---|---|---|---|
| R01 | Critical | Actual production DB/data/schema unknown; historical reports are stale | Owner + DBA: read-only inventory, consistent backup, isolated restore, ownership reconciliation; no reset/overwrite | Phase 1 schema work |
| R02 | Critical | Legacy tenant gaps in voice, CRM, webhooks, WhatsApp defaults and realtime rooms | Security/backend: deny-by-default tenant context, scoped repositories, negative A/B tests, quarantine ambiguous rows | Phase 1; recheck every later phase |
| R03 | Critical | Unauthorized PSTN/VoIP routing or number use | Owner + Bangladesh counsel + licensed carrier: verify authority, interconnects, numbering and service scope | Before any real call/number order |
| R04 | Critical | Recording/monitoring or outbound calling without a lawful basis | Counsel + product: purpose-specific consent/notices, suppression, recording default off, jurisdiction rules | Before recording/outbound pilot |
| R05 | High | Baseline CI test failure and skipped build gates | Engineering: reproduce in approved isolated environment, fix cause, require green CI before foundation merge | Phase 1 entry |
| R06 | High | Voice UI/API mismatch and queued-only jobs | Product/backend: versioned contract, real worker, remove fabricated duration/success fallbacks, contract tests | Phase 3 |
| R07 | High | Model code/weights/voice rights conflated; restrictive candidates | ML lead + counsel: artifact-level license/provenance register; exclude unresolved/noncommercial assets from commercial service | Phase 3 |
| R08 | High | Bengali support assumed from multilingual marketing | Native reviewers + ML lead: speaker-disjoint bn-BD corpus, blind evaluation, error/latency report | Phase 3 release |
| R09 | High | No speech-capable hardware or measured capacity | Owner + SRE: provide benchmark hosts; ramp tests, resource/latency/failure measurements | Phase 3/7 |
| R10 | High | Backup creation mistaken for recoverability; restore intentionally blocked | SRE + DBA: encrypted backup, key recovery, isolated restore and application ACL checks | Phase 1 baseline; Phase 7 certification |
| R11 | High | Compose datasource conflict and mutable images | SRE: reconcile MySQL policy, pin reviewed images, separate dev/prod, boot/readiness tests | Phase 1/2 |
| R12 | High | Browser mic denied; SIP/WSS/media not implemented | Frontend/telephony: explicit microphone permission flow, secure context, device/NAT tests | Phase 2 |
| R13 | High | Provider retries could duplicate calls, messages or charges | Backend: scoped idempotency, command ledger, reconciliation, retry budgets, circuit breakers | Phase 2/4/6 |
| R14 | High | AI invents commitments or executes sensitive actions | Product + security: grounded answers, typed tools, approval gates, verified outcomes, human escalation | Phase 4 |
| R15 | High | Barge-in/echo/network loss produces overlapping or stale audio | Media lead: generation IDs, cancellation/flush, jitter buffers, duplex fault tests | Phase 4/7 |
| R16 | High | Cross-tenant recordings/transcripts/vector retrieval | Security + ML: object ACLs, tenant-bound keys, filtered retrieval, deletion propagation, adversarial tests | Phase 1–5 |
| R17 | Medium/High | Bun/npm lock divergence and dependency supply chain | Engineering: authoritative lock per path, advisory/SBOM/license gates, pinned actions/images | Phase 1 |
| R18 | High | Current legal changes and conflicting older guidance | Bangladesh counsel: consolidated current-law memo, regulator/provider confirmations, compliance matrix | Before regulated features |
| R19 | High | Cloning without verifiable authority or revocation | Product + counsel: owner verification, scoped consent, audit, revocation, abuse response; feature remains off | Phase 3 cloning gate |
| R20 | Medium/High | Usage/billing based on estimates or floating-point money | Finance + backend: immutable measured events, exact arithmetic, provider invoice reconciliation, adjustment audit | Phase 6 |
| R21 | High | Single PBX/worker/region failure drops calls | SRE: explicit SPOF register, carrier reroute, drain/failover drills; no unsupported HA claim | Phase 7 |
| R22 | Medium | Existing AgentOS functionality regresses during expansion | Engineering/QA: additive schemas, contract/regression suite, feature flags, staged rollout and app-only rollback | Every phase |
| R23 | High | Owner-supplied third-party projects include restrictive licenses, dual-use tools, and architecture conflicts | Engineering/counsel: use [EXTERNAL_PROJECT_INTAKE.md](EXTERNAL_PROJECT_INTAKE.md); no clone/fork/install/merge without approval; license/tenant/consent/security gates | Phase 0 triage; Phase 1+ integration |

## 9. Owner decisions and Phase 0 stop gate

The owner should review these decisions before authorizing implementation:

1. Retain Next.js/TypeScript and the existing MySQL/MariaDB production policy.
2. Approve Asterisk-first pilot architecture, with FreeSWITCH/Kamailio as conditional alternatives.
3. Identify the actual production/staging environment and authorize a read-only inventory and isolated recovery test.
4. Nominate Bangladesh telecom/privacy counsel and an authorized carrier/IPTSP/hosted-call-center partner. No purchase or paid activation is implied.
5. Provide suitable benchmark hardware and authorize recruitment/compensation of native Bangla speakers/reviewers.
6. Approve local-first inference, default-off recording/cloning/outbound automation, and explicit human approval for privileged actions.
7. Approve the Phase 1 scope and its additive-data/security gates in the [implementation roadmap](IMPLEMENTATION_ROADMAP.md).

**Phase 0 deliverables:** this audit plus [TELEPHONY_ARCHITECTURE.md](TELEPHONY_ARCHITECTURE.md), [BANGLA_VOICE_MODEL_EVALUATION.md](BANGLA_VOICE_MODEL_EVALUATION.md), [PROVIDER_COMPATIBILITY.md](PROVIDER_COMPATIBILITY.md), [SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md), [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), and the owner-supplied third-party intake register [EXTERNAL_PROJECT_INTAKE.md](EXTERNAL_PROJECT_INTAKE.md). A later owner-directed follow-up added an instruction-only skill pack to the Command Agent; see [AGENT_SKILLS.md](AGENT_SKILLS.md). That follow-up did not authorize telephony Phase 1 or production deployment.

**Status: awaiting explicit owner approval. Do not begin Phase 1, alter databases, install the proposed stack, or connect production telephony based on this document alone.**
