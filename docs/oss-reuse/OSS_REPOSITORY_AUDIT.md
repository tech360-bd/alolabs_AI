# Open-Source Repository Audit — 12 Reference Projects

> Generated: 2026-11-25 · Method: every repo queried live via the GitHub REST API (`/repos/{owner}/{repo}`, metadata + `LICENSE` file contents fetched from the default branch). Raw data: `oss-audit-data/repo-metadata.json`, `licence-verification.json`, `licence-keywords.json` (audit session). Purpose: satisfy the "audit these repositories before implementing equivalent functionality" rule of the Master Directive before any equivalent feature is built into ALO Labs.
> Feature descriptions are grounded in each repo's own GitHub description/topics; where a claim needs deeper verification, it is marked.

## Reuse policy verdicts (licence-first)

| Verdict | Meaning |
|---|---|
| **Reference-only** | Study architecture/concepts; do not copy code (copyleft or fair-code licence makes embedding incompatible with a proprietary core) |
| **Embeddable (MIT/Apache)** | Code may be reused with attribution; enterprise dirs excluded |
| **Integrate, don't fork** | Run as a separate self-hosted service behind the ALO API Gateway |
| **Do not use** | No licence = all rights reserved |

## The 12 repositories

### 1. mautic/mautic — Marketing Automation
- **Verified**: PHP · 11,113★ · default branch `7.x` · active (pushed 2026-11-25)
- **Licence**: **GPL-3.0** (read from `LICENSE.txt`: "Mautic is released under the GPL v3")
- **Capability**: open-source marketing automation (email campaigns, automation per its own description/topics)
- **Verdict**: **Reference-only** (GPLv3 is viral). Concepts worth studying: campaign/segment modelling, lead scoring.

### 2. gitroomhq/postiz-app — Social Scheduling
- **Verified**: TypeScript · 42,393★ · Next.js/Redis stack (topics) · active
- **Licence**: **AGPL-3.0** (API-verified)
- **Verdict**: **Reference-only** for code; strong concept reference for the ALO SOCIAL API directive (multi-platform OAuth account manager, scheduling pipelines).

### 3. twentyhq/twenty — CRM
- **Verified**: TypeScript/NestJS/GraphQL/PostgreSQL · 61,462★ · active
- **Licence**: **AGPLv3 core + commercial licence for marked files** (read from `LICENSE`: "mostly licensed under AGPLv3 … with two qualifications: 1. Certain files are licensed under a commercial license…")
- **Verdict**: **Reference-only**. Concept reference for CRM object model, GraphQL API design, workspace isolation.

### 4. n8n-io/n8n — Workflow Automation
- **Verified**: TypeScript · 212,093★ · 400+ integrations (own description) · active
- **Licence**: **Sustainable Use License (fair-code, NOT OSI open-source)** + Enterprise for `.ee` files (read from `LICENSE.md`). "Source code files that contain `.ee.` … you must hold a valid n8n Enterprise License."
- **Verdict**: **Reference-only / integrate, don't fork**. The Sustainable Use License restricts offering it as a paid service to third parties. ALO already has its own workflow engine (`src/lib/workflow-engine/`, `/api/v1/workflows`) — study n8n's node/trigger model instead of adopting its code.

### 5. knadh/listmonk — Newsletter/Mailing Lists
- **Verified**: Go single binary · 24,459★ · active
- **Licence**: **AGPL-3.0** (API-verified)
- **Verdict**: **Reference-only for code; integrate as external service is also non-trivial (AGPL applies to network use — serving modified versions requires source disclosure).** Concept reference: single-binary ops discipline, bounce handling, template model.

### 6. dittofeed/dittofeed — Customer Engagement/Messaging
- **Verified**: TypeScript/Node · 3,083★ · email/SMS/push/WhatsApp/Slack journeys (own description) · **pushed 2026-10-12 (least recently active of the set)**
- **Licence**: **MIT** (API-verified)
- **Verdict**: **Embeddable (MIT)** — the only messaging/journey codebase that could legally seed ALO messaging features with attribution. Verify maintenance cadence before adopting (activity dip observed).

### 7. matomo-org/matomo — Web Analytics
- **Verified**: PHP/MySQL · 22,051★ · active
- **Licence**: **GPL-3.0** (API-verified)
- **Verdict**: **Reference-only**. Privacy-first analytics concepts; a self-hosted Matomo instance can be integrated as an external analytics source via its reporting API.

### 8. PostHog/posthog — Product Analytics
- **Verified**: Python/TypeScript · 41,109★ · active
- **Licence**: **MIT Expat core + separate licence for `ee/` directory** (read from `LICENSE`: "All content that resides under the 'ee/' directory … is licensed under the license defined in 'ee/LICENSE'; content outside … is available under the 'MIT Expat' license")
- **Verdict**: **Embeddable (MIT) — excluding everything under `ee/`**. Flags/experiments concepts relevant to ALO analytics; check each file's path before any reuse.

### 9. chatwoot/chatwoot — Omnichannel Support Desk
- **Verified**: Ruby/Rails/Vue · 40,542★ · active
- **Licence**: **MIT Expat core + separate licence for `enterprise/` directory** (read from `LICENSE`)
- **Verdict**: **Embeddable (MIT) — excluding `enterprise/`**; also a strong candidate to run self-hosted as an external inbox service behind the gateway. ALO already has chat/web surfaces (`/api/chat`, `/api/v1/voice`) — concept reference for conversation routing and human handoff.

### 10. growthbook/growthbook — Feature Flags & Experiments
- **Verified**: TypeScript · 8,659★ · active
- **Licence**: **MIT Expat core + GrowthBook Enterprise License for `packages/*/src/enterprise` directories** (read from `LICENSE`)
- **Verdict**: **Embeddable (MIT) — excluding the three enterprise directories**. The SDKs (`@growthbook/growthbook`) are MIT and safe to depend on.

### 11. ALwrity/ALwrity — AI Digital Marketing Platform
- **Verified**: Python · 1,230★ · active
- **Licence**: **NONE FOUND** — no LICENSE/COPYING file in the repo root (checked LICENSE, LICENSE.md, LICENSE.txt, COPYING, COPYING.txt, LICENSE.rst + API `license: null`)
- **Verdict**: **Do not use.** Without a licence, default copyright applies: no reuse of code, text or assets without written permission. Concepts visible from its public description (AI content strategy, multimodal generation, AI SEO) can inform our own implementations — that is not copyright-protected — but no copying.

### 12. clearflask/clearflask — Feedback/Roadmap
- **Verified**: Java · 452★ · active
- **Licence**: **Apache-2.0** (API-verified)
- **Verdict**: **Embeddable (Apache-2.0)** with NOTICE preservation. Lowest-activity repo of the set; concept reference (idea voting, roadmap boards) more valuable than code.

## Cross-cutting conclusions

1. **7 of 12 are reference-only for ALO** (GPL/AGPL/fair-code: Mautic, Postiz, Twenty, n8n, listmonk, Matomo + no-licence ALwrity) — the Master Directive's "audit before implementing" rule is the only correct use for them.
2. **4 are safely embeddable with directory exclusions** (Dittofeed, PostHog, Chatwoot, GrowthBook — MIT/Apache cores; NEVER touch their `ee/`, `enterprise/`, or `src/enterprise` paths; each repo's LICENSE defines the boundary and it must be re-checked at pin time).
3. **ClearFlask is Apache-2.0** without carve-outs.
4. Licence hygiene rule for ALO: any adopted dependency goes into `docs/LICENCE_REGISTER.md` in the same PR, with the SPDX verified from the upstream file (as done here), not from memory or aggregators.
5. No code from any of the 12 repositories has been copied into ALO Labs by this audit. The only artefacts are this document and the reuse matrix, which reference concepts, not implementations.
