# ALO Labs Pull Request Register

> Date: 2026-11-11 · Branch: `feat/public-website-redesign` · Target: `main` · Base: `origin/main 90a4132`.

## PR title

`feat(site+security): premium 3D homepage redesign + close P0/P1 RBAC & tenant-isolation gaps`

## Summary

Phase 1 of the ALO Labs software-factory prompt, plus a security pass that closes the P0 cross-tenant CRM exposure and four P1 RBAC gaps found during the read-only audit.

## What's in this PR

### Website redesign (P0)
- NEW `src/components/site/hero-3d.tsx` — 'AgentOS constellation' WebGL scene (React Three Fiber 9.8 / three 0.187): emissive brand-blue core, 12 floating satellite nodes with hover-highlight + click-to-section, glowing connection lines, brand-tinted starfield, pointer parallax.
- Performance/a11y: lazy-loads via IntersectionObserver, pauses when tab hidden or off-screen, dpr capped [1,1.75], antialias off on mobile, `prefers-reduced-motion` static frame, no-WebGL/<640px CSS fallback with official alo-mark — nav never depends on WebGL.
- NEW `src/app/public-design.css` — public design tokens on brand colors (#003ABC blue, #FF6A00 orange, deep-navy surfaces, gradient accents).
- `home-experience.tsx`: restyled sections (alternating premium surfaces, glass cards, gradient headings); truthful 'Selected work' (AgentOS — Live, Voice Contact Center — In development, Engineering Intelligence — Internal) and 'Technology' sections (stack derived from actual `package.json`); scene badge reports LIVE vs STATIC honestly.
- deps: +three @react-three/fiber (+@types/three dev) — `bun.lock` updated.

### Security fixes (P0/P1)
- **FX-5..FX-9 (P0)**: `/api/crm/{contacts,deals,activities,pipelines,lead-score}` rewritten with `secureCrud`/`secureRoute` — tenant-scoped reads, role-checked writes, parent-tenant verification on creates/updates/deletes. Closes the cross-tenant read/write hole.
- **FX-10 (P1)**: `/api/tasks` now scopes to caller's `companyId + userId` (super_admin sees all).
- **FX-11 (P1)**: `/api/dashboard/cost` non-admins get tenant-filtered view (no `costByCompany`); `PaymentGuardLog` (global table) admin-only.
- **FX-12 (P1)**: `/api/enterprise/roadmap` now calls `requireAuth()` (was bearer-presence-only).
- **FX-13 (P1)**: `scripts/seed.ts` + `scripts/seed-v2.ts` no longer hardcode `Admin@123` — require `SEED_ADMIN_PASSWORD` env (≥12 chars), fail closed.
- **FX-14 (P2)**: removed `/api/webhooks/` (management CRUD) from public edge allowlist; inbound receivers (`/api/whatsapp/webhook`, `/api/voice/telephony/webhook`) added explicitly.

### Tests
- NEW `__tests__/api/public-contact.test.ts` — 12 unit tests, all green: validation, honeypot, rate limit, CRM capture, SMTP semantics, DB-failure 502.

### Docs
- 9 audit/architecture/deployment docs created under `docs/audit/`, `docs/architecture/`, `docs/deployment/`, `docs/releases/`.

## Verification

- `next build`: PASS (343/343 pages, TypeScript check passed).
- Scoped `tsc --noEmit`: 0 errors.
- `vitest run __tests__/api/public-contact.test.ts`: 12/12 PASS.
- Browser: desktop LIVE scene + hover, mobile static fallback, no console errors from app code.
- Full-repo `tsc` OOMs in 3 GB sandbox — CI gate authoritative.

## What is NOT in this PR

- No production deployment (requires explicit owner approval).
- No database migrations (no schema changes — `companyId` columns already existed).
- No new environment variables.
- ~97 legacy inline-verify routes remain on the todo list (FX-15) — long-tail migration, not blocking.

## Known blockers (owner action)

- **FX-4 (P0)**: alolabs.net is DOWN (Cloudflare error 1033 — origin tunnel offline). Restart `cloudflared` on alo-server-lap. Independent of this PR.
- **MF-8**: push/PR creation needs a fresh GitHub fine-grained PAT (old token revoked).
