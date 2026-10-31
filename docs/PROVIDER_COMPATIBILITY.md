# Provider Compatibility, Licensing and Replacement Boundaries

**Status:** Phase 0 evaluation — no provider account, subscription, trunk, number, or paid API activated
**Date:** 2026-10-31
**Related:** [audit](VOICE_CONTACT_CENTER_AUDIT.md) · [architecture](TELEPHONY_ARCHITECTURE.md) · [speech evaluation](BANGLA_VOICE_MODEL_EVALUATION.md) · [compliance](SECURITY_AND_COMPLIANCE.md)

## 1. Compatibility policy

ALO Labs owns the product contracts, tenant model, call state, consent, usage ledger and customer history. Providers supply replaceable transport/inference capabilities. A provider SDK, model name, or marketing page must never become the product's source of truth.

Every adapter must declare:

- Environment (`sandbox`, `staging`, `production`) and provider account/region.
- Authentication method and secret reference; never browser-exposed credentials.
- Supported countries, number types, lawful-use restrictions and entitlement documents.
- Capabilities, codecs, media transports, limits and webhook semantics.
- Idempotency, retry, reconciliation, rate-limit and outage behavior.
- Data locations, retention, subprocessors, recording support and deletion/export APIs.
- Actual contract rates, billing units, currency/tax/FX treatment and invoice evidence.
- Version/commit/digest, license review, test evidence and owner approval.

Unknown capability means **unavailable**, not assumed support. No provider rates or margins are invented in this document.

## 2. Telephony software comparison

Research used upstream GitHub source/license metadata and official documentation. The revisions below were observed on the audit date; they are research references, not installed versions.

| Component | Reviewed reference | License finding | Compatibility role |
|---|---|---|---|
| Asterisk | Branch `22`, commit `b9c14b15109cb9e9051cf679ea98c9ed2d8ad66f`; latest GitHub release observed `certified-22.8-cert5` | LICENSE describes GPL version 2 plus alternative licensing and component exceptions; do not reduce the whole distribution to an unchecked SPDX label | Pilot PBX/ARI/media attachment; choose ordinary supported vs certified branch after operational review |
| FreeSWITCH | `master`, `f37a27f2f47ff965b90e4d4080ecbcf292c916b1`; release `v1.11.3` observed | Reviewed LICENSE identifies MPL-1.1 for core files and separate component terms; official marketing's broader “MPL” wording is not a substitute for file-level review | Alternative media/PBX engine; package access requires SignalWire account/PAT |
| Kamailio | `master`, `4c694a07e3e09398a05562734291862c90d15c5b`; release `6.1.5` observed | README: mainly GPLv2, some BSD components; COPYING includes module-linking notes | SIP edge/registrar/distributor, not the AI media engine |
| SIP.js | `onsip/SIP.js`, `main`, `922920b2657e05b50c74f985c69bd7b165d70e56`; release `0.21.2` observed | MIT | Browser SIP/WSS/WebRTC candidate; old release tag makes current-branch compatibility/security review important |
| rtpengine | `master`; release `mr26.3.1.1` observed | GPL-3.0 | Optional RTP/SRTP/ICE border/media proxy with Kamailio |
| coturn | `master`; Docker release `4.18.0-r0` observed | BSD-style license text; preserve notices and review exact release | TURN/STUN with ephemeral credentials and bandwidth controls |

Source links: [Asterisk LICENSE](https://github.com/asterisk/asterisk/blob/b9c14b15109cb9e9051cf679ea98c9ed2d8ad66f/LICENSE), [FreeSWITCH LICENSE](https://github.com/signalwire/freeswitch/blob/f37a27f2f47ff965b90e4d4080ecbcf292c916b1/LICENSE), [Kamailio](https://github.com/kamailio/kamailio), [SIP.js](https://github.com/onsip/SIP.js), [rtpengine](https://github.com/sipwise/rtpengine), [coturn](https://github.com/coturn/coturn).

FreeSWITCH's official guide says prebuilt package access uses a SignalWire PAT, while a source build does not require that token. This is a packaging dependency, not a per-minute AI fee; account creation still needs owner approval. [2](https://developer.signalwire.com/freeswitch/foundations/getting-started/).

### 2.1 Capability compatibility to test

| Capability | Asterisk pilot approach | FreeSWITCH alternative | Hosted-provider adapter |
|---|---|---|---|
| SIP registration/trunk | `chan_pjsip`, TLS/WSS policy | SIP profiles | Provider SIP or proprietary API; verify country support |
| Call control | ARI + limited dialplan | Event Socket + dialplan | REST/webhooks; map provider states |
| Hold/transfer | Bridge/redirect/transfer operations | Bridge/transfer applications | Capability-specific; attended transfer may differ |
| Queue/IVR | Queue/dialplan/Stasis orchestration | Queue/IVR/applications | May be provider-hosted or require local PBX |
| Conference/parking | Bridges/parking applications | Conference/parking applications | Often limited or differently modeled |
| Recording | Consent-aware bridge/leg recording | Recording applications | Provider recording/export APIs and retention |
| AI media | ARI `externalMedia`; validate RTP/AudioSocket/WebSocket on pinned release | Core/community streaming module must be separately reviewed | Provider media-stream API; no universal protocol |
| Browser calling | SIP.js → WSS/DTLS-SRTP → PBX | SIP.js → WSS/DTLS-SRTP → PBX | May require provider WebRTC SDK instead |
| CDR/usage | CDR/CEL + provider reconciliation | CDR/events + reconciliation | Provider CDR/invoice APIs |
| Failover | Explicit carrier reroute/cluster design | Explicit cluster design | Provider routing/region features; test actual behavior |

Kamailio is intentionally absent from the PBX-feature columns: it complements, rather than replaces, those engines. No cell is a claim of completed integration.

## 3. Carrier and number-provider evaluation

### 3.1 Candidate classes

| Option | Potential value | Bangladesh/operational constraints | Decision |
|---|---|---|---|
| Authorized local IPTSP / licensed operator SIP service | Local numbering/interconnect knowledge, domestic support, potentially clearer local authority | Verify current license scope, numbering allocation, SIP handoff, recording/CLI rules, SLA, concurrency, lawful interception obligations and actual contract | **Preferred first commercial discussion** |
| BTRC-registered hosted call-center/service-provider partner | May provide approved connectivity and hosted infrastructure | Registration is not automatically a carrier license; verify domestic/international separation, remote-agent rules, cloud/AI data path and current conditions | **Viable partner route after legal/technical diligence** |
| Twilio Elastic SIP / Programmable Voice | Mature APIs and international tooling | Its Bangladesh SIP pricing page says it does not have voice-enabled local numbers in that locale; a destination price or international number is not proof of lawful Bangladesh origination/CLI or local number availability | **Optional international/BYOC adapter; Bangladesh authority must be confirmed** [2](https://www.twilio.com/en-us/sip-trunking/pricing/bd), [3](https://www.twilio.com/en-us/voice/pricing/bd) |
| Telnyx numbers/SIP | Carrier APIs, SIP trunking and regulatory requirement tooling | Marketing lists Bangladesh numbers, but actual inventory, number type, documents, inbound/outbound capability, CLI and local authorization need confirmation. A successful order may still await document verification | **Optional candidate; no purchase before written confirmation** [1](https://telnyx.com/phone-numbers/bangladesh), [2](https://support.telnyx.com/en/articles/5469551-international-numbers-required-documents), [3](https://developers.telnyx.com/docs/numbers/phone-numbers/regulatory-requirements/index) |
| Other international SIP/CPaaS vendors | Redundancy and geographic coverage | Same country-specific checks; foreign permission does not transfer to Bangladesh; grey-route termination is unacceptable | **Only after equivalent diligence** |
| Direct self-hosted PBX without carrier | Internal extensions/lab and product development | Cannot originate/terminate ordinary PSTN calls by itself | **Approved technical lab direction, not a PSTN substitute** |

BTRC's current LIMS lists BPO/call-center registration guidance, and its older forms distinguish call-center categories. Those sources establish a regulatory process, not that ALO Labs or any named vendor is authorized today. [1](https://lims.btrc.gov.bd/guidelines), [2](https://lims.btrc.gov.bd/uploads/userManual/BPO%20CALL%20%20All.pdf). The older IPTSP guideline requires licensed international routing through ICX/IGW paths; current counsel/carrier confirmation is required before relying on it. [1](https://lims.btrc.gov.bd/uploads/service_guideline/IPTSP%20Guideline.pdf).

### 3.2 Carrier questionnaire — answers required before selection

1. Exact licensed entity, license/registration number, scope, expiry and regulator contact.
2. Authority for the proposed domestic/international, inbound/outbound, hosted/multi-tenant AI service.
3. Number ownership, allocation/porting process, identity/address documents, acceptable use and CLI authorization.
4. Whether Bangladesh local numbers are actually available now, their type, and whether inbound/outbound/SMS are supported separately.
5. SIP handoff: registration vs IP peering, TLS/SRTP, codecs, DTMF, NAT, regions, IP allowlists, failover and packet captures.
6. Feature behavior: attended/blind transfer, conference, parking, queue events, recording, media streaming, voicemail, early media and disconnect causes.
7. CDR granularity, answer supervision, rounding increments, failed-attempt charges, number rental, taxes and invoice reconciliation.
8. Concurrent-channel and rate limits, overage behavior, fraud controls, emergency-call limitations and support escalation.
9. Recording/AI processing permissions, data location, retention, subprocessors, deletion/export and law-enforcement request process.
10. Outbound consent/DNC obligations, permitted hours, opt-out handling, campaign approval and complaint thresholds.
11. Sandbox/test-number availability and written permission for automated test calls.
12. Port-out/exit process, credential rotation, outage credits and termination assistance.

No vendor is selected until the owner receives answers, a commercial quote, legal review, and a successful authorized staging test.

### 3.3 Number lifecycle and portability

Proposed lifecycle:

```text
requested -> entitlement_review -> approved_for_order -> provider_pending
          -> documents_required -> assigned -> verified -> active
active -> suspended / port_out_pending / release_pending -> released
```

Store the provider's real number identifier and assignment evidence. Do not generate example numbers that look operational. Number assignment has effective intervals so historical calls remain attributable after a number moves or is released. Caller ID must be verified/entitled; emergency calling is a separate carrier capability and is not assumed.

## 4. Speech and AI provider compatibility

Detailed model rights and benchmarks are in [BANGLA_VOICE_MODEL_EVALUATION.md](BANGLA_VOICE_MODEL_EVALUATION.md). Summary:

| Provider/engine | Local option | Current compatibility finding | Release condition |
|---|---|---|---|
| Indic Parler-TTS | Yes | Bengali candidate; model card Apache-2.0; prompt-guided voices | Exact artifact/voice rights, native bn-BD review, latency/capacity |
| Rasa VITS | Yes | Bengali candidate; pinned card CC-BY-4.0 | Attribution/data/speaker rights and native review |
| Piper | Yes | GPL-3.0 engine; no Bangla voice in reviewed official list | Authorized Bangla voice artifact and license/maintenance review |
| Kokoro | Yes | English/Hindi comparator; not verified Bangla/Arabic | Language-specific review; no Bangla claim |
| XTTS-v2 / MMS Bengali | Technically local | Restrictive model terms; XTTS not a verified Bangla baseline | Excluded from commercial baseline unless separate rights obtained |
| IndicF5 | Yes | Bengali reference-audio candidate; provenance/license question open | Written upstream clarification and consent workflow |
| Whisper/faster-whisper | Yes | Multilingual ASR baseline; streaming requires policy | bn-BD WER/CER/code-switch and latency measurements |
| IndicConformer | Yes | Bengali/Indic ASR candidate | Exact model license, streaming behavior and bn-BD evaluation |
| Existing Ollama-compatible router | Yes | Configuration exists; no model/inference verified here | Approved local model, company policy, task evaluation and hardware |
| Hosted speech/LLM APIs | External | Replaceable adapters only; no mandatory paid API | Explicit tenant opt-in, DPA/residency, budget, failure/fallback tests |

The adapter contract should separate `synthesize`, `transcribeBatch`, `transcribeStream`, `detectSpeech`, `diarize`, `designVoice`, and `createConsentedVoice`. Each returns real job/session state, supported controls, measured usage and provenance. Unsupported controls are omitted/disabled, not ignored while shown as active.

## 5. Existing infrastructure and license review

SOURCE: repository manifests/compose and upstream license files.

| Component | Existing use | Finding / action |
|---|---|---|
| MySQL/MariaDB | Authoritative production policy; separate compose variants | Preserve existing data; verify actual engine/version and migration state. Do not assume PostgreSQL compatibility from `pg` |
| Redis | Cache/realtime/rate-limit support | Compose uses mutable `redis:7-alpine`. Redis licensing changed across versions; current upstream is not a blanket BSD statement. Pin exact release and review terms, or evaluate an approved alternative separately |
| Qdrant | Vector retrieval configuration | Upstream Apache-2.0; pin a supported image and test tenant filters/deletion. Compose includes both old pinned and `latest` references |
| MinIO | S3-compatible object storage configuration | Upstream AGPL-3.0; review distribution/service obligations and pinned 2024 image maintenance. S3 client does not require MinIO specifically |
| Ollama | Local LLM configuration | Upstream MIT; model weights have separate licenses. No model pulled in Phase 0 |
| n8n | Optional inference-compose service | Upstream sustainable-use/enterprise terms are not a simple permissive open-source license. Keep optional and outside core calling until owner/legal review |
| Socket.IO / ioredis | Realtime/cache clients | Existing code is not a tenant-safe call-event transport; review licenses and upgrade/security posture |
| `z-ai-web-dev-sdk` and hosted providers | Existing optional integrations | Keep explicit opt-in and company authorization; no paid activation from this audit |
| FFmpeg (proposed) | Audio conversion/export | Not installed here; exact build determines LGPL/GPL components and codec rights. Pin and review before use |

The npm lock contains 878 package entries with license metadata, mostly MIT/Apache/BSD/ISC/MPL, plus LGPL-family Sharp/libvips entries and one entry lacking a license field (`xmlhttprequest-ssl`). This is a metadata inventory, **not legal clearance or a vulnerability scan**. Generate an SBOM and review transitive notices, copyleft obligations, native binaries, model artifacts and container images in Phase 1/3. The repository root has no LICENSE file; confirm ALO Labs ownership/contributor rights and the intended product license rather than assuming the entire repository is open source.

## 6. Omnichannel provider boundaries

### 6.1 WhatsApp Business Platform

Reuse the existing client/inbox ideas, but harden number→tenant mapping, credential encryption, webhook replay/deduplication, template state and delivery reconciliation. Use official Meta Cloud API or an official solution partner; do not automate the consumer app or scrape WhatsApp Web.

Meta's official pricing documentation states that from 2026-10-01 service messages are charged per message, with separate treatment for Meta Business Agent messages. Therefore the product must not assume all replies inside a service window are free. Verify the current Bangladesh rate card, free-tier eligibility, currency and webhook fields against the actual WABA before costing. [2](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages). The current client defaults to Graph API `v21.0`; supported-version status must be checked before live use.

Requirements: business verification/permissions, approved templates where required, opt-in and opt-out, customer-service-window rules, AI disclosure/approval policy, human escalation, and no cross-tenant token fallback.

### 6.2 SMS

The current SMS route is persistence/notification code, not a carrier integration. Add an adapter for a BTRC-authorized A2P aggregator after verifying current enlistment and route rules. BTRC publishes A2P SMS aggregator enlistment material; older third-party guides are not sufficient authority. [2](http://old.btrc.gov.bd/directives).

Confirm sender-ID/masking approval, Bangla content requirements, Unicode segmentation, promotional restrictions, DND handling, delivery receipts, two-way capability, throughput, retries and actual rates. Do not assume a foreign number or generic SMS API can deliver compliant Bangladesh A2P traffic. Never use a placeholder sender as production inventory.

### 6.3 Email

Custom SMTP/IMAP code exists. Before production, test STARTTLS/certificate verification, authentication, MIME/attachment parsing, threading, bounce handling, size limits and SSRF/egress controls. An authorized SMTP/IMAP provider or owned mail server is still external to local inference. Add SPF/DKIM/DMARC alignment, suppression and consent handling. Keep email credentials tenant-scoped.

### 6.4 Web chat and optional social channels

Web chat can use the hardened application realtime layer and persistent customer threads. Optional social connectors must use official APIs, verified webhooks, least-privilege scopes and documented retention. They are not prerequisites for the telephone pilot.

## 7. Billing, payment and cost compatibility

Existing subscription/invoice/payment models and manual-payment concepts can be retained. No payment gateway was verified or activated.

Billing dimensions to support after metering is proven:

- Subscription and active number rental.
- Answered PSTN/SIP minutes and provider-specific rounding.
- AI media minutes, TTS characters/audio duration, ASR audio duration.
- Storage, users, premium integrations and approved cloning operations.

Keep **usage**, **provider cost**, **sell price**, **tax**, **credit**, and **payment** separate. Store exact minor units/decimals and currency; record FX source/time for cross-currency invoices. Do not calculate margin from guessed rates. Reconcile provider CDR/invoices to internal events and expose discrepancies. Manual adjustments require reason, actor, approval and immutable lineage.

A payment adapter must verify signatures, idempotency, settlement state, refunds/chargebacks and currency support. A UI invoice or pending payment row is not proof of collected money.

## 8. Owner-supplied external project intake

The owner supplied a large list of repositories, tools, websites, and promotional links. They are recorded in [EXTERNAL_PROJECT_INTAKE.md](EXTERNAL_PROJECT_INTAKE.md). No repository was cloned, forked, installed, or merged, and no service was activated.

Compatibility findings that affect provider/architecture decisions:

- **Dify / Hypit:** modified Apache terms include multi-tenant/third-party service restrictions. Do not embed in ALO Labs SaaS without written commercial authorization.
- **Rescript:** PolyForm Noncommercial; exclude from commercial product integration.
- **Voicebox / VoiceStudio:** relevant voice-studio candidates, but code license does not clear model weights or voice rights. VoiceStudio is AGPL; both require bn-BD evaluation and consent/revocation controls.
- **OpenSMS:** Android-SIM SMS gateway, not a BTRC-authorized A2P carrier route. Lab/reference only unless counsel/carrier review approves a narrow use.
- **wacrm:** MIT WhatsApp CRM reference, but Supabase/Postgres-oriented; do not merge into the MySQL production core without architecture approval.
- **Postiz / Mailcheap / openGym / VoiceStudio:** AGPL family requires network-copyleft review before SaaS embedding.
- **cursor/plugins:** no license detected; hold until terms are confirmed.
- **Ghidra / REA / Scrapling / CLI-Anything / container / WiFi-cracker:** security-sensitive or unrelated; not contact-center runtime dependencies. WiFi-cracker is rejected for product integration.

Any future integration must pass the same license, tenant-isolation, consent, security, and adapter-conformance gates as first-party providers.

## 9. Adapter conformance and exit strategy

Every production adapter must pass the same contract suite:

- Authentication failure, expired credential, revoked tenant and wrong-region account.
- Capability discovery and unsupported-operation behavior.
- Idempotent command replay and ambiguous timeout reconciliation.
- Webhook signature, raw-body preservation, timestamp/replay window and event deduplication.
- Out-of-order/duplicate events, provider outage, rate limit and partial failure.
- CDR/usage reconciliation and exact billing-unit tests.
- Tenant A/B isolation for numbers, calls, recordings, transcripts and credentials.
- Data export/deletion and credential rotation.
- Version upgrade and rollback against recorded fixtures.

Exit strategy: export normalized numbers/assignments where legally portable, calls/CDRs, recordings/transcripts, contacts/consents, campaigns, usage and audit records; revoke provider credentials; follow carrier port-out/release rules; verify restored data in a replacement adapter. Do not promise number portability where the country/provider does not support it.

**Current compatibility status:** source and documentation reviewed; no carrier, speech model, messaging provider, payment gateway, or production infrastructure integration certified. Owner approval and staged tests remain mandatory.
