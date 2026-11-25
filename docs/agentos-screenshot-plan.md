# AgentOS screenshot acquisition plan

**Status:** PLAN ONLY. No authenticated captures have been taken, and none will be
without authorised access. **No fabricated or simulated screenshots have been or will
be published** — the case studies currently use structural schematics and say so
explicitly on the page.

## Why this matters

The brief asks for real UI screenshots in the AgentOS case study and the platform
overview. Those two pages are currently the weakest part of the case for "we build real
AI technology", because a visitor is asked to believe a described console instead of
seeing one. Real captures would materially raise conversion credibility.

They cannot be substituted with mock-ups. A rendered approximation of a dashboard is
indistinguishable from a lie once it is labelled "screenshot", and this site's whole
positioning is that its claims are checkable.

## Screens to capture

| # | Screen | What it demonstrates | Used on |
|---|---|---|---|
| 1 | AgentOS dashboard | The product exists; capability states at a glance | `/site/projects/agentos`, `/site/platform-overview` |
| 2 | Unified AI Chat | One conversational surface across providers | `/site/projects/agentos` |
| 3 | Agent departments | Specialised workers with scoped permissions | `/site/platform-overview` |
| 4 | Project workspace | Real delivery artefacts, not a demo tenant | `/site/projects/client-portal` |
| 5 | Agent execution history | Auditable runs: what ran, when, what it did | `/site/projects/agentos` |
| 6 | Provider configuration | Failover chain and routing rules | `/site/platform-overview` |
| 7 | Audit & approval interface | Human approval gate before consequential actions | `/site/projects/agentos`, trust section |

Minimum viable set if access is limited: **1, 2, 5, 7**. Those four demonstrate the
product, the interaction model, auditability and governance — the four claims the site
makes most heavily.

## Access requirements

- A **read-only or demo tenant** on the running AgentOS deployment.
- A dedicated account, not a personal admin login.
- Written confirmation from the owner that the tenant may be photographed for public
  marketing.

## Capture protocol (privacy and security)

Before each capture, and checked again before publication:

**Never in frame:**
- API keys, tokens, bearer headers, `.env` values, provider credentials
- Session cookies, CSRF tokens, auth headers in a network panel
- Customer personal data: names, emails, phone numbers, addresses, invoice amounts
- Any other tenant's data
- Internal hostnames, private IPs, tunnel URLs, database connection strings

**Procedure:**
1. Use a demo tenant seeded with **synthetic** data only. Never production.
2. Set the viewport to a fixed width (1440×900) so captures are consistent.
3. Crop to the application viewport; exclude browser chrome and the URL bar.
4. Review every capture at 200% zoom for stray identifiers before it leaves the machine.
5. Redact any unavoidable sensitive value with a solid block, not a blur (blur is
   partially reversible).
6. Store originals outside the repository; commit only the reviewed, redacted WebP.
7. Re-review on every redesign — a screenshot can age into a false claim.

## Where the files go

```
public/proof/agentos/
  dashboard.webp
  unified-chat.webp
  departments.webp
  execution-history.webp
  provider-config.webp
  audit-approval.webp
```

Target: ≤ 1600px wide, WebP quality ~82, each under ~150 KB served.

## Implementation once captures exist

The case-study and platform components already accept structured *surfaces* data
(`ShowcaseProject.surfaces` in `src/lib/brand/projects.ts`). A capture becomes:

```ts
surfaces: [
  {
    label: 'AgentOS dashboard',
    detail: 'Live capability states across chat, orchestration, failover and inference.',
    image: '/proof/agentos/dashboard.webp',
    alt: 'AgentOS dashboard showing capability states and recent agent runs',
  },
]
```

`SurfaceSchematic` already renders a placeholder when `image` is absent, so the page
degrades to today's behaviour for any screen not yet captured — no gap, no broken image.

## Alternative if access is never granted

Keep the schematics and the honest note ("structural schematic, not a screenshot"), and
instead add a **guided walkthrough** — a short screen-recorded video of the same demo
tenant, embedded with a transcript. Video raises the same privacy bar, so the protocol
above applies unchanged.

**Do not** ship stock imagery, generated UI mock-ups, or someone else's product
screenshots in place of these.
