# ALO Labs Ecosystem Inventory — Phase 0 Discovery

> Audit date: 2026-11-11 · Evidence: live fetch of alolabs.net + GitHub org page + local clone of `alolabs_AI` @ `origin/main 90a4132`.
> Only actually discovered projects are listed. Nothing is inferred beyond evidence.

## GitHub organization tech360-bd — 4 public repositories

| Project | Repository | Technology | Status | Missing Work / Findings | Priority |
|---|---|---|---|---|---|
| **Public Website + AgentOS (primary)** | [`alolabs_AI`](https://github.com/tech360-bd/alolabs_AI) | TypeScript, Next.js 16.4, React 19, Prisma 6.19, Tailwind, Radix UI, Bun/npm | Audited — active (merged PRs #14–#27; main @ `90a4132`) | Public site now has 3D hero + design system (this branch); AI runtime untested against live models (no deployed Ollama evidence); voice STT/TTS placeholders are honest | **P0** (website/brand), P1 (AI runtime verification) |
| **ALO Web CRM** | [`ALO_WEB_CRM_TECH`](https://github.com/tech360-bd/ALO_WEB_CRM_TECH) | TypeScript | Discovered — not yet audited in depth | Full project audit (frontend/backend/security) still to run; relationship to AgentOS CRM modules not yet mapped | P1 |
| **ALO Learning Journey (fork)** | [`ALO-LEARNING-JOURNEY-PRODUCTION`](https://github.com/tech360-bd/ALO-LEARNING-JOURNEY-PRODUCTION) | TypeScript | Discovered — fork of external repo | Fork: upstream tracking + license review of upstream required before any integration claim | P2 |
| **ALAMINN** | [`ALAMINN`](https://github.com/tech360-bd/ALAMINN) | TypeScript | Discovered — purpose unestablished | No README evidence gathered yet; ownership/purpose must be established from evidence before inclusion in the ecosystem | P3 |

No private repositories were claimed, listed or assumed. Only public visibility was verified.

## Primary repository structure relevant to the public website

- Public site entry: `src/app/page.tsx` → `HomeExperience` (`src/components/site/home-experience.tsx`)
- Site pages: `/site/{platform,solutions,work,pricing,insights,about,careers,contact,press,diagrams}` + `/platform/voice-contact-center`, plus `/brand`, `/design`, `/invoice`, `/login`
- Brand assets (official, preserved): `public/brand/alo-{mark,icon,badge,logo-horizontal,logo-stack,wordmark}.svg`
- SEO: `sitemap.ts` (verified live), `public/robots.txt` (verified live, allows all crawlers, disallows `/api/`)
- Authenticated app: `/dashboard` (not reachable anonymously — verified by route guards)

## Live site observations (2026-11-11)

> **P0 production incident (FX-4):** re-verification found **alolabs.net is DOWN** — every route returns HTTP 403/530 with Cloudflare `error code: 1033` (Argo Tunnel origin unreachable), including `/robots.txt`. The homepage content below came from a cached snapshot, not the live origin. Recorded as **FX-4 (P0, BLOCKED — owner server action)** in the Fix Register.

- Homepage snapshot (cached) rendered fully: hero with interactive prompt box, workspace preview, 4-step platform story, how-it-works, audience sections, FAQ, CTA, footer.
- Tone of the cached snapshot: editorial, monochrome, calm. **No 3D, no color system beyond dark text on light, minimal motion.**
- Title/meta/OG tags present and coherent; cached robots.txt and sitemap.xml were consistent with source before the outage.

## Access blockers recorded

- GitHub API rate limit (unauthenticated) limits org metadata pulls; HTML page is JS-rendered. Count verified via `?tab=repositories` render.
- The old owner PAT was revoked ("Bad credentials") — **push/PR creation is currently BLOCKED** until a fresh fine-grained token is provided. Work is prepared on local branches with PR descriptions ready.
