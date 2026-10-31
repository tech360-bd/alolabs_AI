# External Project Intake and Integration Catalog

- **Status:** Phase 0 intake / triage only
- **Date:** 2026-10-31
- **Scope:** Every project, repository, website, tool, and promotional link supplied in the owner's “add all from below” message
- **Authorization boundary:** No repository was cloned, forked, installed, executed, or merged. No account, subscription, model download, carrier, payment, or deployment was activated. This catalog does not approve Phase 1 or production use.
- **Related:** [audit](VOICE_CONTACT_CENTER_AUDIT.md) · [telephony](TELEPHONY_ARCHITECTURE.md) · [Bangla speech](BANGLA_VOICE_MODEL_EVALUATION.md) · [providers](PROVIDER_COMPATIBILITY.md) · [security](SECURITY_AND_COMPLIANCE.md) · [roadmap](IMPLEMENTATION_ROADMAP.md)

## 1. How to read this catalog

The owner asked to “add all” listed items. Because Phase 0 is still the authorized boundary and many items are unrelated, truncated, promotional, or legally restrictive, “add” is implemented here as a **complete intake register**: every item is recorded, deduplicated, resolved where possible, classified, and assigned a next gate. This is not a decision to embed all projects into AgentOS.

Evidence labels:

- **GH-META:** GitHub repository metadata/license/README inspected through the GitHub API.
- **GH-LICENSE:** License file text inspected; GitHub SPDX detection may differ from the actual text.
- **SUPPLIED:** URL/name supplied by the owner; not independently code-reviewed or authenticated.
- **RESOLVED:** A truncated GitHub URL was matched to a likely canonical repository through GitHub search; owner should confirm.
- **UNRESOLVED:** Shortened, truncated, private, or non-canonical link; canonical URL needed.
- **PROPOSED:** Recommended disposition, not implemented.

Disposition categories:

- **A — Core candidate:** Directly relevant to voice/contact-center/CRM; evaluate in a later approved phase.
- **B — Adjacent optional:** Useful for media, marketing, knowledge, or operations, but not required for the telephone pilot.
- **C — Developer tooling:** May improve internal engineering/agent workflows; not a production runtime dependency by default.
- **D — Out of scope / reject:** Unrelated to the contact-center mission, offensive/dual-use without a clear authorized need, or incompatible with commercial multi-tenant SaaS.
- **E — Unresolved / reference only:** Cannot be evaluated safely or usefully without a canonical URL, account, or owner clarification.

License compatibility is a legal question, not a badge check. AGPL/GPL, modified Apache, PolyForm Noncommercial, and CC-BY-SA terms can block embedding in a proprietary multi-tenant service. Model weights, voice rights, and generated-output rights are separate from code licenses.

## 2. Summary

| Group | Count | Notes |
|---|---:|---|
| Unique GitHub repositories resolved/inspected | 43 | Includes resolved truncated URLs; duplicates removed |
| External websites / services / required software | 28 | Supplied or partially resolved; no account activation |
| Social / shortened / promotional references | 16 | Many truncated; canonical URLs required before evaluation |
| Hard rejects for commercial/offensive reasons | 2 | WiFi password cracker; noncommercial transcript editor for commercial SaaS |
| Core voice/CRM candidates requiring early review | 5 | OpenSMS, Voicebox, VoiceStudio, wacrm, Dify |
| Critical license holds | 4 | Dify, Hypit, Rescript, cursor/plugins; plus AGPL family review |

No item is production-approved. The most important immediate findings are:

1. **Dify and Hypit use modified Apache terms with multi-tenant restrictions.** They are not safe to embed in ALO Labs' multi-tenant SaaS without written commercial authorization.
2. **Rescript is PolyForm Noncommercial.** Exclude from commercial product integration.
3. **Voicebox / VoiceStudio are relevant voice-studio candidates, but code license does not clear model weights or voice cloning rights.** VoiceStudio is AGPL; Voicebox is MIT code with separate model/voice review required.
4. **OpenSMS turns an Android SIM into an SMS API.** It is not a BTRC-authorized A2P carrier route and must not be represented as compliant commercial SMS infrastructure.
5. **wacrm is MIT but Supabase/Postgres-oriented.** It conflicts with the current MySQL/MariaDB production policy if merged naively; use as a reference or isolated adapter candidate only after approval.
6. **Postiz, Mailcheap, VoiceStudio, and openGym are AGPL.** Network copyleft obligations require counsel review before SaaS embedding.
7. **Ghidra, REA, WiFi-cracker, Scrapling, CLI-Anything, and container tooling are dual-use/security-sensitive.** They are not contact-center runtime features; any internal use needs authorization, sandboxing, and legal review.
8. **Most social/shortened links are not evaluable artifacts.** They are preserved as references, not dependencies.

## 2.1 Skill import outcome (owner-directed follow-up)

After the initial catalog, the owner explicitly asked to add the skills to the own AI agent. The compatible **instruction-only SKILL.md documents** were imported and connected to the Command Agent. See [AGENT_SKILLS.md](AGENT_SKILLS.md).

| Outcome | Count | Meaning |
|---|---:|---|
| Imported skill documents | 470 | Pinned upstream Markdown with license/hash provenance |
| Advisory / agent-enabled | 298 | Eligible for bounded prompt guidance; no tool grants |
| Quarantined / review-only | 172 | Desktop control, reverse engineering, external memory/routing, or messaging plugins; never injected |
| Executable scripts/plugins imported | 0 | No installation, shell grant, MCP server, or dependency added |
| Database writes performed | 0 | Optional registry installer exists but was not run |

Imported skill sources: Matt Pocock skills, Diagram Design, SwiftUI Agent Skill, AI Design Skills, Android skills, Scientific Agent Skills, Karpathy Skills Extended, Presenter, HyperFrames, Claude official plugin skill documents, Delegate Router (quarantined), CLI-Anything (quarantined), REA (quarantined), and AI Memory (quarantined). Applications/SaaS/model projects in the rest of this register remain cataloged, not merged.

## 3. Core and adjacent GitHub candidates

| ID | Item / supplied link | Resolved repository | License / maintenance signal | Fit | Disposition and next gate |
|---|---|---|---|---|---|
| GH-01 | OpenSMS `daslearning-org/OpenSMS.git` | [daslearning-org/OpenSMS](https://github.com/daslearning-org/OpenSMS) | Apache-2.0; pushed 2026-10-28; GH-META/README | SMS gateway via Android SIM | **A/HOLD.** Evaluate only as a lab/internal gateway candidate. Not a licensed A2P carrier, not multi-tenant SaaS SMS infrastructure. Gate: BTRC/carrier review, device/SIM consent, security, rate limits. |
| GH-02 | Voicebox `jamiepine/voicebox` | [jamiepine/voicebox](https://github.com/jamiepine/voicebox) | MIT code; pushed 2026-10-07; GH-META/README | Local AI voice studio, cloning/dictation | **A.** High-priority speech-studio comparison. Gate: exact model weights/licenses, bn-BD evaluation, consent/revocation, hardware/latency. Do not assume “clone any voice” is lawful or Bengali-quality. |
| GH-03 | VoiceStudio `debpalash/VoiceStudio` | [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) | AGPL-3.0; pushed 2026-10-31; GH-META/README | Local voice cloning/design/dubbing/transcription | **A/HOLD.** Relevant studio candidate. Gate: AGPL network-copyleft review, model/voice rights, bn-BD native evaluation, isolation from core if embedded. README language claims are vendor claims, not verified. |
| GH-04 | wacrm / acrm `ArnasDon/wacrm` | [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm) | MIT; pushed 2026-10-30; GH-META/README | WhatsApp CRM template, shared inbox, pipelines | **A/HOLD.** Fork request recorded but **not executed**. Gate: architecture review (Supabase/Postgres vs MySQL), tenant hardening, Meta official API, credential isolation, branding/assets rights. Prefer reference/adapter over blind merge. |
| GH-05 | Dify `langgenius/dify` | [langgenius/dify](https://github.com/langgenius/dify) | Modified Apache-2.0; GitHub NOASSERTION; pushed 2026-10-31; GH-LICENSE | Agentic workflows/RAG platform | **A/HOLD — critical license.** License restricts unauthorized multi-tenant service and certain commercial uses. Do not embed in ALO Labs SaaS without written commercial authorization. Gate: counsel + upstream license. |
| GH-06 | Postiz `gitroomhq/postiz-app` | [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | AGPL-3.0; pushed 2026-10-31; GH-META/README | Social scheduling/automation | **B/HOLD.** Adjacent marketing ops. Gate: AGPL review, official social APIs, tenant isolation, no credential sharing. Not part of telephone pilot. |
| GH-07 | Mailcheap `marclou/mailcheap` | [marclou/mailcheap](https://github.com/marclou/mailcheap) | AGPL-3.0; pushed 2026-10-31; GH-META/README | Newsletter/email sending | **B/HOLD.** Adjacent email campaigns. Gate: AGPL review, consent/suppression, SPF/DKIM/DMARC, provider costs, tenant isolation. |
| GH-08 | OpenShorts `mutonby/openshorts` | [mutonby/openshorts](https://github.com/mutonby/openshorts) | MIT; pushed 2026-10-30; GH-META/README | AI short-video clipping/dubbing | **B.** Optional media studio. Gate: model rights, face/voice consent, copyright, FFmpeg licensing, storage/quotas. |
| GH-09 | Presenton `presenton/presenton` | [presenton/presenton](https://github.com/presenton/presenton) | Apache-2.0; pushed 2026-10-30; GH-META/README | AI presentation generator/API | **B.** Optional content/presentation workspace. Gate: model/output rights, tenant isolation, export security. |
| GH-10 | HyperFrames `heygen-com/hyperfr…` | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0; pushed 2026-10-31; RESOLVED/GH-META | HTML-to-video rendering for agents | **B.** Optional media rendering. Gate: render sandbox, asset rights, resource limits. Confirm resolved URL. |
| GH-11 | MoneyPrinterTurbo `harry0703/MoneyPri…` | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | MIT; pushed 2026-10-31; RESOLVED/GH-META | Automated short-video generation | **B/HOLD.** Content automation. Gate: copyright/voice/face rights, spam/quality controls, model licenses. Not a contact-center dependency. |
| GH-12 | Rescript `wassgha/rescript` | [wassgha/rescript](https://github.com/wassgha/rescript) | PolyForm Noncommercial 1.0; pushed 2026-10-29; GH-LICENSE | Transcript-based audio/video editor | **D — reject for commercial SaaS.** Noncommercial license is incompatible with paid product integration. May inspire original UX only; do not copy code/assets. |
| GH-13 | Kdenlive `KDE/kdenlive` | [KDE/kdenlive](https://github.com/KDE/kdenlive) | GPL-3.0; pushed 2026-10-31; GH-META | Desktop video editor | **B/D.** External desktop tool, not embeddable core. Use as optional user-side tool/reference only; GPL review if bundled. |
| GH-14 | OBS Studio `obsproject/obs-studio` | [obsproject/obs-studio](https://github.com/obsproject/obs-studio) | GPL-2.0; pushed 2026-10-29; GH-META | Streaming/recording desktop tool | **B/D.** External capture/streaming tool. Not a PBX or server media engine. GPL review if bundled; no core dependency. |
| GH-15 | Hypit / Hypeit `hypit-ai/hypit` | [hypit-ai/hypit](https://github.com/hypit-ai/hypit) | Modified Apache-2.0; NOASSERTION; pushed 2026-10-31; GH-LICENSE | Viral video workflow cloning | **B/HOLD — critical license.** Multi-tenant/third-party service restrictions require commercial authorization. Also face/voice/copyright consent gates. |
| GH-16 | Scrapling `D4Vinci/Scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause; pushed 2026-10-29; GH-META/README | Web scraping framework | **B/HOLD.** Optional permissioned knowledge ingestion only. Gate: robots/ToS, lawful basis, SSRF/egress controls, rate limits, no credential scraping. |
| GH-17 | OpenSEO `every-app/open-seo` | [every-app/open-seo](https://github.com/every-app/open-seo) | MIT; pushed 2026-10-31; GH-META/README | SEO/research tool | **B.** Marketing adjacent. Gate: data-provider terms, tenant isolation, no mandatory paid API. |
| GH-18 | Presenter `bisque-cloud/prese…` | [bisque-cloud/presenter](https://github.com/bisque-cloud/presenter) | MIT; pushed 2026-10-30; RESOLVED/GH-META | Narrated presentation skill | **B.** Optional content/narration. Gate: voice rights, local narration model review, export ACLs. |
| GH-19 | Gods Eye View `bilawalsidhu/gods-…` | [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) | LICENSE text MIT; GitHub NOASSERTION; pushed 2026-10-30; GH-LICENSE | 3D globe / spatial intelligence | **D/B.** Not contact-center core. Possible separate geospatial demo only after data/license review. Do not run supplied `npm ci/dev` in Phase 0. |
| GH-20 | CleanYourTV `Gathin23/cleanyourtv` | [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv) | LICENSE text MIT; GitHub NOASSERTION; pushed 2026-10-31; GH-LICENSE | Android TV debloat | **D.** Unrelated to voice/contact center. No product integration. |

## 4. Developer tooling, agent skills, and security-sensitive projects

These are not production contact-center runtime dependencies by default. Any internal use requires owner approval, least privilege, sandboxing, and review of prompts/plugins/models before execution.

| ID | Item | Resolved repository | License / signal | Fit | Disposition and next gate |
|---|---|---|---|---|---|
| GH-21 | REA `morluto/rea` | [morluto/rea](https://github.com/morluto/rea) | MIT; pushed 2026-10-31; GH-META | Reverse-engineering agents | **C/D.** Internal security research only with explicit authorization. Do not point at third-party software without rights. Not a product feature. |
| GH-22 | AnyPS5 `boykopovar/AnyPS5` | [boykopovar/AnyPS5](https://github.com/boykopovar/AnyPS5) | GPL-2.0; pushed 2026-10-31; GH-META | PS5 executable porting | **D.** Unrelated; console/DRM/legal risk. No integration. |
| GH-23 | Matt Pocock skills `mattpocock/skills` | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT; pushed 2026-10-30; GH-META | Engineering agent skills | **C.** Evaluate selected skills for internal dev workflow only. Review each skill before use; no automatic global install. |
| GH-24 | Diagram Design `cathrynlavery/diag…` | [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | MIT; pushed 2026-10-27; RESOLVED/GH-META | Diagram/design skills | **C.** Optional documentation/design aid. Review assets/licenses; not runtime. |
| GH-25 | Ghidra `NationalSecurityAg…` | [NationalSecurityAgency/ghidra](https://github.com/NationalSecurityAgency/ghidra) | Apache-2.0; pushed 2026-10-30; RESOLVED/GH-META | Software reverse engineering | **C/D.** Authorized internal security research only. Not contact-center runtime; no unauthorized target analysis. |
| GH-26 | Billion Context `ranxianglei/billio…` | [ranxianglei/billion-context](https://github.com/ranxianglei/billion-context) | LICENSE text MIT; GitHub NOASSERTION; pushed 2026-10-31; GH-LICENSE | Context compression plugin | **C/HOLD.** Dev-agent memory/context tool. Gate: verify license text, data leakage, prompt injection, no customer data in dev memory. |
| GH-27 | Text to CAD `earthtojake/text-t…` | [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad) | MIT; pushed 2026-10-31; RESOLVED/GH-META | AI CAD design | **D.** Unrelated to contact center. No integration. |
| GH-28 | SwiftUI Agent Skill `twostraws/SwiftUI-…` | [twostraws/SwiftUI-Agent-Skill](https://github.com/twostraws/SwiftUI-Agent-Skill) | MIT; pushed 2026-10-26; RESOLVED/GH-META | SwiftUI coding skill | **C/D.** Optional mobile-dev skill only; not runtime. |
| GH-29 | openGym `DuarteSantos8/openGym` | [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym) | AGPL-3.0; pushed 2026-10-31; GH-META | Gym/workout tracker | **D.** Unrelated; AGPL. No integration. |
| GH-30 | AI Design Skills `elayadesign/ai-des…` | [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills) | MIT; pushed 2026-10-30; RESOLVED/GH-META | Design agent skills | **C.** Optional internal design aid; review each skill/assets. |
| GH-31 | Claude Plugins Official `anthropics/claude-…` | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Apache-2.0 directory; pushed 2026-10-31; RESOLVED/GH-META | Official plugin directory | **C/HOLD.** Directory license does not clear every plugin. Review individual plugin licenses, permissions, network egress, and secrets before internal use. |
| GH-32 | Ruflo `ruvnet/ruflo` | [ruvnet/ruflo](https://github.com/ruvnet/ruflo) | MIT; pushed 2026-10-31; GH-META | Multi-agent coding harness | **C.** Internal dev orchestration candidate. Gate: sandbox, credential scope, no production data, cost controls. |
| GH-33 | Android Skills `android/skills` | [android/skills](https://github.com/android/skills) | Apache-2.0; pushed 2026-10-29; GH-META | Android agent skills | **C/D.** Optional mobile-dev aid; not contact-center runtime. |
| GH-34 | Scientific Agent Skills `K-Dense-AI/scienti…` | [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | MIT; pushed 2026-10-26; RESOLVED/GH-META | Research/science skills | **C.** Optional research aid. Gate: data rights, no customer data, verify skill claims. |
| GH-35 | OpenCode `anomalyco/opencode` | [anomalyco/opencode](https://github.com/anomalyco/opencode) | MIT; pushed 2026-10-31; GH-META | Open-source coding agent | **C.** Internal dev tool candidate. Gate: sandbox, repo permissions, secret handling, model/provider terms. |
| GH-36 | CLI-Anything `HKUDS/CLI-Anything` | [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) | Apache-2.0; pushed 2026-09-22; GH-META | Make desktop apps agent-native | **C/HOLD.** High-risk desktop control. Gate: explicit authorization, sandbox, allowlists, audit, no customer/production machines by default. |
| GH-37 | Cursor Plugins `cursor/plugins` | [cursor/plugins](https://github.com/cursor/plugins) | No license detected; pushed 2026-10-29; GH-META | Plugin specification/official plugins | **C/HOLD.** License unclear. Do not copy/embed until terms are confirmed; individual plugins need separate review. |
| GH-38 | AI Memory `akitaonrails/ai-me…` | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) | MIT; pushed 2026-10-30; RESOLVED/GH-META | Cross-agent coding memory | **C/HOLD.** Dev memory only. Gate: no customer data, encryption/access control, retention, prompt-injection review. Not a substitute for tenant-safe AgentOS memory. |
| GH-39 | Delegate Router `pvjbuilds/delegate…` | [pvjbuilds/delegate-router](https://github.com/pvjbuilds/delegate-router) | MIT; pushed 2026-10-27; RESOLVED/GH-META | Model/task routing skill | **C.** Internal dev routing aid. Gate: provider terms, cost controls, no production secrets. |
| GH-40 | This Thing Show `R8rly/show` | [R8rly/show](https://github.com/R8rly/show) | CC-BY-SA-4.0; pushed 2026-10-01; GH-META | Content rating standard | **D/B.** Content standard, not software runtime. ShareAlike may affect derivative content; no core integration. |
| GH-41 | Karpathy Skills Extended `anshuxinha/karpath…` | [anshuxinha/karpathy-skills-extended](https://github.com/anshuxinha/karpathy-skills-extended) | MIT; pushed 2026-10-24; RESOLVED/GH-META | Pre-coding clarification skill | **C.** Optional internal dev workflow aid; review before use. |
| GH-42 | Container `aerovato/container` | [aerovato/container](https://github.com/aerovato/container) | BSD-3-Clause; pushed 2026-10-23; GH-META | Persistent Linux agent workspaces | **C/HOLD.** Possible internal sandbox candidate. Gate: isolation escape review, resource limits, network egress, no production credentials. Not a telephony media worker by default. |
| GH-43 | WiFi Password Cracker Pro `YouBTech01/WiFi-Password-Cracker-Pro.git` | [YouBTech01/WiFi-Password-Cracker-Pro](https://github.com/YouBTech01/WiFi-Password-Cracker-Pro) | MIT; pushed 2025-02-09; GH-META | Offensive Wi-Fi tooling | **D — reject.** No contact-center purpose; unauthorized access risk. Do not clone/run/integrate. Any authorized security testing requires separate written scope and legal approval. |

## 5. External websites, services, and required software

These are preserved as supplied references. None was authenticated, subscribed, deployed, or activated. Private dashboards and shortened links are not evaluable artifacts.

| ID | Supplied item | Canonical / supplied URL | Classification | Disposition |
|---|---|---|---|---|
| EXT-01 | Innovation Insight | https://www.innovation-insight.com/ | SUPPLIED website | Reference only; owner to clarify relationship to ALO Labs. No integration decision. |
| EXT-02 | Buildonaut | https://buildonaut-yt.netlify.app/ | SUPPLIED tutorial/site | Reference only; not a dependency. |
| EXT-03 | Riverside Agents | https://riverside.com/dashboard/home | Private dashboard / SaaS | E. Requires authorized account; do not access user dashboard. Evaluate public API/docs only if owner approves. |
| EXT-04 | Nomback | https://nomback.com/ | SUPPLIED restaurant ordering app | D/B. Unrelated ordering demo; reference only. |
| EXT-05 | TrustMRR | https://trustmrr.com/ | SUPPLIED revenue/startup directory | E. Marketing/reference; not product infrastructure. |
| EXT-06 | DataFast | https://datafa.st/?ref=trustmrr | SUPPLIED analytics/referral | E. Remove referral parameter for canonical evaluation; no activation. |
| EXT-07 | Lasso | https://www.trylasso.online/ | SUPPLIED product | E. Clarify purpose/canonical docs before evaluation. |
| EXT-08 | Suno MCP | https://suno.com/mcp | SUPPLIED AI music/MCP service | B/E. Optional media only; gate: terms, output rights, paid API, no core telephone dependency. |
| EXT-09 | GodsViewAI | https://godsviewai.com/globe | SUPPLIED geospatial product | D/B. Related to GH-19; not contact-center core. |
| EXT-10 | Dessa by Block | https://block.xyz/dessa | SUPPLIED product/reference | E. Clarify capability and licensing; no account activation. |
| EXT-11 | wacrm setup docs | https://wacrm.tech/docs/getting-started | SUPPLIED docs for GH-04 | Reference for wacrm evaluation; do not follow deploy steps in Phase 0. |
| EXT-12 | Supabase | https://supabase.com | External Postgres/Auth platform | B/HOLD. Conflicts with current MySQL policy if used as core DB. Optional isolated service only after architecture approval. |
| EXT-13 | Meta for Developers | supplied as “/ apps” | UNRESOLVED canonical URL | Use https://developers.facebook.com/ only after owner confirms app/WABA scope. No app creation. |
| EXT-14 | ngrok | https://ngrok.com | Tunneling service | C/HOLD. Dev tunnel only; security/egress review. Not production carrier ingress. |
| EXT-15 | Vercel | https://vercel.com | Hosting platform | B/HOLD. Optional hosting; gate: data residency, serverless limits, WebSocket/media constraints, cost. |
| EXT-16 | Node.js | https://nodejs.org | Required runtime | C. Existing app uses Node 22 in sandbox; owner-supplied “24.x/26.x” is a future target, not installed/approved here. |
| EXT-17 | Git | https://git-scm.com/downloads | Required tool | C. Already used for repository inspection; no clone of external projects performed. |
| EXT-18 | Python | https://www.python.org/downloads/ | Required runtime | C. Python 3.11 present in sandbox; no bulk install or model setup performed. |
| EXT-19 | treg.to | https://treg.to/ | SUPPLIED unknown service | E. Clarify purpose; no activation. |
| EXT-20 | TubeGuruji Pro | https://www.tubeguruji.com | SUPPLIED course/promo | E. Reference only; not a dependency. |
| EXT-21 | AI PerksBox | https://aiperksbox.com | SUPPLIED credits/promo | E. No credit/account activation. |
| EXT-22 | WebTracky | https://webtracky.com | SUPPLIED analytics/product | E. Reference only; privacy/terms review before any use. |
| EXT-23 | StartupMap | https://startupmap.lol | SUPPLIED directory | E. Reference only. |
| EXT-24 | ShortVidCast | https://shortvidcast.com | SUPPLIED video/product | E. Reference only; media rights review if evaluated. |
| EXT-25 | Next.js boilerplate | https://www.npmjs.com/package/create-… | UNRESOLVED npm package | E. Canonical package name required; do not scaffold a competing app. |
| EXT-26 | CodeRabbit | https://dcmk.short.gy/free-coderabbit | UNRESOLVED short link | C/E. Resolve canonical URL and review terms before internal dev use. |
| EXT-27 | ImageKit | https://dcmk.short.gy/imagekit-free | UNRESOLVED short link | B/E. Optional media CDN; resolve URL, terms, cost, data path. |
| EXT-28 | Blotato | https://dcmk.short.gy/blotato | UNRESOLVED short link | B/E. Optional social/media tool; resolve URL and terms. |

## 6. Social, shortened, and promotional references

These are recorded to satisfy “add all,” but they are not software artifacts and cannot be safely evaluated without canonical URLs. Shortened links were not followed blindly.

| ID | Supplied reference | Status | Action |
|---|---|---|---|
| REF-01 | Riverside X post `x.com/NadavKeyson/status/2114…` | UNRESOLVED/truncated | Owner to provide full URL if evaluation is required. |
| REF-02 | Nomback Reddit `reddit.com/r/ClaudeAI/com…` | UNRESOLVED/truncated | Provide full thread URL; reference only. |
| REF-03 | TrustMRR X `x.com/trust_mrr/status/211451…` | UNRESOLVED/truncated | Provide full URL; marketing reference. |
| REF-04 | Marc Lou X `x.com/marclou/status/21146284…` | UNRESOLVED/truncated | Provide full URL; likely Mailcheap/promo reference. |
| REF-05 | Lasso X `x.com/nikaskn/status/21132919…` | UNRESOLVED/truncated | Provide full URL. |
| REF-06 | Jack / Dessa X `x.com/jack/status/21136979029…` | UNRESOLVED/truncated | Provide full URL; product reference only. |
| REF-07 | Spam Call Remove X `x.com/alx/status/211493573543…` | UNRESOLVED/truncated | Potentially relevant to outbound compliance UX; provide full URL. Do not infer legal rules from a post. |
| REF-08 | TrustMRR GodsViewAI startup page | https://trustmrr.com/startup/godsviewai | SUPPLIED | Reference only; not code/license evidence. |
| REF-09 | TrustMRR DataFast startup page | https://trustmrr.com/startup/datafast | SUPPLIED | Reference only. |
| REF-10 | Resources short link `dcmk.short.gy/eQNHWB` | UNRESOLVED | Provide canonical resource URL. |
| REF-11 | Source code short link `dcmk.short.gy/NiOLsM` | UNRESOLVED | Provide canonical repo/zip URL; do not execute unknown code. |
| REF-12 | Full assets short link `dcmk.short.gy/WJCq6L` | UNRESOLVED | Provide canonical asset URL; rights review required. |
| REF-13 | Eraser doc short link `dcmk.short.gy/social-media-ag…` | UNRESOLVED | Provide canonical doc URL. |
| REF-14 | AI Agent Office short link `dcmk.short.gy/office-editor` | UNRESOLVED | Provide canonical URL; sandbox/security review before use. |
| REF-15 | AI credits short link `dcmk.short.gy/aiperksbox` | UNRESOLVED | No activation; canonical URL required. |
| REF-16 | Supplied terminal commands (`git clone`, `cd gods-eye-view`, `npm ci`, `npm run doctor`, `npm run dev`) | SUPPLIED instructions | **Not executed.** Phase 0 forbids bulk install/run. If approved later, use a pinned commit in an isolated sandbox. |

## 7. Integration rules for any future approved phase

1. **No blind merging.** Each candidate needs a written fit decision, license review, security review, and tenant-isolation design before code enters AgentOS.
2. **Preserve the existing stack.** Do not replace MySQL/MariaDB with Supabase/Postgres or add a second frontend/backend framework without explicit architecture approval.
3. **Adapter-first.** Telephony, SMS, WhatsApp, email, speech, social, and payment providers remain replaceable adapters. External projects may inspire contracts, not become hard dependencies.
4. **License gates.** AGPL/GPL, modified Apache, PolyForm Noncommercial, CC-BY-SA, and unclear licenses require counsel review. Model weights and voice rights are separate.
5. **Consent gates.** Cloning, dubbing, face swap, recording, outbound calling, and scraping require purpose-specific consent/lawful basis and revocation/suppression controls.
6. **Security gates.** Reverse-engineering, desktop-control, scraping, container, and agent-memory tools require sandboxing, least privilege, egress controls, audit, and no customer production data by default.
7. **No fake operational data.** External demos must not populate production calls, numbers, transcripts, CRM, usage, billing, or analytics.
8. **Evidence before claims.** A repository README, star count, or social post is not proof of Bangla quality, telecom compliance, concurrency, security, or production readiness.
9. **Owner approval required.** Forking wacrm, installing developer tools, activating SaaS, or integrating any candidate is a Phase 1+ action, not authorized by this catalog.

## 8. Recommended next evaluation queue (after owner approval)

| Priority | Candidate | Why | First evidence required |
|---:|---|---|---|
| 1 | Voicebox / VoiceStudio | Direct voice-studio relevance | Model/voice license register, bn-BD native evaluation, consent/revocation design, AGPL decision for VoiceStudio |
| 2 | wacrm | WhatsApp CRM/shared-inbox reference | Architecture fit vs MySQL, tenant hardening plan, Meta official API review, fork approval |
| 3 | OpenSMS | SMS lab gateway idea | BTRC/A2P legal review; do not use SIM gateway as commercial carrier substitute |
| 4 | Dify / Hypit | Workflow/media ambition | Written commercial/multi-tenant license or reject embedding |
| 5 | Postiz / Mailcheap | Marketing/omnichannel adjacency | AGPL review, official API/consent design, isolate from core telephone pilot |
| 6 | OpenShorts / Presenton / HyperFrames | Optional media studio | Model/output rights, sandboxed rendering, storage quotas |
| 7 | Developer skills/agents | Internal productivity | Selected-skill review, sandbox, no production secrets/data |
| 8 | Security/dual-use tools | Only if authorized need | Written scope, legal approval, isolated lab, audit; WiFi cracker remains rejected |

## 9. Owner clarification needed

To move any item beyond this catalog, the owner should specify:

- Does “add all” mean **catalog only**, **evaluate selected candidates**, or **approve Phase 1 integration work**?
- Which items are product requirements versus inspiration/references?
- Canonical URLs for truncated/shortened links, especially source-code/assets/office-editor and Meta app scope.
- Whether forking `ArnasDon/wacrm` is authorized, and whether Supabase/Postgres is acceptable for an isolated module or must remain MySQL-only.
- Whether AGPL/modified-Apache components may be considered at all, or whether the product must remain permissive-license-only.
- Whether any security/dual-use tool has a legitimate authorized internal use case; otherwise it stays rejected/out of scope.

**Current state: all supplied items are recorded and triaged. No external code was added to the application, no fork/clone/install occurred, and Phase 1 remains unapproved.**
