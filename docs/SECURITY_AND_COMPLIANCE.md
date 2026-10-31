# Security, Privacy and Bangladesh Compliance Plan

**Status:** Phase 0 engineering plan and legal-research checklist — not a legal opinion or compliance certification
**Date:** 2026-10-31
**Related:** [audit](VOICE_CONTACT_CENTER_AUDIT.md) · [architecture](TELEPHONY_ARCHITECTURE.md) · [providers/licenses](PROVIDER_COMPATIBILITY.md) · [speech/voice rights](BANGLA_VOICE_MODEL_EVALUATION.md)

## 1. Operating principle

Calls, recordings, transcripts, voiceprints, contacts, knowledge and provider credentials are sensitive business data. A working login or a `companyId` field is not enough: every request, event, file, vector search, background job and export must resolve to an authorized tenant and actor.

Until the controls below are implemented and tested:

- Real PSTN connectivity, outbound campaigns, recording, supervisor monitoring and voice cloning remain **off**.
- Unsupported or unverified capabilities are shown as unavailable, not simulated.
- Production deployment requires separate explicit owner approval after security, legal, speech-quality and operational gates.
- No customer production data may be copied into development, model evaluation or training without an approved lawful purpose and safeguards.

Bangladesh's legal landscape changed materially in 2025–2026. Older blogs, foreign-provider country pages and the repealed Cyber Security Act 2023 / 2025 ordinance are not sufficient authority. Qualified Bangladesh counsel must confirm current applicability, commencement, rules, licences and sector-specific duties before regulated features launch.

## 2. Current legal research baseline

This is a source map, not a completed interpretation. Official pages were reviewed through indexed extracts where direct retrieval was unavailable; counsel must read the current consolidated Bangla texts and any later amendments/rules.

| Instrument/source | What was observed | Product implication | Still to verify |
|---|---|---|---|
| Telecommunication Act 2001, consolidated with amendments including Act 51 of 2026 | Official consolidated text includes licensing, interception/direction, obscene/abusive calls, annoyance and eavesdropping provisions. Act 51/2026 superseded a 2026 ordinance. [3](http://bdlaws.minlaw.gov.bd/act-print-857.html), [2](https://btrc.gov.bd/pages/laws/bangladesh-telecommunication-amendment-act-2026-3w9asu-69e6fc7b61b1833fcd152edc), [1](http://bdlaws.minlaw.gov.bd/act-1618.html) | Do not treat software ownership as telecom authorization. Route through an authorized operator/partner; control nuisance, spoofing, interception and recording | Exact licence/registration category, current directives, interception duties, numbering/CLI, emergency services, AI/automated calling treatment |
| BTRC IPTSP guideline and LIMS call-center/BPO guidance | Published IPTSP licensing/interconnection guidance; current LIMS lists call-center/BPO registration material. Older guideline is not automatically current in every detail. [1](https://lims.btrc.gov.bd/uploads/service_guideline/IPTSP%20Guideline.pdf), [1](https://lims.btrc.gov.bd/guidelines) | Prefer an authorized local carrier/hosted-call-center partner; separate domestic/international and remote-agent rules | Current application process, fees, security deposit, cloud/remote-agent conditions, domestic/international separation, inspection and reporting |
| Personal Data Protection Act 2026, Act 63 | Official register contains the 2026 Act, replacing the 2025 ordinance; text addresses lawful processing, data-subject rights, retention, security, audits and cross-border transfer. The official page was indexed as updated 2026-10-25. [2](http://bdlaws.minlaw.gov.bd/act-print-1692.html), [3](http://bdlaws.minlaw.gov.bd/act-print-1574.html) | Build purpose limitation, notices, consent/withdrawal, minimization, access/correction/deletion, processor controls and transfer safeguards | Commencement of every relevant section, exemptions, significant-fiduciary classification, DPO/audit duties, children's data, breach timelines, prescribed retention/transfer rules |
| National Data Management Act 2026, Act 80 | Official text establishes a national data-management authority and framework; PDPA references that authority. [1](http://bdlaws.minlaw.gov.bd/act-details-1709.html), [3](http://bdlaws.minlaw.gov.bd/act-details-1692.html) | Data classification, governance and possible public/private-sector obligations need review alongside PDPA | Applicability to this service, classifications, registration/reporting, localization/interoperability and rules |
| Cyber Security Act 2026, Act 81, and 2026 amendment | The 2025 ordinance is marked repealed by Act 81/2026. Official ICT/NCSA registers also list a 2026 amendment (Act 99); indexed consolidated text notes deletion of section 20. [2](http://bdlaws.minlaw.gov.bd/act-1538.html), [1](http://bdlaws.minlaw.gov.bd/act-print-1710.html), [8](https://ictd.gov.bd/pages/laws), [3](https://ncsa.gov.bd/pages/static-pages/6922e12a933eb65569e2a9f5) | Security governance, incident handling, evidence preservation and lawful access requests need current-law review | Current offences/procedures after amendment, reporting duties, authority powers, audit/certification expectations and service-provider obligations |
| BTRC DND / A2P material | Official DND page concerns unwanted promotional SMS; BTRC publishes A2P aggregator enlistment directives. [1](http://old.btrc.gov.bd/do-not-disturb-dnd), [2](http://old.btrc.gov.bd/directives) | Use authorized A2P routes and suppression; do not copy foreign DNC rules or assume SMS DND equals a complete voice-calling rulebook | Current NDNC/DND scope for voice vs SMS, access process, transactional exceptions, hours, frequency, sender-ID and complaint handling |
| Meta WhatsApp Business Platform | Official documentation describes current per-message service pricing and template/window rules. [2](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages) | Verify WABA terms, opt-in, templates, human escalation, data processing and current rates before live messaging | Bangladesh rate card, account permissions, AI-agent restrictions, retention and supported API version |
| Foreign carrier country pages | Twilio/Telnyx pages describe availability/regulatory processes, not Bangladesh legal advice | Treat as vendor claims requiring written confirmation and local counsel review | Actual number inventory, CLI, inbound/outbound authority, documents, taxes and lawful routing |

**Do not infer a universal consent rule, recording rule, retention period, calling hour, or DNC exemption from this table.** The engineering defaults below are conservative product controls pending counsel's use-case-specific matrix.

## 3. Threat model and protected assets

### 3.1 Actors

- Unauthenticated internet users and credential-stuffing bots.
- Authenticated users attempting cross-tenant access or privilege escalation.
- Compromised human-agent devices/browser sessions.
- Malicious or mistaken tenant administrators and developers.
- Provider webhook spoofing/replay and ambiguous provider retries.
- SIP scanners, toll-fraud attempts, caller-ID spoofing and RTP/media injection.
- Prompt injection through caller speech, uploaded documents, CRM notes or retrieved web content.
- Compromised model artifacts, dependencies, containers or worker credentials.
- Insider misuse of recordings, voiceprints, exports, monitoring or billing adjustments.

### 3.2 Assets

Session/API credentials; company memberships and roles; carrier tokens/SIP credentials; phone numbers; live audio and call control; recordings/transcripts/summaries; contacts and consent; knowledge documents/vector indexes; voice reference audio/embeddings; campaign lists; usage/invoices; audit trails; backups and encryption keys.

## 4. Authentication, authorization and tenant model

### 4.1 Existing foundation and required hardening

Reuse hashed opaque sessions, bcrypt, company membership checks, scoped hashed API keys, MFA helpers, CSRF checks, field encryption and audit foundations. Before exposing communications features:

1. Make tenant context explicit and server-resolved for every protected operation. Never trust a body/query `companyId` alone.
2. Fix the V1 session path that chooses an arbitrary oldest company; require an explicit authorized selection.
3. Review all `tenantField: null` secure-CRUD routes: declare global resources explicitly, otherwise add tenant/parent ownership and negative tests.
4. Add company membership/role checks to webhook management; encrypt secrets and return them only through a controlled reveal/rotation flow.
5. Authenticate realtime connections and authorize every room/subscription against tenant and resource permissions.
6. Remove or narrowly scope the proxy's query-parameter auth bypass; health endpoints must not expose protected data.
7. Enforce MFA for platform administrators, provider/number changes, exports, retention changes, billing adjustments and voice-consent administration.
8. Rate-limit login, password reset, API-key use, call origination, exports and webhook endpoints with a shared store, not only process memory.
9. Rotate/revoke sessions and API keys on role change, tenant suspension, compromise and offboarding.

### 4.2 Permission matrix (proposal)

Platform roles and company roles are separate. A platform role does not silently grant access to customer recordings.

| Capability | Company owner/admin | Supervisor | Human agent | Campaign manager | Voice/knowledge admin | Finance | Developer | Auditor |
|---|---|---|---|---|---|---|---|---|
| View assigned calls/CRM | ✓ | Team scope | Assigned scope | Campaign scope | No default audio access | Metadata only | No default | Approved read scope |
| Make/receive calls | ✓ | ✓ | ✓ | Only approved test/campaign role | ✗ | ✗ | Sandbox only | ✗ |
| Transfer/hold/conference | ✓ | ✓ | Own active call | ✗ | ✗ | ✗ | ✗ | ✗ |
| Monitor/whisper/barge | Explicit permission | Team + notice/consent | ✗ | ✗ | ✗ | ✗ | ✗ | Audit of actions only |
| Play/download recording | Explicit permission | Team scope | Assigned scope, if policy allows | ✗ | No default | ✗ | ✗ | Approved read scope |
| Edit transcripts/summaries | Review role | Review role | Own call corrections | ✗ | No default | ✗ | ✗ | View lineage |
| Manage voice agents | ✓ | Approved editor | ✗ | Campaign binding only | ✓ | ✗ | API draft only | Read version |
| Publish agent/routing | ✓ or dual approval | Approved publisher | ✗ | ✗ | Draft only | ✗ | ✗ | Read evidence |
| Manage campaigns | ✓ | Review | ✗ | Create/operate within limits | ✗ | ✗ | ✗ | Read evidence |
| Approve outbound/number/provider changes | ✓ + owner/counsel gate | ✗ | ✗ | Request only | ✗ | Cost review | ✗ | Audit |
| Manage consent/retention/legal hold | ✓ + approval | ✗ | Record opt-out | Record opt-out | Voice consent workflow | ✗ | ✗ | Read evidence |
| Manage knowledge | ✓ | Review | Suggest | ✗ | ✓ | ✗ | ✗ | Read provenance |
| Billing/usage adjustments | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ + dual approval | ✗ | Read ledger |
| Export/delete data | Approved request | ✗ | ✗ | ✗ | Voice assets only | Financial export only | Approved API scope | Evidence export only |

Platform super-admin actions use time-bound, reason-bound break-glass access with MFA, approval where feasible, immutable audit and customer notification where required. “Support” must not mean unrestricted recording access.

### 4.3 Isolation layers

| Layer | Required control | Negative test |
|---|---|---|
| MySQL repositories | Explicit `companyId`, parent ownership, tenant-leading indexes, composite constraints where practical | Tenant B cannot read/update/delete Tenant A by ID, phone, contact email or guessed foreign key |
| Number/trunk routing | Verified provider account + active assignment interval; unknown mapping fails closed | Reused/released number cannot expose old tenant history |
| Object storage | Private buckets, tenant-prefixed keys, per-asset ACL, short-lived signed URLs, encryption | Cross-tenant URL reuse, expired URL and key-prefix traversal fail |
| Vector/knowledge | Mandatory tenant/source filters before retrieval and reranking; permission-aware citations | Prompt asking for another company's document returns no protected content |
| Cache/queue/realtime | Tenant/resource-scoped keys, jobs, rooms and subscriptions | Forged room/job/cache key cannot subscribe or mutate |
| Media workers | Tenant-bound session lease, authenticated internal commands, isolated scratch space | Worker cannot attach to another call; crash cleanup leaves no readable cross-tenant audio |
| Provider credentials | Encrypted secret references, least privilege, per-tenant/provider binding | Tenant B cannot use A's trunk/token or infer secret values |
| Logs/analytics | Redaction, tenant-scoped queries, no raw audio/transcripts in general logs | Log search/export cannot leak another tenant's content |
| Backups/exports | Encrypted, access-controlled, restore ACL verification | Restored Tenant A data remains inaccessible to B |

MySQL does not offer PostgreSQL-style RLS; do not claim RLS protection. Use repository guards, constraints/grants and tests, or propose separate schemas/databases if stronger isolation is required. Nullable legacy ownership must be reconciled or quarantined, not defaulted to an arbitrary company.

## 5. Recording, monitoring and transcript privacy

Recording is **default off** per tenant and use case. Processing live audio for ASR is itself personal-data processing even when no recording is stored; notices and lawful basis must cover both.

Before recording/monitoring starts:

- Determine applicable consent/notice rules for caller, agent, supervisor and any third party.
- Play/display the approved disclosure in the selected language; record disclosure version, time and consent outcome where required.
- If consent is refused, follow the approved no-recording or human route; do not silently continue recording.
- Bind recording permission to the call/leg and re-check on transfer/conference when participants or jurisdiction change.
- Keep original legs and mixed playback distinct where lawful; label speakers from call legs rather than guessing identity.

Data lifecycle:

```text
capture -> consent check -> encrypt/upload -> checksum/verify -> transcribe
        -> review/correct -> permitted use -> retention expiry/legal hold
        -> deletion/revocation propagation -> deletion evidence
```

- Encrypt in transit and at rest; use tenant-bound key references and rotate keys.
- Store checksums, duration, codec, consent reference, access policy and lineage.
- Restrict playback/download separately from viewing metadata; watermark/export where appropriate.
- Redact secrets/payment data from transcripts and logs; never request full card/PIN/OTP data through the AI.
- Keep transcript corrections versioned; AI summaries cite transcript spans and tool receipts.
- Sentiment/emotion labels are uncertain, evidence-backed indicators—not diagnoses, truthfulness judgments or definitive claims about people.
- Retention periods are configuration plus counsel-approved policy, not hard-coded guesses. Provide deletion jobs, backup expiry handling and legal-hold exceptions with audit.

## 6. Voice rights, cloning and AI disclosure

Cloning remains disabled until both model commercial rights and voice-owner rights are verified.

Required workflow:

1. Identify the voice owner and authority; use a live consent phrase/verification proportionate to risk.
2. Capture purpose, languages, commercial scope, territories, duration, training vs synthesis permission, public examples and sublicensing.
3. Store consent version, evidence, expiry, revocation channel and reviewer; encrypt reference audio and derived embeddings/models.
4. Restrict use to the owning tenant and approved agents; audit every generation/deployment.
5. On revocation, block new generation, revoke deployments, handle caches/derived artifacts and document deletion/legal holds.
6. Provide abuse/complaint handling and impersonation checks. A consent checkbox or watermark alone is insufficient.

Synthetic preset voices must not deceptively target a real person. Disclose AI speech according to the approved policy and applicable law. Never clone a public figure, customer or employee merely because audio is available. Model terms that prohibit commercial use are not overridden by speaker consent.

## 7. Outbound calling, SMS and messaging safeguards

Outbound campaigns require an approved lawful basis, purpose, jurisdiction, carrier authority and recipient controls.

- Maintain tenant suppression lists and integrate the applicable current national/operator registry process through an authorized provider. BTRC's published DND page concerns promotional SMS; do not assume it fully defines voice DNC obligations. [1](http://old.btrc.gov.bd/do-not-disturb-dnd).
- Re-check consent/suppression at scheduling and immediately before origination. Fail closed if a required registry check is unavailable.
- Enforce recipient timezone, approved hours, holidays, frequency/attempt caps and campaign budget. Do not hard-code foreign hours or exemptions.
- Use entitled caller identity; reject spoofed CLI.
- Disclose AI identity and recording where required; offer a human path and opt-out.
- Record opt-out and confirm the durable write before telling the recipient it succeeded.
- Never retry a refusal/suppression match. Retry only approved no-answer/busy outcomes within limits.
- Log lawful basis, suppression evidence, schedule decision, attempt, provider receipt, outcome, cost and complaints.
- Provide an emergency stop at campaign/tenant/provider scope.

WhatsApp requires official API access, opt-in, approved templates where required, window rules, human escalation and current pricing verification. SMS requires an authorized A2P route, sender-ID approval and current BTRC rules. Email requires consent/suppression, authenticated sending and bounce handling. No channel may borrow another tenant's credentials or default company.

## 8. AI behavior and privileged-tool safety

- Ground business answers in tenant-approved knowledge with source/version citations.
- Treat caller speech, documents, CRM notes and retrieved content as untrusted; they cannot override system policy or grant tools.
- Use typed, allowlisted tools with server-derived tenant/actor, schema validation, rate limits and explicit scopes.
- Separate read, draft, execute and approve permissions. Sensitive account changes, financial actions, policy exceptions and irreversible operations require human approval.
- Confirm tool receipts before claiming success. Timeout/unknown state is not success.
- On low confidence, repeated misunderstanding, distress, safety/legal issues or customer request, clarify or hand off to an authorized human.
- Do not invent prices, availability, identity, legal advice, completed bookings, transfers or payments.
- Record prompt/model/knowledge versions and evidence spans without exposing secrets.
- Test prompt injection, cross-tenant retrieval, tool forgery, hallucinated actions and unsafe outbound content before release.

## 9. Telephony and infrastructure security

### 9.1 SIP/media

- Prefer SIP/TLS and SRTP where the carrier supports them; validate certificates and negotiated codecs.
- Restrict carrier IPs/ports, disable unused SIP methods/transports, and never expose ARI/Event Socket/ databases publicly.
- Use strong per-endpoint credentials, registration limits, failed-auth throttling and credential rotation.
- Deploy WSS/DTLS-SRTP for browser media; use coturn with ephemeral credentials and bandwidth limits where needed.
- Keep raw RTP external media on an isolated trusted network or use a tested protected transport. ARI TLS does not encrypt RTP.
- Enforce destination allowlists, country/premium-route controls, concurrent-call/spend caps, fraud alerts and loop limits.
- Validate RTP source/sequence/timestamps and bound jitter/media queues.
- Emergency calling is not assumed; document carrier limitations and approved escalation procedures.

### 9.2 Application and browser

- HTTPS/HSTS, secure cookies, CSRF protection for browser mutations, strict origin checks and least-privilege CORS.
- Replace broad `unsafe-inline` CSP with a tested nonce/hash strategy where feasible; keep a documented compatibility plan.
- Change `Permissions-Policy` to allow microphone only on the authenticated calling surface, not globally enable camera/geolocation.
- Validate uploads, audio size/duration, MIME sniffing and malware where relevant; isolate FFmpeg/transcoding workers.
- Prevent SSRF in webhook, media URL, IMAP/SMTP and knowledge ingestion paths; enforce egress allowlists and block internal metadata endpoints.
- Pin dependencies/images/actions, generate SBOMs, review licenses/advisories and verify artifact hashes. Do not auto-pull unreviewed models.

### 9.3 Secrets and service identity

- Encrypt provider secrets and voice/reference assets; use a managed secret store/KMS where available.
- Separate app, worker, PBX, media, storage and backup identities; short-lived internal credentials where feasible.
- Never place carrier tokens, ARI passwords or model credentials in browser bundles, prompts, logs or Git.
- Rotate on compromise/offboarding and test revocation. Break-glass access is time-bound and audited.

## 10. Audit, monitoring and incident response

### 10.1 Durable audit events

Record actor, tenant, role/scope, action, resource, before/after version where appropriate, reason, approval, provider request ID, source IP/device class, timestamp and result for:

- Login/MFA/role/key changes; provider/number/trunk changes.
- Call commands, transfers, monitoring, recording start/stop and playback/export.
- Consent creation/withdrawal, voice deployment/revocation, retention/legal hold.
- Agent/routing publication, campaign approval/stop, suppression changes.
- Knowledge ingestion/deletion, billing adjustments, privileged access and restore.

Use a transactional outbox or equivalent so a privileged mutation cannot silently lose its audit event. Protect audit integrity and define retention/access separately from application logs.

### 10.2 Operational metrics and alerts

Monitor registration/trunk health, call setup/answer/failure rates, RTP loss/jitter, media queue depth, ASR/TTS latency/errors, barge-in stop time, handoff success, webhook lag/replay, worker leases, storage growth, provider spend anomalies and backup age/restore evidence.

Do not put raw transcripts, audio, full phone numbers or secrets in metrics labels. Use tenant-scoped dashboards and redacted diagnostics. Alert on cross-tenant access attempts, unusual exports, toll fraud, consent bypass, repeated recording failures and provider reconciliation gaps.

### 10.3 Incident playbook

1. Detect/triage and assign incident commander.
2. Contain: suspend affected tenant/provider/campaign, revoke credentials, stop recording/export or isolate worker as appropriate.
3. Preserve evidence and audit chain without copying data into unapproved tools.
4. Assess affected tenants/data subjects and legal notification duties with counsel.
5. Recover from verified backups/known-good artifacts; validate tenant ACLs and provider state.
6. Reconcile calls/usage and customer-facing outcomes.
7. Communicate accurately; do not claim containment, deletion or restoration before evidence.
8. Post-incident review, corrective actions and re-test gates.

## 11. Backup, recovery and data portability

Existing backup scripts are syntax-valid but not proven recoverable; restore intentionally refuses automated production restore. Before production:

- Take a consistent DB backup plus object storage, configuration/secret references, model manifests and provider mapping inventory.
- Encrypt backups and protect keys separately; verify checksums and offsite/region policy.
- Restore into an isolated environment with owner approval; compare schema/counts/ownership, replay selected recordings/transcripts, verify ACLs and re-run tenant A/B tests.
- Document RPO/RTO targets and measured results. Never claim a recovery time from script existence.
- Test key loss/rotation, partial restore, provider credential revocation and carrier reroute.
- Application rollback must not automatically roll back or delete customer data. Destructive rollback scripts require separate approval and are not part of normal deployment.

Data-subject export/correction/deletion must propagate across CRM, calls, recordings, transcripts, vectors, caches, backups and processors according to the approved policy. Keep deletion evidence without retaining unnecessary personal content.

## 12. Bangladesh counsel/regulator checklist

Owner must obtain a written, use-case-specific answer before regulated launch:

1. Which entity provides the service: software vendor, hosted call center, IPTSP, reseller or another licensed category?
2. Is ALO Labs' proposed multi-tenant cloud AI call-center model permitted under that entity's current authority?
3. Which BTRC licence/registration, security deposit, inspection, reporting and renewal duties apply?
4. What domestic/international routing, remote-agent, cloud-hosting and data-location restrictions apply?
5. What numbering, CLI, porting, emergency-service and lawful-interception obligations apply?
6. What are the current PDPA commencement dates, exemptions, fiduciary/processor roles, DPO/audit duties and breach timelines?
7. How do the National Data Management Act and current rules classify this data, including voiceprints and cross-border inference/storage?
8. What notice/consent is required for live ASR, stored recordings, supervisor monitoring, transcript analytics and model training?
9. What are the current voice/SMS DNC/NDNC rules, permitted hours, frequency limits, transactional exceptions and complaint processes?
10. Are AI outbound calls, synthetic voices and automated disclosures specifically regulated or restricted?
11. What voice-owner consent, commercial-use and revocation evidence is sufficient, including employee voices?
12. What retention periods, legal holds, deletion duties and law-enforcement request procedures apply?
13. Which current Cyber Security Act provisions/amendments affect incident reporting, evidence, audits and provider obligations?
14. What consumer-protection, sector-specific rules apply to banking, health, insurance, debt collection or other sensitive use cases?
15. Which provider contracts/DPAs, subprocessors and transfer mechanisms are acceptable?

Store the counsel memo, regulator/carrier confirmations, policy versions, approvals and review date in a restricted compliance register. Re-review on law/rule changes, new countries, new use cases, new processors or model/voice changes.

## 13. Release gates and current status

| Gate | Required evidence | Current status |
|---|---|---|
| G0 — Phase 0 | Source audit, architecture, provider/license review, speech protocol, legal checklist, roadmap | These six documents; no runtime/legal certification |
| G1 — Foundation | Green baseline CI, additive migration plan, tenant A/B suite, auth/secret/realtime fixes, backup baseline | NOT STARTED |
| G2 — Internal telephony | Isolated SIP lab, secure browser media, event reconciliation, no PSTN | NOT STARTED |
| G3 — Speech | Artifact rights, native bn-BD evaluation, measured latency, consent/provenance controls | NOT STARTED |
| G4 — Authorized calling | Counsel/carrier approval, real test calls, recording/outbound safeguards, human handoff | NOT STARTED |
| G5 — Intelligence/CRM | Tenant-safe transcripts, grounded answers, correction/audit, permissioned retrieval | NOT STARTED |
| G6 — Billing/API | Immutable usage, exact money, provider reconciliation, signed webhooks, idempotency | NOT STARTED |
| G7 — Production pilot | Load/soak/fault tests, restore drill, monitoring/on-call, privacy/security review, owner approval | NOT STARTED |

**No feature is legally or operationally approved for production by this document.** The next authorized step is owner review of Phase 0 and an explicit decision whether to begin Phase 1 under the roadmap's preservation and approval boundaries.
