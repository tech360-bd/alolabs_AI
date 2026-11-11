# ALO Labs Deployment Readiness — Public Website Redesign

> Date: 2026-11-11 · Status: **BLOCKED — OWNER ACTION REQUIRED** (no deployment has occurred or been attempted).

## Verification state

| Item | Status | Evidence |
|---|---|---|
| Production build compiles | PASS | `next build` (`NODE_OPTIONS=--max-old-space-size=3072`): 343/343 static pages compiled, TypeScript check passed (this branch) |
| Full-repo type-check | PARTIAL | Scoped tsc (all changed files + import graph): 0 errors. Full-repo tsc OOMs in the 3 GB sandbox — must run in CI |
| Unit tests (targeted) | PASS | `__tests__/api/public-contact.test.ts` 12/12 green |
| Browser verification | PASS | Desktop 1440px: WebGL canvas live, hover works, LIVE SCENE badge; Mobile 390px: CSS fallback, STATIC SCENE badge, canvas count 0; console errors: none from app code |
| Secrets committed | PASS | `git diff` contains no credential material; `gitleaks` baseline present |
| Existing routes preserved | PASS | All `/site/*`, `/brand`, `/design`, `/invoice`, `/login`, `/dashboard` routes untouched; sitemap unchanged |
| **Live site availability** | **FAIL — P0 incident (FX-4)** | 2026-11-11 02:42–02:45 UTC: alolabs.net returns HTTP 403/530, Cloudflare `error code: 1033` (Argo Tunnel origin unreachable) on every route including `/robots.txt`. Pre-existing and unrelated to the redesign; **no deployment or rollback of this branch can fix it** — the `cloudflared` service on the origin host must be restarted by the owner |
| PR opened | BLOCKED | Owner PAT revoked ("Bad credentials"); needs fresh fine-grained token with repo:write |
| Production deploy | NOT PERFORMED | Requires separate explicit owner approval per standing rules |

## Deploy checklist (for the owner, when approved)

1. **First**: restart `cloudflared` on alo-server-lap to restore alolabs.net (FX-4 — independent of this PR).
2. Merge PR after CI (type-check + full test suite) is green.
3. `git pull && bun install --frozen-lockfile && bun run build`.
4. Restart the existing PM2/standalone service on port 3011 (unchanged contract).
5. Health-check `/` and `/site/platform`; verify canvas loads on desktop and falls back on mobile.
6. Rollback: previous `.next` build or `git revert <merge-sha> && rebuild`.

## Environment variables

No new environment variables are introduced by the website redesign or the security fixes. Existing contract untouched. The legacy seed scripts now **require** `SEED_ADMIN_PASSWORD` (≥12 chars) if run — they fail closed otherwise (FX-13).
