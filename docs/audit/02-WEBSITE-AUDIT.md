# alolabs.net — Public Website Audit

**URL:** https://alolabs.net
**Date:** 2026-11-15
**Method:** live fetch of the production site + full read of the local
implementation (`src/app/page.tsx`, `src/components/site/*`,
`src/app/site/**`, `src/app/sitemap.ts`, `proxy.ts`).

> **Honest scope statement:** the audit sandbox has outbound access only to
> GitHub/npm/PyPI hosts. Direct `curl` to alolabs.net returned no connection, and
> no headless browser (Playwright/Chromium) is installed, so the following could
> **not** be measured: console errors, network failures, Lighthouse
> performance, real mobile rendering, and live security headers. Those are
> marked **NOT MEASURED** below rather than guessed. Page content and copy were
> obtained from the live site through a text fetch and cross-checked against the
> local source.

---

## 1. Live content inventory (fetched)

The production homepage is a single-page marketing experience with these
sections, in order:

| # | Section | Copy headline |
|---|---|---|
| 1 | Hero | "Big ideas, meet your AI team." |
| 2 | Prompt entry | "Describe what you want to work on" + Try-an-idea chips |
| 3 | Workspace preview | "A PREVIEW — NOT YOUR DASHBOARD" / "YOUR COMMAND CENTER" |
| 4 | Platform | "All the pieces. One better place." — 4 items: Command Center, Specialist agents, Knowledge & memory, Workflows & runs |
| 5 | How it works | "From 'what if' to what's next" — 3 steps |
| 6 | For your team | Builders / Creative teams / Operations |
| 7 | FAQ | 4 questions |
| 8 | Closing CTA | "Let's make good work happen." |

Page title: `ALO Labs AgentOS — AI Agent Operating System`.

**Assessment:** the copy is well-written and, importantly, *conservative*. The
workspace block is explicitly labelled "A PREVIEW — NOT YOUR DASHBOARD", and the
FAQ says "Capabilities depend on your deployment and configuration" and "AI
responses require a configured and available model provider". This satisfies the
master prompt's rule against advertising unverified capabilities. No fabricated
statistics, customer logos or uptime claims appear.

## 2. Routes

`src/app/sitemap.ts` declares 14 public paths:

```
/                       /site/platform      /site/solutions    /site/work
/site/pricing           /site/insights      /site/about        /site/careers
/site/contact           /site/press         /site/diagrams     /design
/brand                  /invoice
```

Plus (not in sitemap but present): `/site/platform/voice-contact-center`,
`/login`, `/dashboard` (private), `/portal/*`.

`/site` 308-redirects to `/`.

**However** — the live homepage fetch shows navigation limited to in-page
anchors (`#platform`, `#how-it-works`, `#faq`) plus `/login`. The 12 `/site/*`
pages, `/design`, `/brand` and `/invoice` are **reachable but not linked from the
homepage**. This is a real discoverability gap: only `/login` is exposed.

## 3. Findings

### Working

| Item | Evidence |
|---|---|
| Homepage renders with full content | Live fetch returned all 8 sections |
| `/login` entry point exists and is linked | Homepage CTA + prompt form target `/login` |
| Copy makes no unverified feature claims | FAQ text reviewed |
| Sitemap exists and is generated | `src/app/sitemap.ts`, `/sitemap.xml` in build output |
| `/site` redirect preserved | 308 redirect in route config |
| Preview labelling is explicit | "PREVIEW — NOT YOUR DASHBOARD" |

### Gaps

| # | Gap | Severity | Recommendation |
|---|---|---|---|
| W1 | The 12 `/site/*` pages are orphaned from the homepage — no nav, footer or inline link to `/site/platform`, `/site/solutions`, `/site/pricing`, `/site/about`, `/site/contact`. | **High** — those pages cannot be found by a visitor. | Add a footer link group. Deferred: it changes public branding/navigation, which the master prompt tells us to preserve without explicit approval. |
| W2 | No link to technical documentation, API docs, or the platform's model/AI-workforce story from the homepage. | Medium | `/site/platform` already describes workforce, routing, memory, RAG, approvals, audit. Linking it (W1) closes most of this. |
| W3 | No visible contact route on the homepage other than a `mailto:info@alolabs.net` in the FAQ. | Medium | `/site/contact` exists; link it (W1). |
| W4 | No pricing entry point from the homepage. | Medium | `/site/pricing` exists; link it (W1). |
| W5 | No visible onboarding description beyond "Describe what you want to work on". | Low | Acceptable; the prompt form does funnel to `/login`. |

### NOT MEASURED (no browser / no network egress)

| Item | Reason |
|---|---|
| Console errors | No browser available |
| Network failures | No browser available |
| Lighthouse performance / Core Web Vitals | No browser available |
| Mobile rendering and responsive breakpoints | Static review only: components use Tailwind responsive classes (`sm:`, `md:`, `lg:`), but real-device layout was not observed |
| Accessibility (axe / screen reader) | Not run |
| Live HTTPS/TLS configuration and HSTS | No direct connection from sandbox |
| Live security headers | Cannot confirm from the wire. Headers are declared in `next.config.ts` (`headers()`); whether the production reverse proxy preserves them is unverified |
| Broken external links | Not crawled |

These must be re-run from an environment with browser access before being
claimed as passing.

## 4. Backend ↔ website consistency

| Claim on site | Backend reality | Verdict |
|---|---|---|
| "Specialist agents" | 2,000 agents across 100 departments provisioned and verified | Consistent (and understated) |
| "Knowledge & memory" | `MemoryShortTerm`/`MemoryLongTerm`/`AgentMemory` are Prisma-backed | Consistent |
| "Workflows & runs" | Workflow + run + queue models and execution engine exist | Consistent |
| "Human oversight", "permissions, approval workflows" | Approval engine, risk-based routing, deny-by-default tools | Consistent |
| "Requires a configured model provider" | True — routing needs an eligible provider and a policy decision | Consistent and appropriately cautious |

No website claim was found that the code does not support.

## 5. Deliberately not changed

The master prompt says: *preserve existing branding, layout and working website
functionality; do not invent products, features or live capabilities.*

Given W1–W4 are all fixable by adding links, and adding links changes public
navigation and branding, this branch **does not** modify the public site. The
finding is recorded with a concrete recommendation so the site owner can approve
the change. Nothing about the website was rebuilt.
