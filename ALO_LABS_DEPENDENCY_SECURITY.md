# Production dependency advisory triage — 2026-10-09

**Overall: FAIL.** `npm audit --omit=dev` initially reported **9** findings (5 high, 4 moderate). The registry identifies Next.js 16.3.8 as a compatible patch for advisories affecting 16.3.6. After upgrading `next` and `eslint-config-next` to 16.3.8 and reconciling npm/Bun locks, the audit still exits **1** with **8 findings (4 high, 4 moderate)**. The pinned Next finding is gone. Typecheck, lint, 727 tests and production build passed after that upgrade, as did an isolated standalone boot. CI and deployment quality jobs now run a fail-closed production `npm audit --audit-level=moderate`; they will block while the remaining advisories exist. This is intentional, not a green release claim.

| Package / chain | Severity | Current path | Remediation risk / decision |
|---|---|---|---|
| `next` | Previously high; **resolved in current audit** | 16.3.6 → 16.3.8 | Compatible patch verified with local checks. No production smoke or browser E2E certification. |
| `prisma`, `@prisma/config`, `deepmerge-ts`, `effect` | 4 high across Prisma/tooling chain | Prisma 6.19.2 with aligned adapter | npm's proposed 6.12.0 downgrade conflicts with the existing aligned adapter/client and requires extensive migration/runtime verification. Do not blindly force overrides. Treat as blocking until upstream fix/compatible dependency strategy and application tests. |
| `minio`, `query-string`, `stream-json`, `decode-uri-component` | 4 moderate across MinIO/transitives | MinIO 8.0.7 plus its dependency ranges | npm proposes a major-ish downgrade to MinIO 7.1.3; not a safe automatic change. Used by `src/lib/minio.ts`. Assess replacement/updated adapter or vetted upstream fix with real MinIO integration and storage tenant tests. |

The audit JSON is stored only under ignored `backups/`; no secrets were included. `bun.lock` was regenerated with Bun 1.3.4 and its frozen-lockfile dry run passed; this does not prove hosted CI has passed. A future release needs a nonzero-advisory policy decision based on actual exploitability/remediation and a passing blocking CI gate. Do not disable or soften the security gate merely to make deployment green.
