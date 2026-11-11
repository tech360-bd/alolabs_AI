# ALO Labs Project Audit

> Date: 2026-11-11 · Branch: `feat/public-website-redesign` · Base: `origin/main 90a4132` · Method: source verification only — every finding cites a file path.

## 1. Stack

- Next.js **16.4.3** (App Router, Turbopack), React **19.2.3**, TypeScript **5.9.3**, Tailwind **4**, Radix UI, Prisma **6.19.2**.
- 3D: `three` ^0.187, `@react-three/fiber` ^9.8.2 (added this branch).
- Test: Vitest ^4.1.10, Testing Library, jsdom.
- Runtime: Node ≥20 / Bun 1.3.4; port contract **3011** (Caddyfile + `ecosystem.config.js` PM2).
- Database: SQLite dev (`prisma/schema.prisma`), **MySQL/MariaDB production** (`prisma/schema.mysql.prisma`), 221 models in both (parity maintained via `scripts/generate-mysql-schema.ts`).

## 2. Scale

- **444 API route handlers** under `src/app/api/**/route.ts`.
- **221 Prisma models**; 8 hand-written MySQL migrations (`prisma/migrations/mysql/`, 2026-10-08 → 2026-11-11, newest `20261111_voice_gap_closure.sql` current with schema).
- **155 dashboard panels** registered in `DASHBOARD_PANELS` (`src/lib/dashboard/navigation.ts`), each mapped 1:1 to a nav id — no orphans, no dead links.
- **145 test files** under `__tests__/` + `src/__tests__/`.

## 3. Frontend

- Public site: `src/app/page.tsx` → `HomeExperience` (`src/components/site/home-experience.tsx`); 10 `/site/*` pages + `/platform/voice-contact-center`, `/brand`, `/design`, `/invoice`, `/login`. Single-page dashboard shell at `/dashboard` (server session verified at `src/app/dashboard/page.tsx:25`) renders 155 client panels via `?view=`.
- All 155 panels verified to load real data via `fetchApi` / `useApiGet` / `useDataTable` / `useVoiceApi` / `useCreateForm` hooks against real API routes; only `src/components/brand/*` statics are intentionally non-fetching (brand collateral).
- No `href="#"` dead CTAs in `src/` (only a sanitizer in `src/lib/email/templates.ts:43`). No TODO/FIXME/coming-soon markers outside input `placeholder=` attributes.

## 4. Backend / API

- Public surface: 1 route (`/api/public/contact`) + inbound webhooks (`/api/whatsapp/webhook`, `/api/voice/telephony/webhook`) + health/ping.
- Hardened wrappers: `secureRoute` / `secureCrud` / `v1Handler` / `withCompany` — used by **204 of 444 routes**.
- Legacy inline-verify pattern: **~104 routes** still use `verifySessionToken` inline with no role check / no tenant scope (see SECURITY_AUDIT). Migrating these is the long tail; the highest-risk 7 are fixed this branch (CRM contacts/deals/activities/pipelines/lead-score, tasks, dashboard/cost, enterprise/roadmap).

## 5. Database / migrations

- Dual schema (SQLite dev + MySQL prod) kept in sync by `scripts/generate-mysql-schema.ts`; no CI drift check exists yet (P2).
- No baseline SQLite prisma migrations — `db:migrate` = `prisma migrate dev` would create history from scratch (P2).

## 6. Auth / RBAC

- Opaque 48-byte session tokens, SHA-256-hashed at rest in `Settings`, idle timeout + TTL, lazy legacy re-keying (`src/lib/auth.ts:12-33`); JWT secret refuses to boot in prod without 32+ chars (`auth.ts:35-46`); bcrypt(12) passwords; MFA, sessions index, audit log present.
- Edge gate: `src/proxy.ts` (Next 16 proxy, no `middleware.ts`) — private pages `/dashboard` require session cookie; all non-allowlisted `/api/*` require Bearer/X-API-Key presence; authoritative verification per-route.
- Page gate: `src/app/dashboard/page.tsx:25` verifies session against DB server-side.
- RBAC: global roles (`super_admin`, `admin`, …) + company membership roles (`owner`, `admin`, `manager`, `operator`, `viewer`). Enforced via `requireAuth` / `requireCompanyAuth` / `requireCompanyRole` / `requireRole` / `secureRoute` / `secureCrud`.

## 7. Build & test

- `next build` (`NODE_OPTIONS=--max-old-space-size=3072`): **PASS** — 343/343 static pages compiled, TypeScript check passed (this branch).
- Full-repo `tsc --noEmit` OOMs in the 3 GB sandbox — CI gate authoritative.
- Vitest: contact suite 12/12 green; full suite deferred to CI.

## 8. Open issues (carried to FIX_REGISTER)

- FX-1 homepage redesign — DONE (this branch).
- FX-3 contact API tests — DONE (this branch, 12/12 green).
- FX-4 alolabs.net production outage (Cloudflare 1033) — BLOCKED owner server.
- FX-5..FX-10 CRM/tasks/cost/roadmap/seed/webhooks RBAC + tenant scoping — DONE (this branch, see FIX_REGISTER).
- Long tail: ~97 inline-verify routes still to migrate to `secureCrud`/`secureRoute` (P1 aggregate, not blocking this PR).
