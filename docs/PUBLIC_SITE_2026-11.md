# Premium 3D public website — delivery record

Branch `arena/95359bda-alolabs-ai`. Every number below was measured in this
sandbox; the method is stated so anyone can repeat it.

---

## 1. What existed before this work

The brief asked for an audit before design. Findings that changed the plan:

| Finding | Evidence | Consequence |
|---|---|---|
| A full `/site` publication already existed | 17 routes under `src/app/site/**`, ~180-line components | Extended rather than replaced — no duplicate site was built |
| Six of those routes are **auth-gated** | `INTERNAL_PAGE_PREFIXES` in `src/lib/access/surfaces.ts` includes `/site/platform`, `/site/pricing`, `/site/work`, `/site/press`, `/site/insights`, `/site/diagrams` | A visitor clicking "Platform" was redirected to `/login`. Added a **public** `/site/platform-overview`; the internal reference stays private |
| `/site/services` was a *delivery* page, not a service list | `src/components/site/pages/services.tsx` opened with "how ALO Labs delivers" | Content moved verbatim to `/site/how-we-work`; the path now lists the twelve services |
| The existing contact API was already solid | `src/app/api/public/contact/route.ts`, 237 lines: validation, honeypot, per-IP rate limit, `CrmContact` + `CrmNote` persistence, honest `delivered` flag | Reused as-is. No second lead pipeline was created |
| Existing solution copy is honest | `solutions.tsx` labels each area `Existing service` / `Project engagement` | Kept. The new service index uses the same discipline |
| **No JSON-LD anywhere in the repo** | `grep -rln "application/ld+json"` → no results | Added Organization, WebSite, Service, ItemList, BreadcrumbList |
| Two brand palettes already existed, neither matching the logo | `tokens.ts` orange `#E8501A`; `public.ts` orange `#FF6A00` | New public-only tokens in `agentos-3d.ts`; app and print palettes untouched |
| Sitemap predates the new surfaces | `src/app/sitemap.ts` had 10 entries | Now 23, generated from the same data the pages render |

### Metrics that could not be verified

`src/components/site/pages/platform.tsx` advertises **"1020 AI agents, 100+
departments"**. That figure exists only as copy — it is not derived from the
database, and the agent-skill catalogue records 838 imported *skills*, not
agents. It is **not repeated anywhere in the new public pages**. Either the
number gets a queryable source or it should be removed from the internal page.

---

## 2. Architecture of the public surface

```
/                              AgentosHome        dark, 3D orb, 12 services, platform, evidence
/site/services                 ServicesIndexPage  the 12 lines, grouped, each with a delivery state
/site/services/[slug]          ServiceDetailPage  12 static pages, problem → deliverables → stack
/site/platform-overview        PlatformOverview   public statement of AgentOS + known limitations
/site/contact                  ContactDarkPage    real endpoint, honest success/failure states
/site/how-we-work              unchanged + engagement content moved from the old services page
```

The authenticated app (`/dashboard`, `/portal`) and `/site/platform` are
unaffected and remain behind the existing guards.

### Single source of truth

`src/lib/brand/service-lines.ts` drives: the homepage, the services index, all
twelve detail pages, `generateStaticParams`, the sitemap, the Service JSON-LD
and the contact form's topic list. Copy cannot drift between them.

### Delivery states (the honesty mechanism)

Every service carries a state and a visible reason:

| State | Count | Meaning |
|---|---|---|
| `delivered` | 3 | Running today — our own portal, this site, our CI/maintenance practice |
| `available` | 7 | Sold and staffed now, scoped per engagement |
| `project` | 2 | Scoped project only — AI image/video, and voice where telephony needs a configured provider |

No service is marked `delivered` on the strength of a route or a placeholder
existing. A unit test enforces that every state ships a note explaining itself.

---

## 3. Defects found by rendering, not by building

All four of these passed `tsc`, ESLint **and** the production build. Only the
browser found them.

1. **`/site/services` rendered completely unstyled.** `src/app/site/layout.tsx`
   never imported `agentos-3d.css`, so every `.ag-*` class had no rules. The page
   showed raw text in a single column with two stacked navigation bars.
2. **Two headers.** The light `SiteHeader` from `/site` chrome rendered *above*
   the dark header. Fixed with `SELF_CHROMED_PAGES` + `isSelfChromePage`: those
   pages keep the stylesheet and metadata but drop the shared chrome.
3. **`--ag-shell` was undefined on interior pages.** It had only ever been
   declared on the homepage root, so `width: var(--ag-shell)` resolved to
   nothing and content sat flush against the left edge. Defined on `.ag-page`.
4. **The orb's CSS fallback caused horizontal overflow at 1024px.** The fallback
   was visible *underneath* the working canvas and its orbit rings are drawn on a
   `rotateX(68deg)` plane, so their corners extended past the viewport. The
   fallback is now `display:none` unless `[data-webgl='failed']`.

Additionally, three mobile-clipping bugs came from inline `grid-template-columns`
overriding the responsive rules. Those overrides are now CSS classes
(`.ag-svc-grid-3`, `.ag-chips-3`), which media queries can reach.

---

## 4. Verification evidence

### Build and static analysis

| Gate | Result |
|---|---|
| `next build --experimental-build-mode compile` | **Compiled successfully**, all new routes present |
| `next build --experimental-build-mode generate` | **Succeeds**, 12 service pages prerendered |
| `npx eslint` on every touched file | **0 problems** |
| `node scripts/typecheck/run.mjs` | **0 errors** |

### Tests

```
Test Files  204 passed | 1 skipped (205)
     Tests  2239 passed | 15 skipped (2254)
```

Up from 2192 — **47 new tests** across `structured-data.test.ts`,
`self-chrome-pages.test.ts` and the extended sitemap suite.

### Browser (headless Chromium 138, SwiftShader WebGL2)

| Route | HTTP | h1 | Console errors | Overflow |
|---|---|---|---|---|
| `/` | 200 | 1 | 0 | 0 |
| `/site/services` | 200 | 1 | 0 | 0 |
| `/site/services/ai-agent-development` | 200 | 1 | 0 | 0 |
| `/site/platform-overview` | 200 | 1 | 0 | 0 |
| `/site/contact` | 200 | 1 | 0 | 0 |

**Responsive matrix** — 4 pages × 5 widths (390 / 768 / 1024 / 1440 / 1920) =
20 combinations, **zero horizontal overflow** in every one, with the mobile menu
correctly switching at 980px.

**Link integrity** — 25 discovered internal links crawled: **0 broken**. `/portal`
correctly redirects to `/login`.

### Responsive / accessibility

- Skip link present on every page; `main` landmark; one `h1` per page.
- **Every text colour passes WCAG AA** against the real page ground: body
  11.22:1, muted 7.61:1, eyebrow 10.20:1, smallest caption 4.91:1. (An earlier
  audit reported false failures because it walked into a transparent parent;
  the corrected method is in this record.)
- Images: 0 missing `alt`, 0 broken.
- Mobile menu: `aria-expanded` toggles, Escape closes, navigation works.

### Resilience

| Scenario | Result |
|---|---|
| `prefers-reduced-motion: reduce` | 0 of 19 reveal elements hidden, logo animation off, orb renders one frame |
| WebGL disabled entirely | `data-webgl="failed"`, CSS fallback fills 556×556, canvas `display:none`, **0 console errors** |
| Orb context lost | Recovers on `webglcontextrestored`; no `WEBGL_lose_context` on unmount (StrictMode-safe) |

### Form — end to end against a real database

| Request | Result |
|---|---|
| Invalid email | `400` "Please provide a valid email address." |
| Message < 10 chars | `400` "Please include a short message (at least 10 characters)." |
| Honeypot filled | `200` fake success, **nothing recorded** |
| 6 rapid requests | `429` from request 1 onward (limit already spent) |
| Valid, via browser | `200`; row persisted: `nusrat.e2e@example.com`, topic `Multi-Agent AI Systems`, consent `yes` |
| Notification email unconfigured | UI shows the `delivered:false` message verbatim, **not** a fake success |

### Performance (production build, 412px viewport, slow 4G, 4× CPU throttle)

| Route | LCP | CLS | TTFB | DCL |
|---|---|---|---|---|
| `/` | 2164 ms | **0.000** | 201 ms | 1573 ms |
| `/site/services` | 908 ms | **0.000** | 105 ms | 399 ms |
| `/site/contact` | 916 ms | **0.000** | 243 ms | 683 ms |

Transferred over the wire, production build:

| Route | HTML | JS | CSS | Images | Total |
|---|---|---|---|---|---|
| `/` | 64.6 KB | 598.7 KB | 259.6 KB | 2.1 KB | **934.9 KB** |
| `/site/services` | 52.7 KB | 719.5 KB | 259.6 KB | 2.1 KB | **1043.5 KB** |

Notes, because a bare number is misleading:

- These are **uncompressed** byte counts captured from response bodies. A
  normal server gzips or brotli-encodes JS and CSS; expect roughly 3× less.
- 260 KB of the CSS is the application-wide Tailwind build shared with the
  authenticated app, not CSS these pages introduce. Authored public-site CSS
  totals 62 KB across four files, and Next splits it per route.
- INP was not measured — this environment has no interaction harness.

---

## 5. Remaining limitations

1. **No screenshots of the product.** The application is behind authentication
   and a staged screenshot of a real product would be a fabricated claim. The
   platform page describes the system from outside instead.
2. **No testimonials, logos or case studies.** No client has granted permission
   to publish one. `projects.tsx` already publishes only with consent.
3. **"1020 AI agents" is unverified** (see §1) and is not used publicly.
4. **Local inference is `partial`, not live** — routing rules exist, no runtime
   is provisioned in this deployment.
5. **Telephony needs a configured PSTN/SIP provider.** The conversation layer is
   tested; simulated calls are never called real telephony.
6. **`prisma db push` could not run here** (blocked `binaries.prisma.sh`), so the
   form was verified against SQLite tables created from the schema. The API path
   is proven; the migration itself is not exercised in this record.
7. **INP unmeasured**, and no visual-regression snapshot suite was added — the
   screenshots in this PR are manual captures.
8. `/site/how-we-work` now renders two sections (process + engagement) because
   the engagement content had to move rather than be deleted. It reads as one
   page but is worth a future split.
