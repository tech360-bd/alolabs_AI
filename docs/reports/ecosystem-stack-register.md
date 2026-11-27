# Ecosystem adoption sweep — the stack register

**Date:** 2026-11-27
**Branch:** `arena/5010a0d6-alolabs-ai` (PR #73)
**Requested by:** owner, with fifteen links in one message

---

## 1. What was asked

> "…if there are more than that and they have already been created, add them, and
> if not, create them too … if you have created something, do not delete them,
> but rather add and create what has not been created."

The links sent:

| # | Link | Asked as |
| --- | --- | --- |
| 1 | `monid.ai/tools` | AI tool directory |
| 2 | `github.com/monid-ai/monid` | open-source agent workspace |
| 3 | `github.com/NYLLON-SOFTWARE/SignuDoc` | e-signature suite |
| 4 | `floppydata.com/cloud-browser/` | cloud browser for agents |
| 5 | `github.com/orgs/BerriAI/repositories` | LiteLLM gateway |
| 6 | `github.com/orgs/nocobase/repositories` | no-code data platform |
| 7 | `github.com/orgs/temporalio/repositories` | durable execution |
| 8 | `github.com/activepieces/activepieces` | automation builder |
| 9 | `github.com/orgs/directus/repositories` | headless data platform |
| 10 | `github.com/orgs/Aider-AI/repositories` | AI pair programming |
| 11 | `github.com/LibreChat-AI` | multi-provider chat |
| 12 | `github.com/orgs/open-webui/repositories` | self-hosted AI UI |
| 13 | `github.com/YouBTech01` | account listing, no repo named |
| 14 | `github.com/vllm-project/vllm` | inference server (already in the register) |
| 15 | `github.com/ripienaar/free-for-dev` | free-tier list |
| 16 | `postman.com` | API tooling |

## 2. What already existed (kept, not replaced)

The instruction not to delete anything mattered here, because three catalogues
already covered part of this list and were the right place to extend:

| Existing surface | What it holds | What this sweep did |
| --- | --- | --- |
| `src/lib/link-coverage/registry.ts` | 73 upstream links, each with a verdict, evidence paths and a gap statement; checked by `__tests__/lib/link-coverage.test.ts` and `npm run verify:links` | **Extended to 88 rows.** `vllm` was already there — it was *not* duplicated. `free-for.dev` already had two rows (mirror + site); the canonical `ripienaar` repo was added as its own row. |
| `src/lib/integrations/**` (ONE Runtime) | **26 registered adapters** with licence class and integration strategy; `integrationRegistry.catalog()` behind `GET /api/integrations/catalog` | **Unchanged.** Eight of the requested systems already had adapters — the sweep proves it rather than re-implementing them. No UI consumed the catalogue before; it does now. |
| `src/lib/free-resources.ts` + `GET /api/free-resources` | curated subset of free-for.dev, each row with a quoted allowance and verify URL | **Unchanged**, and now cited as the evidence for the `free-for-dev-upstream` row. |
| `src/lib/open-source-models.ts` + `GET /api/open-source-models` | 100+ open-weight models with families and capabilities | **Unchanged**, cited as the in-kind answer to the Monid directory rows. |

## 3. Verdicts for the fifteen new rows

"Implemented" means an adapter or first-party subsystem exists **in this
repository**; it does not mean the upstream system is deployed. That distinction
is printed on every card.

| Link | Verdict | Why |
| --- | --- | --- |
| BerriAI / LiteLLM | `implemented` | `gateway.litellm` adapter + LiteLLM provider kind |
| NocoBase | `implemented` | `automation.nocobase` adapter (API-only, AGPL boundary kept) |
| Temporal | `in_kind` | native run engine + lease queue deliver durable execution; adapter exists for existing clusters |
| Activepieces | `implemented` | `automation.activepieces` adapter + first-party workflow engine |
| Directus | `implemented` | `content.directus` adapter (source-available, API-only) |
| Aider | `implemented` | `coding-agent.aider` adapter with hunk format/parse |
| LibreChat | `implemented` | `ai-chat.librechat` adapter + first-party `/platform/chat` |
| Open WebUI | `implemented` | `ai-chat.open-webui` adapter (branding clause respected) |
| free-for.dev (upstream) | `implemented` | curated subset in `src/lib/free-resources.ts` |
| Monid (repo) | `reference` | a tool directory; our own catalogues cover the need |
| Monid tools (site) | `reference` | ditto — nothing to integrate |
| **SignuDoc** | **`gap`** | no signature capture, document hash or tamper-evident record anywhere |
| **FloppyData cloud browser** | **`gap`** | no CDP session or browser tool; agent web work is plain HTTP fetch |
| **Postman** | **`gap`** | 544 routes but no published OpenAPI document / collection |
| YouBTech01 | `not_applicable` | account listing with no identifiable artefact |

## 4. What this sweep built

| Surface | Path | Purpose |
| --- | --- | --- |
| Presentation model | `src/lib/ecosystem/stack.ts` | joins the two catalogues into pillars, verdicts, stats and **fourteen agent briefs** (use-when / steps / risks). Client-safe: no Node, no Prisma. |
| Server join | `src/lib/ecosystem/adapters.ts` | injects the 26 live adapters (`bootstrapIntegrations()` is idempotent) so the client bundle never imports `@/lib/db`. |
| Public API | `GET /api/ecosystem` | whole register, `?verdict`, `?pillar`, `?q`, `?format=summary`; cacheable, no tenant fields. |
| Public API | `GET /api/ecosystem/[slug]` | one row **with every evidence path re-checked on disk** (`verified: true/false/null`), 404 lists real ids. |
| Public page | `/site/stack` | server-rendered register + client explorer: search, verdict and pillar filters, evidence chips, expandable agent briefs, gap queue. Linked from the site nav and `sitemap.xml`. |
| Dashboard panel | `src/components/panels/ecosystem-stack-panel.tsx` | "Stack Register" under *Infrastructure*; the first UI to render the adapter catalogue at all. |
| Gate integration | `src/proxy.ts`, `scripts/classify-routes.mjs`, `scripts/validate-route-auth.mjs` | both routes allowlisted as public with a written reason; the shadow rule is a documented exception, not an accident. |

### 4b. Two defects this surface exposed

Building a *consumer* of the adapter catalogue immediately found two real bugs
that no existing test could see, because nothing had ever read the catalogue
twice in one process:

1. **`integration registry: duplicate adapter id "crm.twenty"` — HTTP 500.**
   `bootstrapIntegrations()` guarded registration with a module-local boolean.
   Turbopack instantiated `@/lib/integrations` and `./index` separately, so the
   flag reset while the singleton registry did not, and the second pass threw on
   the first adapter. Any route or panel that imported the catalogue from two
   entry points would 500. Fixed at the owner of the state: a `registerAdapter()`
   helper skips an id that is already present, while `register()` still throws for
   a *different* adapter claiming an existing id (a genuine programming error).
2. **The UI's own search example did not match.** The placeholder invites the
   reader to type `e-signature`, but SignuDoc is described as "electronic
   signature", so a substring search returned nothing. `STACK_KEYWORDS` now maps
   each row to the words people and agents actually use, and hyphen/space are
   normalised. `?q=e-signature` returns `signudoc`; `?q=browser` returns
   `floppydata-cloud-browser` and the `browse` MCP row.

A third change is a feature rather than a fix: the Command Agent gained a
**`stack_register` tool**, so an agent asked to "integrate Aider" can first learn
that `coding-agent.aider` is already implemented, with the file paths that prove
it and the verdict vocabulary to quote.

## 5. Verification

```text
npm run verify:security        → 544 route files classified (0 unclassified)
                                 migration safety: 15 forward / 12 rollback paired
node scripts/validate-route-auth.mjs
                              → 544 files, 856 non-public handlers, 21 allowlist
                                 entries, 2 documented exceptions — OK
npm run verify:mysql           → 266/266 models, 0 parity errors
npx vitest run __tests__/lib/link-coverage.test.ts
                              → 17 passed (88 rows, evidence on disk)
npx vitest run __tests__/unit/lib/ecosystem-stack.test.ts
                              → 19 passed (15 register + 4 agent tool)
npx vitest run __tests__/api/ecosystem.test.ts
                              → 9 passed
npx vitest run                 → 246 files, 2,717 tests passed, 0 failed
npm run build                  → exit 0; 11,373 files; packaged
                                 realtime-service.cjs + queue-service.cjs load
npm run typecheck / typecheck:tests / lint → 0 errors
```

## 6. Honest limits

1. **No upstream system is deployed by this repository.** Every "implemented"
   row means an adapter or first-party subsystem exists here; none of the fifteen
   services is running in this environment.
2. **Three gaps are real work, not documentation.** E-signature needs a schema,
   a legal review and an adapter. A cloud browser needs isolation, consent and an
   approval gate before the first navigation. Postman needs a generated OpenAPI
   3.1 document in CI.
3. **Upstream metadata is a dated observation.** Stars/languages were read from
   the GitHub API on 2026-11-27; `settings`/`licences` change.
4. **`YouBTech01` cannot be evaluated** without a specific repository URL.
