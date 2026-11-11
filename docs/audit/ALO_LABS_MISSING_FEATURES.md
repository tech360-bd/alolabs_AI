# ALO Labs Missing Features Register

> Derived from Phase 0 discovery (2026-11-11). Priorities: P0 critical → P3 minor. Statuses only change when work is verifiable.

| ID | Feature | Evidence / source | Priority | Status |
|---|---|---|---|---|
| MF-1 | Interactive 3D hero experience (WebGL, lazy-loaded, mobile + reduced-motion fallbacks) | `ALO_LABS_PUBLIC_WEBSITE_AUDIT.md` G1/G7 | P0 | **DONE** — `hero-3d.tsx` (R3F constellation, IntersectionObserver lazy + visibility pause, dpr ≤1.75, reduced-motion & no-WebGL/mobile static fallback with official alo-mark) |
| MF-2 | Centralized design tokens (brand-derived color system, dark/light surfaces, motion tokens) | G2 | P0 | **DONE** — `src/app/public-design.css` on official brand colors #003ABC / #FF6A00 |
| MF-3 | Selected-projects / product portfolio section with verified content only | G3 | P1 | **DONE** — "Selected work" section: AgentOS (Live), Voice Contact Center (In development), Engineering Intelligence (Internal) — all status labels reflect audited reality |
| MF-4 | Technology-stack section derived from actual dependencies | G4 | P1 | **DONE** — "Technology" section derived from actual `package.json`; scene badge reports LIVE vs STATIC honestly |
| MF-5 | Per-service depth pages or expanded service sections (AI Engineering, AgentOS, custom software, integrations, DevOps) | G6 | P1 | PLANNED (existing `/site/solutions` has 6 service lines) |
| MF-6 | Scroll-triggered motion system with `prefers-reduced-motion` support | G5 | P1 | PARTIAL — hero motion honors `prefers-reduced-motion`; page-level scroll-triggered transitions not yet built |
| MF-7 | Browser-verified QA pass over all 14 sitemap routes (console, responsive, broken links) | G8 | P2 | PENDING QA (deferred to CI; sandbox cannot reach prod — site is down, FX-4) |
| MF-8 | GitHub push/PR capability — fresh fine-grained PAT (old token revoked by GitHub) | Ecosystem inventory, blockers | P0 (process) | **BLOCKED — owner action** |
| MF-9 | Full project audit of `ALO_WEB_CRM_TECH` (frontend/backend/security) | Ecosystem inventory | P1 | PENDING |
| MF-10 | Contact form server-side verification of spam protection + working destination | G6/contact requirement | P1 | **VERIFIED (code + tests)** — `POST /api/public/contact` validates, honeypot-filters, rate-limits 5/10 min per IP, records `CrmContact`+`CrmNote` lead, notifies house mailbox best-effort; 12 unit tests green (FX-3). Live SMTP delivery still depends on server-side mail-account configuration — production verification pending (MF-7/FX-4) |
| MF-11 | CRM cross-tenant exposure fix (contacts/deals/activities/pipelines/lead-score) | SECURITY_AUDIT SEC-1 | P0 | **DONE** — all 5 routes rewritten with `secureCrud`/`secureRoute`: tenant-scoped reads, role-checked writes, parent-tenant verification (FX-5..FX-9) |
| MF-12 | `/api/tasks` tenant + user scoping | SECURITY_AUDIT SEC-2 | P1 | **DONE** (FX-10) |
| MF-13 | `/api/dashboard/cost` tenant + admin-role scoping | SECURITY_AUDIT SEC-3 | P1 | **DONE** (FX-11) |
| MF-14 | `/api/enterprise/roadmap` session verification | SECURITY_AUDIT SEC-4 | P1 | **DONE** (FX-12) |
| MF-15 | Remove hardcoded `Admin@123` from legacy seed scripts | SECURITY_AUDIT SEC-5 | P1 | **DONE** (FX-13) |
| MF-16 | Remove `/api/webhooks/` from public edge allowlist | SECURITY_AUDIT SEC-6 | P2 | **DONE** (FX-14) |
| MF-17 | Migrate ~97 remaining inline-verify routes to `secureCrud`/`secureRoute` | SECURITY_AUDIT SEC-7 | P1 (aggregate) | Open — long-tail; not blocking this PR |
