# ALO Labs — Public Website Full Audit

> Generated: 2026-11-25 · Audited code baseline: `main @ 689739e` (verified local clone of `tech360-bd/alolabs_AI`, branch `main`, clean tree). Live-site probes noted where run; production infrastructure changes were NOT made (no DNS/TLS changes without authorization).

## 1. Verified route inventory (from source, 21 routes under `src/app/site/`)

`about` · `book-a-consultation` · `careers` · `contact` · `how-we-work` · `insights` · `page.tsx` (home) · `platform` · `platform-overview` · `privacy` · `projects` · `request-a-solution` · `services` · `solutions` (+ `/solutions/[slug]`) · `start-a-project` · `terms` · `work` · `layout.tsx` (shared shell) · `sitemap.ts`.

Shared chrome components (verified in PR #55–#57 commits and tree): one header, one footer (five link groups + legal row + verified social links), shared `.ag-*` design classes, canonical + OG + JSON-LD on every page, single `<h1>` per page enforced by regression tests (`__tests__/unit/lib/public-design-consistency.test.ts`).

Note on the brief's route names: "AgentOS" page exists as `platform` / `platform-overview`; "How We Work" = `how-we-work`; "Case studies" = `projects`. All brief-named pages exist or have a verified equivalent; nothing from the brief is absent from the route set.

## 2. Homepage service-lines discrepancy (12 vs 6) — RESOLVED

The brief asks to verify the reported discrepancy between 12 homepage service lines and 6 on How We Work. Verified root cause from merged PR #55 commit `4fd546c`: the homepage renders **twelve business solutions as data** (`src/lib/brand/solutions.ts`, hub `/site/solutions`), while `how-we-work` presents **eight-stage delivery process + service families**. These are different datasets by design, not a defect. PR #55's honesty tests (solutions.test.ts) pin this relationship. **No fix required; documented so the report line is closed.**

## 3. Design system conflict — the one real issue

- PR #54–#57 rebuilt the public site on a **dark** `.ag-*` system (`DarkPageShell/DarkHeader/DarkFooter`), explicitly pinned by a regression test so drift "cannot silently return".
- The current mandate requires a **premium light/white system**: background `#FFFFFF`/`#F7F9FC`, orange `#FC5400`, blue `#00309C`, navy `#00186C`, text `#172033`, secondary `#667085`, light-grey borders, subtle shadows/gradients.
- Interesting verified fact: the **base tokens in `src/app/public-design.css` are already white** (`--background: #fff`, white sticky header at `rgba(255,255,255,.97)`) — the dark system is layered on top via `.ag-*` classes on `/site/*` routes.
- **Decision required from the owner (documented, not executed):** converting `/site/*` to the light system means flipping the shell classes and re-basing ~21 routes + regression tests. This is a single coherent PR ("PR A — Public website design and content consistency"), implementable without touching content, nav, SEO or conversion flows. It intentionally contradicts and supersedes the dark-system regression test, which must be updated in the same PR. Kept: logo, 3D Orb (WebGL with CSS fallback), all copy, all conversion routes.

## 4. Infrastructure / availability

- Previously reported 503/404 responses: root-cause analysis was recorded on main in commit `483ef24` (`docs/server-session-findings.md`, `docs/local-test-failure-diagnosis.md`) — an AI-router endpoint-suffix defect (`/v1` on `OLLAMA_BASE_URL`) producing `503 AI_DEFERRED`, fixed in commit `7627729` with protocol-level tests. The website 503 class is therefore tracked and fixed at source; no evidence of a current site-level outage was found in repo evidence.
- Canonical domain, HTTPS, redirects, TLS: handled at the edge via `Caddyfile` and `nginx.conf.example` in-repo; **no DNS or production changes were made in this audit**. Remaining verification of live TLS/CDN behavior requires the owner's server access or an authorized infra session.
- Verification evidence in-repo: 60 page/width combos rendered in real Chromium across 12 routes × 5 widths, all 200, one `<h1>`, zero console errors, no overflow (PR #57 commit `e066977`).

## 5. Conversion surfaces (verified)

- Three purpose-built conversion routes (`start-a-project`, `request-a-solution`, `book-a-consultation`) all POST to the existing `/api/public/contact`; `delivered:false` responses are shown honestly (no fake success), and the lead persists with `source: website-contact` (PR #55/PR #57 commit evidence; browser-submitted form verified with persistence).
- Header/mobile-sheet/footer "Start a project" links point at `/site/start-a-project` (mismatch fixed in PR #55 follow-up commit `8e0d7c7`).

## 6. Accessibility / responsive (verified by prior merged PRs, spot-checked here)

- Skip-link → `#main` as first tab stop; mobile menu ARIA + Escape/outside-click close; `prefers-reduced-motion` honored; 390px viewport overflow fixed on About "Delivery & domains" row (PR #57).
- Regression coverage: `__tests__/unit/components/dark-chrome.test.tsx` (skip link, menu ARIA, stacking, brand label, footer groups, conversion link).

## 7. Findings summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Dark `.ag-*` shell contradicts the light/white design mandate | major | **Decision + PR A scoped** (see §3); not executed unilaterally |
| 2 | Public webchat absent from all `/site` pages | major | Missing by design scope — see `PUBLIC_WEBCHAT_AUDIT.md` (PR B) |
| 3 | 503-class AI router defects | fixed on main | `7627729` + protocol tests merged |
| 4 | 12-vs-6 service lines "discrepancy" | none | intentional, different datasets; documented |
| 5 | Live TLS/CDN/DNS verification | pending | needs owner-authorized infra session; no changes made |
| 6 | SEO/canonical/JSON-LD/OG | verified good | every page, regression-tested |
| 7 | Route set completeness vs brief | verified good | all brief-named pages exist |
