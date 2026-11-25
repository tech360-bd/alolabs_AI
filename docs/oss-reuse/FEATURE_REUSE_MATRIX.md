# Existing-versus-New Feature Reuse Matrix

> Companion to `OSS_REPOSITORY_AUDIT.md`. Columns: **OSS capability** (grounded in the audited repos' own descriptions), **ALO Labs current state** (verified paths in this repo at `main @ 51d20f9` unless noted), **verdict** (`exists` / `partial` / `missing`), and the action for the central-platform directive. "Path" citations follow the same evidence rules as `docs/architecture/CENTRAL_PLATFORM_AUDIT.md`.

Legend: ✅ exists (do not rebuild) · 🟡 partial (extend, concept-reference the OSS project) · ❌ missing (implement equivalent functionality following the OSS concept, respecting licence verdicts)

## A. Marketing & communication stack (ALO SOCIAL API directive context)

| Capability | OSS reference | ALO Labs state | Verdict | Action |
|---|---|---|---|---|
| Email marketing / newsletters / campaigns | Mautic (GPL), listmonk (AGPL), Dittofeed (MIT) | No dedicated campaign engine found; messaging surface exists via voice + chat only | ❌ | Build native module; **Dittofeed (MIT) is the only licence-safe code reference**; use Mautic/listmonk as concept references only |
| Social account OAuth manager / scheduling | Postiz (AGPL) | No social publishing engine found | ❌ | Build native; study Postiz architecture (AGPL → concepts only) |
| CRM / contacts / pipelines | Twenty (AGPL core) | CRM API surface exists: `/api/v1/crm/{connections/verify, followup-drafts, preflight}` (verified) | 🟡 | Extend existing CRM routes; Twenty is concept reference for object model only |
| Customer support desk / live chat | Chatwoot (MIT core) | Chat + web surfaces exist (`src/app/api/chat`, webchat audit in PR #58); no full omnichannel desk | 🟡 | Either extend ALO chat or run self-hosted Chatwoot (MIT core) behind the gateway — integration study required before choosing |
| Transactional + lifecycle messaging (SMS/push/WhatsApp/Slack journeys) | Dittofeed (MIT) | Voice outbound campaigns exist (`/api/v1/voice/campaigns`); no email/push journey engine | ❌ | Build native, MIT-referencing Dittofeed for journey/segment modelling |
| Marketing/lead analytics | PostHog (MIT core), Matomo (GPL) | `/api/v1/analytics` built (PR #59): tenant TokenUsage aggregation; no product-analytics event pipeline | 🟡 | Extend with event ingestion; PostHog MIT core is licence-safe reference; Matomo = concepts/integration only |
| Feature flags & experiments | GrowthBook (MIT core) | No flag service found | ❌ | Either adopt GrowthBook SDKs (MIT) or build minimal flag service; never touch `packages/*/src/enterprise` |
| Idea/feedback boards | ClearFlask (Apache-2.0) | Not present | ❌ | Low priority; Apache-2.0 allows direct reuse with NOTICE |
| AI content strategy / AI SEO generation | ALwrity (**no licence**) | AI-first platform core exists (AI router, content agents) | ✅ (core) | **Do not use ALwrity code**; our own AI content/SEO features proceed independently |
| Marketing workflow automation | n8n (Sustainable Use) | `src/lib/workflow-engine/` + `/api/v1/workflows(+/run)` (verified) | ✅ | Do not rebuild; do not adopt n8n code (fair-code); study node/trigger model |

## B. Platform mechanics (cross-check against the OSS set)

| Capability | OSS reference | ALO Labs state | Verdict | Action |
|---|---|---|---|---|
| Multi-tenant workspaces | Twenty (workspace isolation), Chatwoot (accounts) | `CompanyApiKey` per company, `companyId` predicates in every v1 query, `ClientAccount`/`ClientProject` models, fail-closed scopes (verified in `v1-auth.ts`) | ✅ | Keep; add tenant-level usage dashboards |
| API-gateway-style external surface | n8n (public API), Twenty (GraphQL API), Chatwoot (application API) | 48 pre-existing `/api/v1` routes + knowledge/inference/analytics (PR #59), key auth, scopes, rate limiting | ✅ | Add signed webhooks (gap G2) + generic idempotency middleware (G3) |
| Background job processing | n8n (execution queue), Dittofeed (worker streams) | `src/lib/job-queue.ts` + worker (`worker/index.js`); idempotency keys enforced in queues | ✅ | Keep |
| Feature-flag-driven rollout | GrowthBook | Missing (see above) | ❌ | Needed before risky marketing-module launches |
| Web analytics ingestion | Matomo, PostHog | Missing as product feature | ❌ | Event pipeline after marketing modules land |

## C. Anti-duplication rules (directive: "Do not create separate copies…")

1. Any new marketing capability lands in **this repository** as AgentOS services + `/api/v1` routes — never as parallel AI stacks inside individual ALO projects.
2. Client projects consume capabilities only through scoped gateway credentials; scope sets per project (NRC, TECH360, Hosting Portal, MarketingOS) are an onboarding task (audit gap G7).
3. Before each new module: check this matrix — if 🟡/✅, extend the existing component; only ❌ items get new modules.
4. Licence verdicts from `OSS_REPOSITORY_AUDIT.md` bind: GPL/AGPL/fair-code sources are never copied into this proprietary codebase; MIT/Apache reuse must carry attribution and honour directory exclusions (`ee/`, `enterprise/`, `src/enterprise`, `.ee.` files).
