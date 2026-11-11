# ALO Labs Public Website Audit — alolabs.net

> Audit date: 2026-11-11 · Method: live HTTP fetches (homepage, robots.txt, sitemap.xml) + source verification in `alolabs_AI` @ `origin/main 90a4132`. Browser-based console/perf checks deferred to QA phase (no headless session against prod was opened in Phase 0).

## 1. Verified state

| Area | Finding | Verdict |
|---|---|---|
| Homepage render | Full page with hero + prompt box, workspace preview, platform story (4 pieces), how-it-works (3 steps), audience sections (builders/creative/operations), FAQ (4 items), closing CTA, footer | Healthy |
| SEO title/meta/OG | Present, coherent, `metadataBase` set to `https://www.alolabs.net` | Healthy |
| robots.txt | Allows Googlebot/Bingbot/social crawlers, disallows `/api/` | Healthy |
| sitemap.xml | 14 URLs; matches source routes (`/site/*`, `/brand`, `/design`, `/invoice`) | Healthy |
| Route ↔ source parity | `src/app/site/*` pages match sitemap exactly (platform, solutions, work, pricing, insights, about, careers, contact, press, diagrams) | Healthy |
| Brand assets | Official SVG set present: `alo-mark`, `alo-icon`, `alo-badge`, `alo-logo-horizontal`, `alo-logo-stacked`, `alo-wordmark`; theme color `#003ABC` | Healthy — **preserve** |
| Auth separation | Dashboard at `/dashboard`, not linked anonymously; earlier PRs (#15) fixed the public-at-`/` leak | Healthy |
| Contact form | `POST /api/public/contact` — real validation, honeypot, per-IP rate limit, CRM lead capture, best-effort SMTP notification. 12 unit tests added (`__tests__/api/public-contact.test.ts`). | Healthy (code + tests) |

## 2. Gaps vs the premium/3D direction (owner-approved mission)

| # | Gap | Priority | Status (this branch) |
|---|---|---|---|
| G1 | No 3D/interactive experience anywhere; hero is static text + form | **P0** | **DONE** — `hero-3d.tsx` (R3F constellation, lazy/DPR-capped/reduced-motion/no-WebGL fallback) |
| G2 | Monochrome design — no vibrant accent system, no design tokens for brand colors beyond `#003ABC` | **P0** | **DONE** — `src/app/public-design.css` tokens from official brand colors |
| G3 | No project/product portfolio with real, evidence-backed content ("Selected projects" missing) | P1 | **DONE** — "Selected work" section: AgentOS (Live), Voice Contact Center (In development), Engineering Intelligence (Internal) |
| G4 | No technology-stack section derived from the actual codebase | P1 | **DONE** — "Technology" section from actual `package.json`; scene badge reports LIVE vs STATIC honestly |
| G5 | No motion system (scroll-triggered transitions, reduced-motion support) | P1 | PARTIAL — hero motion honors `prefers-reduced-motion`; page-level scroll-triggered transitions not yet built |
| G6 | Services are described in aggregated sections; no per-service depth (AI Engineering, AgentOS, custom software, integrations, DevOps…) | P1 | PLANNED (existing `/site/solutions` page has 6 service lines) |
| G7 | No mobile-optimized 3D fallback / static fallback concept exists at all | P0 (with G1) | **DONE** — no-WebGL/`<640px` CSS/SVG fallback using official alo-mark; nav never depends on WebGL |
| G8 | `/site/about` etc. could not be re-verified from outside this audit session (fetch timeout) — QA phase must browser-verify all 14 sitemap routes | P2 | PENDING QA |

## 3. Live availability incident (2026-11-11, re-verified after the Phase 0 fetches)

| Time (UTC) | Check | Result |
|---|---|---|
| 02:40 | WebFetch `https://alolabs.net/` | Content rendered (stale/cached snapshot — see below) |
| 02:42–02:45 | `curl` with browser UA × 6 across `/`, `/site/{solutions,about,contact}`, `/login`, `/sitemap.xml`, `/robots.txt`, plus `www.` | **HTTP 403 / 530, body `error code: 1033`** (Cloudflare Argo Tunnel: origin unreachable) |
| 02:44 | 3 retries at 3 s intervals | Consistent 403 — not transient from this vantage point |

Verdict: **alolabs.net is DOWN for all visitors** — Cloudflare Tunnel cannot reach the origin (`cloudflared` not running / host offline). Every public route is affected, including `/robots.txt` (HTTP 530). The earlier homepage render came from a cached snapshot, not the live origin. Search engines will see the same failure, so this is an **P0 production incident** independent of the redesign.

Recorded as **FX-4** in the Fix Register (BLOCKED — requires the owner's server; `cloudflared` service must be restarted on the origin host, which is outside this session's access).

## 4. Rules for the redesign (protecting what works)

1. Official logo/wordmark assets are preserved untouched.
2. Existing routes, sitemap, robots, metadata stay; enhancements only.
3. 3D must be lazy-loaded (`ssr: false`, `next/dynamic`), paused off-screen, DPR-capped on mobile, with `prefers-reduced-motion` + no-WebGL static fallback; basic navigation must never depend on 3D.
4. No fake metrics, testimonials, customers, or achievements — content only from verified repo/product facts.
5. Design tokens centralized in CSS variables derived from official brand colors.
