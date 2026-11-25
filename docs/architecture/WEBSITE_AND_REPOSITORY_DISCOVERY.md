# Website and Repository Discovery

Status: **not implemented** (design + prerequisites) · 2026-11-25

## 1. Current state

| Requirement | State | Evidence |
| --- | --- | --- |
| Accept a customer website URL when creating a project | Partial | `Project` model exists, `/api/projects`; no URL intake flow |
| Crawl public pages, metadata, links | **Missing** | No crawler or browser automation; no Playwright in application dependencies |
| Website audit (SEO, accessibility, performance, broken links) | **Missing** | `src/lib/seo/` can generate recommendations, but nothing fetches a site |
| `ProjectDiscovery` / `CapabilityAssessment` models | **Present but unused** | `prisma/schema.prisma` defines both; `grep` finds no code reference |
| GitHub / GitLab connection | **Missing** | No OAuth app, client, webhook or token code in `src/` |
| Source analysis (framework, routes, schema, tests) | **Missing** | Depends on repository access |
| Preview environment | **Missing for customer projects** | Platform deploy/DB has preview-like config, not per-project previews |

This is the single most important honesty boundary in the product: **a URL enables
public analysis only, and even that analysis does not exist yet.** No code path may
claim to modify a customer website.

## 2. Why it is blocked

```
URL → public analysis ── requires: safe fetcher / browser sandbox + robots policy
source changes ───────── requires: authorised repository connection + sandbox
preview ──────────────── requires: isolated build environment + deploy target
deployment ───────────── requires: separately authorised deploy connector
```

Each arrow is a separate authorisation, exactly as the specification requires. The
governance catalogue already encodes the outcomes:

- `read.public` — allowed, low risk;
- `write.project` — moderate, tenant + project scoped;
- `deploy.preview` — allowed, isolated;
- `deploy.production` — `GLOB-DEPLOY-001`: tests + build + rollback evidence and
  approval, otherwise denied.

## 3. Design (Phase D/E)

### 3.1 Safe website intake

1. Validate the URL: HTTPS only, no credentials in URL, no private/link-local/
   loopback hosts (reuse the SSRF guard used by webhooks — see
   `__tests__/api/p0-ssrf-guard.test.ts` and `src/lib/integrations/preflight.ts`).
2. Respect `robots.txt`, published rate limits and terms; never bypass a login,
   CAPTCHA, paywall or WAF.
3. Fetch a bounded page budget (default 25 pages, 5 MB/page, 60 s per run) and
   store findings, not page bodies.
4. Record every URL visited with status, timing and redirect chain in
   `ProjectDiscovery` (fields already modelled).
5. Produce a capability assessment in `CapabilityAssessment`: SEO structure,
   accessibility signals, broken links, metadata, responsiveness *as declared by
   markup* — never claim visual verification without screenshots.

### 3.2 Repository connection

- GitHub App (preferred over OAuth user tokens): least-privilege install,
  repository selection, short-lived installation tokens.
- Store only encrypted tokens (`IntegrationCredential.encryptedSecret` +
  `src/lib/security/field-encryption.ts`), never raw keys in `Settings` or chat.
- Verify webhook signatures before accepting events.
- Revocation must delete the credential, invalidate cached tokens, write an audit
  event, and leave historical audit records intact (Scenario 9).

### 3.3 Source analysis

Read-only clone into a sandbox with no production credentials. Extract: framework,
package manager, dependencies, routes, API handlers, Prisma/ORM schema, auth model,
design system, tests, CI config, environment variable **names** (never values).

### 3.4 Change and delivery

Feature branch → diff → tests → build → preview → approval → PR. All gated by the
governance catalogue; the coding engine design is in
`docs/architecture/AUTONOMOUS_CODING_ENGINE.md`.

## 4. Data model gaps

`ProjectDiscovery` and `CapabilityAssessment` exist; review them against the flow
above before writing code. Likely additions:

| Need | Model change | Why |
| --- | --- | --- |
| Repo binding | `ProjectRepository` (projectId, provider, externalId, defaultBranch, credentialId) | A URL is not a repository; the grant is explicit |
| Crawl sessions | `DiscoveryRun` (status, budget, findings, robots policy) | Reproducibility and audit |
| Preview environments | `PreviewEnvironment` (projectId, commit, url, expiresAt) | Isolated verification evidence |
| Approval linkage | `Approval.requestJson.binding` for deploy actions | Existing approval binding |

Any migration touching existing tables requires a backup and an approval
(`GLOB-DESTRUCT-001`), and must ship with rollback instructions.

## 5. Acceptance tests (must pass before the feature is advertised)

1. URL intake rejects `http://`, private IPs, redirect-to-private and credentialed URLs.
2. Robots-disallowed paths are skipped and recorded.
3. A login-walled page is reported as "authentication required", never crawled.
4. No repository action is possible without a repository binding.
5. A production deploy without tests/build evidence is **denied** by
   `GLOB-DEPLOY-001`.
6. Revocation makes every subsequent repository call fail closed.

Today only #5 is proven (governance unit tests). The rest are the Phase E test
plan in `docs/testing/AGENTOS_END_TO_END_ACCEPTANCE_TESTS.md`.
