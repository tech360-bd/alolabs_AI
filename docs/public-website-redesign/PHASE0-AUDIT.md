# PHASE 0 — Read-Only Audit: ALO Labs Public Website

Date: 2026-11-15 · Branch: `arena/eb868586-alolabs-ai` (from `main` @ `c951d770`) · Auditor: Arena agent (Principal Product Designer / Frontend / SEO / QA role)

## 1. Repository & deployment baseline

| Item | Finding |
| --- | --- |
| Repository | `tech360-bd/alolabs_AI` at `/home/user/alolabs_AI` |
| Branch / base | `arena/eb868586-alolabs-ai` branched from `main` @ `c951d770` ("Merge pull request #42") |
| Framework | Next.js **16.4.3** (App Router) + React 19.2.3 + TypeScript 5.9.3 |
| Styling | Tailwind CSS 4 + hand-authored CSS (`globals.css`, `public-design.css`, `home.css`) |
| 3D stack | `three` 0.187 + `@react-three/fiber` 9.8 (already in dependencies — justified for the hero) |
| Data | Prisma 6.19 (SQLite dev / MySQL prod), existing migrations untouched |
| Tests | Vitest 4 (`__tests__/`, `src/__tests__/`) — incl. `brand-system.test.ts`, `public-contact.test.ts`, `sitemap.test.ts`, surface-separation integration tests |
| Package manager | `bun@1.3.4` declared; `package-lock.json` present (npm used in this sandbox) |
| Production | Docker + Caddy/nginx + PM2 ecosystem file; `next build` → standalone output on port 3011 |
| Production domain | https://www.alolabs.net (metadataBase already set) |

**Rule 1 compliance:** this report was produced before any file was modified. No deployment, merge, DNS or production change is performed by this project.

## 2. Three-surface architecture (must stay separated)

| Surface | Routes | Access control (existing, intact) |
| --- | --- | --- |
| **Public website** | `/` (HomeExperience), `/site` (→ 307 to `/`), `/site/about`, `/site/solutions`, `/site/careers`, `/site/contact`, `/login` | Anonymous |
| **Client portal** | `/portal/*`, `/api/portal/*` | Client session (`alc_` token class), tenant-isolated |
| **Internal AgentOS** | `/dashboard`, `/brand`, `/design`, `/invoice`, `/site/platform`, `/site/pricing`, `/site/diagrams`, `/site/press`, `/site/insights`, `/site/work` (+ internal API surface) | Staff session (`src/lib/access/surfaces.ts` `INTERNAL_PAGE_PREFIXES` enforced by `src/proxy.ts`) |

**Important finding (SEO/security):** `src/app/sitemap.ts` currently advertises **internal** pages (`/site/platform`, `/site/pricing`, `/site/insights`, `/site/work`, `/site/diagrams`, `/site/press`, `/design`, `/brand`, `/invoice`) to search engines, and `public/robots.txt` does not disallow `/dashboard`, `/portal`, `/login` or those internal pages. This contradicts the requirement *"Do not expose private portal or internal AgentOS routes to search engines"* and leaks internal URL structure. Fix planned in Phase 2; `__tests__/unit/sitemap.test.ts` will be updated to match its own stated intent ("excludes private … routes").

## 3. Existing public website state

### 3.1 Homepage (`/` → `src/components/site/home-experience.tsx` + `src/app/home.css`)

- Positioning today: **"Private AI as a Service" / one API for every AI capability** (API-provider framing: `api.alolabs.net`, `POST /v1/ai/*` scopes, "Get your API key").
- Required positioning: **"A Global AI & Software Technology Company"** ("Building Intelligent Digital Experiences"), per master brief §2/§7 — brief explicitly says *avoid presenting ALO Labs as merely an API provider*.
- Structure: Hero (3D constellation) → Services (6 API cards) → Universal API → Platform → How it works (3 steps) → Selected work → Technology → Trust strip → FAQ → CTA → Footer.
- `home.css` still carries a legacy purple editorial layer (`--purple:#6b54d9`, purple orbs, purple buttons) with a "PREMIUM REDESIGN LAYER" overriding it onto brand tokens. Two competing visual identities remain in one file.

### 3.2 Unverified / non-compliant claims found in current public copy (must be removed or rephrased)

| Claim | Location | Problem |
| --- | --- | --- |
| "SOC2-ready" | home hero trust row | Unverified certification-style claim |
| "Sub-200ms p50" / "99.9% uptime target" | hero trust row + TrustStrip | Unsupported performance metrics (brief §4A/§7) |
| "450+ tests" | Technology section | Unverified number (will be re-stated only against a real test run) |
| "Production SLA" | TrustStrip | Implies an SLA that is not documented |
| "Get your API key … in minutes" | CTA | Productised-API claim; not the intended positioning |
| Dated milestones ("2023 The thesis", "2024 First services…") | `/site/about` | Company history/achievements without verified source (brief §4B: do not invent founding dates/achievements) |

### 3.3 `/site/*` pages

- `/site/about`, `/site/solutions` (6 service lines), `/site/careers`, `/site/contact` — public, built on shared `chrome.tsx` vocabulary (PageHero/Section/FaqList/CtaBand/SiteFooter/ContactForm).
- `/site/solutions` covers 6 service lines; master brief §4C requires **9 solution areas** with problem → solution → capabilities → value → engagement → CTA.
- Missing vs. brief: Services (§4D) page, How We Work (§4F) page, public Work showcase (§4E), legal pages (§4I), custom 404.
- `/site/work` contains case studies with claimed outcome metrics ("12h → 40m", "93%") and internal workforce detail ("40 specified agents", department names) — **kept internal** (it would violate rules 7/9 to publish). A new honest public showcase will be created without client names or invented metrics.

### 3.4 Contact pipeline (already strong)

- `POST /api/public/contact` — server-side validation, honeypot (`company_website`), per-IP rate limiting (5/10min), CRM lead capture (`CrmContact` + `CrmNote`), best-effort SMTP notification, test coverage in `__tests__/api/public-contact.test.ts`.
- Gaps vs. brief §4G: no budget range, no preferred contact method, no explicit consent handling. Will be added compatibly (existing test contract preserved).

### 3.5 Brand & assets

- `src/lib/brand/tokens.ts` palette: orange `#FF6A00`, blue `#003ABC`, amber `#FFB300` — the **previous** guideline.
- Master brief + uploaded official logo artwork specify: **ALO Orange `#E8501A`, ALO Blue `#0066CC`, Sunshine `#FFB347`**. The uploaded logo (hexagon + folded-A + pencil) matches the SVG artwork family in `public/brand/`; only the palette is dated.
- SVG lockups in `public/brand/` & `public/icons/` hard-code the old hexes; `alo-logo-horizontal.svg` and `alo-badge.svg` still carry **"ALO Labs AGENTOS / AI AGENT OPERATING SYSTEM"** wordmarks (the AgentOS identity the brief says must not be the public identity).
- `src/components/brand/alo-logo.tsx` provides React lockups (Mark, AloLabsLogo, Badge, BrandRule) used by both public chrome and internal brand book.
- `brand-system.test.ts` pins the old hexes as an executable brand contract (palette, gradients, SVG contents).

### 3.6 Design-system state

- `public-design.css`: one clean CSS-variable layer derived from `tokens.ts` — the right pattern, wrong (old) values.
- Typography: Inter (body) + Poppins (display) + Geist/Geist Mono + Instrument Serif loaded from Google Fonts via `<link>` (build-safe choice — kept).
- `chrome.tsx` component vocabulary is solid (PageHero, Section, NumberedCard, FaqList, CtaBand, ContactForm, SiteFooter) and already token-driven — **improved, not replaced**.

### 3.7 3D hero (`src/components/site/hero-3d.tsx`) — strong foundation

React Three Fiber constellation: emissive core + 12 satellite nodes + connection lines + starfield, pointer parallax, hover labels, click-to-scroll. Performance guards already in place: IntersectionObserver mount, visibility pause, DPR cap 1.75, antialias off on mobile, `prefers-reduced-motion` → single static frame, no-WebGL/small-viewport static SVG fallback with truthful LIVE/STATIC badge. **Keep and art-direct** (concept: *floating modular network* — brief §3 option C/D), re-point node anchors at the new section IDs.

## 4. What is preserved (non-negotiables)

- All existing routes, APIs, auth (`/login`, session binding, RBAC), client portal, internal AgentOS, Prisma schema, env vars, deploy tooling.
- `src/lib/access/surfaces.ts` internal page list & `src/proxy.ts` enforcement (no security control weakened).
- `marketing-site.tsx` (internal brand-book preview, asserted by `brand-system.test.ts`) — untouched except palette cascades via tokens.
- Existing test contracts: `public-contact.test.ts` behaviour (validation/honeypot/rate-limit/CRM capture) stays green; only palette values and sitemap membership assertions are updated (see Phase 2 notes).

## 5. Baseline validation

Recorded in `PHASE4-FINAL-REVIEW.md` (install → typecheck → lint → vitest → build → browser smoke) with before/after evidence.

## 6. Risk register

| Risk | Mitigation |
| --- | --- |
| Palette migration touches many files | Mechanical, exact-hex replacement of the 3 approved colors only; old secondary gradient stops retained; full test suite gates the change |
| Internal routes leaking to crawlers | Sitemap + robots corrected; internal page list unchanged |
| Unverified marketing claims | Claim inventory (§3.2) removed/rephrased; every remaining claim traceable to code or a documented fact |
| 3D cost on mobile | Existing guards kept; static fallback remains |
| Contact API contract break | Backward-compatible additive fields; existing tests unchanged |
