# Brand Assets Review — ALO Labs Public Website

Date: 2026-11-15 · Prepared per master brief §8 · Status: **proposals awaiting owner approval**

## 1. Inventory

| Asset | File | Role | Status after this project |
| --- | --- | --- | --- |
| Primary mark (hexagon + folded-A) | `public/brand/alo-mark.svg` | Symbol | Artwork unchanged; palette aligned |
| App icon | `public/brand/alo-icon.svg` | Browser/app icon | Artwork unchanged; palette aligned |
| Horizontal lockup | `public/brand/alo-logo-horizontal.svg` | Horizontal wordmark | Artwork unchanged; palette aligned; **wordmark text issue — see §3** |
| Stacked lockup | `public/brand/alo-logo-stacked.svg` | Stacked wordmark | Artwork unchanged; palette aligned; **wordmark text issue — see §3** |
| Wordmark only | `public/brand/alo-wordmark.svg` | Text lockup | Palette aligned; **wordmark text issue — see §3** |
| Circular badge | `public/brand/alo-badge.svg` | AgentOS product badge (internal brand book) | Unchanged — intentionally kept as the AgentOS identity |
| App icons | `public/icons/icon-192.svg`, `icon-512.svg` | PWA icons | Artwork unchanged; palette aligned |
| React lockups | `src/components/brand/alo-logo.tsx` | Mark / AloLabsLogo / Badge / BrandRule | Render the clean "ALO Labs" identity — used by all public chrome |
| Social sharing image | — | OG / link previews | **Missing — proposal in §4** |

## 2. Palette alignment (applied)

The approved 2026 identity (master brief + uploaded official logo) specifies:

- **ALO Orange `#E8501A`** — actions, highlights
- **ALO Blue `#0066CC`** — trust, technology, interactive
- **Sunshine `#FFB347`** — selective emphasis

The repository palette previously used `#FF6A00` / `#003ABC` / `#FFB300` (earlier guideline).
All artwork **paths and geometry are untouched**; only fill/stroke values were migrated to the
approved hexes across `src/` and `public/`, with the single source of truth at
`src/lib/brand/tokens.ts` (now including `BRAND.sunshine`). Secondary gradient stops
(`#FF8A2B`, `#0077FF`, `#001C6B`, `#0047A1`, `#0053C8`, `#0D47A1`) were retained — they harmonise
with the approved primaries and are used only as gradient internals.

The uploaded official logo (hexagon + folded-A + pencil, "ALO Labs" in `#E8501A`-family orange and
deep-blue gradients) confirms the artwork family and the new palette — the SVG lockups now match
the official colors.

## 3. Wordmark text issue — PROPOSAL, NOT APPLIED

The horizontal, stacked and wordmark SVGs contain a second text line reading **"AGENTOS"** with the
strapline **"AI AGENT OPERATING SYSTEM"** (rendered as editable `<text>`, not drawn artwork). Per
the master brief the **public identity is "ALO Labs"**; the AgentOS product wordmark must not be
the public face of the company. Because the brief also states *"prepare a proposal for approval
before replacing official brand assets"*, **the SVGs have not been altered**.

Instead:
- Public pages, headers and footers use the React lockups (mark + "ALO Labs" wordmark) — already
  AgentOS-free.
- Page metadata, Open Graph images and the manifest use `alo-mark.svg` (symbol only) or plain
  text, so no public surface displays the AgentOS wordmark.

**Proposed change (awaiting approval):** in `alo-logo-horizontal.svg`, `alo-logo-stacked.svg` and
`alo-wordmark.svg`, replace the second line `AGENTOS` and the strapline with the approved company
identity, keeping every path, gradient and coordinate untouched. Suggested strapline: **"AI & SOFTWARE TECHNOLOGY COMPANY"** (or "GLOBAL AI & SOFTWARE TECHNOLOGY COMPANY"). The badge
(`alo-badge.svg`) would remain the AgentOS product badge for internal use — as it appears on the
AgentOS letterhead collateral provided by the owner.

## 4. Social sharing image — PROPOSAL, NOT APPLIED

No dedicated 1200×630 social card exists (OG currently references the SVG mark). Proposal: an
approved 1200×630 PNG card — navy ground, ALO Labs lockup, tagline "Building Intelligent Digital
Experiences" — to be produced and approved before wiring into `openGraph.images`. This is flagged
rather than generated so no unapproved artwork ships.

## 5. Naming & metadata (applied)

- All public `<title>`, meta descriptions, manifest `name` and OG titles use **"ALO Labs"**.
- Positioning line: "Global AI & Software Technology Company" (per brief §2).
- `theme-color` and manifest colors: `#0066CC` (ALO Blue).
- Internal surfaces (`/brand`, `/brand` book pages, AgentOS letterhead) keep the AgentOS product
  identity deliberately — it is the internal product brand.

## 6. Decisions needed from the owner

1. Approve (or amend) the wordmark text change in §3 — exact strapline wording.
2. Approve the social sharing card direction in §4.
3. Confirm whether the official logo artwork should incorporate the pencil element shown in the
   uploaded raster logo (current SVGs use the folded-A variant without the pencil). If yes, new
   artwork would be prepared for approval before replacing the SVGs.
