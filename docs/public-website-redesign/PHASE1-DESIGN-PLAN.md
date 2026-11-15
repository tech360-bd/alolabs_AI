# PHASE 1 — Design Plan: ALO Labs Public Website

## 1. Brand direction

**Positioning:** ALO Labs — a global AI & software technology company that designs and builds
software, AI-powered solutions and connected digital platforms. (Not an API vendor.)

**Palette (approved 2026 identity, master brief §2):**

| Token | Hex | Role |
| --- | --- | --- |
| ALO Orange | `#E8501A` | Primary actions, highlights, key accents |
| ALO Blue | `#0066CC` | Technology, trust, interactive elements |
| Sunshine | `#FFB347` | Selective emphasis, gradient partner for orange |

Supporting stops retained from the existing guideline: `#FF8A2B` (orange light), `#0077FF` /
`#0053C8` / `#0047A1` (blue stops), `#001C6B` (blue deep), `#0A1B3D` (navy ground).

**Gradients:** orange `#E8501A → #FFB347` (Sunshine replaces `#FFB300`); blue `#0066CC → #0077FF`;
ribbon `#0077FF → #001C6B`.

**Surfaces:** deep navy/near-black hero + feature bands; white/light-neutral content sections;
orange CTAs; blue interactive/trust elements; subtle brand-derived gradients only.

**Typography (unchanged, audit §3.6):** Inter body / Poppins display / Geist Mono technical values.

**Visual concept (single, consistent):** *The Intelligent Network* — a precision-engineered
constellation: floating modular nodes representing business systems, connected by data flows
around a stable engineered core. Implemented in the WebGL hero (upgraded art direction) and echoed
in lightweight CSS/SVG motifs on section dividers and the footer. No section-by-section animation
zoo.

## 2. Homepage wireframe (route `/`)

1. **Header** — ALO Labs mark + wordmark; nav: Solutions · Services · How We Work · About · Careers · Contact; "Client Login" entry (→ `/login`); primary CTA "Start a Project".
2. **Hero** — "Building Intelligent Digital Experiences." + supporting line (brief §4A) + CTAs
   *Start a Project* / *Explore Our Solutions* + 3D constellation (WebGL, lazy, guarded).
3. **Company introduction** — who ALO Labs is, what we build, which problems we solve.
4. **Core capabilities** — 6 capability cards (AI solutions & automation, custom software, web
   platforms, mobile, business systems/CRM, cloud & infrastructure).
5. **Business solutions** — 9 solution areas (brief §4C) summarized, linking to `/site/solutions`.
6. **How we work** — 01 Discovery → 02 Strategy & Architecture → 03 Design & Engineering →
   04 Launch & Delivery → 05 Continuous Improvement (brief §4F) + link to `/site/how-we-work`.
7. **Selected work** — honest showcase (status-labelled: Live / In development / Project
   engagement). No invented clients, logos or metrics. Links to `/site/projects`.
8. **Technology & delivery** — real stack (verified against package.json) + delivery principles.
9. **Why ALO Labs** — trust pillars (engineering quality, security & isolation, accountable
   delivery, long-term partnership) without unsupported statistics.
10. **Contact CTA band** → `/site/contact`.
11. **Footer** — company block (letterhead contact facts), site map, Client Login, Privacy/Terms.

## 3. Public sitemap (after change)

| URL | Status | Notes |
| --- | --- | --- |
| `/` | public | Homepage |
| `/site` | 307 → `/` | kept (redirect) |
| `/site/about` | public | rewritten (vision/mission/philosophy/responsible AI) |
| `/site/solutions` | public | rewritten (9 solution areas) |
| `/site/services` | **new, public** | deliverables + engagement models (brief §4D) |
| `/site/how-we-work` | **new, public** | 5-step delivery process (brief §4F) |
| `/site/projects` | **new, public** | honest project showcase (brief §4E; internal `/site/work` stays staff-only) |
| `/site/careers` | public | reviewed; real-opportunity-only policy |
| `/site/contact` | public | upgraded form (budget range, contact method, consent) |
| `/site/privacy`, `/site/terms` | **new, public** | legal, owner-flagged placeholders |
| `/site/…` internal set (platform, pricing, diagrams, press, insights, work) | **internal** | unchanged access control; removed from sitemap; robots-disallowed |
| `/login`, `/portal/*`, `/dashboard`, `/api/*`, `/brand`, `/design`, `/invoice` | private | robots-disallowed |

Custom `not-found.tsx` (404) added. Unique titles/descriptions/canonicals/OG on every public page.

## 4. Component architecture (improve, don't rebuild)

- `chrome.tsx` vocabulary kept (PageHero, Section, NumberedCard, FaqList, CtaBand, ContactForm,
  SiteFooter) — extended with `ProcessSteps`, `SolutionDetail`, status `Pill` tones.
- `home-experience.tsx` re-authored around the wireframe above (same file, same guarded imports).
- `hero-3d.tsx` kept (R3F constellation) — anchors re-pointed to new sections, materials/lighting
  re-tuned to the new palette, truthful badge + fallbacks preserved.
- CSS: `public-design.css` becomes the single brand-variable layer (new palette); `home.css`
  legacy purple layer collapsed into the brand layer; Tailwind inline styles on `/site/*` keep
  reading `BRAND` tokens.

## 5. Responsive plan

Desktop ≥1200 (2-col hero, 3-col cards) · Tablet 768–1199 (2-col cards, stacked hero) · Mobile
<768 (single column, hamburger nav, simplified 3D → static fallback <640). Fluid type via
`clamp()`. Touch targets ≥44px. No horizontal scroll at 320px.

## 6. Asset requirements

- Existing SVG lockups recolored to approved palette **without altering artwork** (paths/geometry
  untouched) — matches the uploaded official logo colors. Wordmark *text* in
  `alo-logo-horizontal.svg`/`alo-badge.svg` updated from "ALO Labs AGENTOS" to "ALO Labs" public
  identity (brief §8) — full proposal in `BRAND-ASSETS-REVIEW.md`.
- Favicon/manifest/theme-color updated to `#0066CC` / "ALO Labs".
- OG image: existing horizontal lockup; social sharing image proposal flagged for owner approval.

## 7. Performance budget

- LCP < 2.5s on mid mobile (hero text paints without WebGL); JS for hero 3D lazy (`ssr:false`).
- CLS ≈ 0 (fixed aspect boxes for visual slots); INP < 200ms (no heavy main-thread work).
- Images: existing SVGs (tiny); no new heavy assets; 3D scene: <60k triangles, DPR ≤1.75,
  paused off-screen/hidden (already implemented).
- Reduced motion: static frame + no transitions (already implemented; extended to new CSS).

## 8. Acceptance mapping

Every FINAL ACCEPTANCE CRITERIA item is tracked in `PHASE4-FINAL-REVIEW.md` with evidence links.
